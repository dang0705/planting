#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)
const cloudbasercPath = path.join(projectRoot, 'cloudbaserc.json')
const tcbPackage = '@cloudbase/cli@3.2.2'

function parseArgs(argv = []) {
  const parsed = {
    dryRun: false,
    envId: '',
    functions: []
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
  const explicit = [
    ...args.functions,
    ...splitFunctionList(process.env.CLOUDBASE_DEPLOY_FUNCTIONS)
  ]
  if (explicit.length) {
    return Array.from(new Set(explicit))
  }

  const configured = Array.isArray(config.functions) ? config.functions : []
  return configured
    .map(item => String(item?.name || '').trim())
    .filter(Boolean)
    .filter((name, index, all) => all.indexOf(name) === index)
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
        throw new Error(`云函数 ${name} 缺少目录或 package.json：${path.relative(projectRoot, dir)}`)
      }
      skipped.push({ name, dir })
      continue
    }
    targets.push({ name, dir })
  }

  return { targets, skipped }
}

function tcbEnv(baseEnv, envId, credentials) {
  return {
    ...baseEnv,
    CLOUDBASE_ENV_ID: envId,
    TCB_ENV: envId,
    CLOUDBASE_SECRET_ID: credentials.secretId,
    CLOUDBASE_SECRET_KEY: credentials.secretKey,
    TENCENTCLOUD_SECRETID: credentials.secretId,
    TENCENTCLOUD_SECRETKEY: credentials.secretKey
  }
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
  const detail = data?.Function || data?.function || data?.FunctionInfo || data?.functionInfo || data
  return {
    name: readFirstValue(detail, ['name', 'Name', 'FunctionName', 'functionName']) || functionName,
    status: readFirstValue(detail, ['status', 'Status']),
    runtime: readFirstValue(detail, ['runtime', 'Runtime']),
    memorySize: readFirstValue(detail, ['memorySize', 'MemorySize']),
    timeout: readFirstValue(detail, ['timeout', 'Timeout']),
    codeSize: readFirstValue(detail, ['codeSize', 'CodeSize']),
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
  console.log(`CloudBase function detail summary: ${JSON.stringify(summary)}`)
}

async function deployTarget(target, envId, env) {
  console.log(`Deploying CloudBase function ${target.name}`)
  await runTcbInherited(
    ['fn', 'code', 'update', target.name, '--dir', target.dir, '-e', envId, '--json'],
    env
  )
  await readFunctionDetail(target, envId, env)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = readCloudbaseRc()
  const envId = resolveEnvId(args, config)
  if (!envId) {
    throw new Error('缺少 CloudBase 环境 ID，请配置 CLOUDBASE_ENV_ID/TCB_ENV 或 --env-id。')
  }

  const names = resolveFunctionNames(args, config)
  const explicitSelection = Boolean(
    args.functions.length || splitFunctionList(process.env.CLOUDBASE_DEPLOY_FUNCTIONS).length
  )
  const targetEnv = String(process.env.TARGET_ENV || process.env.VITE_APP_ENV || '').trim().toLowerCase()
  if (!explicitSelection && ['prod', 'production'].includes(targetEnv)) {
    throw new Error('生产环境部署必须显式配置 CLOUDBASE_DEPLOY_FUNCTIONS 或 --functions，禁止默认全量发布。')
  }
  const { targets, skipped } = buildDeployTargets(names, config, explicitSelection)
  if (!targets.length) {
    throw new Error('没有可部署的云函数，请检查 cloudbaserc.json 或 CLOUDBASE_DEPLOY_FUNCTIONS。')
  }

  console.log(`CloudBase env: ${envId}`)
  console.log(`CloudBase functions: ${targets.map(target => target.name).join(', ')}`)
  for (const item of skipped) {
    console.warn(`Skipping missing configured function ${item.name}: ${path.relative(projectRoot, item.dir)}`)
  }

  if (args.dryRun) {
    console.log('Dry run only: no CloudBase deployment command was executed.')
    return
  }

  const credentials = resolveCredentials()
  if (!credentials.secretId || !credentials.secretKey) {
    throw new Error('缺少 CloudBase CI 凭据，请通过 GitHub Secrets 或 shell 提供腾讯云 SecretId/SecretKey。')
  }

  const env = tcbEnv(process.env, envId, credentials)
  await loginCloudBase(env, credentials)
  for (const target of targets) {
    await deployTarget(target, envId, env)
  }
}

main().catch(error => {
  console.error(String(error?.stack || error))
  process.exit(1)
})
