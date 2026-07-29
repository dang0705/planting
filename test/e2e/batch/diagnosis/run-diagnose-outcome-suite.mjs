#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  acquireSharedAnonymousAuth,
  applyStartStageExpectations,
  buildSummary,
  loadCaseGroups,
  normalizeInteger,
  runDiagnoseSmokeCase
} from './run-diagnose-outcome-batch.mjs'

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))))
}

async function runCaseWithRetry(envId, caseItem, args = {}, sharedAuth = null, {
  perCaseAttempts = 3,
  perCaseDelayMs = 2000
} = {}) {
  let lastError = null

  for (let attempt = 1; attempt <= perCaseAttempts; attempt += 1) {
    try {
      const result = await runDiagnoseSmokeCase(envId, caseItem, args, sharedAuth)
      if (result.ok) {
        applyStartStageExpectations(result)
      }
      result.suiteAttempt = attempt
      return result
    } catch (error) {
      lastError = error
      if (attempt < perCaseAttempts) {
        await sleep(perCaseDelayMs)
      }
    }
  }

  return {
    ok: false,
    label: String(caseItem?.label || caseItem?.caseKey || 'unknown').trim() || 'unknown',
    caseKey: String(caseItem?.caseKey || '').trim(),
    expected: caseItem?.expected && typeof caseItem.expected === 'object' ? caseItem.expected : {},
    plantCatalogId: String(caseItem?.plantCatalogId || '').trim(),
    openid: '',
    observedEvidenceKeys: Array.isArray(caseItem?.observedEvidenceSet)
      ? caseItem.observedEvidenceSet.map(item => String(item?.evidenceKey || item?.symptomKey || '').trim()).filter(Boolean)
      : [],
    observedSymptomKeys: Array.isArray(caseItem?.observedEvidenceSet)
      ? caseItem.observedEvidenceSet.map(item => String(item?.symptomKey || '').trim()).filter(Boolean)
      : [],
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
    suiteAttempt: perCaseAttempts,
    error: String(lastError?.stderr || lastError?.stdout || lastError?.message || lastError || '').trim()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const envId = String(args.env || '').trim()
  if (!envId) {
    throw new Error('缺少 --env')
  }

  const caseGroups = await loadCaseGroups(args)
  if (!caseGroups.length) {
    throw new Error('未提供 case groups')
  }

  const perCaseAttempts = Math.max(1, normalizeInteger(args['suite-case-attempts'], 3))
  const perCaseDelayMs = Math.max(0, normalizeInteger(args['suite-case-delay-ms'], 2000))
  const reportFile = String(args['report-file'] || '').trim()
  const sharedAnonymousAuth =
    String(args['force-anonymous-auth'] || '').trim().toLowerCase() === 'true'
      ? await acquireSharedAnonymousAuth(envId)
      : null
  const results = await Promise.all(
    caseGroups.map(caseItem => runCaseWithRetry(envId, caseItem, args, sharedAnonymousAuth, {
      perCaseAttempts,
      perCaseDelayMs
    }))
  )

  const summary = buildSummary(results)

  const report = {
    generatedAt: new Date().toISOString(),
    envId,
    caseGroupsCount: caseGroups.length,
    suiteCaseAttempts: perCaseAttempts,
    summary,
    results
  }

  if (reportFile) {
    const resolvedReportFile = path.resolve(reportFile)
    await fs.mkdir(path.dirname(resolvedReportFile), { recursive: true })
    await fs.writeFile(resolvedReportFile, JSON.stringify(report, null, 2), 'utf8')
  }

  console.log(JSON.stringify(report, null, 2))
  if (summary.failed > 0) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
