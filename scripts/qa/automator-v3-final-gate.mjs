#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isValidPngEvidence } from './qa-png-evidence.mjs'
import {
  AUTH_CONTINUITY_DURATION_MS,
  AUTH_CONTINUITY_MIN_SAMPLES,
  AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES,
  AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES
} from './automator-auth-concurrency.mjs'
import {
  AUTOMATOR_FAST_PROBE_TARGET_CYCLES,
  AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS,
  AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS,
  AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS,
  AUTOMATOR_SOAK_ITERATION_BUDGET_MS
} from './automator-soak.mjs'
import { AUTOMATOR_LIVE_REPEAT_COUNT } from './automator-live-matrix.mjs'
import { isAcceptedAuthConsumptionSource } from './qa-auth-broker-core.mjs'

export const AUTOMATOR_V3_AUTH_SAMPLES = 3
export const AUTOMATOR_V3_COLD_STARTS = 3
export const AUTOMATOR_V3_WARM_RUNS = 5
export const AUTOMATOR_V3_RELIABILITY_COLD_STARTS = AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS
export const AUTOMATOR_V3_FAST_PROBE_CYCLES = AUTOMATOR_FAST_PROBE_TARGET_CYCLES
export const AUTOMATOR_V3_DOCTOR_SAMPLES = 3
export const AUTOMATOR_V3_WARM_CATALOG_IDS = Object.freeze([
  'user.review.subpackage_routing',
  'care.air_exchange.v1',
  'care.watering.transpiration_v3.independent_advice',
  'care.watering.transpiration_v3.user_plant_planner',
  'diagnosis.yellowing.no_image_quick'
])
export const AUTOMATOR_V3_LIVE_REPEAT_COUNT = AUTOMATOR_LIVE_REPEAT_COUNT

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const allowedArtifactRoot = path.resolve(repoRoot, '.tmp', 'dispatch-task')
const SAFE_ID = /^[A-Za-z0-9._-]{8,160}$/u
const AUTH_EXPIRY_SERIALIZATION_TOLERANCE_MS = 1000

// The catalog is the single source of truth for the live matrix.  A malformed
// or unreadable catalog must fail at import time instead of silently turning
// the required live count into zero.
export const AUTOMATOR_V3_LIVE_LEAF_COUNT = readCatalogLiveIds(repoRoot).length
export const AUTOMATOR_V3_LIVE_RUNS = AUTOMATOR_V3_LIVE_LEAF_COUNT * AUTOMATOR_V3_LIVE_REPEAT_COUNT

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizePath(value) {
  return path.resolve(String(value || '')).replaceAll('\\', '/')
}

function isAllowedArtifactPath(value, dispatchRunId = null, runInstanceId = null) {
  const resolved = normalizePath(value)
  if (!resolved.startsWith(`${allowedArtifactRoot}/`)) {
    return false
  }
  if (dispatchRunId && !resolved.startsWith(`${allowedArtifactRoot}/${dispatchRunId}/`)) {
    return false
  }
  if (
    dispatchRunId &&
    runInstanceId &&
    !resolved.startsWith(`${allowedArtifactRoot}/${dispatchRunId}/qa-artifacts/${runInstanceId}/`)
  ) {
    return false
  }
  if (resolved.includes('/.e2e-artifacts/') || resolved.includes('/node_modules/')) {
    return false
  }
  try {
    const realpath = fs.realpathSync(resolved).replaceAll('\\', '/')
    return (
      realpath.startsWith(`${allowedArtifactRoot}/`) &&
      (!dispatchRunId || realpath.startsWith(`${allowedArtifactRoot}/${dispatchRunId}/`)) &&
      (!dispatchRunId ||
        !runInstanceId ||
        realpath.startsWith(
          `${allowedArtifactRoot}/${dispatchRunId}/qa-artifacts/${runInstanceId}/`
        )) &&
      !realpath.includes('/.e2e-artifacts/') &&
      !realpath.includes('/node_modules/')
    )
  } catch {
    return false
  }
}

function screenshotPathFromPreflight(preflight) {
  return (
    preflight?.evidence?.screenshot ||
    preflight?.checks?.screenshot?.path ||
    preflight?.checks?.screenshot?.screenshot_path ||
    null
  )
}

function screenshotAttemptsFromPreflight(preflight) {
  return (
    preflight?.checks?.renderer_screenshot_attempts ||
    preflight?.checks?.rpc_steps?.screenshot_attempts ||
    preflight?.checks?.screenshot?.attempts ||
    null
  )
}

function firstScreenshotSucceeded(preflight) {
  const attempts = screenshotAttemptsFromPreflight(preflight)
  return (
    Array.isArray(attempts) &&
    attempts.length === 1 &&
    attempts[0]?.attempt === 1 &&
    attempts[0]?.status === 'passed'
  )
}

function auditedTargetOnlyRecoveryPassed(preflight) {
  const recovery = preflight?.targeted_restart
  if (recovery?.attempted !== true) {
    return true
  }
  const actions = new Set(
    (recovery.recovery_invocation || []).map(invocation => invocation?.action)
  )
  return Boolean(
    preflight.status === 'passed' &&
    recovery.after?.project_identity_verified === true &&
    ['close', 'open', 'auto'].every(action => actions.has(action)) &&
    recovery.post_recovery_probes?.screenshot?.passed === true &&
    recovery.post_recovery_probes?.wx_request?.passed === true
  )
}

function liveRecoveryOrRebuildPassed(record) {
  return Boolean(
    record?.full_lan_rebuild_requested !== true &&
    record?.fixture_runtime_recovery?.required !== true &&
    record?.runtime_evidence?.bootstrap_preflight?.targeted_restart?.attempted !== true &&
    auditedTargetOnlyRecoveryPassed(record?.preflight)
  )
}

function readLeafBusinessReport(record) {
  const leaf = record?.leaf_report
  if (!isObject(leaf)) {
    return { report: null, raw_report_ref: null, error: 'leaf_report_missing' }
  }
  const rawReportRef = leaf.raw_report_ref
  if (!nonEmptyString(rawReportRef) || rawReportRef === 'unavailable') {
    return { report: null, raw_report_ref: rawReportRef || null, error: 'raw_report_missing' }
  }
  const resolved = normalizePath(rawReportRef)
  try {
    const artifact = JSON.parse(fs.readFileSync(resolved, 'utf8'))
    if (isObject(artifact?.report)) {
      return { report: artifact.report, raw_report_ref: rawReportRef, error: null }
    }
    if (nonEmptyString(artifact?.raw_report)) {
      const report = JSON.parse(artifact.raw_report)
      return { report, raw_report_ref: rawReportRef, error: null }
    }
    if (typeof artifact?.status === 'string') {
      return { report: artifact, raw_report_ref: rawReportRef, error: null }
    }
    return { report: null, raw_report_ref: rawReportRef, error: 'raw_report_payload_missing' }
  } catch (error) {
    return {
      report: null,
      raw_report_ref: rawReportRef,
      error: error?.code === 'ENOENT' ? 'raw_report_unreadable' : 'raw_report_malformed'
    }
  }
}

function validateBusinessLeafEvidence(
  record,
  errors,
  label,
  expectedDispatchRunId,
  expectedRunInstanceId,
  catalogEntry = null
) {
  const leaf = record?.leaf_report
  const rawReportRef = leaf?.raw_report_ref
  addError(errors, isObject(leaf), 'qa_v3_leaf_business_report_missing', { label })
  addError(errors, leaf?.parse_status === 'parsed', 'qa_v3_leaf_business_report_not_parsed', {
    label,
    parse_status: leaf?.parse_status || null
  })
  addError(
    errors,
    isAllowedArtifactPath(rawReportRef, expectedDispatchRunId, expectedRunInstanceId),
    'qa_v3_leaf_business_report_path_forbidden',
    { label, path: rawReportRef || null }
  )
  const parsed = readLeafBusinessReport(record)
  addError(errors, parsed.error === null, 'qa_v3_leaf_business_report_unreadable', {
    label,
    path: rawReportRef || null,
    reason: parsed.error
  })
  addError(
    errors,
    leaf?.report_status === 'passed' && parsed.report?.status === 'passed',
    'qa_v3_leaf_business_report_not_passed',
    { label, report_status: leaf?.report_status || null, raw_status: parsed.report?.status || null }
  )
  addError(
    errors,
    leaf?.business_assertions_reached === true &&
      parsed.report?.business_assertions_reached === true,
    'qa_v3_leaf_business_assertions_not_reached',
    { label }
  )
  const assertions = parsed.report?.assertions
  addError(
    errors,
    Array.isArray(assertions) &&
      assertions.length > 0 &&
      assertions.every(assertion => assertion?.passed === true),
    'qa_v3_leaf_business_assertions_unproven',
    { label, assertions: Array.isArray(assertions) ? assertions : null }
  )
  addError(
    errors,
    Array.isArray(leaf?.assertions) &&
      leaf.assertions.length === assertions?.length &&
      leaf.assertions.every(
        (assertion, index) =>
          assertion?.name === assertions?.[index]?.name &&
          assertion?.passed === assertions?.[index]?.passed
      ),
    'qa_v3_leaf_business_assertion_wrapper_mismatch',
    { label }
  )
  if (catalogEntry?.requirements?.screenshot !== false) {
    const screenshotAttempts = parsed.report?.screenshot_attempts
    const screenshots = parsed.report?.screenshots
    addError(
      errors,
      Array.isArray(screenshotAttempts) &&
        screenshotAttempts.length > 0 &&
        Array.isArray(screenshots) &&
        screenshots.length === screenshotAttempts.length &&
        screenshotAttempts.every(
          item =>
            Array.isArray(item?.attempts) &&
            item.attempts.length === 1 &&
            item.attempts[0]?.attempt === 1 &&
            item.attempts[0]?.status === 'passed'
        ),
      'qa_v3_leaf_business_first_screenshot_attempt_not_proven',
      {
        label,
        screenshots: Array.isArray(screenshots) ? screenshots.length : null,
        screenshot_attempts: screenshotAttempts || null
      }
    )
  }
  const requiredAssertions = Array.isArray(catalogEntry?.required_assertions)
    ? catalogEntry.required_assertions
    : []
  const observedAssertions = new Map(
    (Array.isArray(assertions) ? assertions : []).map(assertion => [assertion?.name, assertion])
  )
  const missingRequiredAssertions = requiredAssertions.filter(
    name => observedAssertions.get(name)?.passed !== true
  )
  addError(
    errors,
    requiredAssertions.length > 0 && missingRequiredAssertions.length === 0,
    'qa_v3_leaf_required_business_assertions_not_proven',
    { label, required_assertions: requiredAssertions, missing_or_failed: missingRequiredAssertions }
  )
}

