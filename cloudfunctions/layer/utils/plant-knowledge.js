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
  } catch (error) {
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

function mapPlantRow(row) {
  return {
    id: row.plant_id,
    canonicalName: row.canonical_name,
    aliasNames: row.alias_names || '',
    latinName: row.latin_name || '',
    imageFileId: row.image_file_id || '',
    plantDesc: row.plant_desc || '',
    categoryCn: row.category_cn || '',
    categoryEn: row.category_en || '',
    genus: row.genus || '',
    familyEn: row.family_en || '',
    difficulty: Number(row.difficulty || 0),
    internetName: row.internet_name || '',
    watering: parseCareJson(row.care_watering),
    fertilization: parseCareJson(row.care_fertilization),
    sunning: parseCareJson(row.care_sunning),
    ventilation: parseCareJson(row.care_ventilation),
    temperatureMin: row.temperature_min === null || row.temperature_min === undefined ? null : Number(row.temperature_min),
    temperatureMax: row.temperature_max === null || row.temperature_max === undefined ? null : Number(row.temperature_max),
    humidityMin: row.humidity_min === null || row.humidity_min === undefined ? null : Number(row.humidity_min),
    humidityMax: row.humidity_max === null || row.humidity_max === undefined ? null : Number(row.humidity_max),
    varianceLevel: row.variance_level || '',
    careAuditStatus: row.care_audit_status || ''
  }
}

async function listPlantCatalog({ keyword = '', page = 1, pageSize = 10, offset } = {}) {
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.max(1, Number(pageSize) || 10)
  const normalizedOffset =
    offset === undefined || offset === null
      ? (normalizedPage - 1) * normalizedPageSize
      : Math.max(0, Number(offset) || 0)
  let sql = `
    SELECT
      pc.plant_id,
      pc.canonical_name,
      pc.image_file_id,
      pc.plant_desc,
      pc.category_cn,
      pc.category_en,
      pc.latin_name,
      pc.genus,
      pc.family_en,
      pc.difficulty,
      pc.internet_name,
      gcp.watering AS care_watering,
      gcp.fertilization AS care_fertilization,
      gcp.sunning AS care_sunning,
      gcp.ventilation AS care_ventilation,
      gcp.temperature_min,
      gcp.temperature_max,
      gcp.humidity_min,
      gcp.humidity_max,
      gcp.variance_level,
      gcp.care_audit_status,
      GROUP_CONCAT(DISTINCT pa.alias_name ORDER BY pa.alias_name SEPARATOR '、') AS alias_names
    FROM plant_catalog pc
    LEFT JOIN plant_aliases pa ON pa.plant_id = pc.plant_id
    LEFT JOIN genus_care_profile gcp ON gcp.genus = pc.genus
  `

  const params = { limit: normalizedPageSize, offset: normalizedOffset }
  const conditions = []
  const normalizedKeyword = normalizePlantKeyword(keyword)

  if (normalizedKeyword) {
    conditions.push(`(
      REPLACE(LOWER(pc.canonical_name), ' ', '') LIKE {{searchPattern}}
      OR REPLACE(LOWER(COALESCE(pc.latin_name, '')), ' ', '') LIKE {{searchPattern}}
      OR REPLACE(LOWER(COALESCE(pc.internet_name, '')), ' ', '') LIKE {{searchPattern}}
      OR REPLACE(LOWER(COALESCE(pa.normalized_name, '')), ' ', '') LIKE {{searchPattern}}
    )`)
    params.searchPattern = `%${normalizedKeyword}%`
  }

  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`
  }

  sql += `
    GROUP BY
      pc.plant_id, pc.canonical_name, pc.image_file_id, pc.plant_desc,
      pc.category_cn, pc.category_en, pc.latin_name, pc.genus, pc.family_en,
      pc.difficulty, pc.internet_name,
      gcp.watering, gcp.fertilization, gcp.sunning, gcp.ventilation,
      gcp.temperature_min, gcp.temperature_max, gcp.humidity_min, gcp.humidity_max,
      gcp.variance_level, gcp.care_audit_status
    ORDER BY CAST(pc.plant_id AS UNSIGNED), pc.canonical_name
    LIMIT {{limit}} OFFSET {{offset}}
  `

  const countSql = `
    SELECT COUNT(DISTINCT pc.plant_id) AS total
    FROM plant_catalog pc
    LEFT JOIN plant_aliases pa ON pa.plant_id = pc.plant_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
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
    SELECT
      pc.plant_id,
      pc.canonical_name,
      pc.image_file_id,
      pc.plant_desc,
      pc.category_cn,
      pc.category_en,
      pc.latin_name,
      pc.genus,
      pc.family_en,
      pc.difficulty,
      pc.internet_name,
      gcp.watering AS care_watering,
      gcp.fertilization AS care_fertilization,
      gcp.sunning AS care_sunning,
      gcp.ventilation AS care_ventilation,
      gcp.temperature_min,
      gcp.temperature_max,
      gcp.humidity_min,
      gcp.humidity_max,
      gcp.variance_level,
      gcp.care_audit_status,
      GROUP_CONCAT(DISTINCT pa.alias_name ORDER BY pa.alias_name SEPARATOR '、') AS alias_names
    FROM plant_catalog pc
    LEFT JOIN plant_aliases pa ON pa.plant_id = pc.plant_id
    LEFT JOIN genus_care_profile gcp ON gcp.genus = pc.genus
    WHERE pc.plant_id = {{plantId}}
    GROUP BY
      pc.plant_id, pc.canonical_name, pc.image_file_id, pc.plant_desc,
      pc.category_cn, pc.category_en, pc.latin_name, pc.genus, pc.family_en,
      pc.difficulty, pc.internet_name,
      gcp.watering, gcp.fertilization, gcp.sunning, gcp.ventilation,
      gcp.temperature_min, gcp.temperature_max, gcp.humidity_min, gcp.humidity_max,
      gcp.variance_level, gcp.care_audit_status
    LIMIT 1
  `
  const result = await models.$runSQL(sql, { plantId })
  const row = result?.data?.executeResultList?.[0]
  return row ? mapPlantRow(row) : null
}

async function findCanonicalPlantMatch(name, limit = 5) {
  const normalized = normalizePlantKeyword(name)
  if (!normalized) return []

  const sql = `
    SELECT
      pc.plant_id,
      pc.canonical_name,
      pc.image_file_id,
      pc.plant_desc,
      pc.category_cn,
      pc.category_en,
      pc.latin_name,
      pc.genus,
      pc.family_en,
      pc.difficulty,
      pc.internet_name,
      gcp.watering AS care_watering,
      gcp.fertilization AS care_fertilization,
      gcp.sunning AS care_sunning,
      gcp.ventilation AS care_ventilation,
      gcp.temperature_min,
      gcp.temperature_max,
      gcp.humidity_min,
      gcp.humidity_max,
      gcp.variance_level,
      gcp.care_audit_status,
      pa.alias_name,
      pa.alias_type,
      CASE
        WHEN pa.normalized_name = {{normalized}} THEN 3
        WHEN REPLACE(LOWER(pc.canonical_name), ' ', '') = {{normalized}} THEN 3
        WHEN REPLACE(LOWER(COALESCE(pc.internet_name, '')), ' ', '') = {{normalized}} THEN 3
        WHEN pa.normalized_name LIKE {{fuzzy}} THEN 2
        WHEN REPLACE(LOWER(pc.canonical_name), ' ', '') LIKE {{fuzzy}} THEN 2
        ELSE 1
      END AS match_score
    FROM plant_catalog pc
    LEFT JOIN plant_aliases pa ON pa.plant_id = pc.plant_id
    LEFT JOIN genus_care_profile gcp ON gcp.genus = pc.genus
    WHERE
      REPLACE(LOWER(pc.canonical_name), ' ', '') = {{normalized}}
      OR REPLACE(LOWER(COALESCE(pc.internet_name, '')), ' ', '') = {{normalized}}
      OR REPLACE(LOWER(COALESCE(pc.latin_name, '')), ' ', '') = {{normalized}}
      OR pa.normalized_name = {{normalized}}
      OR REPLACE(LOWER(pc.canonical_name), ' ', '') LIKE {{fuzzy}}
      OR pa.normalized_name LIKE {{fuzzy}}
    ORDER BY match_score DESC, CAST(pc.plant_id AS UNSIGNED), pc.canonical_name
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
    if (!dedup.has(row.plant_id)) {
      dedup.set(row.plant_id, {
        ...mapPlantRow(row),
        matchScore: Number(row.match_score || 0),
        matchAlias: row.alias_name || '',
        matchType: row.alias_type || 'canonical'
      })
    }
  }
  return Array.from(dedup.values())
}

