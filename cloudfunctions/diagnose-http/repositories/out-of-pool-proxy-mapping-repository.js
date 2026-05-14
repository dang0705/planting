'use strict'

const crypto = require('crypto')
const { models } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')

const CACHE_TTL_MS = 60 * 1000
const ALLOWED_MAPPING_STATUSES = new Set(['pending', 'audited', 'rejected'])
let cachedMappings = []
let cachedAt = 0
let proxyMappingSchemaEnsured = false

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeMappingRow(row = {}) {
  const matchTerms = safeJsonParse(row.match_terms_json, [])
  return {
    mappingId: normalizeText(row.mapping_id, ''),
    sourceGroupId: normalizeText(row.source_group_id, ''),
    reviewStatus: normalizeText(row.review_status, ''),
    targetSymptomKey: normalizeText(row.target_symptom_key, '').toLowerCase(),
    matchTerms: (Array.isArray(matchTerms) ? matchTerms : [])
      .map(item => normalizeText(item, ''))
      .filter(Boolean),
    rationale: normalizeText(row.rationale, ''),
    enabled: Number(row.enabled ?? 1) ? 1 : 0,
    priority: Number(row.priority || 0),
    createdByOpenid: normalizeText(row.created_by_openid, ''),
    updatedByOpenid: normalizeText(row.updated_by_openid, ''),
    createdAt: normalizeText(row.created_at, ''),
    updatedAt: normalizeText(row.updated_at, '')
  }
}

async function ensureOutOfPoolProxyMappingSchema() {
  if (proxyMappingSchemaEnsured) {return true}

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

  proxyMappingSchemaEnsured = true
  return true
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

function normalizeMappingStatus(value = '', fallback = 'pending') {
  const normalized = normalizeText(value, '').toLowerCase()
  if (!normalized || normalized === 'all') {return fallback}
  return ALLOWED_MAPPING_STATUSES.has(normalized) ? normalized : fallback
}

function normalizeStatusFilter(value = 'all') {
  const normalized = normalizeText(value, 'all').toLowerCase()
  if (normalized === 'all') {return 'all'}
  return ALLOWED_MAPPING_STATUSES.has(normalized) ? normalized : 'all'
}

function normalizeEnabledFilter(value = 'all') {
  const normalized = normalizeText(value, 'all').toLowerCase()
  if (['1', 'true', 'enabled'].includes(normalized)) {return 'enabled'}
  if (['0', 'false', 'disabled'].includes(normalized)) {return 'disabled'}
  return 'all'
}

function normalizeMatchTerms(value = []) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/[\n,，]/)
  return Array.from(
    new Set(
      source
        .map(item => normalizeText(item, ''))
        .filter(Boolean)
    )
  )
}

function buildMappingId({ targetSymptomKey = '', matchTerms = [] } = {}) {
  const hash = crypto
    .createHash('sha1')
    .update(`${normalizeText(targetSymptomKey, '').toLowerCase()}::${normalizeMatchTerms(matchTerms).join('|')}`)
    .digest('hex')
    .slice(0, 24)
  return `oopm_${hash}`
}

function buildMappingQuery({ keyword = '', reviewStatus = 'all', enabled = 'all' } = {}) {
  const safeKeyword = normalizeText(keyword, '')
  const safeStatus = normalizeStatusFilter(reviewStatus)
  const safeEnabled = normalizeEnabledFilter(enabled)
  const conditions = []
  const params = {}

  if (safeStatus !== 'all') {
    conditions.push('review_status = {{reviewStatus}}')
    params.reviewStatus = safeStatus
  }

  if (safeEnabled === 'enabled') {
    conditions.push('enabled = 1')
  } else if (safeEnabled === 'disabled') {
    conditions.push('enabled = 0')
  }

  if (safeKeyword) {
    conditions.push(`(
      mapping_id LIKE {{keywordLike}}
      OR target_symptom_key LIKE {{keywordLike}}
      OR source_group_id LIKE {{keywordLike}}
      OR !(JSON_SEARCH(match_terms_json, 'one', {{keywordLike}}) <=> NULL)
      OR rationale LIKE {{keywordLike}}
    )`)
    params.keywordLike = `%${safeKeyword}%`
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  }
}

