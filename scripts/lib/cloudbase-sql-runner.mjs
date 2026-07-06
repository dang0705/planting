'use strict'

/**
 * CloudBase MySQL DDL/SQL 运行辅助。
 *
 * 把 sync-symptom-class-runtime 里 `$runSQLRaw` 的探测、DDL/SQL 切分
 * 和按段执行抽出来，给 schema ensure 类脚本复用。
 *
 * 这里只允许 idempotent 行为：
 * - DDL 段必须是 `CREATE TABLE IF NOT EXISTS` 形式；
 *   其他 DDL（ALTER / RENAME / CREATE TABLE without IF NOT EXISTS / DROP / TRUNCATE 等）一律拒绝。
 * - 调用方必须自己决定是否 verify。
 */

const DESTRUCTIVE_PREFIXES = ['drop ', 'truncate ', 'delete ']
const DISALLOWED_DDL_PREFIXES = ['alter ', 'rename ']
const CREATE_TABLE_IF_NOT_EXISTS_PATTERN = /^create\s+table\s+if\s+not\s+exists\s+/i
const CREATE_PATTERN = /^create\s+/i
const CREATE_TABLE_NAME_PATTERN =
  /^create\s+table\s+if\s+not\s+exists\s+(?:(?:`([^`]+)`|([A-Za-z0-9_-]+))\.)?(?:`([^`]+)`|([A-Za-z0-9_-]+))/i

function stripLineComments(sql = '') {
  return String(sql || '')
    .split('\n')
    .filter(line => !String(line).trimStart().startsWith('--'))
    .join('\n')
}

export function splitSqlStatements(sql = '') {
  return stripLineComments(sql)
    .split(';')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

export function extractCreateTableNames(statements = []) {
  const tableNames = new Set()
  for (const statement of statements) {
    const tableName = parseCreateTableStatement(statement)?.tableName || ''
    if (tableName) {
      tableNames.add(tableName)
    }
  }
  return Array.from(tableNames)
}

export function parseCreateTableStatement(statement = '') {
  const match = String(statement || '')
    .trim()
    .match(CREATE_TABLE_NAME_PATTERN)
  if (!match) {
    return null
  }
  return {
    schema: match[1] || match[2] || '',
    tableName: match[3] || match[4] || ''
  }
}

export function filterCreateTableStatementsForSchema(statements = [], schema = '') {
  const targetSchema = String(schema || '').trim()
  if (!targetSchema) {
    return statements
  }

  const createStatements = statements
    .map(statement => ({ statement, table: parseCreateTableStatement(statement) }))
    .filter(item => item.table?.tableName)
  const qualifiedMatches = createStatements.filter(item => item.table.schema === targetSchema)
  if (qualifiedMatches.length) {
    return qualifiedMatches.map(item => item.statement)
  }

  const unqualifiedStatements = createStatements.filter(item => !item.table.schema)
  if (unqualifiedStatements.length) {
    return unqualifiedStatements.map(item => item.statement)
  }

  throw new Error(
    `当前 sql-file 没有目标 schema(${targetSchema}) 的 CREATE TABLE IF NOT EXISTS 语句，也没有未限定 schema 的建表语句。`
  )
}

export function classifyStatement(sql = '') {
  const trimmed = String(sql || '').trim()
  if (!trimmed) {
    return { kind: 'empty', destructive: false, allowed: false }
  }
  const lower = trimmed.toLowerCase()

  for (const prefix of DESTRUCTIVE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { kind: 'destructive', destructive: true, allowed: false }
    }
  }
  for (const prefix of DISALLOWED_DDL_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { kind: 'disallowed_ddl', destructive: false, allowed: false }
    }
  }
  if (CREATE_TABLE_IF_NOT_EXISTS_PATTERN.test(trimmed)) {
    return { kind: 'create_table_if_not_exists', destructive: false, allowed: true }
  }
  if (CREATE_PATTERN.test(trimmed)) {
    return { kind: 'disallowed_ddl', destructive: false, allowed: false }
  }
  return { kind: 'dml', destructive: false, allowed: false }
}

export function hasRunSqlRawCapability(models) {
  return Boolean(models) && typeof models.$runSQLRaw === 'function'
}

export async function probeDdlCapability(models) {
  if (!hasRunSqlRawCapability(models)) {
    return { supported: false, reason: '当前 SDK 未暴露 $runSQLRaw' }
  }

  const probeTable = `__cb_schema_probe_${Date.now()}`
  const createProbe = `CREATE TABLE \`${probeTable}\` (id INT NOT NULL) ENGINE=InnoDB`
  const dropProbe = `DROP TABLE IF EXISTS \`${probeTable}\``

  try {
    await models.$runSQLRaw(createProbe, {})
    try {
      await models.$runSQLRaw(dropProbe, {})
    } catch {
      // 忽略：已尽力清理探测表
    }
    return { supported: true }
  } catch (error) {
    try {
      await models.$runSQLRaw(dropProbe, {})
    } catch {
      // 忽略：探测失败时探测表通常没建出来
    }
    const message = String(error?.message || error || '')
    return { supported: false, reason: message || '$runSQLRaw 探测失败' }
  }
}

export async function executeStatementsSafely(
  models,
  statements = [],
  { logger = noopLogger() } = {}
) {
  const results = []
  for (const statement of statements) {
    const classification = classifyStatement(statement)
    const preview = statement.replace(/\s+/g, ' ').slice(0, 160)

    if (classification.kind === 'empty') {
      continue
    }
    if (classification.destructive) {
      throw new Error(`拒绝执行破坏性语句：${preview}`)
    }
    if (classification.kind === 'disallowed_ddl') {
      throw new Error(
        `拒绝执行非幂等建表 DDL：${preview}。本入口只允许 \`CREATE TABLE IF NOT EXISTS\` 形式的建表语句，` +
          'ALTER / RENAME / 不带 IF NOT EXISTS 的 CREATE 等都不在允许范围内。'
      )
    }
    if (classification.kind === 'dml') {
      throw new Error(
        `拒绝执行非建表语句：${preview}。本入口只允许 \`CREATE TABLE IF NOT EXISTS\` 形式的建表 DDL。`
      )
    }
    if (classification.kind === 'create_table_if_not_exists') {
      if (!hasRunSqlRawCapability(models)) {
        throw new Error(
          `当前 SDK 不支持 DDL 通道：${preview}。请确认 @cloudbase/node-sdk 版本是否暴露 $runSQLRaw。`
        )
      }
      logger.info(`[ensure-sql] 执行 DDL: ${preview}`)
      const result = await models.$runSQLRaw(`${statement};`, {})
      results.push({ statement, kind: classification.kind, result })
      continue
    }

    throw new Error(`未识别的 SQL 段：${preview}`)
  }
  return results
}

export async function verifyTablesExist(models, schema = '', tables = []) {
  if (!schema) {
    throw new Error('verifyTablesExist 需要明确的 schema 名')
  }
  const seenTables = new Map()
  for (const tableName of tables) {
    const result = await models.$runSQL(
      `
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = {{schema}}
          AND TABLE_NAME = {{table}}
        LIMIT 1
      `,
      { schema, table: tableName }
    )
    const rows = result?.data?.executeResultList || []
    seenTables.set(tableName, rows.length > 0)
  }
  return Array.from(seenTables.entries()).map(([name, exists]) => ({ name, exists }))
}

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  }
}

export function consoleLogger() {
  return {
    info(message) {
      process.stdout.write(`${message}\n`)
    },
    warn(message) {
      process.stderr.write(`${message}\n`)
    },
    error(message) {
      process.stderr.write(`${message}\n`)
    }
  }
}
