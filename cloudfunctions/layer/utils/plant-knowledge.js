'use strict'

const { models } = require('/opt/utils/cloudbase')
const { diagnosis: DIAGNOSIS_RULES } = require('/opt/configs')

function normalizePlantKeyword(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '')
    .trim()
}

function escapeSqlLiteral(value) {
  return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

function sqlInList(values) {
  const safe = values
    .map(value => String(value || '').trim())
    .filter(value => /^[a-z0-9_:-]+$/i.test(value))
  if (!safe.length) {
    return '(NULL)'
  }
  return `(${safe.map(escapeSqlLiteral).join(', ')})`
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

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)))
}

function clampProbability(value) {
  return clamp(Number(value || 0), 0, 1)
}

function normalizeReliabilitySummary(summary, reliabilityScore) {
  const normalizedSummary = String(summary || '').trim()
  if (!normalizedSummary) {
    return normalizedSummary
  }

  const normalizedPercent = `${Math.round(clampProbability(reliabilityScore) * 100)}%`
  return normalizedSummary.replace(/可信度\s*\d+%/g, `可信度 ${normalizedPercent}`)
}

function parseCareJson(value) {
  return parseJsonField(value, null)
}

function normalizeNullableString(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {return null}

  const lowered = normalized.toLowerCase()
  if (lowered === 'null' || lowered === 'undefined') {
    return null
  }

  return normalized
}

function resolveCatalogPlantId(row = {}) {
  return row.legacy_plant_id || row.plant_identity_id || ''
}

