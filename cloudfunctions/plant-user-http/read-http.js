'use strict'

const { mapReminderRow: mapWateringReminderRow } = require('./watering-reminder-mapper')
const { mapReminderRow: mapFertilizationReminderRow } = require('./fertilization-reminder-mapper')
const {
  jsonResponse,
  internalServerError,
  getHttpRequestData,
  resolvePlantReadIdentity
} = require('./read-runtime')
const { runCloudbaseSql } = require('./read-sql-runtime')
const { buildUserPlantListSql } = require('./read-list-sql')

const PAGE_SIZE_MAX = 50
function readQaPerformanceProbeId(headers = {}) {
  const normalized = String(headers['x-qa-performance-probe-id'] || '').trim()
  return /^[A-Za-z0-9._:-]{8,120}$/u.test(normalized) ? normalized : ''
}

function createQaRequestTiming(probeId) {
  if (!probeId) {
    return null
  }
  const startedAt = Date.now()
  const marks = []
  return {
    mark(stage, details = {}) {
      marks.push({ stage, elapsed_ms: Date.now() - startedAt, ...details })
    },
    flush() {
      console.log('qa-performance-timing', JSON.stringify({ probeId, marks }))
    }
  }
}

const USER_PLANT_RESPONSE_FIELDS = new Set([
  'id',
  'recordVersion',
  'plantId',
  'plantIdentityId',
  'sessionPlantId',
  'canonicalName',
  'nickname',
  'displayName',
  'recognizedName',
  'sourceType',
  'recognitionType',
  'recognitionConfidence',
  'identityResolutionStatus',
  'visualCallBatchId',
  'location',
  'plantDate',
  'notes',
  'photos',
  'lightEnvironment',
  'airEnvironment',
  'imageFileId',
  'lastWatered',
  'nextWater',
  'createdAt',
  'genus',
  'familyCn',
  'familyEn',
  'latinName',
  'healthStatus',
  'healthScore',
  'potProfile',
  'careLocationId',
  'careLocation',
  'locationKey',
  'wateringReminder',
  'fertilizationReminder'
])

function normalizeText(value = '') {
  const normalized = String(value ?? '').trim()
  return normalized && !['null', 'undefined'].includes(normalized.toLowerCase()) ? normalized : ''
}

function parseJson(value, fallback = null) {
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

function normalizePage(value, fallback, maximum) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

function isUserPlantsPath(path = '') {
  const normalized =
    String(path || '')
      .split('?')[0]
      .replace(/\/+$/u, '') || '/'
  return normalized === '/user-plants' || normalized.endsWith('/user-plants')
}

function isTransientCloudbaseSqlConnectionError(error) {
  // RunMysqlCommand 会把底层连接器的瞬态连接失败包成 PE-MYS-5000。
  // 不能仅按错误码重试：同一错误码也可能包含可复现的 SQL/参数问题。
  const code = String(error?.code || '').trim()
  const message = String(error?.message || '')
  return (
    code === 'PE-MYS-5000' &&
    /SQLSTATE:\s*08000\b/u.test(message) &&
    /(?:detailMessage\s*=\s*)?Connection error\b/iu.test(message)
  )
}

function hasDisplayableIdentity(row = {}) {
  return [
    'plant_id',
    'plant_identity_id',
    'session_plant_id',
    'canonical_name',
    'recognized_name',
    'nickname'
  ].some(field => Boolean(normalizeText(row[field])))
}

function lookupCatalogId(row = {}) {
  return (
    normalizeText(row.plant_identity_id) ||
    normalizeText(row.plant_id) ||
    normalizeText(row.session_plant_id)
  )
}

function mapCareLocation(row) {
  if (!row?.id) {
    return null
  }
  return {
    careLocationId: row.id,
    plantId: row.plant_id,
    userId: row.user_id || row._openid || '',
    openid: row._openid || row.user_id || '',
    locationKey: row.location_key || '',
    cityName: row.city_name || '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    weatherLocation: row.weather_location || '',
    source: row.source || ''
  }
}

function mapPotProfile(row = {}) {
  const substrateType = row.substrate_type || 'unknown'
  const substrateComposition =
    typeof substrateType === 'string' && substrateType.startsWith('[')
      ? parseJson(substrateType, null)
      : null
  const hasDimensions = ['pot_top_diameter_cm', 'pot_bottom_diameter_cm', 'pot_height_cm'].some(
    field => Number(row[field]) > 0
  )
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
    hasDrainageHole: hasDimensions ? row.has_drainage_hole || 'unknown' : 'unknown',
    potMaterial: row.pot_material || 'unknown',
    substrateType,
    substrateComposition,
    profileVersion: Number(row.pot_profile_version || 1),
    source: row.pot_profile_source || 'default',
    confidence: row.pot_profile_confidence || 'low'
  }
}

