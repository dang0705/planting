#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cloudbase from '../../cloudfunctions/layer/utils/cloudbase.js'

const { models } = cloudbase
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

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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

function chunkArray(items = [], size = 100) {
  const safeItems = Array.isArray(items) ? items : []
  const chunkSize = Math.max(1, Number(size) || 1)
  const chunks = []

  for (let index = 0; index < safeItems.length; index += chunkSize) {
    chunks.push(safeItems.slice(index, index + chunkSize))
  }

  return chunks
}

function escapeSqlString(value = '') {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "''")
}

async function runSqlWithRetry(sql = '', params = {}, attemptLimit = 4) {
  let lastError = null
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    try {
      return await models.$runSQL(sql, params)
    } catch (error) {
      lastError = error
      if (attempt >= attemptLimit) {break}
      await new Promise(resolve => setTimeout(resolve, attempt * 500))
    }
  }
  throw lastError
}

async function loadAllVisualSessionRows({ pageSize = 400, maxPages = 200 } = {}) {
  const rows = []

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const offset = pageIndex * pageSize
    const result = await runSqlWithRetry(
      `
        SELECT diagnosis_id, _openid, latest_visual_call_batch_id, created_at, updated_at
        FROM diagnosis_sessions
        WHERE !(latest_visual_call_batch_id <=> NULL) AND latest_visual_call_batch_id <> ''
        ORDER BY updated_at DESC
        LIMIT ${Math.max(1, Number(pageSize) || 400)} OFFSET ${Math.max(0, Number(offset) || 0)}
      `,
      {}
    )

    const pageRows = result?.data?.executeResultList || []
    if (!pageRows.length) {break}
    rows.push(...pageRows)
    if (pageRows.length < pageSize) {break}
  }

  return rows.map(row => ({
    sessionId: normalizeText(row?.diagnosis_id),
    openid: normalizeText(row?._openid),
    latestVisualCallBatchId: normalizeText(row?.latest_visual_call_batch_id),
    createdAt: normalizeText(row?.created_at),
    updatedAt: normalizeText(row?.updated_at)
  })).filter(item => item.sessionId && item.openid && item.latestVisualCallBatchId)
}

async function loadAggregateResultMap(visualCallBatchIds = []) {
  const aggregateMap = new Map()
  const uniqueBatchIds = Array.from(new Set((Array.isArray(visualCallBatchIds) ? visualCallBatchIds : []).map(item => normalizeText(item)).filter(Boolean)))

  for (const batchChunk of chunkArray(uniqueBatchIds, 80)) {
    const inClause = batchChunk.map(item => `'${escapeSqlString(item)}'`).join(', ')
    const result = await runSqlWithRetry(
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
      if (!visualCallBatchId || aggregateMap.has(visualCallBatchId)) {continue}
      aggregateMap.set(visualCallBatchId, safeJsonParse(row?.aggregate_summary_json_text, null))
    }
  }

  return aggregateMap
}

function buildCandidateRow(session = {}, aggregateResult = null) {
  const observedSymptoms = Array.isArray(aggregateResult?.observed_symptoms)
    ? aggregateResult.observed_symptoms
    : []
  const admissionRecords = Array.isArray(aggregateResult?.admission_records)
    ? aggregateResult.admission_records
    : []
  const formallyAdmittedCount = admissionRecords.filter(item => {
    return normalizeText(item?.admission_result).toLowerCase() === 'formally_admitted'
  }).length

  return {
    sessionId: session.sessionId,
    openid: session.openid,
    latestVisualCallBatchId: session.latestVisualCallBatchId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    observedSymptomCount: observedSymptoms.length,
    admissionRecordCount: admissionRecords.length,
    formallyAdmittedCount
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pageSize = Math.max(50, normalizeInteger(args['page-size'], 400))
  const maxPages = Math.max(1, normalizeInteger(args['max-pages'], 200))
  const candidateFile = normalizeText(
    args['candidate-file'],
    path.join('scripts', 'terminal-e2e', 'manifests', 'all-visual-aggregate-session-candidates-current.report.json')
  )

  const sessions = await loadAllVisualSessionRows({ pageSize, maxPages })
  const aggregateMap = await loadAggregateResultMap(sessions.map(item => item.latestVisualCallBatchId))

  const candidates = []
  let missingAggregateCount = 0

  for (const session of sessions) {
    const aggregateResult = aggregateMap.get(session.latestVisualCallBatchId) || null
    if (!aggregateResult || typeof aggregateResult !== 'object') {
      missingAggregateCount += 1
      continue
    }

    const row = buildCandidateRow(session, aggregateResult)
    if (row.observedSymptomCount <= 0 && row.admissionRecordCount <= 0) {
      continue
    }
    candidates.push(row)
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    selectionMode: 'visual_aggregate_observed_symptoms_or_admission_records',
    scannedSessionCount: sessions.length,
    missingAggregateCount,
    eligibleSessionCount: candidates.length,
    eligibleSessionIds: candidates.map(item => item.sessionId),
    results: candidates
  }

  await fs.mkdir(path.dirname(path.resolve(process.cwd(), candidateFile)), { recursive: true })
  await fs.writeFile(
    path.resolve(process.cwd(), candidateFile),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  )

  process.stdout.write(`${JSON.stringify({
    candidateFile,
    scannedSessionCount: sessions.length,
    missingAggregateCount,
    eligibleSessionCount: candidates.length
  }, null, 2)}\n`)
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