function invalidateOutOfPoolProxyMappingCache() {
  cachedMappings = []
  cachedAt = 0
}

async function listAuditedOutOfPoolProxyMappings({ forceRefresh = false } = {}) {
  const now = Date.now()
  if (!forceRefresh && cachedAt > 0 && now - cachedAt < CACHE_TTL_MS) {
    return cachedMappings
  }

  try {
    const hasSourceGroup = await ensureOutOfPoolProxyMappingSchema()
    const result = await models.$runSQL(
      `
        SELECT
          mapping_id,
          ${hasSourceGroup ? 'source_group_id,' : "'' AS source_group_id,"}
          target_symptom_key,
          CAST(match_terms_json AS CHAR) AS match_terms_json,
          rationale,
          review_status
        FROM ${table('visual_out_of_pool_proxy_mappings')}
        WHERE enabled = 1
          AND review_status = 'audited'
        ORDER BY priority DESC, updated_at DESC, mapping_id ASC
        LIMIT 500
      `,
      {}
    )

    cachedMappings = (result?.data?.executeResultList || [])
      .map(normalizeMappingRow)
      .filter(item => item.mappingId && item.targetSymptomKey && item.matchTerms.length)
    cachedAt = now
    return cachedMappings
  } catch (error) {
    console.warn(
      'diagnose-http out-of-pool proxy mappings unavailable:',
      String(error?.message || error || '')
    )
    cachedMappings = []
    cachedAt = now
    return cachedMappings
  }
}