async function createUserPlantInstance({
  openid,
  plantId = null,
  recognizedName = null,
  sourceType = 'catalog',
  recognitionType = null,
  recognitionConfidence = null,
  nickname = null,
  location = null,
  photos = null
}) {
  let plant = null
  let canonicalName = recognizedName || null
  let plantGenus = null
  let plantFamilyEn = null
  let plantLatinName = null

  if (plantId) {
    plant = await getPlantCatalogById(plantId)
    if (!plant) {
      throw new Error('植物目录中不存在该 plantId')
    }
    canonicalName = plant.canonicalName
    plantGenus = plant.genus
    plantFamilyEn = plant.familyEn
    plantLatinName = plant.latinName
  }

  const sql = `
    INSERT INTO user_plant_instances (
      _openid, plant_id, canonical_name, recognized_name, source_type, recognition_type,
      recognition_confidence, nickname, location, photos, plant_genus, plant_family_en,
      plant_latin_name
    ) VALUES (
      {{openid}}, {{plantId}}, {{canonicalName}}, {{recognizedName}}, {{sourceType}}, {{recognitionType}},
      NULLIF({{recognitionConfidence}}, ''), {{nickname}}, {{location}}, {{photos}}, {{plantGenus}}, {{plantFamilyEn}},
      {{plantLatinName}}
    )
  `

  await models.$runSQL(sql, {
    openid,
    plantId,
    canonicalName,
    recognizedName,
    sourceType,
    recognitionType,
    recognitionConfidence:
      recognitionConfidence === null ||
      recognitionConfidence === undefined ||
      recognitionConfidence === '' ||
      recognitionConfidence === 'null'
        ? ''
        : recognitionConfidence,
    nickname,
    location,
    photos: photos ? JSON.stringify(photos) : null,
    plantGenus,
    plantFamilyEn,
    plantLatinName
  })

  const lastIdResult = await models.$runSQL('SELECT LAST_INSERT_ID() AS insertId', {})
  const insertedId = Number(lastIdResult?.data?.executeResultList?.[0]?.insertId || 0)
  return getUserPlantInstanceById(openid, insertedId)
}

