'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const {
  LIKELY_MINI_PROGRAM_OPENID_PATTERN,
} = require('./normalizers')
const { buildSafeJsonText } = require('./sql-builders')
const {
  parseCloudStorageUrlToFileId,
  isFreshCloudStorageSignedUrl,
  refreshCloudStorageImageUrl
} = require('./image-url-helpers')
const {
  createReviewTimingLogger,
  withTimeout
} = require('./review-performance')

async function listDiagnosisReviewImageRows(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {
    return {
      rows: [],
      partial: false,
      degradedSections: []
    }
  }

  try {
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
        WHERE session_id = {{diagnosisSessionId}}
        ORDER BY session_id ASC, input_slot_order ASC, created_at ASC
        LIMIT 5
      `,
      {
        diagnosisSessionId: safeSessionId,
        likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
      }
    )

    return {
      rows: result?.data?.executeResultList || [],
      partial: false,
      degradedSections: []
    }
  } catch (error) {
    console.error('diagnosis review image row query failed:', {
      diagnosisSessionId: safeSessionId,
      message: error?.message || String(error || '')
    })
    return {
      rows: [],
      partial: true,
      degradedSections: ['imageRows']
    }
  }
}

function isDataImageUrl(value = '') {
  return /^data:image\//i.test(String(value || '').trim())
}

async function resolveReviewImageRefForDisplay(imageRef = '') {
  const normalized = String(imageRef || '').trim()
  if (!normalized) {return ''}
  if (isDataImageUrl(normalized)) {return normalized}

  const refreshedResult = await withTimeout(
    () => refreshCloudStorageImageUrl(normalized).catch(() => ''),
    800,
    ''
  )
  const refreshed = refreshedResult.value || ''
  if (refreshed) {return refreshed}
  if (!parseCloudStorageUrlToFileId(normalized)) {return normalized}
  return isFreshCloudStorageSignedUrl(normalized) ? normalized : ''
}

async function getDiagnosisReviewImages({ diagnosisSessionId = '' } = {}) {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return null}
  const timing = createReviewTimingLogger('diagnosis-review images', {
    diagnosisSessionId: safeSessionId
  })

  const imageRowResult = await listDiagnosisReviewImageRows(safeSessionId)
  const rows = Array.isArray(imageRowResult?.rows) ? imageRowResult.rows : []
  timing.mark('image-rows-loaded', {
    imageRowCount: rows.length
  })
  if (!rows.length) {
    if (imageRowResult?.partial) {
      timing.finish({
        partial: true,
        degradedSections: imageRowResult?.degradedSections || ['imageRows']
      })
      return {
        diagnosisSessionId: safeSessionId,
        coverImageRef: '',
        previewImageRefs: [],
        imageCount: 0,
        partial: true,
        degradedSections: imageRowResult?.degradedSections || ['imageRows']
      }
    }
    timing.finish({
      partial: false,
      degradedSections: []
    })
    return null
  }

  const previewImageRefs = []
  const degradedSections = Array.isArray(imageRowResult?.degradedSections)
    ? [...imageRowResult.degradedSections]
    : []

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
    } else {
      if (!degradedSections.includes('imageRefresh')) {
        degradedSections.push('imageRefresh')
      }
    }
  }

  const availablePreviewImageRefs = previewImageRefs
    .map(item => String(item || '').trim())
    .filter(Boolean)
  const partial = degradedSections.length > 0 || availablePreviewImageRefs.length < rows.length
  timing.finish({
    partial,
    degradedSections
  })

  return {
    diagnosisSessionId: safeSessionId,
    coverImageRef: availablePreviewImageRefs[0] || '',
    previewImageRefs: availablePreviewImageRefs,
    imageCount: rows.length,
    partial,
    degradedSections
  }
}

module.exports = {
  listDiagnosisReviewImageRows,
  isDataImageUrl,
  resolveReviewImageRefForDisplay,
  getDiagnosisReviewImages
}
