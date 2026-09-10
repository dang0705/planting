#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { auditFunctionPackage } from './qa/function-package-audit.mjs'

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)
const cloudbasercPath = path.join(projectRoot, 'cloudbaserc.json')
const tcbPackage = '@cloudbase/cli@3.2.2'

function parseArgs(argv = []) {
  const parsed = {
    dryRun: false,
    envId: '',
    functions: [],
    manifestFile: ''
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

function resolveEnvId(args, config) {
  return String(
    args.envId ||
      process.env.CLOUDBASE_ENV_ID ||
      process.env.TCB_ENV ||
      process.env.TCB_ENV_ID ||
      config.envId ||
      ''
  ).trim()
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

function redactTcbArgs(args = []) {
  const redacted = []
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index]
    redacted.push(item)
    if (item === '--apiKeyId' || item === '--apiKey' || item === '--token') {
      index += 1
      redacted.push('***')
    }
  }
  return redacted
}

const DEPLOYMENT_IGNORED_DIRECTORY_NAMES = new Set(['.git', '.tmp', 'dist', 'node_modules', 'logs'])
const DEPLOYMENT_IGNORED_FILE_NAMES = new Set(['.DS_Store'])
const READER_SQL_RUNTIME_FUNCTIONS = new Set(['auth-user-http', 'plant-user-http'])
const READER_SQL_RUNTIME_SOURCE = path.join(projectRoot, 'cloudfunctions', 'read-sql-runtime.js')
const FUNCTION_BUNDLED_RUNTIME_FILES = new Map([
  [
    'auth-user-http',
    [
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'http-identity-ticket.js'),
        target: 'http-identity-ticket.js'
      }
    ]
  ],
  [
    'plant-user-http',
    [
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'http-identity-ticket.js'),
        target: 'http-identity-ticket.js'
      }
    ]
  ],
  [
    'plant-catalog-http',
    [
      {
        source: path.join(projectRoot, 'cloudfunctions', 'layer', 'utils', 'catalog-image-url.js'),
        target: 'catalog-image-url.js'
      }
    ]
  ]
])

function shouldCopyForDeployment(sourceDirectory, sourcePath) {
  const relativePath = path.relative(sourceDirectory, sourcePath)
  if (!relativePath) {
    return true
  }
  const parts = relativePath.split(path.sep)
  if (parts.some(part => DEPLOYMENT_IGNORED_DIRECTORY_NAMES.has(part))) {
    return false
  }
  return !DEPLOYMENT_IGNORED_FILE_NAMES.has(path.basename(sourcePath))
}

function stageFunctionPackage(sourceDirectory, functionName, deploymentId) {
  const stagingRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `planting-cloudbase-${deploymentId}-${functionName}-`)
  )
  fs.cpSync(sourceDirectory, stagingRoot, {
    recursive: true,
    filter: sourcePath => shouldCopyForDeployment(sourceDirectory, sourcePath)
  })
  if (READER_SQL_RUNTIME_FUNCTIONS.has(functionName)) {
    if (!fs.existsSync(READER_SQL_RUNTIME_SOURCE)) {
      throw new Error(
        `读取 SQL 运行时缺失：${path.relative(projectRoot, READER_SQL_RUNTIME_SOURCE)}`
      )
    }
    fs.copyFileSync(READER_SQL_RUNTIME_SOURCE, path.join(stagingRoot, 'read-sql-runtime-core.js'))
  }
  for (const runtimeFile of FUNCTION_BUNDLED_RUNTIME_FILES.get(functionName) || []) {
    if (!fs.existsSync(runtimeFile.source)) {
      throw new Error(`函数运行时文件缺失：${path.relative(projectRoot, runtimeFile.source)}`)
    }
    fs.copyFileSync(runtimeFile.source, path.join(stagingRoot, runtimeFile.target))
  }
  return stagingRoot
}

function parseJsonFromOutput(output = '') {
  const text = String(output || '').trim()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    // CloudBase CLI may print a short banner before JSON; parse the JSON fragment below.
  }

  const firstObject = text.indexOf('{')
  const lastObject = text.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) {
    return JSON.parse(text.slice(firstObject, lastObject + 1))
  }

  const firstArray = text.indexOf('[')
  const lastArray = text.lastIndexOf(']')
  if (firstArray >= 0 && lastArray > firstArray) {
    return JSON.parse(text.slice(firstArray, lastArray + 1))
  }

  return null
}

function readFirstValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

