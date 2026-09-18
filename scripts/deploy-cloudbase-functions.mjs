#!/usr/bin/env node

/* oxlint-disable no-console, no-magic-numbers */
import fs from 'node:fs'
import path from 'node:path'
import {
  DEPLOYMENT_IGNORED_DIRECTORY_NAMES,
  DEPLOYMENT_IGNORED_FILE_NAMES,
  installHttpFunctionDependencies,
  stageFunctionPackage,
  verifyDiagnosisSplitArtifacts
} from './cloudbase/function-package-staging.mjs'
import {
  createTcbFunctionClient,
  IMMUTABLE_DEFAULT_RELEASE_FUNCTIONS,
  releaseImmutableDefaultVersion
} from './cloudbase/tcb-function-release.mjs'
import { auditFunctionPackage } from './qa/function-package-audit.mjs'
import { QA_ONLINE_TARGET } from './qa/qa-backend-target.mjs'

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)
const cloudbasercPath = path.join(projectRoot, 'cloudbaserc.json')
// 旧 CLI 只负责把代码上传到 $LATEST；关键函数必须继续走不可变版本发布门禁。
const tcbDeployPackage = '@cloudbase/cli@3.2.2'
const tcbApiPackage = '@cloudbase/cli@3.8.1'

function parseArgs(argv = []) {
  const parsed = {
    dryRun: false,
    envId: '',
    functions: [],
    manifestFile: '',
    region: '',
    runtimeBaseUrl: ''
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }
    if (arg.startsWith('--env-id=')) {
      parsed.envId = arg.slice('--env-id='.length).trim()
      continue
    }
    if (arg.startsWith('--region=')) {
      parsed.region = arg.slice('--region='.length).trim()
      continue
    }
    if (arg.startsWith('--function=')) {
      parsed.functions.push(arg.slice('--function='.length).trim())
      continue
    }
    if (arg.startsWith('--functions=')) {
      parsed.functions.push(...splitFunctionList(arg.slice('--functions='.length)))
      continue
    }
    if (arg.startsWith('--manifest-file=')) {
      parsed.manifestFile = arg.slice('--manifest-file='.length).trim()
      continue
    }
    if (arg.startsWith('--runtime-base-url=')) {
      parsed.runtimeBaseUrl = arg.slice('--runtime-base-url='.length).trim()
    }
  }

  return parsed
}

function splitFunctionList(value = '') {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function readCloudbaseRc() {
  if (!fs.existsSync(cloudbasercPath)) {
    return { envId: '', functions: [] }
  }
  return JSON.parse(fs.readFileSync(cloudbasercPath, 'utf8'))
}

function isUnresolvedTemplate(value = '') {
  return /^\{\{.+\}\}$/u.test(String(value || '').trim())
}

function resolveEnvId(args, config) {
  const resolved = String(
    args.envId ||
      process.env.CLOUDBASE_ENV_ID ||
      process.env.TCB_ENV ||
      process.env.TCB_ENV_ID ||
      config.envId ||
      ''
  ).trim()
  return isUnresolvedTemplate(resolved) ? '' : resolved
}

function resolveRegion(args, config, envId) {
  return String(
    args.region ||
      process.env.CLOUDBASE_REGION ||
      process.env.TENCENTCLOUD_REGION ||
      config.region ||
      (envId === QA_ONLINE_TARGET.environmentId ? QA_ONLINE_TARGET.region : '')
  ).trim()
}

function normalizeRuntimeBaseUrl(value = '') {
  const normalized = String(value || '')
    .trim()
    .replace(/\/+$/u, '')
  if (!normalized) {
    return ''
  }
  const parsed = new URL(normalized)
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('云函数运行验证地址必须是不含凭据、查询参数和片段的 HTTPS 地址。')
  }
  return normalized
}

function resolveRuntimeBaseUrl(args, envId) {
  const configured =
    args.runtimeBaseUrl ||
    process.env.CLOUDBASE_HTTP_FUNCTION_BASE_URL ||
    process.env.QA_ONLINE_HTTP_FUNCTION_BASE_URL ||
    process.env.VITE_PUBLIC_HTTP_FUNCTION_BASE_URL ||
    ''
  if (configured) {
    return normalizeRuntimeBaseUrl(configured)
  }
  if (envId === QA_ONLINE_TARGET.environmentId) {
    return QA_ONLINE_TARGET.httpFunctionBaseUrl
  }
  return ''
}

function resolveCredentials() {
  const secretId = String(
    process.env.TENCENT_SECRET_ID ||
      process.env.TENCENTCLOUD_SECRETID ||
      process.env.CLOUDBASE_SECRET_ID ||
      ''
  ).trim()
  const secretKey = String(
    process.env.TENCENT_SECRET_KEY ||
      process.env.TENCENTCLOUD_SECRETKEY ||
      process.env.CLOUDBASE_SECRET_KEY ||
      ''
  ).trim()

  return { secretId, secretKey }
}

