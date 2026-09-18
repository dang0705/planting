import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  AUTOMATOR_STRESS_HEALTH_SAMPLES,
  AUTOMATOR_STRESS_TARGET_ATTEMPTS,
  evaluateDoctorSample,
  isValidPng,
  parseStressArgs,
  resolveStressOutputDirectory,
  runAutomatorStress
} from '../../../../../scripts/qa/automator-stress.mjs'

assert.equal(AUTOMATOR_STRESS_TARGET_ATTEMPTS, 3)
assert.equal(AUTOMATOR_STRESS_HEALTH_SAMPLES, 3)
assert.deepEqual(parseStressArgs(['--attempts=3', '--dispatch-run-id=stress-contract-001']), {
  attempts: 3,
  healthSamples: 3,
  dispatchRunId: 'stress-contract-001',
  outputDirectory: path.resolve(
    process.cwd(),
    '.tmp/dispatch-task/stress-contract-001/qa-artifacts/automator-stress'
  )
})
assert.throws(() => parseStressArgs(['--attempts=2', '--dispatch-run-id=stress-contract-001']))
assert.throws(() => parseStressArgs(['--attempts=4', '--dispatch-run-id=stress-contract-001']))
assert.throws(() => parseStressArgs(['--attempts=0', '--dispatch-run-id=stress-contract-001']))
assert.throws(() =>
  parseStressArgs(['--attempts=invalid', '--dispatch-run-id=stress-contract-001'])
)
assert.throws(() =>
  parseStressArgs(['--health-samples=2', '--dispatch-run-id=stress-contract-001'])
)
assert.throws(() =>
  parseStressArgs(['--output-dir=/tmp/out', '--dispatch-run-id=stress-contract-001'])
)
assert.throws(() => resolveStressOutputDirectory('/tmp/out', 'stress-contract-001'))

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-automator-stress-contract-'))
const pngPath = path.join(root, 'first.png')
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  let crc = 0xffffffff
  for (const byte of body) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, body, checksum])
}
fs.writeFileSync(
  pngPath,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
    pngChunk('IEND', Buffer.alloc(0))
  ])
)
assert.equal(isValidPng(pngPath), true)
assert.equal(isValidPng(path.join(root, 'missing.png')), false)

function readyReport(overrides = {}) {
  return {
    status: 'ready',
    code: 'qa_runtime_doctor_ready',
    supervisor_state: {
      runtime_key: 'a'.repeat(32),
      generation: 4,
      pid: 100,
      devtools_pid: 200,
      local_runtime_pid: 300,
      process_start_identity: 'start-1',
      session_id: 'session-1'
    },
    checks: {
      profile: { passed: true },
      channel: { passed: true },
      ownership: { passed: true },
      manifest: { passed: true },
      lan: { passed: true },
      preflight: {
        status: 'passed',
        checks: {
          project_identity: { passed: true },
          page_data: { passed: true },
          wx_request: { passed: true, identity_required: true, identity_resolved: true },
          screenshot: { passed: true },
          renderer_screenshot_attempts: [{ attempt: 1, status: 'passed' }]
        },
        targeted_restart: { attempted: false }
      }
    },
    evidence: { screenshot: pngPath },
    ...overrides
  }
}

