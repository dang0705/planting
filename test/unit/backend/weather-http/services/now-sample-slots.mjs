import assert from 'node:assert/strict'

const {
  buildNowSampleSlotTimes,
  resolveSlotForTriggerName,
  isFinalizeSlot,
  TRIGGER_TO_SLOT,
  NOW_SAMPLE_SLOT_NAMES,
  NOW_SAMPLE_FINALIZE_SLOT
} = await import('../../../../../cloudfunctions/weather-http/services/now-sample-slots.js')

// --- trigger → slot 映射 ---

// 1. 固定 D0 now 定时器必须映射到正确的语义 slot 名
assert.equal(resolveSlotForTriggerName('weather-d0-now-morning-0720'), 'morning')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunrise-sweep'), 'sunrise')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunrise-sweep-0450'), 'sunrise')
assert.equal(resolveSlotForTriggerName('weather-d0-now-forenoon-1120'), 'forenoon')
assert.equal(resolveSlotForTriggerName('weather-d0-now-noon-1420'), 'noon')
assert.equal(resolveSlotForTriggerName('weather-d0-now-afternoon-1620'), 'afternoon')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunset-sweep'), 'sunset')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunset-sweep-1900'), 'sunset')

// 1a. 旧定时器名不再是活跃配置的 timer
assert.equal(resolveSlotForTriggerName('weather-d0-now-morning-0920'), '', '旧 morning-0920 不应再解析为 slot')
assert.equal(resolveSlotForTriggerName('weather-d0-now-forenoon-1220'), '', '旧 forenoon-1220 不应再解析为 slot')
assert.equal(resolveSlotForTriggerName('weather-d0-now-afternoon-1820'), '', '旧 afternoon-1820 不应再解析为 slot')

// 2. sunrise/sunset 动态触发器是 D0 第一枪/最后一枪
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunrise__city_shanghai'), 'sunrise', 'sunrise 触发器应解析为 sunrise slot')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunset__city_shanghai'), 'sunset', 'sunset 触发器应解析为 sunset slot，不得解析为 finalize')
assert.equal(resolveSlotForTriggerName('weather-d0-now-sunrise'), '')
assert.equal(resolveSlotForTriggerName('weather-d0-now-finalize-2130'), 'finalize')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-0630'), 'morning')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-1130'), 'forenoon')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-1530'), 'afternoon')
assert.equal(resolveSlotForTriggerName('weather-d0-24h-finalize-2130'), '')
assert.equal(resolveSlotForTriggerName('unknown-trigger'), '')
assert.equal(isFinalizeSlot('finalize'), true)
assert.equal(isFinalizeSlot('morning'), false)
assert.deepEqual(NOW_SAMPLE_SLOT_NAMES, ['sunrise', 'morning', 'forenoon', 'noon', 'afternoon', 'sunset'])
assert.equal(NOW_SAMPLE_FINALIZE_SLOT, 'finalize')

// --- slot 时间规则 ---
// 4 个固定 slot 的目标时间与定时器 cron 对齐
const slotTimes = buildNowSampleSlotTimes({
  date: '2026-06-18',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai'
})

assert.equal(slotTimes.date, '2026-06-18')
assert.equal(slotTimes.timezone, 'Asia/Shanghai')

// morning: 07:20
assert.ok(
  slotTimes.slots.morning.targetTime.includes('07:20'),
  `morning should be 07:20, got ${slotTimes.slots.morning.targetTime}`
)

// forenoon: 11:20
assert.ok(
  slotTimes.slots.forenoon.targetTime.includes('11:20'),
  `forenoon should be 11:20, got ${slotTimes.slots.forenoon.targetTime}`
)

// noon: 14:20
assert.ok(
  slotTimes.slots.noon.targetTime.includes('14:20'),
  `noon should be 14:20, got ${slotTimes.slots.noon.targetTime}`
)

// afternoon: 16:20
assert.ok(
  slotTimes.slots.afternoon.targetTime.includes('16:20'),
  `afternoon should be 16:20, got ${slotTimes.slots.afternoon.targetTime}`
)

assert.equal(slotTimes.slots.sunrise.slotName, 'sunrise')
assert.equal(slotTimes.slots.sunrise.targetTime, slotTimes.sunrise)
assert.equal(slotTimes.slots.sunset.slotName, 'sunset')
assert.equal(slotTimes.slots.sunset.targetTime, slotTimes.sunset)

// buildNowSampleSlotTimes 不返回 finalize slot；sunset 是 sample slot，不是 finalize。
assert.equal(slotTimes.finalize, undefined, 'buildNowSampleSlotTimes 不应再返回 finalize slot')
assert.equal(slotTimes.slots.finalize, undefined, 'slots 中不应有 finalize')

// sunrise/sunset 同时用于 daylight window 和 D0 边界 sample
assert.ok(slotTimes.sunrise, 'sunrise 仍应存在于 sunWindow')
assert.ok(slotTimes.sunset, 'sunset 仍应存在于 sunWindow')

// --- TRIGGER_TO_SLOT 完整性 ---
// 固定表不含动态 sunrise/sunset，动态前缀由 resolveSlotForTriggerName 解析
assert.equal(Object.keys(TRIGGER_TO_SLOT).length, 10)
assert.equal(TRIGGER_TO_SLOT['weather-d0-now-sunrise-sweep'], 'sunrise')
assert.equal(TRIGGER_TO_SLOT['weather-d0-now-morning-0720'], 'morning')
assert.equal(TRIGGER_TO_SLOT['weather-d0-now-forenoon-1120'], 'forenoon')
assert.equal(TRIGGER_TO_SLOT['weather-d0-now-noon-1420'], 'noon')
assert.equal(TRIGGER_TO_SLOT['weather-d0-now-afternoon-1620'], 'afternoon')
assert.equal(TRIGGER_TO_SLOT['weather-d0-now-sunset-sweep'], 'sunset')
assert.equal(TRIGGER_TO_SLOT['weather-d0-now-finalize-2130'], 'finalize')

console.log('now-sample-slots tests passed')
