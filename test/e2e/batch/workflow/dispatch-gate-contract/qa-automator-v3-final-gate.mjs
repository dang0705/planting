import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import test from 'node:test'

import { isValidPngEvidence } from '../../../../../scripts/qa/qa-png-evidence.mjs'
import {
  AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES,
  AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES
} from '../../../../../scripts/qa/automator-auth-concurrency.mjs'
import {
  AUTOMATOR_V3_AUTH_SAMPLES,
  AUTOMATOR_V3_COLD_STARTS,
  AUTOMATOR_V3_DOCTOR_SAMPLES,
  AUTOMATOR_V3_LIVE_RUNS,
  AUTOMATOR_V3_LIVE_LEAF_COUNT,
  AUTOMATOR_V3_LIVE_REPEAT_COUNT,
  AUTOMATOR_V3_FAST_PROBE_CYCLES,
  AUTOMATOR_V3_RELIABILITY_COLD_STARTS,
  AUTOMATOR_V3_WARM_RUNS,
  AUTOMATOR_V3_WARM_CATALOG_IDS,
  validateAutomatorV3BusinessCoverage,
  validateAutomatorV3FinalGateManifest,
  validateAutomatorV3FinalGateReports
} from '../../../../../scripts/qa/automator-v3-final-gate.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-automator-v3-final-gate-'))
const artifactRoot = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/final-gate-contract-001/qa-artifacts/run-instance-contract-001'
)
fs.mkdirSync(artifactRoot, { recursive: true })
const catalogEntries = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'test/e2e/automator/catalog.json'), 'utf8')
).entries.filter(entry => entry.data_mode === 'automator_live_real_api')
const liveIds = catalogEntries.map(entry => entry.id).sort()
assert.equal(liveIds.length, AUTOMATOR_V3_LIVE_LEAF_COUNT)
assert.equal(AUTOMATOR_V3_LIVE_RUNS, liveIds.length * AUTOMATOR_V3_LIVE_REPEAT_COUNT)
const identity = 'a'.repeat(64)
const capturedAt = new Date().toISOString()
const dispatchRunId = 'final-gate-contract-001'
const runInstanceId = 'run-instance-contract-001'
const pngPath = path.join(artifactRoot, 'first.png')
function pngChunk(type, data) {
  const value = Buffer.from(type)
  const body = Buffer.concat([value, data])
  let crc = 0xffffffff
  for (const byte of body) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  return Buffer.concat([length, body, checksum])
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
  pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
  pngChunk('IEND', Buffer.alloc(0))
])
fs.writeFileSync(pngPath, png)
assert.equal(isValidPngEvidence(pngPath), true)