function validateLeafEvidence(
  qa,
  errors,
  label,
  expectedDispatchRunId,
  expectedRunInstanceId,
  expectedCatalogId = null,
  requireLive = false,
  catalogEntry = null
) {
  const record = qa?.value
  const preflight = record?.preflight
  addError(errors, qa?.status === 0, 'qa_v3_leaf_command_failed', { label, status: qa?.status })
  addError(
    errors,
    record?.dispatch_run_id === expectedDispatchRunId,
    'qa_v3_leaf_dispatch_run_mismatch',
    { label, expected: expectedDispatchRunId, observed: record?.dispatch_run_id || null }
  )
  addError(
    errors,
    record?.run_instance_id === expectedRunInstanceId,
    'qa_v3_leaf_run_instance_mismatch',
    { label, expected: expectedRunInstanceId, observed: record?.run_instance_id || null }
  )
  if (expectedCatalogId) {
    addError(errors, record?.catalog_id === expectedCatalogId, 'qa_v3_leaf_catalog_id_mismatch', {
      label,
      expected: expectedCatalogId,
      observed: record?.catalog_id || null
    })
  }
  if (requireLive) {
    validateBusinessLeafEvidence(
      record,
      errors,
      label,
      expectedDispatchRunId,
      expectedRunInstanceId,
      catalogEntry
    )
    addError(
      errors,
      record?.data_mode === 'automator_live_real_api',
      'qa_v3_live_leaf_data_mode_invalid',
      { label, observed: record?.data_mode || null }
    )
    addError(
      errors,
      record?.auth_mode === 'persisted_real_wechat',
      'qa_v3_live_leaf_auth_mode_invalid',
      { label, observed: record?.auth_mode || null }
    )
    addError(
      errors,
      ['read_only', 'self_reverting', 'test_owned_persistent'].includes(record?.mutation_policy),
      'qa_v3_live_leaf_mutation_policy_invalid',
      { label, observed: record?.mutation_policy || null }
    )
    const runtimeEvidence = record?.runtime_evidence || {}
    const consumption = record?.auth_consumption || null
    const consumptionAck = record?.auth_consumption_ack || null
    const consumptionCapturedAt = Number(record?.auth_consumption_captured_at_ms)
    addError(
      errors,
      consumptionAck?.status === 'passed' &&
        consumptionAck.code === 'qa_auth_consumption_ack_received' &&
        consumptionAck.event?.event_id === consumption?.event_id &&
        consumption?.role === 'qa' &&
        isAcceptedAuthConsumptionSource(consumption.source, consumption.role) &&
        typeof consumption.event_id === 'string' &&
        consumption.event_id.length > 0 &&
        Number(consumption.pid) === Number(runtimeEvidence.main_devtools_pid) &&
        consumption.process_start_identity === runtimeEvidence.process_start_identity &&
        normalizePath(consumption.profile_realpath) ===
          normalizePath(runtimeEvidence.profile || runtimeEvidence.user_data_dir) &&
        consumption.identity_hash === runtimeEvidence.identity_hash &&
        Number(consumption.auth_generation) === Number(runtimeEvidence.auth_generation) &&
        Number.isFinite(consumptionCapturedAt) &&
        Number.isFinite(Number(consumption.consumed_at_ms)) &&
        Number(consumption.consumed_at_ms) <= consumptionCapturedAt &&
        consumptionCapturedAt >= (Date.parse(record?.started_at || '') || 0),
      'qa_v3_live_leaf_auth_consumption_unproven',
      {
        label,
        observed: consumption,
        ack: consumptionAck,
        captured_at_ms: record?.auth_consumption_captured_at_ms || null,
        runtime: runtimeEvidence
      }
    )
  }
  addError(errors, record?.status === 'passed', 'qa_v3_leaf_not_passed', {
    label,
    status: record?.status || null
  })
  addError(errors, preflight?.status === 'passed', 'qa_v3_leaf_preflight_not_passed', { label })
  for (const [name, check] of Object.entries({
    project_identity: preflight?.checks?.project_identity,
    page_data: preflight?.checks?.page_data,
    wx_request: preflight?.checks?.wx_request,
    screenshot: preflight?.checks?.screenshot
  })) {
    addError(errors, check?.passed === true, 'qa_v3_leaf_check_not_passed', {
      label,
      check: name
    })
  }
  addError(
    errors,
    preflight?.checks?.wx_request?.identity_required === true &&
      preflight?.checks?.wx_request?.identity_resolved === true,
    'qa_v3_leaf_wx_request_identity_not_proven',
    { label }
  )
  addError(
    errors,
    record?.runtime_evidence?.project_identity_verified === true,
    'qa_v3_leaf_project_identity_not_verified',
    { label }
  )
  const screenshotPath = screenshotPathFromPreflight(preflight)
  addError(
    errors,
    isAllowedArtifactPath(screenshotPath, expectedDispatchRunId, expectedRunInstanceId),
    'qa_v3_leaf_screenshot_path_forbidden',
    { label, path: screenshotPath || null }
  )
  addError(errors, isValidPngEvidence(screenshotPath), 'qa_v3_leaf_first_png_invalid', {
    label,
    path: screenshotPath || null
  })
  addError(
    errors,
    firstScreenshotSucceeded(preflight),
    'qa_v3_leaf_first_screenshot_attempt_not_proven',
    { label, attempts: screenshotAttemptsFromPreflight(preflight) }
  )
  addError(
    errors,
    requireLive
      ? liveRecoveryOrRebuildPassed(record)
      : preflight?.targeted_restart?.attempted !== true &&
          record?.full_lan_rebuild_requested !== true &&
          record?.fixture_runtime_recovery?.required !== true &&
          record?.runtime_evidence?.bootstrap_preflight?.targeted_restart?.attempted !== true,
    'qa_v3_leaf_recovery_or_rebuild_used',
    { label }
  )
}

function validateDoctorEvidence(
  sample,
  errors,
  label,
  expectedDispatchRunId,
  expectedRunInstanceId
) {
  const report = sample?.report
  addError(errors, sample?.command?.status === 0, 'qa_v3_doctor_command_failed', { label })
  addError(errors, report?.status === 'ready', 'qa_v3_doctor_not_ready', { label })
  addError(
    errors,
    report?.code === 'qa_runtime_doctor_ready',
    'qa_v3_doctor_terminal_code_invalid',
    {
      label,
      code: report?.code || null
    }
  )
  addError(
    errors,
    report?.checks?.preflight?.status === 'passed',
    'qa_v3_doctor_preflight_not_passed',
    {
      label
    }
  )
  for (const [name, check] of Object.entries({
    project_identity: report?.checks?.preflight?.checks?.project_identity,
    page_data: report?.checks?.preflight?.checks?.page_data,
    wx_request: report?.checks?.preflight?.checks?.wx_request,
    screenshot: report?.checks?.preflight?.checks?.screenshot
  })) {
    addError(errors, check?.passed === true, 'qa_v3_doctor_check_not_passed', {
      label,
      check: name
    })
  }
  addError(
    errors,
    report?.checks?.preflight?.checks?.wx_request?.identity_required === true &&
      report?.checks?.preflight?.checks?.wx_request?.identity_resolved === true,
    'qa_v3_doctor_wx_request_identity_not_proven',
    { label }
  )
  const screenshotPath =
    sample?.screenshotPath || screenshotPathFromPreflight(report?.checks?.preflight)
  addError(
    errors,
    isAllowedArtifactPath(screenshotPath, expectedDispatchRunId, expectedRunInstanceId),
    'qa_v3_doctor_screenshot_path_forbidden',
    {
      label,
      path: screenshotPath || null
    }
  )
  addError(errors, isValidPngEvidence(screenshotPath), 'qa_v3_doctor_first_png_invalid', {
    label,
    path: screenshotPath || null
  })
  addError(
    errors,
    firstScreenshotSucceeded(report?.checks?.preflight),
    'qa_v3_doctor_first_screenshot_attempt_not_proven',
    { label, attempts: screenshotAttemptsFromPreflight(report?.checks?.preflight) }
  )
  addError(
    errors,
    report?.checks?.preflight?.targeted_restart?.attempted !== true,
    'qa_v3_doctor_recovery_used',
    { label }
  )
  addError(
    errors,
    report?.supervisor_state?.bootstrap_preflight?.targeted_restart?.attempted !== true,
    'qa_v3_doctor_bootstrap_recovery_used',
    { label }
  )
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return { __read_error: error.message }
  }
}

