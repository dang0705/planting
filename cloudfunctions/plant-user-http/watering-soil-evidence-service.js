'use strict'

let cloudbase
try {
  cloudbase = require('/opt/utils/cloudbase')
} catch {
  cloudbase = require('../layer/utils/cloudbase')
}
const { models, getCloudBase } = cloudbase
let soilVisual
try {
  soilVisual = require('/opt/utils/watering-soil-visual')
} catch {
  soilVisual = require('../layer/utils/watering-soil-visual')
}
const { fuseWateringPlanWithSoilEvidence } = soilVisual

function text(value = '') {
  return String(value || '').trim()
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function rows(result) {
  return result?.data?.executeResultList || []
}

function createEvidenceError(message, statusCode = 422) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

// 规划结果只需要给界面一条可理解的来源说明。证据内部状态、时间和置信度仍
// 保留在服务端审计数据中，避免把模型协议字段变成用户界面的事实来源。
function toPublicSoilEvidence(audit = {}) {
  if (!audit || typeof audit !== 'object') {
    return null
  }
  const source = text(audit.source)
  const outcome = text(audit.outcome)
  const sourceLabel = source === 'recent_diagnosis' ? '使用最近诊断盆土图' : '使用本次拍摄的盆土图'
  const observation =
    outcome === 'wet_hold'
      ? '盆土表面仍明显湿润，本次先不浇水。'
      : outcome === 'dry_manual_check'
        ? '盆土表层偏干，已要求手动摸土确认。'
        : '盆土照片仅作辅助，已要求手动摸土确认。'
  return { sourceLabel, observation }
}

async function getOwnedSoilEvidence({ openid, evidenceId, plantId = null, allowTemporary = false }) {
  const normalizedEvidenceId = text(evidenceId)
  if (!normalizedEvidenceId) {
    throw createEvidenceError('请先拍摄盆土表面')
  }
  const result = await models.$runSQL(
    `SELECT evidence_id, user_plant_id, source_type, source_file_id,
            CAST(analysis_json AS CHAR) AS analysis_json_text, analyzed_at, expires_at
       FROM watering_visual_evidences
      WHERE evidence_id = {{evidenceId}}
        AND _openid = {{openid}}
        AND expires_at >= CURRENT_TIMESTAMP
      LIMIT 1`,
    { evidenceId: normalizedEvidenceId, openid: text(openid) }
  )
  const row = rows(result)[0]
  if (!row) {
    throw createEvidenceError('盆土照片已过期，请重新拍摄')
  }
  const rowPlantId = row.user_plant_id === null || row.user_plant_id === undefined ? null : Number(row.user_plant_id)
  if (plantId !== null && Number(plantId) !== rowPlantId) {
    throw createEvidenceError('盆土照片不属于当前植物', 403)
  }
  if (plantId === null && (!allowTemporary || text(row.source_type) !== 'temporary')) {
    throw createEvidenceError('盆土照片不能用于独立浇水建议', 403)
  }
  return {
    evidenceId: text(row.evidence_id),
    sourceType: text(row.source_type),
    sourceFileId: text(row.source_file_id),
    analysis: parseJson(row.analysis_json_text ?? row.analysis_json, {}),
    analyzedAt: row.analyzed_at || ''
  }
}

async function applySoilEvidence({ openid, evidenceId, plantId = null, manualConfirmed = false, plan }) {
  const evidence = await getOwnedSoilEvidence({
    openid,
    evidenceId,
    plantId,
    allowTemporary: plantId === null
  })
  const fused = fuseWateringPlanWithSoilEvidence(
    plan,
    { ...evidence.analysis, analyzedAt: evidence.analyzedAt || evidence.analysis.analyzedAt },
    { manualConfirmed }
  )
  return { plan: fused, evidence }
}

async function cleanupTemporarySoilEvidence({ openid, evidenceId }) {
  const normalizedEvidenceId = text(evidenceId)
  if (!normalizedEvidenceId) {
    return
  }
  const result = await models.$runSQL(
    `SELECT source_type, source_file_id
       FROM watering_visual_evidences
      WHERE evidence_id = {{evidenceId}} AND _openid = {{openid}}
      LIMIT 1`,
    { evidenceId: normalizedEvidenceId, openid: text(openid) }
  )
  const row = rows(result)[0]
  if (!row || text(row.source_type) !== 'temporary') {
    return
  }
  const fileId = text(row.source_file_id)
  await models.$runSQL(
    'DELETE FROM watering_visual_evidences WHERE evidence_id = {{evidenceId}} AND _openid = {{openid}}',
    { evidenceId: normalizedEvidenceId, openid: text(openid) }
  )
  if (!fileId) {
    return
  }
  await models.$runSQL(
    `DELETE FROM plant_images
      WHERE _openid = {{openid}} AND fileId = {{fileId}} AND plantId IN ('', 'temp', 'identify')`,
    { openid: text(openid), fileId }
  )
  await getCloudBase().deleteFile({ fileList: [fileId] }).catch(error => {
    console.warn('独立浇水临时盆土图清理失败:', error?.message || error)
  })
}

module.exports = {
  getOwnedSoilEvidence,
  applySoilEvidence,
  cleanupTemporarySoilEvidence,
  toPublicSoilEvidence,
  _test: { parseJson, toPublicSoilEvidence }
}
