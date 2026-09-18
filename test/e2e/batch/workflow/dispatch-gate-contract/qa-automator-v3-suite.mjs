import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sourcePath = path.resolve(process.cwd(), 'scripts/qa/automator-v3-suite.mjs')
const source = fs.readFileSync(sourcePath, 'utf8')

test('v3 suite checks static gates before auth or QA-owned runtime', () => {
  const catalogWrite = source.indexOf('run.catalog_precondition = catalogPreconditionResult')
  const coverageWrite = source.indexOf(
    'run.business_coverage_precondition = businessCoveragePreconditionResult'
  )
  const authPreconditionWrite = source.indexOf('run.auth_precondition = authPrecondition')
  const bootstrap = source.indexOf("invokeRuntime('bootstrap', lease)")
  assert.ok(catalogWrite >= 0)
  assert.ok(coverageWrite >= 0)
  assert.ok(authPreconditionWrite >= 0)
  assert.ok(catalogWrite < authPreconditionWrite)
  assert.ok(coverageWrite < authPreconditionWrite)
  assert.ok(bootstrap > authPreconditionWrite)
  assert.match(source, /validateCatalog\(\)/u)
  assert.match(source, /ensureQaAuthAvailable\(\)/u)
})

test('v3 suite fails full completion fast on incomplete business coverage', () => {
  const coverageWrite = source.indexOf(
    'run.business_coverage_precondition = businessCoveragePreconditionResult'
  )
  const runtimeBootstrap = source.indexOf("invokeRuntime('bootstrap', lease)")
  assert.ok(coverageWrite >= 0)
  assert.ok(coverageWrite < runtimeBootstrap)
  assert.match(source, /catalogPreconditionResult\.status !== 'ready'/u)
  assert.match(source, /!infraOnly/u)
  assert.match(source, /qa_business_coverage_incomplete/u)
})

test('v3 suite exposes an explicit infrastructure-only diagnostic mode', () => {
  assert.match(source, /--infra-only/u)
  assert.match(source, /infrastructure_only_diagnostic/u)
  assert.match(source, /不得据此宣称拉起即用/u)
})

test('v3 suite documents post-bootstrap server validation as the auth contract', () => {
  assert.match(source, /Server validation is deliberately not required here/u)
  assert.match(source, /real mini-program/u)
  assert.match(source, /authenticated wx\.request probe/u)
  assert.match(source, /shared\.suiteBootstrap = bootstrap/u)
})

