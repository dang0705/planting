import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  evaluateAuthConcurrency,
  evaluateAuthContinuity,
  runAuthConcurrencyMatrixWithLease
} from '../../../../../scripts/qa/automator-auth-concurrency.mjs'

const IDENTITY = 'a'.repeat(64)
const base = {
  auth_mode: 'managed_daily_single_writer',
  daily: {
    active: true,
    managed: true,
    pids: [101],
    profile: '/tmp/daily-profile',
    identity_hash: IDENTITY,
    auth_material: {
      identity_hash: IDENTITY,
      signature_hash: 'signature-hash',
      ticket_hash: 'ticket-hash',
      ticket_expired_at: Date.now() + 60_000,
      signature_expired_at: Date.now() + 60_000
    },
    capability_verified: true,
    main_pid: 101,
    process_start_identity: 'daily-start',
    main_command:
      '/launcher.app/Contents/MacOS/wechatdevtools --ide-http-port 9423 --remote-port 3798'
  },
  qa: {
    active: true,
    pids: [202],
    profile: '/tmp/qa-profile',
    identity_hash: IDENTITY,
    auth_material: {
      identity_hash: IDENTITY,
      signature_hash: 'signature-hash',
      ticket_hash: 'ticket-hash',
      ticket_expired_at: Date.now() + 60_000,
      signature_expired_at: Date.now() + 60_000
    },
    auth_material_source: 'broker_effective_shared',
    main_pid: 202,
    process_start_identity: 'qa-start',
    bundle_verified: true,
    auth_manifest: { runtime_ready: true, auth_generation: 3, identity_hash: IDENTITY },
    main_command:
      '/launcher.app/Contents/MacOS/wechatdevtools --ide-http-port 9422 --remote-port 3799'
  },
  shared: {
    identity_hash: IDENTITY,
    auth_material: {
      identity_hash: IDENTITY,
      signature_hash: 'signature-hash',
      ticket_hash: 'ticket-hash',
      ticket_expired_at: Date.now() + 60_000,
      signature_expired_at: Date.now() + 60_000
    },
    auth_generation: 3,
    source_role: 'daily',
    writer_role: 'qa-auth-broker',
    updated_at_ms: Date.now() - 1000,
    ticket_expired_at: Date.now() + 60_000,
    signature_expired_at: Date.now() + 60_000
  },
  ports: {
    daily: { control: 9423, service: 3798, listeners: { control: [101], service: [101] } },
    qa: { control: 9422, service: 3799, listeners: { control: [202], service: [202] } },
    ownership: { daily: true, qa: true }
  },
  broker: { daily_capability_verified: true, auth_generation: 3 }
}

base.auth_consumption = {
  event_id: 'fixture-qa-consumption-001',
  role: 'qa',
  source: 'shared_auth_merge',
  pid: 202,
  process_start_identity: 'qa-start',
  profile_realpath: '/tmp/qa-profile',
  auth_generation: 3,
  identity_hash: IDENTITY,
  ticket_hash: 'ticket-hash',
  consumed_at_ms: Date.now()
}

test('same-account concurrent auth requires managed daily single writer and distinct identities', () => {
  assert.deepEqual(evaluateAuthConcurrency(base), { passed: true, failures: [] })
  const native = { ...base, auth_mode: 'native_daily_read_only' }
  assert.equal(evaluateAuthConcurrency(native).passed, false)
  assert.equal(
    evaluateAuthConcurrency(native).failures[0].code,
    'qa_auth_concurrency_requires_managed_daily'
  )
})

test('same-account concurrent auth rejects shared profile, identity, port, or stale ticket', () => {
  for (const mutation of [
    { daily: { ...base.daily, profile: base.qa.profile } },
    { qa: { ...base.qa, identity_hash: 'b'.repeat(64) } },
    {
      qa: {
        ...base.qa,
        auth_material: { ...base.qa.auth_material, ticket_hash: 'stale-ticket' }
      }
    },
    { ports: { ...base.ports, ownership: { daily: false, qa: true } } },
    { shared: { ...base.shared, ticket_expired_at: Date.now() - 1 } }
  ]) {
    assert.equal(evaluateAuthConcurrency({ ...base, ...mutation }).passed, false)
  }
  assert.equal(
    evaluateAuthConcurrency({ ...base, qa: { ...base.qa, bundle_verified: false } }).failures[0]
      .code,
    'qa_auth_concurrency_qa_bundle_unverified'
  )
})

