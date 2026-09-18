import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  AUTOMATOR_FAST_PROBE_TARGET_CYCLES,
  AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS,
  AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS,
  AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS,
  AUTOMATOR_SOAK_ITERATION_BUDGET_MS,
  AUTOMATOR_SOAK_HEALTH_SAMPLES,
  parseSoakArgs,
  runAutomatorSoak
} from '../../../../../scripts/qa/automator-soak.mjs'

const IDENTITY = {
  runtime_key: 'a'.repeat(64),
  generation: 1,
  pid: 101,
  devtools_pid: 202,
  local_runtime_pid: 303,
  process_start_identity: 'soak-start-1',
  session_id: 'soak-session-1'
}

assert.equal(AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS, 20)
assert.equal(AUTOMATOR_FAST_PROBE_TARGET_CYCLES, 1000)
assert.equal(AUTOMATOR_SOAK_HEALTH_SAMPLES, 3)
assert.equal(AUTOMATOR_SOAK_ITERATION_BUDGET_MS, 5 * 60 * 1000)
assert.equal(parseSoakArgs(['--allow-live', '--dispatch-run-id=soak-contract-001']).coldStarts, 20)
assert.equal(
  parseSoakArgs(['--allow-live', '--dispatch-run-id=soak-contract-001']).fastProbes,
  1000
)
assert.throws(() =>
  parseSoakArgs(['--allow-live', '--cold-starts=3', '--dispatch-run-id=soak-contract-001'])
)
assert.throws(() =>
  parseSoakArgs(['--allow-live', '--fast-probes=2', '--dispatch-run-id=soak-contract-001'])
)
assert.equal(AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS, 10 * 60 * 1000)
assert.equal(AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS, 45 * 60 * 1000)

test('tiered reliability gate fails closed and cleans up on the first invalid doctor sample', async () => {
  const dispatchRunId = 'soak-contract-runner'
  const root = path.resolve(process.cwd(), `.tmp/dispatch-task/${dispatchRunId}`)
  fs.mkdirSync(root, { recursive: true })
  const calls = []
  const runner = (command, args, options) => {
    calls.push({ command, options })
    if (command === 'stop') {
      return { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
    }
    if (command === 'bootstrap') {
      return {
        status: 0,
        value: { status: 'ready', supervisor_state: IDENTITY }
      }
    }
    return {
      status: 0,
      value: {
        status: 'ready',
        code: 'qa_runtime_doctor_ready',
        ...IDENTITY,
        checks: {
          profile: { passed: true },
          channel: { passed: true },
          ownership: { passed: true },
          manifest: { passed: true },
          lan: { passed: true },
          preflight: {
            status: 'blocked',
            checks: {
              page_data: { passed: false },
              wx_request: { passed: false },
              screenshot: { passed: false }
            },
            evidence: { screenshot: null }
          }
        }
      }
    }
  }
  const report = await runAutomatorSoak({
    dispatchRunId,
    commandRunner: runner,
    now: (() => {
      let now = 0
      return () => (now += 1)
    })()
  })
  assert.equal(report.status, 'blocked')
  assert.equal(report.failed_iteration, 1)
  assert.equal(report.primary_failure.code, 'qa_stress_preflight_not_passed')
  assert.equal(calls.filter(item => item.command === 'bootstrap').length, 1)
  assert.equal(calls.at(-1).command, 'stop')
  assert.ok(
    calls.find(item => item.command === 'bootstrap').options.timeoutMs <=
      AUTOMATOR_SOAK_ITERATION_BUDGET_MS
  )
  fs.rmSync(root, { recursive: true, force: true })
})
