'use strict'

const { buildLocationKey } = require('../services/weather-cache-paths')

let fallbackCloudBaseApp = null

function buildCloudBaseInitOptions() {
  const env = String(process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || '').trim()
  const secretId = String(
    process.env.CLOUDBASE_SECRET_ID || process.env.TENCENT_SECRET_ID || process.env.TENCENTCLOUD_SECRETID || ''
  ).trim()
  const secretKey = String(
    process.env.CLOUDBASE_SECRET_KEY ||
      process.env.TENCENT_SECRET_KEY ||
      process.env.TENCENTCLOUD_SECRETKEY ||
      ''
  ).trim()
  return {
    ...(env ? { env } : {}),
    ...(secretId && secretKey ? { secretId, secretKey } : {})
  }
}

function loadNodeSdkModels() {
  if (!fallbackCloudBaseApp) {
    const cloudbase = require('@cloudbase/node-sdk')
    fallbackCloudBaseApp = cloudbase.init(buildCloudBaseInitOptions())
  }
  if (!fallbackCloudBaseApp?.models) {
    throw new Error('CloudBase Node SDK 未暴露 models')
  }
  return fallbackCloudBaseApp.models
}

function loadFallbackModels() {
  return {
    async $runSQL() {
      throw new Error('缺少 CloudBase models，请在测试中注入 sqlModels')
    }
  }
}

function loadDefaultModels() {
  try {
    return require('/opt/utils/cloudbase').models
  } catch {
    try {
      return loadNodeSdkModels()
    } catch {
      return loadFallbackModels()
    }
  }
}

function formatSqlDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true
  }
  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false
  }
  return fallback
}

function normalizeListLimit(value = 20) {
  const numericLimit = Number(value)
  if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
    return 20
  }
  return Math.min(100, Math.max(1, Math.trunc(numericLimit)))
}

