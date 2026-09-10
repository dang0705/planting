/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '../../../..')
const publicApps = [
  'cloudfunctions/plant-user-http/app.js',
  'cloudfunctions/plant-catalog-http/app.js',
  'cloudfunctions/identify-http/app.js',
  'cloudfunctions/diagnosis-history-http/app.js',
  'cloudfunctions/auth-user-http/app.js',
  'cloudfunctions/weather-http/app.js',
  'cloudfunctions/diagnose-http/app/http-router.js'
]

for (const relativePath of publicApps) {
  const source = readFileSync(resolve(projectRoot, relativePath), 'utf8')
  assert.match(
    source,
    /internalServerError\(/,
    `${relativePath} must use the shared safe error response`
  )
  assert.doesNotMatch(
    source,
    /message:\s*error\.message/,
    `${relativePath} must not send internal exception text to the client`
  )
}

console.log('public HTTP error boundary source contracts: passed')
