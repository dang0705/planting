'use strict'

const crypto = require('crypto')
const { distance: levenshteinDistance } = require('fastest-levenshtein')
const { models } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')

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

function buildOutOfPoolCandidateQuery({ status = 'all', keyword = '' } = {}) {
  const safeStatus = normalizeReviewStatus(status)
  const safeKeyword = normalizeKeyword(keyword)
  const conditions = []
  const params = {}

  if (safeStatus === 'pending') {
    conditions.push('reviews.review_action <=> NULL')
  } else if (safeStatus === 'approved' || safeStatus === 'ignored') {
    conditions.push('reviews.review_action = {{reviewAction}}')
    params.reviewAction = safeStatus
  }

  if (safeKeyword) {
    conditions.push(`(
      normalized.session_id LIKE {{keywordLike}}
      OR normalized.visual_call_batch_id LIKE {{keywordLike}}
      OR jt.raw_visual_name_cn LIKE {{keywordLike}}
      OR jt.raw_visual_name_en LIKE {{keywordLike}}
      OR jt.closest_symptom_key_hint LIKE {{keywordLike}}
      OR jt.reason LIKE {{keywordLike}}
      OR batch.sample_label LIKE {{keywordLike}}
      OR batch.sample_file_name LIKE {{keywordLike}}
      OR batch.sample_absolute_path LIKE {{keywordLike}}
      OR batch.answer_path_signature LIKE {{keywordLike}}
      OR batch.batch_source LIKE {{keywordLike}}
    )`)
    params.keywordLike = `%${safeKeyword}%`
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    safeStatus,
    safeKeyword
  }
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

function resolveReplayPreviewImage(row = {}) {
  const replayImageRef = String(row.replay_image_ref || '').trim()
  if (replayImageRef) {
    return {
      previewImageRef: replayImageRef,
      imageSource: 'out_of_pool_replay_image_ref',
      hasReplayImage: 1
    }
  }

  const previewImageRef = String(row.preview_image_ref || '').trim()
  if (previewImageRef) {
    return {
      previewImageRef,
      imageSource: 'image_ref',
      hasReplayImage: 1
    }
  }

  return {
    previewImageRef: '',
    imageSource: '',
    hasReplayImage: 0
  }
}

function isDataImageUrl(value = '') {
  return /^data:image\//i.test(String(value || '').trim())
}

async function fetchImageAsDataUrl(imageUrl = '') {
  const normalized = String(imageUrl || '').trim()
  if (!normalized) {return ''}
  if (isDataImageUrl(normalized)) {return normalized}

  const response = await fetch(normalized)
  if (!response.ok) {
    throw new Error(`image_fetch_failed:${response.status}`)
  }

  const contentType = String(response.headers.get('content-type') || 'image/jpeg').trim()
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    return ''
  }

  return `data:${contentType};base64,${buffer.toString('base64')}`
}

async function persistReplayPreviewImage(visualRawImageRecordId = '', replayImageRef = '') {
  const safeRecordId = String(visualRawImageRecordId || '').trim()
  const safeReplayImageRef = String(replayImageRef || '').trim()
  if (!safeRecordId || !safeReplayImageRef) {return}

  await models.$runSQL(
    `
      UPDATE ${table('visual_raw_image_records')}
      SET raw_structured_output = JSON_SET(
        COALESCE(raw_structured_output, JSON_OBJECT()),
        '$.out_of_pool_replay_image_ref',
        {{replayImageRef}},
        '$.out_of_pool_replay_image_available',
        1
      )
      WHERE visual_raw_image_record_id = {{visualRawImageRecordId}}
      LIMIT 1
    `,
    {
      visualRawImageRecordId: safeRecordId,
      replayImageRef: safeReplayImageRef
    }
  )
}

async function countOutOfPoolCandidates(filters = {}) {
  const { whereClause, params } = buildOutOfPoolCandidateQuery(filters)

  const result = await models.$runSQL(
    `
      SELECT COUNT(*) AS total
      FROM ${table('visual_normalized_image_results')} AS normalized
      JOIN ${table('visual_raw_image_records')} AS raw
        ON raw.visual_raw_image_record_id = normalized.visual_raw_image_record_id
      JOIN JSON_TABLE(
        normalized.pattern_candidates_json,
        '$.out_of_pool_symptom_candidates[*]'
        COLUMNS (
          candidate_index FOR ORDINALITY,
          raw_visual_name_cn VARCHAR(255) PATH '$.raw_visual_name_cn',
          raw_visual_name_en VARCHAR(255) PATH '$.raw_visual_name_en',
          closest_symptom_key_hint VARCHAR(128) PATH '$.closest_symptom_key_hint',
          reason VARCHAR(255) PATH '$.reason'
        )
      ) AS jt
      LEFT JOIN ${table('visual_out_of_pool_candidate_reviews')} AS reviews
        ON reviews.visual_normalized_image_result_id = normalized.visual_normalized_image_result_id
       AND reviews.candidate_index = jt.candidate_index
      LEFT JOIN ${table('diagnosis_batch_reviews')} AS batch
        ON batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = normalized.session_id COLLATE ${SESSION_ID_COLLATION}
      ${whereClause}
    `,
    params
  )

  return Number(result?.data?.executeResultList?.[0]?.total || 0)
}

