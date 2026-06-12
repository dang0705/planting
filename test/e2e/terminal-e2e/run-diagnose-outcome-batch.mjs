#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWithParsedArgs } from './cloudbase-http-check.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeCaseKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function normalizeObservedSymptomsInput(observedSymptoms = []) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : [])
    .map(item => ({
      symptomKey: String(item?.symptomKey || item?.symptom_key || '').trim(),
      symptomCn: String(
        item?.symptomCn || item?.symptom_cn || item?.displayTextCn || item?.display_text_cn || ''
      ).trim(),
      confidence: Number(item?.confidence || 0),
      source: String(item?.source || item?.sourceType || item?.source_type || 'user_answer').trim()
    }))
    .filter(item => item.symptomKey)
}

function buildObservedEvidenceSetFromSymptoms(observedSymptoms = [], caseKey = 'group') {
  return normalizeObservedSymptomsInput(observedSymptoms).map((item, index) => ({
    observedEvidenceSetId: `${caseKey}::${item.symptomKey || `evidence_${index + 1}`}`,
    evidenceKey: item.symptomKey,
    evidenceType: 'symptom',
    symptomKey: item.symptomKey,
    symptomCn: item.symptomCn || item.symptomKey,
    confidence: Number(item.confidence || 0),
    sourceType: item.source || 'user_answer',
    currentStatus: 'active',
    targetLayer: 'observed_evidence_set'
  }))
}

function normalizeObservedEvidenceSetInput(observedEvidenceSet = [], { fallbackSymptoms = [], caseKey = 'group' } = {}) {
  const explicitEvidenceItems = (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
    .map((item, index) => {
      const symptomKey = String(item?.symptomKey || item?.symptom_key || '').trim()
      const evidenceKey = String(
        item?.evidenceKey || item?.evidence_key || symptomKey || ''
      ).trim()
      const observedEvidenceSetId = String(
        item?.observedEvidenceSetId ||
          item?.observed_evidence_set_id ||
          `${caseKey}::${evidenceKey || `evidence_${index + 1}`}`
      ).trim()

      return {
        observedEvidenceSetId,
        evidenceKey,
        evidenceType: String(item?.evidenceType || item?.evidence_type || '').trim() || (symptomKey ? 'symptom' : ''),
        symptomKey,
        symptomCn: String(
          item?.symptomCn ||
            item?.symptom_cn ||
            item?.displayTextCn ||
            item?.display_text_cn ||
            symptomKey ||
            evidenceKey ||
            ''
        ).trim(),
        confidence: Number(item?.confidence || 0),
        sourceType: String(item?.sourceType || item?.source_type || 'user_answer').trim(),
        currentStatus: String(item?.currentStatus || item?.current_status || 'active').trim(),
        targetLayer: String(item?.targetLayer || item?.target_layer || 'observed_evidence_set').trim()
      }
    })
    .filter(item => item.observedEvidenceSetId && (item.evidenceKey || item.symptomKey))

  if (explicitEvidenceItems.length) {
    return explicitEvidenceItems
  }

  return buildObservedEvidenceSetFromSymptoms(fallbackSymptoms, caseKey)
}

function safeJsonParse(value, fallback) {
  if (!value) {return fallback}
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`无法解析 JSON: ${error.message}`)
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function isRetryableChildError(errorText = '') {
  const message = String(errorText || '').toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('enotfound') ||
    message.includes('econnreset') ||
    message.includes('aborted') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket hang up')
  )
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Number(ms || 0)))
}

export async function acquireSharedAnonymousAuth(envId) {
  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const parsed = await runWithParsedArgs({
        env: envId,
        'force-anonymous-auth': 'true',
        'emit-auth-token': 'true'
      })
      const auth = parsed?.auth && typeof parsed.auth === 'object' ? parsed.auth : {}
      const accessToken = String(auth.accessToken || '').trim()
      assertCondition(accessToken, '共享匿名登录未返回 accessToken')
      return {
        access_token: accessToken,
        token_type: String(auth.tokenType || 'Bearer').trim() || 'Bearer',
        scope: String(auth.scope || 'anonymous').trim() || 'anonymous',
        expires_in: Number(auth.expiresIn || 0) || 0,
        sub: String(auth.sub || '').trim()
      }
    } catch (error) {
      lastError = error
      const errorText = String(error?.stderr || error?.stdout || error?.message || error || '')
      if (!isRetryableChildError(errorText) || attempt >= 5) {
        throw error
      }
      await sleep(2000)
    }
  }

  throw lastError || new Error('共享匿名登录失败')
}