function readCatalogLiveIds(root) {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, 'test/e2e/automator/catalog.json'), 'utf8')
  )
  return (catalog.entries || [])
    .filter(item => item.data_mode === 'automator_live_real_api')
    .map(item => item.id)
    .sort()
}

function readCatalogEntries(root) {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, 'test/e2e/automator/catalog.json'), 'utf8')
  )
  return Array.isArray(catalog.entries) ? catalog.entries : []
}

function registeredPageRoutes(root) {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'src/pages.json'), 'utf8'))
  const routes = []
  for (const page of pages.pages || []) {
    if (nonEmptyString(page?.path)) {
      routes.push({ route: page.path, tabbar: false })
    }
  }
  const tabbarRoutes = new Set((pages.tabBar?.list || []).map(item => item.pagePath))
  for (const entry of routes) {
    entry.tabbar = tabbarRoutes.has(entry.route)
  }
  for (const subpackage of pages.subPackages || []) {
    for (const page of subpackage.pages || []) {
      if (nonEmptyString(subpackage?.root) && nonEmptyString(page?.path)) {
        routes.push({ route: `${subpackage.root}/${page.path}`, tabbar: false })
      }
    }
  }
  return routes.sort((left, right) => left.route.localeCompare(right.route))
}

export function validateAutomatorV3BusinessCoverage(
  coverage,
  { root = repoRoot, catalogEntries = null } = {}
) {
  const errors = []
  addError(errors, isObject(coverage), 'qa_v3_business_coverage_invalid')
  if (!isObject(coverage)) {
    return { passed: false, errors }
  }
  addError(errors, coverage.schema_version === 1, 'qa_v3_business_coverage_schema_invalid', {
    observed: coverage.schema_version ?? null
  })
  const entries = catalogEntries || readCatalogEntries(root)
  const catalogById = new Map(entries.map(entry => [entry.id, entry]))
  let registered = []
  try {
    registered = registeredPageRoutes(root)
  } catch (error) {
    errors.push({ code: 'qa_v3_business_coverage_pages_unreadable', message: error.message })
  }
  const surfaces = Array.isArray(coverage.surfaces) ? coverage.surfaces : []
  const surfaceRoutes = surfaces.map(surface => surface?.route).filter(nonEmptyString)
  const expectedRoutes = registered.map(item => item.route)
  addError(
    errors,
    surfaceRoutes.length === new Set(surfaceRoutes).size,
    'qa_v3_business_coverage_duplicate_surface_route',
    { observed: surfaceRoutes }
  )
  addError(
    errors,
    JSON.stringify([...surfaceRoutes].sort()) === JSON.stringify([...expectedRoutes].sort()),
    'qa_v3_business_coverage_registered_route_set_invalid',
    { observed: [...surfaceRoutes].sort(), expected: [...expectedRoutes].sort() }
  )
  const registeredByRoute = new Map(registered.map(item => [item.route, item]))
  for (const surface of surfaces) {
    const route = surface?.route
    const registeredPage = registeredByRoute.get(route)
    const modes = Array.isArray(surface?.acceptance_modes) ? surface.acceptance_modes : []
    const ids = Array.isArray(surface?.catalog_ids) ? surface.catalog_ids : []
    addError(errors, isObject(registeredPage), 'qa_v3_business_coverage_unknown_route', { route })
    addError(
      errors,
      ['page', 'component', 'flow'].includes(surface?.kind),
      'qa_v3_business_coverage_kind_invalid',
      { route, kind: surface?.kind || null }
    )
    addError(
      errors,
      modes.length > 0 && modes.every(mode => ['live', 'diagnostic', 'blocked'].includes(mode)),
      'qa_v3_business_coverage_mode_invalid',
      { route, modes }
    )
    addError(
      errors,
      modes.includes('blocked') ? nonEmptyString(surface?.reason) : ids.length > 0,
      'qa_v3_business_coverage_surface_evidence_invalid',
      { route, modes, catalog_ids: ids, reason: surface?.reason || null }
    )
    for (const catalogId of ids) {
      const catalogEntry = catalogById.get(catalogId)
      addError(errors, isObject(catalogEntry), 'qa_v3_business_coverage_catalog_id_unknown', {
        route,
        catalog_id: catalogId
      })
      if (!catalogEntry) {
        continue
      }
      const mode = catalogEntry.data_mode === 'automator_live_real_api' ? 'live' : 'diagnostic'
      addError(
        errors,
        modes.includes(mode) && catalogEntry.data_mode !== 'unit_fake',
        'qa_v3_business_coverage_catalog_mode_mismatch',
        { route, catalog_id: catalogId, mode, acceptance_modes: modes }
      )
    }
    addError(
      errors,
      surface?.tabbar === registeredPage?.tabbar,
      'qa_v3_business_coverage_tabbar_mismatch',
      { route, observed: surface?.tabbar ?? null, expected: registeredPage?.tabbar ?? null }
    )
  }
  const capabilities = Array.isArray(coverage.capabilities) ? coverage.capabilities : []
  for (const capability of capabilities) {
    const status = capability?.status
    addError(
      errors,
      ['covered', 'blocked'].includes(status),
      'qa_v3_business_coverage_capability_status_invalid',
      { capability_id: capability?.id || null, status: status || null }
    )
    addError(
      errors,
      status === 'blocked'
        ? nonEmptyString(capability?.reason)
        : Array.isArray(capability?.catalog_ids) && capability.catalog_ids.length > 0,
      'qa_v3_business_coverage_capability_evidence_invalid',
      { capability_id: capability?.id || null, status: status || null }
    )
    for (const catalogId of capability?.catalog_ids || []) {
      addError(
        errors,
        catalogById.has(catalogId),
        'qa_v3_business_coverage_capability_catalog_unknown',
        {
          capability_id: capability?.id || null,
          catalog_id: catalogId
        }
      )
    }
  }
  const blockedSurfaces = surfaces.filter(surface => surface?.acceptance_modes?.includes('blocked'))
  const blockedCapabilities = capabilities.filter(capability => capability?.status === 'blocked')
  addError(
    errors,
    coverage.status === 'complete' &&
      blockedSurfaces.length === 0 &&
      blockedCapabilities.length === 0,
    'qa_v3_business_coverage_incomplete',
    {
      status: coverage.status || null,
      blocked_surface_routes: blockedSurfaces.map(surface => surface.route),
      blocked_capabilities: blockedCapabilities.map(capability => capability.id)
    }
  )
  for (const surface of surfaces) {
    if (surface?.acceptance_modes?.includes('live')) {
      const liveIds = (surface.catalog_ids || []).filter(
        catalogId => catalogById.get(catalogId)?.data_mode === 'automator_live_real_api'
      )
      addError(
        errors,
        liveIds.length > 0,
        'qa_v3_business_coverage_live_surface_without_live_leaf',
        { route: surface.route }
      )
    }
  }
  for (const capability of capabilities) {
    if (capability?.status === 'covered') {
      addError(
        errors,
        (capability.catalog_ids || []).some(
          catalogId => catalogById.get(catalogId)?.data_mode === 'automator_live_real_api'
        ),
        'qa_v3_business_coverage_capability_without_live_leaf',
        { capability_id: capability.id }
      )
    }
  }
  return {
    passed: errors.length === 0,
    errors,
    registered_routes: expectedRoutes,
    blocked_surface_routes: blockedSurfaces.map(surface => surface.route),
    blocked_capabilities: blockedCapabilities.map(capability => capability.id)
  }
}

function addError(errors, condition, code, details = {}) {
  if (!condition) {
    errors.push({ code, ...details })
  }
}

function hasNoFailures(value) {
  return Array.isArray(value?.failures) && value.failures.length === 0
}

function doctorIdentity(sample) {
  const identity = sample?.identity || sample?.report?.supervisor_state || {}
  return {
    runtime_key: identity.runtimeKey || identity.runtime_key || null,
    generation: Number(identity.generation || 0) || null,
    supervisor_pid: Number(identity.supervisorPid || identity.pid || 0) || null,
    devtools_pid: Number(identity.devtoolsPid || identity.devtools_pid || 0) || null,
    local_runtime_pid: Number(identity.localRuntimePid || identity.local_runtime_pid || 0) || null,
    process_start_identity:
      identity.processStartIdentity || identity.process_start_identity || null,
    session_id: identity.sessionId || identity.session_id || null
  }
}

function commandIdentity(command) {
  const identity =
    command?.value?.supervisor_state || command?.value?.supervisor || command?.value || {}
  return {
    runtime_key: identity.runtime_key || identity.runtimeKey || null,
    generation: Number(identity.generation || 0) || null,
    supervisor_pid: Number(identity.pid || identity.supervisor_pid || 0) || null,
    devtools_pid: Number(identity.devtools_pid || identity.devtoolsPid || 0) || null,
    local_runtime_pid: Number(identity.local_runtime_pid || identity.localRuntimePid || 0) || null,
    process_start_identity:
      identity.process_start_identity || identity.processStartIdentity || null,
    session_id: identity.session_id || identity.sessionId || null
  }
}

function identitiesMatch(left, right) {
  return (
    left.runtime_key &&
    left.generation &&
    left.supervisor_pid &&
    left.devtools_pid &&
    left.runtime_key === right.runtime_key &&
    left.generation === right.generation &&
    left.supervisor_pid === right.supervisor_pid &&
    left.devtools_pid === right.devtools_pid &&
    left.local_runtime_pid &&
    left.process_start_identity &&
    left.session_id &&
    left.local_runtime_pid === right.local_runtime_pid &&
    left.process_start_identity === right.process_start_identity &&
    left.session_id === right.session_id
  )
}

