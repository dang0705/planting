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
const { getSessionState } = require('../../cloudfunctions/diagnose-http/services/session-read-service')
const { runDiagnosisRound } = require('../../cloudfunctions/diagnose-http/domain/diagnosis-engine')
const {
  getQuestionsByKeys,
  getQuestionOptionMappings
} = require('../../cloudfunctions/diagnose-http/repositories/question-repository')
const {
  listFollowUpRows
} = require('../../cloudfunctions/diagnose-http/repositories/session-follow-up-repository')
const {
  readQuestionKeyFromRationale,
  readRoundFromRationale
} = require('../../cloudfunctions/diagnose-http/services/session-follow-up-service')

const ALLOWED_REPLAY_SOURCE_TYPES = new Set(['all', 'manual'])
const INTERNAL_REVIEW_OPENID_PREFIXES = ['dev_terminal_', 'anon_dev_']
const LIKELY_MINI_PROGRAM_OPENID_PATTERN = '^o[A-Za-z0-9_-]{10,}$'
const VISUAL_SESSION_FILTER_CHUNK = 120

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

async function runDiagnosisRoundWithOptionalLogSuppression(payload = {}, { suppressDiagnoseLogs = false } = {}) {
  if (!suppressDiagnoseLogs) {
    return runDiagnosisRound(payload)
  }

  const originalConsoleLog = console.log
  console.log = (...args) => {
    const firstChunk = String(args?.[0] || '').trim()
    if (firstChunk.startsWith('diagnose-http ')) {
      return
    }
    originalConsoleLog(...args)
  }

  try {
    return await runDiagnosisRound(payload)
  } finally {
    console.log = originalConsoleLog
  }
}

function normalizeSourceFilter(value = 'all') {
  const normalized = String(value || '').trim().toLowerCase()
  return ALLOWED_REPLAY_SOURCE_TYPES.has(normalized) ? normalized : 'all'
}

function safeJsonParse(value, fallback = null) {
  if (!value) {return fallback}
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function redactLargeVisualValues(value, depth = 0) {
  if (depth > 8) {return '[depth_omitted]'}
  if (typeof value === 'string') {
    if (/^data:image\//i.test(value)) {
      return '[data_image_omitted]'
    }
    return value.length > 6000 ? `${value.slice(0, 6000)}...[truncated]` : value
  }
  if (Array.isArray(value)) {
    return value.map(item => redactLargeVisualValues(item, depth + 1))
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      redactLargeVisualValues(nestedValue, depth + 1)
    ])
  )
}

function mapVisualRawRecord(row = {}) {
  const structuredOutput = redactLargeVisualValues(safeJsonParse(row.raw_structured_output, {}) || {})
  const parsedResult = structuredOutput?.parsed_result || structuredOutput?.parsedResult || null

  return {
    visualRawImageRecordId: normalizeText(row.visual_raw_image_record_id),
    visualCallBatchId: normalizeText(row.visual_call_batch_id),
    inputSlotType: normalizeText(row.input_slot_type),
    inputSlotOrder: Number(row.input_slot_order || 0),
    inputSlotLabel: normalizeText(row.input_slot_label),
    sourceModelProvider: normalizeText(row.source_model_provider),
    sourceModelName: normalizeText(row.source_model_name || row.model_name || row.model_version),
    promptVersion: normalizeText(row.prompt_version),
    rawTextOutput: String(row.raw_text_output || '').slice(0, 6000),
    rawStructuredOutput: structuredOutput,
    modelParsedResult: parsedResult,
    normalizedTopkSymptoms: safeJsonParse(row.topk_symptoms_json, []),
    normalizedPatternCandidates: safeJsonParse(row.pattern_candidates_json, {}),
    normalizedRouteHints: safeJsonParse(row.route_hints_json, []),
    primaryOrganType: normalizeText(row.primary_organ_type),
    organSource: normalizeText(row.organ_source)
  }
}

