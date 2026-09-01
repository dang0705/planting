'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  assertOwnedPlantImagesForPlant,
  assertOwnedTemporaryPlantImages,
  bindOwnedTemporaryPlantImages
} = require('./plant-images')
const { normalizeAirEnvironmentInput } = require('./air-environment-evidence')
const {
  getUserPlantFertilizationEvents,
  getUserPlantFertilizationHistory,
  insertFertilizationEvent
} = require('./fertilization-history')
const MAX_USER_PLANT_NOTES_LENGTH = 200
const FERTILIZATION_LABEL_PATTERN = /产品标签|按标签/u
const FERTILIZATION_PAUSE_LABEL_PATTERN = /(?:暂停施肥|暂停追加|暂停)(?:$|[；，。])/u
const FERTILIZATION_SCOPE_GUIDANCE = {
  indoor_growth_signal: '月份仅作参考；不长新叶或新芽时暂停。',
  indoor_phenology: '按实际生长节奏参考月份；停止生长时暂停。',
  container_frost_free_window: '按当地无霜期和实际生长调整；停止生长时暂停。',
  container_phenology: '按实际生长节点调整月份；停止生长时暂停。',
  aquatic_water_temperature: '按水温和实际生长调整；肥料不要倒入水中。'
}
const FERTILIZATION_PAUSE_GUIDANCE = '表中标为“暂停施肥”或“暂停追加”时，该月不安排这类肥料的提醒。'
const FERTILIZATION_SCOPE_TYPES = new Set(['indoor', 'container', 'aquatic'])
const FERTILIZATION_ADJUSTMENT_MODES = new Set([
  'growth_signal',
  'frost_free_window',
  'phenology',
  'water_temperature'
])
const PLANT_CATALOG_CACHE_TTL_MS = 60_000
const plantCatalogCache = new Map()
const plantCatalogSummaryCache = new Map()

function emptyFertilizationMonthly() {
  return {
    available: false,
    rows: [],
    scopeLabel: '',
    scopeGuidance: '',
    choiceGuidance: '',
    publicNote: '',
    sourceNames: []
  }
}

function normalizePlantKeyword(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '')
    .trim()
}

function parseJsonField(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)))
}

function clampProbability(value) {
  return clamp(Number(value || 0), 0, 1)
}

function normalizeReliabilitySummary(summary) {
  const normalizedSummary = String(summary || '').trim()
  if (!normalizedSummary) {
    return normalizedSummary
  }

  return normalizedSummary
    .replace(/(?:[，,；;]\s*)?(?:可信度|置信度)\s*\d+%/g, '')
    .replace(/[，,；;]\s*$/g, '')
    .trim()
}

function parseCareJson(value) {
  return parseJsonField(value, null)
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
}

function isPubliclyDisplayableFertilizationRule(displayText) {
  return Boolean(displayText) && !FERTILIZATION_LABEL_PATTERN.test(displayText)
}

function buildFertilizationScopeGuidance(scopeKey, rows) {
  const baseGuidance = FERTILIZATION_SCOPE_GUIDANCE[scopeKey]
  if (!baseGuidance) {
    return ''
  }

  const hasPauseRule = rows.some(row =>
    [row?.liquid, row?.slowRelease]
      .filter(Boolean)
      .some(
        cell =>
          FERTILIZATION_PAUSE_LABEL_PATTERN.test(cell.displayText) ||
          cell.schedule?.kind === 'pause'
      )
  )

  return hasPauseRule ? `${baseGuidance}${FERTILIZATION_PAUSE_GUIDANCE}` : baseGuidance
}

function mapFertilizationMonthlyCell(cell, sourceById) {
  const displayText = String(cell?.displayText || '').trim()
  if (!displayText) {
    return null
  }

  const sourceNames = uniqueStrings(
    Array.isArray(cell?.sourceRefIds)
      ? cell.sourceRefIds.map(sourceId => sourceById.get(sourceId)?.name)
      : []
  )
  if (!sourceNames.length) {
    return null
  }

  const schedule =
    cell?.schedule && Number(cell.schedule.schemaVersion) === 1 && cell.schedule.kind
      ? cell.schedule
      : null

  return { displayText, schedule, sourceNames }
}

function mapFertilizationMonthly(value) {
  const audit = parseCareJson(value)
  if (!audit || audit.reviewStatus !== 'audited') {
    return emptyFertilizationMonthly()
  }

  const scopeType = String(audit.scopeType || '').trim()
  const adjustmentMode = String(audit.adjustmentMode || '').trim()
  if (
    !FERTILIZATION_SCOPE_TYPES.has(scopeType) ||
    !FERTILIZATION_ADJUSTMENT_MODES.has(adjustmentMode)
  ) {
    return emptyFertilizationMonthly()
  }
  const scopeGuidanceKey = `${scopeType}_${adjustmentMode}`
  if (!FERTILIZATION_SCOPE_GUIDANCE[scopeGuidanceKey]) {
    return emptyFertilizationMonthly()
  }

  const sourceRefs = Array.isArray(audit.sourceRefs) ? audit.sourceRefs : []
  const sourceById = new Map(
    sourceRefs
      .filter(source => source?.id && source?.name && source?.url && source?.evidenceRef)
      .map(source => [source.id, source])
  )
  const rawRows = Array.isArray(audit.rows) ? audit.rows : []
  const seenMonths = new Set()
  const rows = []

  for (const rawRow of rawRows) {
    const month = Number(rawRow?.month)
    if (!Number.isInteger(month) || month < 1 || month > 12 || seenMonths.has(month)) {
      return emptyFertilizationMonthly()
    }

    const rawLiquid = mapFertilizationMonthlyCell(rawRow.liquid, sourceById)
    const rawSlowRelease = mapFertilizationMonthlyCell(rawRow.slowRelease, sourceById)
    if ((rawRow.liquid && !rawLiquid) || (rawRow.slowRelease && !rawSlowRelease)) {
      return emptyFertilizationMonthly()
    }
    const liquid =
      rawLiquid && isPubliclyDisplayableFertilizationRule(rawLiquid.displayText) ? rawLiquid : null
    const slowRelease =
      rawSlowRelease && isPubliclyDisplayableFertilizationRule(rawSlowRelease.displayText)
        ? rawSlowRelease
        : null
    if (!rawLiquid && !rawSlowRelease) {
      return emptyFertilizationMonthly()
    }

    seenMonths.add(month)
    rows.push({ month, liquid, slowRelease })
  }

  if (rows.length !== 12) {
    return emptyFertilizationMonthly()
  }

  rows.sort((left, right) => left.month - right.month)
  if (!rows.some(row => row.liquid || row.slowRelease)) {
    return emptyFertilizationMonthly()
  }
  const scopeGuidance = buildFertilizationScopeGuidance(scopeGuidanceKey, rows)
  const sourceNames = uniqueStrings(
    rows.flatMap(row => [
      ...(row.liquid?.sourceNames || []),
      ...(row.slowRelease?.sourceNames || [])
    ])
  )

  return {
    available: true,
    rows,
    scopeLabel: String(audit.scopeLabel || '').trim(),
    scopeGuidance,
    choiceGuidance: scopeType === 'aquatic' ? '' : '液体肥和缓释肥选一种，不要同时使用。',
    publicNote: String(audit.publicNote || '').trim(),
    sourceNames
  }
}

function stringifyNullableJson(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  return JSON.stringify(value)
}

function normalizeAirEnvironmentLocationBinding(value = {}) {
  return {
    careLocationId: normalizeNullableString(value?.careLocationId) || '',
    locationKey: normalizeNullableString(value?.locationKey) || ''
  }
}

function normalizeAirEnvironmentProfile(value, locationBinding = {}, updatedAt = '') {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const source = value?.input ? value : { input: value, locationBinding }
  const isLegacyStoredProfile = Boolean(value?.input) && Number(source.schemaVersion || 1) < 2
  const input = normalizeAirEnvironmentInput(source.input, {
    requireDirectSource: !isLegacyStoredProfile
  })
  if (!input) {
    return null
  }
  return {
    schemaVersion: isLegacyStoredProfile ? Number(source.schemaVersion || 1) : 2,
    input,
    locationBinding: normalizeAirEnvironmentLocationBinding(
      source.locationBinding || locationBinding
    ),
    updatedAt: String(source.updatedAt || updatedAt || new Date().toISOString()).trim()
  }
}

function parseAirEnvironmentProfile(value, updatedAt = '') {
  const parsed = parseJsonField(value, null)
  return normalizeAirEnvironmentProfile(parsed, parsed?.locationBinding || {}, updatedAt)
}

function hasOwnField(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key)
}

function normalizeNullableString(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return null
  }

  const lowered = normalized.toLowerCase()
  if (lowered === 'null' || lowered === 'undefined') {
    return null
  }

  return normalized
}