async function summarizeOutOfPoolCandidates() {
  const result = await models.$runSQL(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN reviews.review_action = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN reviews.review_action = 'ignored' THEN 1 ELSE 0 END) AS ignored_count,
        SUM(CASE WHEN reviews.review_action <=> NULL THEN 1 ELSE 0 END) AS pending_count
      FROM ${table('visual_normalized_image_results')} AS normalized
      JOIN JSON_TABLE(
        normalized.pattern_candidates_json,
        '$.out_of_pool_symptom_candidates[*]'
        COLUMNS (
          candidate_index FOR ORDINALITY
        )
      ) AS jt
      LEFT JOIN ${table('visual_out_of_pool_candidate_reviews')} AS reviews
        ON reviews.visual_normalized_image_result_id = normalized.visual_normalized_image_result_id
       AND reviews.candidate_index = jt.candidate_index
    `,
    {}
  )

  const row = result?.data?.executeResultList?.[0] || {}
  return {
    total: Number(row.total || 0),
    approvedCount: Number(row.approved_count || 0),
    ignoredCount: Number(row.ignored_count || 0),
    pendingCount: Number(row.pending_count || 0)
  }
}

async function listOutOfPoolCandidates({ page = 1, pageSize = 20, status = 'all', keyword = '' } = {}) {
  const safePage = normalizePageNumber(page)
  const safePageSize = normalizePageSize(pageSize)
  const offset = (safePage - 1) * safePageSize
  const { whereClause, params } = buildOutOfPoolCandidateQuery({ status, keyword })

  const result = await models.$runSQL(
    `
      SELECT
        normalized.visual_normalized_image_result_id,
        normalized.visual_raw_image_record_id,
        normalized.session_id,
        normalized.visual_call_batch_id,
        normalized.created_at,
        jt.candidate_index,
        jt.raw_visual_name_cn,
        jt.raw_visual_name_en,
        jt.closest_symptom_key_hint,
        jt.reason,
        COALESCE(NULLIF(raw.image_ref, '[inline_data_url]'), '') AS preview_image_ref,
        CASE
          WHEN JSON_CONTAINS_PATH(raw.raw_structured_output, 'one', '$.out_of_pool_replay_image_ref') THEN 1
          ELSE 0
        END AS has_replay_image,
        CASE
          WHEN batch.diagnosis_id <=> NULL THEN ''
          ELSE 'batch'
        END AS review_source_type,
        batch.batch_source,
        batch.sample_label AS batch_sample_label,
        batch.sample_file_name AS batch_sample_file_name,
        batch.sample_absolute_path AS batch_sample_absolute_path,
        batch.answer_path_signature AS batch_answer_path_signature,
        batch.batch_generated_at AS batch_generated_at,
        reviews.review_action,
        reviews.reviewed_by_openid,
        reviews.reviewed_at
      FROM ${table('visual_normalized_image_results')} AS normalized
      JOIN ${table('visual_raw_image_records')} AS raw
        ON raw.visual_raw_image_record_id = normalized.visual_raw_image_record_id
      JOIN JSON_TABLE(
        normalized.pattern_candidates_json,
        '$.out_of_pool_symptom_candidates[*]'
        COLUMNS (
          candidate_index FOR ORDINALITY,
          raw_visual_name_cn VARCHAR(255) PATH '$.raw_visual_name_cn',
          raw_visual_name_en VARCHAR(255) PATH '$.raw_visual_name_en',
          closest_symptom_key_hint VARCHAR(128) PATH '$.closest_symptom_key_hint',
          reason VARCHAR(255) PATH '$.reason'
        )
      ) AS jt
      LEFT JOIN ${table('visual_out_of_pool_candidate_reviews')} AS reviews
        ON reviews.visual_normalized_image_result_id = normalized.visual_normalized_image_result_id
       AND reviews.candidate_index = jt.candidate_index
      LEFT JOIN ${table('diagnosis_batch_reviews')} AS batch
        ON batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = normalized.session_id COLLATE ${SESSION_ID_COLLATION}
      ${whereClause}
      ORDER BY
        CASE
          WHEN JSON_CONTAINS_PATH(raw.raw_structured_output, 'one', '$.out_of_pool_replay_image_ref') THEN 2
          WHEN COALESCE(NULLIF(raw.image_ref, '[inline_data_url]'), '') <> '' THEN 1
          ELSE 0
        END DESC,
        normalized.created_at DESC,
        normalized.visual_normalized_image_result_id DESC,
        jt.candidate_index ASC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
    {
      ...params,
      limit: safePageSize,
      offset
    }
  )

  const items = (result?.data?.executeResultList || []).map(mapOutOfPoolCandidateRow)
  const total = await countOutOfPoolCandidates({ status, keyword })
  const summary = await summarizeOutOfPoolCandidates()

  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore: safePage * safePageSize < total,
    summary
  }
}

async function getOutOfPoolCandidate({
  visualNormalizedImageResultId = '',
  candidateIndex = 0
} = {}) {
  const resultId = String(visualNormalizedImageResultId || '').trim()
  const safeCandidateIndex = Number(candidateIndex || 0)
  if (!resultId || !Number.isFinite(safeCandidateIndex) || safeCandidateIndex < 1) {
    return null
  }

  const result = await models.$runSQL(
    `
      SELECT
        normalized.visual_normalized_image_result_id,
        normalized.visual_raw_image_record_id,
        normalized.session_id,
        normalized.visual_call_batch_id,
        jt.candidate_index,
        jt.raw_visual_name_cn,
        jt.raw_visual_name_en,
        jt.closest_symptom_key_hint,
        jt.reason
      FROM ${table('visual_normalized_image_results')} AS normalized
      JOIN JSON_TABLE(
        normalized.pattern_candidates_json,
        '$.out_of_pool_symptom_candidates[*]'
        COLUMNS (
          candidate_index FOR ORDINALITY,
          raw_visual_name_cn VARCHAR(255) PATH '$.raw_visual_name_cn',
          raw_visual_name_en VARCHAR(255) PATH '$.raw_visual_name_en',
          closest_symptom_key_hint VARCHAR(128) PATH '$.closest_symptom_key_hint',
          reason VARCHAR(255) PATH '$.reason'
        )
      ) AS jt
      WHERE normalized.visual_normalized_image_result_id = {{visualNormalizedImageResultId}}
        AND jt.candidate_index = {{candidateIndex}}
      LIMIT 1
    `,
    {
      visualNormalizedImageResultId: resultId,
      candidateIndex: safeCandidateIndex
    }
  )

  const row = result?.data?.executeResultList?.[0] || null
  if (!row) {
    return null
  }

  return {
    visualOutOfPoolReviewId: buildOutOfPoolReviewId(resultId, safeCandidateIndex),
    visualNormalizedImageResultId: row.visual_normalized_image_result_id || resultId,
    visualRawImageRecordId: row.visual_raw_image_record_id || '',
    sessionId: row.session_id || '',
    visualCallBatchId: row.visual_call_batch_id || '',
    candidateIndex: Number(row.candidate_index || safeCandidateIndex),
    rawVisualNameCn: row.raw_visual_name_cn || '',
    rawVisualNameEn: row.raw_visual_name_en || '',
    closestSymptomKeyHint: row.closest_symptom_key_hint || '',
    reason: row.reason || ''
  }
}