test('expired daily observation fails as incomplete auth, not as an identity takeover', () => {
  const expiredDaily = {
    ...base,
    daily: {
      ...base.daily,
      identity_hash: null,
      auth_material_source: null,
      auth_material: {
        identity_hash: null,
        signature_hash: null,
        ticket_hash: null,
        ticket_expired_at: Date.now() - 1,
        signature_expired_at: Date.now() - 1
      }
    },
    shared: {
      ...base.shared,
      ticket_expired_at: Date.now() - 1,
      signature_expired_at: Date.now() - 1
    }
  }
  const result = evaluateAuthConcurrency(expiredDaily)
  assert.ok(
    result.failures.some(
      failure => failure.code === 'qa_auth_concurrency_identity_observation_incomplete'
    )
  )
  assert.equal(
    result.failures.some(failure => failure.code === 'qa_auth_concurrency_identity_mismatch'),
    false
  )
})

test('auth continuity rejects generation regression and unbound generation changes', () => {
  const baselineIdentity = evaluateAuthContinuity(base).identity
  const regressed = {
    ...base,
    shared: { ...base.shared, auth_generation: 2 },
    qa: { ...base.qa, auth_manifest: { ...base.qa.auth_manifest, auth_generation: 2 } },
    broker: { ...base.broker, auth_generation: 2 }
  }
  const regression = evaluateAuthContinuity(regressed, baselineIdentity, 3)
  assert.ok(
    regression.failures.some(failure => failure.code === 'qa_auth_continuity_generation_regressed')
  )

  const changed = {
    ...base,
    shared: {
      ...base.shared,
      auth_generation: 4,
      updated_at_ms: Date.now()
    },
    qa: { ...base.qa, auth_manifest: { ...base.qa.auth_manifest, auth_generation: 4 } },
    broker: { ...base.broker, auth_generation: 4 }
  }
  const rotated = evaluateAuthContinuity(changed, baselineIdentity, 3)
  assert.ok(
    rotated.failures.some(
      failure => failure.code === 'qa_auth_continuity_generation_consumption_unverified'
    )
  )

  const consumed = evaluateAuthContinuity(
    {
      ...changed,
      auth_consumption: {
        ...base.auth_consumption,
        auth_generation: 4,
        consumed_at_ms: Date.now() + 1000
      }
    },
    baselineIdentity,
    3
  )
  assert.equal(
    consumed.failures.some(
      failure => failure.code === 'qa_auth_continuity_generation_consumption_unverified'
    ),
    false
  )

  const unbound = evaluateAuthContinuity(
    {
      ...changed,
      auth_consumption: {
        ...base.auth_consumption,
        process_start_identity: 'other-qa-start'
      }
    },
    baselineIdentity,
    3
  )
  assert.ok(
    unbound.failures.some(
      failure => failure.code === 'qa_auth_continuity_generation_consumption_unverified'
    )
  )
})

test('auth continuity probes immediately when the shared generation rotates', async () => {
  let captures = 0
  let clock = 0
  const probeReasons = []
  const rotated = {
    ...base,
    daily: {
      ...base.daily,
      auth_material: {
        ...base.daily.auth_material,
        signature_hash: 'signature-hash-rotated',
        ticket_hash: 'ticket-hash-rotated'
      }
    },
    qa: {
      ...base.qa,
      auth_material: {
        ...base.qa.auth_material,
        signature_hash: 'signature-hash-rotated',
        ticket_hash: 'ticket-hash-rotated'
      },
      auth_manifest: { ...base.qa.auth_manifest, auth_generation: 4 }
    },
    shared: {
      ...base.shared,
      auth_material: {
        ...base.shared.auth_material,
        signature_hash: 'signature-hash-rotated',
        ticket_hash: 'ticket-hash-rotated'
      },
      auth_generation: 4,
      updated_at_ms: Date.now()
    },
    broker: { ...base.broker, auth_generation: 4 },
    auth_consumption: {
      ...base.auth_consumption,
      auth_generation: 4,
      signature_hash: 'signature-hash-rotated',
      ticket_hash: 'ticket-hash-rotated',
      consumed_at_ms: Date.now() + 1000
    }
  }
  const report = await runAuthConcurrencyMatrixWithLease({
    samples: 3,
    intervalMs: 250,
    continuity: true,
    dispatchRunId: 'auth-continuity-generation-rotation-001',
    now: () => clock,
    capture: () => {
      captures += 1
      return captures < 5 ? base : rotated
    },
    continuityProbe: async details => {
      probeReasons.push(details.reason)
      return {
        status: 'passed',
        code: 'qa_auth_runtime_probe_passed',
        generation: details.expectedGeneration || 4,
        identity_hash: IDENTITY
      }
    },
    sleep: async duration => {
      clock += duration
    }
  })
  assert.equal(report.status, 'passed')
  assert.ok(probeReasons.includes('shared_auth_generation_rotated'))
  fs.rmSync(
    path.resolve(process.cwd(), '.tmp/dispatch-task/auth-continuity-generation-rotation-001'),
    {
      recursive: true,
      force: true
    }
  )
})

