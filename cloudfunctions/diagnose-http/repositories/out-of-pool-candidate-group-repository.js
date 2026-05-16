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
  mapOutOfPoolCandidateRow,
  safeParseJson
} = require('./out-of-pool-review-helpers')

let outOfPoolCandidateGroupTableEnsured = false

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

async function listOutOfPoolCandidateGroups(params = {}, fallbackListFn = null) {
  const ensured = await ensureOutOfPoolCandidateGroupTable()
  if (!ensured) {
    return typeof fallbackListFn === 'function'
      ? fallbackListFn(params)
      : { items: [], page: 1, pageSize: 20, total: 0, hasMore: false, summary: {} }
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
  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore: safePage * safePageSize < total,
    summary: {
      total: Number(summaryRow.total || 0),
      approvedCount: Number(summaryRow.approved_count || 0),
      ignoredCount: Number(summaryRow.ignored_count || 0),
      pendingCount: Number(summaryRow.pending_count || 0),
      occurrenceTotal: 0
    }
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

module.exports = {
  listOutOfPoolCandidateGroups,
  upsertOutOfPoolCandidateGroupReview
}