function buildOpenId(caseItem, prefix = 'diagnose_outcome_batch') {
  const labelKey = sanitizeCaseKey(caseItem.label || 'unknown')
  const rawCaseKey = sanitizeCaseKey(caseItem.caseKey || crypto.randomUUID())
  const hashKey = crypto
    .createHash('sha1')
    .update(`${labelKey}::${rawCaseKey}`)
    .digest('hex')
    .slice(0, 12)
  return `anon_dev_${prefix}_${labelKey}_${rawCaseKey.slice(0, 16)}_${hashKey}`.slice(0, 64)
}

export async function loadCaseGroups(args = {}) {
  const inlineGroups = String(args['case-groups-json'] || '').trim()
  const fileGroupsPath = String(args['case-groups-file'] || '').trim()

  if (!inlineGroups && !fileGroupsPath) {
    return []
  }

  const rawGroups = fileGroupsPath
    ? await fs.readFile(path.resolve(fileGroupsPath), 'utf8')
    : inlineGroups
  const parsed = safeJsonParse(rawGroups, [])
  assertCondition(Array.isArray(parsed), 'case groups 必须是 JSON 数组')

  return parsed.map((item, index) => {
    const expected = item?.expected && typeof item.expected === 'object' ? item.expected : {}
    const observedSymptoms = Array.isArray(item?.observedSymptoms)
      ? item.observedSymptoms
      : Array.isArray(item?.observed_symptoms)
        ? item.observed_symptoms
        : safeJsonParse(item?.observedSymptoms || item?.observed_symptoms || '[]', [])
    const observedEvidenceSet = Array.isArray(item?.observedEvidenceSet)
      ? item.observedEvidenceSet
      : Array.isArray(item?.observed_evidence_set)
        ? item.observed_evidence_set
        : safeJsonParse(item?.observedEvidenceSet || item?.observed_evidence_set || '[]', [])

    assertCondition(Array.isArray(observedSymptoms), `caseGroups[${index}] observedSymptoms 必须是数组`)
    assertCondition(Array.isArray(observedEvidenceSet), `caseGroups[${index}] observedEvidenceSet 必须是数组`)

    const caseKey =
      sanitizeCaseKey(item?.caseKey || item?.case_key || `group_${index + 1}`) ||
      `group_${index + 1}`

    return {
      label: String(item?.label || `group_${index + 1}`).trim() || `group_${index + 1}`,
      caseKey,
      plantCatalogId: String(item?.plantCatalogId || item?.plant_catalog_id || '').trim() || '1',
      observedEvidenceSet: normalizeObservedEvidenceSetInput(observedEvidenceSet, {
        fallbackSymptoms: observedSymptoms,
        caseKey
      }),
      answerPattern: String(item?.answerPattern || item?.answer_pattern || '').trim(),
      expectOutcome: String(item?.expectOutcome || item?.expect_outcome || expected?.outcome || '').trim(),
      expectNonProblematicType: String(
        item?.expectNonProblematicType ||
          item?.expect_non_problematic_type ||
          expected?.nonProblematicType ||
          ''
      ).trim(),
      expectProblemKey: String(item?.expectProblemKey || item?.expect_problem_key || expected?.problemKey || '').trim(),
      expectRoutePrimaryAction: String(
        item?.expectRoutePrimaryAction ||
          item?.expect_route_primary_action ||
          expected?.routePrimaryAction ||
          ''
      ).trim(),
      expectIdentityResolutionStatus: String(
        item?.expectIdentityResolutionStatus ||
          item?.expect_identity_resolution_status ||
          expected?.identityResolutionStatus ||
          ''
      ).trim(),
      expectStartStage: String(
        item?.expectStartStage ||
          item?.expect_start_stage ||
          expected?.startStage ||
          ''
      ).trim(),
      expectMinStartQuestionCount: normalizeInteger(
        item?.expectMinStartQuestionCount ??
          item?.expect_min_start_question_count ??
          expected?.minStartQuestionCount ??
          0,
        0
      ),
      expectTaxonomyMatchStatus: String(
        item?.expectTaxonomyMatchStatus ||
          item?.expect_taxonomy_match_status ||
          expected?.taxonomyMatchStatus ||
          ''
      ).trim()
    }
  })
}