test('auth continuity waits for a bounded generation-consumption acknowledgement', async () => {
  let captures = 0
  let clock = 0
  const rotatedMaterial = {
    ...base.shared.auth_material,
    signature_hash: 'signature-hash-rotated-bounded',
    ticket_hash: 'ticket-hash-rotated-bounded'
  }
  const rotatedPending = {
    ...base,
    daily: {
      ...base.daily,
      auth_material: rotatedMaterial
    },
    qa: {
      ...base.qa,
      auth_material: rotatedMaterial,
      auth_manifest: { ...base.qa.auth_manifest, auth_generation: 4, runtime_ready: false }
    },
    shared: {
      ...base.shared,
      auth_material: rotatedMaterial,
      auth_generation: 4,
      updated_at_ms: Date.now()
    },
    broker: { ...base.broker, auth_generation: 4 },
    auth_consumption: base.auth_consumption
  }
  const rotatedReady = {
    ...rotatedPending,
    qa: {
      ...rotatedPending.qa,
      auth_manifest: { ...rotatedPending.qa.auth_manifest, runtime_ready: true }
    },
    auth_consumption: {
      ...base.auth_consumption,
      auth_generation: 4,
      signature_hash: rotatedMaterial.signature_hash,
      ticket_hash: rotatedMaterial.ticket_hash,
      consumed_at_ms: Date.now() + 1000
    }
  }
  const report = await runAuthConcurrencyMatrixWithLease({
    samples: 3,
    intervalMs: 250,
    continuity: true,
    dispatchRunId: 'auth-continuity-generation-consumption-wait-001',
    now: () => clock,
    capture: () => {
      captures += 1
      if (captures <= 4) {
        return base
      }
      if (captures <= 8) {
        return rotatedPending
      }
      return rotatedReady
    },
    continuityProbe: async details => ({
      status: 'passed',
      code: 'qa_auth_runtime_probe_passed',
      generation: details.expectedGeneration || 4,
      identity_hash: IDENTITY
    }),
    sleep: async duration => {
      clock += duration
    }
  })
  assert.equal(report.status, 'passed')
  assert.equal(report.continuity.samples[0].generation_transition_wait, null)
  const transitionSample = report.continuity.samples.find(sample => sample.auth_generation === 4)
  assert.equal(transitionSample.generation_transition_wait.status, 'passed')
  assert.ok(transitionSample.generation_transition_wait.waited_ms >= 3000)
  fs.rmSync(
    path.resolve(
      process.cwd(),
      '.tmp/dispatch-task/auth-continuity-generation-consumption-wait-001'
    ),
    { recursive: true, force: true }
  )
})

test('auth continuity accepts a probe that observes a newer generation than its sample', async () => {
  let captures = 0
  let clock = 0
  const report = await runAuthConcurrencyMatrixWithLease({
    samples: 3,
    intervalMs: 250,
    continuity: true,
    dispatchRunId: 'auth-continuity-probe-newer-generation-001',
    now: () => clock,
    capture: () => {
      captures += 1
      return base
    },
    continuityProbe: async () => ({
      status: 'passed',
      code: 'qa_auth_runtime_probe_passed',
      generation: 4,
      identity_hash: IDENTITY
    }),
    sleep: async duration => {
      clock += duration
    }
  })
  assert.equal(report.status, 'passed')
  assert.equal(report.continuity.runtime_probe_count, 30)
  assert.ok(
    report.continuity.samples
      .filter(sample => sample.runtime_probe?.status === 'passed')
      .every(sample => sample.runtime_probe.generation >= sample.auth_generation)
  )
  fs.rmSync(
    path.resolve(process.cwd(), '.tmp/dispatch-task/auth-continuity-probe-newer-generation-001'),
    { recursive: true, force: true }
  )
})