async function getOutOfPoolCandidateImage({
  visualNormalizedImageResultId = '',
  candidateIndex = 0
} = {}) {
  const resultId = String(visualNormalizedImageResultId || '').trim()
  const safeCandidateIndex = Number(candidateIndex || 0)
  if (!resultId || !Number.isFinite(safeCandidateIndex) || safeCandidateIndex < 1) {
    return null
  }

  const result = await models.$runSQL(
    `
      SELECT
        normalized.visual_normalized_image_result_id,
        normalized.visual_raw_image_record_id,
        jt.candidate_index,
        COALESCE(NULLIF(raw.image_ref, '[inline_data_url]'), '') AS preview_image_ref,
        COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(raw.raw_structured_output, '$.out_of_pool_replay_image_ref')),
          ''
        ) AS replay_image_ref
      FROM ${table('visual_normalized_image_results')} AS normalized
      JOIN ${table('visual_raw_image_records')} AS raw
        ON raw.visual_raw_image_record_id = normalized.visual_raw_image_record_id
      JOIN JSON_TABLE(
        normalized.pattern_candidates_json,
        '$.out_of_pool_symptom_candidates[*]'
        COLUMNS (
          candidate_index FOR ORDINALITY
        )
      ) AS jt
      WHERE normalized.visual_normalized_image_result_id = {{visualNormalizedImageResultId}}
        AND jt.candidate_index = {{candidateIndex}}
      LIMIT 1
    `,
    {
      visualNormalizedImageResultId: resultId,
      candidateIndex: safeCandidateIndex
    }
  )

  const row = result?.data?.executeResultList?.[0] || null
  if (!row) {
    return null
  }

  let replayImage = resolveReplayPreviewImage(row)
  if (!replayImage.previewImageRef && row.preview_image_ref) {
    try {
      const dataImageRef = await fetchImageAsDataUrl(row.preview_image_ref)
      if (dataImageRef) {
        await persistReplayPreviewImage(row.visual_raw_image_record_id, dataImageRef)
        replayImage = {
          previewImageRef: dataImageRef,
          imageSource: 'rehydrated_from_image_ref',
          hasReplayImage: 1
        }
      }
    } catch (error) {
      console.warn(
        'diagnose-http out-of-pool replay rehydrate failed:',
        String(error?.message || error || '')
      )
      replayImage = {
        previewImageRef: String(row.preview_image_ref || '').trim(),
        imageSource: 'image_ref',
        hasReplayImage: 1
      }
    }
  }

  return {
    visualNormalizedImageResultId: row.visual_normalized_image_result_id || resultId,
    visualRawImageRecordId: row.visual_raw_image_record_id || '',
    candidateIndex: Number(row.candidate_index || safeCandidateIndex),
    ...replayImage
  }
}

