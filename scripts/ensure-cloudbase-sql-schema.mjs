#!/usr/bin/env node

/**
 * 幂等地把 scripts/sql/ensure-weather-history-cache-tables.sql 应用到目标 CloudBase 环境的 MySQL 实例。
 *
 * 设计目标：
 * - 只做 `CREATE TABLE IF NOT EXISTS` 等幂等 DDL，不允许 DROP / TRUNCATE / DELETE。
 * - 执行后用 INFORMATION_SCHEMA.TABLES 校验目标表是否真的存在。
 * - 凭据缺失 / SDK 不支持 DDL 时，立即报错并告知是 auth/tool/SDK 通道问题，
 *   而不是产品代码缺表。
 *
 * 用法：
 *   node scripts/ensure-cloudbase-sql-schema.mjs --help
 *   node scripts/ensure-cloudbase-sql-schema.mjs --verify-only
 *   npm run run:with-cloudbase-env -- --function=weather-http -- node scripts/ensure-cloudbase-sql-schema.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import {
  consoleLogger,
  executeStatementsSafely,
  extractCreateTableNames,
  filterCreateTableStatementsForSchema,
  hasRunSqlRawCapability,
  probeDdlCapability,
  splitSqlStatements,
  verifyTablesExist
} from './lib/cloudbase-sql-runner.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_DDL_FILE = path.join(repoRoot, 'scripts/sql/ensure-weather-history-cache-tables.sql')
const DEFAULT_TABLES = ['weather_locations', 'plant_care_locations', 'diagnosis_weather_evidence']
const DEFAULT_DEV_SCHEMA = 'cloud1_dev'

function parseArgs(argv = []) {
  const parsed = { help: false, verifyOnly: false }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    if (!arg.startsWith('--')) {
      continue
    }
    const [rawKey, ...rest] = arg.slice(2).split('=')
    const key = String(rawKey || '').trim()
    const value = rest.length ? rest.join('=').trim() : 'true'
    if (key === 'verify-only') {
      parsed.verifyOnly = value === 'true'
      continue
    }
    if (key === 'env') {
      parsed.env = value
      continue
    }
    if (key === 'schema') {
      parsed.schema = value
      continue
    }
    if (key === 'sql-file') {
      parsed.sqlFile = value
      continue
    }
    if (key === 'tables') {
      parsed.tables = value
    }
  }
  return parsed
}

function parseTableList(value = '') {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function resolveVerificationTables(args = {}, statements = []) {
  const explicitTables = parseTableList(args.tables)
  if (explicitTables.length) {
    return explicitTables
  }
  if (args.sqlFile) {
    const inferredTables = extractCreateTableNames(statements)
    if (!inferredTables.length) {
      throw new Error('--sql-file 未包含可推导表名的 CREATE TABLE IF NOT EXISTS 语句')
    }
    return inferredTables
  }
  return DEFAULT_TABLES
}

function printHelp() {
  process.stdout.write(
    [
      '用法:',
      '  node scripts/ensure-cloudbase-sql-schema.mjs [options]',
      '',
      '选项:',
      '  --help, -h           显示本帮助',
      '  --verify-only        只校验目标表是否存在，不执行 DDL',
      '  --env=<envId>        覆盖 CloudBase env id（默认读取 CLOUDBASE_ENV_ID）',
      '  --schema=<name>      覆盖目标 schema（默认 cloud1_dev / 由运行环境推导）',
      '  --sql-file=<path>    覆盖建表 SQL 文件路径（默认 scripts/sql/ensure-weather-history-cache-tables.sql）',
      '  --tables=a,b         覆盖执行后需要校验的表名列表；默认从 --sql-file 推导，未传 --sql-file 时校验 weather 默认表',
      '',
      '说明:',
      '  1. 凭据通过环境变量注入，请优先使用 npm run run:with-cloudbase-env -- --function=<fn> -- node scripts/ensure-cloudbase-sql-schema.mjs。',
      '  2. 该脚本只允许 CREATE TABLE IF NOT EXISTS 等幂等 DDL，遇到 DROP / TRUNCATE / DELETE 会直接拒绝。',
      '  3. 执行成功后会用 INFORMATION_SCHEMA.TABLES 校验目标表存在。',
      ''
    ].join('\n')
  )
}

function resolveSchemaName(args) {
  const fromArgs = String(args.schema || '').trim()
  if (fromArgs) {
    return fromArgs
  }
  const fromEnv = String(
    process.env.CLOUDBASE_SQL_DATABASE ||
      process.env.SQL_DATABASE ||
      process.env.SQL_DATABASE_DEV ||
      process.env.CLOUDBASE_SQL_DATABASE_DEV ||
      ''
  ).trim()
  return fromEnv || DEFAULT_DEV_SCHEMA
}

function resolveCredentials() {
  const secretId = String(
    process.env.CLOUDBASE_SECRET_ID ||
      process.env.TENCENT_SECRET_ID ||
      process.env.TENCENTCLOUD_SECRETID ||
      ''
  ).trim()
  const secretKey = String(
    process.env.CLOUDBASE_SECRET_KEY ||
      process.env.TENCENT_SECRET_KEY ||
      process.env.TENCENTCLOUD_SECRETKEY ||
      ''
  ).trim()
  return { secretId, secretKey }
}

function resolveEnvId(args) {
  const explicit = String(args.env || '').trim()
  if (explicit) {
    return explicit
  }
  return String(
    process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID_DEV || ''
  ).trim()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const logger = consoleLogger()
  const sqlFile = path.resolve(repoRoot, String(args.sqlFile || DEFAULT_DDL_FILE))
  if (!fs.existsSync(sqlFile)) {
    throw new Error(`未找到建表 SQL 文件: ${sqlFile}`)
  }
  const sql = fs.readFileSync(sqlFile, 'utf8')
  const statements = splitSqlStatements(sql)
  if (!statements.length) {
    throw new Error(`建表 SQL 文件为空: ${sqlFile}`)
  }
  const schema = resolveSchemaName(args)
  const executableStatements = filterCreateTableStatementsForSchema(statements, schema)
  const verificationTables = resolveVerificationTables(args, executableStatements)

  const envId = resolveEnvId(args)
  if (!envId) {
    throw new Error(
      '缺少 CLOUDBASE_ENV_ID。请通过 npm run run:with-cloudbase-env -- --function=<fn> -- node scripts/ensure-cloudbase-sql-schema.mjs 注入凭据。'
    )
  }
  const credentials = resolveCredentials()
  if (!credentials.secretId || !credentials.secretKey) {
    throw new Error(
      '缺少 CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY。请通过 .env.local 或 run:with-cloudbase-env 注入凭据。'
    )
  }

  const cloudbase = require('@cloudbase/node-sdk')
  const app = cloudbase.init({
    env: envId,
    secretId: credentials.secretId,
    secretKey: credentials.secretKey
  })
  const models = app.models
  if (!models || typeof models.$runSQL !== 'function') {
    throw new Error('当前 @cloudbase/node-sdk 未暴露 models.$runSQL，无法对 MySQL 执行语句')
  }

  logger.info(
    `[ensure-sql] env=${envId} schema=${schema} sqlFile=${path.relative(repoRoot, sqlFile)}`
  )

  if (!args.verifyOnly) {
    const ddlProbe = await probeDdlCapability(models)
    if (!hasRunSqlRawCapability(models) || !ddlProbe.supported) {
      throw new Error(
        `当前 SDK / 凭据不支持执行 DDL（${ddlProbe.reason || '未知原因'}）。` +
          ' 请使用具备建表权限的凭据，或先到控制台执行 ' +
          path.relative(repoRoot, sqlFile)
      )
    }
    await executeStatementsSafely(models, executableStatements, { logger })
  }

  const verification = await verifyTablesExist(models, schema, verificationTables)
  const missing = verification.filter(item => !item.exists).map(item => item.name)
  if (missing.length) {
    throw new Error(
      `校验失败：缺少表 ${missing.join(', ')}（schema=${schema}）。` +
        ' 这通常意味着凭据没有该 schema 的权限，或者目标 MySQL 实例和当前 schema 不一致。'
    )
  }

  logger.info(
    `[ensure-sql] 表校验通过：${verification
      .map(item => `${item.name}=${item.exists ? 'ok' : 'missing'}`)
      .join(', ')}`
  )
}

if (path.resolve(process.argv[1] || '') === __filename) {
  main().catch(error => {
    process.stderr.write(`${String(error?.stack || error)}\n`)
    process.exit(1)
  })
}

export { parseArgs, parseTableList, resolveSchemaName, resolveVerificationTables }
