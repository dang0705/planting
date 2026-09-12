import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  normalizeWateringEvent,
  normalizeCareBehaviorTimeline
} = require('../../../../../cloudfunctions/layer/utils/watering-schedule.js')

assert.equal(
  normalizeWateringEvent({
    date: '2026-08-28',
    watered: false,
    amount: 'thorough'
  }),
  null,
  '明确未浇水事件不能被金额字段改写成已浇水'
)

const sameDay = normalizeCareBehaviorTimeline({
  referenceDate: '2026-08-28',
  watering_events_10d: [
    { date: '2026-08-28', watered: true, amount: 'small', source: 'manual', id: 'a' },
    { date: '2026-08-28', watered: true, amount: 'normal', source: 'manual', id: 'b' }
  ]
})
assert.equal(sameDay.watering_events_10d.length, 2, '同日不同事件必须分别计入')

const baseline = normalizeCareBehaviorTimeline({
  referenceDate: '2026-08-28',
  baselineIntervalDays: [10, 20],
  watering_events_10d: [{ date: '2026-08-20', watered: true, amount: 'normal' }]
})
assert.equal(baseline.summary.lookbackWindowDays, 30, '回看窗口必须来自属级频率而非固定 5~8 天')

const boundary = normalizeCareBehaviorTimeline({
  referenceDate: '2026-09-01',
  watering_events_10d: [{ date: '2026-08-22', watered: true, amount: 'normal' }]
})
assert.equal(boundary.watering_events_10d.length, 1, '前端可选的第 10 天边界记录不能被归一化丢弃')

console.log('watering schedule P0 contracts passed data_mode=unit_fake test_kind=unit_logic')
