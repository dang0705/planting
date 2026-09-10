#!/usr/bin/env node

/**
 * 显式初始化浇水建议 MySQL 表。
 *
 * CloudBase Node SDK 当前只支持 DML 的 $runSQL，不能可靠承载建表 DDL；
 * 本脚本改用官方 tcb db execute CLI，并且只允许对 development 的
 * cloud1_dev schema 执行 CREATE TABLE IF NOT EXISTS。网关启动不会调用本脚本。
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  classifyStatement,
  extractCreateTableNames,
  filterCreateTableStatementsForSchema,
  splitSqlStatements
} from '../lib/cloudbase-sql-runner.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../..')
const DEFAULT_DDL_FILE = path.join(
  repoRoot,
  'scripts/sql/ensure-watering-advisor-sessions-table-20260709.sql'
)
const DEFAULT_SCHEMA = 'cloud1_dev'
const PRODUCTION_APP_ENVS = new Set(['prod', 'production', 'cloud1'])
const ARG_PREFIX_LENGTH = 2
const FIRST_ITEM_INDEX = 0
const ENTRY_ARG_INDEX = 1
const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1

function parseArgs(argv = []) {
  const parsed = { help: false, verifyOnly: false }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    if (!String(arg).startsWith('--')) {
      continue
    }
    const [rawKey, ...rest] = String(arg).slice(ARG_PREFIX_LENGTH).split('=')
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

function resolveSchema(args = {}) {
  return String(
    args.schema ||
      process.env.CLOUDBASE_SQL_DATABASE ||
      process.env.SQL_DATABASE ||
      process.env.SQL_DATABASE_DEV ||
      DEFAULT_SCHEMA
  ).trim()
}

function resolveEnvId(args = {}) {
  return String(
    args.env ||
      process.env.CLOUDBASE_ENV_ID ||
      process.env.TCB_ENV ||
      process.env.CLOUDBASE_ENV_ID_DEV ||
      ''
  ).trim()
}

function resolveCredentialPresence() {
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
  return Boolean(secretId && secretKey)
}

function assertDevelopmentScope(schema) {
  const appEnv = String(process.env.APP_ENV || process.env.RUNTIME_ENV || 'development')
    .trim()
    .toLowerCase()
  if (PRODUCTION_APP_ENVS.has(appEnv)) {
    throw new Error('拒绝在 production 环境执行浇水建议表初始化；请明确切换到 development。')
  }
  if (schema !== DEFAULT_SCHEMA) {
    throw new Error(
      `拒绝对非开发 schema(${schema}) 执行浇水建议表初始化；本入口固定使用 ${DEFAULT_SCHEMA}。`
    )
  }
}

function quoteSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function scrubOutput(value = '') {
  let text = String(value || '')
  for (const key of [
    'CLOUDBASE_SECRET_ID',
    'CLOUDBASE_SECRET_KEY',
    'TENCENT_SECRET_ID',
    'TENCENT_SECRET_KEY',
    'TENCENTCLOUD_SECRETID',
    'TENCENTCLOUD_SECRETKEY'
  ]) {
    const secret = String(process.env[key] || '')
    if (secret) {
      text = text.replaceAll(secret, '[REDACTED_SECRET]')
    }
  }
  return text.trim()
}

function parseCliJson(output = '') {
  const normalized = String(output || '')
    .split(/\r?\n/)
    .filter(line => !/^\s*-\s+(Loading data|Executing SQL)\.\.\.\s*$/.test(line))
    .join('\n')
    .trim()
  const match = normalized.match(/\{[\s\S]*\}\s*$/)
  if (!match) {
    throw new Error(`tcb db execute 未返回 JSON：${scrubOutput(output)}`)
  }
  try {
    return JSON.parse(match[FIRST_ITEM_INDEX])
  } catch (error) {
    throw new Error(`tcb db execute JSON 解析失败：${scrubOutput(error.message)}`)
  }
}

function runTcb(envId, sql, { readOnly = false } = {}) {
  const cli = String(process.env.TCB_CLI || 'tcb').trim() || 'tcb'
  const args = ['db', 'execute', '-e', envId]
  if (readOnly) {
    args.push('--read-only')
  }
  args.push('--json', '--sql', sql)

  const result = spawnSync(cli, args, {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8'
  })
  if (result.error) {
    throw new Error(`无法启动 CloudBase CLI(${cli})：${scrubOutput(result.error.message)}`)
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
  if (result.status !== EXIT_SUCCESS) {
    throw new Error(`tcb db execute 失败(exit=${result.status})：${scrubOutput(output)}`)
  }
  return parseCliJson(result.stdout)
}

function resolveVerificationTables(args, statements) {
  const explicit = parseTableList(args.tables)
  const inferred = extractCreateTableNames(statements)
  const tables = explicit.length ? explicit : inferred
  if (!tables.length) {
    throw new Error('建表 SQL 未包含可校验的表名；请通过 --tables=a,b 明确指定。')
  }
  return tables
}

function verifyTables(envId, schema, tables) {
  const literals = tables.map(quoteSqlLiteral).join(', ')
  const sql =
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ' +
    `WHERE TABLE_SCHEMA = ${quoteSqlLiteral(schema)} AND TABLE_NAME IN (${literals})`
  const result = runTcb(envId, sql, { readOnly: true })
  const rows = Array.isArray(result?.data?.items)
    ? result.data.items
    : Array.isArray(result?.data?.rows)
      ? result.data.rows
      : []
  const existing = new Set(rows.map(row => String(row?.TABLE_NAME || row?.table_name || '')))
  return tables.map(name => ({ name, exists: existing.has(name) }))
}

function printHelp() {
  process.stdout.write(
    [
      '用法:',
      '  npm run ensure:cloudbase-watering-advisor-schema',
      '  npm run ensure:cloudbase-watering-advisor-schema:verify',
      '',
      '说明:',
      '  - 只允许 development/cloud1_dev，且只执行 CREATE TABLE IF NOT EXISTS。',
      '  - 建表使用官方 tcb db execute；网关启动不会自动执行。',
      '  - 凭据由 run-with-cloudbase-env 从未提交的 .env.local 注入，不会打印凭据。',
      '  - 可选参数：--verify-only、--env=<envId>、--schema=cloud1_dev、--sql-file=<path>、--tables=a,b',
      ''
    ].join('\n')
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(ARG_PREFIX_LENGTH))
  if (args.help) {
    printHelp()
    return
  }

  const envId = resolveEnvId(args)
  if (!envId) {
    throw new Error('缺少 CLOUDBASE_ENV_ID；请通过 run-with-cloudbase-env 注入开发环境。')
  }
  if (!resolveCredentialPresence()) {
    throw new Error(
      '缺少 CloudBase 凭据；请通过未提交的 .env.local 或 shell secrets 注入 CLOUDBASE_SECRET_ID/KEY。'
    )
  }

  const schema = resolveSchema(args)
  assertDevelopmentScope(schema)

  const sqlFile = path.resolve(repoRoot, String(args.sqlFile || DEFAULT_DDL_FILE))
  if (!fs.existsSync(sqlFile)) {
    throw new Error(`未找到建表 SQL 文件：${sqlFile}`)
  }
  const statements = splitSqlStatements(fs.readFileSync(sqlFile, 'utf8'))
  const executableStatements = filterCreateTableStatementsForSchema(statements, schema)
  const invalid = executableStatements.filter(
    statement => classifyStatement(statement).kind !== 'create_table_if_not_exists'
  )
  if (invalid.length) {
    throw new Error('建表 SQL 含有非幂等或非建表语句，已拒绝执行。')
  }
  const tables = resolveVerificationTables(args, executableStatements)

  process.stdout.write(
    `[ensure-watering-advisor-schema] env=${envId} schema=${schema} ` +
      `sqlFile=${path.relative(repoRoot, sqlFile)} mode=${args.verifyOnly ? 'verify' : 'ensure'}\n`
  )

  if (!args.verifyOnly) {
    for (const statement of executableStatements) {
      const tableName = extractCreateTableNames([statement])[FIRST_ITEM_INDEX] || 'unknown'
      runTcb(envId, statement)
      process.stdout.write(`[ensure-watering-advisor-schema] DDL 已执行：${tableName}\n`)
    }
  }

  const verification = verifyTables(envId, schema, tables)
  const missing = verification.filter(item => !item.exists).map(item => item.name)
  if (missing.length) {
    throw new Error(`校验失败：${schema} 缺少表 ${missing.join(', ')}`)
  }
  process.stdout.write(
    `[ensure-watering-advisor-schema] 校验通过：${verification
      .map(item => `${item.name}=ok`)
      .join(', ')}\n`
  )
}

if (path.resolve(process.argv[ENTRY_ARG_INDEX] || '') === __filename) {
  main().catch(error => {
    process.stderr.write(`${scrubOutput(error?.stack || error)}\n`)
    process.exit(EXIT_FAILURE)
  })
}

export {
  assertDevelopmentScope,
  parseArgs,
  parseCliJson,
  parseTableList,
  resolveSchema,
  verifyTables
}