const first = evaluateDoctorSample({ report: readyReport() })
assert.equal(first.passed, true)
const same = evaluateDoctorSample({ report: readyReport(), expectedIdentity: first.identity })
assert.equal(same.passed, true)
const retriedScreenshot = evaluateDoctorSample({
  report: readyReport({
    checks: {
      ...readyReport().checks,
      preflight: {
        ...readyReport().checks.preflight,
        checks: {
          ...readyReport().checks.preflight.checks,
          renderer_screenshot_attempts: [
            { attempt: 1, status: 'failed' },
            { attempt: 2, status: 'passed' }
          ]
        }
      }
    }
  })
})
assert.equal(retriedScreenshot.passed, false)
assert.ok(
  retriedScreenshot.failures.some(
    item => item.code === 'qa_stress_first_screenshot_attempt_not_proven'
  )
)
const changed = evaluateDoctorSample({
  report: readyReport({
    supervisor_state: { runtime_key: 'b'.repeat(32), generation: 5, pid: 101, devtools_pid: 201 }
  }),
  expectedIdentity: first.identity
})
assert.equal(changed.passed, false)
assert.ok(changed.failures.some(item => item.code === 'qa_stress_runtime_identity_changed'))
const recovered = evaluateDoctorSample({
  report: readyReport({
    checks: {
      profile: { passed: true },
      channel: { passed: true },
      ownership: { passed: true },
      manifest: { passed: true },
      lan: { passed: true },
      preflight: {
        status: 'passed',
        checks: {
          page_data: { passed: true },
          wx_request: { passed: true, identity_required: true, identity_resolved: true },
          screenshot: { passed: true },
          renderer_screenshot_attempts: [{ attempt: 1, status: 'passed' }]
        },
        targeted_restart: { attempted: true }
      }
    }
  })
})
assert.equal(recovered.passed, false)
assert.ok(recovered.failures.some(item => item.code === 'qa_stress_recovery_used'))
const bootstrapRecovered = evaluateDoctorSample({
  report: readyReport({
    supervisor_state: {
      ...readyReport().supervisor_state,
      bootstrap_preflight: { targeted_restart: { attempted: true } }
    }
  })
})
assert.equal(bootstrapRecovered.passed, false)
assert.ok(bootstrapRecovered.failures.some(item => item.code === 'qa_stress_recovery_used'))

const stressOutput = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/stress-contract-runner/qa-artifacts/automator-stress'
)
const stressCalls = []
let activeGeneration = 0
let activeAttempt = 0
const fakeCommandRunner = command => {
  stressCalls.push(command)
  if (command === 'stop') {
    return { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
  }
  if (command === 'bootstrap') {
    activeAttempt += 1
    activeGeneration = 1
    return {
      status: 0,
      value: {
        status: 'ready',
        code: 'qa_bootstrap_ready',
        supervisor: {
          runtime_key: 'a'.repeat(32),
          generation: activeGeneration,
          pid: 100 + activeAttempt,
          devtools_pid: 200 + activeAttempt,
          local_runtime_pid: 300 + activeAttempt,
          process_start_identity: `start-${activeAttempt}`,
          session_id: `session-${activeAttempt}`
        }
      }
    }
  }
  return {
    status: 0,
    value: readyReport({
      supervisor_state: {
        runtime_key: 'a'.repeat(32),
        generation: activeGeneration,
        pid: 100 + activeAttempt,
        devtools_pid: 200 + activeAttempt,
        local_runtime_pid: 300 + activeAttempt,
        process_start_identity: `start-${activeAttempt}`,
        session_id: `session-${activeAttempt}`
      }
    })
  }
}
const stressRun = await runAutomatorStress({
  attempts: 3,
  healthSamples: 3,
  dispatchRunId: 'stress-contract-runner',
  outputDirectory: stressOutput,
  commandRunner: fakeCommandRunner,
  now: (() => {
    let time = 1_000
    return () => (time += 1_000)
  })()
})
assert.equal(stressRun.status, 'passed')
assert.equal(stressRun.dispatch_run_id, 'stress-contract-runner')
assert.equal(stressRun.completed_attempts, 3)
assert.deepEqual(stressCalls, [
  'stop',
  'bootstrap',
  'doctor',
  'doctor',
  'doctor',
  'stop',
  'bootstrap',
  'doctor',
  'doctor',
  'doctor',
  'stop',
  'bootstrap',
  'doctor',
  'doctor',
  'doctor',
  'stop'
])
fs.rmSync(stressOutput, { recursive: true, force: true })

const thrownOutput = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/stress-contract-thrown/qa-artifacts/automator-stress'
)
const thrownCalls = []
const throwingRunner = command => {
  thrownCalls.push(command)
  if (command === 'stop') {
    return { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
  }
  if (command === 'bootstrap') {
    throw new Error('synthetic bootstrap runner failure')
  }
  throw new Error(`unexpected command: ${command}`)
}
const thrownRun = await runAutomatorStress({
  attempts: 3,
  healthSamples: 3,
  dispatchRunId: 'stress-contract-thrown',
  outputDirectory: thrownOutput,
  commandRunner: throwingRunner
})
assert.equal(thrownRun.status, 'failed')
assert.equal(thrownRun.primary_failure.code, 'qa_stress_command_threw')
assert.deepEqual(thrownCalls, ['stop', 'bootstrap', 'stop'])
fs.rmSync(thrownOutput, { recursive: true, force: true })

fs.rmSync(root, { recursive: true, force: true })
console.log('Automator cold-start stress contract passed')