async function listVisualRawRecords(sessionId = '') {
  const safeSessionId = normalizeText(sessionId)
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        raw.visual_raw_image_record_id,
        raw.visual_call_batch_id,
        raw.input_slot_type,
        raw.input_slot_order,
        raw.input_slot_label,
        raw.source_model_provider,
        raw.source_model_name,
        raw.model_name,
        raw.model_version,
        raw.prompt_version,
        raw.raw_text_output,
        CAST(raw.raw_structured_output AS CHAR) AS raw_structured_output,
        normalized.primary_organ_type,
        normalized.organ_source,
        CAST(normalized.topk_symptoms_json AS CHAR) AS topk_symptoms_json,
        CAST(normalized.pattern_candidates_json AS CHAR) AS pattern_candidates_json,
        CAST(normalized.route_hints_json AS CHAR) AS route_hints_json
      FROM visual_raw_image_records AS raw
      LEFT JOIN visual_normalized_image_results AS normalized
        ON normalized.visual_raw_image_record_id = raw.visual_raw_image_record_id
      WHERE raw.session_id = {{sessionId}}
      ORDER BY raw.input_slot_order ASC, raw.created_at ASC
      LIMIT 12
    `,
    { sessionId: safeSessionId }
  )

  return (result?.data?.executeResultList || []).map(mapVisualRawRecord)
}

function buildManualHumanSourceClause(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  const conditions = [
    `NOT (${safeAlias}._openid <=> NULL)`,
    `${safeAlias}._openid <> ''`
  ]

  INTERNAL_REVIEW_OPENID_PREFIXES.forEach((prefix, index) => {
    conditions.push(`${safeAlias}._openid NOT LIKE {{internalReviewPrefix_${index}}}`)
  })

  return conditions.join(' AND ')
}

function buildStoredReviewSourceSql(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `LOWER(TRIM(COALESCE(
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${safeAlias}.runtime_snapshot_json, '$.reviewSourceType')), 'null'),
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${safeAlias}.runtime_snapshot_json, '$.clientContext.reviewSourceType')), 'null'),
    ''
  )))`
}

function buildManualPlatformGuardClause(alias = 'sessions') {
  const reviewSourceSql = buildStoredReviewSourceSql(alias)
  return `(${reviewSourceSql} = 'manual' OR ${alias}._openid REGEXP {{likelyMiniProgramOpenIdPattern}})`
}

function normalizeTimestampMs(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function mapSessionCandidateRow(row = {}) {
  return {
    sessionId: normalizeText(row?.diagnosis_id || row?.session_id || row?.sessionId),
    openid: normalizeText(row?._openid),
    createdAt: normalizeText(row?.created_at || row?.createdAt),
    updatedAt: normalizeText(row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt)
  }
}

function sortSessionCandidatesByRecency(sessionRows = []) {
  return [...(Array.isArray(sessionRows) ? sessionRows : [])].sort((left, right) => {
    const leftTs = normalizeTimestampMs(left?.updatedAt || left?.createdAt)
    const rightTs = normalizeTimestampMs(right?.updatedAt || right?.createdAt)
    return rightTs - leftTs
  })
}

function deduplicateSessionCandidates(sessionRows = []) {
  const deduplicated = new Map()

  for (const item of sortSessionCandidatesByRecency(sessionRows)) {
    const sessionId = normalizeText(item?.sessionId)
    if (!sessionId || deduplicated.has(sessionId)) {continue}
    deduplicated.set(sessionId, {
      sessionId,
      openid: normalizeText(item?.openid),
      createdAt: normalizeText(item?.createdAt),
      updatedAt: normalizeText(item?.updatedAt || item?.createdAt)
    })
  }

  return [...deduplicated.values()]
}

function buildManualBaseQuery(alias = 'diagnosis_sessions', {
  outcomeType = '',
  pendingOnly = false,
  excludeOpenidLike = []
} = {}) {
  const safeAlias = String(alias || 'diagnosis_sessions').trim() || 'diagnosis_sessions'
  const conditions = [
    `NOT EXISTS (SELECT 1 FROM diagnosis_batch_reviews AS batch WHERE batch.diagnosis_id = ${safeAlias}.diagnosis_id)`,
    buildManualHumanSourceClause(safeAlias)
  ]
  const params = {}

  INTERNAL_REVIEW_OPENID_PREFIXES.forEach((prefix, index) => {
    params[`internalReviewPrefix_${index}`] = `${prefix}%`
  })

  if (outcomeType) {
    conditions.push(`${safeAlias}.outcome_type = {{manualOutcomeType}}`)
    params.manualOutcomeType = outcomeType
  }
  if (pendingOnly) {
    conditions.push(`${safeAlias}.needs_follow_up = 1`)
  }
  if (excludeOpenidLike.length) {
    excludeOpenidLike.forEach((pattern, index) => {
      conditions.push(`${safeAlias}._openid NOT LIKE {{manualExcludeOpenidLike_${index}}}`)
      params[`manualExcludeOpenidLike_${index}`] = pattern
    })
  }

  return { conditions, params }
}

function buildNonBatchSessionBaseQuery(alias = 'diagnosis_sessions', {
  outcomeType = '',
  pendingOnly = false,
  excludeOpenidLike = []
} = {}) {
  const safeAlias = String(alias || 'diagnosis_sessions').trim() || 'diagnosis_sessions'
  const conditions = [
    `NOT EXISTS (SELECT 1 FROM diagnosis_batch_reviews AS batch WHERE batch.diagnosis_id = ${safeAlias}.diagnosis_id)`
  ]
  const params = {}

  if (outcomeType) {
    conditions.push(`${safeAlias}.outcome_type = {{manualGapOutcomeType}}`)
    params.manualGapOutcomeType = outcomeType
  }
  if (pendingOnly) {
    conditions.push(`${safeAlias}.needs_follow_up = 1`)
  }
  if (excludeOpenidLike.length) {
    excludeOpenidLike.forEach((pattern, index) => {
      conditions.push(`(${safeAlias}._openid <=> NULL OR ${safeAlias}._openid NOT LIKE {{manualGapExcludeOpenidLike_${index}}})`)
      params[`manualGapExcludeOpenidLike_${index}`] = pattern
    })
  }

  return { conditions, params }
}

async function listTaggedManualSessions({
  limit = 5,
  outcomeType = '',
  pendingOnly = false,
  excludeOpenidLike = []
} = {}) {
  const { conditions, params } = buildManualBaseQuery('diagnosis_sessions', {
    outcomeType,
    pendingOnly,
    excludeOpenidLike
  })
  params.likelyMiniProgramOpenIdPattern = LIKELY_MINI_PROGRAM_OPENID_PATTERN
  params.taggedManualLimit = Math.max(1, Number(limit) || 1)
  conditions.push(buildManualPlatformGuardClause('diagnosis_sessions'))

  const result = await models.$runSQL(
    `
      SELECT diagnosis_id, _openid, created_at, updated_at
      FROM diagnosis_sessions
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT {{taggedManualLimit}}
    `,
    params
  )

  return (result?.data?.executeResultList || [])
    .map(mapSessionCandidateRow)
    .filter(item => item.sessionId && item.openid)
}

async function listGapSeparatedManualSessions({
  gapMinutes = 5,
  outcomeType = '',
  pendingOnly = false,
  excludeOpenidLike = [],
  scope = 'human'
} = {}) {
  const normalizedScope = normalizeText(scope, 'human')
  const queryBuilder = normalizedScope === 'all-non-batch'
    ? buildNonBatchSessionBaseQuery
    : buildManualBaseQuery
  const { conditions, params } = queryBuilder('diagnosis_sessions', {
    outcomeType,
    pendingOnly,
    excludeOpenidLike
  })
  const thresholdMs = Math.max(1, Number(gapMinutes) || 1) * 60 * 1000
  const result = await models.$runSQL(
    `
      SELECT diagnosis_id, _openid, created_at, updated_at
      FROM diagnosis_sessions
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `,
    params
  )

  const orderedRows = (result?.data?.executeResultList || [])
    .map(mapSessionCandidateRow)
    .filter(item => {
      if (!item.sessionId || !item.createdAt) {return false}
      if (normalizedScope === 'all-non-batch') {return true}
      return Boolean(item.openid)
    })

  const gapCandidates = []
  for (let index = 1; index < orderedRows.length; index += 1) {
    const previous = orderedRows[index - 1]
    const current = orderedRows[index]
    const gapMs = normalizeTimestampMs(previous?.createdAt) - normalizeTimestampMs(current?.createdAt)
    if (gapMs > thresholdMs) {
      gapCandidates.push(current)
    }
  }

  return gapCandidates
}

async function filterSessionsWithVisualEvidence(sessionRows = []) {
  const safeSessionRows = Array.isArray(sessionRows) ? sessionRows : []
  const candidateSessionIds = safeSessionRows
    .map(item => normalizeText(item?.sessionId))
    .filter(Boolean)

  if (!candidateSessionIds.length) {return []}

  const sessionIdsWithVisualEvidence = new Set()
  for (let offset = 0; offset < candidateSessionIds.length; offset += VISUAL_SESSION_FILTER_CHUNK) {
    const chunk = candidateSessionIds.slice(offset, offset + VISUAL_SESSION_FILTER_CHUNK)
    const params = {}
    const placeholders = chunk.map((_, index) => {
      const paramName = `visualSessionId_${offset}_${index}`
      params[paramName] = chunk[index]
      return `{{${paramName}}}`
    }).join(', ')

    const rows = await models.$runSQL(
      `
        SELECT DISTINCT session_id
        FROM visual_raw_image_records
        WHERE session_id IN (${placeholders})
      `,
      params
    )

    for (const row of (rows?.data?.executeResultList || [])) {
      const sessionId = normalizeText(row?.session_id || row?.sessionId)
      if (sessionId) {
        sessionIdsWithVisualEvidence.add(sessionId)
      }
    }
  }

  return safeSessionRows.filter(item => {
    return sessionIdsWithVisualEvidence.has(normalizeText(item?.sessionId))
  })
}

async function loadTargetSessions(args = {}) {
  const explicitSessionIds = normalizeText(args['session-ids'])
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const sessionIdFile = normalizeText(args['session-id-file'])
  const requireVisualFinalEvidence = normalizeBoolean(
    args['require-visual-final-evidence'],
    false
  )
  let fileSessionIds = []
  let fileVisualVerified = false
  const fileVisualQualifiedSessionIds = new Set()

  if (sessionIdFile) {
    const raw = await fs.readFile(path.resolve(process.cwd(), sessionIdFile), 'utf8')
    const parsed = safeJsonParse(raw, null)
    if (Array.isArray(parsed)) {
      const normalizedRows = parsed
        .map(item => {
          if (typeof item === 'string') {
            return {
              sessionId: normalizeText(item),
              hasVisualFinalEvidence: null
            }
          }
          if (item && typeof item === 'object') {
            const hasVisualField =
              Array.isArray(item.visualFinalEvidence) ||
              Array.isArray(item?.source?.visualFinalEvidence)
            return {
              sessionId: normalizeText(item.sessionId || item.diagnosisId || item.diagnosis_id),
              hasVisualFinalEvidence: hasVisualField
                ? (
                    (Array.isArray(item.visualFinalEvidence) ? item.visualFinalEvidence.length : 0) > 0 ||
                    (Array.isArray(item?.source?.visualFinalEvidence) ? item.source.visualFinalEvidence.length : 0) > 0
                  )
                : null
            }
          }
          return {
            sessionId: '',
            hasVisualFinalEvidence: null
          }
        })
        .filter(item => item.sessionId)

      fileSessionIds = normalizedRows.map(item => item.sessionId)
      if (normalizedRows.some(item => item.hasVisualFinalEvidence !== null)) {
        fileVisualVerified = true
        normalizedRows
          .filter(item => item.hasVisualFinalEvidence)
          .forEach(item => fileVisualQualifiedSessionIds.add(item.sessionId))
      }
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.sessionIds)) {
        fileSessionIds = parsed.sessionIds.map(item => normalizeText(item)).filter(Boolean)
      } else if (Array.isArray(parsed.selectedSessionIds)) {
        fileSessionIds = parsed.selectedSessionIds.map(item => normalizeText(item)).filter(Boolean)
      } else if (Array.isArray(parsed.results)) {
        const normalizedRows = parsed.results
          .map(item => {
            const hasVisualField =
              Array.isArray(item?.visualFinalEvidence) ||
              Array.isArray(item?.source?.visualFinalEvidence)
            return {
              sessionId: normalizeText(item?.sessionId || item?.diagnosisId || item?.diagnosis_id),
              hasVisualFinalEvidence: hasVisualField
                ? (
                    (Array.isArray(item?.visualFinalEvidence) ? item.visualFinalEvidence.length : 0) > 0 ||
                    (Array.isArray(item?.source?.visualFinalEvidence) ? item.source.visualFinalEvidence.length : 0) > 0
                  )
                : null
            }
          })
          .filter(item => item.sessionId)

        fileSessionIds = normalizedRows.map(item => item.sessionId)
        if (normalizedRows.some(item => item.hasVisualFinalEvidence !== null)) {
          fileVisualVerified = true
          normalizedRows
            .filter(item => item.hasVisualFinalEvidence)
            .forEach(item => fileVisualQualifiedSessionIds.add(item.sessionId))
        }
      } else if (Array.isArray(parsed.selected)) {
        fileSessionIds = parsed.selected
          .map(item => normalizeText(item?.sessionId || item?.diagnosisId || item?.diagnosis_id))
          .filter(Boolean)
      } else if (Array.isArray(parsed.combinedHuman)) {
        fileSessionIds = parsed.combinedHuman
          .map(item => normalizeText(item?.sessionId || item?.diagnosisId || item?.diagnosis_id))
          .filter(Boolean)
      } else if (Array.isArray(parsed.combinedAllNonBatch)) {
        fileSessionIds = parsed.combinedAllNonBatch
          .map(item => normalizeText(item?.sessionId || item?.diagnosisId || item?.diagnosis_id))
          .filter(Boolean)
      }
    }
  }
  if (requireVisualFinalEvidence && sessionIdFile) {
    if (!fileVisualVerified) {
      throw new Error(
        '当前 --session-id-file 无法验证 visualFinalEvidence；请改用带 visualFinalEvidence 的 canonical batch 文件，或先补齐该字段。'
      )
    }
    fileSessionIds = fileSessionIds.filter(sessionId => fileVisualQualifiedSessionIds.has(sessionId))
    if (!fileSessionIds.length) {
      throw new Error(
        '当前 --session-id-file 中没有任何 session 带有 visualFinalEvidence，已拒绝执行 replay。'
      )
    }
  }
  const allExplicitSessionIds = [...new Set([...explicitSessionIds, ...fileSessionIds])]

  if (allExplicitSessionIds.length) {
    const explicitTargets = []
    const explicitTargetMap = new Map()
    const chunkSize = 300

    for (let offset = 0; offset < allExplicitSessionIds.length; offset += chunkSize) {
      const chunk = allExplicitSessionIds.slice(offset, offset + chunkSize)
      if (!chunk.length) {continue}

      const result = await models.$runSQL(
        `
          SELECT diagnosis_id, _openid
          FROM diagnosis_sessions
          WHERE diagnosis_id IN (${chunk.map((_, index) => `{{sessionId_${index}}}`).join(', ')})
        `,
        Object.fromEntries(chunk.map((sessionId, index) => [`sessionId_${index}`, sessionId]))
      )

      for (const row of result?.data?.executeResultList || []) {
        const sessionId = normalizeText(row?.diagnosis_id)
        const openid = normalizeText(row?._openid)
        if (!sessionId || !openid || explicitTargetMap.has(sessionId)) {continue}
        const target = { sessionId, openid }
        explicitTargets.push(target)
        explicitTargetMap.set(sessionId, target)
      }
    }

    return explicitTargets
  }

  const limit = Math.max(1, normalizeInteger(args.limit, 5))
  const oversample = Math.max(limit, normalizeInteger(args.oversample, limit * 8))
  const outcomeType = normalizeText(args['outcome-type'])
  const sourceType = normalizeSourceFilter(args.source)
  const hasManualVisualOnlyArg = Object.prototype.hasOwnProperty.call(args, 'manual-visual-only')
  const manualVisualOnly = hasManualVisualOnlyArg
    ? normalizeBoolean(args['manual-visual-only'], false)
    : false
  const pendingOnly = normalizeBoolean(args['pending-only'], false)
  const diverseByVisual = normalizeBoolean(args['diverse-by-visual'], false)
  const manualGapHeuristicEnabled = normalizeBoolean(args['manual-gap-heuristic'], true)
  const manualGapMinutes = Math.max(1, normalizeInteger(args['manual-gap-minutes'], 5))
  const manualGapScope = normalizeText(args['manual-gap-scope'], 'human')
  const excludeOpenidLike = normalizeText(args['exclude-openid-like'])
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  if (sourceType === 'manual') {
    const taggedSessions = await listTaggedManualSessions({
      limit: Math.max(limit, oversample),
      outcomeType,
      pendingOnly,
      excludeOpenidLike
    })
    const gapSessions = manualGapHeuristicEnabled
      ? await listGapSeparatedManualSessions({
          gapMinutes: manualGapMinutes,
          outcomeType,
          pendingOnly,
          excludeOpenidLike,
          scope: manualGapScope
        })
      : []

    let sessions = deduplicateSessionCandidates([
      ...taggedSessions,
      ...gapSessions
    ])

    if (manualVisualOnly) {
      sessions = await filterSessionsWithVisualEvidence(sessions)
    }

    if (!diverseByVisual) {
      return sessions.slice(0, limit)
    }

    for (let index = sessions.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1))
      const current = sessions[index]
      sessions[index] = sessions[randomIndex]
      sessions[randomIndex] = current
    }

    const selected = []
    const seenSignatures = new Set()

    for (const item of sessions) {
      const visualRawRecords = await listVisualRawRecords(item.sessionId)
      const signature = buildVisualSignature(visualRawRecords)
      if (!signature || seenSignatures.has(signature)) {
        continue
      }
      seenSignatures.add(signature)
      selected.push(item)
      if (selected.length >= limit) {
        break
      }
    }

    return selected.length ? selected : sessions.slice(0, limit)
  }

  const conditions = sourceType === 'manual'
    ? []
    : ['!(latest_visual_call_batch_id <=> NULL)', "latest_visual_call_batch_id <> ''"]
  const params = { limit: diverseByVisual ? oversample : limit }
  INTERNAL_REVIEW_OPENID_PREFIXES.forEach((prefix, index) => {
    params[`internalReviewPrefix_${index}`] = `${prefix}%`
  })

  if (outcomeType) {
    conditions.push('outcome_type = {{outcomeType}}')
    params.outcomeType = outcomeType
  }
  if (pendingOnly) {
    conditions.push('needs_follow_up = 1')
  }
  if (excludeOpenidLike.length) {
    excludeOpenidLike.forEach((pattern, index) => {
      conditions.push(`_openid NOT LIKE {{excludeOpenidLike_${index}}}`)
      params[`excludeOpenidLike_${index}`] = pattern
    })
  }
  const result = await models.$runSQL(
    `
      SELECT diagnosis_id, _openid
      FROM diagnosis_sessions
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT {{limit}}
    `,
    params
  )

  let sessions = (result?.data?.executeResultList || []).map(row => ({
    sessionId: normalizeText(row.diagnosis_id),
    openid: normalizeText(row._openid)
  })).filter(item => item.sessionId && item.openid)
  if (sourceType === 'manual' && manualVisualOnly) {
    sessions = await filterSessionsWithVisualEvidence(sessions)
  }

  if (!diverseByVisual) {
    return sessions
  }

  // Break the "most recent clustered cases" bias before de-duplicating by visual signature.
  for (let index = sessions.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = sessions[index]
    sessions[index] = sessions[randomIndex]
    sessions[randomIndex] = current
  }

  const selected = []
  const seenSignatures = new Set()

  for (const item of sessions) {
    const visualRawRecords = await listVisualRawRecords(item.sessionId)
    const signature = buildVisualSignature(visualRawRecords)
    if (!signature || seenSignatures.has(signature)) {
      continue
    }
    seenSignatures.add(signature)
    selected.push(item)
    if (selected.length >= limit) {
      break
    }
  }

  return selected.length ? selected : sessions.slice(0, limit)
}

function summarizeFollowUps(followUps = []) {
  return (Array.isArray(followUps) ? followUps : []).map(item => ({
    questionKey: normalizeText(item?.questionKey),
    questionGroupKey: normalizeText(item?.questionGroupKey),
    selectionSource: normalizeText(item?.selectionSource),
    routingScope: normalizeText(item?.routingScope),
    targetDimension: normalizeText(item?.targetDimension),
    targetSymptomKey: normalizeText(item?.targetSymptomKey),
    text: normalizeText(item?.text)
  }))
}

function summarizeFollowUpKeysOnly(followUps = []) {
  return (Array.isArray(followUps) ? followUps : []).map(item => ({
    questionKey: normalizeText(item?.questionKey),
    questionGroupKey: normalizeText(item?.questionGroupKey),
    selectionSource: normalizeText(item?.selectionSource),
    routingScope: normalizeText(item?.routingScope),
    targetDimension: normalizeText(item?.targetDimension),
    targetSymptomKey: normalizeText(item?.targetSymptomKey),
    text: normalizeText(item?.text)
  }))
}

function summarizeAuditRoundQuestions(round = {}) {
  const roundQuestions = Array.isArray(round?.questions) ? round.questions : []
  const roundAnswers = Array.isArray(round?.answers) ? round.answers : []
  const answerMap = new Map(
    roundAnswers
      .map(item => [normalizeText(item?.questionKey), item])
      .filter(([questionKey]) => Boolean(questionKey))
  )

  return {
    roundIndex: Number(round?.roundIndex || 0),
    stage: normalizeText(round?.outputStage || round?.inputStage || round?.stage),
    qas: roundQuestions.map(item => {
      const questionKey = normalizeText(item?.questionKey)
      const answer = questionKey ? answerMap.get(questionKey) : null

      return {
        questionKey,
        questionText: normalizeText(item?.questionText),
        targetDimension: normalizeText(item?.targetDimension),
        answer: answer
          ? {
              optionKey: normalizeText(answer?.optionKey),
              optionText: normalizeText(answer?.optionText),
              status: normalizeText(answer?.status),
              answerSource: normalizeText(answer?.answerSource)
            }
          : null
      }
    })
  }
}

function summarizeProblemLikePayload(payload = null) {
  if (!payload || typeof payload !== 'object') {return null}
  return {
    problemId: normalizeText(payload?.problemId),
    problemKey: normalizeText(payload?.problemKey),
    displayName: normalizeText(payload?.displayName),
    summary: normalizeText(payload?.summary),
    severity: normalizeText(payload?.severity),
    urgency: normalizeText(payload?.urgency)
  }
}

function summarizeDecisionCause(decisionCause = null) {
  if (!decisionCause || typeof decisionCause !== 'object') {return null}
  return {
    decisionCauseKey: normalizeText(decisionCause?.decisionCauseKey),
    decisionCauseCategory: normalizeText(decisionCause?.decisionCauseCategory),
    decisionCauseText: normalizeText(decisionCause?.decisionCauseText),
    decisionCauseDetails:
      decisionCause?.decisionCauseDetails && typeof decisionCause.decisionCauseDetails === 'object'
        ? decisionCause.decisionCauseDetails
        : null
  }
}

function summarizeAnsweredAnswers(answers = []) {
  return (Array.isArray(answers) ? answers : []).map(item => ({
    questionKey: normalizeText(item?.questionKey),
    optionKey: normalizeText(item?.optionKey)
  }))
}

function mapQuestionHistory(
  answers = [],
  questionMap = new Map(),
  optionMapByQuestionKey = new Map()
) {
  return (Array.isArray(answers) ? answers : []).map(item => {
    const questionKey = normalizeText(item?.questionKey)
    const optionKey = normalizeText(item?.optionKey)
    const question = questionMap.get(questionKey) || null
    const option = (optionMapByQuestionKey.get(questionKey) || []).find(
      candidate => normalizeText(candidate?.optionKey) === optionKey
    ) || null

    return {
      questionKey,
      questionText: normalizeText(
        question?.questionTextUserCn || question?.questionTextCn
      ),
      questionGroupKey: normalizeText(question?.questionGroupKey),
      targetDimension: normalizeText(question?.targetDimension),
      optionKey,
      optionText: normalizeText(
        option?.optionTextUserCn ||
        option?.optionTextCn ||
        item?.optionText
      ),
      status: normalizeText(item?.status),
      answerSource: normalizeText(item?.answerSource)
    }
  })
}

function buildRoundQuestionAnswerPair(
  question = null,
  answer = null,
  optionMapByQuestionKey = new Map()
) {
  const questionKey = normalizeText(question?.questionKey || answer?.questionKey)
  const questionText = normalizeText(question?.questionText || answer?.questionText)
  const questionGroupKey = normalizeText(question?.questionGroupKey || answer?.questionGroupKey)
  const targetDimension = normalizeText(question?.targetDimension || answer?.targetDimension)
  const optionKey = normalizeText(answer?.optionKey)
  const optionCandidates = optionMapByQuestionKey.get(questionKey) || []
  const matchedOption = optionCandidates.find(item => normalizeText(item?.optionKey) === optionKey) || null

  return {
    questionKey,
    questionText,
    questionGroupKey,
    targetDimension,
    answer: {
      optionKey,
      optionText: normalizeText(
        answer?.optionText ||
        matchedOption?.optionTextUserCn ||
        matchedOption?.optionTextCn
      ),
      status: normalizeText(answer?.status),
      answerSource: normalizeText(answer?.answerSource)
    }
  }
}

function summarizeVisualConclusion(visualRawRecords = []) {
  const normalizedRecords = Array.isArray(visualRawRecords) ? visualRawRecords : []
  const symptomCandidates = []
  const outOfPoolCandidates = []
  const routeHints = []

  for (const record of normalizedRecords) {
    const parsed = record?.modelParsedResult || {}
    for (const item of Array.isArray(parsed?.symptom_candidates) ? parsed.symptom_candidates : []) {
      symptomCandidates.push({
        symptomKey: normalizeText(item?.symptom_key),
        displayNameCn: normalizeText(item?.display_name_cn),
        confidenceBand: normalizeText(item?.confidence_band),
        strengthLevel: normalizeText(item?.strength_level),
        visibilityScope: normalizeText(item?.visibility_scope),
        supportingRegionNote: normalizeText(item?.supporting_region_note),
        admissionReadiness: normalizeText(item?.admission_readiness)
      })
    }
    for (const item of Array.isArray(parsed?.out_of_pool_symptom_candidates)
      ? parsed.out_of_pool_symptom_candidates
      : []) {
      outOfPoolCandidates.push({
        rawVisualNameCn: normalizeText(item?.raw_visual_name_cn),
        rawVisualNameEn: normalizeText(item?.raw_visual_name_en),
        closestSymptomKeyHint: normalizeText(item?.closest_symptom_key_hint),
        reason: normalizeText(item?.reason)
      })
    }
    for (const item of Array.isArray(parsed?.route_hints) ? parsed.route_hints : []) {
      routeHints.push({
        type: normalizeText(item?.type),
        reason: normalizeText(item?.reason)
      })
    }
  }

  return {
    symptomCandidates,
    outOfPoolCandidates,
    routeHints
  }
}

function summarizeVisualConclusionFromAggregateResult(visualAggregateResult = null) {
  if (!visualAggregateResult || typeof visualAggregateResult !== 'object') {
    return {
      symptomCandidates: [],
      outOfPoolCandidates: [],
      routeHints: []
    }
  }

  return {
    symptomCandidates: (Array.isArray(visualAggregateResult?.observed_symptoms)
      ? visualAggregateResult.observed_symptoms
      : [])
      .map(item => ({
        symptomKey: normalizeText(item?.symptomKey || item?.symptom_key),
        displayNameCn: normalizeText(item?.symptomCn || item?.symptom_cn),
        confidenceBand: normalizeText(item?.confidenceBand || item?.confidence_band),
        strengthLevel: normalizeText(item?.strengthLevel || item?.strength_level),
        visibilityScope: normalizeText(item?.visibilityScope || item?.visibility_scope),
        supportingRegionNote: normalizeText(item?.supportingRegionNote || item?.supporting_region_note),
        admissionReadiness: normalizeText(item?.admissionReadiness || item?.admission_readiness)
      }))
      .filter(item => item.symptomKey || item.displayNameCn),
    outOfPoolCandidates: (Array.isArray(visualAggregateResult?.out_of_pool_symptom_candidates)
      ? visualAggregateResult.out_of_pool_symptom_candidates
      : [])
      .map(item => ({
        rawVisualNameCn: normalizeText(item?.raw_visual_name_cn || item?.rawVisualNameCn),
        rawVisualNameEn: normalizeText(item?.raw_visual_name_en || item?.rawVisualNameEn),
        closestSymptomKeyHint: normalizeText(item?.closest_symptom_key_hint || item?.closestSymptomKeyHint),
        reason: normalizeText(item?.reason)
      }))
      .filter(item => item.rawVisualNameCn || item.closestSymptomKeyHint),
    routeHints: (Array.isArray(visualAggregateResult?.route_hints)
      ? visualAggregateResult.route_hints
      : [])
      .map(item => ({
        type: normalizeText(item?.type),
        reason: normalizeText(item?.reason)
      }))
      .filter(item => item.type || item.reason)
  }
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

function buildVisualSignature(visualRawRecords = []) {
  const visualConclusion = summarizeVisualConclusion(visualRawRecords)
  const symptomKeys = [...new Set(visualConclusion.symptomCandidates
    .map(item => item.symptomKey)
    .filter(Boolean)
    .sort())]
  const outOfPoolKeys = [...new Set(visualConclusion.outOfPoolCandidates
    .map(item => item.closestSymptomKeyHint || item.rawVisualNameCn)
    .filter(Boolean)
    .sort())]
  const routeHintTypes = [...new Set(visualConclusion.routeHints
    .map(item => item.type)
    .filter(Boolean)
    .sort())]

  return JSON.stringify({
    symptomKeys,
    outOfPoolKeys,
    routeHintTypes
  })
}

function summarizeVisualConclusionKeysOnly(visualConclusion = {}) {
  return {
    symptomCandidates: (Array.isArray(visualConclusion?.symptomCandidates)
      ? visualConclusion.symptomCandidates
      : [])
      .map(item => ({
        symptomKey: normalizeText(item?.symptomKey),
        displayNameCn: normalizeText(item?.displayNameCn),
        confidenceBand: normalizeText(item?.confidenceBand),
        supportingRegionNote: normalizeText(item?.supportingRegionNote)
      }))
      .filter(item => item.symptomKey || item.displayNameCn),
    outOfPoolCandidates: (Array.isArray(visualConclusion?.outOfPoolCandidates)
      ? visualConclusion.outOfPoolCandidates
      : [])
      .map(item => ({
        rawVisualNameCn: normalizeText(item?.rawVisualNameCn),
        closestSymptomKeyHint: normalizeText(item?.closestSymptomKeyHint),
        reason: normalizeText(item?.reason)
      }))
      .filter(item => item.rawVisualNameCn || item.closestSymptomKeyHint),
    routeHints: (Array.isArray(visualConclusion?.routeHints)
      ? visualConclusion.routeHints
      : [])
      .map(item => ({
        type: normalizeText(item?.type),
        reason: normalizeText(item?.reason)
      }))
      .filter(item => item.type || item.reason)
  }
}

function buildVisualEvidenceSummary(visualConclusion = {}, visualRawRecordCount = 0) {
  const visualConclusionSummary = summarizeVisualConclusionKeysOnly(visualConclusion || {})
  const symptomCandidateCount = Array.isArray(visualConclusionSummary.symptomCandidates)
    ? visualConclusionSummary.symptomCandidates.length
    : 0
  const outOfPoolCandidateCount = Array.isArray(visualConclusionSummary.outOfPoolCandidates)
    ? visualConclusionSummary.outOfPoolCandidates.length
    : 0
  const routeHintCount = Array.isArray(visualConclusionSummary.routeHints)
    ? visualConclusionSummary.routeHints.length
    : 0

  const visualRawCount = Number.isFinite(Number(visualRawRecordCount)) ? Number(visualRawRecordCount) : 0
  const hasVisualConclusion = symptomCandidateCount > 0 || outOfPoolCandidateCount > 0 || routeHintCount > 0

  let status = 'available'
  let reason = ''

  if (!visualRawCount) {
    status = 'missing_raw_records'
    reason = '该会话没有 visual_raw_image_records 记录，无法重建有效视觉证据'
  } else if (!hasVisualConclusion) {
    status = 'empty_conclusion'
    reason = '视觉原始记录存在，但当前阶段未解析到可用视觉候选'
  }

  return {
    status,
    reason,
    visualRawRecordCount: visualRawCount,
    symptomCandidateCount,
    outOfPoolCandidateCount,
    routeHintCount,
    hasVisualConclusion
  }
}

function summarizeSymptomClassRuntime(runtime = null) {
  if (!runtime || typeof runtime !== 'object') {return null}
  const currentClassKey = normalizeText(runtime?.currentClassKey)
  const currentClassMeta = Array.isArray(runtime?.classScores)
    ? runtime.classScores.find(item => normalizeText(item?.classKey) === currentClassKey)
    : null
  const currentGroupKey = normalizeText(runtime?.currentGroupKey)
  const currentGroupMeta = Array.isArray(runtime?.questionGroupPool)
    ? runtime.questionGroupPool.find(
      item => normalizeText(item?.groupKey || item?.questionGroupKey) === currentGroupKey
    )
    : null
  return {
    enabled: Boolean(runtime.enabled),
    primaryClassKey: normalizeText(runtime?.primaryClass?.classKey),
    primaryClassNameCn: normalizeText(runtime?.primaryClass?.classNameCn),
    primaryFollowupModeV1: normalizeText(runtime?.primaryClass?.followupModeV1),
    currentClassKey,
    currentClassNameCn: normalizeText(
      runtime?.currentClassNameCn ||
      runtime?.currentClass?.classNameCn ||
      currentClassMeta?.classNameCn
    ),
    currentGroupKey,
    currentGroupLabel: normalizeText(
      runtime?.currentGroupLabel ||
      currentGroupMeta?.groupLabel ||
      currentGroupMeta?.groupNameCn ||
      currentGroupMeta?.groupKey
    ),
    questionGroupPoolSize: Array.isArray(runtime?.questionGroupPool) ? runtime.questionGroupPool.length : 0,
    questionGroupPoolKeys: (Array.isArray(runtime?.questionGroupPool) ? runtime.questionGroupPool : [])
      .map(item => normalizeText(item?.groupKey || item?.questionGroupKey))
      .filter(Boolean),
    classGateDecision: runtime?.classGateDecision || null
  }
}

function summarizeOutcomeForBatch(item = {}) {
  const simulationRounds = Array.isArray(item?.replay?.simulationRounds)
    ? item.replay.simulationRounds
    : []
  const finalRoundIndex = simulationRounds.length
    ? Number(simulationRounds[simulationRounds.length - 1]?.roundIndex || simulationRounds.length)
    : Number(item?.replay?.roundIndex || 0)

  return {
    stage: normalizeText(item?.replay?.stage),
    outcomeType: normalizeText(item?.replay?.outcomeType),
    stopReason: normalizeText(item?.replay?.stopReason),
    stopReasonDetail: normalizeText(item?.replay?.stopReasonDetail),
    routePrimaryAction: normalizeText(item?.replay?.routePrimaryAction),
    followUpRequired: Boolean(item?.replay?.followUpRequired),
    topProblem: summarizeProblemLikePayload(item?.replay?.topProblem),
    finalResult: summarizeProblemLikePayload(item?.replay?.finalResult),
    roundIndex: finalRoundIndex
  }
}

function summarizeRankingSnapshot(rankings = []) {
  return (Array.isArray(rankings) ? rankings : [])
    .slice(0, 3)
    .map(item => ({
      rankNo: Number(item?.rankNo || 0),
      problemKey: normalizeText(item?.problemKey),
      displayName: normalizeText(item?.problemCn || item?.displayName || item?.problemKey),
      role: normalizeText(item?.role || item?.problemRole),
      visualEvidence: Number(item?.visualEvidence || 0),
      questionEvidence: Number(item?.questionEvidence || 0),
      totalEvidence: Number(item?.totalEvidence || 0),
      penalty: Number(item?.penalty || 0),
      genusCompatibility: Number(item?.genusCompatibility || 0),
      hostCompatibility: Number(item?.hostCompatibility || 0),
      baseScore: Number(item?.baseScore || 0),
      finalScore: Number(item?.finalScore || 0)
    }))
    .filter(item => item.problemKey || item.displayName)
}

function summarizeLowConfidenceForAudit(lowConfidence = null) {
  if (!lowConfidence || typeof lowConfidence !== 'object') {return null}
  return {
    isLowConfidence: Boolean(lowConfidence?.isLowConfidence),
    reasons: Array.isArray(lowConfidence?.reasons)
      ? lowConfidence.reasons.map(item => normalizeText(item)).filter(Boolean)
      : [],
    advice: Array.isArray(lowConfidence?.advice)
      ? lowConfidence.advice.map(item => normalizeText(item)).filter(Boolean)
      : [],
    uncertainLegalityReason: normalizeText(lowConfidence?.uncertainLegalityReason)
  }
}

function summarizeReplayMetrics(metrics = null) {
  if (!metrics || typeof metrics !== 'object') {return null}
  return {
    reliabilityScore: Number(metrics?.reliabilityScore || 0),
    topScoreGap: Number(metrics?.topScoreGap || 0)
  }
}

function toCanonicalBatchResult(item = {}) {
  const visualFinalEvidence = Array.isArray(item?.source?.visualFinalEvidence)
    ? item.source.visualFinalEvidence
    : []
  const symptomClassReplay = summarizeSymptomClassRuntime(item?.replay?.symptomClassRuntime || null)
  const round1 = summarizeAuditRoundQuestions(item?.replay?.simulationRounds?.[0])
  const round2 = summarizeAuditRoundQuestions(item?.replay?.simulationRounds?.[1])
  const outcome = summarizeOutcomeForBatch(item)
  const rankingSnapshot = Array.isArray(item?.replay?.rankingSnapshot)
    ? item.replay.rankingSnapshot
    : []
  const decisionCause = summarizeDecisionCause(item?.replay?.decisionCause)
  const lowConfidence = summarizeLowConfidenceForAudit(item?.replay?.lowConfidence)
  const metrics = summarizeReplayMetrics(item?.replay?.metrics)

  return {
    sessionId: normalizeText(item?.sessionId),
    visualFinalEvidence,
    symptomClassReplay,
    round1,
    round2,
    outcome,
    calculationProcess: buildBatchCalculationProcess({
      sessionId: item?.sessionId,
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

function toUniqueList(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map(item => normalizeText(item)).filter(Boolean)))
}

function pickRandomOption(optionCandidates = []) {
  const safeCandidates = Array.isArray(optionCandidates) ? optionCandidates : []
  if (!safeCandidates.length) {return null}
  return safeCandidates[Math.floor(Math.random() * safeCandidates.length)]
}

const optionTextFallback = '看不出/不确定'

function pickSimulatedAnswerForQuestion({
  questionKey = '',
  question = null,
  followUp = null,
  optionCandidates = [],
  status = 'simulated',
  answerSource = 'simulated'
} = {}) {
  const safeQuestionKey = normalizeText(questionKey || followUp?.questionKey || question?.questionKey)
  if (!safeQuestionKey) {return null}

  const option = pickRandomOption(optionCandidates)
  const optionKey = normalizeText(option?.optionKey || 'unknown')
  const optionText = normalizeText(
    option?.optionTextUserCn ||
    option?.optionTextCn ||
    optionTextFallback
  )

  return {
    questionKey: safeQuestionKey,
    questionText: normalizeText(
      followUp?.text ||
      question?.questionTextUserCn ||
      question?.questionTextCn
    ),
    questionGroupKey: normalizeText(followUp?.questionGroupKey || question?.questionGroupKey),
    targetDimension: normalizeText(followUp?.targetDimension || question?.targetDimension),
    optionKey,
    optionText,
    status: normalizeText(status, 'simulated'),
    answerSource: normalizeText(answerSource, 'simulated')
  }
}

function summarizeSimulationAnswers({
  followUps = [],
  questionMap = new Map(),
  optionMapByQuestionKey = new Map(),
  status = 'simulated',
  answerSource = 'simulated'
} = {}) {
  const normalizedFollowUps = summarizeFollowUps(followUps)
  return normalizedFollowUps
    .map(item => {
      const questionKey = normalizeText(item?.questionKey)
      const question = questionMap.get(questionKey) || null
      const optionCandidates = optionMapByQuestionKey.get(questionKey) || []
      return pickSimulatedAnswerForQuestion({
        questionKey,
        question,
        followUp: item,
        optionCandidates,
        status,
        answerSource
      })
    })
    .filter(item => item && item.questionKey)
}

async function enrichSimulationMetadata({
  followUps = [],
  questionMap = new Map(),
  optionMapByQuestionKey = new Map()
} = {}) {
  const neededQuestionKeys = toUniqueList(
    (Array.isArray(followUps) ? followUps : [])
      .map(item => normalizeText(item?.questionKey))
      .filter(Boolean)
      .filter(questionKey => !questionMap.has(questionKey) || !optionMapByQuestionKey.has(questionKey))
  )
  if (!neededQuestionKeys.length) {return}

  const [questionRows, optionRows] = await Promise.all([
    getQuestionsByKeys(neededQuestionKeys),
    getQuestionOptionMappings(neededQuestionKeys)
  ])

  for (const question of questionRows) {
    const questionKey = normalizeText(question?.questionKey)
    if (!questionKey) {continue}
    questionMap.set(questionKey, question)
  }

  for (const item of optionRows) {
    const questionKey = normalizeText(item?.questionKey)
    if (!questionKey) {continue}
    const list = optionMapByQuestionKey.get(questionKey) || []
    list.push(item)
    optionMapByQuestionKey.set(questionKey, list)
  }
}

function applyRoundAnswerState({
  followUps = [],
  roundAnswers = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {}
} = {}) {
  const nextAskedQuestionKeys = toUniqueList([
    ...askedQuestionKeys,
    ...(Array.isArray(followUps) ? followUps.map(item => item?.questionKey) : [])
  ])
  const nextAnsweredGroupKeys = new Set(
    (Array.isArray(answeredQuestionGroupKeys) ? answeredQuestionGroupKeys : [])
      .map(item => normalizeText(item))
      .filter(Boolean)
  )
  const nextUnknownCountByGroup = {
    ...(unknownCountByGroup && typeof unknownCountByGroup === 'object' ? unknownCountByGroup : {})
  }
  const followUpMap = new Map(
    (Array.isArray(followUps) ? followUps : [])
      .map(item => [normalizeText(item?.questionKey), item])
      .filter(([questionKey]) => Boolean(questionKey))
  )

  for (const answer of Array.isArray(roundAnswers) ? roundAnswers : []) {
    const questionKey = normalizeText(answer?.questionKey)
    const optionKey = normalizeText(answer?.optionKey)
    if (!questionKey || !optionKey) {continue}
    const followUp = followUpMap.get(questionKey) || null
    const groupKey = normalizeText(followUp?.questionGroupKey)
    if (!groupKey || groupKey === '__default__') {continue}
    nextAnsweredGroupKeys.add(groupKey)
    if (optionKey === 'unknown') {
      nextUnknownCountByGroup[groupKey] = Number(nextUnknownCountByGroup[groupKey] || 0) + 1
    } else {
      nextUnknownCountByGroup[groupKey] = 0
    }
  }

  return {
    askedQuestionKeys: nextAskedQuestionKeys,
    answeredQuestionGroupKeys: Array.from(nextAnsweredGroupKeys),
    unknownCountByGroup: nextUnknownCountByGroup
  }
}

function summarizeSimulationRound({
  roundIndex = 1,
  inputStage = 'preliminary',
  result = null,
  roundAnswers = [],
  questionMap = new Map(),
  optionMapByQuestionKey = new Map()
} = {}) {
  const normalizedFollowUps = summarizeFollowUps(result?.followUps)
  const normalizedAnswers = (Array.isArray(roundAnswers) ? roundAnswers : []).map(item => ({
    questionKey: normalizeText(item?.questionKey),
    questionText: normalizeText(item?.questionText),
    questionGroupKey: normalizeText(item?.questionGroupKey),
    targetDimension: normalizeText(item?.targetDimension),
    optionKey: normalizeText(item?.optionKey),
    optionText: normalizeText(item?.optionText),
    status: normalizeText(item?.status),
    answerSource: normalizeText(item?.answerSource)
  }))
  const mappedAnswers = mapQuestionHistory(
    normalizedAnswers,
    questionMap,
    optionMapByQuestionKey
  )

  return {
    roundIndex: Number(roundIndex || 1),
    inputStage: normalizeText(inputStage),
    outputStage: normalizeText(result?.stage),
    questions: normalizedFollowUps.map(item => ({
      questionKey: normalizeText(item?.questionKey),
      questionText: normalizeText(item?.text),
      questionGroupKey: normalizeText(item?.questionGroupKey),
      targetDimension: normalizeText(item?.targetDimension)
    })),
    answers: normalizedAnswers,
    questionAnswerPairs: normalizedFollowUps.map(item => {
      const answer = mappedAnswers.find(
        answerItem => normalizeText(answerItem?.questionKey) === normalizeText(item?.questionKey)
      ) || null
      return buildRoundQuestionAnswerPair(
        {
          questionKey: item?.questionKey,
          questionText: item?.text,
          questionGroupKey: item?.questionGroupKey,
          targetDimension: item?.targetDimension
        },
        answer,
        optionMapByQuestionKey
      )
    }),
    outcome: {
      stage: normalizeText(result?.stage),
      followUpRequired: Boolean(result?.followUpRequired),
      stopReason: normalizeText(result?.stopReason),
      stopReasonDetail: normalizeText(result?.stopReasonDetail),
      routePrimaryAction: normalizeText(result?.routePrimaryAction),
      topProblem: summarizeProblemLikePayload(result?.topProblem),
      finalResult: summarizeProblemLikePayload(result?.finalResult)
    }
  }
}

async function buildActualRounds(sessionId = '', questionMap = new Map(), optionMapByQuestionKey = new Map()) {
  const rows = await listFollowUpRows(sessionId)
  const roundMap = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const roundIndex = Math.max(1, Number(readRoundFromRationale(row.rationale) || 1))
    const questionKey = normalizeText(readQuestionKeyFromRationale(row.rationale) || row.symptom_key)
    const questionMeta = questionMap.get(questionKey) || null
    const questionText = normalizeText(
      row.question_text || questionMeta?.questionTextUserCn || questionMeta?.questionTextCn
    )
    const questionGroupKey = normalizeText(questionMeta?.questionGroupKey)
    const targetDimension = normalizeText(questionMeta?.targetDimension)
    const optionKey = normalizeText(row.answer_value)
    const optionCandidates = optionMapByQuestionKey.get(questionKey) || []
    const matchedOption = optionCandidates.find(item => normalizeText(item?.optionKey) === optionKey) || null

    const current = roundMap.get(roundIndex) || {
      roundIndex,
      questions: [],
      answers: [],
      questionAnswerPairs: []
    }

    current.questions.push({
      questionKey,
      questionText,
      questionGroupKey,
      targetDimension
    })

    if (Number(row.asked || 0) === 1) {
      const answer = {
        questionKey,
        questionText,
        questionGroupKey,
        targetDimension,
        optionKey,
        optionText: normalizeText(
          matchedOption?.optionTextUserCn ||
          matchedOption?.optionTextCn
        ),
        status: normalizeText(row.status)
      }
      current.answers.push(answer)
      current.questionAnswerPairs.push(
        buildRoundQuestionAnswerPair(
          {
            questionKey,
            questionText,
            questionGroupKey,
            targetDimension
          },
          answer,
          optionMapByQuestionKey
        )
      )
    }

    roundMap.set(roundIndex, current)
  }

  return Array.from(roundMap.values()).sort((a, b) => a.roundIndex - b.roundIndex)
}

async function replaySession({ sessionId, openid }, replayOptions = {}) {
  const sessionState = await getSessionState(openid, sessionId)
  if (!sessionState) {
    return {
      ok: false,
      sessionId,
      openid,
      error: 'session_not_found'
    }
  }

  const currentRoundIndex = Math.max(1, Number(sessionState.currentRoundIndex || 1))
  const defaultTargetRound = sessionState.hasPendingFollowUp
    ? currentRoundIndex
    : Math.max(1, Number(sessionState.nextRound || currentRoundIndex + 1))
  const requestedRound = Math.max(0, Number(replayOptions.round || 0))
  const targetRound = requestedRound || defaultTargetRound
  const requestedStage = normalizeText(replayOptions.stage)
  const defaultTargetStage = sessionState.hasPendingFollowUp ? 'followup' : 'preliminary'
  const targetStage = requestedStage || defaultTargetStage
  const skipVisualRaw = String(process.env.REPLAY_SKIP_VISUAL_RAW || '').trim().toLowerCase() === 'true'
  const visualRawRecords = skipVisualRaw ? [] : await listVisualRawRecords(sessionId)
  const visualConclusion = skipVisualRaw
    ? summarizeVisualConclusionFromAggregateResult(sessionState.visualAggregateResult)
    : summarizeVisualConclusion(visualRawRecords)
  const historicalQuestionKeys = Array.from(
    new Set(
      [
        ...(Array.isArray(sessionState.askedQuestionKeys) ? sessionState.askedQuestionKeys : []),
        ...(Array.isArray(sessionState.answeredAnswers)
          ? sessionState.answeredAnswers.map(item => normalizeText(item?.questionKey)).filter(Boolean)
          : [])
      ].map(item => normalizeText(item)).filter(Boolean)
    )
  )
  const historicalQuestionRows = historicalQuestionKeys.length
    ? await getQuestionsByKeys(historicalQuestionKeys)
    : []
  const historicalOptionRows = historicalQuestionKeys.length
    ? await getQuestionOptionMappings(historicalQuestionKeys)
    : []
  const questionMap = new Map(
    historicalQuestionRows.map(item => [normalizeText(item?.questionKey), item])
  )
  const optionMapByQuestionKey = new Map()
  for (const item of historicalOptionRows) {
    const questionKey = normalizeText(item?.questionKey)
    if (!questionKey) {continue}
    const list = optionMapByQuestionKey.get(questionKey) || []
    list.push(item)
    optionMapByQuestionKey.set(questionKey, list)
  }
  const followUpHistory = {
    hasPendingFollowUp: Boolean(sessionState.hasPendingFollowUp),
    nextRound: Number(sessionState.nextRound || 0),
    storedOutcomeType: normalizeText(sessionState.outcomeType),
    askedQuestionKeys: Array.isArray(sessionState.askedQuestionKeys) ? sessionState.askedQuestionKeys : [],
    askedQuestions: historicalQuestionKeys.map(questionKey => {
      const question = questionMap.get(questionKey) || null
      return {
        questionKey,
        questionText: normalizeText(question?.questionTextUserCn || question?.questionTextCn),
        questionGroupKey: normalizeText(question?.questionGroupKey),
        targetDimension: normalizeText(question?.targetDimension)
      }
    }),
    answeredQuestionGroupKeys: Array.isArray(sessionState.answeredQuestionGroupKeys)
      ? sessionState.answeredQuestionGroupKeys
      : [],
    answeredAnswers: mapQuestionHistory(
      sessionState.answeredAnswers,
      questionMap,
      optionMapByQuestionKey
    )
  }
  const actualRounds = await buildActualRounds(sessionId, questionMap, optionMapByQuestionKey)

  const replayMode = normalizeText(replayOptions.mode, 'visual_origin')
  const suppressDiagnoseLogs = Boolean(replayOptions.suppressDiagnoseLogs)

  if (replayMode === 'visual_origin') {
    const maxReplayFollowUpRounds = Math.max(1, normalizeInteger(replayOptions.maxReplayRounds, 3))
    const maxDiagnosisRounds = Math.max(1, maxReplayFollowUpRounds + 1)
    const simulationRounds = []
    let cumulativeAnswers = []
    let askedQuestionKeys = []
    let answeredQuestionGroupKeys = []
    let unknownCountByGroup = {}
    let symptomClassState = null
    let observedEvidenceSet = []
    let finalReplayResult = null

    for (let roundIndex = 1; roundIndex <= maxDiagnosisRounds; roundIndex += 1) {
      const inputStage = roundIndex <= 1 ? 'preliminary' : 'followup'
      const roundResult = await runDiagnosisRoundWithOptionalLogSuppression({
        openid,
        plantId: sessionState.plantId || null,
        userPlantId: sessionState.userPlantId || null,
        lockedPlantContext: sessionState.plantContext || null,
        observedSymptoms: [],
        observedEvidenceSet,
        visualAggregateResult: sessionState.visualAggregateResult || null,
        answers: cumulativeAnswers,
        askedQuestionKeys,
        answeredQuestionGroupKeys,
        unknownCountByGroup,
        symptomClassState,
        round: roundIndex,
        stage: inputStage,
        sessionId
      }, { suppressDiagnoseLogs })

      finalReplayResult = roundResult
      const followUps = Array.isArray(roundResult?.followUps) ? roundResult.followUps : []
      await enrichSimulationMetadata({
        followUps,
        questionMap,
        optionMapByQuestionKey
      })
      const roundAnswers = summarizeSimulationAnswers({
        followUps,
        questionMap,
        optionMapByQuestionKey
      })

      simulationRounds.push(
        summarizeSimulationRound({
          roundIndex,
          inputStage,
          result: roundResult,
          roundAnswers,
          questionMap,
          optionMapByQuestionKey
        })
      )

      observedEvidenceSet = Array.isArray(roundResult?.observedEvidenceSet)
        ? roundResult.observedEvidenceSet
        : observedEvidenceSet
      symptomClassState =
        roundResult?.__symptomClassRuntime ||
        roundResult?.symptomClassRuntime ||
        symptomClassState

      if (!roundResult?.followUpRequired || !followUps.length) {
        break
      }

      if (!roundAnswers.length) {
        break
      }

      cumulativeAnswers = [...cumulativeAnswers, ...roundAnswers]
      const nextAnswerState = applyRoundAnswerState({
        followUps,
        roundAnswers,
        askedQuestionKeys,
        answeredQuestionGroupKeys,
        unknownCountByGroup
      })
      askedQuestionKeys = nextAnswerState.askedQuestionKeys
      answeredQuestionGroupKeys = nextAnswerState.answeredQuestionGroupKeys
      unknownCountByGroup = nextAnswerState.unknownCountByGroup
    }

    return {
      ok: true,
      sessionId,
      openid,
      source: {
        latestVisualCallBatchId: normalizeText(sessionState.latestVisualCallBatchId),
        currentRoundIndex,
        nextRound: Number(sessionState.nextRound || 0),
        hasPendingFollowUp: Boolean(sessionState.hasPendingFollowUp),
        storedOutcomeType: normalizeText(sessionState.outcomeType),
        askedQuestionKeys: Array.isArray(sessionState.askedQuestionKeys) ? sessionState.askedQuestionKeys : [],
        answeredQuestionGroupKeys: Array.isArray(sessionState.answeredQuestionGroupKeys)
          ? sessionState.answeredQuestionGroupKeys
          : [],
        answeredAnswers: Array.isArray(sessionState.answeredAnswers) ? sessionState.answeredAnswers : [],
        followUpHistory,
        actualRounds,
        replayTarget: {
          round: Number(replayOptions.round || 0),
          stage: normalizeText(replayOptions.stage),
          mode: replayMode
        },
        symptomClassRuntime: summarizeSymptomClassRuntime(sessionState.symptomClassRuntime),
        visualFinalEvidence: summarizeVisualFinalEvidenceFromAggregateResult(
          sessionState.visualAggregateResult || null
        ),
        observedEvidenceSetCount: Array.isArray(sessionState.observedEvidenceSet) ? sessionState.observedEvidenceSet.length : 0,
        visualConclusion,
        visualRawRecordCount: visualRawRecords.length,
        visualRawRecords
      },
      replay: {
        stage: normalizeText(finalReplayResult?.stage),
        outcomeType: normalizeText(finalReplayResult?.outcomeType),
        stopReason: normalizeText(finalReplayResult?.stopReason),
        stopReasonDetail: normalizeText(finalReplayResult?.stopReasonDetail),
        routePrimaryAction: normalizeText(finalReplayResult?.routePrimaryAction),
        followUpRequired: Boolean(finalReplayResult?.followUpRequired),
        followUps: summarizeFollowUps(finalReplayResult?.followUps),
        decisionCause: summarizeDecisionCause(finalReplayResult?.decisionCause),
        lowConfidence: summarizeLowConfidenceForAudit(finalReplayResult?.lowConfidence),
        rankingSnapshot: summarizeRankingSnapshot(finalReplayResult?.rankings),
        metrics: summarizeReplayMetrics(finalReplayResult?.metrics),
        topProblem: summarizeProblemLikePayload(finalReplayResult?.topProblem),
        finalResult: summarizeProblemLikePayload(finalReplayResult?.finalResult),
        symptomClassRuntime: summarizeSymptomClassRuntime(
          finalReplayResult?.__symptomClassRuntime || finalReplayResult?.symptomClassRuntime || null
        ),
        simulationRounds
      }
    }
  }

  const replayResult = await runDiagnosisRoundWithOptionalLogSuppression({
    openid,
    plantId: sessionState.plantId || null,
    userPlantId: sessionState.userPlantId || null,
    lockedPlantContext: sessionState.plantContext || null,
    observedEvidenceSet: sessionState.observedEvidenceSet || [],
    visualAggregateResult: sessionState.visualAggregateResult || null,
    answers: Array.isArray(sessionState.answeredAnswers) ? sessionState.answeredAnswers : [],
    askedQuestionKeys: Array.isArray(sessionState.askedQuestionKeys) ? sessionState.askedQuestionKeys : [],
    answeredQuestionGroupKeys: Array.isArray(sessionState.answeredQuestionGroupKeys)
      ? sessionState.answeredQuestionGroupKeys
      : [],
    unknownCountByGroup: sessionState.unknownCountByGroup || {},
    symptomClassState: sessionState.runtimeSnapshot?.symptomClassRuntime || sessionState.symptomClassRuntime || null,
    round: targetRound,
    stage: targetStage,
    sessionId
  }, { suppressDiagnoseLogs })

  return {
    ok: true,
    sessionId,
    openid,
    source: {
      latestVisualCallBatchId: normalizeText(sessionState.latestVisualCallBatchId),
      currentRoundIndex,
      nextRound: Number(sessionState.nextRound || 0),
      hasPendingFollowUp: Boolean(sessionState.hasPendingFollowUp),
      storedOutcomeType: normalizeText(sessionState.outcomeType),
      askedQuestionKeys: Array.isArray(sessionState.askedQuestionKeys) ? sessionState.askedQuestionKeys : [],
      answeredQuestionGroupKeys: Array.isArray(sessionState.answeredQuestionGroupKeys)
        ? sessionState.answeredQuestionGroupKeys
        : [],
      answeredAnswers: Array.isArray(sessionState.answeredAnswers) ? sessionState.answeredAnswers : [],
      followUpHistory,
      actualRounds,
      replayTarget: {
        round: targetRound,
        stage: targetStage,
        mode: replayMode
      },
      symptomClassRuntime: summarizeSymptomClassRuntime(sessionState.symptomClassRuntime),
      observedEvidenceSetCount: Array.isArray(sessionState.observedEvidenceSet) ? sessionState.observedEvidenceSet.length : 0,
      visualConclusion,
      visualRawRecordCount: visualRawRecords.length,
      visualRawRecords
    },
    replay: {
      stage: normalizeText(replayResult?.stage),
      outcomeType: normalizeText(replayResult?.outcomeType),
      stopReason: normalizeText(replayResult?.stopReason),
      stopReasonDetail: normalizeText(replayResult?.stopReasonDetail),
      routePrimaryAction: normalizeText(replayResult?.routePrimaryAction),
      followUpRequired: Boolean(replayResult?.followUpRequired),
      followUps: summarizeFollowUps(replayResult?.followUps),
      decisionCause: summarizeDecisionCause(replayResult?.decisionCause),
      lowConfidence: summarizeLowConfidenceForAudit(replayResult?.lowConfidence),
      rankingSnapshot: summarizeRankingSnapshot(replayResult?.rankings),
      metrics: summarizeReplayMetrics(replayResult?.metrics),
      topProblem: summarizeProblemLikePayload(replayResult?.topProblem),
      finalResult: summarizeProblemLikePayload(replayResult?.finalResult),
      symptomClassRuntime: summarizeSymptomClassRuntime(replayResult?.__symptomClassRuntime || replayResult?.symptomClassRuntime || null)
    }
  }
}

function toCompactKeyFieldResult(item = {}) {
  return {
    ok: Boolean(item?.ok),
    sessionId: normalizeText(item?.sessionId),
    openid: normalizeText(item?.openid),
    source: {
      latestVisualCallBatchId: normalizeText(item?.source?.latestVisualCallBatchId),
      currentRoundIndex: Number(item?.source?.currentRoundIndex || 0),
      observedEvidenceSetCount: Number(item?.source?.observedEvidenceSetCount || 0),
      replayTarget:
        item?.source?.replayTarget && typeof item.source.replayTarget === 'object'
          ? {
              round: Number(item.source.replayTarget.round || 0),
              stage: normalizeText(item.source.replayTarget.stage)
            }
          : null,
      followUpHistory:
        item?.source?.followUpHistory && typeof item.source.followUpHistory === 'object'
          ? item.source.followUpHistory
          : {
              hasPendingFollowUp: Boolean(item?.source?.hasPendingFollowUp),
              nextRound: Number(item?.source?.nextRound || 0),
              storedOutcomeType: normalizeText(item?.source?.storedOutcomeType),
              askedQuestionKeys: Array.isArray(item?.source?.askedQuestionKeys)
                ? item.source.askedQuestionKeys.map(questionKey => normalizeText(questionKey)).filter(Boolean)
                : [],
              askedQuestions: [],
              answeredQuestionGroupKeys: Array.isArray(item?.source?.answeredQuestionGroupKeys)
                ? item.source.answeredQuestionGroupKeys.map(groupKey => normalizeText(groupKey)).filter(Boolean)
                : [],
              answeredAnswers: summarizeAnsweredAnswers(item?.source?.answeredAnswers)
            },
      actualRounds: Array.isArray(item?.source?.actualRounds)
        ? item.source.actualRounds
        : [],
      symptomClassRuntime: summarizeSymptomClassRuntime(item?.source?.symptomClassRuntime),
      visualConclusion: summarizeVisualConclusionKeysOnly(item?.source?.visualConclusion),
      visualEvidence: buildVisualEvidenceSummary(
        item?.source?.visualConclusion,
        item?.source?.visualRawRecordCount
      ),
      visualRawRecordCount: Number(item?.source?.visualRawRecordCount || 0),
      visualEvidenceStatus: buildVisualEvidenceSummary(
        item?.source?.visualConclusion,
        item?.source?.visualRawRecordCount
      ).status
    },
    replay: {
      roundIndex: Number(
        item?.replay?.currentRoundIndex ||
        item?.replay?.simulationRounds?.[item?.replay?.simulationRounds?.length - 1]?.roundIndex ||
        item?.source?.replayTarget?.round ||
        0
      ),
      stage: normalizeText(item?.replay?.stage),
      outcomeType: normalizeText(item?.replay?.outcomeType),
      stopReason: normalizeText(item?.replay?.stopReason),
      stopReasonDetail: normalizeText(item?.replay?.stopReasonDetail),
      routePrimaryAction: normalizeText(item?.replay?.routePrimaryAction),
      followUpRequired: Boolean(item?.replay?.followUpRequired),
      decisionCause: summarizeDecisionCause(item?.replay?.decisionCause),
      topProblem: summarizeProblemLikePayload(item?.replay?.topProblem),
      finalResult: summarizeProblemLikePayload(item?.replay?.finalResult),
      symptomClassRuntime: summarizeSymptomClassRuntime(item?.replay?.symptomClassRuntime),
      simulationRounds: Array.isArray(item?.replay?.simulationRounds)
        ? item.replay.simulationRounds
        : [],
      pendingFollowUps: summarizeFollowUpKeysOnly(item?.replay?.followUps),
      followUps: summarizeFollowUpKeysOnly(item?.replay?.followUps)
    }
  }
}

function toMinimalAuditResult(item = {}) {
  return toCanonicalBatchResult(item)
}

function buildReport(results = [], args = {}, progress = {}) {
  const normalizedResults = Array.isArray(results) ? results : []
  const minimalAudit = String(args['simple-audit'] || 'false')
    .trim()
    .toLowerCase() === 'true'
  const compactKeyFields = String(args['compact-key-fields'] || 'false')
    .trim()
    .toLowerCase() === 'true'
  const shouldCompact = compactKeyFields || minimalAudit
  const collectionProfile = {
    source: normalizeSourceFilter(args.source),
    manualVisualOnly: Object.prototype.hasOwnProperty.call(args, 'manual-visual-only')
      ? String(args['manual-visual-only']).trim().toLowerCase() === 'true'
      : false,
    manualVisualOnlyProvided: Object.prototype.hasOwnProperty.call(args, 'manual-visual-only')
  }
  const visualEvidenceSummary = {
    total: normalizedResults.length,
    available: 0,
    missingRawRecords: 0,
    emptyConclusion: 0
  }

  for (const item of normalizedResults) {
    if (Array.isArray(item?.source?.visualFinalEvidence) && item.source.visualFinalEvidence.length > 0) {
      visualEvidenceSummary.available += 1
      continue
    }
    const visualEvidenceMeta = buildVisualEvidenceSummary(
      item?.source?.visualConclusion,
      item?.source?.visualRawRecordCount
    )
    if (visualEvidenceMeta.status === 'available') {
      visualEvidenceSummary.available += 1
      continue
    }
    if (visualEvidenceMeta.status === 'missing_raw_records') {
      visualEvidenceSummary.missingRawRecords += 1
      continue
    }
    if (visualEvidenceMeta.status === 'empty_conclusion') {
      visualEvidenceSummary.emptyConclusion += 1
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    schema: 'cloud1_dev',
    mode: 'replay_saved_session_without_visual_model',
    collectionProfile,
    visualEvidenceSummary,
    total: normalizedResults.length,
    success: normalizedResults.filter(item => item.ok).length,
    failed: normalizedResults.filter(item => !item.ok).length,
    progress: {
      processed: Number(progress?.processed || normalizedResults.length),
      targetTotal: Number(progress?.targetTotal || normalizedResults.length),
      complete: Boolean(progress?.complete)
    },
    results: shouldCompact
      ? normalizedResults.map(minimalAudit ? toMinimalAuditResult : toCompactKeyFieldResult)
      : normalizedResults
  }
}

function buildCanonicalBatchReport(
  results = [],
  args = {},
  progress = {},
  completedAt = new Date(),
  splitMeta = buildArtifactSplitMeta({})
) {
  const normalizedResults = Array.isArray(results) ? results : []
  const collectionProfile = {
    source: normalizeSourceFilter(args.source),
    manualVisualOnly: Object.prototype.hasOwnProperty.call(args, 'manual-visual-only')
      ? normalizeBoolean(args['manual-visual-only'], false)
      : false,
    manualVisualOnlyProvided: Object.prototype.hasOwnProperty.call(args, 'manual-visual-only')
  }
  const visualFinalEvidenceSummary = {
    total: normalizedResults.length,
    available: 0,
    missingRawRecords: 0,
    emptyConclusion: 0
  }

  for (const item of normalizedResults) {
    const visualEvidenceMeta = buildVisualEvidenceSummary(
      item?.source?.visualConclusion,
      item?.source?.visualRawRecordCount
    )
    if (Array.isArray(item?.source?.visualFinalEvidence) && item.source.visualFinalEvidence.length > 0) {
      visualFinalEvidenceSummary.available += 1
      continue
    }
    if (visualEvidenceMeta.status === 'available') {
      visualFinalEvidenceSummary.available += 1
      continue
    }
    if (visualEvidenceMeta.status === 'missing_raw_records') {
      visualFinalEvidenceSummary.missingRawRecords += 1
      continue
    }
    if (visualEvidenceMeta.status === 'empty_conclusion') {
      visualFinalEvidenceSummary.emptyConclusion += 1
    }
  }

  return {
    generatedAt: completedAt.toISOString(),
    schema: 'cloud1_dev',
    mode: 'replay_saved_session_without_visual_model',
    artifactSplit: splitMeta,
    collectionProfile,
    visualFinalEvidenceSummary,
    total: normalizedResults.length,
    success: normalizedResults.filter(item => item?.ok !== false).length,
    failed: normalizedResults.filter(item => item?.ok === false).length,
    progress: {
      processed: Number(progress?.processed || normalizedResults.length),
      targetTotal: Number(progress?.targetTotal || normalizedResults.length),
      complete: Boolean(progress?.complete)
    },
    results: normalizedResults.map(toCanonicalBatchResult)
  }
}

function toSortedCountEntries(counter = new Map()) {
  return [...counter.entries()]
    .map(([key, count]) => ({
      key: normalizeText(key),
      count: Number(count || 0)
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
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
    visualFinalEvidenceSummary: batchReport?.visualFinalEvidenceSummary || {
      total: results.length,
      available: 0,
      missingRawRecords: 0,
      emptyConclusion: 0
    },
    derivedSummary: {
      noVisualEvidenceCount,
      outOfPoolOnlyCount
    },
    outcomeTypeCounts: toSortedCountEntries(outcomeTypeCounter),
    stopReasonCounts: toSortedCountEntries(stopReasonCounter),
    topSymptomClassReplayCounts: toSortedCountEntries(symptomClassCounter).slice(0, 20)
  }
}

async function writeReportFile({ reportFile = '', results = [], args = {}, progress = {} } = {}) {
  const safeReportFile = normalizeText(reportFile)
  if (!safeReportFile) {return}
  const report = buildReport(results, args, progress)
  await fs.writeFile(
    path.resolve(process.cwd(), safeReportFile),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  )
}

async function writeCanonicalBatchArtifacts({ results = [], args = {}, progress = {}, completedAt = new Date() } = {}) {
  return writeSplitCanonicalBatchArtifacts({
    results,
    batchArtifactsDir,
    conclusionArtifactsDir,
    completedAt,
    maxResultsPerFile: MAX_BATCH_RESULTS_PER_FILE,
    buildBatchReport: async (chunkResults, context = {}) =>
      buildCanonicalBatchReport(
        chunkResults,
        args,
        {
          processed: Number(progress?.processed || chunkResults.length),
          targetTotal: Number(progress?.targetTotal || results.length || chunkResults.length),
          complete: Boolean(progress?.complete)
        },
        completedAt,
        context?.splitMeta
      ),
    buildBatchConclusion: async (batchReport, batchReportFile, context = {}) =>
      buildBatchConclusion(batchReport, batchReportFile, context?.splitMeta)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targets = await loadTargetSessions(args)
  if (!targets.length) {
    throw new Error('未找到可回放的 diagnosis session')
  }

  const replayOptions = {
    mode: normalizeText(args['replay-mode'], 'visual_origin'),
    round: normalizeInteger(args['replay-round'], 0),
    stage: normalizeText(args['replay-stage']),
    maxReplayRounds: normalizeInteger(args['max-replay-rounds'], 3),
    suppressDiagnoseLogs: normalizeBoolean(args['suppress-diagnose-logs'], false)
  }

  const reportFile = normalizeText(args['report-file'])
  const flushEvery = reportFile
    ? Math.max(1, normalizeInteger(args['flush-every'], 25))
    : 0
  const concurrency = Math.max(1, normalizeInteger(args.concurrency, 1))
  const results = new Array(targets.length)
  let nextIndex = 0
  let processedCount = 0
  let flushChain = Promise.resolve()

  const scheduleFlush = progress => {
    if (flushEvery <= 0) {return flushChain}
    flushChain = flushChain.then(() => {
      return writeReportFile({
        reportFile,
        results: results.filter(Boolean),
        args,
        progress
      })
    })
    return flushChain
  }

  const processTargetAtIndex = async index => {
    const target = targets[index]
    try {
      results[index] = await replaySession(target, replayOptions)
    } catch (error) {
      results[index] = {
        ok: false,
        sessionId: target.sessionId,
        openid: target.openid,
        error: String(error?.message || error || '')
      }
    }

    processedCount += 1
    if (flushEvery > 0 && processedCount % flushEvery === 0) {
      await scheduleFlush({
        processed: processedCount,
        targetTotal: targets.length,
        complete: false
      })
    }
  }

  const workerCount = Math.min(concurrency, targets.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1
      if (currentIndex >= targets.length) {
        return
      }
      await processTargetAtIndex(currentIndex)
    }
  })

  await Promise.all(workers)
  await flushChain

  const finalProgress = {
    processed: targets.length,
    targetTotal: targets.length,
    complete: true
  }
  const report = buildReport(results, args, finalProgress)

  await writeReportFile({
    reportFile,
    results,
    args,
    progress: finalProgress
  })

  const batchArtifacts = await writeCanonicalBatchArtifacts({
    results,
    args,
    progress: finalProgress,
    completedAt: new Date()
  })

  process.stdout.write(`${JSON.stringify({
    batchReportFile: batchArtifacts.artifacts[0]?.batchReportFile || '',
    conclusionFile: batchArtifacts.artifacts[0]?.conclusionFile || '',
    batchReportFiles: batchArtifacts.artifacts.map(item => item.batchReportFile),
    conclusionFiles: batchArtifacts.artifacts.map(item => item.conclusionFile),
    batchRootBaseName: batchArtifacts.rootBaseName,
    batchPartCount: Number(batchArtifacts.partCount || batchArtifacts.artifacts.length || 0),
    legacyReportFile: normalizeText(reportFile),
    total: report.total,
    success: report.success,
    failed: report.failed,
    progress: finalProgress
  }, null, 2)}\n`)
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    process.stderr.write(`${String(error?.stack || error)}\n`)
    process.exit(1)
  })
