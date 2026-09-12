import assert from 'node:assert/strict'
import {
  buildWeatherByDateFromEnvironmentWeatherWindow,
  resolveEnvironmentWeatherWindowNotice
} from '../../../../src/utils/care-behavior-weather-window.js'

// data_mode=unit_fake; test_kind=logic_boundary
// 重点验证：天气来源必须按日期安全合并，不能把旧 currentWeather 冒充今天。

const baseWindow = {
  meta: { diagnosisDate: '2026-08-30' },
  historicalDays: [
    { date: '2026-08-29', tempMaxC: 30, tempMinC: 24, humidity: 70, textDay: '多云' }
  ],
  currentWeather: {
    tempC: 31,
    humidity: 62,
    text: '晴',
    obsTime: '2026-08-30T12:00+08:00',
    source: 'qweather_weather_now'
  }
}

const withObservedDate = buildWeatherByDateFromEnvironmentWeatherWindow(baseWindow)
assert.equal(withObservedDate['2026-08-30'].temperature, 31)
assert.equal(withObservedDate['2026-08-30'].humidity, 62)
assert.equal(withObservedDate['2026-08-30'].source, 'qweather_weather_now')

const withStaleCurrent = buildWeatherByDateFromEnvironmentWeatherWindow({
  ...baseWindow,
  currentWeather: { ...baseWindow.currentWeather, obsTime: '2026-08-29T23:59+08:00' }
})
assert.equal(Object.hasOwn(withStaleCurrent, '2026-08-30'), false)

const withArchiveSample = buildWeatherByDateFromEnvironmentWeatherWindow({
  ...baseWindow,
  todayWeatherSource: 'day_latest_sample',
  currentWeather: { temp: 29, humidity: 66, text: '阴' }
})
assert.equal(withArchiveSample['2026-08-30'].temperature, 29)

const withCachedHistoricalSource = buildWeatherByDateFromEnvironmentWeatherWindow({
  meta: { diagnosisDate: '2026-08-30', sourceKind: 'weather_cache_recent_10d' },
  historicalDays: [{ date: '2026-08-29', humidity: 68 }],
  forecastDays: [{ date: '2026-08-31', humidity: 55 }],
  todayWeatherSource: 'day_latest_sample',
  currentWeather: { tempC: 30, humidity: 64, text: '晴', source: 'weather_cache_day_latest_sample' }
})
assert.equal(withCachedHistoricalSource['2026-08-29'].source, 'weather_cache_recent_10d')
assert.equal(withCachedHistoricalSource['2026-08-30'].source, 'weather_cache_day_latest_sample')
assert.equal(withCachedHistoricalSource['2026-08-30'].temperature, 30)

assert.equal(
  resolveEnvironmentWeatherWindowNotice({
    meta: { diagnosisDate: '2026-08-30', quality: 'partial' },
    historicalDays: [{ date: '2026-08-29', missing: true }]
  }),
  '最近 10 天有部分天气记录缺失，日期仍可继续填写。'
)
assert.equal(
  resolveEnvironmentWeatherWindowNotice({
    meta: { diagnosisDate: '2026-08-30' },
    historicalDays: []
  }),
  '最近 10 天的天气记录暂未准备好，养护记录仍可继续填写。'
)

console.log('care behavior weather window date-safety tests passed data_mode=unit_fake')