function resolveUserPlantCatalogLookupId(row = {}) {
  return row.plant_identity_id || row.plant_id || row.legacy_plant_id || ''
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

const CATALOG_SELECT_SQL = `
  SELECT
    pie.plant_identity_id,
    pie.legacy_plant_id,
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
    gcp.fertilizing_strategy_json,
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
    scientificName && scientificName !== canonicalName ? scientificName : row.canonical_identity_name_en || ''

  return {
    id: catalogId,
    plantId: catalogId,
    plantIdentityId: row.plant_identity_id || '',
    legacyPlantId: row.legacy_plant_id || '',
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
    difficulty: row.difficulty === null || row.difficulty === undefined ? 0 : Number(row.difficulty || 0),
    internetName,
    identityLevel: row.identity_level || '',
    identityReviewStatus: row.identity_review_status || '',
    watering: parseCareJson(row.watering_strategy_json),
    fertilization: parseCareJson(row.fertilizing_strategy_json),
    sunning: parseCareJson(row.light_strategy_json),
    ventilation: parseCareJson(row.airflow_strategy_json),
    temperatureMin: row.temp_min_c === null || row.temp_min_c === undefined ? null : Number(row.temp_min_c),
    temperatureMax: row.temp_max_c === null || row.temp_max_c === undefined ? null : Number(row.temp_max_c),
    humidityMin: row.humidity_min === null || row.humidity_min === undefined ? null : Number(row.humidity_min),
    humidityMax: row.humidity_max === null || row.humidity_max === undefined ? null : Number(row.humidity_max),
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
      CAST(COALESCE(NULLIF(pie.legacy_plant_id, ''), '0') AS UNSIGNED),
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
  const sql = `
    ${CATALOG_SELECT_SQL}
    ${CATALOG_FROM_SQL}
    WHERE pie.is_active = 1
      AND (
        pie.plant_identity_id = {{plantId}}
        OR pie.legacy_plant_id = {{plantId}}
      )
    ORDER BY
      CASE
        WHEN pie.legacy_plant_id = {{plantId}} THEN 0
        ELSE 1
      END,
      pie.primary_display_name,
      pie.plant_identity_id
    LIMIT 1
  `
  const result = await models.$runSQL(sql, { plantId })
  const row = result?.data?.executeResultList?.[0]
  return row ? mapPlantRow(row) : null
}

async function findCanonicalPlantMatch(name, limit = 5) {
  const normalized = normalizePlantKeyword(name)
  if (!normalized) {return []}

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
      CAST(COALESCE(NULLIF(pie.legacy_plant_id, ''), '0') AS UNSIGNED),
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
  plantId = null,
  plantIdentityId = null,
  legacyPlantId = null,
  recognizedName = null,
  sourceType = 'catalog',
  recognitionType = null,
  recognitionConfidence = null,
  identityResolutionStatus = null,
  visualCallBatchId = null,
  nickname = null,
  location = null,
  photos = null
}) {
  let plant = null
  const normalizedPlantId = normalizeNullableString(plantId)
  const normalizedPlantIdentityId = normalizeNullableString(plantIdentityId)
  const normalizedLegacyPlantId = normalizeNullableString(legacyPlantId)
  const normalizedRecognizedName = normalizeNullableString(recognizedName)
  const normalizedIdentityResolutionStatus = normalizeNullableString(identityResolutionStatus)
  const normalizedVisualCallBatchId = normalizeNullableString(visualCallBatchId)
  let compatibilityPlantId = null
  let persistedPlantIdentityId = normalizedPlantIdentityId
  let persistedLegacyPlantId = normalizedLegacyPlantId
  let canonicalName = normalizedRecognizedName
  let plantGenus = null
  let plantFamilyEn = null
  let plantLatinName = null
  const lookupCandidates = Array.from(
    new Set(
      [
        normalizedPlantIdentityId,
        normalizedLegacyPlantId,
        normalizedPlantId
      ].filter(Boolean)
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
    compatibilityPlantId = plant.id || normalizedPlantId || normalizedLegacyPlantId || normalizedPlantIdentityId
    persistedPlantIdentityId = plant.plantIdentityId || persistedPlantIdentityId
    persistedLegacyPlantId = plant.legacyPlantId || persistedLegacyPlantId
    if (!persistedLegacyPlantId && compatibilityPlantId && compatibilityPlantId !== persistedPlantIdentityId) {
      persistedLegacyPlantId = compatibilityPlantId
    }
    canonicalName = plant.canonicalName
    plantGenus = plant.genus
    plantFamilyEn = plant.familyEn
    plantLatinName = plant.latinName
  }

  const finalIdentityResolutionStatus =
    persistedPlantIdentityId
      ? 'matched'
      : normalizedIdentityResolutionStatus || 'unresolved'

  const sql = `
    INSERT INTO user_plant_instances (
      _openid, plant_id, plant_identity_id, legacy_plant_id, canonical_name, recognized_name,
      source_type, recognition_type, recognition_confidence, identity_resolution_status,
      visual_call_batch_id, nickname, location, photos, plant_genus, plant_family_en, plant_latin_name
    ) VALUES (
      {{openid}}, {{plantId}}, {{plantIdentityId}}, {{legacyPlantId}}, {{canonicalName}}, {{recognizedName}},
      {{sourceType}}, {{recognitionType}}, NULLIF({{recognitionConfidence}}, ''), {{identityResolutionStatus}},
      {{visualCallBatchId}}, {{nickname}}, {{location}}, {{photos}}, {{plantGenus}}, {{plantFamilyEn}}, {{plantLatinName}}
    )
  `

  await models.$runSQL(sql, {
    openid,
    plantId: compatibilityPlantId,
    plantIdentityId: persistedPlantIdentityId,
    legacyPlantId: persistedLegacyPlantId,
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
          AND COALESCE(legacy_plant_id, '') = COALESCE({{legacyPlantId}}, '')
          AND COALESCE(recognized_name, '') = COALESCE({{recognizedName}}, '')
          AND COALESCE(nickname, '') = COALESCE({{nickname}}, '')
          AND COALESCE(location, '') = COALESCE({{location}}, '')
        ORDER BY id DESC
        LIMIT 1
      `,
      {
        openid,
        plantIdentityId: persistedPlantIdentityId,
        legacyPlantId: persistedLegacyPlantId,
        recognizedName: normalizedRecognizedName,
        nickname: normalizeNullableString(nickname),
        location: normalizeNullableString(location)
      }
    )

    insertedId = Number(fallbackResult?.data?.executeResultList?.[0]?.id || 0)
  }

  return insertedId ? getUserPlantInstanceById(openid, insertedId) : null
}