function resolveFunctionNames(args, config) {
  const explicit = [...args.functions, ...splitFunctionList(process.env.CLOUDBASE_DEPLOY_FUNCTIONS)]
  if (explicit.length) {
    return Array.from(new Set(explicit))
  }

  const configured = Array.isArray(config.functions) ? config.functions : []
  return configured
    .map(item => String(item?.name || '').trim())
    .filter(Boolean)
    .filter((name, index, all) => all.indexOf(name) === index)
}

function assertDeploymentEnvironment(envId, config) {
  const configuredEnvId = String(config.envId || '').trim()
  if (!configuredEnvId || isUnresolvedTemplate(configuredEnvId)) {
    return
  }
  const allowNoncanonical = process.env.CLOUDBASE_ALLOW_NONCANONICAL_DEPLOYMENT === '1'
  if (configuredEnvId && envId !== configuredEnvId && !allowNoncanonical) {
    throw new Error(
      '部署环境 ' +
        envId +
        ' 与项目 canonical 环境 ' +
        configuredEnvId +
        ' 不一致；如确需切换，必须显式设置 CLOUDBASE_ALLOW_NONCANONICAL_DEPLOYMENT=1。'
    )
  }
}

function functionDirFor(name, config) {
  const configured = Array.isArray(config.functions)
    ? config.functions.find(item => String(item?.name || '').trim() === name)
    : null
  const configuredDir = configured?.dir ? String(configured.dir) : `./cloudfunctions/${name}`
  return path.resolve(projectRoot, configuredDir)
}

function buildDeployTargets(names, config, explicitSelection) {
  const targets = []
  const skipped = []

  for (const name of names) {
    const dir = functionDirFor(name, config)
    const packageJson = path.join(dir, 'package.json')
    if (!fs.existsSync(dir) || !fs.existsSync(packageJson)) {
      if (explicitSelection) {
        throw new Error(
          `云函数 ${name} 缺少目录或 package.json：${path.relative(projectRoot, dir)}`
        )
      }
      skipped.push({ name, dir })
      continue
    }
    targets.push({ name, dir })
  }

  return { targets, skipped }
}

function tcbEnv(baseEnv, envId, credentials) {
  const environment = {
    ...baseEnv,
    CLOUDBASE_ENV_ID: envId,
    TCB_ENV: envId
  }
  if (credentials.secretId && credentials.secretKey) {
    environment.CLOUDBASE_SECRET_ID = credentials.secretId
    environment.CLOUDBASE_SECRET_KEY = credentials.secretKey
    environment.TENCENTCLOUD_SECRETID = credentials.secretId
    environment.TENCENTCLOUD_SECRETKEY = credentials.secretKey
  }
  return environment
}

function deploymentManifestPath(args, envId) {
  if (args.manifestFile) {
    return path.resolve(projectRoot, args.manifestFile)
  }
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  return path.join(projectRoot, '.tmp', 'deployments', envId, stamp + '-' + process.pid + '.json')
}

function sourceIdentity(audit) {
  return {
    function_name: audit.function_name,
    directory: audit.directory,
    entrypoint: audit.entrypoint,
    source_fingerprint: audit.source_fingerprint,
    file_count: audit.file_count,
    source_bytes: audit.source_bytes,
    package: audit.package,
    top_level_imports: audit.top_level_imports,
    startup_dependency_violations: audit.startup_dependency_violations
  }
}

