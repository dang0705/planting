#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname)
const DEV_APP_ENV_VALUES = new Set(['dev', 'development', 'cloud1_dev'])
const PROD_APP_ENV_VALUES = new Set(['prod', 'production', 'cloud1'])

function normalizeAppEnv(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (DEV_APP_ENV_VALUES.has(normalized)) {return 'development'}
  if (PROD_APP_ENV_VALUES.has(normalized)) {return 'production'}
  return 'development'
}

function parseArgs(argv = []) {
  const parsed = {
    functionName: 'diagnose-http',
    appEnv: 'development',
    schemaEnv: '',
    sqlDatabase: '',
    command: []
  }

  let separatorIndex = argv.indexOf('--')
  if (separatorIndex < 0) {separatorIndex = argv.length}

  for (const arg of argv.slice(0, separatorIndex)) {
    if (!arg.startsWith('--')) {continue}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    const key = String(rawKey || '').trim()
    const value = rest.length ? rest.join('=').trim() : 'true'
    if (key === 'function') {
      parsed.functionName = value || parsed.functionName
      continue
    }
    if (key === 'app-env') {
      parsed.appEnv = value || parsed.appEnv
      continue
    }
    if (key === 'schema-env') {
      parsed.schemaEnv = value || parsed.schemaEnv
      continue
    }
    if (key === 'sql-database') {
      parsed.sqlDatabase = value || parsed.sqlDatabase
    }
  }

  parsed.command = argv.slice(separatorIndex + 1)
  return parsed
}

function readFunctionEnv(functionName = 'diagnose-http') {
  const rcPath = path.join(projectRoot, 'cloudbaserc.json')
  const raw = fs.readFileSync(rcPath, 'utf8')
  const config = JSON.parse(raw)
  const functions = Array.isArray(config?.functions) ? config.functions : []
  const matched = functions.find(item => String(item?.name || '').trim() === functionName)

  if (!matched?.envVariables || typeof matched.envVariables !== 'object') {
    throw new Error(`cloudbaserc.json 中未找到函数 ${functionName} 的 envVariables`)
  }

  const envId =
    String(matched.envVariables.CLOUDBASE_ENV_ID || matched.envVariables.TCB_ENV || config.envId || '').trim()
  const secretId = String(matched.envVariables.CLOUDBASE_SECRET_ID || '').trim()
  const secretKey = String(matched.envVariables.CLOUDBASE_SECRET_KEY || '').trim()

  if (!envId || !secretId || !secretKey) {
    throw new Error(`cloudbaserc.json 中函数 ${functionName} 的 CloudBase 凭据不完整`)
  }

  return {
    envId,
    CLOUDBASE_ENV_ID: envId,
    TCB_ENV: String(matched.envVariables.TCB_ENV || envId).trim(),
    CLOUDBASE_SECRET_ID: secretId,
    CLOUDBASE_SECRET_KEY: secretKey,
    TENCENTCLOUD_SECRETID: secretId,
    TENCENTCLOUD_SECRETKEY: secretKey
  }
}

function buildRuntimeEnv(args = {}, baseEnv = {}) {
  const normalizedAppEnv = normalizeAppEnv(args.appEnv)
  const schemaEnv = String(args.schemaEnv || normalizedAppEnv).trim() || normalizedAppEnv
  const sqlDatabase =
    String(args.sqlDatabase || '').trim() ||
    (normalizedAppEnv === 'production' ? String(baseEnv.envId || '').trim() : 'cloud1_dev')

  const runtimeEnv = {
    APP_ENV: normalizedAppEnv,
    RUNTIME_ENV: normalizedAppEnv,
    SCHEMA_ENV: schemaEnv,
    X_ENV: schemaEnv,
    SQL_DATABASE: sqlDatabase,
    CLOUDBASE_SQL_DATABASE: sqlDatabase
  }

  if (normalizedAppEnv === 'production') {
    runtimeEnv.SQL_DATABASE_PROD = sqlDatabase
    runtimeEnv.CLOUDBASE_SQL_DATABASE_PROD = sqlDatabase
  } else {
    runtimeEnv.SQL_DATABASE_DEV = sqlDatabase
    runtimeEnv.CLOUDBASE_SQL_DATABASE_DEV = sqlDatabase
  }

  return runtimeEnv
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.command.length) {
    throw new Error('缺少待执行命令，使用方式：node scripts/terminal-e2e/run-with-cloudbase-env.mjs -- node <script> ...')
  }

  const injectedEnv = readFunctionEnv(args.functionName)
  const runtimeEnv = buildRuntimeEnv(args, injectedEnv)
  const child = spawn(args.command[0], args.command.slice(1), {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...injectedEnv,
      ...runtimeEnv
    },
    stdio: 'inherit'
  })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`子进程退出码 ${code}`))
    })
  })
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