function toNullableDateParam(value) {
  const normalized = normalizeNullableString(value)
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeUserPlantNotes(value) {
  if (value === null || value === undefined) {
    return null
  }
  return String(value).slice(0, MAX_USER_PLANT_NOTES_LENGTH)
}

/**
 * DECIMAL 列：$runSQL 会把 JS null 序列化成字符串 'null' 导致 Incorrect decimal value，
 * 统一转成空字符串 '' 传入，SQL 侧用 NULLIF(x, '') 转回 NULL
 */
function toNullableDecimal(value) {
  if (value === null || value === undefined || value === '' || value === 'null') {
    return ''
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : ''
}

function resolveCatalogPlantId(row = {}) {
  return (
    normalizeNullableString(row.session_plant_id) ||
    normalizeNullableString(row.plant_identity_id) ||
    ''
  )
}

function resolveUserPlantCatalogLookupId(row = {}) {
  return (
    normalizeNullableString(row.plant_identity_id) ||
    normalizeNullableString(row.plant_id) ||
    normalizeNullableString(row.session_plant_id) ||
    ''
  )
}

const USER_PLANT_DISPLAY_IDENTITY_FIELDS = [
  'plant_id',
  'plant_identity_id',
  'session_plant_id',
  'canonical_name',
  'recognized_name',
  'nickname'
]

function hasDisplayableUserPlantIdentity(row = {}) {
  return USER_PLANT_DISPLAY_IDENTITY_FIELDS.some(field =>
    Boolean(normalizeNullableString(row[field]))
  )
}

function displayableUserPlantSqlCondition(tableAlias = 'up') {
  return `(
    ${USER_PLANT_DISPLAY_IDENTITY_FIELDS.map(
      field => `LOWER(TRIM(COALESCE(${tableAlias}.${field}, ''))) NOT IN ('', 'null', 'undefined')`
    ).join('\n      OR ')}
  )`
}

function buildCatalogFieldMatchCondition(operator, paramName) {
  const placeholder = `{{${paramName}}}`
  return `(
    REPLACE(LOWER(COALESCE(pie.primary_display_name, '')), ' ', '') ${operator} ${placeholder}
    OR REPLACE(LOWER(COALESCE(pie.canonical_identity_name, '')), ' ', '') ${operator} ${placeholder}
    OR REPLACE(LOWER(COALESCE(pie.canonical_identity_name_cn, '')), ' ', '') ${operator} ${placeholder}
    OR REPLACE(LOWER(COALESCE(pie.canonical_identity_name_en, '')), ' ', '') ${operator} ${placeholder}
    OR REPLACE(LOWER(COALESCE(pie.scientific_name, '')), ' ', '') ${operator} ${placeholder}
  )`
}

function buildCatalogAliasMatchCondition(operator, paramName) {
  const placeholder = `{{${paramName}}}`
  return `EXISTS (
    SELECT 1
    FROM plant_identity_aliases pia
    WHERE pia.plant_identity_id = pie.plant_identity_id
      AND pia.is_active = 1
      AND REPLACE(LOWER(COALESCE(pia.alias_name, '')), ' ', '') ${operator} ${placeholder}
  )`
}

function buildCatalogSearchCondition(operator, paramName) {
  return `(
    ${buildCatalogFieldMatchCondition(operator, paramName)}
    OR ${buildCatalogAliasMatchCondition(operator, paramName)}
  )`
}

function buildCatalogAliasMatchSubquery(selectField) {
  return `(
    SELECT pia.${selectField}
    FROM plant_identity_aliases pia
    WHERE pia.plant_identity_id = pie.plant_identity_id
      AND pia.is_active = 1
      AND (
        REPLACE(LOWER(COALESCE(pia.alias_name, '')), ' ', '') = {{normalized}}
        OR REPLACE(LOWER(COALESCE(pia.alias_name, '')), ' ', '') LIKE {{fuzzy}}
      )
    ORDER BY
      CASE
        WHEN REPLACE(LOWER(COALESCE(pia.alias_name, '')), ' ', '') = {{normalized}} THEN 0
        ELSE 1
      END,
      pia.is_preferred_search_alias DESC,
      CHAR_LENGTH(pia.alias_name),
      pia.alias_name
    LIMIT 1
  )`
}

const CATALOG_FROM_SQL = `
  FROM plant_identity_entities pie
  LEFT JOIN (
    SELECT
      plant_identity_id,
      GROUP_CONCAT(DISTINCT alias_name ORDER BY alias_name SEPARATOR '、') AS alias_names
    FROM plant_identity_aliases
    WHERE is_active = 1
    GROUP BY plant_identity_id
  ) alias_summary ON alias_summary.plant_identity_id = pie.plant_identity_id
  LEFT JOIN genus_care_profiles gcp
    ON gcp.genus_name = pie.genus_name
   AND gcp.family_name_canonical = pie.family_name_canonical
   AND gcp.is_active = 1
`

// 详情仍需完整养护策略，但别名只用于目录搜索，不属于用户植物详情展示。
// 移除全量 alias_summary 聚合，避免每次详情读取都扫描整张别名表。
const CATALOG_DETAIL_FROM_SQL = `
  FROM plant_identity_entities pie
  LEFT JOIN genus_care_profiles gcp
    ON gcp.genus_name = pie.genus_name
   AND gcp.family_name_canonical = pie.family_name_canonical
   AND gcp.is_active = 1
`

const CATALOG_SELECT_SQL = `
  SELECT
    pie.plant_identity_id,
    pie.session_plant_id,
    pie.canonical_identity_name,
    pie.canonical_identity_name_cn,
    pie.canonical_identity_name_en,
    pie.primary_display_name,
    pie.identity_level,
    pie.family_name_canonical,
    pie.family_name_cn,
    pie.family_name_en,
    pie.genus_name,
    pie.species_name,
    pie.scientific_name,
    pie.category_name_cn,
    pie.category_name_en,
    pie.basic_description,
    pie.cover_image_ref,
    pie.review_status AS identity_review_status,
    gcp.watering_strategy_json,
    gcp.watering_way_quantization_json,
    gcp.fertilizing_strategy_json,
    gcp.fertilizing_monthly_strategy_json,
    gcp.light_strategy_json,
    gcp.airflow_strategy_json,
    gcp.temp_min_c,
    gcp.temp_max_c,
    gcp.humidity_min,
    gcp.humidity_max,
    gcp.toxicity_level,
    gcp.review_status AS care_review_status,
    gcp.evidence_level,
    alias_summary.alias_names
`

const CATALOG_DETAIL_SELECT_SQL = CATALOG_SELECT_SQL.replace(
  'alias_summary.alias_names',
  'NULL AS alias_names'
)

// 列表只需要身份、名称和封面；完整养护策略在详情/规划接口按需读取。
// 避免列表请求为每株植物解析属级策略、月度施肥 JSON 和别名聚合。
const CATALOG_SUMMARY_SELECT_SQL = `
  SELECT
    pie.plant_identity_id,
    pie.session_plant_id,
    pie.canonical_identity_name,
    pie.canonical_identity_name_cn,
    pie.canonical_identity_name_en,
    pie.primary_display_name,
    pie.identity_level,
    pie.family_name_canonical,
    pie.family_name_cn,
    pie.family_name_en,
    pie.genus_name,
    pie.scientific_name,
    pie.cover_image_ref,
    pie.review_status AS identity_review_status
`

function mapPlantRow(row) {
  const catalogId = resolveCatalogPlantId(row)
  const canonicalName =
    row.primary_display_name ||
    row.canonical_identity_name_cn ||
    row.canonical_identity_name ||
    row.scientific_name ||
    ''
  const scientificName = row.scientific_name || row.canonical_identity_name_en || ''
  const internetName =
    scientificName && scientificName !== canonicalName
      ? scientificName
      : row.canonical_identity_name_en || ''

  return {
    id: catalogId,
    plantId: catalogId,
    plantIdentityId: row.plant_identity_id || '',
    sessionPlantId: row.session_plant_id || '',
    canonicalName,
    aliasNames: row.alias_names || '',
    latinName: scientificName,
    scientificName,
    imageFileId: row.cover_image_ref || '',
    plantDesc: row.basic_description || '',
    categoryCn: row.category_name_cn || '',
    categoryEn: row.category_name_en || '',
    genus: row.genus_name || '',
    familyCn: row.family_name_cn || '',
    familyEn: row.family_name_en || row.family_name_canonical || '',
    difficulty:
      row.difficulty === null || row.difficulty === undefined ? 0 : Number(row.difficulty || 0),
    internetName,
    identityLevel: row.identity_level || '',
    identityReviewStatus: row.identity_review_status || '',
    watering: parseCareJson(row.watering_strategy_json),
    wateringQuantization: parseCareJson(row.watering_way_quantization_json),
    fertilization: parseCareJson(row.fertilizing_strategy_json),
    fertilizationMonthly: mapFertilizationMonthly(row.fertilizing_monthly_strategy_json),
    sunning: parseCareJson(row.light_strategy_json),
    ventilation: parseCareJson(row.airflow_strategy_json),
    temperatureMin:
      row.temp_min_c === null || row.temp_min_c === undefined ? null : Number(row.temp_min_c),
    temperatureMax:
      row.temp_max_c === null || row.temp_max_c === undefined ? null : Number(row.temp_max_c),
    humidityMin:
      row.humidity_min === null || row.humidity_min === undefined ? null : Number(row.humidity_min),
    humidityMax:
      row.humidity_max === null || row.humidity_max === undefined ? null : Number(row.humidity_max),
    varianceLevel: row.evidence_level || '',
    careAuditStatus: row.care_review_status || ''
  }
}

async function listPlantCatalog({ keyword = '', page = 1, pageSize = 10, offset } = {}) {
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.max(1, Number(pageSize) || 10)
  const normalizedOffset =
    offset === undefined || offset === null
      ? (normalizedPage - 1) * normalizedPageSize
      : Math.max(0, Number(offset) || 0)
  let sql = `${CATALOG_SELECT_SQL} ${CATALOG_FROM_SQL}`

  const params = { limit: normalizedPageSize, offset: normalizedOffset }
  const conditions = ['pie.is_active = 1']
  const normalizedKeyword = normalizePlantKeyword(keyword)

  if (normalizedKeyword) {
    conditions.push(buildCatalogSearchCondition('LIKE', 'searchPattern'))
    params.searchPattern = `%${normalizedKeyword}%`
  }

  sql += `
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      CAST(COALESCE(NULLIF(pie.session_plant_id, ''), '0') AS UNSIGNED),
      pie.primary_display_name,
      pie.plant_identity_id
    LIMIT {{limit}} OFFSET {{offset}}
  `

  const countSql = `
    SELECT COUNT(*) AS total
    FROM plant_identity_entities pie
    WHERE ${conditions.join(' AND ')}
  `

  const [result, countResult] = await Promise.all([
    models.$runSQL(sql, params),
    models.$runSQL(countSql, params)
  ])
  const list = (result?.data?.executeResultList || []).map(mapPlantRow)
  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)

  return {
    list,
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    hasMore: normalizedOffset + list.length < total
  }
}

async function getPlantCatalogById(plantId) {
  const lookupId = normalizeNullableString(plantId)
  if (!lookupId) {
    return null
  }
  const cached = plantCatalogCache.get(lookupId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const map = await getPlantCatalogByIds([lookupId], { detail: true })
  return map.get(lookupId) || null
}

/**
 * 批量读取用户植物所需的目录记录。
 * 列表接口之前对每一株植物调用一次 getPlantCatalogById，7 株植物就产生 7 次
 * CloudBase SQL 往返；这里把 identity/session 两种匹配合并为一次查询，调用方
 * 仍按原来的 lookup id 取得同一条优先级最高的目录记录。
 */
async function getPlantCatalogByIds(plantIds = [], { summary = false, detail = false } = {}) {
  const ids = Array.from(
    new Set((Array.isArray(plantIds) ? plantIds : []).map(normalizeNullableString).filter(Boolean))
  )
  if (!ids.length) {
    return new Map()
  }

  const now = Date.now()
  const cache = summary ? plantCatalogSummaryCache : plantCatalogCache
  const resultMap = new Map()
  const missingIds = []
  for (const id of ids) {
    const cached = cache.get(id)
    if (cached && cached.expiresAt > now) {
      resultMap.set(id, cached.value)
    } else {
      missingIds.push(id)
    }
  }
  if (!missingIds.length) {
    return resultMap
  }

  const placeholders = missingIds.map((_, index) => `{{plantId${index}}}`)
  const params = Object.fromEntries(missingIds.map((id, index) => [`plantId${index}`, id]))
  const result = await models.$runSQL(
    `
      ${summary ? CATALOG_SUMMARY_SELECT_SQL : detail ? CATALOG_DETAIL_SELECT_SQL : CATALOG_SELECT_SQL}
      ${
        summary
          ? 'FROM plant_identity_entities pie'
          : detail
            ? CATALOG_DETAIL_FROM_SQL
            : CATALOG_FROM_SQL
      }
      WHERE pie.is_active = 1
        AND (
          pie.plant_identity_id IN (${placeholders.join(',')})
          OR pie.session_plant_id IN (${placeholders.join(',')})
        )
    `,
    params
  )

  const candidatesById = new Map(missingIds.map(id => [id, []]))
  for (const row of result?.data?.executeResultList || []) {
    const mapped = mapPlantRow(row)
    const identityId = normalizeNullableString(row.plant_identity_id)
    const sessionId = normalizeNullableString(row.session_plant_id)
    for (const id of missingIds) {
      const matchPriority = sessionId === id ? 0 : identityId === id ? 1 : null
      if (matchPriority !== null) {
        candidatesById.get(id).push({ matchPriority, mapped })
      }
    }
  }

  for (const id of missingIds) {
    const candidates = candidatesById.get(id) || []
    candidates.sort((left, right) => {
      if (left.matchPriority !== right.matchPriority) {
        return left.matchPriority - right.matchPriority
      }
      return String(left.mapped?.canonicalName || '').localeCompare(
        String(right.mapped?.canonicalName || ''),
        'zh-Hans'
      )
    })
    const value = candidates[0]?.mapped || null
    resultMap.set(id, value)
    if (value) {
      cache.set(id, { value, expiresAt: now + PLANT_CATALOG_CACHE_TTL_MS })
    }
  }
  return resultMap
}

async function findCanonicalPlantMatch(name, limit = 5) {
  const normalized = normalizePlantKeyword(name)
  if (!normalized) {
    return []
  }

  const sql = `
    ${CATALOG_SELECT_SQL},
    ${buildCatalogAliasMatchSubquery('alias_name')} AS match_alias,
    ${buildCatalogAliasMatchSubquery('alias_type')} AS match_alias_type,
    CASE
      WHEN ${buildCatalogAliasMatchCondition('=', 'normalized')} THEN 4
      WHEN ${buildCatalogFieldMatchCondition('=', 'normalized')} THEN 3
      WHEN ${buildCatalogAliasMatchCondition('LIKE', 'fuzzy')} THEN 2
      WHEN ${buildCatalogFieldMatchCondition('LIKE', 'fuzzy')} THEN 1
      ELSE 0
    END AS match_score
    ${CATALOG_FROM_SQL}
    WHERE
      pie.is_active = 1
      AND (
        ${buildCatalogSearchCondition('=', 'normalized')}
        OR ${buildCatalogSearchCondition('LIKE', 'fuzzy')}
      )
    ORDER BY
      match_score DESC,
      CAST(COALESCE(NULLIF(pie.session_plant_id, ''), '0') AS UNSIGNED),
      pie.primary_display_name,
      pie.plant_identity_id
    LIMIT {{limit}}
  `
  const result = await models.$runSQL(sql, {
    normalized,
    fuzzy: `%${normalized}%`,
    limit: Number(limit)
  })

  const rows = result?.data?.executeResultList || []
  const dedup = new Map()
  for (const row of rows) {
    const catalogId = resolveCatalogPlantId(row)
    if (!dedup.has(catalogId)) {
      dedup.set(catalogId, {
        ...mapPlantRow(row),
        matchScore: Number(row.match_score || 0),
        matchAlias: row.match_alias || '',
        matchType: row.match_alias_type || 'canonical'
      })
    }
  }
  return Array.from(dedup.values())
}

async function createUserPlantInstance({
  openid,
  ownerUserId = null,
  plantId = null,
  plantIdentityId = null,
  sessionPlantId = null,
  recognizedName = null,
  sourceType = 'catalog',
  recognitionType = null,
  recognitionConfidence = null,
  identityResolutionStatus = null,
  visualCallBatchId = null,
  nickname = null,
  location = null,
  plantDate = null,
  notes = null,
  lightEnvironment = null,
  airEnvironment = null,
  airEnvironmentLocationBinding = null,
  potTopDiameterCm = null,
  potBottomDiameterCm = null,
  potHeightCm = null,
  hasDrainageHole = 'unknown',
  potMaterial = 'unknown',
  substrateType = 'unknown',
  potProfileSource = 'default',
  potProfileConfidence = 'low',
  photos = null
}) {
  const ownedTemporaryPhotoFileIds = await assertOwnedTemporaryPlantImages({
    openid,
    fileIds: photos
  })
  let plant = null
  const normalizedPlantId = normalizeNullableString(plantId)
  const normalizedPlantIdentityId = normalizeNullableString(plantIdentityId)
  const normalizedSessionPlantId = normalizeNullableString(sessionPlantId)
  const normalizedRecognizedName = normalizeNullableString(recognizedName)
  const normalizedIdentityResolutionStatus = normalizeNullableString(identityResolutionStatus)
  const normalizedVisualCallBatchId = normalizeNullableString(visualCallBatchId)
  let matchedPlantId = null
  let persistedPlantIdentityId = normalizedPlantIdentityId
  let persistedSessionPlantId = normalizedSessionPlantId
  let canonicalName = normalizedRecognizedName
  let plantGenus = null
  let plantFamilyEn = null
  let plantLatinName = null
  const lookupCandidates = Array.from(
    new Set(
      [normalizedPlantIdentityId, normalizedSessionPlantId, normalizedPlantId].filter(Boolean)
    )
  )

  if (normalizedVisualCallBatchId) {
    const visualBatchResult = await models.$runSQL(
      `
        SELECT visual_call_batch_id
        FROM visual_call_batches
        WHERE visual_call_batch_id = {{visualCallBatchId}} AND _openid = {{openid}}
        LIMIT 1
      `,
      {
        openid,
        visualCallBatchId: normalizedVisualCallBatchId
      }
    )

    if (!visualBatchResult?.data?.executeResultList?.[0]?.visual_call_batch_id) {
      throw new Error('视觉批次不存在或无权限使用')
    }
  }

  for (const candidateId of lookupCandidates) {
    plant = await getPlantCatalogById(candidateId)
    if (plant) {
      break
    }
  }

  if (lookupCandidates.length && !plant) {
    throw new Error('植物目录中不存在该 identity / plantId')
  }

  if (plant) {
    matchedPlantId =
      plant.id || normalizedPlantId || normalizedSessionPlantId || normalizedPlantIdentityId
    persistedPlantIdentityId = plant.plantIdentityId || persistedPlantIdentityId
    persistedSessionPlantId = plant.sessionPlantId || persistedSessionPlantId
    if (!persistedSessionPlantId && matchedPlantId && matchedPlantId !== persistedPlantIdentityId) {
      persistedSessionPlantId = matchedPlantId
    }
    canonicalName = plant.canonicalName
    plantGenus = plant.genus
    plantFamilyEn = plant.familyEn
    plantLatinName = plant.latinName
  }

  const finalIdentityResolutionStatus = persistedPlantIdentityId
    ? 'matched'
    : normalizedIdentityResolutionStatus || 'unresolved'
  const airEnvironmentProfile = normalizeAirEnvironmentProfile(
    airEnvironment,
    airEnvironmentLocationBinding
  )
  if (airEnvironment !== null && airEnvironment !== undefined && !airEnvironmentProfile) {
    throw new Error('空气环境信息不完整')
  }

  const sql = `
    INSERT INTO user_plant_instances (
      _openid, owner_user_id, plant_id, plant_identity_id, session_plant_id, canonical_name, recognized_name,
      source_type, recognition_type, recognition_confidence, identity_resolution_status,
      visual_call_batch_id, nickname, location, plant_date, notes, light_environment_json, air_environment_json,
      pot_top_diameter_cm, pot_bottom_diameter_cm, pot_height_cm, has_drainage_hole, pot_material, substrate_type,
      pot_profile_source, pot_profile_confidence, photos,
      plant_genus, plant_family_en, plant_latin_name
    ) VALUES (
      {{openid}}, {{ownerUserId}}, {{plantId}}, {{plantIdentityId}}, {{sessionPlantId}}, {{canonicalName}}, {{recognizedName}},
      {{sourceType}}, {{recognitionType}}, NULLIF({{recognitionConfidence}}, ''), {{identityResolutionStatus}},
      {{visualCallBatchId}}, {{nickname}}, {{location}}, NULLIF({{plantDate}}, ''), {{notes}}, {{lightEnvironmentJson}}, {{airEnvironmentJson}},
      NULLIF({{potTopDiameterCm}}, ''), NULLIF({{potBottomDiameterCm}}, ''), NULLIF({{potHeightCm}}, ''),
      {{hasDrainageHole}}, {{potMaterial}}, {{substrateType}}, {{potProfileSource}}, {{potProfileConfidence}}, {{photos}},
      {{plantGenus}}, {{plantFamilyEn}}, {{plantLatinName}}
    )
  `

  await models.$runSQL(sql, {
    openid,
    ownerUserId: normalizeNullableString(ownerUserId) || openid,
    plantId: matchedPlantId,
    plantIdentityId: persistedPlantIdentityId,
    sessionPlantId: persistedSessionPlantId,
    canonicalName,
    recognizedName: normalizedRecognizedName,
    sourceType: normalizeNullableString(sourceType) || 'catalog',
    recognitionType: normalizeNullableString(recognitionType),
    recognitionConfidence:
      recognitionConfidence === null ||
      recognitionConfidence === undefined ||
      recognitionConfidence === '' ||
      recognitionConfidence === 'null'
        ? ''
        : recognitionConfidence,
    identityResolutionStatus: finalIdentityResolutionStatus,
    visualCallBatchId: normalizedVisualCallBatchId,
    nickname: normalizeNullableString(nickname),
    location: normalizeNullableString(location),
    plantDate: toNullableDateParam(plantDate),
    notes: normalizeUserPlantNotes(notes),
    lightEnvironmentJson: stringifyNullableJson(lightEnvironment),
    airEnvironmentJson: stringifyNullableJson(airEnvironmentProfile),
    potTopDiameterCm: toNullableDecimal(potTopDiameterCm),
    potBottomDiameterCm: toNullableDecimal(potBottomDiameterCm),
    potHeightCm: toNullableDecimal(potHeightCm),
    hasDrainageHole: normalizeNullableString(hasDrainageHole) || 'unknown',
    potMaterial: normalizeNullableString(potMaterial) || 'unknown',
    substrateType: normalizeNullableString(substrateType) || 'unknown',
    potProfileSource: normalizeNullableString(potProfileSource) || 'default',
    potProfileConfidence: normalizeNullableString(potProfileConfidence) || 'low',
    photos: photos ? JSON.stringify(photos) : null,
    plantGenus,
    plantFamilyEn,
    plantLatinName
  })

  const lastIdResult = await models.$runSQL('SELECT LAST_INSERT_ID() AS insertId', {})
  let insertedId = Number(lastIdResult?.data?.executeResultList?.[0]?.insertId || 0)

  if (!insertedId) {
    const fallbackResult = await models.$runSQL(
      `
        SELECT id
        FROM user_plant_instances
        WHERE _openid = {{openid}}
          AND COALESCE(plant_identity_id, '') = COALESCE({{plantIdentityId}}, '')
          AND COALESCE(session_plant_id, '') = COALESCE({{sessionPlantId}}, '')
          AND COALESCE(recognized_name, '') = COALESCE({{recognizedName}}, '')
          AND COALESCE(nickname, '') = COALESCE({{nickname}}, '')
          AND COALESCE(location, '') = COALESCE({{location}}, '')
        ORDER BY id DESC
        LIMIT 1
      `,
      {
        openid,
        plantIdentityId: persistedPlantIdentityId,
        sessionPlantId: persistedSessionPlantId,
        recognizedName: normalizedRecognizedName,
        nickname: normalizeNullableString(nickname),
        location: normalizeNullableString(location)
      }
    )

    insertedId = Number(fallbackResult?.data?.executeResultList?.[0]?.id || 0)
  }

  if (insertedId && ownedTemporaryPhotoFileIds.length) {
    await bindOwnedTemporaryPlantImages({
      openid,
      plantId: insertedId,
      fileIds: ownedTemporaryPhotoFileIds
    })
  }

  return insertedId ? getUserPlantInstanceById(openid, insertedId) : null
}

// 只为当前结果集中的用户植物查最新诊断。
// 旧写法先对 diagnosis_sessions 全表 GROUP BY，再回连用户植物；历史记录增长后，
// 即使当前用户只有几株植物，也会为每次 user-plants 请求扫描整张诊断表。
// 相关子查询利用 user_plant_id 索引按株取 MAX(created_at)，避免全表聚合；
// 同一时间戳存在多条记录时再以 diagnosis_id 稳定收敛为一条，避免列表重复和窗口总数失真。
const USER_PLANT_LATEST_DIAGNOSIS_SQL = `
    LEFT JOIN (
      SELECT user_plant_id, health_status, health_score
      FROM (
        SELECT
          user_plant_id,
          health_status,
          health_score,
          ROW_NUMBER() OVER (
            PARTITION BY user_plant_id
            ORDER BY created_at DESC, diagnosis_id DESC
          ) AS diagnosis_rank
        FROM diagnosis_sessions
        WHERE _openid = {{openid}}
      ) ranked_diagnoses
      WHERE diagnosis_rank = 1
    ) ds ON ds.user_plant_id = up.id
`

function compactFertilizationMonthlyForList(value) {
  if (!value || typeof value !== 'object') {
    return value || null
  }
  return {
    available: value.available === true,
    rows: [],
    scopeLabel: value.scopeLabel || '',
    scopeGuidance: value.scopeGuidance || '',
    choiceGuidance: value.choiceGuidance || '',
    publicNote: value.publicNote || '',
    sourceNames: Array.isArray(value.sourceNames) ? value.sourceNames : []
  }
}

function mapUserPlantCareLocationFromRow(row = {}) {
  if (!row?.care_location_id) {
    return null
  }
  return {
    careLocationId: row.care_location_id,
    plantId: row.care_plant_id,
    userId: row.care_user_id || row.care_openid || '',
    openid: row.care_openid || row.care_user_id || '',
    locationKey: row.care_location_key || '',
    cityName: row.care_city_name || '',
    latitude: Number(row.care_latitude),
    longitude: Number(row.care_longitude),
    weatherLocation: row.care_weather_location || '',
    source: row.care_source || ''
  }
}

function mapUserPlantInstanceRow(row, plant = null) {
  const resolvedPlant = plant || mapJoinedCatalogRow(row)
  const plantIdentityId =
    resolvedPlant?.plantIdentityId || normalizeNullableString(row.plant_identity_id) || ''
  const sessionPlantId =
    resolvedPlant?.sessionPlantId || normalizeNullableString(row.session_plant_id) || ''
  const canonicalName =
    normalizeNullableString(row.canonical_name) ||
    resolvedPlant?.canonicalName ||
    normalizeNullableString(row.recognized_name) ||
    ''
  const nickname = normalizeNullableString(row.nickname) || ''
  const recognizedName = normalizeNullableString(row.recognized_name) || ''

  return {
    id: row.id,
    recordVersion: Number(row.record_version || 1),
    plantId: normalizeNullableString(row.plant_id) || '',
    plantIdentityId,
    sessionPlantId,
    canonicalName,
    nickname,
    displayName: nickname || canonicalName || recognizedName || '未命名植物',
    recognizedName,
    sourceType: row.source_type || 'catalog',
    recognitionType: row.recognition_type || '',
    recognitionConfidence:
      row.recognition_confidence === null || row.recognition_confidence === undefined
        ? null
        : Number(row.recognition_confidence),
    identityResolutionStatus:
      row.identity_resolution_status || (plantIdentityId ? 'matched' : 'unresolved'),
    visualCallBatchId: row.visual_call_batch_id || '',
    location: row.location || '未设置',
    plantDate: row.plant_date || null,
    notes: row.notes ?? '',
    photos: parseJsonField(row.photos, []),
    lightEnvironment: parseJsonField(
      row.light_environment_json_text ?? row.light_environment_json,
      null
    ),
    airEnvironment: parseAirEnvironmentProfile(
      row.air_environment_json_text ?? row.air_environment_json,
      row.updated_at
    ),
    imageFileId: resolvedPlant?.imageFileId || '',
    lastWatered: row.last_watered || null,
    nextWater: row.next_water || null,
    createdAt: row.created_at || null,
    genus: resolvedPlant?.genus || row.plant_genus || '',
    familyCn: resolvedPlant?.familyCn || '',
    familyEn: resolvedPlant?.familyEn || row.plant_family_en || '',
    latinName: resolvedPlant?.latinName || row.plant_latin_name || '',
    watering: resolvedPlant?.watering || null,
    fertilization: resolvedPlant?.fertilization || null,
    fertilizationMonthly: resolvedPlant?.fertilizationMonthly || null,
    sunning: resolvedPlant?.sunning || null,
    ventilation: resolvedPlant?.ventilation || null,
    temperatureMin: resolvedPlant?.temperatureMin ?? null,
    temperatureMax: resolvedPlant?.temperatureMax ?? null,
    humidityMin: resolvedPlant?.humidityMin ?? null,
    humidityMax: resolvedPlant?.humidityMax ?? null,
    varianceLevel: resolvedPlant?.varianceLevel || '',
    healthStatus: row.health_status || 'unknown',
    healthScore:
      row.health_score === null || row.health_score === undefined ? null : Number(row.health_score),
    fertilizationGuard: parseJsonField(
      row.fertilization_guard_json_text ?? row.fertilization_guard_json,
      null
    ),
    // 盆型档案（直接来自主表列，前端 WateringReminderSheet 直接读取）
    potProfile: mapPotProfileFromRow(row)
  }
}

function mapJoinedCatalogRow(row = {}) {
  if (!row.catalog_plant_identity_id && !row.catalog_session_plant_id) {
    return null
  }
  return mapPlantRow({
    plant_identity_id: row.catalog_plant_identity_id,
    session_plant_id: row.catalog_session_plant_id,
    canonical_identity_name: row.catalog_canonical_identity_name,
    canonical_identity_name_cn: row.catalog_canonical_identity_name_cn,
    canonical_identity_name_en: row.catalog_canonical_identity_name_en,
    primary_display_name: row.catalog_primary_display_name,
    identity_level: row.catalog_identity_level,
    family_name_canonical: row.catalog_family_name_canonical,
    family_name_cn: row.catalog_family_name_cn,
    family_name_en: row.catalog_family_name_en,
    genus_name: row.catalog_genus_name,
    species_name: row.catalog_species_name,
    scientific_name: row.catalog_scientific_name,
    category_name_cn: row.catalog_category_name_cn,
    category_name_en: row.catalog_category_name_en,
    basic_description: row.catalog_basic_description,
    cover_image_ref: row.catalog_cover_image_ref,
    identity_review_status: row.catalog_identity_review_status,
    watering_strategy_json: row.catalog_watering_strategy_json,
    watering_way_quantization_json: row.catalog_watering_way_quantization_json,
    fertilizing_strategy_json: row.catalog_fertilizing_strategy_json,
    fertilizing_monthly_strategy_json: row.catalog_fertilizing_monthly_strategy_json,
    light_strategy_json: row.catalog_light_strategy_json,
    airflow_strategy_json: row.catalog_airflow_strategy_json,
    temp_min_c: row.catalog_temp_min_c,
    temp_max_c: row.catalog_temp_max_c,
    humidity_min: row.catalog_humidity_min,
    humidity_max: row.catalog_humidity_max,
    care_review_status: row.catalog_care_review_status,
    evidence_level: row.catalog_evidence_level,
    alias_names: row.catalog_alias_names
  })
}

/**
 * 从 user_plant_instances 行提取盆型档案。
 * substrate_type 可能是 JSON 数组字符串（多选+比例）或单值。
 */
function mapPotProfileFromRow(row) {
  const substrateType = row.substrate_type || 'unknown'
  let substrateComposition = null
  if (typeof substrateType === 'string' && substrateType.startsWith('[')) {
    try {
      substrateComposition = JSON.parse(substrateType)
    } catch {
      substrateComposition = null
    }
  }
  return {
    potTopDiameterCm:
      row.pot_top_diameter_cm === null || row.pot_top_diameter_cm === undefined
        ? null
        : Number(row.pot_top_diameter_cm),
    potBottomDiameterCm:
      row.pot_bottom_diameter_cm === null || row.pot_bottom_diameter_cm === undefined
        ? null
        : Number(row.pot_bottom_diameter_cm),
    potHeightCm:
      row.pot_height_cm === null || row.pot_height_cm === undefined
        ? null
        : Number(row.pot_height_cm),
    hasDrainageHole:
      Number(row.pot_top_diameter_cm) > 0 ||
      Number(row.pot_bottom_diameter_cm) > 0 ||
      Number(row.pot_height_cm) > 0
        ? row.has_drainage_hole || 'unknown'
        : 'unknown',
    potMaterial: row.pot_material || 'unknown',
    substrateType,
    substrateComposition,
    profileVersion: Number(row.pot_profile_version || 1),
    source: row.pot_profile_source || 'default',
    confidence: row.pot_profile_confidence || 'low'
  }
}

async function getUserPlantInstanceById(openid, id) {
  const sql = `
    SELECT
      up.id,
      up.record_version,
      up.plant_id,
      up.plant_identity_id,
      up.session_plant_id,
      up.canonical_name,
      up.recognized_name,
      up.source_type,
      up.recognition_type,
      up.recognition_confidence,
      up.identity_resolution_status,
      up.visual_call_batch_id,
      up.nickname,
      up.location,
      up.plant_date,
      up.notes,
      CAST(up.light_environment_json AS CHAR) AS light_environment_json_text,
      CAST(up.air_environment_json AS CHAR) AS air_environment_json_text,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      up.plant_genus,
      up.plant_family_en,
      up.plant_latin_name,
      up.pot_top_diameter_cm,
      up.pot_bottom_diameter_cm,
      up.pot_height_cm,
      up.has_drainage_hole,
      up.pot_material,
      up.substrate_type,
      up.pot_profile_version,
      up.pot_profile_source,
      up.pot_profile_confidence,
      CAST(up.fertilization_guard_json AS CHAR) AS fertilization_guard_json_text,
      ds.health_status,
      ds.health_score,
      care.id AS care_location_id,
      care._openid AS care_openid,
      care.plant_id AS care_plant_id,
      care.user_id AS care_user_id,
      care.location_key AS care_location_key,
      care.city_name AS care_city_name,
      care.latitude AS care_latitude,
      care.longitude AS care_longitude,
      care.weather_location AS care_weather_location,
      care.source AS care_source
    FROM user_plant_instances up
    ${USER_PLANT_LATEST_DIAGNOSIS_SQL}
    LEFT JOIN LATERAL (
      SELECT id, _openid, plant_id, user_id, location_key, city_name, latitude, longitude,
             weather_location, source
      FROM plant_care_locations
      WHERE _openid = {{openid}} AND plant_id = up.id
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    ) care ON TRUE
    WHERE up._openid = {{openid}} AND up.id = {{id}}
    LIMIT 1
  `
  const result = await models.$runSQL(sql, { openid, id: Number(id) })
  const row = result?.data?.executeResultList?.[0]
  if (!row) {
    return null
  }

  const plantLookupId = resolveUserPlantCatalogLookupId(row)
  const [plant, wateringEvents, fertilizationHistory] = await Promise.all([
    plantLookupId ? getPlantCatalogById(plantLookupId) : Promise.resolve(null),
    getUserPlantWateringEvents(openid, id),
    getUserPlantFertilizationHistory(models, openid, id)
      .then(events => ({ events, status: 'available' }))
      .catch(error => ({
        events: null,
        status: error?.code === 'FERTILIZATION_HISTORY_UNAVAILABLE' ? 'unavailable' : 'unknown'
      }))
  ])
  const plantInstance = mapUserPlantInstanceRow(row, plant)
  // 事件、施肥历史和目录查询彼此独立，并行读取；缺失事件表仍不阻断详情主流程。
  plantInstance.wateringEvents = wateringEvents
  plantInstance.fertilizationEvents = fertilizationHistory.events
  plantInstance.fertilizationHistory = fertilizationHistory.events
  plantInstance.fertilizationHistoryStatus = fertilizationHistory.status
  const careLocation = mapUserPlantCareLocationFromRow(row)
  if (careLocation) {
    plantInstance.careLocationId = careLocation.careLocationId
    plantInstance.careLocation = careLocation
    plantInstance.locationKey = careLocation.locationKey
  }
  return plantInstance
}

async function getUserPlantWateringEvents(openid, id, limit = 10) {
  try {
    const result = await models.$runSQL(
      `SELECT id, event_date, amount_label, amount_ml, source, plan_id, created_at
       FROM user_watering_events
       WHERE _openid = {{openid}} AND user_plant_id = {{userPlantId}}
       ORDER BY event_date DESC LIMIT {{limit}}`,
      { openid, userPlantId: Number(id), limit: Number(limit) }
    )
    const rows = result?.data?.executeResultList || []
    return rows.map(row => ({
      id: row.id,
      date: row.event_date,
      watered: row.source !== 'reminder_undo',
      amount: row.amount_label,
      amountMl: row.amount_ml,
      source: row.source,
      planId: row.plan_id
    }))
  } catch {
    // 表不存在或查询失败时返回 null，不阻断主流程
    return null
  }
}

/**
 * 插入单条浇水事件到独立审计表。
 * @param {string} openid
 * @param {number} userPlantId - user_plant_instances.id
 * @param {object} event - { date, amount, amountMl, source, planId }
 */
async function insertWateringEvent(openid, userPlantId, event = {}) {
  const params = {
    openid,
    userPlantId: Number(userPlantId),
    eventDate: event.date || null,
    amountLabel: event.amount || event.amount_label || null,
    amountMl: event.amountMl || event.amount_ml || null,
    source: event.source || 'manual',
    planId: event.planId || event.plan_id || null
  }
  if (!params.eventDate) {
    return null
  }
  await models.$runSQL(
    `INSERT INTO user_watering_events (_openid, user_plant_id, event_date, amount_label, amount_ml, source, plan_id)
     VALUES ({{openid}}, {{userPlantId}}, {{eventDate}}, {{amountLabel}}, {{amountMl}}, {{source}}, {{planId}})`,
    params
  )
  return params
}

/**
 * 精简查询：仅取 planner 所需的属级浇水策略 + 温湿度 bounds + 盆型扩展。
 * 分两步查询避免跨表 JOIN collation 冲突：
 *   1. 从 user_plant_instances 取 plant_id / session_plant_id
 *   2. 用 getPlantCatalogById 取属级 watering 策略
 *   3. 从 user_plant_instances 主表盆型列取盆型档案（v2.1）
 * 不查 watering_events_json（planner 不需要），比 getUserPlantInstanceById 少一次 SQL。
 */
async function getUserPlantWateringStrategy(openid, id) {
  const result = await models.$runSQL(
    'SELECT plant_id, session_plant_id FROM user_plant_instances WHERE id = {{id}} AND _openid = {{openid}} LIMIT 1',
    { openid, id: Number(id) }
  )
  const row = result?.data?.executeResultList?.[0]
  if (!row) {
    return null
  }
  const lookupId = resolveUserPlantCatalogLookupId(row)
  if (!lookupId) {
    return null
  }
  const plant = await getPlantCatalogById(lookupId)
  if (!plant) {
    return null
  }
  const potProfile = await getUserPlantCareExtension(openid, id)
  return {
    watering: plant.watering || null,
    wateringQuantization: plant.wateringQuantization || null,
    temperatureMin: plant.temperatureMin ?? null,
    temperatureMax: plant.temperatureMax ?? null,
    humidityMin: plant.humidityMin ?? null,
    humidityMax: plant.humidityMax ?? null,
    potProfile
  }
}

async function listUserPlantInstances(openid, options = {}) {
  if (options.includeEnrichments === true) {
    return listUserPlantInstancesWithEnrichmentsFast(openid, options)
  }
  // 仅保留旧富化实现作为排障回放入口；线上列表一律走快速批量路径。
  if (options.includeEnrichments === 'legacy') {
    return listUserPlantInstancesWithEnrichments(openid, options)
  }
  return listUserPlantInstancesLegacy(openid, options)
}

async function listUserPlantInstancesLegacy(openid, { page = 1, pageSize = 20 } = {}) {
  const limit = Number(pageSize)
  const offset = (Number(page) - 1) * limit
  const displayableIdentityCondition = displayableUserPlantSqlCondition('up')
  const sql = `
    SELECT
      up.id,
      up.record_version,
      up.plant_id,
      up.plant_identity_id,
      up.session_plant_id,
      up.canonical_name,
      up.recognized_name,
      up.source_type,
      up.recognition_type,
      up.recognition_confidence,
      up.identity_resolution_status,
      up.visual_call_batch_id,
      up.nickname,
      up.location,
      up.plant_date,
      up.notes,
      CAST(up.light_environment_json AS CHAR) AS light_environment_json_text,
      CAST(up.air_environment_json AS CHAR) AS air_environment_json_text,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      up.plant_genus,
      up.plant_family_en,
      up.plant_latin_name,
      up.pot_top_diameter_cm,
      up.pot_bottom_diameter_cm,
      up.pot_height_cm,
      up.has_drainage_hole,
      up.pot_material,
      up.substrate_type,
      up.pot_profile_version,
      up.pot_profile_source,
      up.pot_profile_confidence,
      CAST(up.fertilization_guard_json AS CHAR) AS fertilization_guard_json_text,
      ds.health_status,
      ds.health_score
    FROM user_plant_instances up
    ${USER_PLANT_LATEST_DIAGNOSIS_SQL}
    WHERE up._openid = {{openid}}
      AND ${displayableIdentityCondition}
    ORDER BY up.created_at DESC
    LIMIT {{limit}} OFFSET {{offset}}
  `
  const countSql = `SELECT COUNT(*) AS total
     FROM user_plant_instances up
     WHERE up._openid = {{openid}}
       AND ${displayableIdentityCondition}`
  // 总数与当前页互不依赖，并行发起可省掉一次 CloudBase SQL 往返。
  const [countResult, result] = await Promise.all([
    models.$runSQL(countSql, { openid }),
    models.$runSQL(sql, { openid, limit, offset })
  ])
  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  const rows = (result?.data?.executeResultList || []).filter(hasDisplayableUserPlantIdentity)
  const plantIds = Array.from(
    new Set(rows.map(row => resolveUserPlantCatalogLookupId(row)).filter(Boolean))
  )
  const plantMap = await getPlantCatalogByIds(plantIds)

  return {
    list: rows.map(row =>
      mapUserPlantInstanceRow(row, plantMap.get(resolveUserPlantCatalogLookupId(row)) || null)
    ),
    total,
    page: Number(page),
    pageSize: limit,
    hasMore: offset + rows.length < total
  }
}

const USER_PLANT_CATALOG_LOOKUP_SQL = `COALESCE(
  NULLIF(NULLIF(NULLIF(TRIM(up.plant_identity_id), ''), 'null'), 'undefined') COLLATE utf8mb4_unicode_ci,
  NULLIF(NULLIF(NULLIF(TRIM(up.plant_id), ''), 'null'), 'undefined') COLLATE utf8mb4_unicode_ci,
  NULLIF(NULLIF(NULLIF(TRIM(up.session_plant_id), ''), 'null'), 'undefined') COLLATE utf8mb4_unicode_ci
)`

function buildUserPlantIdInClause(ids = []) {
  return Array.from(
    new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))
  ).join(',')
}

