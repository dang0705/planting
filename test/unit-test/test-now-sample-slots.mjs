import assert from 'node:assert/strict'

const {
  buildNowSampleSlotTimes,
  resolveSlotForTriggerName,
  isFinalizeSlot,
  TRIGGER_TO_SLOT,
  NOW_SAMPLE_SLOT_NAMES,
  NOW_SAMPLE_FINALIZE_SLOT
} = await import('../../cloudfunctions/weather-http/services/now-sample-slots.js')

// --- trigger → slot 映射 ---
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunrise__city_shanghai'), 'morning')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunset__city_shanghai'), 'finalize')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunrise'), '')
assert.equal(resolveSlotForTriggerName('weather-d0-now-morning-0920'), 'morning')
assert.equal(resolveSlotForTriggerName('weather-d0-now-forenoon-1220'), 'forenoon')
assert.equal(resolveSlotForTriggerName('weather-d0-now-noon-1420'), 'noon')
assert.equal(resolveSlotForTriggerName('weather-d0-now-afternoon-1820'), 'afternoon')
assert.equal(resolveSlotForTriggerName('weather-d0-now-finalize-2130'), '')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-0630'), 'morning')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-1130'), 'forenoon')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-1530'), 'afternoon')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-finalize-2130'), '')
assert.equal(resolveSlotForTriggerName('unknown-trigger'), '')
assert.equal(isFinalizeSlot('finalize'), true)
assert.equal(isFinalizeSlot('morning'), false)
assert.deepEqual(NOW_SAMPLE_SLOT_NAMES, ['morning', 'forenoon', 'noon', 'afternoon'])
assert.equal(NOW_SAMPLE_FINALIZE_SLOT, 'finalize')

// --- slot 时间规则 ---
// 注意：suncalc 未安装时 buildSunWindow 回退到 sunrise=06:00, sunset=18:00
// 因此 afternoon = sunset+20m = 18:20, finalize = sunset = 18:00
const slotTimes = buildNowSampleSlotTimes({
  date: '2026-06-18',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai'
})

assert.equal(slotTimes.date, '2026-06-18')
assert.equal(slotTimes.timezone, 'Asia/Shanghai')

// morning: sunrise。若 suncalc 已安装，上海 2026-06-18 sunrise 约为 04:51；否则 fallback 到 06:00。
assert.ok(
  /T(04:5\d|06:00):/.test(slotTimes.slots.morning.targetTime),
  `morning should be suncalc sunrise or fallback sunrise, got ${slotTimes.slots.morning.targetTime}`
)

// forenoon: 12:20
assert.ok(
  slotTimes.slots.forenoon.targetTime.includes('12:20'),
  `forenoon should be 12:20, got ${slotTimes.slots.forenoon.targetTime}`
)

// noon: 14:20
assert.ok(
  slotTimes.slots.noon.targetTime.includes('14:20'),
  `noon should be 14:20, got ${slotTimes.slots.noon.targetTime}`
)

// afternoon: sunset+20m = 18:20 (fallback sunset 18:00)
assert.ok(
  slotTimes.slots.afternoon.targetTime.includes('18:20'),
  `afternoon should be 18:20 (sunset+20m), got ${slotTimes.slots.afternoon.targetTime}`
)

// finalize: sunset
assert.ok(
  slotTimes.finalize.targetTime.includes('18:00'),
  `finalize should be sunset, got ${slotTimes.finalize.targetTime}`
)

// --- 验证 sunrise/sunset 被正确传入 ---
assert.ok(
  slotTimes.sunrise.includes('06:00'),
  `sunrise fallback should be 06:00, got ${slotTimes.sunrise}`
)
assert.ok(
  slotTimes.sunset.includes('18:00'),
  `sunset fallback should be 18:00, got ${slotTimes.sunset}`
)

// --- TRIGGER_TO_SLOT 完整性 ---
assert.equal(Object.keys(TRIGGER_TO_SLOT).length, 7)

console.log('now-sample-slots tests passed')
