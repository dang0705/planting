#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resolveHighSpecificityConvergencePlan } = require('../../cloudfunctions/diagnose-http/domain/high-specificity-fast-convergence')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const normalized = String(value || '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {return true}
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {return false}
  return fallback
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function sortStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
}

async function readJsonFile(filePath = '') {
  const text = await fs.readFile(path.resolve(filePath), 'utf8')
  return JSON.parse(text)
}

function buildSummary(results = []) {
  const summary = {
    total: Array.isArray(results) ? results.length : 0,
    success: 0,
    failed: 0,
    byLabel: {}
  }

  for (const item of Array.isArray(results) ? results : []) {
    const label = String(item?.label || 'unknown').trim() || 'unknown'
    if (!summary.byLabel[label]) {
      summary.byLabel[label] = {
        total: 0,
        success: 0,
        failed: 0
      }
    }

    summary.byLabel[label].total += 1
    if (item?.ok) {
      summary.success += 1
      summary.byLabel[label].success += 1
    } else {
      summary.failed += 1
      summary.byLabel[label].failed += 1
    }
  }

  return summary
}

function validateExpected(caseItem = {}, plan = null) {
  const expected = caseItem?.expected && typeof caseItem.expected === 'object'
    ? caseItem.expected
    : {}
  const expectedApplied = normalizeBoolean(expected.applied, false)

  if (!expectedApplied) {
    assertCondition(plan === null, '期望未命中快收敛，但实际返回了 convergence plan')
    return
  }

  assertCondition(plan && typeof plan === 'object', '期望命中快收敛，但未返回 convergence plan')
  assertCondition(plan.applied === true, 'convergence plan 未标记 applied=true')

  if (expected.problemKey) {
    assertCondition(
      String(plan.problemKey || '').trim() === String(expected.problemKey || '').trim(),
      `problemKey 异常: ${plan.problemKey || ''}`
    )
  }
  if (expected.policy) {
    assertCondition(
      String(plan.policy || '').trim() === String(expected.policy || '').trim(),
      `policy 异常: ${plan.policy || ''}`
    )
  }
  if (expected.shouldBypassFollowUp !== undefined) {
    assertCondition(
      Boolean(plan.shouldBypassFollowUp) === normalizeBoolean(expected.shouldBypassFollowUp, false),
      `shouldBypassFollowUp 异常: ${Boolean(plan.shouldBypassFollowUp)}`
    )
  }
  if (expected.maxQuestions !== undefined && expected.maxQuestions !== null && expected.maxQuestions !== '') {
    assertCondition(
      Number(plan.maxQuestions || 0) === Number(expected.maxQuestions || 0),
      `maxQuestions 异常: ${Number(plan.maxQuestions || 0)}`
    )
  }
  if (Array.isArray(expected.matchedSymptomKeys) && expected.matchedSymptomKeys.length) {
    assertCondition(
      JSON.stringify(sortStringList(plan.audit?.matchedSymptomKeys || [])) ===
        JSON.stringify(sortStringList(expected.matchedSymptomKeys)),
      `matchedSymptomKeys 异常: ${JSON.stringify(plan.audit?.matchedSymptomKeys || [])}`
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifestPath = path.resolve(
    process.cwd(),
    args['case-groups-file'] || 'scripts/terminal-e2e/manifests/high-specificity-fast-convergence.manifest.json'
  )
  const reportPath = String(args['report-file'] || '').trim()
    ? path.resolve(process.cwd(), args['report-file'])
    : ''
  const cases = await readJsonFile(manifestPath)
  assertCondition(Array.isArray(cases), 'manifest 必须是 JSON 数组')

  const results = cases.map((item, index) => {
    const caseKey = String(item?.caseKey || item?.case_key || `case_${index + 1}`).trim() || `case_${index + 1}`
    const label = String(item?.label || 'high_specificity_fast_convergence').trim() || 'high_specificity_fast_convergence'

    try {
      const plan = resolveHighSpecificityConvergencePlan({
        visualAggregateResult: item?.visualAggregateResult || item?.visual_aggregate_result || null,
        visualRouteContext: item?.visualRouteContext || item?.visual_route_context || {},
        observedEvidenceSet: Array.isArray(item?.observedEvidenceSet)
          ? item.observedEvidenceSet
          : Array.isArray(item?.observed_evidence_set)
            ? item.observed_evidence_set
            : [],
        symptomDictionary: Array.isArray(item?.symptomDictionary)
          ? item.symptomDictionary
          : Array.isArray(item?.symptom_dictionary)
            ? item.symptom_dictionary
            : [],
        rankings: Array.isArray(item?.rankings) ? item.rankings : [],
        problems: Array.isArray(item?.problems) ? item.problems : [],
        round: Number(item?.round || 1) || 1,
        stage: String(item?.stage || 'preliminary').trim() || 'preliminary'
      })

      validateExpected(item, plan)

      return {
        ok: true,
        label,
        caseKey,
        expected: item?.expected || {},
        actual: plan || null
      }
    } catch (error) {
      return {
        ok: false,
        label,
        caseKey,
        expected: item?.expected || {},
        error: String(error?.message || error || '')
      }
    }
  })

  const report = {
    ok: results.every(item => item.ok),
    manifestFile: manifestPath,
    summary: buildSummary(results),
    results
  }

  if (reportPath) {
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
  }

  await writeJsonAndExit(report, report.ok ? 0 : 1)
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

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
