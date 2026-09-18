import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { handleRecentWeatherTimerEvent } = require(
  '../../../../../cloudfunctions/weather-ingestion-scheduler/routes/recent-weather-routes.js'
)

let ingested = false
const result = await handleRecentWeatherTimerEvent({
  event: { TriggerName: 'weather-ingestion-recent-10d' },
  seasonTriggerSync: {
    async syncToday() {
      throw new Error('season storage unavailable')
    }
  },
  service: {
    async ingestActiveLocations({ limit }) {
      ingested = true
      return { total: 1, limit, results: [{ locationKey: 'city:shanghai', ok: true }] }
    }
  },
  defaultLimit: 20
})

assert.equal(ingested, true)
assert.equal(result.code, 200)
assert.equal(result.data.total, 1)
assert.deepEqual(result.data.seasonTriggerWarning, {
  status: 'failed',
  reason: 'season_trigger_sync_failed'
})

console.log('weather-ingestion-scheduler recent weather route tests passed')
