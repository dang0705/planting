'use strict'

const SunCalc = require('suncalc')
const dateFnsTz = require('date-fns-tz')
const { readFileSync } = require('fs')
const path = require('path')
const { createWeatherObjectStorage } = require('./weather-object-storage')
const {
  buildSeasonTriggerAuditObjectPath,
  buildSeasonTriggerStateObjectPath,
  toSafeLocationKey
} = require('./weather-cache-paths')
const { createSeasonCalendarService, DEFAULT_ANCHOR_TIMEZONE } = require('./season-calendar')
const {
  HOT_CITY_INGESTION_KEYS_ENV,
  HOT_CITY_WEATHER_LOCATIONS,
  parseHotCityKeys,
  resolveHotCityForSeasonTrigger
} = require('./hot-city-locations')
const { formatLocalDateInTimezone } = require('./recent-weather-features')

const DRIFT_THRESHOLD_MINUTES = 15
const SEASON_TRIGGER_STATE_SCHEMA_VERSION = 'weather-cache/v1/season-trigger-state'
const SUNRISE_TRIGGER_PREFIX = 'weather-d0-now-sunrise__'
const SUNSET_TRIGGER_PREFIX = 'weather-d0-now-sunset__'
const SCHEDULER_FUNCTION_NAME = 'weather-ingestion-scheduler'

const BASE_TIMER_TRIGGERS_FALLBACK = [
  { name: 'weather-ingestion-recent-10d', type: 'timer', config: '0 20 0/6 * * * *' },
  { name: 'weather-d0-now-morning-0920', type: 'timer', config: '0 20 9 * * * *' },
  { name: 'weather-d0-now-forenoon-1220', type: 'timer', config: '0 20 12 * * * *' },
  { name: 'weather-d0-now-noon-1420', type: 'timer', config: '0 20 14 * * * *' },
  { name: 'weather-d0-now-afternoon-1820', type: 'timer', config: '0 20 18 * * * *' }
]

function normalizeTimerTrigger(trigger = {}) {
  const name = String(trigger?.name || '').trim()
  const config = String(trigger?.config || '').trim()
  if (!name || !config) {
    return null
  }
  return { name, type: 'timer', config }
}

function loadBaseTimerTriggersFromConfig() {
  try {
    const configPath = path.join(__dirname, '../config.json')
    const configText = readFileSync(configPath, 'utf8')
    const configJson = JSON.parse(configText)
    const triggersFromConfig = Array.isArray(configJson?.triggers)
      ? configJson.triggers.map(normalizeTimerTrigger).filter(Boolean)
      : []
    const validTriggers = triggersFromConfig.filter(item => item.type === 'timer')
    return validTriggers.length > 0 ? dedupeTriggers(validTriggers) : BASE_TIMER_TRIGGERS_FALLBACK
  } catch (error) {
    return BASE_TIMER_TRIGGERS_FALLBACK
  }
}

const BASE_TIMER_TRIGGERS = loadBaseTimerTriggersFromConfig()

function dedupeTriggers(triggers = []) {
  const seen = new Set()
  const normalized = []
  for (const trigger of triggers) {
    const name = String(trigger?.name || '').trim()
    if (!name || !String(trigger?.type || '').trim()) {
      continue
    }
    if (seen.has(name)) {
      continue
    }
    seen.add(name)
    normalized.push({
      name,
      type: String(trigger.type).trim(),
      config: String(trigger.config || '').trim()
    })
  }
  return normalized
}

function buildSunriseTriggerName(locationKey = '') {
  const safeLocationKey = toSafeLocationKey(locationKey)
  if (!safeLocationKey) {
    throw new Error('sunrise trigger 缺少 locationKey')
  }
  return `${SUNRISE_TRIGGER_PREFIX}${safeLocationKey}`
}

function buildSunsetTriggerName(locationKey = '') {
  const safeLocationKey = toSafeLocationKey(locationKey)
  if (!safeLocationKey) {
    throw new Error('sunset trigger 缺少 locationKey')
  }
  return `${SUNSET_TRIGGER_PREFIX}${safeLocationKey}`
}

