import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { DEFAULT_BATCH_SIZE, parseBatchSize } = require(
  '../../../../../cloudfunctions/weather-ingestion-scheduler/services/d0-slot-manifest.js'
)

assert.equal(DEFAULT_BATCH_SIZE, 20)
assert.equal(parseBatchSize(undefined), 20)
assert.equal(parseBatchSize('5'), 5)
assert.equal(parseBatchSize('999'), 50)
assert.equal(parseBatchSize('invalid'), 20)

console.log('weather-ingestion-scheduler D0 slot batch-size tests passed')
