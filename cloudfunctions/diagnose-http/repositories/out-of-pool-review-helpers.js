'use strict'

const crypto = require('crypto')

const ALLOWED_REVIEW_ACTIONS = new Set(['approved', 'ignored'])
const SESSION_ID_COLLATION = 'utf8mb4_unicode_ci'

function normalizeReviewStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || normalized === 'all') {return 'all'}
  if (normalized === 'pending') {return 'pending'}
  if (ALLOWED_REVIEW_ACTIONS.has(normalized)) {return normalized}
  return 'all'
}

function normalizePageNumber(value, fallback = 1) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized < 1) {return fallback}
  return Math.floor(normalized)
}

function normalizePageSize(value, fallback = 20) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized < 1) {return fallback}
  return Math.min(100, Math.floor(normalized))
}

function normalizeKeyword(value = '') {
  return String(value || '').trim()
}

function buildOutOfPoolReviewId(visualNormalizedImageResultId = '', candidateIndex = 0) {
  const hash = crypto
    .createHash('sha1')
    .update(`${String(visualNormalizedImageResultId || '').trim()}::${Number(candidateIndex || 0)}`)
    .digest('hex')
    .slice(0, 24)

  return `voopr_${hash}`
}

function mapOutOfPoolCandidateRow(row = {}) {
  const reviewAction = String(row.review_action || '').trim().toLowerCase()
  const hasReplayImage = Number(row.has_replay_image || 0) ? 1 : 0
  const previewImageRef = hasReplayImage ? '' : row.preview_image_ref || ''
  const imageState = hasReplayImage ? 'replay' : previewImageRef ? 'direct' : 'missing'

  return {
    visualNormalizedImageResultId: row.visual_normalized_image_result_id || '',
    visualRawImageRecordId: row.visual_raw_image_record_id || '',
    sessionId: row.session_id || '',
    visualCallBatchId: row.visual_call_batch_id || '',
    candidateIndex: Number(row.candidate_index || 0),
    rawVisualNameCn: row.raw_visual_name_cn || '',
    rawVisualNameEn: row.raw_visual_name_en || '',
    closestSymptomKeyHint: row.closest_symptom_key_hint || '',
    reason: row.reason || '',
    previewImageRef,
    hasReplayImage,
    imageState,
    reviewStatus: reviewAction || 'pending',
    reviewAction: reviewAction || '',
    reviewedByOpenid: row.reviewed_by_openid || '',
    reviewedAt: row.reviewed_at || '',
    createdAt: row.created_at || '',
    reviewSourceType: row.review_source_type || '',
    batchSource: row.batch_source || '',
    batchSampleLabel: row.batch_sample_label || '',
    batchSampleFileName: row.batch_sample_file_name || '',
    batchSampleAbsolutePath: row.batch_sample_absolute_path || '',
    batchAnswerPathSignature: row.batch_answer_path_signature || '',
    batchGeneratedAt: row.batch_generated_at || ''
  }
}

function safeParseJson(value, fallback) {
  if (!value) {return fallback}
  if (typeof value === 'object') {return value}
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

module.exports = {
  ALLOWED_REVIEW_ACTIONS,
  SESSION_ID_COLLATION,
  normalizeReviewStatus,
  normalizePageNumber,
  normalizePageSize,
  normalizeKeyword,
  buildOutOfPoolReviewId,
  mapOutOfPoolCandidateRow,
  safeParseJson
}
