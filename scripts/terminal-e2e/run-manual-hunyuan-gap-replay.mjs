#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import cloudbase from '../../cloudfunctions/layer/utils/cloudbase.js'

const { models } = cloudbase
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const manifestsDir = path.join(__dirname, 'manifests')

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

function normalizeBoolean(value, fallback = false) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {return fallback}
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {return true}
  if (['0', 'false', 'no', 'off'].includes(normalized)) {return false}
  return fallback
}

function normalizeTimestampMs(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function escapeSqlString(value = '') {
  return String(value || '').replace(/'/g, "''")
}

function hasExplicitOutput(row = {}) {
  return Boolean(
    (row.raw_structured_output && String(row.raw_structured_output).trim()) ||
    (row.raw_text_output && String(row.raw_text_output).trim())
  )
}

function isSuccessfulCall(row = {}) {
  const status = normalizeText(row.call_status).toLowerCase()
  return !status || ['success', 'succeeded', 'completed', 'ok'].includes(status)
}

async function runSqlWithRetry(sql = '', attemptLimit = 4) {
  let lastError = null
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    try {
      return await models.$runSQL(sql)
    } catch (error) {
      lastError = error
      if (attempt >= attemptLimit) {break}
      await new Promise(resolve => setTimeout(resolve, attempt * 400))
    }
  }
  throw lastError
}

async function collectLatestHunyuanSessions({
  batchSize = 300,
  maxBatches = 80,
  modelName = 'hunyuan-vision-1.5-instruct'
} = {}) {
  let cursor = ''
  let hasMore = true
  let batchIndex = 0
  const latestBySessionId = new Map()

  while (hasMore && batchIndex < maxBatches) {
    batchIndex += 1
    const cursorClause = cursor ? ` AND created_at < '${escapeSqlString(cursor)}'` : ''
    const sql = `
      SELECT
        session_id,
        _openid,
        created_at,
        visual_raw_image_record_id,
        call_status,
        raw_text_output,
        raw_structured_output
      FROM visual_raw_image_records
      WHERE source_model_name = '${escapeSqlString(modelName)}'${cursorClause}
      ORDER BY created_at DESC
      LIMIT ${Math.max(1, Number(batchSize) || 300)}
    `
    const rows = (await runSqlWithRetry(sql))?.data?.executeResultList || []
    if (!rows.length) {break}

    for (const row of rows) {
      if (!isSuccessfulCall(row) || !hasExplicitOutput(row)) {continue}
      const sessionId = normalizeText(row?.session_id)
      if (!sessionId || latestBySessionId.has(sessionId)) {continue}
      latestBySessionId.set(sessionId, {
        sessionId,
        openid: normalizeText(row?._openid),
        createdAt: normalizeText(row?.created_at),
        visualRawImageRecordId: normalizeText(row?.visual_raw_image_record_id)
      })
    }

    cursor = normalizeText(rows[rows.length - 1]?.created_at)
    hasMore = rows.length === batchSize
  }

  return [...latestBySessionId.values()].sort((left, right) => {
    return normalizeTimestampMs(right?.createdAt) - normalizeTimestampMs(left?.createdAt)
  })
}

function buildSelectedSessions({
  sessions = [],
  gapMinutes = 5,
  excludePrefixes = []
} = {}) {
  const normalizedPrefixes = (Array.isArray(excludePrefixes) ? excludePrefixes : [])
    .map(item => normalizeText(item))
    .filter(Boolean)
  const humanLikeSessions = (Array.isArray(sessions) ? sessions : []).filter(item => {
    const openid = normalizeText(item?.openid)
    return !normalizedPrefixes.some(prefix => openid.startsWith(prefix))
  })
  const thresholdMs = Math.max(1, Number(gapMinutes) || 1) * 60 * 1000
  const selected = []

  for (const [index, item] of humanLikeSessions.entries()) {
    if (index === 0) {
      selected.push({
        ...item,
        selectionReason: 'latest_human_like_hunyuan_session'
      })
      continue
    }

    const previous = humanLikeSessions[index - 1]
    const gapMs = normalizeTimestampMs(previous?.createdAt) - normalizeTimestampMs(item?.createdAt)
    if (gapMs > thresholdMs) {
      selected.push({
        ...item,
        selectionReason: 'non_short_term_contiguous_gap',
        gapMinutesFromPrevious: Number((gapMs / 60000).toFixed(2)),
        previousSessionId: normalizeText(previous?.sessionId),
        previousCreatedAt: normalizeText(previous?.createdAt)
      })
    }
  }

  return {
    humanLikeSessions,
    selected
  }
}

async function readReferenceReport(referenceReportPath = '') {
  const safePath = normalizeText(referenceReportPath)
  if (!safePath) {
    return {
      path: '',
      sessionIds: []
    }
  }

  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), safePath), 'utf8')
    const parsed = JSON.parse(raw)
    const sessionIds = Array.isArray(parsed?.results)
      ? parsed.results
          .map(item => normalizeText(item?.sessionId || item?.diagnosisId || item?.diagnosis_id))
          .filter(Boolean)
      : []
    return {
      path: safePath,
      sessionIds
    }
  } catch {
    return {
      path: safePath,
      sessionIds: []
    }
  }
}

