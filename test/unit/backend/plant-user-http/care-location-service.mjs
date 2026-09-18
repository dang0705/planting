import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../../../../cloudfunctions/plant-user-http/care-location-service.js')

function loadService() {
  const originalLoad = Module._load
  const calls = []
  delete require.cache[servicePath]
  Module._load = function loadCareLocationDependency(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return {
        models: {
          async $runSQL(sql, params) {
            calls.push({ sql, params })
            if (sql.includes('SELECT')) {
              return {
                data: {
                  executeResultList: [
                    {
                      id: 1,
                      _openid: 'openid_1',
                      plant_id: 7,
                      user_id: 'openid_1',
                      location_key: 'city:shanghai',
                      city_name: '上海',
                      latitude: 31.2304,
                      longitude: 121.4737,
                      weather_location: '121.4737,31.2304',
                      source: 'manual_selected'
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
    return { service: require(servicePath), calls }
  } finally {
    Module._load = originalLoad
    delete require.cache[servicePath]
  }
}

const { service, calls } = loadService()
const result = await service.savePlantCareLocation({
  openid: 'openid_1',
  plantId: 7,
  careLocation: {
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    weatherLocation: '121.4737,31.2304',
    source: 'manual_selected'
  }
})

assert.equal(result.cityName, '上海')
assert.equal(calls.length, 2)
const writeCall = calls[0]
assert.match(writeCall.sql, /created_at,\s*updated_at/u)
assert.match(writeCall.sql, /updated_at\s*=\s*\{\{updatedAt\}\}/u)
assert.doesNotMatch(writeCall.sql, /CURRENT_TIMESTAMP/u)
assert.equal(Number.isInteger(writeCall.params.createdAt), true)
assert.equal(Number.isInteger(writeCall.params.updatedAt), true)
assert.equal(writeCall.params.createdAt, writeCall.params.updatedAt)

console.log('care location bigint timestamp contract passed')