export async function runDiagnoseSmokeCase(envId, caseItem, args = {}, sharedAuth = null) {
  const openid = buildOpenId(caseItem, args['openid-prefix'] || 'diagnose_outcome_batch')
  const childArgs = {
    env: envId,
    smoke: 'diagnose',
    'plant-catalog-id': caseItem.plantCatalogId,
    openid,
    'app-env': args['app-env'] || 'development',
    'anonymous-dev-identity': 'true',
    'observed-evidence-set': JSON.stringify(caseItem.observedEvidenceSet || [])
  }

  if (caseItem.answerPattern) {
    childArgs['answer-pattern'] = caseItem.answerPattern
  }
  if (caseItem.expectOutcome) {
    childArgs['expect-outcome'] = caseItem.expectOutcome
  }
  if (caseItem.expectNonProblematicType) {
    childArgs['expect-non-problematic-type'] = caseItem.expectNonProblematicType
  }
  if (caseItem.expectProblemKey) {
    childArgs['expect-problem-key'] = caseItem.expectProblemKey
  }
  if (caseItem.expectRoutePrimaryAction) {
    childArgs['expect-route-primary-action'] = caseItem.expectRoutePrimaryAction
  }
  if (caseItem.expectIdentityResolutionStatus) {
    childArgs['expect-identity-resolution-status'] = caseItem.expectIdentityResolutionStatus
  }
  if (caseItem.expectTaxonomyMatchStatus) {
    childArgs['expect-taxonomy-match-status'] = caseItem.expectTaxonomyMatchStatus
  }

  const passthroughArgs = [
    'retry-delay-ms',
    'start-retries',
    'answer-retries',
    'max-followup-loops',
    'skip-auth'
  ]

  passthroughArgs.forEach(key => {
    if (args[key] !== undefined && args[key] !== '') {
      childArgs[key] = args[key]
    }
  })
  if (sharedAuth?.access_token) {
    childArgs['access-token'] = String(sharedAuth.access_token || '')
    childArgs['access-token-type'] = String(sharedAuth.token_type || 'Bearer')
    childArgs['access-token-scope'] = String(sharedAuth.scope || 'anonymous')
    childArgs['access-token-expires-in'] = String(sharedAuth.expires_in || 0)
    childArgs['access-token-sub'] = String(sharedAuth.sub || '')
  }

  const maxAttempts = Math.max(1, Number(args['case-retries'] || 3))
  const retryDelayMs = Math.max(0, Number(args['case-retry-delay-ms'] || 1500))
  let lastErrorText = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const parsed = await runWithParsedArgs(childArgs)
      if (!parsed || typeof parsed !== 'object' || !parsed.smoke || typeof parsed.smoke !== 'object') {
        throw new Error('smoke 返回协议损坏，未返回 smoke JSON')
      }
      const smoke = parsed?.smoke || {}

      return {
        ok: true,
        label: caseItem.label,
        caseKey: caseItem.caseKey || '',
        expected: {
          outcomeType: caseItem.expectOutcome || '',
          nonProblematicType: caseItem.expectNonProblematicType || '',
          problemKey: caseItem.expectProblemKey || '',
          routePrimaryAction: caseItem.expectRoutePrimaryAction || '',
          identityResolutionStatus: caseItem.expectIdentityResolutionStatus || '',
          startStage: caseItem.expectStartStage || '',
          minStartQuestionCount: caseItem.expectMinStartQuestionCount || 0,
          taxonomyMatchStatus: caseItem.expectTaxonomyMatchStatus || ''
        },
        plantCatalogId: caseItem.plantCatalogId,
        openid,
        attempt,
        observedEvidenceKeys: (Array.isArray(caseItem.observedEvidenceSet) ? caseItem.observedEvidenceSet : [])
          .map(item => String(item?.evidenceKey || item?.symptomKey || '').trim())
          .filter(Boolean),
        observedSymptomKeys: (Array.isArray(caseItem.observedEvidenceSet) ? caseItem.observedEvidenceSet : [])
          .map(item => String(item?.symptomKey || '').trim())
          .filter(Boolean),
        diagnosisSessionId: smoke?.start?.diagnosisSessionId || '',
        historyId: smoke?.history?.historyId || '',
        outcomeType: smoke?.answer?.outcomeType || '',
        nonProblematicType: smoke?.answer?.nonProblematicType || '',
        problemId: smoke?.answer?.problemId || '',
        problemKey: smoke?.answer?.problemKey || '',
        routePrimaryAction: smoke?.answer?.routePrimaryAction || smoke?.start?.routePrimaryAction || '',
        identityResolutionStatus:
          smoke?.answer?.identityResolutionStatus ||
          smoke?.result?.identityResolutionStatus ||
          smoke?.start?.identityResolutionStatus ||
          '',
        taxonomyMatchStatus:
          smoke?.answer?.taxonomyMatchStatus ||
          smoke?.result?.taxonomyMatchStatus ||
          smoke?.start?.taxonomyMatchStatus ||
          '',
        displayName: smoke?.answer?.displayName || '',
        severity: smoke?.answer?.severity || '',
        startStage: smoke?.start?.stage || '',
        startQuestionCount: Number(smoke?.start?.questionCount || 0),
        error: '',
        raw: parsed
      }
    } catch (error) {
      lastErrorText = String(error?.stderr || error?.stdout || error?.message || error || '').trim()
      if (!isRetryableChildError(lastErrorText) || attempt >= maxAttempts) {
        return {
          ok: false,
          label: caseItem.label,
          caseKey: caseItem.caseKey || '',
          expected: {
            outcomeType: caseItem.expectOutcome || '',
            nonProblematicType: caseItem.expectNonProblematicType || '',
            problemKey: caseItem.expectProblemKey || '',
            routePrimaryAction: caseItem.expectRoutePrimaryAction || '',
            identityResolutionStatus: caseItem.expectIdentityResolutionStatus || '',
            startStage: caseItem.expectStartStage || '',
            minStartQuestionCount: caseItem.expectMinStartQuestionCount || 0,
            taxonomyMatchStatus: caseItem.expectTaxonomyMatchStatus || ''
          },
          plantCatalogId: caseItem.plantCatalogId,
          openid,
          attempt,
          observedEvidenceKeys: (Array.isArray(caseItem.observedEvidenceSet) ? caseItem.observedEvidenceSet : [])
            .map(item => String(item?.evidenceKey || item?.symptomKey || '').trim())
            .filter(Boolean),
          observedSymptomKeys: (Array.isArray(caseItem.observedEvidenceSet) ? caseItem.observedEvidenceSet : [])
            .map(item => String(item?.symptomKey || '').trim())
            .filter(Boolean),
          diagnosisSessionId: '',
          historyId: '',
          outcomeType: '',
          nonProblematicType: '',
          problemId: '',
          problemKey: '',
          routePrimaryAction: '',
          identityResolutionStatus: '',
          taxonomyMatchStatus: '',
          displayName: '',
          severity: '',
          startStage: '',
          startQuestionCount: 0,
          error: lastErrorText
        }
      }

      await sleep(retryDelayMs)
    }
  }

  return {
    ok: false,
    label: caseItem.label,
    caseKey: caseItem.caseKey || '',
    expected: {
      outcomeType: caseItem.expectOutcome || '',
      nonProblematicType: caseItem.expectNonProblematicType || '',
      problemKey: caseItem.expectProblemKey || '',
      routePrimaryAction: caseItem.expectRoutePrimaryAction || '',
      identityResolutionStatus: caseItem.expectIdentityResolutionStatus || '',
      startStage: caseItem.expectStartStage || '',
      minStartQuestionCount: caseItem.expectMinStartQuestionCount || 0,
      taxonomyMatchStatus: caseItem.expectTaxonomyMatchStatus || ''
    },
    plantCatalogId: caseItem.plantCatalogId,
    openid,
    attempt: maxAttempts,
    observedEvidenceKeys: (Array.isArray(caseItem.observedEvidenceSet) ? caseItem.observedEvidenceSet : [])
      .map(item => String(item?.evidenceKey || item?.symptomKey || '').trim())
      .filter(Boolean),
    observedSymptomKeys: (Array.isArray(caseItem.observedEvidenceSet) ? caseItem.observedEvidenceSet : [])
      .map(item => String(item?.symptomKey || '').trim())
      .filter(Boolean),
    diagnosisSessionId: '',
    historyId: '',
    outcomeType: '',
    nonProblematicType: '',
    problemId: '',
    problemKey: '',
    routePrimaryAction: '',
    identityResolutionStatus: '',
    taxonomyMatchStatus: '',
    displayName: '',
    severity: '',
    startStage: '',
    startQuestionCount: 0,
    error: lastErrorText
  }
}

