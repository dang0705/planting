import assert from 'node:assert/strict'

import { runQaNodeCommand } from '../../../../../scripts/qa/qa-node-command.mjs'

const success = await runQaNodeCommand({
  command: process.execPath,
  args: ['-e', "process.stdout.write('qa-node-command-direct')"],
  cwd: process.cwd(),
  timeoutMs: 5_000
})

assert.equal(success.status, 0)
assert.equal(success.signal, null)
assert.equal(success.timedOut, false)
assert.equal(success.stdout, 'qa-node-command-direct')
assert.equal(success.stderr, '')

const failure = await runQaNodeCommand({
  command: process.execPath,
  args: ['-e', 'process.exitCode = 7'],
  cwd: process.cwd(),
  timeoutMs: 5_000
})

assert.equal(failure.status, 7)
assert.equal(failure.signal, null)
assert.equal(failure.timedOut, false)
