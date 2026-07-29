'use strict'

const { buildSolarTermCalendarObjectPath } = require('./weather-cache-paths')
const { formatLocalDateInTimezone } = require('./recent-weather-features')

const SOLAR_TERM_SCHEMA_VERSION = 'weather-cache/v1/solar-term-calendar-cn'
const DEFAULT_ANCHOR_TIMEZONE = 'Asia/Shanghai'
const SEASON_BY_TERM_INDEX = [
  'winter',
  'winter',
  'spring',
  'spring',
  'spring',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'autumn',
  'autumn',
  'autumn',
  'winter',
  'winter',
  'winter',
  'winter'
]

function loadSolarLunar() {
  const mod = require('solarlunar')
  return mod.default || mod
}

function normalizeYear(value) {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error(`节气历年份非法: ${value}`)
  }
  return year
}

function buildSolarTermCalendar(year) {
  const safeYear = normalizeYear(year)
  const solarlunar = loadSolarLunar()
  const names = Array.isArray(solarlunar.lunarTerm) ? solarlunar.lunarTerm : []
  if (!names.length || typeof solarlunar.getTerm !== 'function') {
    throw new Error('solarlunar 缺少 lunarTerm/getTerm 能力')
  }

  const terms = names.map((name, index) => {
    const month = Math.floor(index / 2) + 1
    const day = Number(solarlunar.getTerm(safeYear, index + 1))
    if (!Number.isInteger(day) || day <= 0) {
      throw new Error(`solarlunar 未能生成 ${safeYear} ${name} 日期`)
    }
    const date = `${safeYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return {
      date,
      termName: name,
      termIndex: index,
      seasonSegment: SEASON_BY_TERM_INDEX[index] || ''
    }
  })

  return {
    schemaVersion: SOLAR_TERM_SCHEMA_VERSION,
    country: 'cn',
    year: safeYear,
    generatedAt: new Date().toISOString(),
    terms
  }
}

function getYearWindow({ now = new Date(), timezone = DEFAULT_ANCHOR_TIMEZONE } = {}) {
  const today = formatLocalDateInTimezone(now, timezone)
  const year = normalizeYear(today.slice(0, 4))
  return [year - 1, year, year + 1]
}

function sortTerms(terms = []) {
  return [...terms].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
}

function findTermWindow(terms = [], date = '') {
  const sorted = sortTerms(terms)
  const today = String(date || '').slice(0, 10)
  const currentIndex = sorted.findIndex(term => term.date === today)
  const previous = [...sorted].reverse().find(term => String(term.date || '') < today) || null
  const next = sorted.find(term => String(term.date || '') > today) || null
  return {
    currentTerm: currentIndex >= 0 ? sorted[currentIndex] : null,
    previousTerm: previous,
    nextTerm: next
  }
}

function createSeasonCalendarService({
  storage,
  now = () => new Date(),
  timezone = DEFAULT_ANCHOR_TIMEZONE
} = {}) {
  if (!storage) {
    throw new Error('createSeasonCalendarService 缺少 storage')
  }

  async function ensureYear(year) {
    const safeYear = normalizeYear(year)
    const cloudPath = buildSolarTermCalendarObjectPath(safeYear)
    const existing = await storage.downloadJson({ cloudPath }).catch(() => null)
    if (existing?.schemaVersion === SOLAR_TERM_SCHEMA_VERSION && Array.isArray(existing.terms)) {
      return { calendar: existing, cloudPath, created: false }
    }
    const calendar = buildSolarTermCalendar(safeYear)
    await storage.uploadJson({ cloudPath, payload: calendar })
    return { calendar, cloudPath, created: true }
  }

  async function ensureThreeYearWindow(input = {}) {
    const resolvedTimezone = String(input.timezone || timezone || DEFAULT_ANCHOR_TIMEZONE).trim()
    const years = getYearWindow({ now: input.now || now(), timezone: resolvedTimezone })
    const calendars = []
    const createdYears = []
    for (const year of years) {
      const ensured = await ensureYear(year)
      calendars.push(ensured.calendar)
      if (ensured.created) {
        createdYears.push(year)
      }
    }
    const terms = sortTerms(calendars.flatMap(calendar => calendar.terms || []))
    return { years, calendars, terms, createdYears }
  }

  async function resolveTodayTerm(input = {}) {
    const resolvedTimezone = String(input.timezone || timezone || DEFAULT_ANCHOR_TIMEZONE).trim()
    const resolvedNow = input.now || now()
    const today = input.date || formatLocalDateInTimezone(resolvedNow, resolvedTimezone)
    const window = await ensureThreeYearWindow({ now: resolvedNow, timezone: resolvedTimezone })
    return {
      today,
      timezone: resolvedTimezone,
      ...window,
      ...findTermWindow(window.terms, today)
    }
  }

  return {
    ensureThreeYearWindow,
    resolveTodayTerm
  }
}

module.exports = {
  DEFAULT_ANCHOR_TIMEZONE,
  SOLAR_TERM_SCHEMA_VERSION,
  buildSolarTermCalendar,
  createSeasonCalendarService,
  findTermWindow,
  getYearWindow
}
