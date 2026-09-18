import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const weatherSource = readFileSync(
  'src/subpackages/care/watering-advisor/useWateringAdvisorWeather.js',
  'utf8'
)
const advisorSource = readFileSync(
  'src/subpackages/care/watering-advisor/watering-advisor.vue',
  'utf8'
)

assert.match(weatherSource, /checkLocationPermission/u)
assert.match(weatherSource, /requestLocationPermission/u)
assert.match(weatherSource, /getCurrentLocation/u)
assert.match(weatherSource, /async function prepareWeatherOnEntry\(\)/u)
assert.match(weatherSource, /await loadWeatherDays\(\)/u)
assert.ok(
  weatherSource.indexOf('await checkLocationPermission()') <
    weatherSource.indexOf('await requestLocationPermission()'),
  '天气准备必须先检查并处理位置授权'
)
assert.ok(
  weatherSource.indexOf('await requestLocationPermission()') <
    weatherSource.indexOf('await getCurrentLocation()'),
  '位置授权通过后才能读取当前位置'
)
assert.ok(
  weatherSource.indexOf('await getCurrentLocation()') <
    weatherSource.indexOf('await loadWeatherDays()'),
  '获取当前位置后才能请求天气窗口'
)
assert.match(advisorSource, /prepareWeatherOnEntry\(\)\.catch\(\(\) => \{\}\)/u)
assert.match(
  advisorSource,
  /await prepareWeatherOnEntry\(\)[\s\S]*?locationPermissionStatus\.value === 'authorized'[\s\S]*?await loadWeatherDays\(\)/u
)

console.log(
  'watering advisor location-weather bootstrap contracts passed data_mode=unit_fake test_kind=source_contract'
)
