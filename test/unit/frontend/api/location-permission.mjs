import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const weatherSource = readFileSync('src/api/weather.js', 'utf8')
const headerWeatherSource = readFileSync(
  'src/components/header-weather/useHeaderWeather.js',
  'utf8'
)
const headerWeatherInfoSource = readFileSync('src/components/HeaderWeatherInfo.vue', 'utf8')
const abortControllerSource = readFileSync('src/polyfills/abort-controller.js', 'utf8')

assert.match(weatherSource, /globalThis\.tt/u)
assert.match(weatherSource, /typeof tt !== 'undefined'/u)
assert.match(weatherSource, /douyin\.getLocation\(\{/u)
assert.match(weatherSource, /douyin\.openSetting\(\{/u)
assert.match(weatherSource, /douyin\.getSetting\(\{/u)
assert.match(weatherSource, /scope\.userLocation/u)
assert.match(weatherSource, /const douyinLocation = getDouyinLocation\(\)/u)
assert.match(weatherSource, /errorNumber === 10201/u)
assert.match(weatherSource, /errorNumber === 10202/u)
assert.match(weatherSource, /DOUYIN_LOCATION_PLATFORM_AUTH_ERROR_NO = 10101/u)
assert.match(weatherSource, /platform auth deny/u)
assert.match(weatherSource, /tt\.getLocation 本身会触发首次位置授权/u)
assert.match(weatherSource, /暂未放行定位权限/u)
assert.doesNotMatch(weatherSource, /authorizeDouyinLocation/u)
assert.match(
  headerWeatherSource,
  /permissionStatus === 'denied'[\s\S]*?requestLocationPermission\(\)/u
)
assert.match(headerWeatherSource, /点击获取位置/u)
assert.match(headerWeatherInfoSource, /selectLocation/u)
assert.match(headerWeatherInfoSource, /\[DouyinLocation\] header-click/u)
assert.match(abortControllerSource, /typeof globalThis !== 'undefined'/u)
assert.match(abortControllerSource, /typeof global !== 'undefined'/u)
assert.match(abortControllerSource, /typeof self !== 'undefined'/u)
assert.match(abortControllerSource, /typeof window !== 'undefined'/u)
