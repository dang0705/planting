import assert from 'node:assert/strict'
import { probeWxRequest } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'

const healthUrl = 'http://127.0.0.1:12345/__local_functions__/health'
const successfulSlot = '__dispatchQaWxRequest_test_success'
let successfulCallbacks
const originalWx = globalThis.wx
const forbiddenSerializedSyntax = [
  /=>/,
  /\.\.\./,
  /\?\./,
  /\?\?/,
  /function\s*\(\s*\{/,
  /\bconst\b/,
  /\blet\b/
]

function compatibilityMiniProgram(serializedSources) {
  return {
    evaluate: async function (callback) {
      const source = callback.toString()
      serializedSources.push(source)
      for (const pattern of forbiddenSerializedSyntax) {
        assert.doesNotMatch(source, pattern, `serialized evaluate callback must avoid ${pattern}`)
      }
      const args = Array.prototype.slice.call(arguments, 1)
      const serialized = new Function(`return (${source})`)()
      return serialized.apply(null, args)
    }
  }
}

globalThis.wx = {
  request: callbacks => {
    successfulCallbacks = callbacks
  }
}
try {
  const serializedSources = []
  const success = await probeWxRequest({
    miniProgram: compatibilityMiniProgram(serializedSources),
    url: healthUrl,
    slot: successfulSlot,
    timeoutMs: 1000,
    pollIntervalMs: 10,
    sleep: async () => {
      successfulCallbacks.success({ statusCode: 204 })
      successfulCallbacks.complete()
    }
  })
  assert.equal(success.passed, true)
  assert.equal(success.statusCode, 204)
  assert.equal(success.cleanup.passed, true)
  assert.equal(globalThis[successfulSlot], undefined, 'success path must clean the slot')
  assert.equal(serializedSources.length >= 4, true, 'start, poll, and cleanup must serialize')

  const rejectedSlot = '__dispatchQaWxRequest_test_rejected_status'
  const rejected = await probeWxRequest({
    miniProgram: compatibilityMiniProgram([]),
    url: healthUrl,
    slot: rejectedSlot,
    timeoutMs: 1000,
    pollIntervalMs: 10,
    sleep: async () => {
      successfulCallbacks.success({ statusCode: 503 })
      successfulCallbacks.complete()
    }
  })
  assert.equal(rejected.passed, false)
  assert.equal(rejected.statusCode, 503)
  assert.equal(rejected.cleanup.passed, true)
  assert.equal(globalThis[rejectedSlot], undefined, 'rejected-status path must clean the slot')

  const timeoutSlot = '__dispatchQaWxRequest_test_timeout'
  let timeoutClock = 0
  let timeoutEvaluateCalls = 0
  const timeout = await probeWxRequest({
    miniProgram: {
      evaluate: async function (callback) {
        timeoutEvaluateCalls += 1
        if (timeoutEvaluateCalls > 1 && timeoutEvaluateCalls < 6) {
          return null
        }
        return callback.apply(null, Array.prototype.slice.call(arguments, 1))
      }
    },
    url: healthUrl,
    slot: timeoutSlot,
    timeoutMs: 40,
    pollIntervalMs: 10,
    nowMs: () => timeoutClock,
    sleep: async delay => {
      timeoutClock += delay
    }
  })
  assert.equal(timeout.passed, false)
  assert.equal(timeout.timed_out, true)
  assert.equal(timeout.cleanup.passed, true)
  assert.equal(globalThis[timeoutSlot], undefined, 'timeout/null path must clean the slot')
} finally {
  if (originalWx === undefined) {
    delete globalThis.wx
  } else {
    globalThis.wx = originalWx
  }
}
