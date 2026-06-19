'use strict'

let SunCalc = null
let dateFnsTz = null
try {
  SunCalc = require('suncalc')
} catch {
  SunCalc = null
}
try {
  dateFnsTz = require('date-fns-tz')
} catch {
  dateFnsTz = null
}

const DAYLIGHT_SLOT_DEFINITIONS = [
  { slotKey: 'morning', startHour: null, endHour: 9 },
  { slotKey: 'forenoon', startHour: 9, endHour: 12 },
  { slotKey: 'noon', startHour: 12, endHour: 14 },
  { slotKey: 'afternoon', startHour: 14, endHour: null }
]
const DAYLIGHT_SLOT_KEYS = DAYLIGHT_SLOT_DEFINITIONS.map(item => item.slotKey)

function normalizeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clamp(value, min, max) {
  const number = normalizeNumber(value)
  if (number === null) {
    return min
  }
  return Math.min(max, Math.max(min, number))
}

function zonedDate(dateText = '', hour = 12, timezone = 'Asia/Shanghai') {
  const text = `${String(dateText || '').slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00`
  if (dateFnsTz?.fromZonedTime) {
    return dateFnsTz.fromZonedTime(text, timezone)
  }
  return new Date(`${text}+08:00`)
}

function formatIsoInTimezone(date, timezone = 'Asia/Shanghai') {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  if (dateFnsTz?.formatInTimeZone) {
    return dateFnsTz.formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX")
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

function fallbackSunTimes(dateText = '', timezone = 'Asia/Shanghai') {
  return {
    sunrise: zonedDate(dateText, 6, timezone),
    solarNoon: zonedDate(dateText, 12, timezone),
    sunset: zonedDate(dateText, 18, timezone)
  }
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function resolveSunTimes(input = {}) {
  const { date = '', latitude, longitude, timezone = 'Asia/Shanghai' } = input
  const lat = normalizeNumber(latitude)
  const lng = normalizeNumber(longitude)
  const fallback = fallbackSunTimes(date, timezone)
  if (lat === null || lng === null || !SunCalc?.getTimes) {
    return {
      sunrise: isValidDate(input.sunrise) ? input.sunrise : fallback.sunrise,
      solarNoon: isValidDate(input.solarNoon) ? input.solarNoon : fallback.solarNoon,
      sunset: isValidDate(input.sunset) ? input.sunset : fallback.sunset
    }
  }
  const times = SunCalc.getTimes(zonedDate(date, 12, timezone), lat, lng)
  return {
    sunrise: isValidDate(input.sunrise)
      ? input.sunrise
      : isValidDate(times.sunrise)
        ? times.sunrise
        : fallback.sunrise,
    solarNoon: isValidDate(input.solarNoon)
      ? input.solarNoon
      : isValidDate(times.solarNoon)
        ? times.solarNoon
        : fallback.solarNoon,
    sunset: isValidDate(input.sunset)
      ? input.sunset
      : isValidDate(times.sunset)
        ? times.sunset
        : fallback.sunset
  }
}

function buildSunWindow(options = {}) {
  const timezone = String(options.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  const times = resolveSunTimes({ ...options, timezone })
  return {
    sunrise: formatIsoInTimezone(times.sunrise, timezone),
    sunset: formatIsoInTimezone(times.sunset, timezone),
    solarNoon: formatIsoInTimezone(times.solarNoon, timezone),
    source: 'suncalc_estimated',
    quality: 'estimated'
  }
}

function buildDaylightSlots(options = {}) {
  const timezone = String(options.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  const { sunrise, sunset } = resolveSunTimes({ ...options, timezone })
  const date = String(options.date || '').slice(0, 10)

  return DAYLIGHT_SLOT_DEFINITIONS.map(definition => {
    const slotStart =
      definition.startHour === null ? sunrise : zonedDate(date, definition.startHour, timezone)
    const slotEnd =
      definition.endHour === null ? sunset : zonedDate(date, definition.endHour, timezone)
    const startTime = new Date(Math.max(slotStart.getTime(), sunrise.getTime()))
    const endTime = new Date(Math.min(slotEnd.getTime(), sunset.getTime()))
    const durationMinutes = Math.max(
      0,
      Math.round((endTime.getTime() - startTime.getTime()) / 60000)
    )
    const missing = durationMinutes <= 0
    return {
      slotKey: definition.slotKey,
      startTime: missing ? '' : formatIsoInTimezone(startTime, timezone),
      endTime: missing ? '' : formatIsoInTimezone(endTime, timezone),
      durationMinutes,
      quality: missing ? 'missing' : 'complete',
      missing
    }
  })
}

function aggregateDaylightSlotFields({
  daily = {},
  location = {},
  timezone = 'Asia/Shanghai'
} = {}) {
  const slots = buildDaylightSlots({
    date: daily.date || daily.fxDate,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone
  })
  const uvIndex = clamp(daily.uvIndex ?? daily.uv, 0, 15)
  const cloud = clamp(daily.cloud, 0, 100)
  const daylightQuality =
    daily.missing || daily.quality === 'missing'
      ? 'missing'
      : slots.every(slot => slot.missing)
        ? 'missing'
        : uvIndex === 0 && cloud === 0
          ? 'partial'
          : 'complete'

  return {
    daylight: {
      timezone,
      sunrise: slots[0]?.startTime || '',
      sunset: slots.at(-1)?.endTime || '',
      slots: slots.map(slot => ({
        ...slot,
        estimatedUvIndex: slot.missing ? null : uvIndex,
        estimatedCloud: slot.missing ? null : cloud,
        quality: daylightQuality === 'missing' || slot.missing ? 'missing' : slot.quality,
        missing: daylightQuality === 'missing' || slot.missing
      })),
      quality: daylightQuality,
      missing: daylightQuality === 'missing'
    }
  }
}

module.exports = {
  DAYLIGHT_SLOT_KEYS,
  aggregateDaylightSlotFields,
  buildDaylightSlots,
  buildSunWindow,
  clamp,
  resolveSunTimes
}