function mapFirstByPlantId(rows, key) {
  const map = new Map()
  for (const row of rows || []) {
    const plantId = Number(row?.[key])
    if (!Number.isInteger(plantId) || map.has(plantId)) {
      continue
    }
    map.set(plantId, row)
  }
  return map
}

async function listUserPlantCareRows(openid, plantIds = []) {
  const inClause = buildUserPlantIdInClause(plantIds)
  if (!inClause) {
    return []
  }
  const result = await models.$runSQL(
    `
      SELECT id, _openid, plant_id, user_id, location_key, city_name, latitude, longitude,
             weather_location, source
      FROM (
        SELECT id, _openid, plant_id, user_id, location_key, city_name, latitude, longitude,
               weather_location, source,
               ROW_NUMBER() OVER (PARTITION BY plant_id ORDER BY updated_at DESC, id DESC) AS row_rank
        FROM plant_care_locations
        WHERE _openid = {{openid}} AND plant_id IN (${inClause})
      ) latest_care
      WHERE row_rank = 1
    `,
    { openid }
  )
  return result?.data?.executeResultList || []
}

async function listUserPlantWateringReminderRows(openid, plantIds = []) {
  const inClause = buildUserPlantIdInClause(plantIds)
  if (!inClause) {
    return []
  }
  const result = await models.$runSQL(
    `
      SELECT id, user_plant_id, plan_id, reminder_type, status, last_watered,
             next_water_date, next_time, created_at, updated_at
      FROM (
        SELECT id, user_plant_id, plan_id, reminder_type, status, last_watered,
               next_water_date, next_time, created_at, updated_at,
               ROW_NUMBER() OVER (PARTITION BY user_plant_id ORDER BY next_time DESC, created_at DESC, id DESC) AS row_rank
        FROM user_watering_reminder_events
        WHERE _openid = {{openid}}
          AND user_plant_id IN (${inClause})
          AND reminder_type = 'water'
          AND status = 'active'
      ) latest_watering
      WHERE row_rank = 1
    `,
    { openid }
  )
  return result?.data?.executeResultList || []
}

