#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  MAX_BATCH_RESULTS_PER_FILE,
  buildArtifactSplitMeta,
  buildBatchCalculationProcess,
  chunkArray,
  writeSplitCanonicalBatchArtifacts
} from './lib/canonical-batch-artifacts.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const batchArtifactsDir = path.join(__dirname, 'batch')
const conclusionArtifactsDir = path.join(__dirname, 'conclusion')
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveLocalLayerPath(request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('/opt/utils/')) {
    const localLayerModule = path.join(
      projectRoot,
      'cloudfunctions/layer/utils',
      `${request.slice('/opt/utils/'.length)}.js`
    )
    return originalResolveFilename.call(this, localLayerModule, parent, isMain, options)
  }
  if (request === '/opt/configs') {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/configs/index.js'),
      parent,
      isMain,
      options
    )
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const { models } = require('../../cloudfunctions/layer/utils/cloudbase')

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  if (typeof value === 'object') {
    return value
  }

  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function toSqlStringLiteral(value = '') {
  return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

async function loadVisualAggregateResultMap(resultSeeds = []) {
  const sessionPairs = Array.from(
    new Map(
      (Array.isArray(resultSeeds) ? resultSeeds : [])
        .map(item => {
          const sessionId = normalizeText(item?.sessionId)
          const openid = normalizeText(item?.openid)
          if (!sessionId || !openid) {return null}
          return [`${sessionId}::${openid}`, { sessionId, openid }]
        })
        .filter(Boolean)
    ).values()
  )

  const visualBatchIdBySession = new Map()

  for (const pairChunk of chunkArray(sessionPairs, 80)) {
    const whereClause = pairChunk
      .map(pair => `(diagnosis_id = ${toSqlStringLiteral(pair.sessionId)} AND _openid = ${toSqlStringLiteral(pair.openid)})`)
      .join(' OR ')

    const result = await models.$runSQL(
      `
        SELECT diagnosis_id, _openid, latest_visual_call_batch_id
        FROM diagnosis_sessions
        WHERE ${whereClause}
      `,
      {}
    )

    for (const row of result?.data?.executeResultList || []) {
      const sessionId = normalizeText(row?.diagnosis_id)
      const openid = normalizeText(row?._openid)
      const visualCallBatchId = normalizeText(row?.latest_visual_call_batch_id)
      if (!sessionId || !openid || !visualCallBatchId) {continue}
      visualBatchIdBySession.set(`${sessionId}::${openid}`, visualCallBatchId)
    }
  }

  const uniqueVisualBatchIds = Array.from(new Set([...visualBatchIdBySession.values()].filter(Boolean)))
  const visualAggregateResultByBatchId = new Map()

  for (const batchChunk of chunkArray(uniqueVisualBatchIds, 80)) {
    const inClause = batchChunk.map(toSqlStringLiteral).join(', ')
    const result = await models.$runSQL(
      `
        SELECT visual_call_batch_id, CAST(aggregate_summary_json AS CHAR) AS aggregate_summary_json_text
        FROM visual_call_aggregate_results
        WHERE visual_call_batch_id IN (${inClause})
        ORDER BY created_at DESC
      `,
      {}
    )

    for (const row of result?.data?.executeResultList || []) {
      const visualCallBatchId = normalizeText(row?.visual_call_batch_id)
      if (!visualCallBatchId || visualAggregateResultByBatchId.has(visualCallBatchId)) {continue}
      const parsed = safeJsonParse(row?.aggregate_summary_json_text, null)
      visualAggregateResultByBatchId.set(
        visualCallBatchId,
        parsed && typeof parsed === 'object' ? parsed : null
      )
    }
  }

  const visualAggregateResultMap = new Map()
  for (const pair of sessionPairs) {
    const key = `${pair.sessionId}::${pair.openid}`
    const visualCallBatchId = visualBatchIdBySession.get(key)
    visualAggregateResultMap.set(
      key,
      visualCallBatchId ? (visualAggregateResultByBatchId.get(visualCallBatchId) || null) : null
    )
  }

  return visualAggregateResultMap
}

function toSortedCountEntries(counter = new Map()) {
  return [...counter.entries()]
    .map(([key, count]) => ({
      key: normalizeText(key),
      count: Number(count || 0)
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
}

function buildVisualFinalEvidenceSummary(results = []) {
  const summary = {
    total: results.length,
    available: 0,
    missingRawRecords: 0,
    emptyConclusion: 0
  }

  for (const item of results) {
    const visualFinalEvidence = Array.isArray(item?.visualFinalEvidence)
      ? item.visualFinalEvidence
      : []
    const hasRetainedVisualEvidence = visualFinalEvidence.length > 0

    if (hasRetainedVisualEvidence) {
      summary.available += 1
      continue
    }

    const explicitStatus = normalizeText(item?.visualEvidenceMeta?.status)
    if (explicitStatus === 'available') {
      summary.available += 1
      continue
    }
    if (explicitStatus === 'missing_raw_records') {
      summary.missingRawRecords += 1
      continue
    }
    if (explicitStatus === 'empty_conclusion') {
      summary.emptyConclusion += 1
      continue
    }

    summary.emptyConclusion += 1
  }

  return summary
}

function summarizeVisualFinalEvidenceFromAggregateResult(visualAggregateResult = null) {
  if (!visualAggregateResult || typeof visualAggregateResult !== 'object') {
    return []
  }

  const observedSymptomMap = new Map(
    (Array.isArray(visualAggregateResult?.observed_symptoms)
      ? visualAggregateResult.observed_symptoms
      : [])
      .map(item => [normalizeText(item?.symptomKey || item?.symptom_key), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )

  return (Array.isArray(visualAggregateResult?.admission_records)
    ? visualAggregateResult.admission_records
    : [])
    .filter(item => normalizeText(item?.admission_result) === 'formally_admitted')
    .map(item => {
      const symptomKey = normalizeText(item?.object_key || item?.candidate?.symptom_key)
      const projectedSymptom = observedSymptomMap.get(symptomKey) || {}

      return {
        visualAdmissionRecordId: normalizeText(item?.visual_admission_record_id),
        visualNormalizedImageResultId: normalizeText(item?.visual_normalized_image_result_id),
        symptomKey,
        symptomCn: normalizeText(
          projectedSymptom?.symptomCn ||
          projectedSymptom?.symptom_cn ||
          item?.candidate?.display_name_cn ||
          symptomKey
        ),
        confidence: Number(projectedSymptom?.confidence || 0),
        admissionReason: normalizeText(item?.admission_reason),
        targetLayer: normalizeText(item?.target_layer),
        enteredRuntime: Number(item?.entered_runtime || 0),
        source: 'visual_formally_admitted'
      }
    })
    .filter(item => item.symptomKey)
}

function toCanonicalBatchResult(item = {}) {
  const sessionId = normalizeText(item?.sessionId)
  const visualFinalEvidence = Array.isArray(item?.visualFinalEvidence)
    ? item.visualFinalEvidence
    : []
  const symptomClassReplay =
    item?.symptomClassReplay && typeof item.symptomClassReplay === 'object'
      ? item.symptomClassReplay
      : null
  const round1 =
    item?.round1 && typeof item.round1 === 'object'
      ? item.round1
      : { roundIndex: 0, stage: '', qas: [] }
  const round2 =
    item?.round2 && typeof item.round2 === 'object'
      ? item.round2
      : { roundIndex: 0, stage: '', qas: [] }
  const outcome =
    item?.outcome && typeof item.outcome === 'object'
      ? item.outcome
      : {
          stage: '',
          outcomeType: '',
          stopReason: '',
          stopReasonDetail: '',
          routePrimaryAction: '',
          followUpRequired: false,
          topProblem: null,
          finalResult: null,
          roundIndex: 0
        }
  const rankingSnapshot = Array.isArray(item?.replay?.rankingSnapshot)
    ? item.replay.rankingSnapshot
    : Array.isArray(item?.rankingSnapshot)
      ? item.rankingSnapshot
      : []
  const decisionCause =
    item?.replay?.decisionCause && typeof item.replay.decisionCause === 'object'
      ? item.replay.decisionCause
      : item?.decisionCause && typeof item.decisionCause === 'object'
        ? item.decisionCause
        : null
  const lowConfidence =
    item?.replay?.lowConfidence && typeof item.replay.lowConfidence === 'object'
      ? item.replay.lowConfidence
      : item?.lowConfidence && typeof item.lowConfidence === 'object'
        ? item.lowConfidence
        : null
  const metrics =
    item?.replay?.metrics && typeof item.replay.metrics === 'object'
      ? item.replay.metrics
      : item?.metrics && typeof item.metrics === 'object'
        ? item.metrics
        : null

  return {
    sessionId,
    visualFinalEvidence,
    symptomClassReplay,
    round1,
    round2,
    outcome,
    calculationProcess: buildBatchCalculationProcess({
      sessionId,
      visualFinalEvidence,
      symptomClassReplay,
      round1,
      round2,
      outcome,
      rankingSnapshot,
      decisionCause,
      lowConfidence,
      metrics
    })
  }
}

function buildCanonicalBatchReport(
  results = [],
  sourceFiles = [],
  completedAt = new Date(),
  splitMeta = buildArtifactSplitMeta({})
) {
  const canonicalResults = results.map(toCanonicalBatchResult)
  return {
    generatedAt: completedAt.toISOString(),
    schema: 'cloud1_dev',
    mode: 'materialized_from_existing_replay_reports',
    artifactSplit: splitMeta,
    sourceFiles,
    visualFinalEvidenceSummary: buildVisualFinalEvidenceSummary(results),
    total: canonicalResults.length,
    success: canonicalResults.filter(item => normalizeText(item?.outcome?.outcomeType)).length,
    failed: canonicalResults.filter(item => !normalizeText(item?.outcome?.outcomeType)).length,
    progress: {
      processed: canonicalResults.length,
      targetTotal: canonicalResults.length,
      complete: true
    },
    results: canonicalResults
  }
}

function buildBatchConclusion(
  batchReport = {},
  batchReportFile = '',
  splitMeta = buildArtifactSplitMeta({})
) {
  const results = Array.isArray(batchReport?.results) ? batchReport.results : []
  const outcomeTypeCounter = new Map()
  const stopReasonCounter = new Map()
  const symptomClassCounter = new Map()

  let noVisualEvidenceCount = 0
  const outOfPoolOnlyCount = 0

  for (const item of results) {
    const outcomeType = normalizeText(item?.outcome?.outcomeType)
    const stopReason = normalizeText(item?.outcome?.stopReason)
    const currentClassKey = normalizeText(item?.symptomClassReplay?.currentClassKey)
    const visualFinalEvidence = Array.isArray(item?.visualFinalEvidence)
      ? item.visualFinalEvidence
      : []

    if (outcomeType) {
      outcomeTypeCounter.set(outcomeType, Number(outcomeTypeCounter.get(outcomeType) || 0) + 1)
    }
    if (stopReason) {
      stopReasonCounter.set(stopReason, Number(stopReasonCounter.get(stopReason) || 0) + 1)
    }
    if (currentClassKey) {
      symptomClassCounter.set(currentClassKey, Number(symptomClassCounter.get(currentClassKey) || 0) + 1)
    }
    if (!visualFinalEvidence.length) {
      noVisualEvidenceCount += 1
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    batchReportFile,
    artifactSplit: splitMeta,
    total: Number(batchReport?.total || results.length || 0),
    success: Number(batchReport?.success || 0),
    failed: Number(batchReport?.failed || 0),
    visualFinalEvidenceSummary:
      batchReport?.visualFinalEvidenceSummary || buildVisualFinalEvidenceSummary(results),
    derivedSummary: {
      noVisualEvidenceCount,
      outOfPoolOnlyCount
    },
    outcomeTypeCounts: toSortedCountEntries(outcomeTypeCounter),
    stopReasonCounts: toSortedCountEntries(stopReasonCounter),
    topSymptomClassReplayCounts: toSortedCountEntries(symptomClassCounter).slice(0, 20)
  }
}

async function readInputResults(inputFiles = []) {
  const mergedResults = []
  const normalizedSourceFiles = []

  for (const file of inputFiles) {
    const resolvedFile = path.resolve(process.cwd(), file)
    const raw = await fs.readFile(resolvedFile, 'utf8')
    const parsed = JSON.parse(raw)
    const results = Array.isArray(parsed?.results) ? parsed.results : []
    normalizedSourceFiles.push(path.relative(process.cwd(), resolvedFile))

    for (const item of results) {
      mergedResults.push({
        ...item,
        visualFinalEvidence: Array.isArray(item?.visualFinalEvidence)
          ? item.visualFinalEvidence
          : []
      })
    }
  }

  const visualAggregateResultMap = await loadVisualAggregateResultMap(mergedResults)

  for (const item of mergedResults) {
    if (Array.isArray(item?.visualFinalEvidence) && item.visualFinalEvidence.length > 0) {
      continue
    }
    const sessionId = normalizeText(item?.sessionId)
    const openid = normalizeText(item?.openid)
    const aggregateResult = visualAggregateResultMap.get(`${sessionId}::${openid}`) || null
    item.visualFinalEvidence = summarizeVisualFinalEvidenceFromAggregateResult(aggregateResult)
  }

  return {
    sourceFiles: normalizedSourceFiles,
    results: mergedResults
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputFiles = normalizeText(args['input-files'])
    .split(',')
    .map(item => normalizeText(item))
    .filter(Boolean)

  if (!inputFiles.length) {
    throw new Error('缺少 --input-files，需传入一个或多个 report 文件')
  }

  const completedAt = new Date()
  const { sourceFiles, results } = await readInputResults(inputFiles)
  const batchArtifacts = await writeSplitCanonicalBatchArtifacts({
    results,
    batchArtifactsDir,
    conclusionArtifactsDir,
    completedAt,
    baseName: args['base-name'],
    maxResultsPerFile: MAX_BATCH_RESULTS_PER_FILE,
    buildBatchReport: async (chunkResults, context = {}) =>
      buildCanonicalBatchReport(
        chunkResults,
        sourceFiles,
        completedAt,
        context?.splitMeta
      ),
    buildBatchConclusion: async (batchReport, batchReportFile, context = {}) =>
      buildBatchConclusion(batchReport, batchReportFile, context?.splitMeta)
  })

  process.stdout.write(`${JSON.stringify({
    batchReportFile: batchArtifacts.artifacts[0]?.batchReportFile || '',
    conclusionFile: batchArtifacts.artifacts[0]?.conclusionFile || '',
    batchReportFiles: batchArtifacts.artifacts.map(item => item.batchReportFile),
    conclusionFiles: batchArtifacts.artifacts.map(item => item.conclusionFile),
    batchRootBaseName: batchArtifacts.rootBaseName,
    batchPartCount: Number(batchArtifacts.partCount || batchArtifacts.artifacts.length || 0),
    total: results.length,
    success: batchArtifacts.artifacts.reduce((sum, item) => sum + Number(item?.batchReport?.success || 0), 0),
    failed: batchArtifacts.artifacts.reduce((sum, item) => sum + Number(item?.batchReport?.failed || 0), 0),
    sourceFiles
  }, null, 2)}\n`)
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