function sameDoctorIdentity(samples) {
  const identities = samples.map(doctorIdentity)
  const first = identities[0]
  return Boolean(
    first?.runtime_key &&
    first.generation &&
    first.supervisor_pid &&
    first.devtools_pid &&
    first.local_runtime_pid &&
    first.process_start_identity &&
    first.session_id &&
    identities.every(identity => JSON.stringify(identity) === JSON.stringify(first))
  )
}

function doctorIdentityKey(sample) {
  return JSON.stringify(doctorIdentity(sample))
}

function validateAuthReport(report, errors, expectedDispatchRunId, expectedRunInstanceId) {
  const label = 'auth_concurrency'
  addError(
    errors,
    report?.dispatch_run_id === expectedDispatchRunId,
    'qa_v3_report_dispatch_run_mismatch',
    { label, expected: expectedDispatchRunId, observed: report?.dispatch_run_id || null }
  )
  addError(
    errors,
    report?.run_instance_id === expectedRunInstanceId,
    'qa_v3_auth_report_run_instance_mismatch',
    { expected: expectedRunInstanceId, observed: report?.run_instance_id || null }
  )
  addError(errors, report?.status === 'passed', 'qa_v3_auth_concurrency_not_passed', {
    status: report?.status
  })
  addError(
    errors,
    Array.isArray(report?.samples) && report.samples.length === AUTOMATOR_V3_AUTH_SAMPLES,
    'qa_v3_auth_concurrency_sample_count_invalid',
    { observed: report?.samples?.length ?? null }
  )
  const startup = report?.startup_observation
  addError(
    errors,
    startup?.source === 'automator_v3_suite_initial_bootstrap' &&
      startup.status === 0 &&
      startup.timed_out !== true &&
      startup.value?.status === 'ready' &&
      ['qa_bootstrap_ready', 'qa_bootstrap_already_ready', 'qa_bootstrap_refreshed'].includes(
        startup.value.code
      ),
    'qa_v3_suite_bootstrap_observation_invalid',
    { observed: startup || null }
  )
  const sampleIdentities = []
  for (const [index, sample] of (report?.samples || []).entries()) {
    addError(errors, sample?.passed === true, 'qa_v3_auth_concurrency_sample_failed', {
      sample: index + 1,
      failures: sample?.failures || []
    })
    addError(errors, hasNoFailures(sample), 'qa_v3_auth_concurrency_sample_has_failures', {
      sample: index + 1
    })
    const observed = sample?.observed || {}
    const daily = observed.daily || {}
    const qa = observed.qa || {}
    const shared = observed.shared || {}
    const ports = observed.ports || {}
    const identities = [daily.identity_hash, qa.identity_hash, shared.identity_hash]
    sampleIdentities.push({
      daily_identity: daily.identity_hash || null,
      qa_identity: qa.identity_hash || null,
      shared_identity: shared.identity_hash || null,
      auth_generation: shared.auth_generation || null,
      daily_profile: daily.profile || null,
      qa_profile: qa.profile || null,
      daily_pids: Array.isArray(daily.pids) ? [...daily.pids].sort((a, b) => a - b) : [],
      qa_pids: Array.isArray(qa.pids) ? [...qa.pids].sort((a, b) => a - b) : [],
      daily_command: daily.main_command || null,
      qa_command: qa.main_command || null
    })
    addError(
      errors,
      observed.auth_mode === 'managed_daily_single_writer',
      'qa_v3_auth_mode_not_managed_single_writer',
      { sample: index + 1, observed: observed.auth_mode || null }
    )
    addError(
      errors,
      daily.active === true && daily.managed === true && daily.capability_verified === true,
      'qa_v3_daily_owner_not_verified',
      { sample: index + 1 }
    )
    addError(
      errors,
      Number.isInteger(daily.main_pid) &&
        Number.isInteger(qa.main_pid) &&
        daily.pids?.includes(daily.main_pid) &&
        qa.pids?.includes(qa.main_pid) &&
        daily.main_pid !== qa.main_pid,
      'qa_v3_auth_main_owner_pid_unverified',
      { sample: index + 1, daily_pid: daily.main_pid || null, qa_pid: qa.main_pid || null }
    )
    addError(
      errors,
      nonEmptyString(daily.process_start_identity) &&
        nonEmptyString(qa.process_start_identity) &&
        daily.process_start_identity !== qa.process_start_identity,
      'qa_v3_auth_process_start_identity_unverified',
      { sample: index + 1 }
    )
    addError(
      errors,
      Array.isArray(daily.pids) &&
        Array.isArray(qa.pids) &&
        daily.pids.every(pid => !qa.pids.includes(pid)),
      'qa_v3_auth_owner_pids_not_distinct',
      { sample: index + 1 }
    )
    addError(
      errors,
      nonEmptyString(daily.main_command) &&
        nonEmptyString(qa.main_command) &&
        /--ide-http-port(?:\s+|=)9423(?:\s|$)/u.test(daily.main_command) &&
        /--remote-port(?:\s+|=)3798(?:\s|$)/u.test(daily.main_command) &&
        /--ide-http-port(?:\s+|=)9422(?:\s|$)/u.test(qa.main_command) &&
        /--remote-port(?:\s+|=)3799(?:\s|$)/u.test(qa.main_command),
      'qa_v3_auth_fixed_ports_not_in_process_commands',
      { sample: index + 1 }
    )
    addError(errors, qa.active === true, 'qa_v3_qa_process_not_active', { sample: index + 1 })
    addError(
      errors,
      nonEmptyString(daily.profile) && nonEmptyString(qa.profile) && daily.profile !== qa.profile,
      'qa_v3_profiles_not_distinct',
      { sample: index + 1, daily: daily.profile || null, qa: qa.profile || null }
    )
    addError(
      errors,
      identities.every(value => /^[a-f0-9]{64}$/u.test(String(value || ''))) &&
        new Set(identities).size === 1,
      'qa_v3_identity_not_consistent',
      { sample: index + 1, identities }
    )
    const materials = [daily.auth_material, qa.auth_material, shared.auth_material]
    for (const field of ['identity_hash', 'signature_hash', 'ticket_hash']) {
      const values = materials.map(material => material?.[field] ?? null)
      addError(
        errors,
        Boolean(values[0]) && values.every(value => value === values[0]),
        'qa_v3_auth_profile_ticket_mismatch',
        { sample: index + 1, field, values }
      )
    }
    for (const field of ['ticket_expired_at', 'signature_expired_at']) {
      const values = materials.map(material => Number(material?.[field] || 0))
      const finite = values.every(value => Number.isFinite(value) && value > 0)
      const drift = finite ? Math.max(...values) - Math.min(...values) : Infinity
      addError(
        errors,
        finite && drift <= AUTH_EXPIRY_SERIALIZATION_TOLERANCE_MS,
        'qa_v3_auth_profile_ticket_mismatch',
        {
          sample: index + 1,
          field,
          values,
          max_drift_ms: Number.isFinite(drift) ? drift : null,
          allowed_drift_ms: AUTH_EXPIRY_SERIALIZATION_TOLERANCE_MS
        }
      )
    }
    addError(errors, qa.auth_manifest?.runtime_ready === true, 'qa_v3_qa_auth_not_runtime_ready', {
      sample: index + 1
    })
    addError(errors, qa.bundle_verified === true, 'qa_v3_qa_bundle_unverified', {
      sample: index + 1
    })
    addError(
      errors,
      qa.auth_material_source === 'broker_effective_shared',
      'qa_v3_effective_ticket_source_unproven',
      { sample: index + 1, source: qa.auth_material_source || null }
    )
    addError(
      errors,
      ['daily', 'broker_observed_daily', 'qa-auth-broker'].includes(shared.source_role) &&
        shared.writer_role === 'qa-auth-broker' &&
        Number.isFinite(Number(shared.updated_at_ms)) &&
        Number(shared.updated_at_ms) > 0,
      'qa_v3_single_writer_source_unverified',
      {
        sample: index + 1,
        source_role: shared.source_role || null,
        writer_role: shared.writer_role || null,
        updated_at_ms: shared.updated_at_ms || null
      }
    )
    const consumption = observed.auth_consumption || qa.auth_consumption || null
    const sampleCapturedAt = Date.parse(observed.captured_at || '')
    const consumedAt = Number(consumption?.consumed_at_ms)
    addError(
      errors,
      consumption?.role === 'qa' &&
        isAcceptedAuthConsumptionSource(consumption.source, consumption.role) &&
        typeof consumption.event_id === 'string' &&
        consumption.event_id.length > 0 &&
        Number(consumption.pid) === Number(qa.main_pid) &&
        consumption.process_start_identity === qa.process_start_identity &&
        normalizePath(consumption.profile_realpath) === normalizePath(qa.profile) &&
        Number(consumption.auth_generation) === Number(shared.auth_generation) &&
        consumption.identity_hash === shared.auth_material?.identity_hash &&
        consumption.ticket_hash === shared.auth_material?.ticket_hash &&
        Number.isFinite(sampleCapturedAt) &&
        Number.isFinite(consumedAt) &&
        consumedAt <= sampleCapturedAt &&
        sampleCapturedAt - consumedAt <= 120_000,
      'qa_v3_auth_consumption_receipt_invalid',
      {
        sample: index + 1,
        observed: consumption,
        captured_at: observed.captured_at || null
      }
    )
    addError(
      errors,
      qa.auth_manifest?.identity_hash === qa.identity_hash &&
        qa.auth_manifest?.identity_hash === shared.identity_hash,
      'qa_v3_auth_manifest_identity_mismatch',
      { sample: index + 1 }
    )
    addError(
      errors,
      qa.auth_manifest?.auth_generation === shared.auth_generation,
      'qa_v3_auth_manifest_generation_mismatch',
      { sample: index + 1 }
    )
    addError(
      errors,
      ports.ownership?.daily === true && ports.ownership?.qa === true,
      'qa_v3_port_ownership_not_verified',
      { sample: index + 1 }
    )
    const portValues = [
      ports.daily?.control,
      ports.daily?.service,
      ports.qa?.control,
      ports.qa?.service
    ]
    addError(
      errors,
      portValues.every(Number.isInteger) && new Set(portValues).size === 4,
      'qa_v3_auth_ports_not_distinct',
      { sample: index + 1, ports: portValues }
    )
    addError(
      errors,
      Number.isInteger(shared.auth_generation) &&
        shared.auth_generation > 0 &&
        shared.ticket_expired_at > Date.parse(sample.observed.captured_at || '') + 5000 &&
        shared.signature_expired_at > Date.parse(sample.observed.captured_at || '') + 5000,
      'qa_v3_shared_auth_not_fresh_at_sample',
      { sample: index + 1 }
    )
  }
  const firstSampleIdentity = sampleIdentities[0]
  addError(
    errors,
    Boolean(firstSampleIdentity) &&
      sampleIdentities.every(
        identity => JSON.stringify(identity) === JSON.stringify(firstSampleIdentity)
      ),
    'qa_v3_auth_identity_changed_between_samples',
    { observed: sampleIdentities }
  )
  const continuity = report?.continuity
  addError(errors, continuity?.status === 'passed', 'qa_v3_auth_continuity_not_passed', {
    status: continuity?.status || null
  })
  addError(
    errors,
    Number(continuity?.required_duration_ms) === AUTH_CONTINUITY_DURATION_MS &&
      Number(continuity?.required_samples) === AUTH_CONTINUITY_MIN_SAMPLES &&
      Number(continuity?.runtime_probe_interval_samples) ===
        AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES &&
      Number(continuity?.required_runtime_probes) === AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES,
    'qa_v3_auth_continuity_contract_invalid',
    {
      required_duration_ms: continuity?.required_duration_ms ?? null,
      required_samples: continuity?.required_samples ?? null,
      runtime_probe_interval_samples: continuity?.runtime_probe_interval_samples ?? null,
      required_runtime_probes: continuity?.required_runtime_probes ?? null
    }
  )
  addError(
    errors,
    Number(continuity?.duration_ms) >= AUTH_CONTINUITY_DURATION_MS,
    'qa_v3_auth_continuity_duration_invalid',
    {
      observed_duration_ms: continuity?.duration_ms ?? null,
      required_duration_ms: AUTH_CONTINUITY_DURATION_MS
    }
  )
  addError(
    errors,
    Array.isArray(continuity?.samples) && continuity.samples.length >= AUTH_CONTINUITY_MIN_SAMPLES,
    'qa_v3_auth_continuity_sample_count_invalid',
    {
      observed_samples: continuity?.samples?.length ?? null,
      required_samples: AUTH_CONTINUITY_MIN_SAMPLES
    }
  )
  addError(
    errors,
    Number(continuity?.runtime_probe_count) >= AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES,
    'qa_v3_auth_runtime_probe_count_invalid',
    {
      observed: continuity?.runtime_probe_count ?? null,
      required: AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES
    }
  )
  const continuitySamples = Array.isArray(continuity?.samples) ? continuity.samples : []
  const runtimeProbeSamples = continuitySamples.filter(
    (_, index) => (index + 1) % AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES === 0
  )
  addError(
    errors,
    runtimeProbeSamples.length >= AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES &&
      runtimeProbeSamples.every(
        sample =>
          sample?.runtime_probe?.status === 'passed' &&
          Number(sample.runtime_probe.generation) >= Number(sample.auth_generation) &&
          sample.runtime_probe.identity_hash === sample.identity?.shared_identity_hash &&
          sample.runtime_probe.daily_runtime?.status === 'passed' &&
          sample.runtime_probe.daily_runtime?.managed === true &&
          sample.runtime_probe.daily_runtime?.identity_required === true &&
          sample.runtime_probe.daily_runtime?.identity_resolved === true &&
          sample.runtime_probe.daily_runtime?.cleanup_passed === true &&
          ['passed', 'not_required'].includes(
            sample.runtime_probe.daily_runtime?.auth_consumption_ack?.status
          ) &&
          (sample.runtime_probe.daily_runtime?.auth_consumption_ack?.status === 'passed' ||
            sample.runtime_probe.daily_runtime?.auth_consumption_ack?.code ===
              'qa_auth_daily_consumption_ack_not_required') &&
          Number(sample.runtime_probe.daily_runtime?.response_code) === 200 &&
          Number(sample.runtime_probe.daily_runtime?.main_pid) > 0
      ),
    'qa_v3_auth_runtime_probe_evidence_invalid',
    {
      expected_probes: AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES,
      observed_probes: runtimeProbeSamples.map(sample => sample?.runtime_probe || null)
    }
  )
  let previousContinuityGeneration = null
  for (const [index, sample] of continuitySamples.entries()) {
    const generation = Number(sample?.auth_generation || 0) || null
    if (previousContinuityGeneration !== null && generation < previousContinuityGeneration) {
      errors.push({
        code: 'qa_v3_auth_continuity_generation_regressed',
        sample: index + 1,
        previous_generation: previousContinuityGeneration,
        observed_generation: generation
      })
    }
    if (previousContinuityGeneration !== null && generation > previousContinuityGeneration) {
      const consumption = sample?.auth_consumption
      const updatedAt = Number(sample?.updated_at_ms)
      const consumedAt = Number(consumption?.consumed_at_ms)
      addError(
        errors,
        Number(consumption?.auth_generation) === generation &&
          typeof consumption?.event_id === 'string' &&
          consumption.event_id.length > 0 &&
          Number.isFinite(updatedAt) &&
          Number.isFinite(consumedAt) &&
          consumedAt >= updatedAt,
        'qa_v3_auth_generation_consumption_unverified',
        { sample: index + 1, previous_generation: previousContinuityGeneration, sample }
      )
    }
    previousContinuityGeneration = generation
  }
  const continuityIdentity = continuity?.baseline_identity
  addError(
    errors,
    isObject(continuityIdentity) &&
      Array.isArray(continuity?.samples) &&
      continuity.samples.every(
        sample =>
          sample?.passed === true &&
          JSON.stringify(sample.identity || null) === JSON.stringify(continuityIdentity)
      ),
    'qa_v3_auth_continuity_identity_changed',
    { baseline_identity: continuityIdentity || null }
  )
}