async function getUserPlantInstanceById(openid, id) {
  const sql = `
    SELECT
      up.id,
      up.plant_id,
      up.canonical_name,
      up.recognized_name,
      up.nickname,
      up.location,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      COALESCE(pc.image_file_id, '') AS image_file_id,
      pc.genus,
      pc.family_en,
      pc.latin_name,
      gcp.watering AS care_watering,
      gcp.fertilization AS care_fertilization,
      gcp.sunning AS care_sunning,
      gcp.ventilation AS care_ventilation,
      gcp.temperature_min,
      gcp.temperature_max,
      gcp.humidity_min,
      gcp.humidity_max,
      gcp.variance_level,
      ds.health_status,
      ds.health_score
    FROM user_plant_instances up
    LEFT JOIN plant_catalog pc ON pc.plant_id = up.plant_id
    LEFT JOIN genus_care_profile gcp ON gcp.genus = COALESCE(pc.genus, up.plant_genus)
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
    WHERE up._openid = {{openid}} AND up.id = {{id}}
    LIMIT 1
  `
  const result = await models.$runSQL(sql, { openid, id: Number(id) })
  const row = result?.data?.executeResultList?.[0]
  if (!row) return null

  return {
    id: row.id,
    plantId: row.plant_id,
    canonicalName: row.canonical_name || '',
    nickname: row.nickname || '',
    displayName: row.nickname || row.canonical_name || row.recognized_name || '未命名植物',
    recognizedName: row.recognized_name || '',
    location: row.location || '未设置',
    photos: parseJsonField(row.photos, []),
    imageFileId: row.image_file_id || '',
    lastWatered: row.last_watered || null,
    nextWater: row.next_water || null,
    createdAt: row.created_at || null,
    genus: row.genus || '',
    familyEn: row.family_en || '',
    latinName: row.latin_name || '',
    watering: parseCareJson(row.care_watering),
    fertilization: parseCareJson(row.care_fertilization),
    sunning: parseCareJson(row.care_sunning),
    ventilation: parseCareJson(row.care_ventilation),
    temperatureMin: row.temperature_min === null || row.temperature_min === undefined ? null : Number(row.temperature_min),
    temperatureMax: row.temperature_max === null || row.temperature_max === undefined ? null : Number(row.temperature_max),
    humidityMin: row.humidity_min === null || row.humidity_min === undefined ? null : Number(row.humidity_min),
    humidityMax: row.humidity_max === null || row.humidity_max === undefined ? null : Number(row.humidity_max),
    varianceLevel: row.variance_level || '',
    healthStatus: row.health_status || 'unknown',
    healthScore: row.health_score === null || row.health_score === undefined ? null : Number(row.health_score)
  }
}