export function buildSummary(results = []) {
  const summary = {
    total: results.length,
    success: 0,
    failed: 0,
    skipped: 0,
    byLabel: {}
  }

  for (const item of results) {
    const label = item.label || 'unknown'
    if (!summary.byLabel[label]) {
      summary.byLabel[label] = {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0
      }
    }

    summary.byLabel[label].total += 1
    if (item.ok) {
      summary.success += 1
      summary.byLabel[label].success += 1
    } else {
      summary.failed += 1
      summary.byLabel[label].failed += 1
    }
  }

  return summary
}

export function applyStartStageExpectations(result = {}) {
  const expectedStartStage = normalizeText(result?.expected?.startStage || '')
  const expectedMinStartQuestionCount = normalizeInteger(result?.expected?.minStartQuestionCount || 0, 0)
  const actualStartStage = normalizeText(result?.startStage || '')
  const actualStartQuestionCount = normalizeInteger(result?.startQuestionCount || 0, 0)

  if (expectedStartStage && actualStartStage !== expectedStartStage) {
    throw new Error(
      `${result.label} startStage 不匹配: expected=${expectedStartStage}, actual=${actualStartStage || '(empty)'}`
    )
  }

  if (expectedMinStartQuestionCount > 0 && actualStartQuestionCount < expectedMinStartQuestionCount) {
    throw new Error(
      `${result.label} 起始问题数不足: expected>=${expectedMinStartQuestionCount}, actual=${actualStartQuestionCount}`
    )
  }
}