function validateColdStartReport(report, errors, expectedDispatchRunId, expectedRunInstanceId) {
  addError(
    errors,
    report?.dispatch_run_id === expectedDispatchRunId,
    'qa_v3_report_dispatch_run_mismatch',
    {
      label: 'cold_start',
      expected: expectedDispatchRunId,
      observed: report?.dispatch_run_id || null
    }
  )
  addError(
    errors,
    report?.run_instance_id === expectedRunInstanceId,
    'qa_v3_cold_start_report_run_instance_mismatch',
    { expected: expectedRunInstanceId, observed: report?.run_instance_id || null }
  )
  addError(errors, report?.status === 'passed', 'qa_v3_cold_start_not_passed', {
    status: report?.status
  })
  addError(
    errors,
    report?.target_attempts === AUTOMATOR_V3_COLD_STARTS,
    'qa_v3_cold_start_target_invalid',
    { observed: report?.target_attempts ?? null }
  )
  addError(
    errors,
    report?.health_samples_per_generation === AUTOMATOR_V3_DOCTOR_SAMPLES,
    'qa_v3_cold_start_doctor_target_invalid',
    { observed: report?.health_samples_per_generation ?? null }
  )
  addError(
    errors,
    Array.isArray(report?.iterations) && report.iterations.length === AUTOMATOR_V3_COLD_STARTS,
    'qa_v3_cold_start_iteration_count_invalid',
    { observed: report?.iterations?.length ?? null }
  )
  const coldIdentities = []
  for (const [index, iteration] of (report?.iterations || []).entries()) {
    addError(errors, iteration.status === 'passed', 'qa_v3_cold_start_iteration_failed', {
      iteration: index + 1,
      failures: iteration.failures || []
    })
    addError(errors, hasNoFailures(iteration), 'qa_v3_cold_start_iteration_has_failures', {
      iteration: index + 1
    })
    addError(
      errors,
      Array.isArray(iteration.doctor_samples) &&
        iteration.doctor_samples.length === AUTOMATOR_V3_DOCTOR_SAMPLES &&
        iteration.doctor_samples.every(sample => sample.passed === true && hasNoFailures(sample)),
      'qa_v3_cold_start_doctor_samples_invalid',
      { iteration: index + 1 }
    )
    for (const [sampleIndex, sample] of (iteration.doctor_samples || []).entries()) {
      validateDoctorEvidence(
        sample,
        errors,
        `cold_start.${index + 1}.doctor.${sampleIndex + 1}`,
        expectedDispatchRunId,
        expectedRunInstanceId
      )
    }
    addError(
      errors,
      sameDoctorIdentity(iteration.doctor_samples || []),
      'qa_v3_cold_start_identity_not_stable_within_iteration',
      { iteration: index + 1 }
    )
    addError(
      errors,
      identitiesMatch(
        commandIdentity(iteration.bootstrap),
        doctorIdentity(iteration.doctor_samples?.[0])
      ),
      'qa_v3_cold_start_bootstrap_identity_mismatch',
      { iteration: index + 1 }
    )
    coldIdentities.push(doctorIdentityKey(iteration.doctor_samples?.[0]))
    addError(
      errors,
      iteration.bootstrap?.status === 0 && iteration.bootstrap?.value?.status === 'ready',
      'qa_v3_cold_start_bootstrap_command_invalid',
      { iteration: index + 1 }
    )
    addError(
      errors,
      iteration.stop?.raw?.status === 0 &&
        iteration.stop?.status === 'ready' &&
        iteration.stop?.code === 'qa_runtime_stopped',
      'qa_v3_cold_start_cleanup_invalid',
      { iteration: index + 1 }
    )
  }
  const coldIdentityValues = coldIdentities.map(value => JSON.parse(value))
  const coldGenerations = coldIdentityValues.map(value => value.generation)
  const coldProcessIdentities = coldIdentityValues.map(value =>
    JSON.stringify({
      supervisor_pid: value.supervisor_pid,
      devtools_pid: value.devtools_pid,
      local_runtime_pid: value.local_runtime_pid,
      process_start_identity: value.process_start_identity,
      session_id: value.session_id
    })
  )
  addError(
    errors,
    coldGenerations.every(Number.isInteger) &&
      coldGenerations.length > 0 &&
      coldGenerations.every(value => value === coldGenerations[0]),
    'qa_v3_cold_start_generation_changed_across_iterations',
    { observed: coldGenerations }
  )
  addError(
    errors,
    coldProcessIdentities.length === new Set(coldProcessIdentities).size,
    'qa_v3_cold_start_process_identity_reused_across_iterations',
    { observed: coldProcessIdentities }
  )
}