function summarizeFunctionDetail(functionName, parsedDetail = {}) {
  const payload = Array.isArray(parsedDetail) ? parsedDetail[0] : parsedDetail
  const data = payload?.data || payload?.Data || payload?.result || payload?.Result || payload
  const detail =
    data?.Function || data?.function || data?.FunctionInfo || data?.functionInfo || data
  return {
    name: readFirstValue(detail, ['name', 'Name', 'FunctionName', 'functionName']) || functionName,
    status: readFirstValue(detail, ['status', 'Status']),
    runtime: readFirstValue(detail, ['runtime', 'Runtime']),
    memorySize: readFirstValue(detail, ['memorySize', 'MemorySize']),
    timeout: readFirstValue(detail, ['timeout', 'Timeout']),
    codeSize: readFirstValue(detail, ['codeSize', 'CodeSize']),
    codeSha256: readFirstValue(detail, ['codeSha256', 'CodeSha256']),
    handler: readFirstValue(detail, ['handler', 'Handler']),
    layers: Array.isArray(detail?.Layers || detail?.layers)
      ? (detail.Layers || detail.layers).map(layer => ({
          name: readFirstValue(layer, ['name', 'Name', 'LayerName', 'layerName']),
          version: readFirstValue(layer, ['version', 'Version'])
        }))
      : [],
    modificationTime: readFirstValue(detail, [
      'modificationTime',
      'ModificationTime',
      'updateTime',
      'UpdateTime',
      'updatedAt',
      'UpdatedAt'
    ])
  }
}

function runTcbInherited(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', '--package', tcbPackage, 'tcb', ...args], {
      cwd: projectRoot,
      env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`tcb ${redactTcbArgs(args).join(' ')} exited with code ${code}`))
    })
  })
}

function runTcbCaptured(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', '--package', tcbPackage, 'tcb', ...args], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`tcb ${redactTcbArgs(args).join(' ')} exited with code ${code}`))
    })
  })
}

async function loginCloudBase(env, credentials) {
  await runTcbInherited(
    ['login', '--apiKeyId', credentials.secretId, '--apiKey', credentials.secretKey],
    env
  )
}

async function readFunctionDetail(target, envId, env) {
  const result = await runTcbCaptured(['fn', 'detail', target.name, '-e', envId, '--json'], env)
  const parsed = parseJsonFromOutput(result.stdout)
  if (!parsed) {
    throw new Error(`CloudBase fn detail for ${target.name} did not return parseable JSON.`)
  }
  const summary = summarizeFunctionDetail(target.name, parsed)
  console.log('CloudBase function detail summary: ' + JSON.stringify(summary))
  return summary
}

async function deployTarget(target, envId, env) {
  console.log(`Deploying CloudBase function ${target.name}`)
  await runTcbInherited(
    ['fn', 'code', 'update', target.name, '--dir', target.stagedDir, '-e', envId, '--json'],
    env
  )
  return readFunctionDetail(target, envId, env)
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

  console.log(`CloudBase env: ${envId}`)
  console.log(`CloudBase functions: ${targets.map(target => target.name).join(', ')}`)
  for (const item of skipped) {
    console.warn(
      `Skipping missing configured function ${item.name}: ${path.relative(projectRoot, item.dir)}`
    )
  }

  const manifestFile = deploymentManifestPath(args, envId)
  const deploymentId = path.basename(manifestFile, '.json')
  const stagedTargets = targets.map(target => ({
    ...target,
    stagedDir: stageFunctionPackage(target.dir, target.name, deploymentId)
  }))
  const manifest = {
    schema_version: 1,
    status: args.dryRun ? 'dry_run' : 'planned',
    deployment_id: deploymentId,
    environment_id: envId,
    source: 'scripts/deploy-cloudbase-functions.mjs',
    target_selection: targets.map(target => target.name),
    source_identity: audits.map(sourceIdentity),
    upload_staging: stagedTargets.map(target => ({
      function_name: target.name,
      excluded_directories: Array.from(DEPLOYMENT_IGNORED_DIRECTORY_NAMES).sort(),
      excluded_files: Array.from(DEPLOYMENT_IGNORED_FILE_NAMES).sort(),
      staged_directory: target.stagedDir
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
  if (credentials.secretId && credentials.secretKey) {
    await loginCloudBase(env, credentials)
  } else {
    console.log('Using existing CloudBase CLI login; no shell CI credential was supplied.')
  }
  for (const target of stagedTargets) {
    const remote = await deployTarget(target, envId, env)
    manifest.remote_readback.push(remote)
    manifest.status = 'in_progress'
    writeDeploymentManifest(manifestFile, manifest)
  }
  manifest.status = 'completed'
  manifest.completed_at = new Date().toISOString()
  writeDeploymentManifest(manifestFile, manifest)
  console.log('Deployment manifest completed: ' + path.relative(projectRoot, manifestFile))
}

main().catch(error => {
  console.error(String(error?.stack || error))
  process.exit(1)
})
