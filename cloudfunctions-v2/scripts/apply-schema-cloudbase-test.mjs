#!/usr/bin/env node
/**
 * 把 v2 冻结 DDL 按 manifest 顺序应用到 CloudBase MySQL 测试库 `qinghuazhi_v2_test`。
 *
 * 约束：`tcb db execute` 每次只能执行一条语句，且默认库固定为生产库，因此每条语句中的表名、外键目标
 * 与触发器名都改写为 `qinghuazhi_v2_test`.`name`；会话级 SET 在单语句调用中无效，记录为跳过。
 * 目标库写死，不接受参数覆盖。`--dry-run` 只输出改写结果；`--apply` 逐条执行并写审计日志。
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const targetDatabase = 'qinghuazhi_v2_test'
const envId = 'cloud1-2grufevs395a9d5e'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const schemaDir = join(projectRoot, 'docs/backend-v2/schema')
const mode = process.argv[2]
const logPath = process.argv[3]

if (mode !== '--dry-run' && mode !== '--apply') {
  throw new Error('用法：apply-schema-cloudbase-test.mjs --dry-run|--apply [审计日志路径]')
}

/** 按分隔符切分语句，跳过单引号字符串与行注释中的分隔符。 */
function splitStatements(text, delimiter) {
  const statements = []
  let current = ''
  let inString = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (!inString && char === '-' && text[index + 1] === '-') {
      const end = text.indexOf('\n', index)
      index = end === -1 ? text.length : end
      current += '\n'
      continue
    }
    if (char === "'") {
      if (inString && text[index + 1] === "'") {
        current += "''"
        index += 1
        continue
      }
      inString = !inString
    }
    if (!inString && text.startsWith(delimiter, index)) {
      if (current.trim()) {
        statements.push(current.trim())
      }
      current = ''
      index += delimiter.length - 1
      continue
    }
    current += char
  }
  if (current.trim()) {
    statements.push(current.trim())
  }
  return statements
}

/** 处理 DELIMITER 区块：区块内按自定义分隔符切分，区块外按分号切分。 */
function parseFile(text) {
  const statements = []
  const parts = text.split(/^DELIMITER\s+(\S+)\s*$/mu)
  let delimiter = ';'
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 2 === 1) {
      delimiter = parts[index]
      continue
    }
    statements.push(...splitStatements(parts[index], delimiter))
  }
  return statements
}

const qualify = name => `\`${targetDatabase}\`.\`${name}\``

/** 把表名、外键目标、触发器名与触发器体内的 FROM/JOIN 目标限定到测试库。 */
function qualifyStatement(statement) {
  return statement
    .replace(
      /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)`([A-Za-z0-9_]+)`/giu,
      (_m, p, n) => `${p}${qualify(n)}`
    )
    .replace(/(CREATE\s+TRIGGER\s+)`([A-Za-z0-9_]+)`/giu, (_m, p, n) => `${p}${qualify(n)}`)
    .replace(/(REFERENCES\s+)`([A-Za-z0-9_]+)`/giu, (_m, p, n) => `${p}${qualify(n)}`)
    .replace(
      /(\b(?:BEFORE|AFTER)\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+)`([A-Za-z0-9_]+)`/giu,
      (_m, p, n) => `${p}${qualify(n)}`
    )
    .replace(/(\b(?:FROM|JOIN)\s+)`([A-Za-z0-9_]+)`/giu, (_m, p, n) => `${p}${qualify(n)}`)
}

/** 分类语句；未知类型直接失败，避免意外语句进入云端。 */
function classify(statement) {
  if (/^SET\s+(NAMES|time_zone)\b/iu.test(statement)) {
    return 'skip_session_set'
  }
  if (/^CREATE\s+TABLE\b/iu.test(statement)) {
    return 'create_table'
  }
  if (/^CREATE\s+TRIGGER\b/iu.test(statement)) {
    return 'create_trigger'
  }
  throw new Error(`未知语句类型：${statement.slice(0, 80)}`)
}