async function listUserPlantFertilizationReminderRows(openid, plantIds = []) {
  const inClause = buildUserPlantIdInClause(plantIds)
  if (!inClause) {
    return []
  }
  const result = await models.$runSQL(
    `
      SELECT id, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month,
             last_applied_date, last_date_source, next_check_date, next_time,
             completed_date, expires_at, created_at, updated_at
      FROM (
        SELECT id, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month,
               last_applied_date, last_date_source, next_check_date, next_time,
               completed_date, expires_at, created_at, updated_at,
               ROW_NUMBER() OVER (PARTITION BY user_plant_id ORDER BY created_at DESC, id DESC) AS row_rank
        FROM user_fertilization_reminder_events
        WHERE _openid = {{openid}}
          AND user_plant_id IN (${inClause})
          AND status = 'active'
      ) latest_fertilization
      WHERE row_rank = 1
    `,
    { openid }
  )
  return result?.data?.executeResultList || []
}

async function listUserPlantLatestDiagnosisRows(openid, plantIds = []) {
  const inClause = buildUserPlantIdInClause(plantIds)
  if (!inClause) {
    return []
  }
  const result = await models.$runSQL(
    `
      SELECT user_plant_id, health_status, health_score
      FROM (
        SELECT user_plant_id, health_status, health_score,
               ROW_NUMBER() OVER (PARTITION BY user_plant_id ORDER BY created_at DESC, diagnosis_id DESC) AS row_rank
        FROM diagnosis_sessions
        WHERE _openid = {{openid}} AND user_plant_id IN (${inClause})
      ) latest_diagnosis
      WHERE row_rank = 1
    `,
    { openid }
  )
  return result?.data?.executeResultList || []
}