const USER_PLANT_LATEST_DIAGNOSIS_SQL = `
  LEFT JOIN (
    SELECT d1.user_plant_id, d1.health_status, d1.health_score, d1.created_at
    FROM diagnosis_sessions d1
    INNER JOIN (
      SELECT user_plant_id, MAX(created_at) AS latest_created_at
      FROM diagnosis_sessions
      GROUP BY user_plant_id
    ) latest
      ON latest.user_plant_id = d1.user_plant_id
     AND latest.latest_created_at = d1.created_at
  ) ds ON ds.user_plant_id = up.id
`

function mapUserPlantInstanceRow(row, plant = null) {
  const plantIdentityId = plant?.plantIdentityId || row.plant_identity_id || ''
  const legacyPlantId = plant?.legacyPlantId || row.legacy_plant_id || ''
  const canonicalName = row.canonical_name || plant?.canonicalName || row.recognized_name || ''

  return {
    id: row.id,
    plantId: row.plant_id,
    plantIdentityId,
    legacyPlantId,
    canonicalName,
    nickname: row.nickname || '',
    displayName: row.nickname || canonicalName || row.recognized_name || '未命名植物',
    recognizedName: row.recognized_name || '',
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
    photos: parseJsonField(row.photos, []),
    imageFileId: plant?.imageFileId || '',
    lastWatered: row.last_watered || null,
    nextWater: row.next_water || null,
    createdAt: row.created_at || null,
    genus: plant?.genus || row.plant_genus || '',
    familyCn: plant?.familyCn || '',
    familyEn: plant?.familyEn || row.plant_family_en || '',
    latinName: plant?.latinName || row.plant_latin_name || '',
    watering: plant?.watering || null,
    fertilization: plant?.fertilization || null,
    sunning: plant?.sunning || null,
    ventilation: plant?.ventilation || null,
    temperatureMin: plant?.temperatureMin ?? null,
    temperatureMax: plant?.temperatureMax ?? null,
    humidityMin: plant?.humidityMin ?? null,
    humidityMax: plant?.humidityMax ?? null,
    varianceLevel: plant?.varianceLevel || '',
    healthStatus: row.health_status || 'unknown',
    healthScore: row.health_score === null || row.health_score === undefined ? null : Number(row.health_score)
  }
}

async function getUserPlantInstanceById(openid, id) {
  const sql = `
    SELECT
      up.id,
      up.plant_id,
      up.plant_identity_id,
      up.legacy_plant_id,
      up.canonical_name,
      up.recognized_name,
      up.source_type,
      up.recognition_type,
      up.recognition_confidence,
      up.identity_resolution_status,
      up.visual_call_batch_id,
      up.nickname,
      up.location,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      up.plant_genus,
      up.plant_family_en,
      up.plant_latin_name,
      ds.health_status,
      ds.health_score
    FROM user_plant_instances up
    ${USER_PLANT_LATEST_DIAGNOSIS_SQL}
    WHERE up._openid = {{openid}} AND up.id = {{id}}
    LIMIT 1
  `
  const result = await models.$runSQL(sql, { openid, id: Number(id) })
  const row = result?.data?.executeResultList?.[0]
  if (!row) {return null}

  const plantLookupId = resolveUserPlantCatalogLookupId(row)
  const plant = plantLookupId ? await getPlantCatalogById(plantLookupId) : null
  return mapUserPlantInstanceRow(row, plant)
}

