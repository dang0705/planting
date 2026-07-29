'use strict'

const { buildSunWindow } = require('./daylight-slots')

// D0 now 采样包含日出/日落边界样本和日间固定样本。
const NOW_SAMPLE_SLOT_NAMES = ['sunrise', 'morning', 'forenoon', 'noon', 'afternoon', 'sunset']
const NOW_SAMPLE_FINALIZE_SLOT = 'finalize'
const SUNRISE_TRIGGER_PREFIX = 'weather-d0-now-sunrise__'
const SUNSET_TRIGGER_PREFIX = 'weather-d0-now-sunset__'
const SUNRISE_SWEEP_TRIGGER = 'weather-d0-now-sunrise-sweep'
const SUNSET_SWEEP_TRIGGER = 'weather-d0-now-sunset-sweep'

/**
 * 固定 D0 now 定时器 → 语义 slot 名映射。
 * 定时器名称与 cron 必须一一对应：
 * - weather-d0-now-morning-0720   cron 0 20 7  * * * *  -> morning
 * - weather-d0-now-forenoon-1120  cron 0 20 11 * * * *  -> forenoon
 * - weather-d0-now-noon-1420     cron 0 20 14 * * * *  -> noon
 * - weather-d0-now-afternoon-1620 cron 0 20 16 * * * *  -> afternoon
 *
 * sunrise/sunset 是按城市动态生成的 D0 第一枪/最后一枪，分别写入 sunrise/sunset slot。
 */
const TRIGGER_TO_SLOT = {
  [SUNRISE_SWEEP_TRIGGER]: 'sunrise',
  'weather-d0-now-morning-0720': 'morning',
  'weather-d0-now-forenoon-1120': 'forenoon',
  'weather-d0-now-noon-1420': 'noon',
  'weather-d0-now-afternoon-1620': 'afternoon',
  [SUNSET_SWEEP_TRIGGER]: 'sunset',
  'weather-d0-now-finalize-2130': NOW_SAMPLE_FINALIZE_SLOT,
  'weather-d0-24h-0630': 'morning',
  'weather-d0-24h-1130': 'forenoon',
  'weather-d0-24h-1530': 'afternoon'
}

/**
 * 将触发器名称解析为 D0 now 采样 slot 名。
 * sunrise/sunset 动态触发器不再解析为任何 slot（返回空字符串），
 * 因此不会向 days/{date}.json 写入样本。
 */
function resolveSlotForTriggerName(triggerName = '') {
  const key = String(triggerName || '').trim()
  if (key.startsWith(SUNRISE_SWEEP_TRIGGER)) {
    return 'sunrise'
  }
  if (key.startsWith(SUNSET_SWEEP_TRIGGER)) {
    return 'sunset'
  }
  if (key.startsWith(SUNRISE_TRIGGER_PREFIX)) {
    return 'sunrise'
  }
  if (key.startsWith(SUNSET_TRIGGER_PREFIX)) {
    return 'sunset'
  }
  return TRIGGER_TO_SLOT[key] || ''
}

function isFinalizeSlot(slotName = '') {
  return String(slotName || '') === NOW_SAMPLE_FINALIZE_SLOT
}

function parseTimeToMinutes(text = '') {
  const match = String(text || '').match(/(\d{1,2}):(\d{2})/)
  if (!match) {
    return null
  }
  return Number(match[1]) * 60 + Number(match[2])
}

function addMinutesToZonedTime(zonedIsoText = '', minutes = 0, timezone = 'Asia/Shanghai') {
  const date = new Date(zonedIsoText)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const result = new Date(date.getTime() + minutes * 60000)
  return formatIsoInTimezone(result, timezone)
}

/**
 * 将 Date 格式化为指定时区下的本地 ISO 字符串（带偏移和毫秒）。
 * 优先使用 date-fns-tz；不可用时回退到 Intl.DateTimeFormat。
 * 输出形如 2026-06-24T07:20:00.000+08:00，不以 Z 结尾。
 */