/** 执行后逐条确认语句中的反引号表引用都已限定到测试库。 */
function assertQualified(statement, kind) {
  if (
    kind === 'create_table' &&
    !/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`qinghuazhi_v2_test`\./iu.test(statement)
  ) {
    throw new Error('CREATE TABLE 未限定到测试库')
  }
  const refs = statement.match(/REFERENCES\s+`[^`]+`(\.`[^`]+`)?/giu) ?? []
  for (const ref of refs) {
    if (!ref.includes(`\`${targetDatabase}\`.`)) {
      throw new Error(`外键目标未限定：${ref}`)
    }
  }
}

const manifest = JSON.parse(readFileSync(join(schemaDir, 'manifest.json'), 'utf8'))
const plan = []
for (const entry of manifest.files) {
  for (const raw of parseFile(readFileSync(join(schemaDir, entry.file), 'utf8'))) {
    const kind = classify(raw)
    const sql = kind === 'skip_session_set' ? raw : qualifyStatement(raw)
    if (kind !== 'skip_session_set') {
      assertQualified(sql, kind)
    }
    plan.push({ file: entry.file, kind, sql })
  }
}

if (mode === '--dry-run') {
  for (const item of plan) {
    console.log(`-- ${item.file} ${item.kind}\n${item.sql};\n`)
  }
  const count = kind => plan.filter(item => item.kind === kind).length
  console.error(
    JSON.stringify({
      tables: count('create_table'),
      triggers: count('create_trigger'),
      skipped: count('skip_session_set')
    })
  )
  process.exit(0)
}

if (!logPath) {
  throw new Error('--apply 必须提供审计日志路径')
}
/** 同一审计日志中已成功的语句（按 SHA-256）不重复执行，支持中断后续跑。 */
const previouslyApplied = new Set()
if (existsSync(logPath)) {
  for (const result of JSON.parse(readFileSync(logPath, 'utf8')).results) {
    if (result.status === 'ok') {
      previouslyApplied.add(result.sha256)
    }
  }
}
const results = []
for (const item of plan) {
  const sha256 = createHash('sha256').update(item.sql, 'utf8').digest('hex')
  if (item.kind === 'skip_session_set') {
    results.push({ file: item.file, kind: item.kind, sha256, status: 'skipped' })
    continue
  }
  if (previouslyApplied.has(sha256)) {
    results.push({ file: item.file, kind: item.kind, sha256, status: 'ok' })
    continue
  }
  try {
    execFileSync('tcb', ['db', 'execute', '-e', envId, '--json', '--sql', item.sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    results.push({ file: item.file, kind: item.kind, sha256, status: 'ok' })
  } catch (error) {
    const message = String(error.stdout || error.stderr || error.message).slice(0, 400)
    // RunSql 走预处理语句协议，MySQL 不支持在该协议下 CREATE TRIGGER（1295），需经其他通道补建。
    if (item.kind === 'create_trigger' && message.includes('Error 1295')) {
      results.push({
        file: item.file,
        kind: item.kind,
        sha256,
        status: 'deferred_prepared_statement_unsupported'
      })
      continue
    }
    results.push({ file: item.file, kind: item.kind, sha256, status: 'failed', message })
    break
  }
}
mkdirSync(dirname(logPath), { recursive: true })
writeFileSync(
  logPath,
  `${JSON.stringify({ envId, targetDatabase, manifestFiles: manifest.files.map(e => e.file), results }, null, 2)}\n`
)
const failed = results.filter(r => r.status === 'failed')
const countStatus = status => results.filter(r => r.status === status).length
console.log(
  JSON.stringify({
    executed: countStatus('ok'),
    skipped: countStatus('skipped'),
    deferredTriggers: countStatus('deferred_prepared_statement_unsupported'),
    failed: failed.length,
    lastFailure: failed[0] ?? null
  })
)
if (failed.length > 0) {
  process.exitCode = 1
}
