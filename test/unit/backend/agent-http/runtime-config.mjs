import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { isLocalGatewayRuntime } = require('../../../../cloudfunctions/agent-http/runtime-config.js')

test('local gateway accepts the launcher boolean flag', () => {
  assert.equal(isLocalGatewayRuntime('true'), true)
  assert.equal(isLocalGatewayRuntime('1'), true)
  assert.equal(isLocalGatewayRuntime('false'), false)
})