function writeDeploymentManifest(filePath, manifest) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = readCloudbaseRc()
  const envId = resolveEnvId(args, config)
  if (!envId) {
    throw new Error('缺少 CloudBase 环境 ID，请配置 CLOUDBASE_ENV_ID/TCB_ENV 或 --env-id。')
  }
  assertDeploymentEnvironment(envId, config)
  const region = resolveRegion(args, config, envId)

  const names = resolveFunctionNames(args, config)
  const explicitSelection = Boolean(
    args.functions.length || splitFunctionList(process.env.CLOUDBASE_DEPLOY_FUNCTIONS).length
  )
  const targetEnv = String(process.env.TARGET_ENV || process.env.VITE_APP_ENV || '')
    .trim()
    .toLowerCase()
  if (!explicitSelection && ['prod', 'production'].includes(targetEnv)) {
    throw new Error(
      '生产环境部署必须显式配置 CLOUDBASE_DEPLOY_FUNCTIONS 或 --functions，禁止默认全量发布。'
    )
  }
  const { targets, skipped } = buildDeployTargets(names, config, explicitSelection)
  if (!targets.length) {
    throw new Error('没有可部署的云函数，请检查 cloudbaserc.json 或 CLOUDBASE_DEPLOY_FUNCTIONS。')
  }
  const immutableReleaseTargets = targets.filter(target =>
    IMMUTABLE_DEFAULT_RELEASE_FUNCTIONS.has(target.name)
  )
  const runtimeBaseUrl = resolveRuntimeBaseUrl(args, envId)
  if (immutableReleaseTargets.length && (!region || !runtimeBaseUrl)) {
    throw new Error('关键云函数发布必须配置 region 和 HTTPS 运行验证地址，禁止只上传 $LATEST。')
  }

  const audits = targets.map(target => auditFunctionPackage(target.name, target.dir))
  const auditViolations = audits.flatMap(audit =>
    audit.startup_dependency_violations.map(violation => ({
      function_name: audit.function_name,
      ...violation
    }))
  )
  if (auditViolations.length) {
    throw new Error('部署前函数包审计失败：' + JSON.stringify(auditViolations))
  }
  await verifyDiagnosisSplitArtifacts(targets)

  console.log(`CloudBase env: ${envId}`)
  console.log(`CloudBase functions: ${targets.map(target => target.name).join(', ')}`)
  for (const item of skipped) {
    console.warn(
      `Skipping missing configured function ${item.name}: ${path.relative(projectRoot, item.dir)}`
    )
  }

  const manifestFile = deploymentManifestPath(args, envId)
  const deploymentId = path.basename(manifestFile, '.json')
  const auditByFunction = new Map(audits.map(audit => [audit.function_name, audit]))
  const stagedTargets = targets.map(target => ({
    ...target,
    stagedDir: stageFunctionPackage(target.dir, target.name, deploymentId),
    sourceFingerprint: auditByFunction.get(target.name)?.source_fingerprint || ''
  }))
  for (const target of stagedTargets) {
    target.dependency_install = await installHttpFunctionDependencies(target.stagedDir, target.name)
  }
  const manifest = {
    schema_version: 2,
    status: args.dryRun ? 'dry_run' : 'planned',
    deployment_id: deploymentId,
    environment_id: envId,
    region,
    source: 'scripts/deploy-cloudbase-functions.mjs',
    target_selection: targets.map(target => target.name),
    immutable_default_release_targets: immutableReleaseTargets.map(target => target.name),
    source_identity: audits.map(sourceIdentity),
    upload_staging: stagedTargets.map(target => ({
      function_name: target.name,
      excluded_directories: Array.from(DEPLOYMENT_IGNORED_DIRECTORY_NAMES).sort(),
      excluded_files: Array.from(DEPLOYMENT_IGNORED_FILE_NAMES).sort(),
      staged_directory: target.stagedDir,
      dependency_install: target.dependency_install
    })),
    remote_readback: [],
    created_at: new Date().toISOString(),
    completed_at: null
  }
  writeDeploymentManifest(manifestFile, manifest)
  console.log('Deployment manifest: ' + path.relative(projectRoot, manifestFile))

  if (args.dryRun) {
    console.log('Dry run only: no CloudBase deployment command was executed.')
    return
  }

  const credentials = resolveCredentials()
  const env = tcbEnv(process.env, envId, credentials)
  const client = createTcbFunctionClient({
    cwd: projectRoot,
    env,
    envId,
    region,
    deployPackage: tcbDeployPackage,
    apiPackage: tcbApiPackage
  })
  try {
    if (credentials.secretId && credentials.secretKey) {
      await client.login(credentials)
    } else {
      console.log('Using existing CloudBase CLI login; no shell CI credential was supplied.')
    }
    for (const target of stagedTargets) {
      const remote = await client.deployTarget(target)
      const release = IMMUTABLE_DEFAULT_RELEASE_FUNCTIONS.has(target.name)
        ? await releaseImmutableDefaultVersion({
            client,
            functionName: target.name,
            namespace: envId,
            deploymentId,
            sourceFingerprint: target.sourceFingerprint,
            runtimeBaseUrl
          })
        : null
      manifest.remote_readback.push({
        ...remote,
        codeSha256: release?.defaultCodeSha256 || remote.codeSha256 || '',
        immutableDefaultRelease: release
      })
      manifest.status = 'in_progress'
      writeDeploymentManifest(manifestFile, manifest)
    }
    manifest.status = 'completed'
    manifest.completed_at = new Date().toISOString()
    writeDeploymentManifest(manifestFile, manifest)
    console.log('Deployment manifest completed: ' + path.relative(projectRoot, manifestFile))
  } catch (error) {
    manifest.status = 'failed'
    manifest.completed_at = new Date().toISOString()
    manifest.failure = { message: String(error?.message || error).slice(0, 1000) }
    writeDeploymentManifest(manifestFile, manifest)
    throw error
  }
}

main().catch(error => {
  console.error(String(error?.stack || error))
  process.exit(1)
})
