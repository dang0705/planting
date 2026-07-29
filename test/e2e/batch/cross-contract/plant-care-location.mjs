import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []

Module._load = function patchedPlantCareLocationLoad(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        async $runSQL(sql, params = {}) {
          sqlCalls.push({ sql, params })
          if (/SELECT id, _openid, plant_id/.test(sql)) {
            return {
              data: {
                executeResultList: [
                  {
                    id: 'pcl_1',
                    _openid: params.openid || 'openid_1',
                    plant_id: params.plantId || 101,
                    user_id: params.openid || 'openid_1',
                    location_key: params.locationKey || 'city:shanghai',
                    city_name: params.cityName || '上海',
                    latitude: params.latitude || 31.2304,
                    longitude: params.longitude || 121.4737,
                    weather_location: params.weatherLocation || '121.4737,31.2304',
                    source: params.source || 'manual_selected'
                  }
                ]
              }
            }
          }
          return { data: { executeResultList: [] } }
        }
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  const {
    attachCareLocation,
    normalizeCareLocation,
    savePlantCareLocation
  } = require('../../../../cloudfunctions/plant-user-http/care-location-service.js')

  const normalized = normalizeCareLocation({
    key: 'city:shanghai',
    name: '上海',
    latitude: 31.2304,
    longitude: 121.4737
  })
  assert.deepEqual(normalized, {
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    weatherLocation: '121.4737,31.2304',
    source: 'manual_selected'
  })
  assert.equal(
    normalizeCareLocation({ ...normalized, source: 'unexpected_source' }).source,
    'manual_selected'
  )
  assert.equal(normalizeCareLocation({ cityName: '上海' }), null)

  const saved = await savePlantCareLocation({
    openid: 'openid_1',
    plantId: 101,
    careLocation: { ...normalized, source: 'legacy_user_location' }
  })
  assert.equal(saved.careLocationId, 'pcl_1')
  assert.equal(saved.locationKey, 'city:shanghai')
  assert.match(sqlCalls[0].sql, /INSERT INTO plant_care_locations/)
  assert.match(sqlCalls[0].sql, /_openid/)
  assert.equal(sqlCalls[0].params.plantId, 101)
  assert.equal(sqlCalls[0].params.openid, 'openid_1')
  assert.equal(sqlCalls[0].params.weatherLocation, '121.4737,31.2304')
  assert.equal(sqlCalls[0].params.source, 'legacy_user_location')
  assert.match(sqlCalls[1].sql, /WHERE plant_id = {{plantId}} AND _openid = {{openid}}/)

  const attached = attachCareLocation({ id: 101, nickname: '绿萝' }, saved)
  assert.equal(attached.careLocationId, 'pcl_1')
  assert.equal(attached.locationKey, 'city:shanghai')
  assert.equal(attached.careLocation.cityName, '上海')

  const ddl = readFileSync('scripts/sql/ensure-weather-history-cache-tables.sql', 'utf8')
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS plant_care_locations/)
  assert.match(ddl, /_openid VARCHAR\(64\) NOT NULL DEFAULT ''/)
  assert.match(ddl, /UNIQUE KEY uk_plant_care_locations_openid_plant \(_openid, plant_id\)/)
  assert.match(ddl, /weather_location VARCHAR\(64\)/)

  const careLocationUtils = readFileSync('src/utils/plant-care-location.js', 'utf8')
  assert.match(careLocationUtils, /export function clearSelectedPlantCareLocation\(\)/)
  assert.match(careLocationUtils, /uni\.removeStorageSync\(STORAGE_KEY\)/)
  assert.match(
    careLocationUtils,
    /if \(hasOwnPayloadField\(payload, 'careLocation'\)\) \{\s*return normalizePlantCareLocation\(payload\.careLocation\)\s*\}/
  )
  assert.match(
    careLocationUtils,
    /return allowStorageFallback \? readSelectedPlantCareLocation\(\) : null/
  )
  assert.doesNotMatch(
    careLocationUtils,
    /payload\.careLocation \|\| payload\.plantCareLocation \|\| readSelectedPlantCareLocation/
  )

  const plantsApi = readFileSync('src/api/plants-http.js', 'utf8')
  assert.match(
    plantsApi,
    /createUserPlant\(payload\)[\s\S]*withCareLocation\(payload, \{ allowStorageFallback: true \}\)/
  )
  assert.match(
    plantsApi,
    /patchUserPlant\(payload\)[\s\S]*withCareLocation\(payload, \{ allowStorageFallback: false \}\)/
  )

  const plantForm = readFileSync('src/pages/add-plant/components/PlantForm.vue', 'utf8')
  assert.match(plantForm, /clearSelectedPlantCareLocation/)
  assert.match(
    plantForm,
    /const hasExistingCareLocation = Boolean\(selectedCareLocation\.value\)[\s\S]*if \(!hasExistingCareLocation\) \{\s*clearSelectedPlantCareLocation\(\)\s*\}/
  )
  assert.match(plantForm, /selectedCareLocation\.value\.locationKey === city\.locationKey/)
  assert.doesNotMatch(plantForm, /city:guangzhou.*当前定位|广州.*当前定位/)
} finally {
  Module._load = originalLoad
}

console.log('plant-care-location tests passed')
