import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const plannerSource = readFileSync(
  'src/pages/index/components/useWateringReminderPlanner.js',
  'utf8'
)
const sheetSource = readFileSync('src/pages/index/components/WateringReminderSheet.vue', 'utf8')

assert.match(plannerSource, /checkLocationPermission/u)
assert.match(plannerSource, /requestLocationPermission/u)
assert.match(plannerSource, /getCurrentLocation/u)
assert.match(plannerSource, /async function prepareWeatherLocation\(\)/u)
assert.ok(
  plannerSource.indexOf('await checkLocationPermission()') <
    plannerSource.indexOf('await requestLocationPermission()'),
  '首页浇水提醒必须先检查并处理位置授权'
)
assert.ok(
  plannerSource.indexOf('await requestLocationPermission()') <
    plannerSource.indexOf('await getCurrentLocation()'),
  '首页浇水提醒必须在位置授权通过后读取当前位置'
)
assert.match(
  plannerSource,
  /const locationReady = await prepareWeatherLocation\(\)[\s\S]*?if \(!locationReady\)/u
)
assert.match(
  plannerSource,
  /if \(!locationReady\)[\s\S]*?return false[\s\S]*?const plantCareLocation/u
)
assert.match(
  sheetSource,
  /async function open\(\)[\s\S]*?await nextTick\(\)[\s\S]*?loadWeatherDays\(\)\.catch/u
)

console.log(
  'watering reminder location-weather bootstrap contracts passed data_mode=unit_fake test_kind=source_contract'
)