function compactPlant(item = {}) {
  return Object.fromEntries(
    Object.entries(item).filter(
      ([key, value]) =>
        USER_PLANT_RESPONSE_FIELDS.has(key) &&
        value !== null &&
        value !== undefined &&
        value !== '' &&
        (!Array.isArray(value) || value.length > 0)
    )
  )
}

function mapPlant(row, catalog, enrichment) {
  const canonicalName =
    normalizeText(row.canonical_name) ||
    normalizeText(catalog?.primary_display_name) ||
    normalizeText(catalog?.canonical_identity_name_cn) ||
    normalizeText(catalog?.canonical_identity_name) ||
    normalizeText(row.recognized_name)
  const nickname = normalizeText(row.nickname)
  const careLocation = mapCareLocation(enrichment.care)
  return compactPlant({
    id: row.id,
    recordVersion: Number(row.record_version || 1),
    plantId: normalizeText(row.plant_id),
    plantIdentityId:
      normalizeText(catalog?.plant_identity_id) || normalizeText(row.plant_identity_id),
    sessionPlantId: normalizeText(catalog?.session_plant_id) || normalizeText(row.session_plant_id),
    canonicalName,
    nickname,
    displayName: nickname || canonicalName || normalizeText(row.recognized_name) || '未命名植物',
    recognizedName: normalizeText(row.recognized_name),
    sourceType: row.source_type || 'catalog',
    recognitionType: row.recognition_type || '',
    recognitionConfidence:
      row.recognition_confidence === null || row.recognition_confidence === undefined
        ? null
        : Number(row.recognition_confidence),
    identityResolutionStatus:
      row.identity_resolution_status || (row.plant_identity_id ? 'matched' : 'unresolved'),
    visualCallBatchId: row.visual_call_batch_id || '',
    location: row.location || '未设置',
    plantDate: row.plant_date || null,
    notes: row.notes ?? '',
    photos: parseJson(row.photos, []),
    lightEnvironment: parseJson(row.light_environment_json, null),
    airEnvironment: parseJson(row.air_environment_json, null),
    imageFileId: catalog?.cover_image_ref || '',
    lastWatered: row.last_watered || null,
    nextWater: row.next_water || null,
    createdAt: row.created_at || null,
    genus: catalog?.genus_name || row.plant_genus || '',
    familyCn: catalog?.family_name_cn || '',
    familyEn:
      catalog?.family_name_en || catalog?.family_name_canonical || row.plant_family_en || '',
    latinName:
      catalog?.scientific_name || catalog?.canonical_identity_name_en || row.plant_latin_name || '',
    healthStatus: enrichment.diagnosis?.health_status || 'unknown',
    healthScore:
      enrichment.diagnosis?.health_score === null ||
      enrichment.diagnosis?.health_score === undefined
        ? null
        : Number(enrichment.diagnosis.health_score),
    potProfile: mapPotProfile(row),
    ...(careLocation
      ? {
          careLocationId: careLocation.careLocationId,
          careLocation,
          locationKey: careLocation.locationKey
        }
      : {}),
    ...(enrichment.watering
      ? { wateringReminder: mapWateringReminderRow(enrichment.watering) }
      : {}),
    ...(enrichment.fertilization
      ? { fertilizationReminder: mapFertilizationReminderRow(enrichment.fertilization) }
      : {})
  })
}

