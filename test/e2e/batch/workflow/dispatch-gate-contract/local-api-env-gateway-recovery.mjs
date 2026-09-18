import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('scripts/dev/local-api-env-gateway.mjs', 'utf8')

assert.match(
  source,
  /async function resolveRepoLocalGatewayListenerPid\(port\)/,
  'stale recovery must inspect the listener owner before sending a signal'
)
assert.match(
  source,
  /cwd === PROJECT_ROOT \? listenerPid : ''/,
  'stale recovery must only stop a gateway whose cwd is this repository'
)
assert.match(
  source,
  /async function recoverUnresponsiveStaleGateway\(apiBaseUrl = '', options = \{\}\)/,
  'unresponsive listeners must have an explicit stale recovery branch'
)
assert.match(
  source,
  /LOCAL_GATEWAY_PORT_OCCUPIED_UNVERIFIED/,
  'unverified port owners must not be killed automatically'
)
assert.match(
  source,
  /LOCAL_GATEWAY_STALE_RECOVERY_PERMISSION_DENIED/,
  'signal permission failures must be reported as an actionable runtime blocker'
)
assert.match(
  source,
  /recoverUnresponsiveStaleGateway\(apiBaseUrl, options\)/,
  'not-running and timeout health failures must invoke stale recovery before bind'
)

process.stdout.write('local-api-env gateway stale recovery contract passed\n')