async function upsertOutOfPoolCandidateReview({
  candidate = null,
  reviewAction = '',
  reviewedByOpenid = ''
} = {}) {
  const safeAction = String(reviewAction || '').trim().toLowerCase()
  if (!candidate || !ALLOWED_REVIEW_ACTIONS.has(safeAction)) {
    throw new Error('invalid_out_of_pool_review_action')
  }

  await models.$runSQL(
    `
      INSERT INTO ${table('visual_out_of_pool_candidate_reviews')} (
        visual_out_of_pool_review_id,
        session_id,
        visual_call_batch_id,
        visual_raw_image_record_id,
        visual_normalized_image_result_id,
        candidate_index,
        raw_visual_name_cn,
        raw_visual_name_en,
        closest_symptom_key_hint,
        reason,
        review_action,
        reviewed_by_openid,
        reviewed_at,
        created_at,
        updated_at
      ) VALUES (
        {{visualOutOfPoolReviewId}},
        {{sessionId}},
        {{visualCallBatchId}},
        {{visualRawImageRecordId}},
        {{visualNormalizedImageResultId}},
        {{candidateIndex}},
        {{rawVisualNameCn}},
        {{rawVisualNameEn}},
        {{closestSymptomKeyHint}},
        {{reason}},
        {{reviewAction}},
        {{reviewedByOpenid}},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON DUPLICATE KEY UPDATE
        raw_visual_name_cn = VALUES(raw_visual_name_cn),
        raw_visual_name_en = VALUES(raw_visual_name_en),
        closest_symptom_key_hint = VALUES(closest_symptom_key_hint),
        reason = VALUES(reason),
        review_action = VALUES(review_action),
        reviewed_by_openid = VALUES(reviewed_by_openid),
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      visualOutOfPoolReviewId: candidate.visualOutOfPoolReviewId,
      sessionId: candidate.sessionId,
      visualCallBatchId: candidate.visualCallBatchId,
      visualRawImageRecordId: candidate.visualRawImageRecordId,
      visualNormalizedImageResultId: candidate.visualNormalizedImageResultId,
      candidateIndex: candidate.candidateIndex,
      rawVisualNameCn: candidate.rawVisualNameCn,
      rawVisualNameEn: candidate.rawVisualNameEn,
      closestSymptomKeyHint: candidate.closestSymptomKeyHint,
      reason: candidate.reason,
      reviewAction: safeAction,
      reviewedByOpenid: String(reviewedByOpenid || '').trim()
    }
  )
}

module.exports = {
  listOutOfPoolCandidates,
  getOutOfPoolCandidate,
  getOutOfPoolCandidateImage,
  upsertOutOfPoolCandidateReview
}

const OUT_OF_POOL_GROUP_AUTO_MATCH_SCORE = 0.88
const OUT_OF_POOL_GROUP_POSSIBLE_MATCH_SCORE = 0.72
const OUT_OF_POOL_GROUP_SCAN_LIMIT = 5000
const OUT_OF_POOL_GROUP_ALIAS_LIMIT = 24

let outOfPoolCandidateGroupTableEnsured = false
let outOfPoolProxyMappingSourceGroupColumnEnsured = false

function normalizeOpenText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
    .slice(0, 512)
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

function uniqueNonEmpty(values = []) {
  return Array.from(
    new Set(
      values
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function collectCandidateAliasTexts(candidate = {}) {
  return uniqueNonEmpty([
    candidate.rawVisualNameCn,
    candidate.rawVisualNameEn,
    candidate.reason
  ]).slice(0, OUT_OF_POOL_GROUP_ALIAS_LIMIT)
}

function buildCandidateCanonicalText(candidate = {}) {
  return String(
    candidate.rawVisualNameCn ||
    candidate.rawVisualNameEn ||
    candidate.reason ||
    'unnamed out-of-pool candidate'
  ).trim()
}

function buildCandidateNormalizedParts(candidate = {}) {
  const aliases = collectCandidateAliasTexts(candidate)
  const canonicalText = buildCandidateCanonicalText(candidate)
  const primaryText = normalizeOpenText(canonicalText)
  const compositeText = normalizeOpenText(aliases.join(' '))
  const aliasTexts = uniqueNonEmpty([
    primaryText,
    compositeText,
    ...aliases.map(normalizeOpenText)
  ])

  return {
    aliases,
    canonicalText,
    primaryText,
    compositeText,
    aliasTexts
  }
}

function buildCandidateFingerprint(candidate = {}) {
  const parts = buildCandidateNormalizedParts(candidate)
  const basis = parts.primaryText || parts.compositeText || [
    candidate.visualNormalizedImageResultId,
    candidate.candidateIndex
  ].join(':')

  return crypto.createHash('sha1').update(basis).digest('hex')
}

function buildOutOfPoolGroupId(fingerprint = '') {
  return `voopg_${String(fingerprint || '').slice(0, 24)}`
}

function buildNgrams(text = '', size = 2) {
  const source = Array.from(String(text || ''))
  if (!source.length) {return []}
  if (source.length <= size) {return [source.join('')]}

  const grams = []
  for (let index = 0; index <= source.length - size; index += 1) {
    grams.push(source.slice(index, index + size).join(''))
  }
  return grams
}

function calculateJaccardSimilarity(leftValues = [], rightValues = []) {
  const left = new Set(leftValues.filter(Boolean))
  const right = new Set(rightValues.filter(Boolean))
  if (!left.size || !right.size) {return 0}

  let intersection = 0
  left.forEach(value => {
    if (right.has(value)) {intersection += 1}
  })

  return intersection / (left.size + right.size - intersection)
}

function calculateEditSimilarity(left = '', right = '') {
  const a = Array.from(String(left || '')).slice(0, 80).join('')
  const b = Array.from(String(right || '')).slice(0, 80).join('')
  if (!a || !b) {return 0}
  if (a === b) {return 1}

  return 1 - levenshteinDistance(a, b) / Math.max(Array.from(a).length, Array.from(b).length)
}

function calculateOpenTextSimilarity(left = '', right = '') {
  const leftText = String(left || '')
  const rightText = String(right || '')
  if (!leftText || !rightText) {return 0}
  if (leftText === rightText) {return 1}

  const minLength = Math.min(Array.from(leftText).length, Array.from(rightText).length)
  const maxLength = Math.max(Array.from(leftText).length, Array.from(rightText).length)
  const containmentScore =
    minLength >= 3 && (leftText.includes(rightText) || rightText.includes(leftText))
      ? Math.max(0.9, minLength / maxLength)
      : 0
  const bigramScore = calculateJaccardSimilarity(buildNgrams(leftText, 2), buildNgrams(rightText, 2))
  const trigramScore = calculateJaccardSimilarity(buildNgrams(leftText, 3), buildNgrams(rightText, 3))
  const editScore = calculateEditSimilarity(leftText, rightText)

  return Math.max(containmentScore, bigramScore, trigramScore, editScore)
}

function calculateCandidateGroupSimilarity(candidateParts = {}, group = {}) {
  const groupAliases = uniqueNonEmpty([
    group.normalizedText,
    normalizeOpenText(group.canonicalText),
    ...group.aliasTexts.map(normalizeOpenText)
  ])
  if (!candidateParts.aliasTexts.length || !groupAliases.length) {return 0}

  let bestScore = 0
  candidateParts.aliasTexts.forEach(candidateText => {
    groupAliases.forEach(groupText => {
      bestScore = Math.max(bestScore, calculateOpenTextSimilarity(candidateText, groupText))
    })
  })
  return bestScore
}

function normalizeGroupRow(row = {}) {
  const aliasTexts = safeParseJson(row.alias_texts_json, [])
  return {
    groupId: row.group_id || '',
    canonicalFingerprint: row.canonical_fingerprint || '',
    canonicalText: row.canonical_text || '',
    normalizedText: row.normalized_text || '',
    aliasTexts: Array.isArray(aliasTexts) ? aliasTexts : [],
    reviewAction: String(row.review_action || '').trim().toLowerCase(),
    reviewedByOpenid: row.reviewed_by_openid || '',
    reviewedAt: row.reviewed_at || '',
    possibleDuplicateGroupId: row.possible_duplicate_group_id || '',
    possibleDuplicateScore: Number(row.possible_duplicate_score || 0),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  }
}

async function ensureOutOfPoolCandidateGroupTable() {
  if (outOfPoolCandidateGroupTableEnsured) {return true}

  try {
    await models.$runSQL(
      `
        SELECT group_id
        FROM ${table('visual_out_of_pool_candidate_groups')}
        LIMIT 1
      `,
      {}
    )
    outOfPoolCandidateGroupTableEnsured = true
    return true
  } catch (error) {
    console.warn(
      'diagnose-http out-of-pool group table unavailable:',
      String(error?.message || error || '')
    )
    return false
  }
}

async function _fetchOutOfPoolCandidateRowsForGrouping({ keyword = '' } = {}) {
  const { whereClause, params } = buildOutOfPoolCandidateQuery({ status: 'all', keyword })

  const result = await models.$runSQL(
    `
      SELECT
        normalized.visual_normalized_image_result_id,
        normalized.visual_raw_image_record_id,
        normalized.session_id,
        normalized.visual_call_batch_id,
        normalized.created_at,
        jt.candidate_index,
        jt.raw_visual_name_cn,
        jt.raw_visual_name_en,
        jt.closest_symptom_key_hint,
        jt.reason,
        COALESCE(NULLIF(raw.image_ref, '[inline_data_url]'), '') AS preview_image_ref,
        CASE
          WHEN JSON_CONTAINS_PATH(raw.raw_structured_output, 'one', '$.out_of_pool_replay_image_ref') THEN 1
          ELSE 0
        END AS has_replay_image,
        CASE
          WHEN batch.diagnosis_id <=> NULL THEN ''
          ELSE 'batch'
        END AS review_source_type,
        batch.batch_source,
        batch.sample_label AS batch_sample_label,
        batch.sample_file_name AS batch_sample_file_name,
        batch.sample_absolute_path AS batch_sample_absolute_path,
        batch.answer_path_signature AS batch_answer_path_signature,
        batch.batch_generated_at AS batch_generated_at,
        reviews.review_action,
        reviews.reviewed_by_openid,
        reviews.reviewed_at
      FROM ${table('visual_normalized_image_results')} AS normalized
      JOIN ${table('visual_raw_image_records')} AS raw
        ON raw.visual_raw_image_record_id = normalized.visual_raw_image_record_id
      JOIN JSON_TABLE(
        normalized.pattern_candidates_json,
        '$.out_of_pool_symptom_candidates[*]'
        COLUMNS (
          candidate_index FOR ORDINALITY,
          raw_visual_name_cn VARCHAR(255) PATH '$.raw_visual_name_cn',
          raw_visual_name_en VARCHAR(255) PATH '$.raw_visual_name_en',
          closest_symptom_key_hint VARCHAR(128) PATH '$.closest_symptom_key_hint',
          reason VARCHAR(255) PATH '$.reason'
        )
      ) AS jt
      LEFT JOIN ${table('visual_out_of_pool_candidate_reviews')} AS reviews
        ON reviews.visual_normalized_image_result_id = normalized.visual_normalized_image_result_id
       AND reviews.candidate_index = jt.candidate_index
      LEFT JOIN ${table('diagnosis_batch_reviews')} AS batch
        ON batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = normalized.session_id COLLATE ${SESSION_ID_COLLATION}
      ${whereClause}
      ORDER BY
        CASE
          WHEN JSON_CONTAINS_PATH(raw.raw_structured_output, 'one', '$.out_of_pool_replay_image_ref') THEN 2
          WHEN COALESCE(NULLIF(raw.image_ref, '[inline_data_url]'), '') <> '' THEN 1
          ELSE 0
        END DESC,
        normalized.created_at DESC,
        normalized.visual_normalized_image_result_id DESC,
        jt.candidate_index ASC
      LIMIT {{limit}}
    `,
    {
      ...params,
      limit: OUT_OF_POOL_GROUP_SCAN_LIMIT
    }
  )

  return (result?.data?.executeResultList || []).map(mapOutOfPoolCandidateRow)
}

async function _fetchOutOfPoolCandidateGroups() {
  const result = await models.$runSQL(
    `
      SELECT
        group_id,
        canonical_fingerprint,
        canonical_text,
        normalized_text,
        alias_texts_json,
        review_action,
        reviewed_by_openid,
        reviewed_at,
        possible_duplicate_group_id,
        possible_duplicate_score,
        created_at,
        updated_at
      FROM ${table('visual_out_of_pool_candidate_groups')}
      ORDER BY updated_at DESC
      LIMIT {{limit}}
    `,
    {
      limit: OUT_OF_POOL_GROUP_SCAN_LIMIT
    }
  )

  return (result?.data?.executeResultList || []).map(normalizeGroupRow)
}

async function ensureOutOfPoolProxyMappingSourceGroupColumn() {
  if (outOfPoolProxyMappingSourceGroupColumnEnsured) {return true}

  try {
    await models.$runSQL(
      `
        SELECT source_group_id
        FROM ${table('visual_out_of_pool_proxy_mappings')}
        LIMIT 1
      `,
      {}
    )
  } catch (error) {
    const message = String(error?.message || error || '')
    console.warn('diagnose-http out-of-pool proxy source group unavailable:', message)
    return false
  }

  outOfPoolProxyMappingSourceGroupColumnEnsured = true
  return true
}

async function _fetchProxyMappingStatusByGroupIds(groupIds = []) {
  const safeGroupIds = uniqueNonEmpty(groupIds).slice(0, OUT_OF_POOL_GROUP_SCAN_LIMIT)
  if (!safeGroupIds.length) {return {}}

  const ensured = await ensureOutOfPoolProxyMappingSourceGroupColumn()
  if (!ensured) {return {}}

  const params = {}
  const placeholders = safeGroupIds.map((groupId, index) => {
    const key = `groupId${index}`
    params[key] = groupId
    return `{{${key}}}`
  })

  try {
    const result = await models.$runSQL(
      `
        SELECT
          source_group_id,
          mapping_id,
          target_symptom_key,
          review_status,
          enabled,
          priority,
          updated_at
        FROM ${table('visual_out_of_pool_proxy_mappings')}
        WHERE source_group_id IN (${placeholders.join(', ')})
        ORDER BY
          enabled DESC,
          CASE WHEN review_status = 'audited' THEN 3 WHEN review_status = 'pending' THEN 2 ELSE 1 END DESC,
          priority DESC,
          updated_at DESC,
          mapping_id ASC
      `,
      params
    )

    return (result?.data?.executeResultList || []).reduce((acc, row) => {
      const groupId = String(row.source_group_id || '').trim()
      if (!groupId || acc[groupId]) {return acc}
      acc[groupId] = {
        proxyMappingId: row.mapping_id || '',
        proxyTargetSymptomKey: row.target_symptom_key || '',
        proxyMappingStatus: row.review_status || '',
        proxyMappingEnabled: Number(row.enabled || 0) ? 1 : 0,
        proxyMappingPriority: Number(row.priority || 0),
        hasAuditedProxyMapping: row.review_status === 'audited' && Number(row.enabled || 0) ? 1 : 0
      }
      return acc
    }, {})
  } catch (error) {
    console.warn(
      'diagnose-http out-of-pool proxy status lookup failed:',
      String(error?.message || error || '')
    )
    return {}
  }
}

function findBestOutOfPoolGroup(candidateParts = {}, fingerprint = '', groups = []) {
  let bestGroup = null
  let bestScore = 0

  groups.forEach(group => {
    const score = group.canonicalFingerprint === fingerprint
      ? 1
      : calculateCandidateGroupSimilarity(candidateParts, group)

    if (score > bestScore) {
      bestScore = score
      bestGroup = group
    }
  })

  return {
    group: bestGroup,
    score: bestScore
  }
}

async function persistOutOfPoolCandidateGroup({
  group,
  representative
} = {}) {
  if (!group?.groupId || !representative) {return}

  await models.$runSQL(
    `
      INSERT INTO ${table('visual_out_of_pool_candidate_groups')} (
        group_id,
        canonical_fingerprint,
        canonical_text,
        normalized_text,
        alias_texts_json,
        representative_visual_normalized_image_result_id,
        representative_candidate_index,
        review_action,
        reviewed_by_openid,
        reviewed_at,
        possible_duplicate_group_id,
        possible_duplicate_score,
        last_seen_at,
        created_at,
        updated_at
      ) VALUES (
        {{groupId}},
        {{canonicalFingerprint}},
        {{canonicalText}},
        {{normalizedText}},
        CAST({{aliasTextsJson}} AS JSON),
        {{visualNormalizedImageResultId}},
        {{candidateIndex}},
        {{reviewAction}},
        {{reviewedByOpenid}},
        NULLIF({{reviewedAt}}, ''),
        {{possibleDuplicateGroupId}},
        {{possibleDuplicateScore}},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON DUPLICATE KEY UPDATE
        canonical_text = VALUES(canonical_text),
        normalized_text = VALUES(normalized_text),
        alias_texts_json = VALUES(alias_texts_json),
        representative_visual_normalized_image_result_id = VALUES(representative_visual_normalized_image_result_id),
        representative_candidate_index = VALUES(representative_candidate_index),
        review_action = CASE
          WHEN review_action <> '' THEN review_action
          ELSE VALUES(review_action)
        END,
        reviewed_by_openid = CASE
          WHEN review_action <> '' THEN reviewed_by_openid
          ELSE VALUES(reviewed_by_openid)
        END,
        reviewed_at = CASE
          WHEN review_action <> '' THEN reviewed_at
          ELSE VALUES(reviewed_at)
        END,
        possible_duplicate_group_id = VALUES(possible_duplicate_group_id),
        possible_duplicate_score = VALUES(possible_duplicate_score),
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      groupId: group.groupId,
      canonicalFingerprint: group.canonicalFingerprint,
      canonicalText: group.canonicalText,
      normalizedText: group.normalizedText,
      aliasTextsJson: JSON.stringify(group.aliasTexts || []),
      visualNormalizedImageResultId: representative.visualNormalizedImageResultId,
      candidateIndex: representative.candidateIndex,
      reviewAction: group.reviewAction || '',
      reviewedByOpenid: group.reviewedByOpenid || '',
      reviewedAt: group.reviewedAt || '',
      possibleDuplicateGroupId: group.possibleDuplicateGroupId || '',
      possibleDuplicateScore: Number(group.possibleDuplicateScore || 0)
    }
  )
}

