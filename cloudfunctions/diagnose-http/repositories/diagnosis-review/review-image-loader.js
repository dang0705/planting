'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const {
  LIKELY_MINI_PROGRAM_OPENID_PATTERN,
  SESSION_ID_COLLATION
} = require('./normalizers')
const { buildSafeJsonText } = require('./sql-builders')
const {
  parseCloudStorageUrlToFileId,
  isFreshCloudStorageSignedUrl,
  refreshCloudStorageImageUrl
} = require('./image-url-helpers')

async function listDiagnosisReviewImageRows(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        visual_raw_image_record_id,
        input_slot_type,
        input_slot_order,
        input_slot_label,
        COALESCE(NULLIF(image_ref, '[inline_data_url]'), '') AS preview_image_ref,
        COALESCE(
          ${buildSafeJsonText('raw_structured_output', '$.diagnosis_review_replay_image_ref', '')},
          ${buildSafeJsonText('raw_structured_output', '$.out_of_pool_replay_image_ref', '')},
          ''
        ) AS replay_image_ref
      FROM ${table('visual_raw_image_records')}
      WHERE session_id COLLATE ${SESSION_ID_COLLATION} = CONVERT({{diagnosisSessionId}} USING utf8mb4) COLLATE ${SESSION_ID_COLLATION}
      ORDER BY input_slot_order ASC, created_at ASC
      LIMIT 5
    `,
    {
      diagnosisSessionId: safeSessionId,
      likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
    }
  )

  return result?.data?.executeResultList || []
}

function isDataImageUrl(value = '') {
  return /^data:image\//i.test(String(value || '').trim())
}

async function resolveReviewImageRefForDisplay(imageRef = '') {
  const normalized = String(imageRef || '').trim()
  if (!normalized) {return ''}
  if (isDataImageUrl(normalized)) {return normalized}

  const refreshed = await refreshCloudStorageImageUrl(normalized).catch(() => '')
  if (refreshed) {return refreshed}
  if (!parseCloudStorageUrlToFileId(normalized)) {return normalized}
  return isFreshCloudStorageSignedUrl(normalized) ? normalized : ''
}

async function getDiagnosisReviewImages({ diagnosisSessionId = '' } = {}) {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return null}

  const rows = await listDiagnosisReviewImageRows(safeSessionId)
  if (!rows.length) {return null}

  const previewImageRefs = []

  for (const row of rows) {
    const replayImageRef = String(row.replay_image_ref || '').trim()
    if (replayImageRef) {
      previewImageRefs.push(replayImageRef)
      continue
    }

    const previewImageRef = String(row.preview_image_ref || '').trim()
    if (!previewImageRef) {
      continue
    }

    const resolvedPreviewImageRef = await resolveReviewImageRefForDisplay(previewImageRef)
    if (resolvedPreviewImageRef) {
      previewImageRefs.push(resolvedPreviewImageRef)
    }
  }

  const availablePreviewImageRefs = previewImageRefs
    .map(item => String(item || '').trim())
    .filter(Boolean)

  return {
    diagnosisSessionId: safeSessionId,
    coverImageRef: availablePreviewImageRefs[0] || '',
    previewImageRefs: availablePreviewImageRefs,
    imageCount: rows.length
  }
}

module.exports = {
  listDiagnosisReviewImageRows,
  isDataImageUrl,
  resolveReviewImageRefForDisplay,
  getDiagnosisReviewImages
}
