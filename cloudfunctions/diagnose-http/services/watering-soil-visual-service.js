'use strict'

const crypto = require('crypto')
let cloudbase
try {
  // 盆土证据访问新增视觉表；优先使用与函数同批发布的 SQL 工具，避免
  // Layer 版本落后时因表白名单或 SQL 处理差异让请求直接返回 500。
  cloudbase = require('../cloudbase')
} catch {
  try {
    cloudbase = require('/opt/utils/cloudbase')
  } catch {
    cloudbase = require('../../layer/utils/cloudbase')
  }
}
const { models, getCloudBase } = cloudbase
const { callLLMDiagnose } = require('../utils/llm')
const { buildWateringSoilPromptPayload } = require('../utils/watering-soil-prompt')
let soilVisual
try {
  soilVisual = require('/opt/utils/watering-soil-visual')
} catch {
  // HTTP 函数的发布包不包含仓库层目录；把这份纯工具随函数打包，避免
  // Layer 版本与函数代码不同步时，整个盆土接口在加载阶段直接返回 500。
  soilVisual = require('../watering-soil-visual')
}
const { SOIL_EVIDENCE_TTL_MS } = soilVisual

const SOIL_IMAGE_RETRY_MESSAGE = '请拍摄清晰的盆土表面后再试，这张照片暂不用于浇水判断。'
const SOIL_ANALYSIS_UNCERTAIN_MESSAGE = '盆土状态不够清楚，请重新拍摄或手动摸土确认。'
const TEMPORARY_PLANT_IDS = new Set(['', 'temp', 'identify'])

function text(value = '') {
  return String(value || '').trim()
}

