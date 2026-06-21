'use strict'

const { buildSunWindow } = require('./daylight-slots')

const NOW_SAMPLE_SLOT_NAMES = ['morning', 'forenoon', 'noon', 'afternoon']
const NOW_SAMPLE_FINALIZE_SLOT = 'finalize'

const TRIGGER_TO_SLOT = {
  'weather-d0-now-morning-0920': 'morning',
  'weather-d0-now-forenoon-1220': 'forenoon',
  'weather-d0-now-noon-1420': 'noon',
  'weather-d0-now-afternoon-1820': 'afternoon',
  'weather-d0-now-finalize-2130': NOW_SAMPLE_FINALIZE_SLOT,
  'weather-d0-24h-0630': 'morning',
  'weather-d0-24h-1130': 'forenoon',
  'weather-d0-24h-1530': 'afternoon',
  'weather-d0-24h-finalize-2130': NOW_SAMPLE_FINALIZE_SLOT
}

function resolveSlotForTriggerName(triggerName = '') {
  const key = String(triggerName || '').trim()
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

function formatIsoInTimezone(date, timezone = 'Asia/Shanghai') {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
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
      timeZoneName: 'longOffset'
    }).formatToParts(date)
    const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]))
    const offset = String(partMap.timeZoneName || 'GMT+08:00').replace('GMT', '') || '+08:00'
    return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}${offset}`
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
 * morning: max(09:20, sunrise+20m)
 * forenoon: 12:20
 * noon: 14:20
 * afternoon: sunset+20m
 * finalize: max(21:30, sunset+30m)
 */
function buildNowSampleSlotTimes({ date = '', latitude, longitude, timezone = 'Asia/Shanghai' } = {}) {
  const sunWindow = buildSunWindow({ date, latitude, longitude, timezone })
  const sunrise = sunWindow.sunrise
  const sunset = sunWindow.sunset

  const morningBase = buildZonedTimeAtClock(date, 9, 20, timezone)
  const morningSunrise = addMinutesToZonedTime(sunrise, 20, timezone)
  const morning = maxZonedTime(morningBase, morningSunrise, timezone)

  const forenoon = buildZonedTimeAtClock(date, 12, 20, timezone)
  const noon = buildZonedTimeAtClock(date, 14, 20, timezone)
  const afternoon = addMinutesToZonedTime(sunset, 20, timezone)

  const finalizeBase = buildZonedTimeAtClock(date, 21, 30, timezone)
  const finalizeSunset = addMinutesToZonedTime(sunset, 30, timezone)
  const finalize = maxZonedTime(finalizeBase, finalizeSunset, timezone)

  return {
    date: String(date || '').slice(0, 10),
    timezone,
    sunrise,
    sunset,
    slots: {
      morning: { slotName: 'morning', targetTime: morning },
      forenoon: { slotName: 'forenoon', targetTime: forenoon },
      noon: { slotName: 'noon', targetTime: noon },
      afternoon: { slotName: 'afternoon', targetTime: afternoon }
    },
    finalize: { slotName: NOW_SAMPLE_FINALIZE_SLOT, targetTime: finalize }
  }
}

module.exports = {
  NOW_SAMPLE_FINALIZE_SLOT,
  NOW_SAMPLE_SLOT_NAMES,
  TRIGGER_TO_SLOT,
  addMinutesToZonedTime,
  buildNowSampleSlotTimes,
  buildZonedTimeAtClock,
  isFinalizeSlot,
  maxZonedTime,
  parseTimeToMinutes,
  resolveSlotForTriggerName
}
