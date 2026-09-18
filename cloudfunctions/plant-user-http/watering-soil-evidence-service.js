'use strict'

let cloudbase
try {
  cloudbase = require('/opt/utils/cloudbase')
} catch {
  cloudbase = require('../layer/utils/cloudbase')
}
const { models, getCloudBase } = cloudbase
let runtimeEnv
try {
  runtimeEnv = require('/opt/utils/runtime-env')
} catch {
  runtimeEnv = require('../layer/utils/runtime-env')
}
let soilVisual
try {
  // 盆土融合契约随函数包发布，避免共享层版本滞后时把可信湿润证据
  // 错误降级为普通人工确认。
  soilVisual = require('./watering-soil-visual')
} catch {
  try {
    soilVisual = require('/opt/utils/watering-soil-visual')
  } catch {
    soilVisual = require('../layer/utils/watering-soil-visual')
  }
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

function resolveEvidenceAnalyzedAt(evidence = {}) {
  return text(evidence?.analysis?.analyzedAt) || evidence?.analyzedAt || ''
}

function rows(result) {
  return result?.data?.executeResultList || []
}

function createEvidenceError(message, statusCode = 422) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function evidenceTable() {
  const databaseName = text(runtimeEnv.resolveSqlDatabaseName())
  if (!['cloud1_dev', 'cloud1-2grufevs395a9d5e'].includes(databaseName)) {
    throw new Error('浇水视觉证据数据库配置无效')
  }
  return `\`${databaseName}\`.\`watering_visual_evidences\``
}

// 规划结果只需要给界面一条可理解的来源说明。证据内部状态、时间和置信度仍
// 保留在服务端审计数据中，避免把模型协议字段变成用户界面的事实来源。
function toPublicSoilEvidence(audit = {}, plan = {}) {
  if (!audit || typeof audit !== 'object') {
    return null
  }
  const source = text(audit.source)
  const outcome = text(audit.outcome)
  const sourceLabel = source === 'recent_diagnosis' ? '使用最近诊断盆土图' : '使用本次拍摄的盆土图'
  const observation =
    outcome === 'wet_hold'
      ? '盆土表面仍明显湿润，本次先不浇水。'
      : outcome === 'manual_wet_hold'
        ? '你确认盆土里面仍有湿度，本次先不浇水。'
        : outcome === 'wet_forced'
          ? '你已选择继续查看水量建议；盆土表面仍潮湿，请不要据此立即浇水。'
          : outcome === 'moist_visible'
            ? '模型判断土表有湿度，表层尚可但盆内可能较湿。'
            : outcome === 'dry_trusted'
              ? '盆土已按干燥处理，建议尽快浇水。'
              : outcome === 'dry_manual_check'
                ? '盆土表层偏干，已要求手动摸土确认。'
                : '盆土照片仅作辅助，已要求手动摸土确认。'
  const resultText =
    outcome === 'wet_hold' || outcome === 'wet_forced'
      ? '模型判断土表潮湿。'
      : outcome === 'manual_wet_hold'
        ? '你确认盆土里面仍有湿度。'
        : outcome === 'moist_visible'
          ? '模型判断土表有湿度，表层尚可但盆内可能较湿。'
          : outcome === 'dry_trusted'
            ? '模型判断土表明显干燥。'
            : outcome === 'dry_manual_check'
              ? '模型判断土表偏干。'
              : '模型暂时无法清楚判断盆土状态。'
  const actionText =
    outcome === 'wet_hold' || outcome === 'manual_wet_hold'
      ? '强烈不建议立即浇水；如需设置日历提醒，保存前会再次确认。'
      : outcome === 'wet_forced'
        ? '你选择继续查看水量；实际不要立刻浇水。'
        : outcome === 'dry_trusted'
          ? '建议尽快浇水。'
          : outcome === 'moist_visible'
            ? String(
                plan?.soilCheck?.message || '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。'
              ).trim()
            : String(plan?.soilCheck?.message || '请确认盆土里面的状态后再决定。').trim()
  return {
    sourceLabel,
    observation,
    resultText,
    actionText,
    // 仅返回面向界面的布尔语义，不把内部 outcome/status 字段暴露给客户端。
    wetHold: outcome === 'wet_hold' || outcome === 'manual_wet_hold',
    surfaceMoist: outcome === 'moist_visible' || audit.surfaceState === 'moist'
  }
}

async function getOwnedSoilEvidence({
  openid,
  evidenceId,
  plantId = null,
  allowTemporary = false
}) {
  const normalizedEvidenceId = text(evidenceId)
  if (!normalizedEvidenceId) {
    throw createEvidenceError('请先拍摄盆土表面')
  }
  const result = await models.$runSQL(
    `SELECT evidence_id, user_plant_id, source_type, source_file_id,
            CAST(analysis_json AS CHAR) AS analysis_json_text, analyzed_at, expires_at
       FROM ${evidenceTable()}
      WHERE evidence_id = {{evidenceId}}
        AND _openid = {{openid}}
        AND expires_at >= CURRENT_TIMESTAMP
      LIMIT 1`,
    { evidenceId: normalizedEvidenceId, openid: text(openid) }
  )
  let row = rows(result)[0]
  // 独立浇水的临时图只属于当前用户且只保留 24 小时。页面重渲染或网络重试
  // 若携带已清理的旧 evidenceId，优先恢复到该用户最新的有效临时图，不能让
  // 已完成的本次分析被旧 ID 阻断；用户植物路径绝不走此恢复分支。
  if (!row && plantId === null && allowTemporary) {
    const fallback = await models.$runSQL(
      `SELECT evidence_id, user_plant_id, source_type, source_file_id,
              CAST(analysis_json AS CHAR) AS analysis_json_text, analyzed_at, expires_at
         FROM ${evidenceTable()}
        WHERE _openid = {{openid}}
          AND source_type = 'temporary'
          AND expires_at >= CURRENT_TIMESTAMP
        ORDER BY analyzed_at DESC
        LIMIT 1`,
      { openid: text(openid) }
    )
    row = rows(fallback)[0]
  }
  if (!row) {
    throw createEvidenceError('盆土照片已过期，请重新拍摄')
  }
  const rowPlantId =
    row.user_plant_id === null || row.user_plant_id === undefined ? null : Number(row.user_plant_id)
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

async function applySoilEvidence({
  openid,
  evidenceId,
  plantId = null,
  manualConfirmed = false,
  forceVisualWetness = false,
  forceDryness = false,
  manualSoilState = '',
  plan
}) {
  const evidence = await getOwnedSoilEvidence({
    openid,
    evidenceId,
    plantId,
    allowTemporary: plantId === null
  })
  const fused = fuseWateringPlanWithSoilEvidence(
    plan,
    // analysis.analyzedAt 是带时区的 ISO 时间；数据库 analyzed_at 返回值可能
    // 不带时区，云端按 UTC 解析后会被误判成“未来照片”，令可信 wet 证据失效。
    { ...evidence.analysis, analyzedAt: resolveEvidenceAnalyzedAt(evidence) },
    { manualConfirmed, forceVisualWetness, forceDryness, manualSoilState }
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
       FROM ${evidenceTable()}
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
    `DELETE FROM ${evidenceTable()} WHERE evidence_id = {{evidenceId}} AND _openid = {{openid}}`,
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
  await getCloudBase()
    .deleteFile({ fileList: [fileId] })
    .catch(error => {
      console.warn('独立浇水临时盆土图清理失败:', error?.message || error)
    })
}

module.exports = {
  getOwnedSoilEvidence,
  applySoilEvidence,
  cleanupTemporarySoilEvidence,
  toPublicSoilEvidence,
  _test: { parseJson, resolveEvidenceAnalyzedAt, toPublicSoilEvidence }
}