function rows(result) {
  return result?.data?.executeResultList || []
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

function createClientError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function createEvidenceId() {
  return `wse_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
}

function toSqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('盆土证据失效时间无效')
  }
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function normalizedSource(value = '') {
  const source = text(value).toLowerCase()
  return ['recent_diagnosis', 'plant_image', 'temporary'].includes(source) ? source : ''
}

function removeJsonFence(value = '') {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function parseModelReview(rawText = '') {
  const cleaned = removeJsonFence(rawText)
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  const payload =
    firstBrace >= 0 && lastBrace > firstBrace
      ? parseJson(cleaned.slice(firstBrace, lastBrace + 1), null)
      : null
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const surfaceState = text(payload.surfaceState).toLowerCase()
  const standingWater = text(payload.standingWater).toLowerCase()
  const visibility = text(payload.visibility).toLowerCase()
  const confidence = Number(payload.confidence)
  return {
    accepted: payload.accepted === true,
    surfaceState: ['wet', 'moist', 'dry', 'uncertain'].includes(surfaceState)
      ? surfaceState
      : 'uncertain',
    standingWater: ['yes', 'no', 'uncertain'].includes(standingWater)
      ? standingWater
      : 'uncertain',
    visibility: ['clear', 'limited', 'unusable'].includes(visibility) ? visibility : 'unusable',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    visibleBasisCn: text(payload.visibleBasisCn).slice(0, 120)
  }
}

async function getTempUrl(fileId) {
  const result = await getCloudBase().getTempFileURL({
    fileList: [text(fileId)],
    maxAge: 3600
  })
  const url = text(result?.fileList?.[0]?.tempFileURL)
  if (!url) {
    throw createClientError('这张照片已无法使用，请重新拍摄。', 409)
  }
  return url
}

async function resolveRecentDiagnosisTarget({ openid, plantId }) {
  const normalizedPlantId = Number(plantId)
  if (!normalizedPlantId) {
    throw createClientError('缺少植物信息')
  }
  let result
  try {
    result = await models.$runSQL(
      `SELECT raw.visual_raw_image_record_id, raw.file_id, raw.created_at
       FROM visual_raw_image_records AS raw
       INNER JOIN diagnosis_sessions AS session
         -- 历史诊断表仍是 utf8mb4_unicode_ci，而视觉记录已迁移到
         -- utf8mb4_0900_ai_ci。显式使用前者，避免复用查询因 1267 失败。
         ON session.session_id = raw.session_id COLLATE utf8mb4_unicode_ci
        AND session._openid = raw._openid COLLATE utf8mb4_unicode_ci
       INNER JOIN visual_normalized_image_results AS normalized
         ON normalized.visual_raw_image_record_id = raw.visual_raw_image_record_id
        AND normalized._openid = raw._openid
      WHERE raw._openid = {{openid}}
        AND session.user_plant_id = {{plantId}}
        AND raw.input_slot_type = 'soil'
        AND raw.call_status = 'succeeded'
        AND raw.file_id IS NOT NULL AND raw.file_id <> ''
        AND raw.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)
        AND normalized.primary_organ_type = 'soil'
        AND normalized.clarity_level = 'high'
        AND normalized.organ_conflict_flag = 0
      ORDER BY raw.created_at DESC
      LIMIT 1`,
      { openid: text(openid), plantId: normalizedPlantId }
    )
  } catch (error) {
    // 复用资格无法安全确认时，宁可要求新拍，也不能因为历史诊断数据或
    // 数据库兼容问题阻断浇水流程，更不能把未知图片当作可复用证据。
    console.error('[watering-soil] recent diagnosis reuse lookup failed', {
      message: String(error?.message || error).slice(0, 300)
    })
    return null
  }
  const row = rows(result)[0]
  if (!row?.file_id) {
    return null
  }
  return {
    source: 'recent_diagnosis',
    fileId: text(row.file_id),
    plantId: normalizedPlantId,
    diagnosisRawImageRecordId: text(row.visual_raw_image_record_id),
    sourceLabel: '使用最近诊断盆土图'
  }
}

async function resolveOwnedPlantImageTarget({ openid, plantId, fileId, source }) {
  const normalizedFileId = text(fileId)
  if (!normalizedFileId) {
    throw createClientError('请先上传盆土照片')
  }
  const result = await models.$runSQL(
    `SELECT _id, plantId, fileId
       FROM plant_images
      WHERE _openid = {{openid}} AND fileId = {{fileId}}
      LIMIT 1`,
    { openid: text(openid), fileId: normalizedFileId }
  )
  const row = rows(result)[0]
  if (!row) {
    throw createClientError('这张照片不属于当前用户', 403)
  }
  const storedPlantId = text(row.plantId)
  if (source === 'temporary') {
    if (!TEMPORARY_PLANT_IDS.has(storedPlantId)) {
      throw createClientError('这张照片不能用于独立浇水建议', 409)
    }
    return {
      source,
      fileId: normalizedFileId,
      plantId: null,
      plantImageId: text(row._id),
      sourceLabel: '本次拍摄的盆土图'
    }
  }
  const normalizedPlantId = Number(plantId)
  if (!normalizedPlantId || storedPlantId !== String(normalizedPlantId)) {
    throw createClientError('这张照片不属于当前植物', 403)
  }
  return {
    source,
    fileId: normalizedFileId,
    plantId: normalizedPlantId,
    plantImageId: text(row._id),
    sourceLabel: '本次拍摄的盆土图'
  }
}

async function resolveTarget({ openid, payload = {} }) {
  const source = normalizedSource(payload.source)
  if (!source) {
    throw createClientError('请先选择盆土照片')
  }
  if (source === 'recent_diagnosis') {
    return resolveRecentDiagnosisTarget({ openid, plantId: payload.plantId })
  }
  return resolveOwnedPlantImageTarget({
    openid,
    plantId: payload.plantId,
    fileId: payload.fileId,
    source
  })
}

function buildStoredReview({ review, source, usage, promptAudit }) {
  return {
    ...review,
    source,
    analyzedAt: new Date().toISOString(),
    modelUsage: usage || null,
    promptCache: {
      staticPrefixHash: text(promptAudit?.promptDebugMeta?.staticPrefixHash),
      promptCacheStrategy: promptAudit?.promptCacheStrategy || null
    }
  }
}

async function persistEvidence({ openid, target, review }) {
  const evidenceId = createEvidenceId()
  await models.$runSQL(
    `INSERT INTO watering_visual_evidences (
       evidence_id, _openid, user_plant_id, source_type, source_file_id,
       source_visual_raw_image_record_id, analysis_json, analyzed_at, expires_at
     ) VALUES (
       {{evidenceId}}, {{openid}},
       IF({{userPlantIdHasValue}} = 1, {{userPlantIdValue}}, NULL),
       {{sourceType}}, {{fileId}},
       {{diagnosisRawImageRecordId}}, {{analysisJson}}, CURRENT_TIMESTAMP,
       DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)
     )`,
    {
      evidenceId,
      openid: text(openid),
      userPlantIdHasValue: Number.isInteger(Number(target.plantId)) && Number(target.plantId) > 0 ? 1 : 0,
      userPlantIdValue: Number(target.plantId) > 0 ? Number(target.plantId) : 0,
      sourceType: target.source,
      fileId: target.fileId,
      diagnosisRawImageRecordId: target.diagnosisRawImageRecordId || null,
      analysisJson: JSON.stringify(review)
    }
  )

  if (target.plantImageId) {
    await models.$runSQL(
      `UPDATE plant_images
          SET imagePurpose = 'watering_soil',
              visualEvidenceJson = {{analysisJson}},
              visualAnalyzedAt = CURRENT_TIMESTAMP
        WHERE _openid = {{openid}} AND _id = {{plantImageId}}`,
      {
        openid: text(openid),
        plantImageId: target.plantImageId,
        analysisJson: JSON.stringify(review)
      }
    )
  }
  return evidenceId
}

function toPublicReview(review = {}) {
  return {
    surfaceState: review.surfaceState,
    standingWater: review.standingWater,
    confidence: review.confidence,
    visibleBasisCn: review.visibleBasisCn,
    needsManualConfirmation:
      review.surfaceState !== 'wet' && review.standingWater !== 'yes'
  }
}

function buildFrontendDebugAudit({ result = {}, parsed = null, review = null } = {}) {
  return {
    providerId: text(result?.promptAudit?.providerId),
    modelId: text(result?.promptAudit?.modelId || result?.promptAudit?.model),
    promptText: text(result?.promptAudit?.promptText),
    tokenUsage: result?.usage || null,
    imageInputTransport: text(result?.promptAudit?.imageInputTransport),
    modelReturnText: text(result?.text),
    parsedReview: parsed || null,
    finalReview: review ? toPublicReview(review) : null
  }
}

async function analyzeWateringSoilEvidence({ openid, payload = {} } = {}) {
  const target = await resolveTarget({ openid, payload })
  if (!target) {
    return {
      code: 200,
      data: { reusable: false, requiresNewPhoto: true }
    }
  }

  const imageUrl = await getTempUrl(target.fileId)
  let result
  try {
    result = await callLLMDiagnose(
      [{ imageRef: imageUrl, inputSlotType: 'soil', inputSlotLabel: '盆土表面' }],
      { promptBuilder: buildWateringSoilPromptPayload, disableConservative: true }
    )
  } catch (error) {
    throw Object.assign(new Error('盆土分析暂时不可用，请稍后重试。'), {
      code: 'SOIL_VISUAL_UNAVAILABLE',
      statusCode: 503,
      cause: error
    })
  }

  const parsed = parseModelReview(result?.text)
  const review = buildStoredReview({
    review:
      parsed || {
        accepted: false,
        surfaceState: 'uncertain',
        standingWater: 'uncertain',
        visibility: 'unusable',
        confidence: 0,
        visibleBasisCn: ''
      },
    source: target.source,
    usage: result?.usage || null,
    promptAudit: result?.promptAudit || null
  })
  const evidenceId = await persistEvidence({ openid, target, review })
  const photoAccepted = review.accepted && review.visibility !== 'unusable'
  const uncertain = !photoAccepted || review.visibility !== 'clear' || review.confidence < 0.72

  return {
    code: 200,
    data: {
      reusable: target.source === 'recent_diagnosis',
      source: target.source,
      sourceLabel: target.sourceLabel,
      previewUrl: imageUrl,
      evidenceId,
      accepted: photoAccepted,
      retry: !photoAccepted,
      message: !photoAccepted
        ? SOIL_IMAGE_RETRY_MESSAGE
        : uncertain
          ? SOIL_ANALYSIS_UNCERTAIN_MESSAGE
          : '',
      review: toPublicReview(review),
      ...(payload.debugAudit === true
        ? { debugAudit: buildFrontendDebugAudit({ result, parsed, review }) }
        : {})
    }
  }
}

async function cleanupTemporaryWateringSoilEvidence({ openid, evidenceId } = {}) {
  const normalizedEvidenceId = text(evidenceId)
  if (!normalizedEvidenceId) {
    return
  }
  await models.$runSQL(
    `DELETE FROM watering_visual_evidences
      WHERE evidence_id = {{evidenceId}}
        AND _openid = {{openid}}
        AND source_type = 'temporary'`,
    { evidenceId: normalizedEvidenceId, openid: text(openid) }
  )
}

module.exports = {
  SOIL_IMAGE_RETRY_MESSAGE,
  SOIL_ANALYSIS_UNCERTAIN_MESSAGE,
  parseModelReview,
  analyzeWateringSoilEvidence,
  cleanupTemporaryWateringSoilEvidence,
  _test: {
    normalizedSource,
    parseModelReview,
    toSqlDateTime,
    toPublicReview,
    buildFrontendDebugAudit,
    resolveRecentDiagnosisTarget,
    resolveOwnedPlantImageTarget
  }
}