function validateWarmReport(report, errors, expectedDispatchRunId, expectedRunInstanceId) {
  addError(
    errors,
    report?.dispatch_run_id === expectedDispatchRunId,
    'qa_v3_report_dispatch_run_mismatch',
    { label: 'warm', expected: expectedDispatchRunId, observed: report?.dispatch_run_id || null }
  )
  addError(
    errors,
    report?.run_instance_id === expectedRunInstanceId,
    'qa_v3_warm_report_run_instance_mismatch',
    { expected: expectedRunInstanceId, observed: report?.run_instance_id || null }
  )
  addError(errors, report?.status === 'passed', 'qa_v3_warm_not_passed', {
    status: report?.status
  })
  const warmCatalogIds = Array.isArray(report?.catalog_ids) ? [...report.catalog_ids].sort() : []
  addError(
    errors,
    warmCatalogIds.length === AUTOMATOR_V3_WARM_CATALOG_IDS.length &&
      JSON.stringify(warmCatalogIds) === JSON.stringify([...AUTOMATOR_V3_WARM_CATALOG_IDS].sort()),
    'qa_v3_warm_catalog_set_invalid',
    { observed: warmCatalogIds, expected: [...AUTOMATOR_V3_WARM_CATALOG_IDS].sort() }
  )
  const warmRunIds = (report?.runs || []).map(run => run?.catalog_id).sort()
  addError(
    errors,
    warmRunIds.length === AUTOMATOR_V3_WARM_CATALOG_IDS.length &&
      new Set(warmRunIds).size === warmRunIds.length &&
      JSON.stringify(warmRunIds) === JSON.stringify([...AUTOMATOR_V3_WARM_CATALOG_IDS].sort()),
    'qa_v3_warm_run_catalog_set_invalid',
    { observed: warmRunIds, expected: [...AUTOMATOR_V3_WARM_CATALOG_IDS].sort() }
  )
  addError(
    errors,
    report?.completed_runs === AUTOMATOR_V3_WARM_RUNS &&
      Array.isArray(report?.runs) &&
      report.runs.length === AUTOMATOR_V3_WARM_RUNS,
    'qa_v3_warm_run_count_invalid',
    { completed: report?.completed_runs ?? null, observed: report?.runs?.length ?? null }
  )
  const baseline = report?.baseline
  const catalogEntries = readCatalogEntries(repoRoot)
  for (const [index, run] of (report?.runs || []).entries()) {
    addError(errors, run.status === 'passed', 'qa_v3_warm_run_failed', { run: index + 1 })
    addError(errors, hasNoFailures(run), 'qa_v3_warm_run_has_failures', { run: index + 1 })
    addError(
      errors,
      run.qa?.status === 0 && run.qa?.value?.status === 'passed',
      'qa_v3_warm_qa_command_invalid',
      { run: index + 1 }
    )
    const expectedCatalogId = run.catalog_id
    addError(
      errors,
      nonEmptyString(expectedCatalogId) &&
        AUTOMATOR_V3_WARM_CATALOG_IDS.includes(expectedCatalogId),
      'qa_v3_warm_catalog_id_invalid',
      { run: index + 1, observed: expectedCatalogId || null }
    )
    validateLeafEvidence(
      run.qa,
      errors,
      `warm.${index + 1}`,
      expectedDispatchRunId,
      expectedRunInstanceId,
      expectedCatalogId,
      true,
      catalogEntries.find(entry => entry.id === expectedCatalogId) || null
    )
    addError(
      errors,
      run.catalog_id === run.qa?.value?.catalog_id,
      'qa_v3_warm_catalog_id_mismatch',
      {
        run: index + 1,
        expected: run.catalog_id || null,
        observed: run.qa?.value?.catalog_id || null
      }
    )
    addError(
      errors,
      run.before?.generation === baseline?.generation &&
        run.after?.generation === baseline?.generation &&
        run.before?.devtoolsPid === baseline?.devtoolsPid &&
        run.after?.devtoolsPid === baseline?.devtoolsPid,
      'qa_v3_warm_generation_or_devtools_changed',
      { run: index + 1 }
    )
    addError(
      errors,
      run.qa?.value?.preflight?.targeted_restart?.attempted !== true &&
        run.qa?.value?.full_lan_rebuild_requested !== true &&
        run.qa?.value?.fixture_runtime_recovery?.required !== true &&
        run.qa?.value?.runtime_evidence?.bootstrap_preflight?.targeted_restart?.attempted !== true,
      'qa_v3_warm_recovery_or_rebuild_used',
      { run: index + 1 }
    )
  }
  addError(errors, !report?.cleanup_failure, 'qa_v3_warm_cleanup_failed', {
    failure: report?.cleanup_failure || null
  })
}