function isSeasonDynamicTriggerName(name = '') {
  const value = String(name || '').trim()
  return value.startsWith(SUNRISE_TRIGGER_PREFIX) || value.startsWith(SUNSET_TRIGGER_PREFIX)
}

function getLocalTimeParts(date, timezone = DEFAULT_ANCHOR_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function minuteOfDayFromDate(date, timezone = DEFAULT_ANCHOR_TIMEZONE) {
  const parts = getLocalTimeParts(date, timezone)
  return Number(parts.hour) * 60 + Number(parts.minute)
}

function minuteOfDayFromIsoText(value = '', timezone = DEFAULT_ANCHOR_TIMEZONE) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return minuteOfDayFromDate(date, timezone)
}

function formatIsoInTimezone(date, timezone = DEFAULT_ANCHOR_TIMEZONE) {
  if (dateFnsTz?.formatInTimeZone) {
    return dateFnsTz.formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX")
  }
  const parts = getLocalTimeParts(date, timezone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`
}

function buildZonedNoon(date = '', timezone = DEFAULT_ANCHOR_TIMEZONE) {
  const text = `${String(date || '').slice(0, 10)}T12:00:00`
  if (dateFnsTz?.fromZonedTime) {
    return dateFnsTz.fromZonedTime(text, timezone)
  }
  return new Date(`${text}+08:00`)
}

function calculateSunTimesForCity({ city = {}, date = '' } = {}) {
  const timezone =
    String(city.timezone || DEFAULT_ANCHOR_TIMEZONE).trim() || DEFAULT_ANCHOR_TIMEZONE
  const latitude = Number(city.latitude)
  const longitude = Number(city.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`城市 ${city.locationKey || city.key || ''} 缺少合法经纬度`)
  }
  const times = SunCalc.getTimes(buildZonedNoon(date, timezone), latitude, longitude)
  if (!(times.sunrise instanceof Date) || Number.isNaN(times.sunrise.getTime())) {
    throw new Error(`suncalc 未返回合法 sunrise: ${city.locationKey || city.key || ''}`)
  }
  if (!(times.sunset instanceof Date) || Number.isNaN(times.sunset.getTime())) {
    throw new Error(`suncalc 未返回合法 sunset: ${city.locationKey || city.key || ''}`)
  }
  const sunriseMinuteOfDay = minuteOfDayFromDate(times.sunrise, timezone)
  const sunsetMinuteOfDay = minuteOfDayFromDate(times.sunset, timezone)
  return {
    sunrise: formatIsoInTimezone(times.sunrise, timezone),
    sunset: formatIsoInTimezone(times.sunset, timezone),
    sunriseMinuteOfDay,
    sunsetMinuteOfDay,
    timezone
  }
}

function buildDailyCronFromMinuteOfDay(minuteOfDay) {
  const value = Number(minuteOfDay)
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    throw new Error(`非法 sunriseMinuteOfDay: ${minuteOfDay}`)
  }
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return `0 ${minute} ${hour} * * * *`
}

function buildDesiredTimerTriggers(additionalTriggers = []) {
  return dedupeTriggers([
    ...BASE_TIMER_TRIGGERS,
    ...additionalTriggers.map(normalizeTimerTrigger).filter(Boolean)
  ])
}

function loadCloudBaseManagerFromEnv(env = process.env) {
  const envId = String(env.CLOUDBASE_ENV_ID || env.TCB_ENV || '').trim()
  const secretId = String(
    env.CLOUDBASE_SECRET_ID || env.TENCENT_SECRET_ID || env.TENCENTCLOUD_SECRETID || ''
  ).trim()
  const secretKey = String(
    env.CLOUDBASE_SECRET_KEY || env.TENCENT_SECRET_KEY || env.TENCENTCLOUD_SECRETKEY || ''
  ).trim()
  if (!envId || !secretId || !secretKey) {
    throw new Error('缺少 CloudBase manager 显式 envId/secretId/secretKey')
  }
  const CloudBase = require('@cloudbase/manager-node')
  const app = new CloudBase({ envId, secretId, secretKey })
  return app.functions
}

function createCloudBaseTriggerClient({ env = process.env, functions = null } = {}) {
  const resolvedFunctions = functions || loadCloudBaseManagerFromEnv(env)
  const functionName = String(
    env.WEATHER_INGESTION_SCHEDULER_FUNCTION_NAME || SCHEDULER_FUNCTION_NAME
  ).trim()

  function isNotFoundError(error = null) {
    const message = String(error?.message || error || '')
    return /not\s*found|不存在|Trigger.*not/i.test(message)
  }

  async function deleteTriggerIfExists(triggerName = '') {
    if (!triggerName || typeof resolvedFunctions.deleteFunctionTrigger !== 'function') {
      return false
    }
    try {
      await resolvedFunctions.deleteFunctionTrigger(functionName, triggerName)
      return true
    } catch (error) {
      if (isNotFoundError(error)) {
        return false
      }
      throw error
    }
  }

  async function createTimerTriggers(triggers = []) {
    if (!Array.isArray(triggers) || !triggers.length) {
      return { triggers: [] }
    }
    if (typeof resolvedFunctions.createFunctionTriggers !== 'function') {
      throw new Error('CloudBase manager 缺少 createFunctionTriggers')
    }
    const payload = dedupeTriggers(triggers.map(item => ({
      ...item,
      type: 'timer'
    })))
    await resolvedFunctions.createFunctionTriggers(functionName, payload)
    return { triggers: payload }
  }

  async function replaceTimerTriggers(triggers = []) {
    const payload = buildDesiredTimerTriggers(triggers)
    for (const trigger of payload) {
      await deleteTriggerIfExists(trigger.name)
    }
    await createTimerTriggers(payload)
    return { triggers: payload, functionName }
  }

  async function updateTimerTrigger({ triggerName = '', cron = '', additionalTriggers = [] } = {}) {
    if (!triggerName || !cron) {
      throw new Error('更新 sunrise trigger 缺少 triggerName 或 cron')
    }
    await replaceTimerTriggers([
      ...additionalTriggers,
      { name: triggerName, config: cron }
    ])
    return { triggerName, cron, functionName }
  }

  async function ensureTimerTrigger({ triggerName = '', cron = '', additionalTriggers = [] } = {}) {
    if (!triggerName || !cron) {
      throw new Error('校验 sunrise trigger 缺少 triggerName 或 cron')
    }
    await replaceTimerTriggers([
      ...additionalTriggers,
      { name: triggerName, config: cron }
    ])
    return { triggerName, cron, functionName, ensured: true }
  }

  async function ensureBaseTimerTriggers({ additionalTriggers = [] } = {}) {
    const result = await replaceTimerTriggers(additionalTriggers)
    return {
      functionName,
      count: result.triggers.length,
      triggers: result.triggers
    }
  }

  return { ensureBaseTimerTriggers, ensureTimerTrigger, updateTimerTrigger }
}

function resolveHotCitiesForSeasonSync({ env = process.env } = {}) {
  const raw = String(env[HOT_CITY_INGESTION_KEYS_ENV] || '')
  const requestedKeys = parseHotCityKeys(raw)
  const fallbackUsed = requestedKeys.length === 0
  const keys = fallbackUsed ? HOT_CITY_WEATHER_LOCATIONS.map(city => city.key) : requestedKeys
  const seen = new Set()
  const cities = []
  for (const key of keys) {
    const city = resolveHotCityForSeasonTrigger(key)
    if (!city?.locationKey || seen.has(city.locationKey) || city.isActive === false) {
      continue
    }
    seen.add(city.locationKey)
    cities.push(city)
  }
  return { raw, requestedKeys, fallbackUsed, cities }
}

function createSeasonTriggerAudit({ storage }) {
  async function appendAudit({ locationKey = 'global', date = '', record = {} } = {}) {
    const year = String(
      date || formatLocalDateInTimezone(new Date(), DEFAULT_ANCHOR_TIMEZONE)
    ).slice(0, 4)
    const cloudPath = buildSeasonTriggerAuditObjectPath({ locationKey, year })
    const existing =
      typeof storage.downloadText === 'function'
        ? await storage.downloadText({ cloudPath }).catch(() => '')
        : ''
    const line = JSON.stringify({ ...record, locationKey, date })
    await storage.uploadText({ cloudPath, content: `${existing || ''}${line}\n` })
    return { cloudPath }
  }
  return { appendAudit }
}

function createSeasonTriggerSyncService({
  storage = createWeatherObjectStorage(),
  calendarService = null,
  triggerClient = null,
  env = process.env,
  now = () => new Date(),
  timezone = DEFAULT_ANCHOR_TIMEZONE
} = {}) {
  const resolvedCalendarService =
    calendarService || createSeasonCalendarService({ storage, now, timezone })
  let resolvedTriggerClient = triggerClient
  const audit = createSeasonTriggerAudit({ storage })

  function getTriggerClient() {
    if (!resolvedTriggerClient) {
      resolvedTriggerClient = createCloudBaseTriggerClient({ env })
    }
    return resolvedTriggerClient
  }

  async function readState(locationKey = '') {
    const cloudPath = buildSeasonTriggerStateObjectPath(locationKey)
    const state = await storage.downloadJson({ cloudPath }).catch(() => null)
    return { state, cloudPath }
  }

  async function writeState({ locationKey = '', state = {} } = {}) {
    const cloudPath = buildSeasonTriggerStateObjectPath(locationKey)
    await storage.uploadJson({ cloudPath, payload: state })
    return { cloudPath }
  }

  async function buildStateBackedSeasonTriggers(overrides = []) {
    const byName = new Map()
    const addTrigger = trigger => {
      const normalized = normalizeTimerTrigger(trigger)
      if (normalized && isSeasonDynamicTriggerName(normalized.name)) {
        byName.set(normalized.name, normalized)
      }
    }

    for (const trigger of overrides) {
      addTrigger(trigger)
    }

    const citySelection = resolveHotCitiesForSeasonSync({ env })
    for (const city of citySelection.cities) {
      const { state } = await readState(city.locationKey)
      const timezone =
        String(state?.timezone || city.timezone || DEFAULT_ANCHOR_TIMEZONE).trim() ||
        DEFAULT_ANCHOR_TIMEZONE
      addTrigger({
        name: state?.lastSunriseTriggerName || state?.lastTriggerName,
        config: state?.lastSunriseCron || state?.lastCron
      })
      const legacySunsetMinute = minuteOfDayFromIsoText(state?.lastSunset, timezone)
      addTrigger({
        name: state?.lastSunsetTriggerName || buildSunsetTriggerName(city.locationKey),
        config: state?.lastSunsetCron ||
          (Number.isInteger(legacySunsetMinute)
            ? buildDailyCronFromMinuteOfDay(legacySunsetMinute)
            : '')
      })
    }
    return [...byName.values()]
  }

  async function syncCity({ city, termContext }) {
    const locationKey = city.locationKey
    const safeLocationKey = toSafeLocationKey(locationKey)
    const sunTimes = calculateSunTimesForCity({ city, date: termContext.today })
    const sunriseCron = buildDailyCronFromMinuteOfDay(sunTimes.sunriseMinuteOfDay)
    const sunsetCron = buildDailyCronFromMinuteOfDay(sunTimes.sunsetMinuteOfDay)
    const sunriseTriggerName = buildSunriseTriggerName(locationKey)
    const sunsetTriggerName = buildSunsetTriggerName(locationKey)
    const { state, cloudPath } = await readState(locationKey)
    const lastSunriseMinute = Number(state?.lastSunriseMinuteOfDay)
    const lastSunsetMinute = Number(state?.lastSunsetMinuteOfDay)
    const sunriseDriftMinutes = Number.isFinite(lastSunriseMinute)
      ? Math.abs(sunTimes.sunriseMinuteOfDay - lastSunriseMinute)
      : DRIFT_THRESHOLD_MINUTES
    const legacySunsetMinute = minuteOfDayFromIsoText(
      state?.lastSunset,
      state?.timezone || sunTimes.timezone
    )
    const comparableLastSunsetMinute = Number.isFinite(lastSunsetMinute)
      ? lastSunsetMinute
      : legacySunsetMinute
    const sunsetDriftMinutes = Number.isFinite(comparableLastSunsetMinute)
      ? Math.abs(sunTimes.sunsetMinuteOfDay - comparableLastSunsetMinute)
      : DRIFT_THRESHOLD_MINUTES
    const driftMinutes = Math.max(sunriseDriftMinutes, sunsetDriftMinutes)
    const cityDynamicTriggers = [
      { name: sunriseTriggerName, config: sunriseCron },
      { name: sunsetTriggerName, config: sunsetCron }
    ]

    const baseRecord = {
      event: 'city-candidate',
      termName: termContext.currentTerm.termName,
      termDate: termContext.today,
      safeLocationKey,
      sunriseTriggerName,
      sunsetTriggerName,
      sunrise: sunTimes.sunrise,
      sunset: sunTimes.sunset,
      sunriseMinuteOfDay: sunTimes.sunriseMinuteOfDay,
      sunsetMinuteOfDay: sunTimes.sunsetMinuteOfDay,
      lastSunriseMinuteOfDay: Number.isFinite(lastSunriseMinute) ? lastSunriseMinute : null,
      lastSunsetMinuteOfDay: Number.isFinite(comparableLastSunsetMinute)
        ? comparableLastSunsetMinute
        : null,
      sunriseDriftMinutes,
      sunsetDriftMinutes,
      driftMinutes,
      sunriseCron,
      sunsetCron,
      previousTerm: termContext.previousTerm,
      nextTerm: termContext.nextTerm,
      createdAt: new Date().toISOString()
    }

    if (driftMinutes < DRIFT_THRESHOLD_MINUTES) {
      let ensureResult
      try {
        const additionalTriggers = await buildStateBackedSeasonTriggers(cityDynamicTriggers)
        ensureResult = await getTriggerClient().ensureTimerTrigger({
          triggerName: sunriseTriggerName,
          cron: sunriseCron,
          additionalTriggers
        })
      } catch (error) {
        await audit.appendAudit({
          locationKey,
          date: termContext.today,
          record: {
            ...baseRecord,
            event: 'city-no-change',
            status: 'no-change-trigger-check-failed',
            error: error.message || String(error),
            preservedLastSunriseCron: state?.lastSunriseCron || state?.lastCron || '',
            preservedLastSunsetCron: state?.lastSunsetCron || ''
          }
        })
        return {
          locationKey,
          sunriseTriggerName,
          sunsetTriggerName,
          status: 'no-change',
          driftMinutes,
          sunriseCron,
          sunsetCron,
          ensured: false,
          ensureError: error.message || String(error)
        }
      }

      await audit.appendAudit({
        locationKey,
        date: termContext.today,
        record: {
          ...baseRecord,
          event: 'city-no-change',
          status: 'no-change',
          triggerEnsured: ensureResult?.ensured ?? false
        }
      })
      return {
        locationKey,
        sunriseTriggerName,
        sunsetTriggerName,
        status: 'no-change',
        driftMinutes,
        sunriseCron,
        sunsetCron
      }
    }

    try {
      const additionalTriggers = await buildStateBackedSeasonTriggers(cityDynamicTriggers)
      await getTriggerClient().updateTimerTrigger({
        triggerName: sunriseTriggerName,
        cron: sunriseCron,
        locationKey,
        additionalTriggers
      })
      const nextState = {
        schemaVersion: SEASON_TRIGGER_STATE_SCHEMA_VERSION,
        locationKey,
        safeLocationKey,
        cityName: city.cityName,
        timezone: sunTimes.timezone,
        lastCron: sunriseCron,
        lastTriggerName: sunriseTriggerName,
        lastSunriseCron: sunriseCron,
        lastSunsetCron: sunsetCron,
        lastSunriseTriggerName: sunriseTriggerName,
        lastSunsetTriggerName: sunsetTriggerName,
        lastSunriseMinuteOfDay: sunTimes.sunriseMinuteOfDay,
        lastSunsetMinuteOfDay: sunTimes.sunsetMinuteOfDay,
        lastSunrise: sunTimes.sunrise,
        lastSunset: sunTimes.sunset,
        lastTermDate: termContext.today,
        lastTermName: termContext.currentTerm.termName,
        previousTerm: termContext.previousTerm,
        nextTerm: termContext.nextTerm,
        updatedAt: new Date().toISOString()
      }
      await writeState({ locationKey, state: nextState })
      await audit.appendAudit({
        locationKey,
        date: termContext.today,
        record: { ...baseRecord, event: 'city-sunrise-sunset-updated', status: 'success' }
      })
      return {
        locationKey,
        sunriseTriggerName,
        sunsetTriggerName,
        status: 'updated',
        driftMinutes,
        sunriseCron,
        sunsetCron,
        statePath: cloudPath
      }
    } catch (error) {
      await audit.appendAudit({
        locationKey,
        date: termContext.today,
        record: {
          ...baseRecord,
          event: 'update-failed',
          status: 'failure',
          error: error.message || String(error),
          preservedLastSunriseCron: state?.lastSunriseCron || state?.lastCron || '',
          preservedLastSunsetCron: state?.lastSunsetCron || ''
        }
      })
      return {
        locationKey,
        sunriseTriggerName,
        sunsetTriggerName,
        status: 'update-failed',
        driftMinutes,
        sunriseCron,
        sunsetCron,
        error: error.message || String(error),
        preservedLastSunriseCron: state?.lastSunriseCron || state?.lastCron || '',
        preservedLastSunsetCron: state?.lastSunsetCron || ''
      }
    }
  }

  async function syncToday(input = {}) {
    const resolvedNow = input.now || now()
    const termContext = await resolvedCalendarService.resolveTodayTerm({
      now: resolvedNow,
      date: input.date,
      timezone
    })
    const citySelection = resolveHotCitiesForSeasonSync({ env })

    if (citySelection.fallbackUsed) {
      await audit.appendAudit({
        locationKey: 'global',
        date: termContext.today,
        record: {
          event: 'fallback-used',
          status: 'fallback',
          reason: `${HOT_CITY_INGESTION_KEYS_ENV}_empty`,
          cityCount: citySelection.cities.length,
          createdAt: new Date().toISOString()
        }
      })
    }

    if (!termContext.currentTerm) {
      await audit.appendAudit({
        locationKey: 'global',
        date: termContext.today,
        record: {
          event: 'term-sync-skip-non-term',
          status: 'no-change',
          previousTerm: termContext.previousTerm,
          nextTerm: termContext.nextTerm,
          createdAt: new Date().toISOString()
        }
      })
      return {
        status: 'no-change',
        today: termContext.today,
        isTermDay: false,
        cityCount: 0,
        cities: [],
        createdYears: termContext.createdYears
      }
    }

    const cities = []
    for (const city of citySelection.cities) {
      cities.push(await syncCity({ city, termContext }))
    }

    return {
      status: 'term-processed',
      today: termContext.today,
      isTermDay: true,
      term: termContext.currentTerm,
      cityCount: cities.length,
      cities,
      createdYears: termContext.createdYears
    }
  }

  async function ensureBaseTimerTriggers() {
    const additionalTriggers = await buildStateBackedSeasonTriggers()
    return getTriggerClient().ensureBaseTimerTriggers({ additionalTriggers })
  }

  return { syncToday, syncCity, ensureBaseTimerTriggers, readState }
}

module.exports = {
  DRIFT_THRESHOLD_MINUTES,
  SEASON_TRIGGER_STATE_SCHEMA_VERSION,
  SUNRISE_TRIGGER_PREFIX,
  SUNSET_TRIGGER_PREFIX,
  buildDailyCronFromMinuteOfDay,
  buildSunriseTriggerName,
  buildSunsetTriggerName,
  calculateSunTimesForCity,
  createCloudBaseTriggerClient,
  createSeasonTriggerAudit,
  createSeasonTriggerSyncService,
  resolveHotCitiesForSeasonSync
}