async function listUserPlantInstancesWithEnrichmentsFast(openid, { page = 1, pageSize = 20 } = {}) {
  const limit = Math.max(1, Number(pageSize) || 20)
  const normalizedPage = Math.max(1, Number(page) || 1)
  const offset = (normalizedPage - 1) * limit
  const displayableIdentityCondition = displayableUserPlantSqlCondition('up')
  const baseSql = `
    SELECT
      up.id,
      up.record_version,
      up.plant_id,
      up.plant_identity_id,
      up.session_plant_id,
      up.canonical_name,
      up.recognized_name,
      up.source_type,
      up.recognition_type,
      up.recognition_confidence,
      up.identity_resolution_status,
      up.visual_call_batch_id,
      up.nickname,
      up.location,
      up.plant_date,
      up.notes,
      CAST(up.light_environment_json AS CHAR) AS light_environment_json_text,
      CAST(up.air_environment_json AS CHAR) AS air_environment_json_text,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      up.plant_genus,
      up.plant_family_en,
      up.plant_latin_name,
      up.pot_top_diameter_cm,
      up.pot_bottom_diameter_cm,
      up.pot_height_cm,
      up.has_drainage_hole,
      up.pot_material,
      up.substrate_type,
      up.pot_profile_version,
      up.pot_profile_source,
      up.pot_profile_confidence,
      CAST(up.fertilization_guard_json AS CHAR) AS fertilization_guard_json_text,
      COUNT(*) OVER() AS total_count
    FROM user_plant_instances up
    WHERE up._openid = {{openid}}
      AND ${displayableIdentityCondition}
    ORDER BY up.created_at DESC, up.id DESC
    LIMIT {{limit}} OFFSET {{offset}}
  `
  const baseResult = await models.$runSQL(baseSql, { openid, limit, offset })
  const rows = (baseResult?.data?.executeResultList || []).filter(hasDisplayableUserPlantIdentity)
  let total = Number(rows[0]?.total_count || 0)
  if (!rows.length) {
    const countResult = await models.$runSQL(
      `
        SELECT COUNT(*) AS total
        FROM user_plant_instances up
        WHERE up._openid = {{openid}}
          AND ${displayableIdentityCondition}
      `,
      { openid }
    )
    total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  }
  const plantIds = rows.map(row => Number(row.id)).filter(Number.isInteger)
  const catalogIds = Array.from(new Set(rows.map(resolveUserPlantCatalogLookupId).filter(Boolean)))
  const [catalogMap, careRows, wateringRows, fertilizationRows, diagnosisRows] = await Promise.all([
    getPlantCatalogByIds(catalogIds, { summary: true }),
    listUserPlantCareRows(openid, plantIds),
    listUserPlantWateringReminderRows(openid, plantIds),
    listUserPlantFertilizationReminderRows(openid, plantIds),
    listUserPlantLatestDiagnosisRows(openid, plantIds)
  ])
  const careByPlantId = mapFirstByPlantId(careRows, 'plant_id')
  const wateringByPlantId = mapFirstByPlantId(wateringRows, 'user_plant_id')
  const fertilizationByPlantId = mapFirstByPlantId(fertilizationRows, 'user_plant_id')
  const diagnosisByPlantId = mapFirstByPlantId(diagnosisRows, 'user_plant_id')

  return {
    list: rows.map(row => {
      const diagnosis = diagnosisByPlantId.get(Number(row.id)) || {}
      const item = mapUserPlantInstanceRow(
        { ...row, health_status: diagnosis.health_status, health_score: diagnosis.health_score },
        catalogMap.get(resolveUserPlantCatalogLookupId(row)) || null
      )
      item.fertilizationMonthly = compactFertilizationMonthlyForList(item.fertilizationMonthly)
      item.__listEnrichment = {
        careLocationRow: careByPlantId.get(Number(row.id)) || null,
        wateringReminderRow: wateringByPlantId.get(Number(row.id)) || null,
        fertilizationReminderRow: fertilizationByPlantId.get(Number(row.id)) || null
      }
      return item
    }),
    total,
    page: normalizedPage,
    pageSize: limit,
    hasMore: offset + rows.length < total
  }
}

