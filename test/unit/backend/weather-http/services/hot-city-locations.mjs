import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  ALLOWED_HOT_CITY_SOURCES,
  HOT_CITY_WEATHER_LOCATIONS,
  HOT_CITY_SOURCE,
  listHotCitiesForClient,
  resolveHotCityByKeyOrName,
  resolveHotCityLocation,
  roundCoordinatesForHotCity,
  toSelectedHotCity
} = require('../../../../../cloudfunctions/weather-http/services/hot-city-locations.js')

assert.equal(HOT_CITY_WEATHER_LOCATIONS.length, 20)
assert.deepEqual(Array.from(ALLOWED_HOT_CITY_SOURCES).sort(), [
  'gps_matched',
  'legacy_user_location',
  'manual_selected'
])
for (const city of HOT_CITY_WEATHER_LOCATIONS) {
  assert.match(city.key, /^city:/)
  assert.match(city.latitude.toFixed(4), /^-?\d+\.\d{4}$/)
  assert.match(city.longitude.toFixed(4), /^-?\d+\.\d{4}$/)
  assert.equal(Number.isFinite(city.radiusM), true)
}

const centers = HOT_CITY_WEATHER_LOCATIONS.map(city => resolveHotCityLocation(city))
assert.equal(
  centers.every(result => result.matched),
  true
)
assert.deepEqual(
  centers.map(result => result.city.locationKey),
  HOT_CITY_WEATHER_LOCATIONS.map(city => city.key)
)
assert.equal(
  centers.every(result => result.city.source === HOT_CITY_SOURCE.GPS_MATCHED),
  true
)

assert.deepEqual(roundCoordinatesForHotCity({ latitude: 31.2349, longitude: 121.476 }), {
  latitude: 31.23,
  longitude: 121.48
})

const foshanSide = resolveHotCityLocation({ latitude: 23.02, longitude: 113.13 })
assert.equal(foshanSide.matched, true)
assert.equal(foshanSide.city.locationKey, 'city:foshan', '必须按最近城市匹配，不按列表首个半径命中')

const outside = resolveHotCityLocation({ latitude: 26.9, longitude: 119.3 })
assert.equal(outside.matched, false)
assert.equal(outside.reason, 'nearest_city_outside_radius')
assert.equal(Boolean(outside.nearestCity?.key), true)

const selected = toSelectedHotCity(resolveHotCityByKeyOrName('上海'))
assert.equal(selected.locationKey, 'city:shanghai')
assert.equal(selected.weatherLocation, '121.4737,31.2304')
assert.equal(selected.cityName, '上海')
assert.equal(selected.source, HOT_CITY_SOURCE.MANUAL_SELECTED)

const clientList = listHotCitiesForClient()
assert.equal(clientList.length, 20)
assert.equal(clientList[2].name, '广州')
assert.equal(clientList[2].weatherLocation, '113.2644,23.1291')
assert.equal(
  clientList.every(item => /^\d+\.\d{4},\d+\.\d{4}$/.test(item.weatherLocation)),
  true
)
assert.equal(
  HOT_CITY_WEATHER_LOCATIONS.every(city => {
    const client = clientList.find(item => item.key === city.key)
    return (
      client &&
      client.latitude === city.latitude &&
      client.longitude === city.longitude &&
      client.radiusM === city.radiusM
    )
  }),
  true
)

console.log('hot-city-locations tests passed')
