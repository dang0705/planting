'use strict'

const { models } = require('/opt/utils/cloudbase')

const CARE_LOCATION_SOURCE = {
  GPS_MATCHED: 'gps_matched',
  MANUAL_SELECTED: 'manual_selected',
  LEGACY_USER_LOCATION: 'legacy_user_location'
}
const ALLOWED_CARE_LOCATION_SOURCES = new Set(Object.values(CARE_LOCATION_SOURCE))

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeSource(value = '', fallback = CARE_LOCATION_SOURCE.MANUAL_SELECTED) {
  const normalized = normalizeText(value)
  return ALLOWED_CARE_LOCATION_SOURCES.has(normalized) ? normalized : fallback
}

function normalizeCareLocation(input = null) {
  if (!input || typeof input !== 'object') {
    return null
  }
  const locationKey = normalizeText(input.locationKey || input.location_key || input.key)
  const cityName = normalizeText(input.cityName || input.city_name || input.name || input.city)
  const latitude = normalizeNumber(input.latitude ?? input.lat)
  const longitude = normalizeNumber(input.longitude ?? input.lng)
  if (!locationKey || !cityName || latitude === null || longitude === null) {
    return null
  }
  return {
    locationKey,
    cityName,
    latitude,
    longitude,
    weatherLocation:
      normalizeText(input.weatherLocation || input.weather_location) ||
      `${longitude.toFixed(4)},${latitude.toFixed(4)}`,
    source: normalizeSource(input.source)
  }
}

function mapCareLocationRow(row = {}) {
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

async function savePlantCareLocation({ openid = '', plantId = '', careLocation = null } = {}) {
  const normalized = normalizeCareLocation(careLocation)
  const normalizedPlantId = Number(plantId)
  if (!openid || !normalizedPlantId || !normalized) {
    return null
  }

  await models.$runSQL(
    `
      INSERT INTO plant_care_locations (
        _openid, plant_id, user_id, location_key, city_name, latitude, longitude,
        weather_location, source
      ) VALUES (
        {{openid}}, {{plantId}}, {{openid}}, {{locationKey}}, {{cityName}},
        {{latitude}}, {{longitude}}, {{weatherLocation}}, {{source}}
      )
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        location_key = VALUES(location_key),
        city_name = VALUES(city_name),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        weather_location = VALUES(weather_location),
        source = VALUES(source),
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      plantId: normalizedPlantId,
      openid,
      ...normalized
    }
  )

  const result = await models.$runSQL(
    `
      SELECT id, _openid, plant_id, user_id, location_key, city_name, latitude, longitude,
             weather_location, source
      FROM plant_care_locations
      WHERE plant_id = {{plantId}} AND _openid = {{openid}}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    { plantId: normalizedPlantId, openid }
  )
  return mapCareLocationRow(result?.data?.executeResultList?.[0])
}

async function listCareLocationsByPlantIds({ openid = '', plantIds = [] } = {}) {
  const ids = Array.from(
    new Set((Array.isArray(plantIds) ? plantIds : []).map(Number).filter(Boolean))
  )
  if (!openid || !ids.length) {
    return new Map()
  }

  const result = await models.$runSQL(
    `
      SELECT id, _openid, plant_id, user_id, location_key, city_name, latitude, longitude,
             weather_location, source
      FROM plant_care_locations
      WHERE _openid = {{openid}} AND plant_id IN (${ids.map(id => Number(id)).join(',')})
      ORDER BY updated_at DESC, id DESC
    `,
    { openid }
  )
  const map = new Map()
  for (const row of result?.data?.executeResultList || []) {
    if (!map.has(Number(row.plant_id))) {
      map.set(Number(row.plant_id), mapCareLocationRow(row))
    }
  }
  return map
}

function attachCareLocation(plant = {}, careLocation = null) {
  if (!careLocation) {
    return plant
  }
  return {
    ...plant,
    careLocationId: careLocation.careLocationId,
    careLocation,
    locationKey: careLocation.locationKey
  }
}

async function attachCareLocationsToList({ openid = '', data = {} } = {}) {
  const list = Array.isArray(data?.list) ? data.list : []
  const careLocations = await listCareLocationsByPlantIds({
    openid,
    plantIds: list.map(item => item.id)
  }).catch(() => new Map())
  return {
    ...data,
    list: list.map(item => attachCareLocation(item, careLocations.get(Number(item.id))))
  }
}

module.exports = {
  attachCareLocation,
  attachCareLocationsToList,
  CARE_LOCATION_SOURCE,
  normalizeCareLocation,
  normalizeSource,
  savePlantCareLocation
}