function validateLiveReport(
  report,
  errors,
  expectedLiveIds,
  expectedDispatchRunId,
  expectedRunInstanceId
) {
  addError(
    errors,
    report?.dispatch_run_id === expectedDispatchRunId,
    'qa_v3_report_dispatch_run_mismatch',
    { label: 'live', expected: expectedDispatchRunId, observed: report?.dispatch_run_id || null }
  )
  const catalogEntries = readCatalogEntries(repoRoot)
  addError(
    errors,
    report?.run_instance_id === expectedRunInstanceId,
    'qa_v3_live_report_run_instance_mismatch',
    { expected: expectedRunInstanceId, observed: report?.run_instance_id || null }
  )
  const runIds = (report?.runs || []).map(run => run?.catalog_id).sort()
  const runCounts = new Map()
  for (const run of report?.runs || []) {
    runCounts.set(run?.catalog_id, (runCounts.get(run?.catalog_id) || 0) + 1)
  }
  const expectedRunCounts = Object.fromEntries(
    expectedLiveIds.map(catalogId => [catalogId, AUTOMATOR_V3_LIVE_REPEAT_COUNT])
  )
  addError(
    errors,
    runIds.length === expectedLiveIds.length * AUTOMATOR_V3_LIVE_REPEAT_COUNT &&
      expectedLiveIds.every(
        catalogId => runCounts.get(catalogId) === AUTOMATOR_V3_LIVE_REPEAT_COUNT
      ) &&
      [...runCounts.keys()].every(catalogId => expectedLiveIds.includes(catalogId)),
    'qa_v3_live_run_catalog_set_invalid',
    { observed: runIds, expected: expectedRunCounts }
  )
  addError(errors, report?.status === 'passed', 'qa_v3_live_matrix_not_passed', {
    status: report?.status
  })
  addError(
    errors,
    report?.infrastructure_status === 'passed',
    'qa_v3_live_infrastructure_status_invalid',
    { status: report?.infrastructure_status || null }
  )
  addError(errors, report?.business_status === 'passed', 'qa_v3_live_business_status_invalid', {
    status: report?.business_status || null
  })
  addError(
    errors,
    report?.auth_watchdog?.status === 'passed' && !report.auth_watchdog.primary_failure,
    'qa_v3_live_auth_watchdog_invalid',
    { auth_watchdog: report?.auth_watchdog || null }
  )
  const ids = Array.isArray(report?.catalog_ids) ? [...report.catalog_ids].sort() : []
  addError(
    errors,
    ids.length === expectedLiveIds.length &&
      JSON.stringify(ids) === JSON.stringify(expectedLiveIds),
    'qa_v3_live_catalog_set_invalid',
    { observed: ids, expected: expectedLiveIds }
  )
  addError(
    errors,
    report?.repeat_count === AUTOMATOR_V3_LIVE_REPEAT_COUNT &&
      report?.completed_runs === expectedLiveIds.length * AUTOMATOR_V3_LIVE_REPEAT_COUNT &&
      Array.isArray(report?.runs) &&
      report.runs.length === expectedLiveIds.length * AUTOMATOR_V3_LIVE_REPEAT_COUNT,
    'qa_v3_live_run_count_invalid',
    {
      expected: expectedLiveIds.length * AUTOMATOR_V3_LIVE_REPEAT_COUNT,
      expected_repeat_count: AUTOMATOR_V3_LIVE_REPEAT_COUNT,
      observed_repeat_count: report?.repeat_count ?? null,
      completed: report?.completed_runs ?? null,
      observed: report?.runs?.length ?? null
    }
  )
  const repeatKeys = new Set()
  for (const [index, run] of (report?.runs || []).entries()) {
    addError(errors, run.status === 'passed', 'qa_v3_live_run_failed', { run: index + 1 })
    addError(errors, hasNoFailures(run), 'qa_v3_live_run_has_failures', { run: index + 1 })
    addError(
      errors,
      run.qa?.status === 0 && run.qa?.value?.status === 'passed',
      'qa_v3_live_qa_command_invalid',
      { run: index + 1 }
    )
    const expectedCatalogId = run.catalog_id
    const repeatIndex = Number(run.repeat_index)
    const repeatKey = `${expectedCatalogId}:${repeatIndex}`
    repeatKeys.add(repeatKey)
    addError(
      errors,
      Number.isInteger(repeatIndex) &&
        repeatIndex >= 1 &&
        repeatIndex <= AUTOMATOR_V3_LIVE_REPEAT_COUNT,
      'qa_v3_live_repeat_index_invalid',
      { run: index + 1, repeat_index: run.repeat_index ?? null }
    )
    addError(
      errors,
      nonEmptyString(expectedCatalogId) && expectedLiveIds.includes(expectedCatalogId),
      'qa_v3_live_catalog_id_invalid',
      { run: index + 1, observed: expectedCatalogId || null }
    )
    validateLeafEvidence(
      run.qa,
      errors,
      `live.${index + 1}`,
      expectedDispatchRunId,
      expectedRunInstanceId,
      expectedCatalogId,
      true,
      catalogEntries.find(entry => entry.id === expectedCatalogId) || null
    )
    addError(
      errors,
      run.catalog_id === run.qa?.value?.catalog_id,
      'qa_v3_live_catalog_id_mismatch',
      {
        run: index + 1,
        expected: run.catalog_id || null,
        observed: run.qa?.value?.catalog_id || null
      }
    )
    addError(
      errors,
      liveRecoveryOrRebuildPassed(run.qa?.value),
      'qa_v3_live_recovery_or_rebuild_used',
      {
        run: index + 1
      }
    )
  }
  addError(
    errors,
    repeatKeys.size === expectedLiveIds.length * AUTOMATOR_V3_LIVE_REPEAT_COUNT &&
      expectedLiveIds.every(catalogId =>
        Array.from({ length: AUTOMATOR_V3_LIVE_REPEAT_COUNT }, (_, index) =>
          repeatKeys.has(`${catalogId}:${index + 1}`)
        ).every(Boolean)
      ),
    'qa_v3_live_repeat_set_invalid',
    { observed: [...repeatKeys], expected_repeat_count: AUTOMATOR_V3_LIVE_REPEAT_COUNT }
  )
  addError(errors, !report?.cleanup_failure, 'qa_v3_live_matrix_cleanup_failed', {
    failure: report?.cleanup_failure || null
  })
}

function validateSoakReport(report, errors, expectedDispatchRunId, expectedRunInstanceId) {
  addError(
    errors,
    report?.dispatch_run_id === expectedDispatchRunId,
    'qa_v3_report_dispatch_run_mismatch',
    { label: 'soak', expected: expectedDispatchRunId, observed: report?.dispatch_run_id || null }
  )
  addError(
    errors,
    report?.run_instance_id === expectedRunInstanceId,
    'qa_v3_soak_report_run_instance_mismatch',
    { expected: expectedRunInstanceId, observed: report?.run_instance_id || null }
  )
  addError(errors, report?.status === 'passed', 'qa_v3_soak_not_passed', {
    status: report?.status
  })
  addError(
    errors,
    report?.auth_watchdog?.status === 'passed' && !report.auth_watchdog.primary_failure,
    'qa_v3_soak_auth_watchdog_invalid',
    { auth_watchdog: report?.auth_watchdog || null }
  )
  addError(
    errors,
    report?.reliability_contract === 'tiered_real_cold_start_plus_fast_control_plane_probe',
    'qa_v3_reliability_contract_invalid',
    { observed: report?.reliability_contract || null }
  )
  addError(
    errors,
    report?.target_cold_start_attempts === AUTOMATOR_V3_RELIABILITY_COLD_STARTS &&
      report?.completed_attempts === AUTOMATOR_V3_RELIABILITY_COLD_STARTS &&
      report?.failed_attempts === 0 &&
      report?.iteration_budget_ms === AUTOMATOR_SOAK_ITERATION_BUDGET_MS &&
      report?.total_budget_ms === AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS,
    'qa_v3_reliability_cold_start_count_invalid',
    {
      target: report?.target_cold_start_attempts ?? null,
      completed: report?.completed_attempts ?? null,
      failed: report?.failed_attempts ?? null,
      iteration_budget_ms: report?.iteration_budget_ms ?? null,
      total_budget_ms: report?.total_budget_ms ?? null
    }
  )
  addError(
    errors,
    Number(report?.total_duration_ms) <= AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS,
    'qa_v3_reliability_total_budget_exceeded',
    {
      duration_ms: report?.total_duration_ms ?? null,
      budget_ms: AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS
    }
  )
  addError(
    errors,
    Array.isArray(report?.iterations) &&
      report.iterations.length === AUTOMATOR_V3_RELIABILITY_COLD_STARTS,
    'qa_v3_reliability_cold_start_iteration_count_invalid',
    { observed: report?.iterations?.length ?? null }
  )
  const soakIdentities = []
  for (const [index, iteration] of (report?.iterations || []).entries()) {
    if (iteration.status !== 'passed' || !hasNoFailures(iteration)) {
      addError(errors, false, 'qa_v3_soak_iteration_failed', { iteration: index + 1 })
    }
    addError(
      errors,
      Array.isArray(iteration.doctor_samples) &&
        iteration.doctor_samples.length === AUTOMATOR_V3_DOCTOR_SAMPLES &&
        iteration.doctor_samples.every(sample => sample.passed === true && hasNoFailures(sample)),
      'qa_v3_soak_doctor_samples_invalid',
      { iteration: index + 1 }
    )
    for (const [sampleIndex, sample] of (iteration.doctor_samples || []).entries()) {
      validateDoctorEvidence(
        sample,
        errors,
        `soak.${index + 1}.doctor.${sampleIndex + 1}`,
        expectedDispatchRunId,
        expectedRunInstanceId
      )
    }
    addError(
      errors,
      sameDoctorIdentity(iteration.doctor_samples || []),
      'qa_v3_soak_identity_not_stable_within_iteration',
      { iteration: index + 1 }
    )
    addError(
      errors,
      identitiesMatch(
        commandIdentity(iteration.bootstrap),
        doctorIdentity(iteration.doctor_samples?.[0])
      ),
      'qa_v3_soak_bootstrap_identity_mismatch',
      { iteration: index + 1 }
    )
    soakIdentities.push(doctorIdentityKey(iteration.doctor_samples?.[0]))
    addError(
      errors,
      iteration.bootstrap?.status === 0 && iteration.bootstrap?.value?.status === 'ready',
      'qa_v3_soak_bootstrap_command_invalid',
      { iteration: index + 1 }
    )
    addError(
      errors,
      iteration.stop?.status === 0 &&
        iteration.stop?.value?.status === 'ready' &&
        iteration.stop?.value?.code === 'qa_runtime_stopped',
      'qa_v3_soak_cleanup_invalid',
      { iteration: index + 1 }
    )
    addError(
      errors,
      Number(iteration.duration_ms) <= AUTOMATOR_SOAK_ITERATION_BUDGET_MS &&
        !iteration.failures?.some(failure => failure.code === 'qa_soak_iteration_budget_exceeded'),
      'qa_v3_soak_iteration_budget_exceeded',
      {
        iteration: index + 1,
        duration_ms: iteration.duration_ms ?? null,
        budget_ms: AUTOMATOR_SOAK_ITERATION_BUDGET_MS
      }
    )
  }
  const coldStartIdentityValues = soakIdentities.map(value => JSON.parse(value))
  const coldStartGenerations = coldStartIdentityValues.map(value => value.generation)
  const coldStartProcessIdentities = coldStartIdentityValues.map(value =>
    JSON.stringify({
      supervisor_pid: value.supervisor_pid,
      devtools_pid: value.devtools_pid,
      local_runtime_pid: value.local_runtime_pid,
      process_start_identity: value.process_start_identity,
      session_id: value.session_id
    })
  )
  addError(
    errors,
    coldStartGenerations.every(Number.isInteger) &&
      coldStartGenerations.length > 0 &&
      coldStartGenerations.every(value => value === coldStartGenerations[0]),
    'qa_v3_reliability_generation_changed_across_cold_starts',
    { observed: coldStartGenerations }
  )
  addError(
    errors,
    coldStartProcessIdentities.length === new Set(coldStartProcessIdentities).size,
    'qa_v3_reliability_process_identity_reused_across_cold_starts',
    {
      observed_count: coldStartProcessIdentities.length,
      unique_count: new Set(coldStartProcessIdentities).size
    }
  )
  const fastProbe = report?.fast_probe
  addError(
    errors,
    fastProbe?.status === 'passed' &&
      fastProbe?.target_cycles === AUTOMATOR_V3_FAST_PROBE_CYCLES &&
      fastProbe?.completed_cycles === AUTOMATOR_V3_FAST_PROBE_CYCLES &&
      fastProbe?.duration_ms <= AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS &&
      fastProbe?.stop?.status === 0 &&
      fastProbe?.stop?.value?.status === 'ready' &&
      fastProbe?.stop?.value?.code === 'qa_runtime_stopped',
    'qa_v3_fast_probe_gate_invalid',
    {
      status: fastProbe?.status || null,
      target_cycles: fastProbe?.target_cycles ?? null,
      completed_cycles: fastProbe?.completed_cycles ?? null,
      duration_ms: fastProbe?.duration_ms ?? null,
      budget_ms: AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS
    }
  )
  addError(
    errors,
    Array.isArray(fastProbe?.samples) &&
      fastProbe.samples.length === AUTOMATOR_V3_FAST_PROBE_CYCLES &&
      fastProbe.samples.every(sample => sample?.passed === true && hasNoFailures(sample)),
    'qa_v3_fast_probe_samples_invalid',
    { observed: fastProbe?.samples?.length ?? null }
  )
  const fastProbeIdentityKeys = (fastProbe?.samples || []).map(sample =>
    JSON.stringify(sample.identity || null)
  )
  addError(
    errors,
    fastProbeIdentityKeys.length > 0 &&
      fastProbeIdentityKeys.every(value => value === fastProbeIdentityKeys[0]),
    'qa_v3_fast_probe_identity_changed',
    { observed_count: fastProbeIdentityKeys.length }
  )
  addError(
    errors,
    fastProbe?.bootstrap?.status === 0 && fastProbe?.bootstrap?.value?.status === 'ready',
    'qa_v3_fast_probe_bootstrap_invalid',
    { status: fastProbe?.bootstrap?.status ?? null }
  )
}

