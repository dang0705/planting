import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract
const source = readFileSync('src/vue-query/weather/queries/environment-weather.js', 'utf8')
assert.match(source, /ENVIRONMENT_WEATHER_STALE_TIME_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/u)
assert.match(source, /staleTime:\s*ENVIRONMENT_WEATHER_STALE_TIME_MS/u)
assert.match(source, /normalizedMode/u)
assert.match(source, /normalizedDiagnosisDate/u)
assert.match(source, /normalizedLocationKey/u)
console.log('environment weather query freshness contract passed data_mode=unit_fake')