function buildOutOfPoolGroupFromCandidate(candidate = {}, match = {}) {
  const parts = buildCandidateNormalizedParts(candidate)
  const fingerprint = buildCandidateFingerprint(candidate)
  const reviewAction = ALLOWED_REVIEW_ACTIONS.has(candidate.reviewStatus) ? candidate.reviewStatus : ''

  return {
    groupId: buildOutOfPoolGroupId(fingerprint),
    canonicalFingerprint: fingerprint,
    canonicalText: parts.canonicalText,
    normalizedText: parts.primaryText || parts.compositeText,
    aliasTexts: parts.aliases,
    reviewAction,
    reviewedByOpenid: candidate.reviewedByOpenid || '',
    reviewedAt: candidate.reviewedAt || '',
    possibleDuplicateGroupId:
      match.score >= OUT_OF_POOL_GROUP_POSSIBLE_MATCH_SCORE && match.group?.groupId
        ? match.group.groupId
        : '',
    possibleDuplicateScore:
      match.score >= OUT_OF_POOL_GROUP_POSSIBLE_MATCH_SCORE
        ? Number(match.score.toFixed(4))
        : 0
  }
}

function chooseGroupStatus(group = {}, candidates = []) {
  if (ALLOWED_REVIEW_ACTIONS.has(group.reviewAction)) {return group.reviewAction}
  if (candidates.some(candidate => candidate.reviewStatus === 'approved')) {return 'approved'}
  if (candidates.length && candidates.every(candidate => candidate.reviewStatus === 'ignored')) {return 'ignored'}
  return 'pending'
}

