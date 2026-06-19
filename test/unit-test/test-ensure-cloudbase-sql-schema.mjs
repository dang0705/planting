import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  classifyStatement,
  executeStatementsSafely,
  hasRunSqlRawCapability,
  probeDdlCapability,
  splitSqlStatements,
  verifyTablesExist
} from '../../scripts/lib/cloudbase-sql-runner.mjs'

const ddl = readFileSync('scripts/sql/ensure-weather-history-cache-tables.sql', 'utf8')
const statements = splitSqlStatements(ddl)

assert.equal(statements.length >= 3, true, 'DDL 文件至少应该包含三条建表语句')
for (const statement of statements) {
  assert.match(
    statement,
    /^CREATE TABLE IF NOT EXISTS/i,
    `非幂等建表语句: ${statement.slice(0, 80)}`
  )
}

assert.equal(classifyStatement('').kind, 'empty')
assert.equal(
  classifyStatement('CREATE TABLE IF NOT EXISTS foo (id INT)').kind,
  'create_table_if_not_exists'
)
assert.equal(classifyStatement('CREATE TABLE IF NOT EXISTS foo (id INT)').allowed, true)

const plainCreate = classifyStatement('CREATE TABLE foo (id INT)')
assert.equal(plainCreate.kind, 'disallowed_ddl')
assert.equal(plainCreate.allowed, false)

const alter = classifyStatement('alter table foo add column bar int')
assert.equal(alter.kind, 'disallowed_ddl')
assert.equal(alter.allowed, false)

const rename = classifyStatement('RENAME TABLE foo TO bar')
assert.equal(rename.kind, 'disallowed_ddl')
assert.equal(rename.allowed, false)

assert.equal(classifyStatement('drop table foo').destructive, true)
assert.equal(classifyStatement('TRUNCATE TABLE foo').destructive, true)
assert.equal(classifyStatement('DELETE FROM foo WHERE id=1').destructive, true)

const select = classifyStatement('select 1')
assert.equal(select.kind, 'dml')
assert.equal(select.allowed, false)

assert.equal(hasRunSqlRawCapability(null), false)
assert.equal(hasRunSqlRawCapability({}), false)
assert.equal(hasRunSqlRawCapability({ $runSQLRaw: () => {} }), true)

const probeWithoutCapability = await probeDdlCapability({ $runSQL: () => ({}) })
assert.equal(probeWithoutCapability.supported, false)
assert.match(probeWithoutCapability.reason, /\$runSQLRaw/)

const ddlOnlyModels = (() => {
  let createCalls = 0
  let dropCalls = 0
  return {
    async $runSQLRaw(sql) {
      if (/^CREATE TABLE/i.test(sql)) {
        createCalls += 1
        return { ok: true }
      }
      if (/^DROP TABLE/i.test(sql)) {
        dropCalls += 1
        return { ok: true }
      }
      throw new Error(`unexpected DDL: ${sql}`)
    },
    get _stats() {
      return { createCalls, dropCalls }
    }
  }
})()
const probeOk = await probeDdlCapability(ddlOnlyModels)
assert.equal(probeOk.supported, true)
assert.equal(ddlOnlyModels._stats.createCalls >= 1, true)

const failingProbe = await probeDdlCapability({
  async $runSQLRaw(sql) {
    if (/^CREATE/i.test(sql)) {
      throw new Error('SIGN_PARAM_INVALID: not allowed to create')
    }
    return { ok: true }
  }
})
assert.equal(failingProbe.supported, false)
assert.match(failingProbe.reason, /SIGN_PARAM_INVALID/)

const executedRawSql = []
const executedRegularSql = []
const fakeModels = {
  async $runSQLRaw(sql) {
    executedRawSql.push(sql.replace(/\s+/g, ' ').trim())
    return { ok: true }
  },
  async $runSQL(sql) {
    executedRegularSql.push(sql.replace(/\s+/g, ' ').trim())
    return { ok: true }
  }
}
await executeStatementsSafely(fakeModels, statements)
assert.equal(executedRawSql.length, statements.length)
assert.equal(executedRegularSql.length, 0)

await assert.rejects(
  () => executeStatementsSafely(fakeModels, ['DROP TABLE weather_locations']),
  /拒绝执行破坏性语句/
)

await assert.rejects(
  () => executeStatementsSafely(fakeModels, ['CREATE TABLE foo (id INT)']),
  /拒绝执行非幂等建表 DDL/
)

await assert.rejects(
  () => executeStatementsSafely(fakeModels, ['ALTER TABLE foo ADD COLUMN bar INT']),
  /拒绝执行非幂等建表 DDL/
)

await assert.rejects(
  () => executeStatementsSafely(fakeModels, ['RENAME TABLE foo TO bar']),
  /拒绝执行非幂等建表 DDL/
)

await assert.rejects(() => executeStatementsSafely(fakeModels, ['SELECT 1']), /拒绝执行非建表语句/)

await assert.rejects(
  () =>
    executeStatementsSafely({ async $runSQL() {} }, ['CREATE TABLE IF NOT EXISTS foo (id INT)']),
  /当前 SDK 不支持 DDL 通道/
)

const verifyModels = {
  async $runSQL(sql, params) {
    if (!/INFORMATION_SCHEMA\.TABLES/i.test(sql)) {
      throw new Error('verifyTablesExist 必须使用 INFORMATION_SCHEMA.TABLES 校验')
    }
    if (params.table === 'weather_locations' || params.table === 'plant_care_locations') {
      return { data: { executeResultList: [{ TABLE_NAME: params.table }] } }
    }
    return { data: { executeResultList: [] } }
  }
}
const verification = await verifyTablesExist(verifyModels, 'cloud1_dev', [
  'weather_locations',
  'plant_care_locations',
  'diagnosis_weather_evidence'
])
assert.deepEqual(verification, [
  { name: 'weather_locations', exists: true },
  { name: 'plant_care_locations', exists: true },
  { name: 'diagnosis_weather_evidence', exists: false }
])

await assert.rejects(
  () => verifyTablesExist({ async $runSQL() {} }, '', ['x']),
  /verifyTablesExist 需要明确的 schema 名/
)

console.log('test-ensure-cloudbase-sql-schema OK')
