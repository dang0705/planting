import assert from 'node:assert/strict'
import { parsePlantDateTime } from '../../../../src/utils/plant-datetime.js'

const dateOnly = parsePlantDateTime('2026-08-30')
assert.ok(dateOnly instanceof Date)
assert.equal(dateOnly.getFullYear(), 2026)
assert.equal(dateOnly.getMonth(), 7)
assert.equal(dateOnly.getDate(), 30)
assert.equal(parsePlantDateTime('2026-02-30'), null)
assert.equal(parsePlantDateTime('not-a-date'), null)
assert.equal(parsePlantDateTime(''), null)
const iso = parsePlantDateTime('2026-08-30T09:00:00+08:00')
assert.ok(iso instanceof Date)

console.log('plant business date parsing tests passed data_mode=unit_fake test_kind=logic')
