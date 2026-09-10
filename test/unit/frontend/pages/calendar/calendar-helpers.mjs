import assert from 'node:assert/strict'

import {
  addDays,
  dateText,
  formatPlantingAge,
  getTaskIcon,
  getTaskName,
  normalizeForecast,
  resolveHealthStatusPresentation,
  resolveWeatherIcon,
  solarTermTip
} from '../../../../../src/pages/calendar/calendar-helpers.js'

assert.equal(resolveWeatherIcon('小雨'), '🌧️')
assert.equal(resolveWeatherIcon('晴朗'), '☀️')
assert.deepEqual(normalizeForecast([{ fxDate: '2026-08-14', textDay: '晴', tempMax: 31 }]), [
  { date: '2026-08-14', weekday: '今天', icon: '☀️', temp: 31 }
])
assert.equal(getTaskIcon('water'), '💧')
assert.equal(getTaskName('water'), '浇水')
assert.match(solarTermTip('冬至'), /低温/u)
assert.equal(dateText(new Date(2026, 7, 14)), '2026-08-14')
assert.equal(dateText(addDays(new Date(2026, 7, 14), 1)), '2026-08-15')
assert.equal(formatPlantingAge('2026-08-29', new Date(2026, 7, 28)), '计划于 2026-08-29 种植')
assert.equal(formatPlantingAge('2026-08-28', new Date(2026, 7, 28)), '今天种植')
assert.equal(formatPlantingAge('2026-08-26', new Date(2026, 7, 28)), '已种植 2 天')
assert.deepEqual(resolveHealthStatusPresentation('unknown'), {
  label: '状态待评估',
  className: 'bg-gray-100 text-gray-600'
})

console.log('calendar helper tests passed')