async function listOutOfPoolProxyMappings({
  page = 1,
  pageSize = 20,
  keyword = '',
  reviewStatus = 'all',
  enabled = 'all'
} = {}) {
  const hasSourceGroup = await ensureOutOfPoolProxyMappingSchema()

  const safePage = normalizePageNumber(page)
  const safePageSize = normalizePageSize(pageSize)
  const offset = (safePage - 1) * safePageSize
  const { whereClause, params } = buildMappingQuery({ keyword, reviewStatus, enabled })

  const [listResult, countResult] = await Promise.all([
    models.$runSQL(
      `
        SELECT
          mapping_id,
          ${hasSourceGroup ? 'source_group_id,' : "'' AS source_group_id,"}
          target_symptom_key,
          CAST(match_terms_json AS CHAR) AS match_terms_json,
          rationale,
          review_status,
          enabled,
          priority,
          created_by_openid,
          updated_by_openid,
          created_at,
          updated_at
        FROM ${table('visual_out_of_pool_proxy_mappings')}
        ${whereClause}
        ORDER BY enabled DESC, priority DESC, updated_at DESC, mapping_id ASC
        LIMIT {{limit}} OFFSET {{offset}}
      `,
      {
        ...params,
        limit: safePageSize,
        offset
      }
    ),
    models.$runSQL(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_count,
          SUM(CASE WHEN enabled = 0 THEN 1 ELSE 0 END) AS disabled_count,
          SUM(CASE WHEN review_status = 'audited' THEN 1 ELSE 0 END) AS audited_count,
          SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
        FROM ${table('visual_out_of_pool_proxy_mappings')}
        ${whereClause}
      `,
      params
    )
  ])

  const summaryRow = countResult?.data?.executeResultList?.[0] || {}
  const total = Number(summaryRow.total || 0)

  return {
    items: (listResult?.data?.executeResultList || []).map(normalizeMappingRow),
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore: safePage * safePageSize < total,
    summary: {
      total,
      enabledCount: Number(summaryRow.enabled_count || 0),
      disabledCount: Number(summaryRow.disabled_count || 0),
      auditedCount: Number(summaryRow.audited_count || 0),
      pendingCount: Number(summaryRow.pending_count || 0),
      rejectedCount: Number(summaryRow.rejected_count || 0)
    }
  }
}

async function upsertOutOfPoolProxyMapping({
  mappingId = '',
  sourceGroupId = '',
  targetSymptomKey = '',
  matchTerms = [],
  rationale = '',
  reviewStatus = 'pending',
  enabled = true,
  priority = 0,
  operatorOpenid = ''
} = {}) {
  const hasSourceGroup = await ensureOutOfPoolProxyMappingSchema()

  const safeTargetSymptomKey = normalizeText(targetSymptomKey, '').toLowerCase()
  const safeMatchTerms = normalizeMatchTerms(matchTerms)
  const safeSourceGroupId = normalizeText(sourceGroupId, '')
  const safeReviewStatus = normalizeMappingStatus(reviewStatus, 'pending')
  const safeMappingId = normalizeText(mappingId, '') || buildMappingId({
    targetSymptomKey: safeTargetSymptomKey,
    matchTerms: safeMatchTerms
  })

  if (!safeTargetSymptomKey || !safeMatchTerms.length) {
    throw new Error('invalid_out_of_pool_proxy_mapping')
  }

  await models.$runSQL(
    `
      INSERT INTO ${table('visual_out_of_pool_proxy_mappings')} (
        mapping_id,
        ${hasSourceGroup ? 'source_group_id,' : ''}
        target_symptom_key,
        match_terms_json,
        rationale,
        review_status,
        enabled,
        priority,
        created_by_openid,
        updated_by_openid,
        created_at,
        updated_at
      ) VALUES (
        {{mappingId}},
        ${hasSourceGroup ? '{{sourceGroupId}},' : ''}
        {{targetSymptomKey}},
        CAST({{matchTermsJson}} AS JSON),
        {{rationale}},
        {{reviewStatus}},
        {{enabled}},
        {{priority}},
        {{operatorOpenid}},
        {{operatorOpenid}},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON DUPLICATE KEY UPDATE
        ${hasSourceGroup ? 'source_group_id = VALUES(source_group_id),' : ''}
        target_symptom_key = VALUES(target_symptom_key),
        match_terms_json = VALUES(match_terms_json),
        rationale = VALUES(rationale),
        review_status = VALUES(review_status),
        enabled = VALUES(enabled),
        priority = VALUES(priority),
        updated_by_openid = VALUES(updated_by_openid),
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      mappingId: safeMappingId,
      sourceGroupId: safeSourceGroupId,
      targetSymptomKey: safeTargetSymptomKey,
      matchTermsJson: JSON.stringify(safeMatchTerms),
      rationale: normalizeText(rationale, ''),
      reviewStatus: safeReviewStatus,
      enabled: enabled ? 1 : 0,
      priority: Number.isFinite(Number(priority)) ? Math.floor(Number(priority)) : 0,
      operatorOpenid: normalizeText(operatorOpenid, '')
    }
  )

  invalidateOutOfPoolProxyMappingCache()

  return {
    mappingId: safeMappingId,
    sourceGroupId: safeSourceGroupId,
    targetSymptomKey: safeTargetSymptomKey,
    matchTerms: safeMatchTerms,
    reviewStatus: safeReviewStatus,
    enabled: enabled ? 1 : 0
  }
}

async function disableOutOfPoolProxyMapping({
  mappingId = '',
  operatorOpenid = ''
} = {}) {
  const safeMappingId = normalizeText(mappingId, '')
  if (!safeMappingId) {
    throw new Error('invalid_out_of_pool_proxy_mapping_id')
  }

  await models.$runSQL(
    `
      UPDATE ${table('visual_out_of_pool_proxy_mappings')}
      SET
        enabled = 0,
        updated_by_openid = {{operatorOpenid}},
        updated_at = CURRENT_TIMESTAMP
      WHERE mapping_id = {{mappingId}}
      LIMIT 1
    `,
    {
      mappingId: safeMappingId,
      operatorOpenid: normalizeText(operatorOpenid, '')
    }
  )

  invalidateOutOfPoolProxyMappingCache()

  return {
    mappingId: safeMappingId,
    enabled: 0
  }
}

module.exports = {
  disableOutOfPoolProxyMapping,
  listAuditedOutOfPoolProxyMappings,
  listOutOfPoolProxyMappings,
  upsertOutOfPoolProxyMapping
}