async function _buildOutOfPoolCandidateGroups(candidates = [], persistedGroups = []) {
  const groups = [...persistedGroups]
  const groupBuckets = new Map()

  for (const candidate of candidates) {
    const parts = buildCandidateNormalizedParts(candidate)
    const fingerprint = buildCandidateFingerprint(candidate)
    let match = findBestOutOfPoolGroup(parts, fingerprint, groups)

    if (!match.group || match.score < OUT_OF_POOL_GROUP_AUTO_MATCH_SCORE) {
      match = {
        ...match,
        group: buildOutOfPoolGroupFromCandidate(candidate, match)
      }
      groups.unshift(match.group)
    }

    const bucket = groupBuckets.get(match.group.groupId) || {
      group: match.group,
      matchScore: match.score,
      candidates: [],
      aliasTexts: new Set(match.group.aliasTexts || [])
    }

    collectCandidateAliasTexts(candidate).forEach(alias => bucket.aliasTexts.add(alias))
    bucket.candidates.push(candidate)
    bucket.matchScore = Math.max(bucket.matchScore, match.score)
    groupBuckets.set(match.group.groupId, bucket)
  }

  const groupedItems = []
  for (const bucket of groupBuckets.values()) {
    const representative = bucket.candidates[0]
    const reviewStatus = chooseGroupStatus(bucket.group, bucket.candidates)
    const aliasTexts = Array.from(bucket.aliasTexts).slice(0, OUT_OF_POOL_GROUP_ALIAS_LIMIT)
    bucket.group.aliasTexts = aliasTexts
    bucket.group.reviewAction = reviewStatus === 'pending' ? bucket.group.reviewAction || '' : reviewStatus

    groupedItems.push({
      ...representative,
      groupId: bucket.group.groupId,
      groupCanonicalFingerprint: bucket.group.canonicalFingerprint,
      groupCanonicalText: bucket.group.canonicalText,
      groupNormalizedText: bucket.group.normalizedText,
      groupReviewStatus: reviewStatus,
      reviewStatus,
      aliases: aliasTexts,
      occurrenceCount: bucket.candidates.length,
      relatedSessionIds: uniqueNonEmpty(bucket.candidates.map(candidate => candidate.sessionId)).slice(0, 8),
      relatedVisualCallBatchIds: uniqueNonEmpty(bucket.candidates.map(candidate => candidate.visualCallBatchId)).slice(0, 8),
      possibleDuplicateGroupId: bucket.group.possibleDuplicateGroupId || '',
      possibleDuplicateScore: Number(bucket.group.possibleDuplicateScore || 0),
      groupMatchScore: Number(Math.max(bucket.matchScore, 0).toFixed(4))
    })
  }

  return groupedItems
}

