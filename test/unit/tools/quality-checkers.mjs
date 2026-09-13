/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  auditFunctionPathReferences,
  extractFunctionPathReferences,
  PROJECT_ROOT
} from '../../../scripts/qa/check-http-function-paths.mjs'
import { scanSensitiveLogs } from '../../../scripts/qa/check-sensitive-logs.mjs'

const sourcePath = path.join(PROJECT_ROOT, 'src/example/client.js')
const extracted = extractFunctionPathReferences(
  [
    "requestHttpFunction('weather-http/weather/current', {})",
    'requestHttpFunction(`plant-user-http/user-plants/items/${action}`, {})'
  ].join('\n'),
  sourcePath
)

assert.equal(extracted.references.length, 2)
assert.equal(extracted.references[1].unresolved, true)
const pathAudit = auditFunctionPathReferences(extracted.references, {
  functionNames: new Set(['weather-http', 'plant-user-http']),
  routesByFunction: new Map([
    ['weather-http', ['/weather/current']],
    ['plant-user-http', ['/user-plants']]
  ])
})
assert.deepEqual(pathAudit.violations, [])
assert.equal(pathAudit.unresolved.length, 1)
assert.deepEqual(
  auditFunctionPathReferences(
    [{ file: 'src/example/client.js', line: 3, rawPath: 'weather-http/weather/missing' }],
    {
      functionNames: new Set(['weather-http']),
      routesByFunction: new Map([['weather-http', ['/weather/current']]])
    }
  ).violations.map(violation => violation.code),
  ['route_not_declared']
)

const findings = scanSensitiveLogs(
  [
    "console.log('request', { body: request.body, headers: request.headers, token, sql: sql })",
    "console.warn('safe', { code: 'E', message: 'failed' })"
  ].join('\n'),
  path.join(PROJECT_ROOT, 'cloudfunctions/example/app.js')
)
assert.deepEqual(
  findings.map(finding => finding.code),
  ['request_headers', 'request_body', 'credential_field', 'raw_sql']
)

console.log('quality checker contracts passed data_mode=unit_fake')