function formatIsoInTimezone(date, timezone = 'Asia/Shanghai') {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  let dateFnsTz = null
  try {
    dateFnsTz = require('date-fns-tz')
  } catch {
    dateFnsTz = null
  }
  if (dateFnsTz?.formatInTimeZone) {
    return dateFnsTz.formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour12: false,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      timeZoneName: 'longOffset'
    }).formatToParts(date)
    const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]))
    const offset = String(partMap.timeZoneName || 'GMT+08:00').replace('GMT', '') || '+08:00'
    return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}.${partMap.fractionalSecond || '000'}${offset}`
  } catch {
    return date.toISOString()
  }
}

function maxZonedTime(timeA = '', timeB = '') {
  const dateA = new Date(timeA)
  const dateB = new Date(timeB)
  if (Number.isNaN(dateA.getTime())) {
    return timeB
  }
  if (Number.isNaN(dateB.getTime())) {
    return timeA
  }
  return dateA.getTime() >= dateB.getTime() ? timeA : timeB
}

function buildZonedTimeAtClock(date = '', hour, minute, timezone = 'Asia/Shanghai') {
  const text = `${String(date || '').slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  let dateFnsTz = null
  try {
    dateFnsTz = require('date-fns-tz')
  } catch {
    dateFnsTz = null
  }
  if (dateFnsTz?.fromZonedTime) {
    return formatIsoInTimezone(dateFnsTz.fromZonedTime(text, timezone), timezone)
  }
  return formatIsoInTimezone(new Date(`${text}+08:00`), timezone)
}

/**
 * 计算单日 now 采样各 slot 的目标触发时间。
 * 4 个固定 slot 的触发时间与定时器 cron 对齐：
 * - morning:   07:20
 * - forenoon:  11:20
 * - noon:      14:20
 * - afternoon: 16:20
 *
 * sunrise/sunset 是动态 timer 的目标时间，作为 samples[] 的边界 slot。
 * sunset 只是 D0 最后一枪瞬时样本，不等同于 finalize。
 */
function buildNowSampleSlotTimes({
  date = '',
  latitude,
  longitude,
  timezone = 'Asia/Shanghai'
} = {}) {
  const sunWindow = buildSunWindow({ date, latitude, longitude, timezone })

  const morning = buildZonedTimeAtClock(date, 7, 20, timezone)
  const forenoon = buildZonedTimeAtClock(date, 11, 20, timezone)
  const noon = buildZonedTimeAtClock(date, 14, 20, timezone)
  const afternoon = buildZonedTimeAtClock(date, 16, 20, timezone)

  return {
    date: String(date || '').slice(0, 10),
    timezone,
    sunrise: sunWindow.sunrise,
    sunset: sunWindow.sunset,
    slots: {
      sunrise: { slotName: 'sunrise', targetTime: sunWindow.sunrise },
      morning: { slotName: 'morning', targetTime: morning },
      forenoon: { slotName: 'forenoon', targetTime: forenoon },
      noon: { slotName: 'noon', targetTime: noon },
      afternoon: { slotName: 'afternoon', targetTime: afternoon },
      sunset: { slotName: 'sunset', targetTime: sunWindow.sunset }
    }
  }
}

module.exports = {
  NOW_SAMPLE_FINALIZE_SLOT,
  NOW_SAMPLE_SLOT_NAMES,
  SUNRISE_TRIGGER_PREFIX,
  SUNRISE_SWEEP_TRIGGER,
  SUNSET_TRIGGER_PREFIX,
  SUNSET_SWEEP_TRIGGER,
  TRIGGER_TO_SLOT,
  addMinutesToZonedTime,
  buildNowSampleSlotTimes,
  buildZonedTimeAtClock,
  formatIsoInTimezone,
  isFinalizeSlot,
  maxZonedTime,
  parseTimeToMinutes,
  resolveSlotForTriggerName
}