async function _persistVisibleOutOfPoolCandidateGroups(items = []) {
  await Promise.all(
    items
      .filter(item => item?.groupId && item?.visualNormalizedImageResultId)
      .map(item => persistOutOfPoolCandidateGroup({
        group: {
          groupId: item.groupId,
          canonicalFingerprint: item.groupCanonicalFingerprint || buildCandidateFingerprint(item),
          canonicalText: item.groupCanonicalText || buildCandidateCanonicalText(item),
          normalizedText: item.groupNormalizedText || normalizeOpenText(item.groupCanonicalText || item.rawVisualNameCn || item.rawVisualNameEn || ''),
          aliasTexts: Array.isArray(item.aliases) ? item.aliases : collectCandidateAliasTexts(item),
          reviewAction: item.reviewStatus === 'pending' ? '' : item.reviewStatus,
          reviewedByOpenid: item.reviewedByOpenid || '',
          reviewedAt: item.reviewedAt || '',
          possibleDuplicateGroupId: item.possibleDuplicateGroupId || '',
          possibleDuplicateScore: Number(item.possibleDuplicateScore || 0)
        },
        representative: item
      }))
  )
}

function _filterOutOfPoolGroupsByStatus(items = [], status = 'all') {
  const safeStatus = normalizeReviewStatus(status)
  if (safeStatus === 'all') {return items}
  return items.filter(item => item.reviewStatus === safeStatus)
}

function _summarizeOutOfPoolCandidateGroups(items = []) {
  return {
    total: items.length,
    approvedCount: items.filter(item => item.reviewStatus === 'approved').length,
    ignoredCount: items.filter(item => item.reviewStatus === 'ignored').length,
    pendingCount: items.filter(item => item.reviewStatus === 'pending').length,
    occurrenceTotal: items.reduce((total, item) => total + Number(item.occurrenceCount || 0), 0)
  }
}