export function validateAutomatorV3FinalGateReports({
  authReport,
  coldStartReport,
  warmReport,
  liveReport,
  soakReport,
  liveCatalogIds,
  dispatchRunId,
  runInstanceId
} = {}) {
  const errors = []
  addError(errors, isObject(authReport), 'qa_v3_auth_report_invalid')
  addError(errors, isObject(coldStartReport), 'qa_v3_cold_start_report_invalid')
  addError(errors, isObject(warmReport), 'qa_v3_warm_report_invalid')
  addError(errors, isObject(liveReport), 'qa_v3_live_report_invalid')
  addError(errors, isObject(soakReport), 'qa_v3_soak_report_invalid')
  for (const [label, report] of Object.entries({
    auth: authReport,
    cold_start: coldStartReport,
    warm: warmReport,
    live: liveReport,
    soak: soakReport
  })) {
    addError(
      errors,
      nonEmptyString(runInstanceId) && report?.run_instance_id === runInstanceId,
      'qa_v3_report_run_instance_mismatch',
      { label, expected: runInstanceId || null, observed: report?.run_instance_id || null }
    )
  }
  if (isObject(authReport)) {
    validateAuthReport(authReport, errors, dispatchRunId, runInstanceId)
  }
  if (isObject(coldStartReport)) {
    validateColdStartReport(coldStartReport, errors, dispatchRunId, runInstanceId)
  }
  if (isObject(warmReport)) {
    validateWarmReport(warmReport, errors, dispatchRunId, runInstanceId)
  }
  if (isObject(liveReport)) {
    validateLiveReport(
      liveReport,
      errors,
      [...(liveCatalogIds || [])].sort(),
      dispatchRunId,
      runInstanceId
    )
  }
  if (isObject(soakReport)) {
    validateSoakReport(soakReport, errors, dispatchRunId, runInstanceId)
  }
  return { passed: errors.length === 0, errors }
}

export function validateAutomatorV3FinalGateManifest(manifest, { root = repoRoot } = {}) {
  const errors = []
  addError(errors, isObject(manifest), 'qa_v3_final_gate_manifest_invalid')
  if (!isObject(manifest)) {
    return { passed: false, errors }
  }
  addError(errors, manifest.schema_version === 1, 'qa_v3_final_gate_manifest_schema_invalid', {
    observed: manifest.schema_version ?? null
  })
  addError(
    errors,
    SAFE_ID.test(String(manifest.dispatch_run_id || '')),
    'qa_v3_final_gate_dispatch_run_id_invalid',
    { dispatch_run_id: manifest.dispatch_run_id || null }
  )
  addError(
    errors,
    SAFE_ID.test(String(manifest.run_instance_id || '')),
    'qa_v3_final_gate_run_instance_id_invalid',
    { run_instance_id: manifest.run_instance_id || null }
  )
  const labels = ['auth', 'cold_start', 'warm', 'live', 'soak']
  const reports = {}
  for (const label of labels) {
    const filePath = manifest.reports?.[label]
    addError(
      errors,
      isAllowedArtifactPath(filePath, manifest.dispatch_run_id, manifest.run_instance_id),
      'qa_v3_report_path_forbidden',
      { label, path: filePath || null }
    )
    const resolved = path.resolve(root, String(filePath || ''))
    addError(errors, fs.existsSync(resolved), 'qa_v3_report_missing', { label, path: resolved })
    if (fs.existsSync(resolved)) {
      reports[label] = readJson(resolved)
      addError(errors, !reports[label].__read_error, 'qa_v3_report_invalid_json', {
        label,
        path: resolved,
        error: reports[label].__read_error
      })
    }
  }
  let catalogLiveIds = []
  try {
    catalogLiveIds = readCatalogLiveIds(root)
  } catch (error) {
    errors.push({ code: 'qa_v3_live_catalog_unreadable', message: error.message })
  }
  const expectedLiveIds = Array.isArray(manifest.expected_live_catalog_ids)
    ? [...manifest.expected_live_catalog_ids].sort()
    : catalogLiveIds
  if (Array.isArray(manifest.expected_live_catalog_ids)) {
    addError(
      errors,
      JSON.stringify(expectedLiveIds) === JSON.stringify(catalogLiveIds),
      'qa_v3_live_catalog_manifest_mismatch',
      { observed: expectedLiveIds, expected: catalogLiveIds }
    )
  }
  addError(
    errors,
    expectedLiveIds.length === catalogLiveIds.length,
    'qa_v3_live_catalog_count_invalid',
    {
      observed: expectedLiveIds.length,
      expected: catalogLiveIds.length
    }
  )
  const businessCoveragePath = path.join(root, 'test/e2e/automator/business-coverage.json')
  let businessCoverage = null
  try {
    businessCoverage = JSON.parse(fs.readFileSync(businessCoveragePath, 'utf8'))
  } catch (error) {
    errors.push({
      code: 'qa_v3_business_coverage_missing',
      path: businessCoveragePath,
      message: error.message
    })
  }
  const coverageValidation = validateAutomatorV3BusinessCoverage(businessCoverage, { root })
  errors.push(...coverageValidation.errors)
  const reportsValidation = validateAutomatorV3FinalGateReports({
    authReport: reports.auth,
    coldStartReport: reports.cold_start,
    warmReport: reports.warm,
    liveReport: reports.live,
    soakReport: reports.soak,
    liveCatalogIds: expectedLiveIds,
    dispatchRunId: manifest.dispatch_run_id,
    runInstanceId: manifest.run_instance_id
  })
  errors.push(...reportsValidation.errors)
  return {
    passed: errors.length === 0,
    errors,
    expected_live_catalog_ids: expectedLiveIds,
    business_coverage: coverageValidation
  }
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index])
    if (!value.startsWith('--')) {
      continue
    }
    const [key, inline] = value.slice(2).split('=', 2)
    args[key] = inline ?? argv[++index]
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!SAFE_ID.test(String(args['dispatch-run-id'] || ''))) {
    throw new Error('dispatch-run-id 格式无效')
  }
  if (!SAFE_ID.test(String(args['run-instance-id'] || ''))) {
    throw new Error('run-instance-id 格式无效')
  }
  const outputDirectory = path.join(
    repoRoot,
    '.tmp',
    'dispatch-task',
    args['dispatch-run-id'],
    'qa-artifacts',
    args['run-instance-id'],
    'automator-v3-final-gate'
  )
  const manifest = {
    schema_version: 1,
    dispatch_run_id: args['dispatch-run-id'],
    run_instance_id: args['run-instance-id'],
    reports: {
      auth: path.resolve(args['auth-report'] || ''),
      cold_start: path.resolve(args['cold-start-report'] || ''),
      warm: path.resolve(args['warm-report'] || ''),
      live: path.resolve(args['live-report'] || ''),
      soak: path.resolve(args['soak-report'] || '')
    }
  }
  const validation = validateAutomatorV3FinalGateManifest(manifest)
  const report = {
    status: validation.passed ? 'passed' : 'blocked',
    gate: 'automator_v3_final_gate',
    ...manifest,
    validation
  }
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })
  fs.writeFileSync(
    path.join(outputDirectory, 'automator-v3-final-gate.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 }
  )
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = validation.passed ? 0 : 1
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try {
    main()
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', gate: 'automator_v3_final_gate', code: 'qa_v3_final_gate_configuration_invalid', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
