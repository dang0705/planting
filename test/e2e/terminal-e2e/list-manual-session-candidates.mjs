#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cloudbase from '../../cloudfunctions/layer/utils/cloudbase.js'

const { models } = cloudbase
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INTERNAL_REVIEW_OPENID_PREFIXES = ['dev_terminal_', 'anon_dev_']
const LIKELY_MINI_PROGRAM_OPENID_PATTERN = '^o[A-Za-z0-9_-]{10,}$'

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

function normalizeTimestampMs(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function mapSessionRow(row = {}) {
  return {
    sessionId: normalizeText(row?.diagnosis_id),
    openid: normalizeText(row?._openid),
    createdAt: normalizeText(row?.created_at),
    updatedAt: normalizeText(row?.updated_at || row?.created_at),
    outcomeType: normalizeText(row?.outcome_type),
    latestVisualBatchId: normalizeText(row?.latest_visual_call_batch_id)
  }
}

function buildManualHumanSourceClause(alias = 'diagnosis_sessions') {
  const safeAlias = String(alias || 'diagnosis_sessions').trim() || 'diagnosis_sessions'
  const conditions = [
    `NOT (${safeAlias}._openid <=> NULL)`,
    `${safeAlias}._openid <> ''`
  ]

  INTERNAL_REVIEW_OPENID_PREFIXES.forEach((prefix, index) => {
    conditions.push(`${safeAlias}._openid NOT LIKE {{internalReviewPrefix_${index}}}`)
  })

  return conditions.join(' AND ')
}

function buildStoredReviewSourceSql(alias = 'diagnosis_sessions') {
  const safeAlias = String(alias || 'diagnosis_sessions').trim() || 'diagnosis_sessions'
  return `LOWER(TRIM(COALESCE(
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${safeAlias}.runtime_snapshot_json, '$.reviewSourceType')), 'null'),
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${safeAlias}.runtime_snapshot_json, '$.clientContext.reviewSourceType')), 'null'),
    ''
  )))`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const gapMinutes = Math.max(1, normalizeInteger(args['gap-minutes'], 5))
  const reportPath = normalizeText(
    args.out,
    path.join(__dirname, 'manifests', 'manual-session-candidates.report.json')
  )

  const baseParams = {}
  INTERNAL_REVIEW_OPENID_PREFIXES.forEach((prefix, index) => {
    baseParams[`internalReviewPrefix_${index}`] = `${prefix}%`
  })

  const taggedBaseClause = `
    NOT EXISTS (SELECT 1 FROM diagnosis_batch_reviews AS batch WHERE batch.diagnosis_id = diagnosis_sessions.diagnosis_id)
    AND ${buildManualHumanSourceClause('diagnosis_sessions')}
  `
  const gapBaseClause = `
    NOT EXISTS (SELECT 1 FROM diagnosis_batch_reviews AS batch WHERE batch.diagnosis_id = diagnosis_sessions.diagnosis_id)
  `

  const taggedManualRows = await models.$runSQL(
    `
      SELECT diagnosis_id, _openid, created_at, updated_at, outcome_type, latest_visual_call_batch_id
      FROM diagnosis_sessions
      WHERE ${taggedBaseClause}
        AND (${buildStoredReviewSourceSql('diagnosis_sessions')} = 'manual' OR diagnosis_sessions._openid REGEXP {{likelyMiniProgramOpenIdPattern}})
      ORDER BY updated_at DESC
    `,
    {
      ...baseParams,
      likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
    }
  )

  const humanGapBaseRows = await models.$runSQL(
    `
      SELECT diagnosis_id, _openid, created_at, updated_at, outcome_type, latest_visual_call_batch_id
      FROM diagnosis_sessions
      WHERE ${taggedBaseClause}
      ORDER BY created_at DESC
    `,
    baseParams
  )

  const allNonBatchGapBaseRows = await models.$runSQL(
    `
      SELECT diagnosis_id, _openid, created_at, updated_at, outcome_type, latest_visual_call_batch_id
      FROM diagnosis_sessions
      WHERE ${gapBaseClause}
      ORDER BY created_at DESC
    `,
    {}
  )

  const taggedManual = (taggedManualRows?.data?.executeResultList || []).map(mapSessionRow)
  const humanSourceRows = (humanGapBaseRows?.data?.executeResultList || []).map(mapSessionRow)
  const thresholdMs = gapMinutes * 60 * 1000
  const buildGapCandidates = (rows = [], { requireOpenid = false } = {}) => {
    const orderedRows = rows.map(mapSessionRow).filter(item => {
      if (!item?.sessionId || !item?.createdAt) {return false}
      if (!requireOpenid) {return true}
      return Boolean(item.openid)
    })
    const gapCandidates = []

    for (let index = 1; index < orderedRows.length; index += 1) {
      const previous = orderedRows[index - 1]
      const current = orderedRows[index]
      const gapMs = normalizeTimestampMs(previous?.createdAt) - normalizeTimestampMs(current?.createdAt)
      if (gapMs > thresholdMs) {
        gapCandidates.push({
          ...current,
          gapMinutes: Number((gapMs / 60000).toFixed(2)),
          previousSessionId: normalizeText(previous?.sessionId),
          previousCreatedAt: normalizeText(previous?.createdAt)
        })
      }
    }

    return gapCandidates
  }

  const humanGapCandidates = buildGapCandidates(
    humanGapBaseRows?.data?.executeResultList || [],
    { requireOpenid: true }
  )
  const allNonBatchGapCandidates = buildGapCandidates(
    allNonBatchGapBaseRows?.data?.executeResultList || [],
    { requireOpenid: false }
  )

  const buildCombined = (...groups) => {
    const combinedMap = new Map()
    for (const item of groups.flat()) {
      if (!item?.sessionId || combinedMap.has(item.sessionId)) {continue}
      combinedMap.set(item.sessionId, item)
    }

    return [...combinedMap.values()].sort((left, right) => {
      const leftTs = normalizeTimestampMs(left?.updatedAt || left?.createdAt)
      const rightTs = normalizeTimestampMs(right?.updatedAt || right?.createdAt)
      return rightTs - leftTs
    })
  }

  const combinedHuman = buildCombined(taggedManual, humanGapCandidates)
  const combinedAllNonBatch = buildCombined(taggedManual, allNonBatchGapCandidates)
  const internalGapCandidates = allNonBatchGapCandidates.filter(item => {
    return INTERNAL_REVIEW_OPENID_PREFIXES.some(prefix => item?.openid?.startsWith(prefix))
  })

  const counts = {
    taggedManualCount: taggedManual.length,
    humanSourceRowCount: humanSourceRows.length,
    humanGapCandidateCount: humanGapCandidates.length,
    allNonBatchGapCandidateCount: allNonBatchGapCandidates.length,
    internalGapCandidateCount: internalGapCandidates.length,
    combinedHumanCount: combinedHuman.length,
    combinedAllNonBatchCount: combinedAllNonBatch.length
  }
  const humanOpenidBuckets = [...humanSourceRows.reduce((bucketMap, item) => {
    const key = normalizeText(item?.openid, '[empty]')
    const bucket = bucketMap.get(key) || {
      openid: key,
      sessionCount: 0,
      firstCreatedAt: normalizeText(item?.createdAt),
      lastCreatedAt: normalizeText(item?.createdAt)
    }
    bucket.sessionCount += 1
    if (normalizeTimestampMs(item?.createdAt) < normalizeTimestampMs(bucket.firstCreatedAt)) {
      bucket.firstCreatedAt = normalizeText(item?.createdAt)
    }
    if (normalizeTimestampMs(item?.createdAt) > normalizeTimestampMs(bucket.lastCreatedAt)) {
      bucket.lastCreatedAt = normalizeText(item?.createdAt)
    }
    bucketMap.set(key, bucket)
    return bucketMap
  }, new Map()).values()].sort((left, right) => {
    if (right.sessionCount !== left.sessionCount) {
      return right.sessionCount - left.sessionCount
    }
    return normalizeTimestampMs(right.lastCreatedAt) - normalizeTimestampMs(left.lastCreatedAt)
  })

  const report = {
    generatedAt: new Date().toISOString(),
    gapMinutes,
    counts,
    humanOpenidBuckets,
    taggedManual,
    humanGapCandidates,
    allNonBatchGapCandidates,
    internalGapCandidates,
    combinedHuman,
    combinedAllNonBatch
  }

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${reportPath}\n`)
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
