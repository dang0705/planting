#!/usr/bin/env node
import fs from 'node:fs/promises'
import cloudbase from '/Users/jay/WebstormProjects/planting/cloudfunctions/layer/utils/cloudbase.js'

const { models } = cloudbase
const REPORT_PATH = '/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/manifests/manual-noncontinuous-cloud1-dev-v2.report.json'

function ts(v) {
  const n = new Date(v).getTime()
  return Number.isNaN(n) ? null : n
}

(async () => {
  const manualRows = await models.$runSQL(`
    SELECT
      s.diagnosis_id,
      s._openid,
      s.created_at,
      s.updated_at,
      s.outcome_type,
      s.latest_visual_call_batch_id
    FROM diagnosis_sessions s
    WHERE NOT EXISTS (SELECT 1 FROM diagnosis_batch_reviews b WHERE b.diagnosis_id = s.diagnosis_id)
      AND NOT (s._openid <=> NULL)
      AND s._openid <> ''
      AND s._openid NOT LIKE 'dev_terminal_%'
      AND s._openid NOT LIKE 'anon_dev_%'
      AND s._openid REGEXP '^o[A-Za-z0-9_-]{10,}$'
    ORDER BY created_at DESC
  `)

  const nonBatchRows = await models.$runSQL(`
    SELECT
      s.diagnosis_id,
      s._openid,
      s.created_at
    FROM diagnosis_sessions s
    WHERE NOT EXISTS (SELECT 1 FROM diagnosis_batch_reviews b WHERE b.diagnosis_id = s.diagnosis_id)
    ORDER BY created_at DESC
  `)

  const totalRows = (await models.$runSQL('SELECT COUNT(1) AS total_rows FROM diagnosis_sessions')).data?.executeResultList?.[0]?.total_rows || 0
  const totalManual = (await models.$runSQL(`
    SELECT COUNT(1) AS total_rows
    FROM diagnosis_sessions s
    WHERE NOT EXISTS (SELECT 1 FROM diagnosis_batch_reviews b WHERE b.diagnosis_id = s.diagnosis_id)
      AND NOT (s._openid <=> NULL)
      AND s._openid <> ''
      AND s._openid NOT LIKE 'dev_terminal_%'
      AND s._openid NOT LIKE 'anon_dev_%'
      AND s._openid REGEXP '^o[A-Za-z0-9_-]{10,}$'
  `)).data?.executeResultList?.[0]?.total_rows || 0

  const nonBatchList = nonBatchRows?.data?.executeResultList || []
  const nonContinuous = []
  const gapMinutes = 5 * 60 * 1000
  for (let i = 1; i < nonBatchList.length; i += 1) {
    const prev = ts(nonBatchList[i - 1].created_at)
    const cur = ts(nonBatchList[i].created_at)
    if (prev !== null && prev !== undefined && cur !== null && cur !== undefined) {
      const diff = prev - cur
      if (diff > gapMinutes) {
        nonContinuous.push({
          diagnosisId: nonBatchList[i].diagnosis_id,
          createdAt: nonBatchList[i].created_at,
          openid: nonBatchList[i]._openid,
          prevDiagnosisId: nonBatchList[i - 1].diagnosis_id,
          prevCreatedAt: nonBatchList[i - 1].created_at,
          gapMinutes: Number((diff / 60000).toFixed(2))
        })
      }
    }
  }

  const manualSet = new Set((manualRows?.data?.executeResultList || []).map(item => item.diagnosis_id))
  const manualNonContinuous = nonContinuous.filter(item => manualSet.has(item.diagnosisId))

  const report = {
    totalSessions: totalRows,
    totalNonBatchSessions: nonBatchList.length,
    manualLikeNonBatchCount: totalManual,
    manualLikeNonBatchPercent: Number(((totalManual / Math.max(nonBatchList.length, 1)) * 100).toFixed(2)),
    nonContinuousGapMinutesThreshold: 5,
    nonContinuousCount: nonContinuous.length,
    manualNonContinuousCount: manualNonContinuous.length,
    manualNonContinuousPercentOfNonContinuous: Number(((manualNonContinuous.length / Math.max(nonContinuous.length, 1)) * 100).toFixed(2)),
    sampleManualSessions: (manualRows?.data?.executeResultList || []).map(item => ({
      diagnosisId: item.diagnosis_id,
      openid: item._openid,
      createdAt: item.created_at,
      outcomeType: item.outcome_type,
      latestVisualBatch: item.latest_visual_call_batch_id || null
    })),
    sampleNonContinuous: nonContinuous.slice(0, 120),
    sampleManualNonContinuous: manualNonContinuous.slice(0, 120)
  }

  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`report_written:${REPORT_PATH}`)
})().catch(error => {
  console.error(error)
  process.exit(1)
})