test('v3 suite records a current phase and bounds the initial auth probe', () => {
  assert.match(source, /current_phase:/u)
  assert.match(source, /deadline_at:/u)
  assert.match(source, /markPhase\('bootstrap'/u)
  assert.match(source, /markPhase\(name, 'running'/u)
  assert.match(source, /qa_auth_runtime_probe_setup_timeout/u)
  assert.match(source, /qa_auth_initial_runtime_probe_timeout/u)
})

test('v3 suite rejects a phase whose persisted auth ticket cannot cover its budget', () => {
  assert.match(source, /authPhaseFreshnessPrecondition/u)
  assert.match(source, /qa_auth_ticket_will_expire_during_\$\{phase\}/u)
  assert.match(source, /BOOTSTRAP_PHASE_TIMEOUT_MS \+ SUITE_PHASE_TIMEOUTS_MS\.auth/u)
  assert.match(source, /run\.phase_auth_preconditions/u)
  assert.match(source, /SUITE_PHASE_TIMEOUTS_MS\.live/u)
  assert.match(source, /SOAK_AUTH_FRESHNESS_WINDOW_MS/u)
})

test('v3 suite delegates a short ticket only to a verified daily owner', async () => {
  const { authPhaseFreshnessPrecondition } = await import(sourcePath)
  const identity = 'a'.repeat(64)
  const dailyRenewalState = {
    shared: { identityHash: identity },
    daily: {
      active: true,
      managed: true,
      capability_verified: true,
      owner_pid: 101,
      owner_start_identity: 'daily-start'
    }
  }
  const result = authPhaseFreshnessPrecondition('live', 2 * 60 * 60 * 1000, {
    now: 0,
    allowDelegatedDailyRenewal: true,
    dailyRenewalState,
    authState: {
      material_ready: true,
      code: 'qa_auth_ready',
      value: {
        auth_generation: 1,
        identity_hash: identity,
        ticket_expired_at: 5 * 60 * 1000,
        signature_expired_at: 5 * 60 * 1000
      }
    }
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.code, 'qa_auth_ticket_renewal_delegated_to_daily_runtime')
  assert.equal(result.renewal_mode, 'native_daily_official_tool_refresh_observed')
})

test('v3 suite still blocks a short ticket without a verified daily owner', async () => {
  const { authPhaseFreshnessPrecondition } = await import(sourcePath)
  const identity = 'a'.repeat(64)
  const result = authPhaseFreshnessPrecondition('live', 2 * 60 * 60 * 1000, {
    now: 0,
    allowDelegatedDailyRenewal: true,
    dailyRenewalState: {
      shared: { identityHash: identity },
      daily: {
        active: false,
        managed: false,
        capability_verified: false,
        owner_pid: null,
        owner_start_identity: null
      }
    },
    authState: {
      material_ready: true,
      code: 'qa_auth_ready',
      value: {
        auth_generation: 1,
        identity_hash: identity,
        ticket_expired_at: 5 * 60 * 1000,
        signature_expired_at: 5 * 60 * 1000
      }
    }
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.code, 'qa_auth_ticket_will_expire_during_live')
})

test('auth renewal guard accepts only a same-identity generation consumed by QA', async () => {
  const { createAuthRenewalGuard } = await import(
    path.resolve(process.cwd(), 'scripts/qa/automator-auth-renewal-guard.mjs')
  )
  const identity = 'a'.repeat(64)
  const qaPid = process.pid
  const { processStartIdentity } = await import(
    path.resolve(process.cwd(), 'scripts/qa/qa-auth-broker-core.mjs')
  )
  const qaStart = processStartIdentity(qaPid)
  let current = 0
  const state = () => {
    const generation = current === 0 ? 1 : 2
    const ticket = current === 0 ? 'ticket-1' : 'ticket-2'
    return {
      shared: {
        authGeneration: generation,
        identityHash: identity,
        newticket: ticket,
        ticketExpiredTime: 60_000,
        signatureExpiredTime: 60_000
      },
      daily: {
        active: true,
        managed: true,
        capability_verified: true,
        owner_pid: 101,
        owner_start_identity: 'daily-start'
      },
      qa: { profile: '/qa/profile' },
      consumption: {
        latest_by_role: {
          qa: {
            event_id: 'contract-qa-consumption-001',
            role: 'qa',
            source: 'shared_auth_merge',
            pid: qaPid,
            process_start_identity: qaStart,
            profile_realpath: '/qa/profile',
            auth_generation: generation,
            identity_hash: identity,
            ticket_hash: crypto.createHash('sha256').update(ticket).digest('hex'),
            consumed_at_ms: 0
          }
        }
      }
    }
  }
  const guard = createAuthRenewalGuard({
    readState: state,
    now: () => 0,
    minimumInitialRemainingMs: 1,
    graceMs: 30_000
  })
  assert.equal((await guard.check({ phase: 'live' })).status, 'healthy')
  current = 1
  assert.equal((await guard.check({ phase: 'live' })).status, 'renewed')
  assert.equal(guard.report().renewals.length, 1)
})

test('auth renewal command guard aborts quickly on a terminal auth failure', async () => {
  const { runCommandWithAuthHealthGuard } = await import(
    path.resolve(process.cwd(), 'scripts/qa/automator-auth-renewal-guard.mjs')
  )
  const result = await runCommandWithAuthHealthGuard({
    commandRunner: (_command, _args, { abortSignal }) =>
      new Promise(resolve => {
        abortSignal.addEventListener('abort', () => resolve({ status: null, aborted: true }), {
          once: true
        })
      }),
    command: 'contract-command',
    authHealthCheck: async () => ({
      status: 'blocked',
      code: 'qa_auth_renewal_not_observed_before_deadline'
    }),
    pollIntervalMs: 1
  })
  assert.equal(result.aborted_by_auth_watchdog, true)
  assert.equal(result.auth_watchdog_failure.code, 'qa_auth_renewal_not_observed_before_deadline')
})

test('v3 suite emits the phase failure before invoking a doomed long phase', async () => {
  const { authPhaseFreshnessPrecondition } = await import(sourcePath)
  const result = authPhaseFreshnessPrecondition('cold_start', 60_000, {
    now: 0,
    authState: {
      material_ready: true,
      code: 'qa_auth_ready',
      value: {
        auth_generation: 1,
        identity_hash: 'a'.repeat(64),
        ticket_expired_at: 90_000,
        signature_expired_at: 900_000
      }
    }
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.code, 'qa_auth_ticket_will_expire_during_cold_start')
})

test('full v3 suite fails live business blockers before the reliability gate', () => {
  const marker = source.indexOf(
    'Full completion runs validate the entire live catalog before starting'
  )
  const live = source.indexOf("markPhase('live', 'running'", marker)
  const soak = source.indexOf("markPhase('soak', 'running'", live)
  assert.ok(marker >= 0)
  assert.ok(live > marker)
  assert.ok(soak > live)
  assert.match(source, /A missing real fixture or a business leaf blocker must\n/u)
})

test('v3 suite phases have executable deadlines instead of display-only deadlines', () => {
  assert.match(source, /SUITE_PHASE_TIMEOUTS_MS/u)
  assert.match(source, /withTimeout\(\n\s*execute,/u)
  assert.match(source, /qa_v3_suite_\$\{name\}_phase_timeout/u)
  assert.match(source, /qa_v3_suite_live_phase_timeout/u)
})