async function listUserPlantInstances(openid, { page = 1, pageSize = 20 } = {}) {
  const limit = Number(pageSize)
  const offset = (Number(page) - 1) * limit
  const sql = `
    SELECT
      up.id,
      up.plant_id,
      up.canonical_name,
      up.recognized_name,
      up.nickname,
      up.location,
      up.photos,
      up.last_watered,
      up.next_water,
      up.created_at,
      COALESCE(pc.image_file_id, '') AS image_file_id,
      pc.genus,
      pc.family_en,
      pc.latin_name,
      gcp.watering AS care_watering,
      gcp.fertilization AS care_fertilization,
      gcp.sunning AS care_sunning,
      gcp.ventilation AS care_ventilation,
      gcp.temperature_min,
      gcp.temperature_max,
      gcp.humidity_min,
      gcp.humidity_max,
      gcp.variance_level,
      ds.health_status,
      ds.health_score
    FROM user_plant_instances up
    LEFT JOIN plant_catalog pc ON pc.plant_id = up.plant_id
    LEFT JOIN genus_care_profile gcp ON gcp.genus = COALESCE(pc.genus, up.plant_genus)
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

  return {
    list: (result?.data?.executeResultList || []).map(row => ({
      id: row.id,
      plantId: row.plant_id,
      canonicalName: row.canonical_name || '',
      nickname: row.nickname || '',
      displayName: row.nickname || row.canonical_name || row.recognized_name || '未命名植物',
      recognizedName: row.recognized_name || '',
      location: row.location || '未设置',
      photos: parseJsonField(row.photos, []),
      imageFileId: row.image_file_id || '',
      lastWatered: row.last_watered || null,
      nextWater: row.next_water || null,
      createdAt: row.created_at || null,
      genus: row.genus || '',
      familyEn: row.family_en || '',
      latinName: row.latin_name || '',
      watering: parseCareJson(row.care_watering),
      fertilization: parseCareJson(row.care_fertilization),
      sunning: parseCareJson(row.care_sunning),
      ventilation: parseCareJson(row.care_ventilation),
      temperatureMin: row.temperature_min === null || row.temperature_min === undefined ? null : Number(row.temperature_min),
      temperatureMax: row.temperature_max === null || row.temperature_max === undefined ? null : Number(row.temperature_max),
      humidityMin: row.humidity_min === null || row.humidity_min === undefined ? null : Number(row.humidity_min),
      humidityMax: row.humidity_max === null || row.humidity_max === undefined ? null : Number(row.humidity_max),
      varianceLevel: row.variance_level || '',
      healthStatus: row.health_status || 'unknown',
      healthScore:
        row.health_score === null || row.health_score === undefined ? null : Number(row.health_score)
    })),
    total,
    page: Number(page),
    pageSize: limit,
    hasMore: offset + (result?.data?.executeResultList || []).length < total
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
    const verifyResult = await models.$runSQL(
      'SELECT plant_id FROM plant_catalog WHERE plant_id = {{plantId}} LIMIT 1',
      { plantId: normalizedCanonicalPlantId }
    )
    const exists = Boolean(verifyResult?.data?.executeResultList?.length)
    if (!exists) {
      normalizedCanonicalPlantId = null
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

async function getDiagnosisSessionDetail(openid, diagnosisId) {
  const sql = `
    SELECT
      ds.*,
      up.nickname AS plant_nickname,
      up.canonical_name AS canonical_name,
      up.location AS plant_location
    FROM diagnosis_sessions ds
    LEFT JOIN user_plant_instances up ON up.id = ds.user_plant_id
    WHERE ds.diagnosis_id = {{diagnosisId}} AND ds._openid = {{openid}}
    LIMIT 1
  `
  const result = await models.$runSQL(sql, { diagnosisId, openid })
  const row = result?.data?.executeResultList?.[0]
  if (!row) return null

  const symptomResult = await models.$runSQL(
    `
      SELECT symptom_key, symptom_cn, evidence_source, observed, confidence
      FROM diagnosis_symptom_observations
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY confidence DESC, symptom_key ASC
    `,
    { diagnosisId }
  )
  const rankingResult = await models.$runSQL(
    `
      SELECT problem_key, problem_cn, problem_type, host_compatibility, symptom_support_score,
             evidence_count, weighted_score, rank_no, is_decisive
      FROM diagnosis_problem_rankings
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY rank_no ASC, weighted_score DESC
    `,
    { diagnosisId }
  )
  const followUpResult = await models.$runSQL(
    `
      SELECT question_order, symptom_key, question_text, rationale, information_gain,
             asked, answer_value, answer_confidence, status, created_at, answered_at
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY question_order ASC, id ASC
    `,
    { diagnosisId }
  )

  return {
    _id: row.diagnosis_id,
    plantId: row.user_plant_id,
    plantCatalogId: row.plant_id,
    plantName: row.plant_nickname || row.canonical_name || '未知植物',
    imageUrl: row.image_url || '',
    healthScore: row.health_score === null || row.health_score === undefined ? null : Number(row.health_score),
    healthStatus: row.health_status || 'unknown',
    topProblemKey: row.top_problem_key || '',
    topProblemScore:
      row.top_problem_score === null || row.top_problem_score === undefined
        ? null
        : clampProbability(row.top_problem_score),
    reliabilityScore:
      row.reliability_score === null || row.reliability_score === undefined
        ? null
        : clampProbability(row.reliability_score),
    needsFollowUp: Boolean(Number(row.needs_follow_up || 0)),
    summary: normalizeReliabilitySummary(row.ai_summary || '', row.reliability_score),
    finalProblemCn: row.final_problem_cn || '',
    treatment: row.treatment || '',
    prevention: row.prevention || '',
    createdAt: row.created_at,
    symptoms: (symptomResult?.data?.executeResultList || []).map(item => ({
      symptomKey: item.symptom_key,
      symptomCn: item.symptom_cn,
      evidenceSource: item.evidence_source,
      observed: Boolean(Number(item.observed || 0)),
      confidence: Number(item.confidence || 0)
    })),
    rankings: (rankingResult?.data?.executeResultList || []).map(item => ({
      problemKey: item.problem_key,
      problemCn: item.problem_cn,
      problemType: item.problem_type,
      hostCompatibility: Number(item.host_compatibility || 0),
      symptomSupportScore: Number(item.symptom_support_score || 0),
      evidenceCount: Number(item.evidence_count || 0),
      weightedScore: clampProbability(item.weighted_score),
      rankNo: Number(item.rank_no || 0),
      isDecisive: Boolean(Number(item.is_decisive || 0))
    })),
    followUps: (followUpResult?.data?.executeResultList || []).map(item => ({
      questionOrder: Number(item.question_order || 0),
      symptomKey: item.symptom_key || '',
      questionText: item.question_text,
      rationale: item.rationale || '',
      informationGain: Number(item.information_gain || 0),
      asked: Boolean(Number(item.asked || 0)),
      answerValue: item.answer_value || '',
      answerConfidence:
        item.answer_confidence === null || item.answer_confidence === undefined
          ? null
          : Number(item.answer_confidence),
      status: item.status || 'pending',
      createdAt: item.created_at,
      answeredAt: item.answered_at
    }))
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
      WHERE cause_problem_key = {{problemKey}}
         OR effect_problem_key = {{problemKey}}
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
      WHERE cause_problem_key IN ${sqlInList(keys)}
         OR effect_problem_key IN ${sqlInList(keys)}
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
        ppp.is_genus_candidate
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

  let evidenceByProblem = new Map()
  let symptomsByKey = new Map()

  if (symptomKeys.length) {
    const [symptomResult, evidenceResult] = await Promise.all([
      models.$runSQL(
        `
          SELECT symptom_key, symptom_cn, location_key, base_evidence_weight, symptom_reliability
          FROM symptoms
          WHERE symptom_key IN ${sqlInList(symptomKeys)}
        `,
        {}
      ),
      models.$runSQL(
        `
          SELECT symptom_key, problem_key, association_strength, evidence_reliability
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
        if (!symptomMeta || !evidence) continue

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
          spe.evidence_reliability,
          s.symptom_cn,
          s.location_key,
          s.symptom_reliability,
          s.base_evidence_weight
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
      if (observedSet.has(row.symptom_key) || excludedSet.has(row.symptom_key)) continue
      const candidateMeta = candidateMetaMap.get(row.problem_key)
      if (!candidateMeta) continue
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
  getDiagnosisSessionDetail,
  buildDiagnosisDecision
}