function catalogFromRow(row = {}) {
  return row.catalog_plant_identity_id
    ? {
        plant_identity_id: row.catalog_plant_identity_id,
        session_plant_id: row.catalog_session_plant_id,
        canonical_identity_name: row.catalog_canonical_identity_name,
        canonical_identity_name_cn: row.catalog_canonical_identity_name_cn,
        canonical_identity_name_en: row.catalog_canonical_identity_name_en,
        primary_display_name: row.catalog_primary_display_name,
        family_name_cn: row.catalog_family_name_cn,
        family_name_en: row.catalog_family_name_en,
        family_name_canonical: row.catalog_family_name_canonical,
        genus_name: row.catalog_genus_name,
        scientific_name: row.catalog_scientific_name,
        cover_image_ref: row.catalog_cover_image_ref
      }
    : null
}

function enrichmentFromRow(row = {}) {
  return {
    care: row.care_id
      ? {
          id: row.care_id,
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
    watering: row.watering_id
      ? {
          id: row.watering_id,
          user_plant_id: row.watering_user_plant_id,
          plan_id: row.watering_plan_id,
          reminder_type: row.watering_reminder_type,
          status: row.watering_status,
          last_watered: row.watering_last_watered,
          next_water_date: row.watering_next_water_date,
          next_time: row.watering_next_time,
          created_at: row.watering_created_at,
          updated_at: row.watering_updated_at
        }
      : null,
    fertilization: row.fertilization_id
      ? {
          id: row.fertilization_id,
          user_plant_id: row.fertilization_user_plant_id,
          plan_id: row.fertilization_plan_id,
          status: row.fertilization_status,
          reminder_kind: row.fertilization_reminder_kind,
          fertilizer_type: row.fertilization_fertilizer_type,
          rule_month: row.fertilization_rule_month,
          last_applied_date: row.fertilization_last_applied_date,
          last_date_source: row.fertilization_last_date_source,
          next_check_date: row.fertilization_next_check_date,
          next_time: row.fertilization_next_time,
          completed_date: row.fertilization_completed_date,
          expires_at: row.fertilization_expires_at,
          created_at: row.fertilization_created_at,
          updated_at: row.fertilization_updated_at
        }
      : null,
    diagnosis:
      row.diagnosis_health_status === undefined
        ? null
        : { health_status: row.diagnosis_health_status, health_score: row.diagnosis_health_score }
  }
}

async function listUserPlants(
  identity,
  page,
  pageSize,
  timing = null,
  plantId = null,
  dependencies = {}
) {
  const openid = String(identity?.openid || '').trim()
  const userId = String(identity?.userId || '').trim()
  const offset = (page - 1) * pageSize
  const querySql = dependencies.runSql || runCloudbaseSql
  const sql = buildUserPlantListSql({ plantId })
  const params = {
    openid,
    userId,
    limit: pageSize,
    offset,
    ...(plantId === null ? {} : { plantId })
  }
  timing?.mark('list-sql-start')
  let result
  try {
    result = await querySql(sql, params)
  } catch (error) {
    // 只保护本期的列表读请求。详情、写入和身份查询仍保持原有失败语义；
    // 此处是一次串行重试，不会新增数据库竞速或额外授权链路。
    if (plantId !== null || !isTransientCloudbaseSqlConnectionError(error)) {
      throw error
    }
    timing?.mark('list-sql-transient-retry', { code: String(error.code || '') })
    console.warn('plant-user-http/read transient list SQL connection; retrying once', {
      code: String(error.code || ''),
      requestId: String(error.requestId || '').slice(0, 128)
    })
    result = await querySql(sql, params)
  }
  const rows = (result?.data?.executeResultList || []).filter(hasDisplayableIdentity)
  timing?.mark('list-sql-ready', { row_count: rows.length })
  const total = Number(rows[0]?.total_count || 0)
  return {
    list: rows.map(row => mapPlant(row, catalogFromRow(row), enrichmentFromRow(row))),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total
  }
}

async function getUserPlant(identity, plantId, timing = null) {
  const data = await listUserPlants(identity, 1, 1, timing, plantId)
  return data.list[0] || null
}

async function resolvePlantOwnerIdentity(identity) {
  const userId = String(identity?.userId || '').trim()
  if (userId) {
    return { ...identity, userId }
  }
  const openid = String(identity?.openid || '').trim()
  const result = await runCloudbaseSql(
    `SELECT u._id AS user_id
       FROM users u
      WHERE u._openid = {{openid}}
         OR u.wechat_openid = {{openid}}
         OR u.principal_openid = {{openid}}
      LIMIT 1`,
    { openid }
  )
  return {
    ...identity,
    userId: String(result?.data?.executeResultList?.[0]?.user_id || '').trim()
  }
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const qaProbeId = readQaPerformanceProbeId(request.headers)
  const timing = createQaRequestTiming(qaProbeId)
  if (qaProbeId) {
    console.log(
      'qa-performance-probe',
      JSON.stringify({ probeId: qaProbeId, endpoint: 'plant-user-http/user-plants' })
    )
  }
  timing?.mark('request-enter')
  try {
    if (!isUserPlantsPath(request.path) || request.method !== 'GET') {
      return jsonResponse(404, { code: 404, message: '资源不存在', data: null })
    }
    const resolvedIdentity = await resolvePlantReadIdentity(request.headers)
    const identity = resolvedIdentity ? await resolvePlantOwnerIdentity(resolvedIdentity) : null
    if (!identity?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }
    timing?.mark('identity-ready', { source: identity.source || '' })
    const page = normalizePage(request.query.page, 1, Number.MAX_SAFE_INTEGER)
    const pageSize = normalizePage(request.query.pageSize, 20, PAGE_SIZE_MAX)
    const rawPlantId = String(request.query.id || '').trim()
    if (rawPlantId && identity.source === 'signed-http-ticket') {
      // 轻量入口只承载列表。即使有人绕过原生路由直接调用该模块，短票据
      // 也不能扩展为详情授权，详情必须返回既有持久会话路径。
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }
    if (rawPlantId) {
      const plantId = Number(rawPlantId)
      if (!Number.isSafeInteger(plantId) || plantId <= 0) {
        return jsonResponse(400, { code: 400, message: '植物ID无效', data: null })
      }
      const plant = await getUserPlant(identity, plantId, timing)
      if (!plant) {
        return jsonResponse(404, { code: 404, message: '植物不存在或无权限', data: null })
      }
      timing?.mark('response-ready', { row_count: 1, read_kind: 'detail' })
      return jsonResponse(200, { code: 200, data: plant })
    }
    const data = await listUserPlants(identity, page, pageSize, timing)
    timing?.mark('response-ready', { row_count: data.list.length })
    return jsonResponse(200, { code: 200, data })
  } catch (error) {
    console.error('plant-user-http/read error:', {
      code: error?.code || 'PLANT_USER_READ_FAILED',
      message: String(error?.message || '').slice(0, 300),
      requestId: String(error?.requestId || '').slice(0, 128)
    })
    return internalServerError()
  } finally {
    timing?.flush()
  }
}

module.exports = {
  main,
  _test: {
    hasDisplayableIdentity,
    listUserPlants,
    getUserPlant,
    lookupCatalogId,
    mapPlant,
    normalizePage,
    isTransientCloudbaseSqlConnectionError,
    resolvePlantOwnerIdentity
  }
}