function passingLeafReportPath(catalogId) {
  const safeCatalogId = String(catalogId).replace(/[^A-Za-z0-9._-]/gu, '_')
  const assertions = catalogEntries
    .find(entry => entry.id === catalogId)
    .required_assertions.map(name => ({ name, passed: true, evidence: 'contract' }))
  const reportPath = path.join(artifactRoot, `${safeCatalogId}.leaf-report.json`)
  const catalogEntry = catalogEntries.find(entry => entry.id === catalogId)
  const requiresScreenshot = catalogEntry.requirements?.screenshot !== false
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({
      status: 'passed',
      classification: 'PASS',
      business_assertions_reached: true,
      screenshots: requiresScreenshot ? [{ path: pngPath }] : [],
      screenshot_attempts: requiresScreenshot
        ? [{ label: 'contract', attempts: [{ attempt: 1, status: 'passed' }] }]
        : [],
      assertions
    })}\n`
  )
  return path.relative(process.cwd(), reportPath)
}

function passingAssertions(catalogId) {
  return catalogEntries
    .find(entry => entry.id === catalogId)
    .required_assertions.map(name => ({ name, passed: true, evidence: 'contract' }))
}

const authSample = {
  passed: true,
  failures: [],
  observed: {
    captured_at: capturedAt,
    auth_mode: 'managed_daily_single_writer',
    daily: {
      active: true,
      managed: true,
      capability_verified: true,
      main_pid: 101,
      pids: [101],
      main_command: 'wechatdevtools --ide-http-port 9423 --remote-port 3798',
      profile: '/daily/profile',
      identity_hash: identity,
      process_start_identity: 'daily-start',
      auth_material: {
        identity_hash: identity,
        signature_hash: 'signature-hash',
        ticket_hash: 'ticket-hash',
        ticket_expired_at: Date.parse(capturedAt) + 60_000,
        signature_expired_at: Date.parse(capturedAt) + 60_000
      }
    },
    qa: {
      active: true,
      pids: [202],
      main_pid: 202,
      main_command: 'wechatdevtools --ide-http-port 9422 --remote-port 3799',
      profile: '/qa/profile',
      identity_hash: identity,
      process_start_identity: 'qa-start',
      bundle_verified: true,
      auth_material: {
        identity_hash: identity,
        signature_hash: 'signature-hash',
        ticket_hash: 'ticket-hash',
        ticket_expired_at: Date.parse(capturedAt) + 60_000,
        signature_expired_at: Date.parse(capturedAt) + 60_000
      },
      auth_material_source: 'broker_effective_shared',
      auth_manifest: { runtime_ready: true, auth_generation: 1, identity_hash: identity }
    },
    shared: {
      identity_hash: identity,
      auth_material: {
        identity_hash: identity,
        signature_hash: 'signature-hash',
        ticket_hash: 'ticket-hash',
        ticket_expired_at: Date.parse(capturedAt) + 60_000,
        signature_expired_at: Date.parse(capturedAt) + 60_000
      },
      auth_generation: 1,
      source_role: 'daily',
      writer_role: 'qa-auth-broker',
      updated_at_ms: Date.parse(capturedAt),
      ticket_expired_at: Date.parse(capturedAt) + 60_000,
      signature_expired_at: Date.parse(capturedAt) + 60_000
    },
    ports: {
      daily: { control: 9423, service: 3798 },
      qa: { control: 9422, service: 3799 },
      ownership: { daily: true, qa: true }
    },
    auth_consumption: {
      event_id: 'fixture-qa-consumption-001',
      role: 'qa',
      source: 'shared_auth_merge',
      pid: 202,
      process_start_identity: 'qa-start',
      profile_realpath: '/qa/profile',
      auth_generation: 1,
      identity_hash: identity,
      ticket_hash: 'ticket-hash',
      consumed_at_ms: Date.parse(capturedAt)
    }
  }
}

const authContinuity = {
  status: 'passed',
  required_duration_ms: 30 * 60 * 1000,
  required_samples: 300,
  runtime_probe_interval_samples: AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES,
  required_runtime_probes: AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES,
  runtime_probe_count: AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES,
  duration_ms: 30 * 60 * 1000,
  baseline_identity: {
    auth_mode: 'managed_daily_single_writer',
    daily_profile: '/daily/profile',
    qa_profile: '/qa/profile',
    daily_main_pid: 101,
    qa_main_pid: 202,
    daily_process_start_identity: 'daily-start',
    qa_process_start_identity: 'qa-start',
    daily_identity_hash: identity,
    qa_identity_hash: identity,
    shared_identity_hash: identity,
    daily_control_port: 9423,
    daily_service_port: 3798,
    qa_control_port: 9422,
    qa_service_port: 3799,
    qa_auth_material_source: 'broker_effective_shared',
    auth_writer_role: 'qa-auth-broker'
  },
  samples: []
}
authContinuity.samples = Array.from({ length: 300 }, (_, index) => ({
  passed: true,
  identity: authContinuity.baseline_identity,
  auth_generation: 1,
  updated_at_ms: Date.parse(capturedAt),
  auth_consumption: {
    event_id: 'fixture-qa-consumption-001',
    role: 'qa',
    source: 'shared_auth_merge',
    auth_generation: 1,
    consumed_at_ms: Date.parse(capturedAt)
  },
  runtime_probe:
    (index + 1) % AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES === 0
      ? {
          status: 'passed',
          generation: 1,
          identity_hash: identity,
          daily_runtime: {
            status: 'passed',
            managed: true,
            identity_required: true,
            identity_resolved: true,
            cleanup_passed: true,
            auth_consumption_ack: { status: 'passed' },
            response_code: 200,
            main_pid: 101
          }
        }
      : null
}))

function passingPreflight() {
  return {
    status: 'passed',
    evidence: { screenshot: pngPath },
    checks: {
      project_identity: { passed: true },
      page_data: { passed: true },
      wx_request: { passed: true, identity_required: true, identity_resolved: true },
      screenshot: { passed: true, path: pngPath },
      renderer_screenshot_attempts: [{ attempt: 1, status: 'passed' }]
    },
    targeted_restart: { attempted: false }
  }
}

function passingQa(catalogId) {
  const catalogEntry = catalogEntries.find(entry => entry.id === catalogId)
  const requiresScreenshot = catalogEntry.requirements?.screenshot !== false
  return {
    status: 0,
    value: {
      status: 'passed',
      dispatch_run_id: dispatchRunId,
      run_instance_id: runInstanceId,
      catalog_id: catalogId,
      data_mode: 'automator_live_real_api',
      auth_mode: 'persisted_real_wechat',
      mutation_policy: 'read_only',
      preflight: passingPreflight(),
      leaf_report: {
        parse_status: 'parsed',
        source: 'stdout',
        report_status: 'passed',
        business_assertions_reached: true,
        screenshot_attempts: requiresScreenshot
          ? [{ label: 'contract', attempts: [{ attempt: 1, status: 'passed' }] }]
          : [],
        assertions: passingAssertions(catalogId),
        raw_report_ref: passingLeafReportPath(catalogId),
        parse_error: null
      },
      runtime_evidence: {
        project_identity_verified: true,
        main_devtools_pid: 202,
        process_start_identity: 'qa-start',
        profile: '/qa/profile',
        identity_hash: identity,
        auth_generation: 1
      },
      auth_consumption: {
        event_id: 'fixture-qa-consumption-001',
        role: 'qa',
        source: 'shared_auth_merge',
        pid: 202,
        process_start_identity: 'qa-start',
        profile_realpath: '/qa/profile',
        identity_hash: identity,
        auth_generation: 1,
        consumed_at_ms: Date.now()
      },
      auth_consumption_ack: {
        status: 'passed',
        code: 'qa_auth_consumption_ack_received',
        event: { event_id: 'fixture-qa-consumption-001' }
      },
      auth_consumption_captured_at_ms: Date.now()
    }
  }
}

function passingDoctor(index = 1) {
  return {
    passed: true,
    failures: [],
    screenshotPath: pngPath,
    command: { status: 0 },
    report: {
      status: 'ready',
      code: 'qa_runtime_doctor_ready',
      supervisor_state: {
        runtime_key: 'runtime-key-1',
        generation: 1,
        pid: 100 + index,
        devtools_pid: 200 + index,
        local_runtime_pid: 300 + index,
        process_start_identity: `start-${index}`,
        session_id: `session-${index}`
      },
      checks: {
        preflight: {
          status: 'passed',
          evidence: { screenshot: pngPath },
          checks: {
            project_identity: { passed: true },
            page_data: { passed: true },
            wx_request: { passed: true, identity_required: true, identity_resolved: true },
            screenshot: { passed: true, path: pngPath },
            renderer_screenshot_attempts: [{ attempt: 1, status: 'passed' }]
          },
          targeted_restart: { attempted: false }
        }
      }
    }
  }
}

function passingReports() {
  const auth = {
    status: 'passed',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId,
    startup_observation: {
      source: 'automator_v3_suite_initial_bootstrap',
      status: 0,
      signal: null,
      timed_out: false,
      value: {
        status: 'ready',
        code: 'qa_bootstrap_ready',
        run_instance_id: runInstanceId,
        supervisor_state: null
      }
    },
    samples: Array.from({ length: AUTOMATOR_V3_AUTH_SAMPLES }, () => authSample),
    continuity: authContinuity
  }
  const cold = {
    status: 'passed',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId,
    target_attempts: AUTOMATOR_V3_COLD_STARTS,
    health_samples_per_generation: AUTOMATOR_V3_DOCTOR_SAMPLES,
    iterations: Array.from({ length: AUTOMATOR_V3_COLD_STARTS }, (_, index) => ({
      status: 'passed',
      failures: [],
      bootstrap: {
        status: 0,
        value: {
          status: 'ready',
          supervisor_state: {
            runtime_key: 'runtime-key-1',
            generation: 1,
            pid: 100 + index + 1,
            devtools_pid: 200 + index + 1,
            local_runtime_pid: 300 + index + 1,
            process_start_identity: `start-${index + 1}`,
            session_id: `session-${index + 1}`
          }
        }
      },
      doctor_samples: Array.from({ length: AUTOMATOR_V3_DOCTOR_SAMPLES }, () =>
        passingDoctor(index + 1)
      ),
      stop: {
        raw: { status: 0 },
        status: 'ready',
        code: 'qa_runtime_stopped'
      },
      index: index + 1
    }))
  }
  const baseline = { generation: 1, devtoolsPid: 2 }
  const warm = {
    status: 'passed',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId,
    completed_runs: AUTOMATOR_V3_WARM_RUNS,
    baseline,
    catalog_ids: [...AUTOMATOR_V3_WARM_CATALOG_IDS],
    runs: AUTOMATOR_V3_WARM_CATALOG_IDS.map((catalog_id, index) => ({
      status: 'passed',
      failures: [],
      catalog_id,
      qa: passingQa(catalog_id),
      before: baseline,
      after: baseline,
      index: index + 1
    }))
  }
  const live = {
    status: 'passed',
    infrastructure_status: 'passed',
    business_status: 'passed',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId,
    completed_runs: AUTOMATOR_V3_LIVE_RUNS,
    repeat_count: AUTOMATOR_V3_LIVE_REPEAT_COUNT,
    auth_watchdog: { status: 'passed', primary_failure: null, checks: 1, renewals: [] },
    catalog_ids: liveIds,
    runs: liveIds.flatMap(catalog_id =>
      Array.from({ length: AUTOMATOR_V3_LIVE_REPEAT_COUNT }, (_, repeatIndex) => ({
        status: 'passed',
        failures: [],
        catalog_id,
        repeat_index: repeatIndex + 1,
        qa: passingQa(catalog_id),
        index: liveIds.indexOf(catalog_id) * AUTOMATOR_V3_LIVE_REPEAT_COUNT + repeatIndex + 1
      }))
    )
  }
  const soak = {
    status: 'passed',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId,
    reliability_contract: 'tiered_real_cold_start_plus_fast_control_plane_probe',
    target_cold_start_attempts: AUTOMATOR_V3_RELIABILITY_COLD_STARTS,
    target_fast_probe_cycles: AUTOMATOR_V3_FAST_PROBE_CYCLES,
    iteration_budget_ms: 5 * 60 * 1000,
    fast_probe_budget_ms: 10 * 60 * 1000,
    total_budget_ms: 45 * 60 * 1000,
    total_duration_ms: 20 * 60 * 1000,
    auth_watchdog: { status: 'passed', primary_failure: null, checks: 1, renewals: [] },
    completed_attempts: AUTOMATOR_V3_RELIABILITY_COLD_STARTS,
    failed_attempts: 0,
    iterations: Array.from({ length: AUTOMATOR_V3_RELIABILITY_COLD_STARTS }, (_, index) => ({
      status: 'passed',
      duration_ms: 1000,
      failures: [],
      doctor_samples: Array.from({ length: AUTOMATOR_V3_DOCTOR_SAMPLES }, () =>
        passingDoctor(index + 1)
      ),
      bootstrap: {
        status: 0,
        value: {
          status: 'ready',
          supervisor_state: {
            runtime_key: 'runtime-key-1',
            generation: 1,
            pid: 100 + index + 1,
            devtools_pid: 200 + index + 1,
            local_runtime_pid: 300 + index + 1,
            process_start_identity: `start-${index + 1}`,
            session_id: `session-${index + 1}`
          }
        }
      },
      stop: { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } },
      index: index + 1
    })),
    fast_probe: {
      status: 'passed',
      target_cycles: AUTOMATOR_V3_FAST_PROBE_CYCLES,
      completed_cycles: AUTOMATOR_V3_FAST_PROBE_CYCLES,
      duration_ms: 2 * 60 * 1000,
      samples: Array.from({ length: AUTOMATOR_V3_FAST_PROBE_CYCLES }, (_, index) => ({
        index: index + 1,
        passed: true,
        identity: {
          runtime_key: 'runtime-key-1',
          generation: 1,
          supervisor_pid: 500,
          devtools_pid: 600,
          process_start_identity: 'fast-start-1',
          session_id: 'fast-session-1',
          local_runtime_pid: 700
        },
        failures: []
      })),
      bootstrap: {
        status: 0,
        value: {
          status: 'ready',
          supervisor_state: {
            runtime_key: 'runtime-key-1',
            generation: 1,
            pid: 500,
            devtools_pid: 600,
            local_runtime_pid: 700,
            process_start_identity: 'fast-start-1',
            session_id: 'fast-session-1'
          }
        }
      },
      stop: { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
    }
  }
  return { auth, cold, warm, live, soak }
}

test('final gate requires every v3 evidence family', () => {
  const reports = passingReports()
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, true)
})

test('final gate rejects a single failed warm leaf', () => {
  const reports = passingReports()
  reports.warm.runs[0].status = 'blocked'
  reports.warm.runs[0].failures = [{ code: 'qa_warm_targeted_restart_used' }]
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, false)
  assert.ok(result.errors.some(error => error.code === 'qa_v3_warm_run_failed'))
})

test('final gate rejects a screenshot that passed only after a retry', () => {
  const reports = passingReports()
  reports.live.runs[0].qa.value.preflight.checks.renderer_screenshot_attempts = [
    { attempt: 1, status: 'failed' },
    { attempt: 2, status: 'passed' }
  ]
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, false)
  assert.ok(
    result.errors.some(error => error.code === 'qa_v3_leaf_first_screenshot_attempt_not_proven')
  )
})

test('final gate rejects a business leaf screenshot that passed only after a retry', () => {
  const reports = passingReports()
  const rawPath = path.resolve(reports.live.runs[0].qa.value.leaf_report.raw_report_ref)
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
  raw.screenshot_attempts = [
    {
      label: 'contract',
      attempts: [
        { attempt: 1, status: 'failed' },
        { attempt: 2, status: 'passed' }
      ]
    }
  ]
  fs.writeFileSync(rawPath, `${JSON.stringify(raw)}\n`)
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, false)
  assert.ok(
    result.errors.some(
      error => error.code === 'qa_v3_leaf_business_first_screenshot_attempt_not_proven'
    )
  )
})

test('final gate rejects a live leaf without real business assertions', () => {
  const reports = passingReports()
  reports.live.runs[0].qa.value.leaf_report.business_assertions_reached = false
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, false)
  assert.ok(
    result.errors.some(error => error.code === 'qa_v3_leaf_business_assertions_not_reached')
  )
})

test('final gate rejects reports outside the dispatch artifact root', () => {
  fs.mkdirSync(root, { recursive: true })
  const manifestPath = path.join(root, 'manifest.json')
  const manifest = {
    schema_version: 1,
    dispatch_run_id: 'final-gate-contract-001',
    reports: {
      auth: path.join(root, 'auth.json'),
      cold_start: path.join(root, 'cold.json'),
      warm: path.join(root, 'warm.json'),
      live: path.join(root, 'live.json'),
      soak: path.join(root, 'soak.json')
    },
    expected_live_catalog_ids: liveIds
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  const result = validateAutomatorV3FinalGateManifest(manifest)
  assert.equal(result.passed, false)
  assert.ok(result.errors.some(error => error.code === 'qa_v3_report_path_forbidden'))
})

test('final gate rejects a report from another dispatch run', () => {
  const reports = passingReports()
  reports.cold.dispatch_run_id = 'different-run'
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, false)
  assert.ok(result.errors.some(error => error.code === 'qa_v3_report_dispatch_run_mismatch'))
})

test('final gate rejects a report from another execution instance in the same dispatch run', () => {
  const reports = passingReports()
  reports.cold.run_instance_id = 'run-instance-contract-other'
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, false)
  assert.ok(result.errors.some(error => error.code === 'qa_v3_report_run_instance_mismatch'))
})

test('final gate rejects a signature-only fake PNG', () => {
  const fakePath = path.join(artifactRoot, 'fake.png')
  fs.writeFileSync(fakePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  assert.equal(isValidPngEvidence(fakePath), false)
})

test('final gate rejects duplicate live catalog runs', () => {
  const reports = passingReports()
  reports.live.runs[AUTOMATOR_V3_LIVE_REPEAT_COUNT].catalog_id = reports.live.runs[0].catalog_id
  const result = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: liveIds,
    dispatchRunId,
    runInstanceId
  })
  assert.equal(result.passed, false)
  assert.ok(result.errors.some(error => error.code === 'qa_v3_live_run_catalog_set_invalid'))
})

test('final gate rejects a manifest that replaces the official live catalog set', () => {
  const reports = passingReports()
  const reportPaths = {
    auth: path.join(artifactRoot, 'auth.json'),
    cold_start: path.join(artifactRoot, 'cold.json'),
    warm: path.join(artifactRoot, 'warm.json'),
    live: path.join(artifactRoot, 'live.json'),
    soak: path.join(artifactRoot, 'soak.json')
  }
  for (const [label, reportPath] of Object.entries(reportPaths)) {
    fs.writeFileSync(reportPath, JSON.stringify(reports[label === 'cold_start' ? 'cold' : label]))
  }
  const manifest = {
    schema_version: 1,
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId,
    reports: reportPaths,
    expected_live_catalog_ids: liveIds.map((id, index) => `replacement-${index}-${id}`)
  }
  const result = validateAutomatorV3FinalGateManifest(manifest)
  assert.equal(result.passed, false)
  assert.ok(result.errors.some(error => error.code === 'qa_v3_live_catalog_manifest_mismatch'))
})

test('final gate coverage contract rejects registered pages and capabilities that are not covered', () => {
  const result = validateAutomatorV3BusinessCoverage(
    {
      schema_version: 1,
      status: 'incomplete',
      surfaces: [
        {
          id: 'page.index',
          route: 'pages/index/index',
          kind: 'page',
          tabbar: true,
          acceptance_modes: ['live'],
          catalog_ids: ['live-1']
        }
      ],
      capabilities: [
        {
          id: 'calendar',
          route: 'pages/calendar/calendar',
          status: 'blocked',
          catalog_ids: [],
          reason: 'synthetic uncovered surface'
        }
      ]
    },
    {
      root,
      catalogEntries: [{ id: 'live-1', data_mode: 'automator_live_real_api' }]
    }
  )
  assert.equal(result.passed, false)
  assert.ok(
    result.errors.some(
      error => error.code === 'qa_v3_business_coverage_registered_route_set_invalid'
    )
  )
  assert.ok(result.errors.some(error => error.code === 'qa_v3_business_coverage_incomplete'))
})

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(artifactRoot, { recursive: true, force: true })
})

console.log('Automator v3 final gate contract passed')