async function listUserPlantInstancesWithEnrichments(openid, { page = 1, pageSize = 20 } = {}) {
  const limit = Number(pageSize)
  const offset = (Number(page) - 1) * limit
  const displayableIdentityCondition = displayableUserPlantSqlCondition('up')
  const sql = `
    SELECT
      up.id,
      up.record_version,
      up.plant_id,
      up.plant_identity_id,
      up.session_plant_id,
      up.canonical_name,
      up.recognized_name,
      up.source_type,
      up.recognition_type,
      up.recognition_confidence,
      up.identity_resolution_status,
      up.visual_call_batch_id,
      up.nickname,
      up.location,
      up.plant_date,
      up.notes,
      CAST(up.light_environment_json AS CHAR) AS light_environment_json_text,
      CAST(up.air_environment_json AS CHAR) AS air_environment_json_text,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      up.plant_genus,
      up.plant_family_en,
      up.plant_latin_name,
      up.pot_top_diameter_cm,
      up.pot_bottom_diameter_cm,
      up.pot_height_cm,
      up.has_drainage_hole,
      up.pot_material,
      up.substrate_type,
      up.pot_profile_version,
      up.pot_profile_source,
      up.pot_profile_confidence,
      CAST(up.fertilization_guard_json AS CHAR) AS fertilization_guard_json_text,
      ds.health_status,
      ds.health_score,
      cat.plant_identity_id AS catalog_plant_identity_id,
      cat.session_plant_id AS catalog_session_plant_id,
      cat.canonical_identity_name AS catalog_canonical_identity_name,
      cat.canonical_identity_name_cn AS catalog_canonical_identity_name_cn,
      cat.canonical_identity_name_en AS catalog_canonical_identity_name_en,
      cat.primary_display_name AS catalog_primary_display_name,
      cat.genus_name AS catalog_genus_name,
      cat.cover_image_ref AS catalog_cover_image_ref,
      cat.fertilizing_monthly_strategy_json AS catalog_fertilizing_monthly_strategy_json,
      care.id AS care_location_id,
      care._openid AS care_openid,
      care.plant_id AS care_plant_id,
      care.user_id AS care_user_id,
      care.location_key AS care_location_key,
      care.city_name AS care_city_name,
      care.latitude AS care_latitude,
      care.longitude AS care_longitude,
      care.weather_location AS care_weather_location,
      care.source AS care_source,
      water.id AS watering_reminder_id,
      water.user_plant_id AS watering_reminder_user_plant_id,
      water.plan_id AS watering_reminder_plan_id,
      water.reminder_type AS watering_reminder_type,
      water.status AS watering_reminder_status,
      water.last_watered AS watering_reminder_last_watered,
      water.next_water_date AS watering_reminder_next_water_date,
      water.next_time AS watering_reminder_next_time,
      water.created_at AS watering_reminder_created_at,
      water.updated_at AS watering_reminder_updated_at,
      fert.id AS fertilization_reminder_id,
      fert.user_plant_id AS fertilization_reminder_user_plant_id,
      fert.plan_id AS fertilization_reminder_plan_id,
      fert.status AS fertilization_reminder_status,
      fert.reminder_kind AS fertilization_reminder_kind,
      fert.fertilizer_type AS fertilization_reminder_fertilizer_type,
      fert.rule_month AS fertilization_reminder_rule_month,
      fert.last_applied_date AS fertilization_reminder_last_applied_date,
      fert.last_date_source AS fertilization_reminder_last_date_source,
      fert.next_check_date AS fertilization_reminder_next_check_date,
      fert.next_time AS fertilization_reminder_next_time,
      fert.completed_date AS fertilization_reminder_completed_date,
      fert.expires_at AS fertilization_reminder_expires_at,
      fert.created_at AS fertilization_reminder_created_at,
      fert.updated_at AS fertilization_reminder_updated_at,
      COUNT(*) OVER() AS total_count
    FROM user_plant_instances up
    LEFT JOIN diagnosis_sessions ds
      ON ds.user_plant_id = up.id
     AND ds._openid = up._openid
     AND ds.created_at = (
       SELECT MAX(latest_ds.created_at)
       FROM diagnosis_sessions latest_ds
       WHERE latest_ds.user_plant_id = up.id
         AND latest_ds._openid = up._openid
     )
     AND ds.diagnosis_id = (
       SELECT MAX(tie_break_ds.diagnosis_id)
       FROM diagnosis_sessions tie_break_ds
       WHERE tie_break_ds.user_plant_id = up.id
         AND tie_break_ds._openid = up._openid
         AND tie_break_ds.created_at = (
           SELECT MAX(tie_break_created.created_at)
           FROM diagnosis_sessions tie_break_created
           WHERE tie_break_created.user_plant_id = up.id
             AND tie_break_created._openid = up._openid
         )
     )
    LEFT JOIN LATERAL (
      SELECT
        pie.plant_identity_id,
        pie.session_plant_id,
        pie.canonical_identity_name,
        pie.canonical_identity_name_cn,
        pie.canonical_identity_name_en,
        pie.primary_display_name,
        pie.identity_level,
        pie.family_name_canonical,
        pie.family_name_cn,
        pie.family_name_en,
        pie.genus_name,
        pie.cover_image_ref,
        gcp.fertilizing_monthly_strategy_json,
        pie.review_status AS identity_review_status
      FROM plant_identity_entities pie
      LEFT JOIN genus_care_profiles gcp
        ON gcp.genus_name = pie.genus_name
       AND gcp.family_name_canonical = pie.family_name_canonical
       AND gcp.is_active = 1
      WHERE pie.is_active = 1
        AND (
          pie.plant_identity_id COLLATE utf8mb4_unicode_ci = ${USER_PLANT_CATALOG_LOOKUP_SQL}
          OR pie.session_plant_id COLLATE utf8mb4_unicode_ci = ${USER_PLANT_CATALOG_LOOKUP_SQL}
        )
      ORDER BY
        CASE
          WHEN pie.session_plant_id COLLATE utf8mb4_unicode_ci = ${USER_PLANT_CATALOG_LOOKUP_SQL}
          THEN 0 ELSE 1
        END,
        pie.primary_display_name,
        pie.plant_identity_id
      LIMIT 1
    ) cat ON TRUE
    LEFT JOIN plant_care_locations care
      ON care._openid = {{openid}} AND care.plant_id = up.id
    LEFT JOIN LATERAL (
      SELECT
        id, user_plant_id, plan_id, reminder_type, status, last_watered, next_water_date,
        next_time,
        created_at, updated_at
      FROM user_watering_reminder_events
      WHERE _openid = {{openid}}
        AND user_plant_id = up.id
        AND reminder_type = 'water'
        AND status = 'active'
      ORDER BY next_time DESC, created_at DESC
      LIMIT 1
    ) water ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        id, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month,
        last_applied_date, last_date_source, next_check_date, next_time,
        completed_date, expires_at, created_at, updated_at
      FROM user_fertilization_reminder_events
      WHERE _openid = {{openid}}
        AND user_plant_id = up.id
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    ) fert ON TRUE
    WHERE up._openid = {{openid}}
      AND ${displayableIdentityCondition}
    ORDER BY up.created_at DESC
    LIMIT {{limit}} OFFSET {{offset}}
  `
  const result = await models.$runSQL(sql, { openid, limit, offset })
  const rows = (result?.data?.executeResultList || []).filter(hasDisplayableUserPlantIdentity)
  let total = Number(rows[0]?.total_count || 0)
  if (!rows.length) {
    const countResult = await models.$runSQL(
      `SELECT COUNT(*) AS total
       FROM user_plant_instances up
       WHERE up._openid = {{openid}}
         AND ${displayableIdentityCondition}`,
      { openid }
    )
    total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  }

  return {
    list: rows.map(row => {
      const item = mapUserPlantInstanceRow(row)
      // 列表仅返回月表摘要；打开施肥时间表时由详情接口读取完整 12 个月明细。
      item.fertilizationMonthly = compactFertilizationMonthlyForList(item.fertilizationMonthly)
      item.__listEnrichment = {
        careLocationRow: row.care_location_id
          ? {
              id: row.care_location_id,
              _openid: row.care_openid,
              plant_id: row.care_plant_id,
              user_id: row.care_user_id,
              location_key: row.care_location_key,
              city_name: row.care_city_name,
              latitude: row.care_latitude,
              longitude: row.care_longitude,
              weather_location: row.care_weather_location,
              source: row.care_source
            }
          : null,
        wateringReminderRow: row.watering_reminder_id
          ? {
              id: row.watering_reminder_id,
              user_plant_id: row.watering_reminder_user_plant_id,
              plan_id: row.watering_reminder_plan_id,
              reminder_type: row.watering_reminder_type,
              status: row.watering_reminder_status,
              last_watered: row.watering_reminder_last_watered,
              next_water_date: row.watering_reminder_next_water_date,
              next_time: row.watering_reminder_next_time,
              watering_events_json_text: row.watering_reminder_events_json_text,
              planner_result_json_text: row.watering_reminder_planner_json_text,
              calendar_payload_json_text: row.watering_reminder_calendar_json_text,
              created_at: row.watering_reminder_created_at,
              updated_at: row.watering_reminder_updated_at
            }
          : null,
        fertilizationReminderRow: row.fertilization_reminder_id
          ? {
              id: row.fertilization_reminder_id,
              user_plant_id: row.fertilization_reminder_user_plant_id,
              plan_id: row.fertilization_reminder_plan_id,
              status: row.fertilization_reminder_status,
              reminder_kind: row.fertilization_reminder_kind,
              fertilizer_type: row.fertilization_reminder_fertilizer_type,
              rule_month: row.fertilization_reminder_rule_month,
              rule_snapshot_json_text: row.fertilization_reminder_rule_snapshot_json_text,
              last_applied_date: row.fertilization_reminder_last_applied_date,
              last_date_source: row.fertilization_reminder_last_date_source,
              next_check_date: row.fertilization_reminder_next_check_date,
              next_time: row.fertilization_reminder_next_time,
              completed_date: row.fertilization_reminder_completed_date,
              calendar_payload_json_text: row.fertilization_reminder_calendar_json_text,
              expires_at: row.fertilization_reminder_expires_at,
              created_at: row.fertilization_reminder_created_at,
              updated_at: row.fertilization_reminder_updated_at
            }
          : null
      }
      return item
    }),
    total,
    page: Number(page),
    pageSize: limit,
    hasMore: offset + rows.length < total
  }
}

