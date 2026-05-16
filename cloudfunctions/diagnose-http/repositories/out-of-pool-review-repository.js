'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')
const {
  ALLOWED_REVIEW_ACTIONS,
  SESSION_ID_COLLATION,
  normalizeReviewStatus,
  normalizePageNumber,
  normalizePageSize,
  normalizeKeyword,
  buildOutOfPoolReviewId,
  mapOutOfPoolCandidateRow
} = require('./out-of-pool-review-helpers')
const {
  listOutOfPoolCandidateGroups,
  upsertOutOfPoolCandidateGroupReview
} = require('./out-of-pool-candidate-group-repository')

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

async function getOutOfPoolCandidate({ visualNormalizedImageResultId = '', candidateIndex = 0 } = {}) {
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

async function getOutOfPoolCandidateImage({ visualNormalizedImageResultId = '', candidateIndex = 0 } = {}) {
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
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw.raw_structured_output, '$.out_of_pool_replay_image_ref')), '') AS replay_image_ref
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

async function upsertOutOfPoolCandidateReview({ candidate = null, reviewAction = '', reviewedByOpenid = '' } = {}) {
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
  listOutOfPoolCandidates: params => listOutOfPoolCandidateGroups(params, listOutOfPoolCandidates),
  getOutOfPoolCandidate,
  getOutOfPoolCandidateImage,
  upsertOutOfPoolCandidateReview,
  upsertOutOfPoolCandidateGroupReview
}
