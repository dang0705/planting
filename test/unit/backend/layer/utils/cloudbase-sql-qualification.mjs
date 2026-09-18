import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { _test } = require('../../../../../cloudfunctions/layer/utils/cloudbase.js')

test('development SQL qualifies the Agent Web session table', () => {
  assert.equal(typeof _test.qualifySqlTableNames, 'function')
  assert.equal(
    _test.qualifySqlTableNames(
      'INSERT INTO agent_web_sessions (ticket_hash) VALUES ({{ticketHash}})',
      'cloud1_dev'
    ),
    'INSERT INTO `cloud1_dev`.`agent_web_sessions` (ticket_hash) VALUES ({{ticketHash}})'
  )
})