async function listUserPlantInstances(openid, { page = 1, pageSize = 20 } = {}) {
  const limit = Number(pageSize)
  const offset = (Number(page) - 1) * limit
  const sql = `
    SELECT
      up.id,
      up.plant_id,
      up.plant_identity_id,
      up.legacy_plant_id,
      up.canonical_name,
      up.recognized_name,
      up.source_type,
      up.recognition_type,
      up.recognition_confidence,
      up.identity_resolution_status,
      up.visual_call_batch_id,
      up.nickname,
      up.location,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      up.plant_genus,
      up.plant_family_en,
      up.plant_latin_name,
      ds.health_status,
      ds.health_score
    FROM user_plant_instances up
    ${USER_PLANT_LATEST_DIAGNOSIS_SQL}
    WHERE up._openid = {{openid}}
    ORDER BY up.created_at DESC
    LIMIT {{limit}} OFFSET {{offset}}
  `
  const countResult = await models.$runSQL(
    'SELECT COUNT(*) AS total FROM user_plant_instances WHERE _openid = {{openid}}',
    { openid }
  )
  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  const result = await models.$runSQL(sql, { openid, limit, offset })
  const rows = result?.data?.executeResultList || []
  const plantIds = Array.from(
    new Set(
      rows
        .map(row => resolveUserPlantCatalogLookupId(row))
        .filter(Boolean)
    )
  )
  const plants = await Promise.all(
    plantIds.map(async plantId => [plantId, await getPlantCatalogById(plantId)])
  )
  const plantMap = new Map(plants)

  return {
    list: rows.map(row =>
      mapUserPlantInstanceRow(
        row,
        plantMap.get(resolveUserPlantCatalogLookupId(row)) || null
      )
    ),
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

  const fields = []
  const params = { openid, id: Number(id) }

  if (updates.nickname !== undefined || updates.nickName !== undefined) {
    fields.push('nickname = {{nickname}}')
    params.nickname = updates.nickname !== undefined ? updates.nickname : updates.nickName
  }
  if (updates.location !== undefined) {
    fields.push('location = {{location}}')
    params.location = updates.location
  }
  if (updates.photos !== undefined) {
    fields.push('photos = {{photos}}')
    params.photos = updates.photos ? JSON.stringify(updates.photos) : null
  }
  if (updates.lastWatered !== undefined) {
    fields.push('last_watered = {{lastWatered}}')
    params.lastWatered = updates.lastWatered
  }
  if (updates.nextWater !== undefined) {
    fields.push('next_water = {{nextWater}}')
    params.nextWater = updates.nextWater
  }

  if (!fields.length) {
    return existing
  }

  const sql = `
    UPDATE user_plant_instances
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = {{id}} AND _openid = {{openid}}
  `
  await models.$runSQL(sql, params)
  return getUserPlantInstanceById(openid, id)
}

async function deleteUserPlantInstance(openid, id) {
  const existing = await getUserPlantInstanceById(openid, id)
  if (!existing) {
    throw new Error('植物不存在或无权限删除')
  }
  await models.$runSQL('DELETE FROM user_plant_instances WHERE id = {{id}} AND _openid = {{openid}}', {
    id: Number(id),
    openid
  })
  return true
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
      summary: normalizeReliabilitySummary(row.ai_summary || '', row.reliability_score),
      imageUrl: row.image_url || '',
      healthScore: row.health_score === null || row.health_score === undefined ? null : Number(row.health_score),
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
    hasMore: offset + (listResult?.data?.executeResultList || []).length < Number(countResult?.data?.executeResultList?.[0]?.total || 0)
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

async function loadProblemRelations(problemKey) {
  if (!problemKey) {
    return { causes: [], effects: [] }
  }

  const result = await models.$runSQL(
    `
      SELECT
        cause_problem_key,
        effect_problem_key,
        relation_type,
        relation_strength,
        note
      FROM problem_causality
      WHERE is_active = 1
        AND (
          cause_problem_key = {{problemKey}}
          OR effect_problem_key = {{problemKey}}
        )
      ORDER BY relation_strength DESC, id ASC
    `,
    { problemKey }
  )

  const rows = result?.data?.executeResultList || []
  return {
    causes: rows
      .filter(row => row.cause_problem_key === problemKey)
      .map(row => ({
        causeProblemKey: row.cause_problem_key,
        effectProblemKey: row.effect_problem_key,
        relationType: row.relation_type || 'causes',
        relationStrength: Number(row.relation_strength || 0),
        note: row.note || ''
      })),
    effects: rows
      .filter(row => row.effect_problem_key === problemKey)
      .map(row => ({
        causeProblemKey: row.cause_problem_key,
        effectProblemKey: row.effect_problem_key,
        relationType: row.relation_type || 'causes',
        relationStrength: Number(row.relation_strength || 0),
        note: row.note || ''
      }))
  }
}

async function loadProblemCausality(problemKeys) {
  const keys = Array.from(
    new Set(
      (problemKeys || [])
        .map(key => String(key || '').trim())
        .filter(Boolean)
    )
  )
  if (!keys.length) {
    return []
  }

  const result = await models.$runSQL(
    `
      SELECT
        cause_problem_key,
        effect_problem_key,
        relation_type,
        relation_strength,
        note
      FROM problem_causality
      WHERE is_active = 1
        AND (
          cause_problem_key IN ${sqlInList(keys)}
          OR effect_problem_key IN ${sqlInList(keys)}
        )
      ORDER BY relation_strength DESC, id ASC
    `,
    {}
  )

  return result?.data?.executeResultList || []
}

function buildQuestionText(symptom) {
  switch (symptom.locationKey) {
    case 'leaf':
      return `叶片上是否出现“${symptom.symptomCn}”？`
    case 'root':
      return `根部是否出现“${symptom.symptomCn}”？`
    case 'soil':
      return `盆土或基质是否出现“${symptom.symptomCn}”？`
    case 'flower':
      return `花朵是否出现“${symptom.symptomCn}”？`
    case 'stem':
      return `茎部是否出现“${symptom.symptomCn}”？`
    default:
      return `植株是否出现“${symptom.symptomCn}”？`
  }
}

async function buildDiagnosisDecision({
  openid,
  plantId = null,
  userPlantId = null,
  observedSymptoms = [],
  excludedSymptomKeys = []
}) {
  const plantContext = await resolvePlantContext({ openid, plantId, userPlantId })
  const candidateResult = await models.$runSQL(
    `
      SELECT
        ppp.problem_key,
        p.problem_cn,
        p.problem_type,
        ppp.host_compatibility,
        COALESCE(ppp.genus_compatibility, 0) AS is_genus_candidate
      FROM plant_problem_profiles ppp
      JOIN problems p ON p.problem_key = ppp.problem_key
      WHERE ppp.plant_id = {{plantId}}
      ORDER BY ppp.host_compatibility DESC, ppp.problem_key ASC
    `,
    { plantId: plantContext.plantId }
  )
  const candidates = candidateResult?.data?.executeResultList || []
  if (!candidates.length) {
    return {
      plant: plantContext,
      rankings: [],
      topProblemKey: '',
      topProblemCn: '',
      topScore: 0,
      topScoreGap: 0,
      reliabilityScore: 0,
      supportingSymptomCount: 0,
      decisiveSymptomCount: 0,
      needsFollowUp: true,
      followUps: []
    }
  }

  const symptomInputs = observedSymptoms
    .map(item => ({
      symptomKey: String(item.symptomKey || item.symptom_key || '').trim(),
      confidence: Number(item.confidence || 0)
    }))
    .filter(item => item.symptomKey && item.confidence > 0)
  const symptomKeys = symptomInputs.map(item => item.symptomKey)

  const evidenceByProblem = new Map()
  const symptomsByKey = new Map()

  if (symptomKeys.length) {
    const [symptomResult, evidenceResult] = await Promise.all([
      models.$runSQL(
        `
          SELECT
            symptom_key,
            symptom_cn,
            location_key,
            COALESCE(signal_reliability, 0) AS base_evidence_weight,
            COALESCE(signal_reliability, 0) AS symptom_reliability
          FROM symptoms
          WHERE symptom_key IN ${sqlInList(symptomKeys)}
        `,
        {}
      ),
      models.$runSQL(
        `
          SELECT symptom_key, problem_key, association_strength, edge_reliability AS evidence_reliability
          FROM symptom_problem_evidence
          WHERE symptom_key IN ${sqlInList(symptomKeys)}
            AND problem_key IN ${sqlInList(candidates.map(item => item.problem_key))}
        `,
        {}
      )
    ])

    for (const row of symptomResult?.data?.executeResultList || []) {
      symptomsByKey.set(row.symptom_key, row)
    }
    for (const row of evidenceResult?.data?.executeResultList || []) {
      const list = evidenceByProblem.get(row.problem_key) || []
      list.push(row)
      evidenceByProblem.set(row.problem_key, list)
    }
  }

  const rankings = candidates
    .map(candidate => {
      const hostCompatibility = clampProbability(candidate.host_compatibility)
      const genusCompatibility = Number(candidate.is_genus_candidate || 0) > 0 ? 1 : 0
      const evidenceRows = evidenceByProblem.get(candidate.problem_key) || []
      let symptomSupportScore = 0
      let evidenceCount = 0
      let decisiveSymptomCount = 0

      for (const symptomInput of symptomInputs) {
        const symptomMeta = symptomsByKey.get(symptomInput.symptomKey)
        const evidence = evidenceRows.find(item => item.symptom_key === symptomInput.symptomKey)
        if (!symptomMeta || !evidence) {continue}

        const contribution =
          Number(evidence.association_strength || 0) *
          Number(symptomMeta.symptom_reliability || 0) *
          genusCompatibility *
          hostCompatibility

        symptomSupportScore += contribution
        if (contribution > DIAGNOSIS_RULES.decisiveContributionThreshold) {
          evidenceCount += 1
        }
        if (
          Number(evidence.association_strength || 0) >= DIAGNOSIS_RULES.decisiveAssociationStrength &&
          Number(symptomMeta.symptom_reliability || 0) >= DIAGNOSIS_RULES.decisiveSymptomReliability &&
          genusCompatibility === 1 &&
          hostCompatibility >= DIAGNOSIS_RULES.decisiveHostCompatibility
        ) {
          decisiveSymptomCount += 1
        }
      }

      const maxSupportScore = symptomInputs.reduce((total, symptomInput) => {
        const symptomMeta = symptomsByKey.get(symptomInput.symptomKey)
        return total + Number(symptomMeta?.symptom_reliability || 0)
      }, 0)
      const weightedScore = maxSupportScore > 0 ? symptomSupportScore / maxSupportScore : 0

      return {
        problemKey: candidate.problem_key,
        problemCn: candidate.problem_cn || candidate.problem_key,
        problemType: candidate.problem_type || '',
        genusCompatibility: round(genusCompatibility),
        hostCompatibility: round(hostCompatibility),
        symptomSupportScore: round(symptomSupportScore),
        evidenceCount,
        decisiveSymptomCount,
        weightedScore: round(weightedScore)
      }
    })
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((item, index) => ({
      ...item,
      rankNo: index + 1,
      isDecisive: index === 0 && item.decisiveSymptomCount > 0
    }))

  const top = rankings[0]
  const second = rankings[1] || { weightedScore: 0 }
  const topScoreGap = round(top.weightedScore - second.weightedScore)
  const reliabilityScore = round(clampProbability(
    top.weightedScore +
      Math.min(topScoreGap, DIAGNOSIS_RULES.reliabilityGapCap) * DIAGNOSIS_RULES.reliabilityGapFactor
  ))
  const supportingSymptomCount = top.evidenceCount
  const decisiveSymptomCount = top.decisiveSymptomCount
  const needsFollowUp = !(
    top.weightedScore >= DIAGNOSIS_RULES.followUpTopScoreThreshold &&
    topScoreGap >= DIAGNOSIS_RULES.followUpScoreGapThreshold &&
    supportingSymptomCount >= DIAGNOSIS_RULES.followUpSupportingSymptomThreshold &&
    decisiveSymptomCount >= DIAGNOSIS_RULES.followUpDecisiveSymptomThreshold
  )

  const followUps = []
  if (needsFollowUp) {
    const topRankingKeys = rankings.slice(0, DIAGNOSIS_RULES.followUpMaxQuestions).map(item => item.problemKey)
    const causalityRows = await loadProblemCausality(topRankingKeys)
    const causalityCandidateKeys = []

    for (const row of causalityRows) {
      if (topRankingKeys.includes(row.cause_problem_key) && row.effect_problem_key) {
        causalityCandidateKeys.push(row.effect_problem_key)
      }
      if (topRankingKeys.includes(row.effect_problem_key) && row.cause_problem_key) {
        causalityCandidateKeys.push(row.cause_problem_key)
      }
    }

    const topCandidateKeys = Array.from(
      new Set([...topRankingKeys, ...causalityCandidateKeys])
    ).slice(0, DIAGNOSIS_RULES.followUpMaxQuestions + causalityCandidateKeys.length)
    const evidenceResult = await models.$runSQL(
      `
        SELECT
          spe.symptom_key,
          spe.problem_key,
          spe.association_strength,
          spe.edge_reliability AS evidence_reliability,
          s.symptom_cn,
          s.location_key,
          COALESCE(s.signal_reliability, 0) AS symptom_reliability,
          COALESCE(s.signal_reliability, 0) AS base_evidence_weight
        FROM symptom_problem_evidence spe
        JOIN symptoms s ON s.symptom_key = spe.symptom_key
        WHERE spe.problem_key IN ${sqlInList(topCandidateKeys)}
      `,
      {}
    )

    const observedSet = new Set(symptomKeys)
    const excludedSet = new Set(
      excludedSymptomKeys.map(item => String(item || '').trim()).filter(Boolean)
    )
    const candidateMetaMap = new Map(rankings.map(item => [item.problemKey, item]))
    const questionMap = new Map()
    for (const row of evidenceResult?.data?.executeResultList || []) {
      if (observedSet.has(row.symptom_key) || excludedSet.has(row.symptom_key)) {continue}
      const candidateMeta = candidateMetaMap.get(row.problem_key)
      if (!candidateMeta) {continue}
      const item = questionMap.get(row.symptom_key) || {
        symptomKey: row.symptom_key,
        symptomCn: row.symptom_cn,
        locationKey: row.location_key,
        symptomReliability: Number(row.symptom_reliability || 0),
        weights: {}
      }
      item.weights[row.problem_key] =
        Number(row.association_strength || 0) *
        Number(row.symptom_reliability || 0) *
        Number(candidateMeta.genusCompatibility || 0) *
        Number(candidateMeta.hostCompatibility || 0)
      questionMap.set(row.symptom_key, item)
    }

    const questions = Array.from(questionMap.values())
      .map(item => {
        const values = topCandidateKeys.map(problemKey => Number(item.weights[problemKey] || 0))
        const informationGain = (Math.max(...values) - Math.min(...values)) * item.symptomReliability
        return {
          symptomKey: item.symptomKey,
          symptomCn: item.symptomCn,
          locationKey: item.locationKey,
          informationGain: round(informationGain),
          questionText: buildQuestionText(item),
          rationale: `用于区分 ${rankings
            .slice(0, 2)
            .map(candidate => candidate.problemCn)
            .join(' / ')}${causalityRows.length ? '，并覆盖相关诱因链' : ''}`
        }
      })
      .filter(item => item.informationGain > 0)
      .sort((a, b) => b.informationGain - a.informationGain)
      .slice(0, 3)

    for (let index = 0; index < questions.length; index += 1) {
      followUps.push({
        questionOrder: index + 1,
        ...questions[index]
      })
    }
  }

  const finalNeedsFollowUp = Boolean(needsFollowUp && followUps.length > 0)

  const problemRelations = await loadProblemRelations(top.problemKey)

  return {
    plant: plantContext,
    rankings,
    topProblemKey: top.problemKey,
    topProblemCn: top.problemCn,
    topScore: top.weightedScore,
    topScoreGap,
    reliabilityScore,
    supportingSymptomCount,
    decisiveSymptomCount,
    needsFollowUp: finalNeedsFollowUp,
    followUps,
    problemRelations,
    problemCausality: await loadProblemCausality([top.problemKey])
  }
}

module.exports = {
  normalizePlantKeyword,
  listPlantCatalog,
  getPlantCatalogById,
  findCanonicalPlantMatch,
  createUserPlantInstance,
  getUserPlantInstanceById,
  listUserPlantInstances,
  updateUserPlantInstance,
  deleteUserPlantInstance,
  recordIdentifySession,
  listDiagnosisSessions,
  buildDiagnosisDecision
}