async function updateUserPlantInstance(openid, id, updates = {}) {
  const existing = await getUserPlantInstanceById(openid, id)
  if (!existing) {
    throw new Error('植物不存在或无权限修改')
  }

  const requestedRecordVersion = Number(updates.recordVersion)
  if (updates.recordVersion !== undefined && (!Number.isInteger(requestedRecordVersion) || requestedRecordVersion < 1)) {
    const error = new Error('植物版本无效')
    error.code = 'USER_PLANT_VERSION_INVALID'
    error.statusCode = 400
    throw error
  }
  if (updates.recordVersion !== undefined && requestedRecordVersion !== Number(existing.recordVersion || 1)) {
    const error = new Error('植物信息已在其他设备更新，请刷新后再试')
    error.code = 'USER_PLANT_VERSION_CONFLICT'
    error.statusCode = 409
    throw error
  }

  const fields = []
  const params = { openid, id: Number(id) }
  let pendingPhotoFileIds = []

  if (updates.nickname !== undefined || updates.nickName !== undefined) {
    fields.push('nickname = {{nickname}}')
    params.nickname = updates.nickname !== undefined ? updates.nickname : updates.nickName
  }
  if (updates.recognizedName !== undefined) {
    fields.push('recognized_name = {{recognizedName}}')
    params.recognizedName = updates.recognizedName
  }
  if (updates.location !== undefined) {
    fields.push('location = {{location}}')
    params.location = updates.location
  }
  if (hasOwnField(updates, 'plantDate')) {
    fields.push("plant_date = NULLIF({{plantDate}}, '')")
    params.plantDate = toNullableDateParam(updates.plantDate)
  }
  if (hasOwnField(updates, 'notes')) {
    fields.push('notes = {{notes}}')
    params.notes = normalizeUserPlantNotes(updates.notes)
  }
  if (updates.photos !== undefined) {
    const ownedPhotos = await assertOwnedPlantImagesForPlant({
      openid,
      plantId: id,
      fileIds: updates.photos
    })
    pendingPhotoFileIds = ownedPhotos.temporaryFileIds
    fields.push('photos = {{photos}}')
    params.photos = ownedPhotos.fileIds.length ? JSON.stringify(ownedPhotos.fileIds) : null
  }
  if (hasOwnField(updates, 'lightEnvironment')) {
    fields.push('light_environment_json = {{lightEnvironmentJson}}')
    params.lightEnvironmentJson = stringifyNullableJson(updates.lightEnvironment)
  }
  if (hasOwnField(updates, 'airEnvironment')) {
    const airEnvironmentProfile = normalizeAirEnvironmentProfile(
      updates.airEnvironment,
      updates.locationBinding || updates.airEnvironmentLocationBinding
    )
    if (updates.airEnvironment !== null && !airEnvironmentProfile) {
      throw new Error('空气环境信息不完整')
    }
    fields.push('air_environment_json = {{airEnvironmentJson}}')
    params.airEnvironmentJson = stringifyNullableJson(airEnvironmentProfile)
  }
  if (updates.lastWatered !== undefined) {
    fields.push('last_watered = {{lastWatered}}')
    params.lastWatered = updates.lastWatered
  }
  if (updates.nextWater !== undefined) {
    fields.push('next_water = {{nextWater}}')
    params.nextWater = updates.nextWater
  }
  if (hasOwnField(updates, 'wateringEvents')) {
    // 事件写入独立审计表，不再覆盖写 JSON 列
    params.wateringEvents = updates.wateringEvents
  }

  // 盆型档案字段检测（同时兼容 camelCase / snake_case）
  const hasPotProfileUpdate =
    hasOwnField(updates, 'potTopDiameterCm') ||
    hasOwnField(updates, 'pot_top_diameter_cm') ||
    hasOwnField(updates, 'potBottomDiameterCm') ||
    hasOwnField(updates, 'pot_bottom_diameter_cm') ||
    hasOwnField(updates, 'potHeightCm') ||
    hasOwnField(updates, 'pot_height_cm') ||
    hasOwnField(updates, 'hasDrainageHole') ||
    hasOwnField(updates, 'has_drainage_hole') ||
    hasOwnField(updates, 'potMaterial') ||
    hasOwnField(updates, 'pot_material') ||
    hasOwnField(updates, 'substrateType') ||
    hasOwnField(updates, 'substrate_type') ||
    hasOwnField(updates, 'source') ||
    hasOwnField(updates, 'confidence')

  if (!fields.length && params.wateringEvents === undefined && !hasPotProfileUpdate) {
    return existing
  }

  // 主 UPDATE 不含 watering_events_json，避免列不存在时整条 SQL 失败
  // （last_watered / next_water 等字段必须能正常写入）
  let updated
  if (fields.length) {
    if (updates.recordVersion !== undefined) {
      fields.push('record_version = record_version + 1')
      params.recordVersion = requestedRecordVersion
    }
    const sql = `
      UPDATE user_plant_instances
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = {{id}} AND _openid = {{openid}}
      ${updates.recordVersion !== undefined ? 'AND record_version = {{recordVersion}}' : ''}
    `
    const writeResult = await models.$runSQL(sql, params)
    const rawAffectedRows =
      writeResult?.data?.rowsAffected ?? writeResult?.data?.affectedRows
    const affectedRows = rawAffectedRows === undefined ? null : Number(rawAffectedRows)
    if (updates.recordVersion !== undefined && affectedRows === 0) {
      const error = new Error('植物信息已在其他设备更新，请刷新后再试')
      error.code = 'USER_PLANT_VERSION_CONFLICT'
      error.statusCode = 409
      throw error
    }
    updated = await getUserPlantInstanceById(openid, id)
  } else {
    updated = existing
  }

  // 浇水事件逐条 INSERT 到独立审计表
  if (params.wateringEvents !== undefined && Array.isArray(params.wateringEvents)) {
    for (const ev of params.wateringEvents) {
      if (ev?.watered === false || ev?.didWater === false || ev?.action === 'none') {
        continue
      }
      try {
        await insertWateringEvent(openid, id, ev)
      } catch {
        // 单条事件写入失败不阻断其余事件
      }
    }
    updated = await getUserPlantInstanceById(openid, id)
  }

  // 盆型档案单独 try/catch 写入，列不存在时跳过而不阻断主流程
  // 保留 pot_profile_version = pot_profile_version + 1 的版本自增语义
  if (hasPotProfileUpdate) {
    const potParams = {
      openid,
      id: Number(id),
      potTopDiameterCm: toNullableDecimal(updates.potTopDiameterCm ?? updates.pot_top_diameter_cm),
      potBottomDiameterCm: toNullableDecimal(
        updates.potBottomDiameterCm ?? updates.pot_bottom_diameter_cm
      ),
      potHeightCm: toNullableDecimal(updates.potHeightCm ?? updates.pot_height_cm),
      hasDrainageHole:
        normalizeNullableString(updates.hasDrainageHole ?? updates.has_drainage_hole) || 'unknown',
      potMaterial:
        normalizeNullableString(updates.potMaterial ?? updates.pot_material) || 'unknown',
      substrateType:
        normalizeNullableString(updates.substrateType ?? updates.substrate_type) || 'unknown',
      source: normalizeNullableString(updates.source) || 'user',
      confidence: normalizeNullableString(updates.confidence) || 'normal'
    }
    await models.$runSQL(
      `UPDATE user_plant_instances
      SET
        pot_top_diameter_cm = NULLIF({{potTopDiameterCm}}, ''),
        pot_bottom_diameter_cm = NULLIF({{potBottomDiameterCm}}, ''),
        pot_height_cm = NULLIF({{potHeightCm}}, ''),
        has_drainage_hole = {{hasDrainageHole}},
        pot_material = {{potMaterial}},
        substrate_type = {{substrateType}},
        pot_profile_source = {{source}},
        pot_profile_confidence = {{confidence}},
        pot_profile_version = pot_profile_version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = {{id}} AND _openid = {{openid}}`,
      potParams
    )
    updated = await getUserPlantInstanceById(openid, id)
  }

  if (pendingPhotoFileIds.length) {
    await bindOwnedTemporaryPlantImages({
      openid,
      plantId: id,
      fileIds: pendingPhotoFileIds
    })
    updated = await getUserPlantInstanceById(openid, id)
  }

  return updated
}

