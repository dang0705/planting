'use strict'

/**
 * 浇水计划调度模块 —— 日期算术、行为时间线归一化、间隔/下次浇水日期组合。
 *
 * 从 watering-planner.js 提取，保持高内聚：所有与"日期→事件→间隔→下次浇水日"相关的纯计算。
 * watering-planner.js 通过 require 本模块消费这些函数。
 */

const {
  resolveLookbackWindowDays,
  computeEffectiveHydrationLoad,
  computeWetPressureLoad,
  computeLastEffectiveRootWateredDaysAgo,
  computeRootZoneMoistureIndex,
  resolveDoseClass,
  DOSE_CLASS
} = require('./hydration-load')

const MS_PER_DAY = 24 * 60 * 60 * 1000

const WATERING_CONTEXTS = Object.freeze({
  WET: 'likely_too_wet',
  DRY: 'likely_too_dry',
  BASELINE: 'keep_baseline_or_check_soil'
})

/* ---------- 基础工具函数 ---------- */

function normalizeRawText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

function normalizeText(value = '') {
  return normalizeRawText(value).replace(/\s+/g, '_').toLowerCase()
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/* ---------- 日期算术 ---------- */

function normalizeDate(value = '') {
  const raw = normalizeRawText(value)
  if (!raw) {
    return ''
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join(
      '-'
    )
  }
  return raw.slice(0, 10)
}

function parseDate(value = '') {
  const normalized = normalizeDate(value)
  if (!normalized) {
    return null
  }
  const date = new Date(`${normalized}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysAgo(referenceDate = '', eventDate = '') {
  const reference = parseDate(referenceDate)
  const event = parseDate(eventDate)
  if (!reference || !event) {
    return null
  }
  return Math.floor((reference.getTime() - event.getTime()) / MS_PER_DAY)
}

function latestDaysAgo(referenceDate = '', events = []) {
  let latest = null
  for (const event of events) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0) {
      continue
    }
    latest = latest === null ? diff : Math.min(latest, diff)
  }
  return latest
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return null
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/* ---------- 浇水事件归一化 ---------- */

function normalizeWateringEvent(event = {}, conservativeReferenceDate = '') {
  if (!isPlainObject(event)) {
    return null
  }
  const watered = event.watered !== false && event.didWater !== false && event.action !== 'none'
  const amount = normalizeText(
    event.amount || event.wateringAmount || event.watering_amount || event.level || event.value
  )
  const amountMlRaw = event.amountMl ?? event.amount_ml
  const amountMl = Number(amountMlRaw)
  const hasAmountMl = Number.isFinite(amountMl) && amountMl > 0
  const date = normalizeDate(
    event.date || event.eventDate || event.day || conservativeReferenceDate
  )
  if (!watered && !amount && !hasAmountMl) {
    return null
  }
  const normalized = {
    date,
    watered: true,
    amount: amount || 'unknown'
  }
  if (hasAmountMl) {
    normalized.amountMl = Math.round(amountMl)
  }
  return normalized
}

function dedupeNormalizedEvents(events = [], keyResolver = event => JSON.stringify(event)) {
  const seen = new Map()
  for (const event of events) {
    if (!event) {
      continue
    }
    const key = keyResolver(event)
    if (!seen.has(key)) {
      seen.set(key, event)
    }
  }
  return Array.from(seen.values())
}

function limitRecentNormalizedEvents(events = [], limit = 10) {
  return events
    .slice()
    .sort((a, b) => normalizeDate(b.date).localeCompare(normalizeDate(a.date)))
    .slice(0, limit)
    .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)))
}

/* ---------- 行为时间线归一化 ---------- */

function buildBehaviorSummary(referenceDate = '', events = {}, potGeometry = {}) {
  const wateringEvents = Array.isArray(events.wateringEvents) ? events.wateringEvents : []
  const lookbackWindowDays = resolveLookbackWindowDays([5, 8], potGeometry)
  const potVolumeMl = Number(potGeometry.potVolumeMl) || 0

  const effectiveHydrationLoad = computeEffectiveHydrationLoad(
    wateringEvents,
    referenceDate,
    lookbackWindowDays,
    potVolumeMl
  )
  const wetPressureLoad = computeWetPressureLoad(
    wateringEvents,
    referenceDate,
    lookbackWindowDays,
    potGeometry
  )
  const lastEffectiveRootWateredDaysAgo = computeLastEffectiveRootWateredDaysAgo(
    wateringEvents,
    referenceDate,
    potVolumeMl
  )
  const rootZoneMoistureIndex = computeRootZoneMoistureIndex(
    effectiveHydrationLoad,
    wetPressureLoad,
    Number(potGeometry.potGeometryDryDownFactor) || 1.0,
    0
  )

  return {
    effectiveHydrationLoad,
    wetPressureLoad,
    lastEffectiveRootWateredDaysAgo,
    rootZoneMoistureIndex,
    thoroughWateringCount10d: wateringEvents.filter(
      event => resolveDoseClass(event, potVolumeMl) === DOSE_CLASS.THOROUGH
    ).length,
    lastWateredDaysAgo: latestDaysAgo(referenceDate, wateringEvents),
    lookbackWindowDays
  }
}

function normalizeCareBehaviorTimeline(input = {}) {
  const source = isPlainObject(input) ? input : {}
  const referenceDate = normalizeDate(
    source.referenceDate ||
      source.reference_date ||
      source.diagnosisDate ||
      source.diagnosis_date ||
      new Date().toISOString()
  )
  const wateringEvents10d = [
    ...(Array.isArray(source.wateringEvents10d) ? source.wateringEvents10d : []),
    ...(Array.isArray(source.watering_events_10d) ? source.watering_events_10d : [])
  ]
    .map(event => normalizeWateringEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedWateringEvents10d = dedupeNormalizedEvents(wateringEvents10d, event =>
    normalizeDate(event.date)
  )
  const recentWateringEvents10d = limitRecentNormalizedEvents(dedupedWateringEvents10d)

  const summary = buildBehaviorSummary(referenceDate, {
    wateringEvents: recentWateringEvents10d
  })

  return {
    referenceDate,
    reference_date: referenceDate,
    wateringEvents10d: recentWateringEvents10d,
    watering_events_10d: recentWateringEvents10d,
    summary
  }
}

/* ---------- 间隔与下次浇水日期组合 ---------- */

function resolveBaselineInterval(wateringStrategy = {}) {
  const freq =
    wateringStrategy.freq || wateringStrategy.intervalDays || wateringStrategy.interval_days
  if (Array.isArray(freq) && freq.length >= 2) {
    const min = toNumber(freq[0])
    const max = toNumber(freq[1])
    if (min !== undefined && max !== undefined) {
      return [min, max]
    }
  }
  return [5, 8]
}

/**
 * 从 wateringContext + baseline 推导出下次浇水日期。
 *
 * - WET：偏湿，延迟浇水，下次返回 null 让前端提示"暂停浇水并检查土壤"
 * - DRY：偏干，尽快浇水，下次 = 今天 + 1
 * - BASELINE：正常，下次 = 最近浇水日 + mid(baseline interval)；无浇水记录时返回 null
 *
 * 所有日期均 clamp 到不早于明天（referenceDate + 1），避免算出过去日期。
 *
 * @param {object} baseline - { intervalDays: [min, max] }
 * @param {string} wateringContext - WATERING_CONTEXTS 枚举值
 * @param {object} timeline - 归一化后的行为时间线
 * @param {string} referenceDate - 参考日期 'YYYY-MM-DD'
 * @param {number} intervalFactor - 蒸腾间隔修正系数（仅影响 BASELINE，DRY/WET 不受影响）
 * @returns {{ nextWaterDate: string|null, nextWaterWindow: [number, number], nextWaterReason: string }}
 */
function resolveNextWaterDate(
  baseline,
  wateringContext,
  timeline,
  referenceDate,
  intervalFactor = 1.0
) {
  const interval = baseline.intervalDays || [5, 8]
  const minDays = Math.max(1, Number(interval[0]) || 5)
  const maxDays = Math.max(minDays, Number(interval[1]) || minDays)

  const wateringEvents = timeline?.watering_events_10d || timeline?.wateringEvents10d || []
  const refDate = parseDate(referenceDate) || new Date()

  function clampToTomorrow(date) {
    const tomorrow = new Date(refDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(12, 0, 0, 0)
    if (date < tomorrow) {
      return tomorrow
    }
    return date
  }

  if (wateringContext === WATERING_CONTEXTS.WET) {
    return {
      nextWaterDate: null,
      nextWaterWindow: [minDays, maxDays],
      nextWaterReason: '近期浇水偏多或环境偏湿，建议暂停浇水并检查土壤干湿状态'
    }
  }

  if (wateringContext === WATERING_CONTEXTS.DRY) {
    const tomorrow = new Date(refDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return {
      nextWaterDate: formatDate(tomorrow),
      nextWaterWindow: [1, minDays],
      nextWaterReason: '环境偏干或距上次浇水较久，建议尽快检查土壤并补水'
    }
  }

  // BASELINE：intervalFactor 仅在此轻微调制周期，DRY/WET 不受影响
  const factor = Number(intervalFactor) > 0 ? Number(intervalFactor) : 1.0
  const baselineMinDays = Math.max(1, Math.round(minDays * factor))
  const baselineMaxDays = Math.max(baselineMinDays, Math.round(maxDays * factor))
  const baselineMidDays = Math.max(1, Math.round((baselineMinDays + baselineMaxDays) / 2))
  if (wateringEvents.length === 0) {
    return {
      nextWaterDate: null,
      nextWaterWindow: [baselineMinDays, baselineMaxDays],
      nextWaterReason: '尚无浇水记录，请先选择最近 10 天的浇水日期'
    }
  }
  const latestEvent = wateringEvents
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
  const base = latestEvent ? parseDate(latestEvent.date) || refDate : refDate
  base.setDate(base.getDate() + baselineMidDays)
  const clamped = clampToTomorrow(base)
  return {
    nextWaterDate: formatDate(clamped),
    nextWaterWindow: [baselineMinDays, baselineMaxDays],
    nextWaterReason: '按属级基线间隔建议下次浇水时间'
  }
}

module.exports = {
  MS_PER_DAY,
  WATERING_CONTEXTS,
  normalizeRawText,
  normalizeText,
  isPlainObject,
  toNumber,
  normalizeDate,
  parseDate,
  daysAgo,
  latestDaysAgo,
  formatDate,
  normalizeWateringEvent,
  dedupeNormalizedEvents,
  limitRecentNormalizedEvents,
  buildBehaviorSummary,
  normalizeCareBehaviorTimeline,
  resolveBaselineInterval,
  resolveNextWaterDate
}
