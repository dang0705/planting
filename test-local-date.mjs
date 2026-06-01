import assert from 'node:assert/strict'
import { formatLocalDate } from './src/utils/local-date.js'

process.env.TZ = 'Asia/Singapore'

assert.equal(formatLocalDate(new Date('2026-05-26T17:30:00.000Z')), '2026-05-27')
assert.equal(formatLocalDate(new Date('2026-05-27T16:30:00.000Z')), '2026-05-28')

console.log('local-date tests passed')