async function deleteUserPlantInstance(openid, id) {
  const existing = await getUserPlantInstanceById(openid, id)
  if (!existing) {
    throw new Error('植物不存在或无权限删除')
  }
  await models.$runSQL(
    'DELETE FROM user_plant_instances WHERE id = {{id}} AND _openid = {{openid}}',
    {
      id: Number(id),
      openid
    }
  )
  return true
}

/* ---------- 用户植物盆型档案（v2.1，落用户植物主表 user_plant_instances） ---------- */

/**
 * 读取用户植物盆型档案。
 * 盆型信息直接存在 user_plant_instances 主表列上，不再使用独立扩展表。
 * 列不存在时返回默认档案，不阻断主流程。
 */
async function getUserPlantCareExtension(openid, userPlantId) {
  try {
    const result = await models.$runSQL(
      `SELECT
        pot_top_diameter_cm,
        pot_bottom_diameter_cm,
        pot_height_cm,
        has_drainage_hole,
        pot_material,
        substrate_type,
        pot_profile_version,
        pot_profile_source,
        pot_profile_confidence
      FROM user_plant_instances
      WHERE _openid = {{openid}} AND id = {{userPlantId}}
      LIMIT 1`,
      { openid, userPlantId: Number(userPlantId) }
    )
    const row = result?.data?.executeResultList?.[0]
    if (!row) {
      return buildDefaultPotProfile()
    }
    return mapCareExtensionRow(row)
  } catch {
    // 列不存在或查询失败时返回默认档案
    return buildDefaultPotProfile()
  }
}

function mapCareExtensionRow(row) {
  // substrate_type 可能是 JSON（多选+比例）或单值字符串
  const substrateType = row.substrate_type || 'unknown'
  let substrateComposition = null
  if (typeof substrateType === 'string' && substrateType.startsWith('[')) {
    try {
      substrateComposition = JSON.parse(substrateType)
    } catch {
      substrateComposition = null
    }
  }

  return {
    potTopDiameterCm:
      row.pot_top_diameter_cm === null || row.pot_top_diameter_cm === undefined
        ? null
        : Number(row.pot_top_diameter_cm),
    potBottomDiameterCm:
      row.pot_bottom_diameter_cm === null || row.pot_bottom_diameter_cm === undefined
        ? null
        : Number(row.pot_bottom_diameter_cm),
    potHeightCm:
      row.pot_height_cm === null || row.pot_height_cm === undefined
        ? null
        : Number(row.pot_height_cm),
    hasDrainageHole:
      Number(row.pot_top_diameter_cm) > 0 ||
      Number(row.pot_bottom_diameter_cm) > 0 ||
      Number(row.pot_height_cm) > 0
        ? row.has_drainage_hole || 'unknown'
        : 'unknown',
    potMaterial: row.pot_material || 'unknown',
    substrateType,
    substrateComposition,
    profileVersion: Number(row.pot_profile_version || 1),
    source: row.pot_profile_source || 'user',
    confidence: row.pot_profile_confidence || 'normal'
  }
}

function buildDefaultPotProfile() {
  return {
    potTopDiameterCm: null,
    potBottomDiameterCm: null,
    potHeightCm: null,
    hasDrainageHole: 'unknown',
    potMaterial: 'unknown',
    substrateType: 'unknown',
    profileVersion: 1,
    source: 'default',
    confidence: 'low'
  }
}

async function recordIdentifySession({
  identifyId,
  openid,
  imageUrl,
  provider = 'baidu',
  recognizedName,
  recognizedType,
  confidence,
  canonicalPlantId = null,
  matchType = null,
  rawPayload = null,
  candidateMatches = null
}) {
  let normalizedCanonicalPlantId =
    canonicalPlantId === null || canonicalPlantId === undefined || canonicalPlantId === ''
      ? null
      : String(canonicalPlantId).trim()

  if (normalizedCanonicalPlantId) {
    const catalogPlant = await getPlantCatalogById(normalizedCanonicalPlantId)
    if (!catalogPlant) {
      normalizedCanonicalPlantId = null
    } else {
      normalizedCanonicalPlantId = catalogPlant.id || normalizedCanonicalPlantId
    }
  }

  const sql = `
    INSERT INTO identify_sessions (
      identify_id, _openid, image_url, provider, recognized_name, recognized_type,
      confidence, canonical_plant_id, match_type, raw_payload, candidate_matches
    ) VALUES (
      {{identifyId}}, {{openid}}, {{imageUrl}}, {{provider}}, {{recognizedName}}, {{recognizedType}},
      {{confidence}}, NULLIF({{canonicalPlantId}}, ''), {{matchType}}, {{rawPayload}}, {{candidateMatches}}
    )
  `
  await models.$runSQL(sql, {
    identifyId,
    openid,
    imageUrl,
    provider,
    recognizedName,
    recognizedType,
    confidence,
    canonicalPlantId: normalizedCanonicalPlantId || '',
    matchType,
    rawPayload: rawPayload ? JSON.stringify(rawPayload) : null,
    candidateMatches: candidateMatches ? JSON.stringify(candidateMatches) : null
  })
}

async function listDiagnosisSessions(openid, { page = 1, pageSize = 10, userPlantId = null } = {}) {
  const limit = Number(pageSize)
  const offset = (Number(page) - 1) * limit
  const conditions = ['ds._openid = {{openid}}']
  const params = { openid, limit, offset }

  if (userPlantId) {
    conditions.push('ds.user_plant_id = {{userPlantId}}')
    params.userPlantId = Number(userPlantId)
  }

  const whereSql = conditions.join(' AND ')
  const listSql = `
    SELECT
      ds.diagnosis_id,
      ds.user_plant_id,
      ds.plant_id,
      ds.health_score,
      ds.health_status,
      ds.top_problem_key,
      ds.top_problem_score,
      ds.reliability_score,
      ds.needs_follow_up,
      ds.ai_summary,
      ds.final_problem_cn,
      ds.image_url,
      ds.user_description,
      ds.created_at,
      up.nickname AS plant_nickname,
      up.canonical_name AS canonical_name
    FROM diagnosis_sessions ds
    LEFT JOIN user_plant_instances up ON up.id = ds.user_plant_id
    WHERE ${whereSql}
    ORDER BY ds.created_at DESC
    LIMIT {{limit}} OFFSET {{offset}}
  `
  const countSql = `SELECT COUNT(*) AS total FROM diagnosis_sessions ds WHERE ${whereSql}`

  const listResult = await models.$runSQL(listSql, params)
  const countResult = await models.$runSQL(countSql, params)

  return {
    list: (listResult?.data?.executeResultList || []).map(row => ({
      _id: row.diagnosis_id,
      plantId: row.user_plant_id,
      plantCatalogId: row.plant_id,
      plantName: row.plant_nickname || row.canonical_name || '未知植物',
      mainIssue: row.final_problem_cn || row.top_problem_key || null,
      summary: normalizeReliabilitySummary(row.ai_summary || ''),
      imageUrl: row.image_url || '',
      healthScore:
        row.health_score === null || row.health_score === undefined
          ? null
          : Number(row.health_score),
      healthStatus: row.health_status || 'unknown',
      reliabilityScore:
        row.reliability_score === null || row.reliability_score === undefined
          ? null
          : clampProbability(row.reliability_score),
      needsFollowUp: Boolean(Number(row.needs_follow_up || 0)),
      createdAt: row.created_at
    })),
    total: Number(countResult?.data?.executeResultList?.[0]?.total || 0),
    page: Number(page),
    pageSize: limit,
    hasMore:
      offset + (listResult?.data?.executeResultList || []).length <
      Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  }
}

async function resolvePlantContext({ openid, plantId = null, userPlantId = null }) {
  if (userPlantId) {
    const userPlant = await getUserPlantInstanceById(openid, userPlantId)
    if (!userPlant) {
      throw new Error('用户植物不存在')
    }
    const plant = userPlant.plantId ? await getPlantCatalogById(userPlant.plantId) : null
    return {
      userPlantId: Number(userPlantId),
      plantId: userPlant.plantId || plantId,
      plantName: userPlant.canonicalName || userPlant.displayName,
      genus: plant?.genus || userPlant.genus || ''
    }
  }

  if (!plantId) {
    throw new Error('缺少 plantId 或 userPlantId')
  }

  const plant = await getPlantCatalogById(plantId)
  if (!plant) {
    throw new Error('植物目录不存在')
  }
  return {
    userPlantId: null,
    plantId: plant.id,
    plantName: plant.canonicalName,
    genus: plant.genus || ''
  }
}

module.exports = {
  normalizePlantKeyword,
  mapFertilizationMonthly,
  listPlantCatalog,
  getPlantCatalogById,
  getPlantCatalogByIds,
  findCanonicalPlantMatch,
  createUserPlantInstance,
  getUserPlantInstanceById,
  getUserPlantFertilizationEvents: (openid, id, limit = 20) =>
    getUserPlantFertilizationEvents(models, openid, id, limit),
  insertFertilizationEvent: (openid, userPlantId, event = {}) =>
    insertFertilizationEvent(models, openid, userPlantId, event),
  getUserPlantWateringEvents,
  insertWateringEvent,
  getUserPlantWateringStrategy,
  getUserPlantCareExtension,
  listUserPlantInstances,
  hasDisplayableUserPlantIdentity,
  updateUserPlantInstance,
  deleteUserPlantInstance,
  recordIdentifySession,
  listDiagnosisSessions,
  resolvePlantContext
}