export async function main() {
  const args = parseArgs(process.argv.slice(2))
  const envId = String(args.env || process.env.CLOUDBASE_ENV_ID || '').trim()
  const explicitCaseGroups = await loadCaseGroups(args)

  assertCondition(envId, '缺少 --env=cloudbase-env-id')
  assertCondition(explicitCaseGroups.length > 0, '缺少 --case-groups-json 或 --case-groups-file')

  const sharedAnonymousAuth =
    normalizeText(args['force-anonymous-auth']) === 'true'
      ? await acquireSharedAnonymousAuth(envId)
      : null

  const results = []
  for (const caseItem of explicitCaseGroups) {
    const result = await runDiagnoseSmokeCase(envId, caseItem, args, sharedAnonymousAuth)
    if (result.ok) {
      try {
        applyStartStageExpectations(result)
      } catch (error) {
        result.ok = false
        result.error = String(error?.message || error || '')
      }
    }
    results.push(result)
  }

  const output = {
    generatedAt: new Date().toISOString(),
    envId,
    caseGroupsCount: explicitCaseGroups.length,
    summary: buildSummary(results),
    results: results.map(item => ({
      ok: item.ok,
      label: item.label,
      caseKey: item.caseKey || '',
      expected: item.expected || {
        outcomeType: '',
        nonProblematicType: '',
        problemKey: '',
        routePrimaryAction: '',
        identityResolutionStatus: '',
        taxonomyMatchStatus: ''
      },
      plantCatalogId: item.plantCatalogId,
      openid: item.openid,
      observedEvidenceKeys: item.observedEvidenceKeys || [],
      observedSymptomKeys: item.observedSymptomKeys || [],
      diagnosisSessionId: item.diagnosisSessionId || '',
      historyId: item.historyId || '',
      outcomeType: item.outcomeType || '',
      nonProblematicType: item.nonProblematicType || '',
      problemId: item.problemId || '',
      problemKey: item.problemKey || '',
      routePrimaryAction: item.routePrimaryAction || '',
      identityResolutionStatus: item.identityResolutionStatus || '',
      taxonomyMatchStatus: item.taxonomyMatchStatus || '',
      displayName: item.displayName || '',
      severity: item.severity || '',
      startStage: item.startStage || '',
      startQuestionCount: normalizeInteger(item.startQuestionCount, 0),
      error: item.error || ''
    }))
  }

  if (args['report-file']) {
    const reportFile = path.resolve(String(args['report-file']).trim())
    await fs.mkdir(path.dirname(reportFile), { recursive: true })
    await fs.writeFile(reportFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  }

  await writeJsonAndExit(output, output.summary.failed > 0 ? 1 : 0)
}

function writeJsonAndExit(payload, exitCode = 0) {
  return new Promise(resolve => {
    const text = `${JSON.stringify(payload, null, 2)}\n`
    process.stdout.write(text, () => {
      process.exit(exitCode)
      resolve()
    })
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    console.error(error && (error.stack || error.message || error))
    process.exit(1)
  })
}