test('auth continuity fails the pending probe drain within its completion grace', async () => {
  let clock = 0
  const report = await runAuthConcurrencyMatrixWithLease({
    samples: 3,
    intervalMs: 250,
    continuity: true,
    runtimeProbeTimeoutMs: 1000,
    completionGraceMs: 10,
    dispatchRunId: 'auth-continuity-probe-drain-timeout-001',
    now: () => clock,
    capture: () => base,
    continuityProbe: () => new Promise(() => {}),
    sleep: async duration => {
      clock += duration
    }
  })
  assert.equal(report.status, 'blocked')
  assert.equal(report.primary_failure.code, 'qa_auth_continuity_runtime_probe_drain_timeout')
  assert.equal(report.continuity.completion_grace_ms, 10)
  fs.rmSync(
    path.resolve(process.cwd(), '.tmp/dispatch-task/auth-continuity-probe-drain-timeout-001'),
    { recursive: true, force: true }
  )
})

test('runtime auth probe promotes only a real authenticated request to server validation', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/qa/automator-auth-runtime-probe.mjs'),
    'utf8'
  )
  assert.match(source, /recordQaAuthServerValidation/u)
  assert.match(source, /request\?\.identity_resolved === true/u)
  assert.match(source, /qaConsumptionAck\.status === 'passed'/u)
  assert.match(source, /qa_auth_runtime_probe_real_wx_request/u)
})

test('auth concurrency matrix samples exactly three times and preserves terminal evidence', async () => {
  let captures = 0
  let sleeps = 0
  const report = await runAuthConcurrencyMatrixWithLease({
    samples: 3,
    intervalMs: 250,
    dispatchRunId: 'auth-concurrency-contract-001',
    capture: () => {
      captures += 1
      return base
    },
    sleep: async () => {
      sleeps += 1
    }
  })
  assert.equal(report.status, 'passed')
  assert.equal(captures, 3)
  assert.equal(sleeps, 2)
  assert.equal(report.samples.length, 3)
  assert.ok(fs.existsSync(path.join(report.output_directory, 'auth-concurrency-report.json')))
  fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/auth-concurrency-contract-001'), {
    recursive: true,
    force: true
  })
})

test('auth continuity requires the fixed long control-plane window', async () => {
  let captures = 0
  let sleeps = 0
  let clock = 0
  const report = await runAuthConcurrencyMatrixWithLease({
    samples: 3,
    intervalMs: 250,
    continuity: true,
    dispatchRunId: 'auth-continuity-contract-001',
    now: () => clock,
    capture: () => {
      captures += 1
      return base
    },
    continuityProbe: async ({ previousGeneration }) => ({
      status: 'passed',
      code: 'qa_auth_runtime_probe_passed',
      generation: previousGeneration || 3,
      identity_hash: IDENTITY
    }),
    sleep: async duration => {
      sleeps += 1
      clock += duration
    }
  })
  assert.equal(report.status, 'passed')
  assert.equal(report.continuity.status, 'passed')
  assert.equal(report.continuity.samples.length, 300)
  assert.equal(report.continuity.duration_ms, 30 * 60 * 1000)
  assert.equal(captures, 303)
  assert.equal(sleeps, 302)
  assert.equal(evaluateAuthContinuity(base, report.continuity.baseline_identity).passed, true)
  fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/auth-continuity-contract-001'), {
    recursive: true,
    force: true
  })
})

test('auth continuity accepts fixed-cadence tail drift inside completion grace', async () => {
  let captures = 0
  let clock = 0
  let continuitySleeps = 0
  const report = await runAuthConcurrencyMatrixWithLease({
    samples: 3,
    intervalMs: 250,
    continuity: true,
    dispatchRunId: 'auth-continuity-tail-drift-001',
    now: () => clock,
    capture: () => {
      captures += 1
      return base
    },
    continuityProbe: async ({ previousGeneration }) => ({
      status: 'passed',
      code: 'qa_auth_runtime_probe_passed',
      generation: previousGeneration || 3,
      identity_hash: IDENTITY
    }),
    sleep: async duration => {
      clock += duration
      if (duration === 6000) {
        continuitySleeps += 1
        if (continuitySleeps === 300) {
          clock += 1000
        }
      }
    }
  })
  assert.equal(report.status, 'passed')
  assert.equal(report.continuity.samples.length, 300)
  assert.equal(report.continuity.duration_ms, 30 * 60 * 1000 + 1000)
  fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/auth-continuity-tail-drift-001'), {
    recursive: true,
    force: true
  })
})