async function listOutOfPoolCandidateGroups(params = {}) {
  const ensured = await ensureOutOfPoolCandidateGroupTable()
  if (!ensured) {
    return module.exports.__legacyListOutOfPoolCandidates(params)
  }

  const safePage = normalizePageNumber(params.page)
  const safePageSize = normalizePageSize(params.pageSize)
  const offset = (safePage - 1) * safePageSize
  const safeStatus = normalizeReviewStatus(params.status)
  const safeKeyword = normalizeKeyword(params.keyword)
  const conditions = []
  const queryParams = {}

  if (safeStatus === 'pending') {
    conditions.push("(oop_groups.review_action = '' OR oop_groups.review_action <=> NULL)")
  } else if (safeStatus === 'approved' || safeStatus === 'ignored') {
    conditions.push('oop_groups.review_action = {{reviewAction}}')
    queryParams.reviewAction = safeStatus
  }

  if (safeKeyword) {
    conditions.push(`(
      oop_groups.group_id LIKE {{keywordLike}}
      OR oop_groups.canonical_text LIKE {{keywordLike}}
      OR oop_groups.normalized_text LIKE {{keywordLike}}
      OR !(JSON_SEARCH(oop_groups.alias_texts_json, 'one', {{keywordLike}}) <=> NULL)
    )`)
    queryParams.keywordLike = `%${safeKeyword}%`
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const [listResult, countResult, summaryResult] = await Promise.all([
    models.$runSQL(
      `
        SELECT
          oop_groups.group_id,
          oop_groups.canonical_fingerprint,
          oop_groups.canonical_text,
          oop_groups.normalized_text,
          CAST(oop_groups.alias_texts_json AS CHAR) AS alias_texts_json,
          oop_groups.review_action AS group_review_action,
          oop_groups.reviewed_by_openid AS group_reviewed_by_openid,
          oop_groups.reviewed_at AS group_reviewed_at,
          oop_groups.possible_duplicate_group_id,
          oop_groups.possible_duplicate_score,
          oop_groups.representative_visual_normalized_image_result_id AS visual_normalized_image_result_id,
          '' AS visual_raw_image_record_id,
          '' AS session_id,
          '' AS visual_call_batch_id,
          oop_groups.created_at,
          oop_groups.representative_candidate_index AS candidate_index,
          oop_groups.canonical_text AS raw_visual_name_cn,
          '' AS raw_visual_name_en,
          '' AS closest_symptom_key_hint,
          oop_groups.canonical_text AS reason,
          '' AS preview_image_ref,
          1 AS has_replay_image,
          '' AS review_source_type,
          '' AS batch_source,
          '' AS batch_sample_label,
          '' AS batch_sample_file_name,
          '' AS batch_sample_absolute_path,
          '' AS batch_answer_path_signature,
          '' AS batch_generated_at,
          proxy.mapping_id AS proxy_mapping_id,
          proxy.target_symptom_key AS proxy_target_symptom_key,
          proxy.review_status AS proxy_mapping_status,
          proxy.enabled AS proxy_mapping_enabled,
          proxy.priority AS proxy_mapping_priority
        FROM ${table('visual_out_of_pool_candidate_groups')} AS oop_groups
        LEFT JOIN (
          SELECT
            source_group_id,
            SUBSTRING_INDEX(GROUP_CONCAT(mapping_id ORDER BY enabled DESC, review_status = 'audited' DESC, priority DESC, updated_at DESC), ',', 1) AS mapping_id,
            SUBSTRING_INDEX(GROUP_CONCAT(target_symptom_key ORDER BY enabled DESC, review_status = 'audited' DESC, priority DESC, updated_at DESC), ',', 1) AS target_symptom_key,
            SUBSTRING_INDEX(GROUP_CONCAT(review_status ORDER BY enabled DESC, review_status = 'audited' DESC, priority DESC, updated_at DESC), ',', 1) AS review_status,
            SUBSTRING_INDEX(GROUP_CONCAT(enabled ORDER BY enabled DESC, review_status = 'audited' DESC, priority DESC, updated_at DESC), ',', 1) AS enabled,
            SUBSTRING_INDEX(GROUP_CONCAT(priority ORDER BY enabled DESC, review_status = 'audited' DESC, priority DESC, updated_at DESC), ',', 1) AS priority
          FROM ${table('visual_out_of_pool_proxy_mappings')}
          WHERE source_group_id <> ''
          GROUP BY source_group_id
        ) AS proxy
          ON proxy.source_group_id COLLATE ${SESSION_ID_COLLATION}
           = oop_groups.group_id COLLATE ${SESSION_ID_COLLATION}
        ${whereClause}
        ORDER BY
          CASE WHEN oop_groups.review_action = '' OR oop_groups.review_action <=> NULL THEN 0 ELSE 1 END ASC,
          oop_groups.last_seen_at DESC,
          oop_groups.updated_at DESC,
          oop_groups.group_id ASC
        LIMIT {{limit}} OFFSET {{offset}}
      `,
      {
        ...queryParams,
        limit: safePageSize,
        offset
      }
    ),
    models.$runSQL(
      `
        SELECT COUNT(*) AS total
        FROM ${table('visual_out_of_pool_candidate_groups')} AS oop_groups
        ${whereClause}
      `,
      queryParams
    ),
    models.$runSQL(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN review_action = 'approved' THEN 1 ELSE 0 END) AS approved_count,
          SUM(CASE WHEN review_action = 'ignored' THEN 1 ELSE 0 END) AS ignored_count,
          SUM(CASE WHEN review_action = '' OR review_action <=> NULL THEN 1 ELSE 0 END) AS pending_count
        FROM ${table('visual_out_of_pool_candidate_groups')}
      `,
      {}
    )
  ])

  const items = (listResult?.data?.executeResultList || []).map(row => {
    const candidate = mapOutOfPoolCandidateRow({
      ...row,
      review_action: row.group_review_action,
      reviewed_by_openid: row.group_reviewed_by_openid,
      reviewed_at: row.group_reviewed_at
    })
    const aliases = safeParseJson(row.alias_texts_json, [])
    const reviewStatus = candidate.reviewStatus || 'pending'

    return {
      ...candidate,
      groupId: row.group_id || '',
      groupCanonicalFingerprint: row.canonical_fingerprint || '',
      groupCanonicalText: row.canonical_text || '',
      groupNormalizedText: row.normalized_text || '',
      groupReviewStatus: reviewStatus,
      reviewStatus,
      aliases: Array.isArray(aliases) ? aliases : [],
      occurrenceCount: 0,
      possibleDuplicateGroupId: row.possible_duplicate_group_id || '',
      possibleDuplicateScore: Number(row.possible_duplicate_score || 0),
      proxyMappingId: row.proxy_mapping_id || '',
      proxyTargetSymptomKey: row.proxy_target_symptom_key || '',
      proxyMappingStatus: row.proxy_mapping_status || '',
      proxyMappingEnabled: Number(row.proxy_mapping_enabled || 0) ? 1 : 0,
      proxyMappingPriority: Number(row.proxy_mapping_priority || 0),
      hasAuditedProxyMapping: row.proxy_mapping_status === 'audited' && Number(row.proxy_mapping_enabled || 0) ? 1 : 0
    }
  })

  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  const summaryRow = summaryResult?.data?.executeResultList?.[0] || {}
  const summary = {
    total: Number(summaryRow.total || 0),
    approvedCount: Number(summaryRow.approved_count || 0),
    ignoredCount: Number(summaryRow.ignored_count || 0),
    pendingCount: Number(summaryRow.pending_count || 0),
    occurrenceTotal: 0
  }

  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore: safePage * safePageSize < total,
    summary
  }
}

async function upsertOutOfPoolCandidateGroupReview({
  groupId = '',
  reviewAction = '',
  reviewedByOpenid = ''
} = {}) {
  const safeGroupId = String(groupId || '').trim()
  const safeAction = String(reviewAction || '').trim().toLowerCase()
  if (!safeGroupId || !ALLOWED_REVIEW_ACTIONS.has(safeAction)) {
    throw new Error('invalid_out_of_pool_group_review_action')
  }

  const ensured = await ensureOutOfPoolCandidateGroupTable()
  if (!ensured) {
    throw new Error('out_of_pool_group_table_unavailable')
  }

  await models.$runSQL(
    `
      UPDATE ${table('visual_out_of_pool_candidate_groups')}
      SET
        review_action = {{reviewAction}},
        reviewed_by_openid = {{reviewedByOpenid}},
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE group_id = {{groupId}}
      LIMIT 1
    `,
    {
      groupId: safeGroupId,
      reviewAction: safeAction,
      reviewedByOpenid: String(reviewedByOpenid || '').trim()
    }
  )

  return {
    groupId: safeGroupId,
    reviewAction: safeAction
  }
}

module.exports.__legacyListOutOfPoolCandidates = module.exports.listOutOfPoolCandidates
module.exports.listOutOfPoolCandidates = listOutOfPoolCandidateGroups
module.exports.upsertOutOfPoolCandidateGroupReview = upsertOutOfPoolCandidateGroupReview