function normalizeWeatherLocation(input = {}) {
  const locationKey = buildLocationKey(input)
  if (!locationKey) {
    throw new Error('缺少天气地点 locationKey 或 QWeather LocationID')
  }

  return {
    locationKey,
    qweatherLocationId: String(input.qweatherLocationId || input.qweather_location_id || '').trim(),
    cityName: String(input.cityName || input.city || input.city_name || '').trim(),
    timezone: String(input.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai',
    isActive: normalizeBoolean(input.isActive ?? input.is_active, true),
    lastUsedAt: input.lastUsedAt || input.last_used_at || null,
    recentObjectPath: String(input.recentObjectPath || input.recent_object_path || '').trim(),
    recentFileId: String(input.recentFileId || input.recent_file_id || '').trim(),
    manifestObjectPath: String(input.manifestObjectPath || input.manifest_object_path || '').trim(),
    manifestFileId: String(input.manifestFileId || input.manifest_file_id || '').trim(),
    recentGeneratedAt: input.recentGeneratedAt || input.recent_generated_at || null,
    createdAt: input.createdAt || input.created_at || null,
    updatedAt: input.updatedAt || input.updated_at || null
  }
}

function mapWeatherLocationRow(row = {}) {
  if (!row) {
    return null
  }
  return normalizeWeatherLocation({
    locationKey: row.location_key || row.locationKey,
    qweatherLocationId: row.qweather_location_id || row.qweatherLocationId,
    cityName: row.city_name || row.cityName,
    timezone: row.timezone,
    isActive: row.is_active ?? row.isActive,
    lastUsedAt: row.last_used_at || row.lastUsedAt,
    recentObjectPath: row.recent_object_path || row.recentObjectPath,
    recentFileId: row.recent_file_id || row.recentFileId,
    manifestObjectPath: row.manifest_object_path || row.manifestObjectPath,
    manifestFileId: row.manifest_file_id || row.manifestFileId,
    recentGeneratedAt: row.recent_generated_at || row.recentGeneratedAt,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  })
}

function createWeatherLocationRepository({ sqlModels = loadDefaultModels() } = {}) {
  async function findByLocationKey(locationKey = '') {
    const key = String(locationKey || '').trim()
    if (!key) {
      return null
    }

    const result = await sqlModels.$runSQL(
      `
        SELECT location_key, qweather_location_id, city_name, timezone, is_active,
               last_used_at, recent_object_path, recent_file_id,
               manifest_object_path, manifest_file_id, recent_generated_at,
               created_at, updated_at
        FROM weather_locations
        WHERE location_key = {{locationKey}}
        LIMIT 1
      `,
      { locationKey: key }
    )
    const row = (result?.data?.executeResultList || [])[0]
    return row ? mapWeatherLocationRow(row) : null
  }

  async function listActiveLocations({ limit = 20 } = {}) {
    const safeLimit = normalizeListLimit(limit)
    const result = await sqlModels.$runSQL(
      `
        SELECT location_key, qweather_location_id, city_name, timezone, is_active,
               last_used_at, recent_object_path, recent_file_id,
               manifest_object_path, manifest_file_id, recent_generated_at,
               created_at, updated_at
        FROM weather_locations
        WHERE is_active = 1
          AND qweather_location_id <> ''
        ORDER BY last_used_at DESC, updated_at DESC
        LIMIT {{limit}}
      `,
      { limit: safeLimit }
    )
    return (result?.data?.executeResultList || []).map(mapWeatherLocationRow).filter(Boolean)
  }

  async function upsertLocation(input = {}) {
    const location = normalizeWeatherLocation(input)
    const now = formatSqlDateTime()
    const existing = await findByLocationKey(location.locationKey)
    const params = {
      locationKey: location.locationKey,
      qweatherLocationId: location.qweatherLocationId,
      cityName: location.cityName,
      timezone: location.timezone,
      isActive: location.isActive ? 1 : 0,
      lastUsedAt: formatSqlDateTime(location.lastUsedAt || now),
      recentObjectPath: location.recentObjectPath,
      recentFileId: location.recentFileId,
      manifestObjectPath: location.manifestObjectPath,
      manifestFileId: location.manifestFileId,
      recentGeneratedAt: location.recentGeneratedAt
        ? formatSqlDateTime(location.recentGeneratedAt)
        : null,
      now
    }

    if (existing) {
      await sqlModels.$runSQL(
        `
          UPDATE weather_locations
          SET qweather_location_id = {{qweatherLocationId}},
              city_name = {{cityName}},
              timezone = {{timezone}},
              is_active = {{isActive}},
              last_used_at = {{lastUsedAt}},
              recent_object_path = COALESCE(NULLIF({{recentObjectPath}}, ''), recent_object_path),
              recent_file_id = COALESCE(NULLIF({{recentFileId}}, ''), recent_file_id),
              manifest_object_path = COALESCE(NULLIF({{manifestObjectPath}}, ''), manifest_object_path),
              manifest_file_id = COALESCE(NULLIF({{manifestFileId}}, ''), manifest_file_id),
              recent_generated_at = COALESCE({{recentGeneratedAt}}, recent_generated_at),
              updated_at = {{now}}
          WHERE location_key = {{locationKey}}
        `,
        params
      )
      return {
        ...existing,
        ...location,
        recentObjectPath: location.recentObjectPath || existing.recentObjectPath || '',
        recentFileId: location.recentFileId || existing.recentFileId || '',
        manifestObjectPath: location.manifestObjectPath || existing.manifestObjectPath || '',
        manifestFileId: location.manifestFileId || existing.manifestFileId || '',
        recentGeneratedAt: location.recentGeneratedAt || existing.recentGeneratedAt || null,
        updatedAt: now
      }
    }

    await sqlModels.$runSQL(
      `
        INSERT INTO weather_locations (
          location_key, qweather_location_id, city_name, timezone, is_active,
          last_used_at, recent_object_path, recent_file_id,
          manifest_object_path, manifest_file_id, recent_generated_at,
          created_at, updated_at
        ) VALUES (
          {{locationKey}}, {{qweatherLocationId}}, {{cityName}}, {{timezone}}, {{isActive}},
          {{lastUsedAt}}, {{recentObjectPath}}, {{recentFileId}},
          {{manifestObjectPath}}, {{manifestFileId}}, {{recentGeneratedAt}},
          {{now}}, {{now}}
        )
      `,
      params
    )
    return { ...location, createdAt: now, updatedAt: now }
  }

  async function updateRecentObjectMetadata({
    locationKey = '',
    recentObjectPath = '',
    recentFileId = '',
    manifestObjectPath = '',
    manifestFileId = '',
    recentGeneratedAt = new Date()
  } = {}) {
    const key = String(locationKey || '').trim()
    if (!key) {
      return null
    }

    await sqlModels.$runSQL(
      `
        UPDATE weather_locations
        SET recent_object_path = {{recentObjectPath}},
            recent_file_id = {{recentFileId}},
            manifest_object_path = COALESCE(NULLIF({{manifestObjectPath}}, ''), manifest_object_path),
            manifest_file_id = COALESCE(NULLIF({{manifestFileId}}, ''), manifest_file_id),
            recent_generated_at = {{recentGeneratedAt}},
            updated_at = {{updatedAt}}
        WHERE location_key = {{locationKey}}
      `,
      {
        locationKey: key,
        recentObjectPath,
        recentFileId,
        manifestObjectPath,
        manifestFileId,
        recentGeneratedAt: formatSqlDateTime(recentGeneratedAt),
        updatedAt: formatSqlDateTime()
      }
    )
    return findByLocationKey(key)
  }

  return {
    findByLocationKey,
    listActiveLocations,
    upsertLocation,
    updateRecentObjectMetadata
  }
}

module.exports = {
  createWeatherLocationRepository,
  formatSqlDateTime,
  mapWeatherLocationRow,
  normalizeListLimit,
  normalizeWeatherLocation
}