async function spawnReplay({
  sessionIdFile = '',
  reportFile = '',
  maxReplayRounds = 2
} = {}) {
  const replayScriptPath = path.join(__dirname, 'replay-saved-diagnosis-sessions.mjs')
  const commandArgs = [
    replayScriptPath,
    `--session-id-file=${sessionIdFile}`,
    '--replay-mode=visual_origin',
    `--max-replay-rounds=${Math.max(1, Number(maxReplayRounds) || 2)}`,
    '--simple-audit=true'
  ]
  if (normalizeText(reportFile)) {
    commandArgs.push(`--report-file=${reportFile}`)
  }

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd: path.resolve(__dirname, '..', '..'),
      env: { ...process.env },
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`replay-saved-diagnosis-sessions.mjs exited with code ${code}`))
    })
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const gapMinutes = Math.max(1, normalizeInteger(args['gap-minutes'], 5))
  const batchSize = Math.max(50, normalizeInteger(args['batch-size'], 300))
  const maxBatches = Math.max(1, normalizeInteger(args['max-batches'], 80))
  const maxReplayRounds = Math.max(1, normalizeInteger(args['max-replay-rounds'], 2))
  const excludePrefixes = normalizeText(
    args['exclude-openid-prefixes'],
    'dev_terminal_,anon_dev_,debug_'
  )
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const referenceReportPath = normalizeText(
    args['reference-report'],
    path.join('scripts', 'terminal-e2e', 'manifests', 'replay-manual-full-key-summary-visual-only-current.report.json')
  )
  const candidateReportPath = normalizeText(
    args['candidate-report-file'],
    path.join('scripts', 'terminal-e2e', 'manifests', 'manual-hunyuan-gap-candidates.report.json')
  )
  const replayReportPath = normalizeText(
    args['replay-report-file']
  )
  const shouldRunReplay = normalizeBoolean(args['run-replay'], true)

  await fs.mkdir(manifestsDir, { recursive: true })

  const latestSessions = await collectLatestHunyuanSessions({
    batchSize,
    maxBatches
  })
  const { humanLikeSessions, selected } = buildSelectedSessions({
    sessions: latestSessions,
    gapMinutes,
    excludePrefixes
  })
  const referenceReport = await readReferenceReport(referenceReportPath)
  const selectedSessionIds = selected.map(item => item.sessionId)
  const referenceSessionIdSet = new Set(referenceReport.sessionIds)
  const overlapWithReference = selectedSessionIds.filter(sessionId => referenceSessionIdSet.has(sessionId))
  const onlyInSelected = selectedSessionIds.filter(sessionId => !referenceSessionIdSet.has(sessionId))
  const onlyInReference = referenceReport.sessionIds.filter(sessionId => !selectedSessionIds.includes(sessionId))

  const candidateReport = {
    generatedAt: new Date().toISOString(),
    selectionMode: 'explicit_hunyuan_output_then_non_short_term_gap',
    gapMinutes,
    excludeOpenidPrefixes: excludePrefixes,
    modelName: 'hunyuan-vision-1.5-instruct',
    counts: {
      latestHunyuanSessionCount: latestSessions.length,
      humanLikeSessionCount: humanLikeSessions.length,
      selectedSessionCount: selected.length
    },
    referenceReport: {
      path: referenceReport.path,
      sessionCount: referenceReport.sessionIds.length,
      overlapCount: overlapWithReference.length,
      onlyInSelectedCount: onlyInSelected.length,
      onlyInReferenceCount: onlyInReference.length
    },
    selectedSessionIds,
    overlapWithReference,
    onlyInSelected,
    onlyInReference,
    humanLikeSessions,
    selected
  }

  await fs.writeFile(
    path.resolve(process.cwd(), candidateReportPath),
    `${JSON.stringify(candidateReport, null, 2)}\n`,
    'utf8'
  )

  if (shouldRunReplay && selectedSessionIds.length) {
    await spawnReplay({
      sessionIdFile: candidateReportPath,
      reportFile: replayReportPath,
      maxReplayRounds
    })
  }

  process.stdout.write(`${JSON.stringify({
    candidateReportFile: candidateReportPath,
    replayReportFile: shouldRunReplay ? replayReportPath : '',
    replayBatchDir: path.join('scripts', 'terminal-e2e', 'batch'),
    replayConclusionDir: path.join('scripts', 'terminal-e2e', 'conclusion'),
    counts: candidateReport.counts,
    overlapWithReference,
    onlyInSelected,
    onlyInReference
  }, null, 2)}\n`)
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
