import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=unit_logic。Expected 来自 CloudBase 数据模型的“数字/日期时间”契约：日期存为毫秒时间戳。
const require = createRequire(import.meta.url)
const { normalizeDateForColumn } = require('../../../../../src/data-system/db/metadata-values.js')

const sourceDate = new Date('2026-09-16T04:12:25.000Z')
const expectedEpochMilliseconds = 1789531945000

assert.equal(
  normalizeDateForColumn(sourceDate, { dataType: 'bigint' }),
  expectedEpochMilliseconds,
  '数字型日期列必须写入毫秒时间戳'
)
assert.equal(
  normalizeDateForColumn(sourceDate, { dataType: 'number' }),
  expectedEpochMilliseconds,
  'CloudBase 数字日期模型必须写入毫秒时间戳'
)
assert.ok(
  normalizeDateForColumn(sourceDate, { dataType: 'datetime' }) instanceof Date,
  'DATETIME 列必须保留 Date 值'
)
assert.equal(
  normalizeDateForColumn('2026-09-16T04:12:25.000Z', { dataType: 'bigint' }),
  expectedEpochMilliseconds,
  'ISO 日期字符串也必须按数字日期列转换'
)
assert.equal(normalizeDateForColumn(null, { dataType: 'bigint' }), null, '空日期必须保留为空')

console.log('metadata date serialization contract passed data_mode=unit_fake test_kind=unit_logic')
