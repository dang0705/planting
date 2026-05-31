import { isCareBehaviorTimelineQuestion } from './question-helpers.js'

const CARE_BEHAVIOR_BUCKET_OPTIONS = ['within_10d','11_30d','31_60d','over_60d','almost_never','unknown']
const CARE_BEHAVIOR_BUCKET_SET = new Set(CARE_BEHAVIOR_BUCKET_OPTIONS)
const CARE_BEHAVIOR_LIGHT_CHANGE_EVENT = 'direct_sun_exposure'
const CARE_BEHAVIOR_LIGHT_CHANGE_EVENTS = new Set([
  'moved_to_stronger_light',
  'moved_to_weaker_light',
  'direct_sun_exposure',
  'grow_light_changed',
  'none',
  'unknown'
])
const LEGACY_LIGHT_CHANGE_EVENT = 'strong_light_or_position_change'
const CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT = 'normal'
const CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH = 'thin'
const CARE_BEHAVIOR_DEFAULT_DAYS = 10
const DEFAULT_REFERENCE_DATE = new Date()
const DAY_MS = 24 * 60 * 60 * 1000

const CARE_FIELD_MAP = {
  watering: ['watering_events_10d','wateringEvents10d','wateringEvents','watering','watering_events'],
  fertilizing: ['fertilizing_events_10d','fertilizingEvents10d','fertilizingEvents','fertilizing','fertilizing_events'],
  light_change: ['light_change_events_10d','lightChangeEvents10d','lightChangeEvents','lightChange','light_change'],
  last_fertilized_bucket: ['last_fertilized_bucket','lastFertilizedBucket','last_fertilizedBucket','lastFertilized'],
  reference_date: ['reference_date','referenceDate','referenceDateIso','referenceDateISO']
}

const EVENT_FIELD_MAP = {
  watering: ['watered','watering','water','isWatered','hasWatered'],
  fertilizing: ['fertilized','fertilizing','fertilize','isFertilized','hasFertilized'],
  light_change: ['event','light_change','lightChange','strongLightOrPositionChange','positionChange','directSunExposure']
}

function pickByKeys(source = {}, keys = []) {
  if (!source || typeof source !== 'object') {
    return undefined
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key]
    }
  }
  return undefined
}

function pickByKeysWithFound(source = {}, keys = []) {
  const value = pickByKeys(source, keys)
  return value === undefined ? { found: false, value: undefined } : { found: true, value }
}

function toDateString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function parseDateParts(raw = '') {
  const parts = raw.includes('-') ? raw.split('-') : raw.split('/')
  if (parts.length !== 3) {
    return null
  }
  const [y, m, d] = parts
  const yi = Number(y), mi = Number(m), di = Number(d)
  if (!Number.isInteger(yi) || !Number.isInteger(mi) || !Number.isInteger(di) || mi < 1 || mi > 12 || di < 1 || di > 31) {
    return null
  }
  const date = new Date(yi, mi - 1, di)
  return Number.isNaN(date.getTime()) ? null : date
}

function coerceDateValue(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateString(value)
  }
  const raw = String(value).trim()
  if (!raw) {
    return ''
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(raw)) {
    const parsed = parseDateParts(raw)
    return parsed ? toDateString(parsed) : ''
  }
  if (/^\d{10,}$/.test(raw)) {
    const numeric = Number(raw)
    const parsed = new Date(numeric > 1e12 ? numeric : numeric * 1000)
    return Number.isNaN(parsed.getTime()) ? '' : toDateString(parsed)
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : toDateString(parsed)
}

const toDateValue = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  const normalized = coerceDateValue(value)
  if (!normalized) {
    return null
  }
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeBucket = value => {
  const normalized = String(value || '').trim()
  return CARE_BEHAVIOR_BUCKET_SET.has(normalized) ? normalized : 'unknown'
}

const normalizeAmount = value => String(value || '').trim() || CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT
const normalizeStrength = value => String(value || '').trim() || CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH

function normalizeLightEvent(value = '', options = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  const fallback = String(options?.fallback || 'unknown').trim() || 'unknown'
  if (!normalized) {
    return fallback
  }
  if (normalized === LEGACY_LIGHT_CHANGE_EVENT) {
    return CARE_BEHAVIOR_LIGHT_CHANGE_EVENT
  }
  if (CARE_BEHAVIOR_LIGHT_CHANGE_EVENTS.has(normalized)) {
    return normalized
  }
  return fallback
}

function normalizeCareBehaviorEvent(value, type, explicitDate = '') {
  const date = coerceDateValue(explicitDate)
  if (!date) {
    return null
  }
  if (type === 'watering') {
    return { date, watered: true, amount: normalizeAmount(value?.amount || value?.wateringAmount || value?.dose) }
  }
  if (type === 'fertilizing') {
    return { date, fertilized: true, strength: normalizeStrength(value?.strength || value?.fertilizingIntensity || value?.dose || value?.amount) }
  }
  const fallbackEvent = typeof value !== 'object' || value === null ? CARE_BEHAVIOR_LIGHT_CHANGE_EVENT : 'unknown'
  return {
    date,
    event: normalizeLightEvent(value?.event || value?.lightEvent || value?.changeType || value?.type, {
      fallback: fallbackEvent
    })
  }
}

function isTrueish(value) {
  if (value === null || value === undefined || value === '') {
    return false
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value > 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized && !['0', 'false', 'no', 'off', 'none', 'never'].includes(normalized)
  }
  return true
}

function shouldNormalizeCareBehaviorEvent(value = null, type = 'watering') {
  if (value === null || value === undefined || value === '') {
    return true
  }
  const marker = pickByKeys(value, EVENT_FIELD_MAP[type] || [])
  return marker !== undefined ? isTrueish(marker) : isTrueish(value)
}

function normalizeCareBehaviorEventList(value = null, dateWindow = new Set(), type = 'watering') {
  const events = []
  const seen = new Set()
  const add = (date, rawValue) => {
    if (!date || (dateWindow.size && !dateWindow.has(date)) || seen.has(date)) {
      return
    }
    const event = normalizeCareBehaviorEvent(rawValue, type, date)
    if (!event) {
      return
    }
    seen.add(date)
    events.push(event)
  }

  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === null || item === undefined) {
        continue
      }
      if (typeof item === 'string' || typeof item === 'number' || item instanceof Date) {
        add(coerceDateValue(item), item)
        continue
      }
      if (typeof item === 'object') {
        const date = coerceDateValue(item.date || item.day || item.d || item.dayKey || item.dateKey)
        if (!date || !shouldNormalizeCareBehaviorEvent(item, type)) {
          continue
        }
        add(date, item)
      }
    }
    return events.sort((a, b) => a.date.localeCompare(b.date))
  }

  if (typeof value === 'object') {
    if (!Object.keys(value).length) {
      return []
    }
    for (const [rawDate, rawValue] of Object.entries(value)) {
      const date = coerceDateValue(rawDate)
      if (!date || !shouldNormalizeCareBehaviorEvent(rawValue, type)) {
        continue
      }
      add(date, rawValue)
    }
    return events.sort((a, b) => a.date.localeCompare(b.date))
  }

  if (typeof value === 'string' || typeof value === 'number') {
    add(coerceDateValue(value), value)
  }
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

function deriveLastFertilizedBucket(fertilizingDates = [], referenceDate = DEFAULT_REFERENCE_DATE, fallbackBucket = 'unknown') {
  const normalizedFallback = normalizeBucket(fallbackBucket)
  const validDates = Array.isArray(fertilizingDates)
    ? fertilizingDates.map(item => coerceDateValue(item?.date)).filter(Boolean).sort()
    : []
  if (!validDates.length) {
    return normalizedFallback === 'almost_never' || normalizedFallback === 'over_60d'
      ? normalizedFallback : 'unknown'
  }

  const anchor = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
    : new Date()
  const latest = new Date(validDates[validDates.length - 1])
  const days = Math.floor((anchor - latest) / DAY_MS)

  if (!Number.isFinite(days) || days <= 10) {
    return 'within_10d'
  }
  if (days <= 30) {
    return '11_30d'
  }
  if (days <= 60) {
    return '31_60d'
  }
  return 'over_60d'
}

export function getCareBehaviorDateWindow(referenceDate = DEFAULT_REFERENCE_DATE) {
  const base = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? new Date(referenceDate)
    : toDateValue(referenceDate) || new Date()
  const anchor = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  return Array.from({ length: CARE_BEHAVIOR_DEFAULT_DAYS + 1 }, (_, index) => {
    const date = new Date(anchor)
    date.setDate(anchor.getDate() - (CARE_BEHAVIOR_DEFAULT_DAYS - index))
    const normalized = toDateString(date)
    return { date: normalized, day: date.getDate(), isToday: normalized === toDateString(anchor), isFuture: false }
  })
}

export const getCareBehaviorDateSet = (referenceDate = DEFAULT_REFERENCE_DATE) =>
  new Set(getCareBehaviorDateWindow(referenceDate).map(item => item.date))

function explicitReference(source = {}, options = {}) {
  const explicit = pickByKeysWithFound(source, CARE_FIELD_MAP.reference_date)
  const optionReference = pickByKeysWithFound(options, ['reference_date', 'referenceDate'])
  return optionReference.found ? optionReference.value : explicit.found ? explicit.value : null
}

export function normalizeCareBehaviorTimeline(raw = {}, options = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const referenceInput = explicitReference(source, options) || options.referenceDate || options.referenceDateInput || new Date()
  const referenceDate = toDateValue(referenceInput) || new Date()
  const anchor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  const dateWindow = options.dateWindow ? options.dateWindow : getCareBehaviorDateSet(anchor)

  const sourceBucket = pickByKeysWithFound(source, CARE_FIELD_MAP.last_fertilized_bucket)
  const optionBucket = pickByKeysWithFound(options, [
    'last_fertilized_bucket',
    'lastFertilizedBucket',
    'last_fertilizedBucket',
    'lastFertilized',
    'fertilizedBucket'
  ])
  const explicitBucket = optionBucket.found ? optionBucket.value : sourceBucket.found ? sourceBucket.value : null

  const timeline = {
    reference_date: toDateString(anchor),
    watering_events_10d: normalizeCareBehaviorEventList(pickByKeys(source, CARE_FIELD_MAP.watering), dateWindow, 'watering'),
    fertilizing_events_10d: normalizeCareBehaviorEventList(pickByKeys(source, CARE_FIELD_MAP.fertilizing), dateWindow, 'fertilizing'),
    light_change_events_10d: normalizeCareBehaviorEventList(pickByKeys(source, CARE_FIELD_MAP.light_change), dateWindow, 'light_change'),
    last_fertilized_bucket: 'unknown'
  }

  const explicitNormalizedBucket = normalizeBucket(explicitBucket)
  const inferredBucket = deriveLastFertilizedBucket(
    timeline.fertilizing_events_10d,
    anchor,
    explicitNormalizedBucket
  )
  if (timeline.fertilizing_events_10d.length) {
    timeline.last_fertilized_bucket = 'within_10d'
  } else {
    timeline.last_fertilized_bucket = explicitBucket !== null ? explicitNormalizedBucket : inferredBucket
  }
  return timeline
}

export function hasMeaningfulCareBehaviorTimeline(raw = null) {
  const timeline = normalizeCareBehaviorTimeline(raw)
  return Boolean(
    timeline.watering_events_10d.length ||
    timeline.fertilizing_events_10d.length ||
    timeline.light_change_events_10d.length ||
    (timeline.last_fertilized_bucket && timeline.last_fertilized_bucket !== 'unknown')
  )
}

function resolveQuestionTimelineSource(question = {}) {
  return question && typeof question === 'object' ? (
    pickByKeys(question, ['careBehaviorTimeline', 'care_behavior_timeline', 'careBehavior', 'timeline']) ||
    pickByKeys(question?.payload || {}, ['careBehaviorTimeline', 'care_behavior_timeline', 'careBehavior', 'timeline']) ||
    pickByKeys(question?.data || {}, ['careBehaviorTimeline', 'care_behavior_timeline', 'careBehavior', 'timeline']) ||
    pickByKeys(question?.meta || {}, ['careBehaviorTimeline', 'care_behavior_timeline', 'careBehavior', 'timeline']) ||
    {}
  ) : {}
}

export function extractCareBehaviorTimelineFromQuestion(question = {}) {
  const source = question && typeof question === 'object' ? question : {}
  return normalizeCareBehaviorTimeline(resolveQuestionTimelineSource(source))
}

const normalizeDateWindow = options => {
  if (options.dateWindowSet?.size) {
    return options.dateWindowSet
  }
  if (options.dateWindow?.size) {
    return options.dateWindow
  }
  return getCareBehaviorDateSet(options.referenceDate || DEFAULT_REFERENCE_DATE)
}

function resolveReferenceDateFromContext(options = {}, payload = {}, candidates = []) {
  const optionReference = pickByKeysWithFound(options, ['referenceDate', 'reference_date'])
  if (optionReference.found && optionReference.value) {
    return optionReference.value
  }

  const payloadReference = pickByKeysWithFound(payload, ['referenceDate', 'reference_date'])
  if (payloadReference.found && payloadReference.value) {
    return payloadReference.value
  }

  for (const source of candidates || []) {
    const sourceReference = pickByKeysWithFound(source, CARE_FIELD_MAP.reference_date)
    if (sourceReference.found && sourceReference.value) {
      return sourceReference.value
    }
  }

  return new Date()
}

function mergeCandidateEvents(base = [], next = []) {
  const map = new Map(base.map(item => [item.date, item]))
  for (const item of next) {
    if (!item?.date) {
      continue
    }
    map.set(item.date, map.has(item.date) ? { ...map.get(item.date), ...item } : item)
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function mergeTimelineCandidates(candidates = [], options = {}) {
  const anchor = toDateValue(options.referenceDate) || new Date()
  const dateWindow = normalizeDateWindow(options)
  const merged = {
    reference_date: toDateString(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())),
    watering_events_10d: [],
    fertilizing_events_10d: [],
    light_change_events_10d: [],
    last_fertilized_bucket: 'unknown'
  }

  let explicitBucket = ''

  for (const source of candidates) {
    const normalized = normalizeCareBehaviorTimeline(source, { ...options, referenceDate: options.referenceDate, dateWindow })
    if (!hasMeaningfulCareBehaviorTimeline(normalized)) {
      continue
    }

    merged.reference_date = normalized.reference_date || merged.reference_date
    merged.watering_events_10d = mergeCandidateEvents(merged.watering_events_10d, normalized.watering_events_10d)
    merged.fertilizing_events_10d = mergeCandidateEvents(merged.fertilizing_events_10d, normalized.fertilizing_events_10d)
    merged.light_change_events_10d = mergeCandidateEvents(merged.light_change_events_10d, normalized.light_change_events_10d)

    const candidateBucket = normalizeBucket(normalized.last_fertilized_bucket)
    if (!explicitBucket && candidateBucket !== 'unknown' && !normalized.fertilizing_events_10d.length) {
      explicitBucket = candidateBucket
    }
  }

  const inferredBucket = deriveLastFertilizedBucket(
    merged.fertilizing_events_10d,
    toDateValue(merged.reference_date) || anchor,
    explicitBucket || 'unknown'
  )

  merged.last_fertilized_bucket = merged.fertilizing_events_10d.length ? 'within_10d' : (explicitBucket || inferredBucket)
  return merged
}

export function appendCareBehaviorSidecar(payload = {}, options = {}) {
  const questionStack = Array.isArray(options?.questionStack) ? options.questionStack : []
  const careBehaviorTimelineByQuestionId = options?.careBehaviorTimelineByQuestionId || options?.timelineByQuestionId || {}
  const excludedQuestionIds = new Set(
    Array.isArray(options?.excludedQuestionIds)
      ? options.excludedQuestionIds.map(questionId => String(questionId || '').trim()).filter(Boolean)
      : []
  )
  const fallback = options?.careBehaviorTimeline || options?.timeline
  const candidates = []

  if (fallback && typeof fallback === 'object') {
    candidates.push(fallback)
  }

  for (const question of questionStack) {
    if (!question || typeof question !== 'object' || !isCareBehaviorTimelineQuestion(question)) {
      continue
    }
    const questionId = String(question.questionId || '').trim()
    if (questionId && excludedQuestionIds.has(questionId)) {
      continue
    }
    const source = questionId && careBehaviorTimelineByQuestionId[questionId]
      ? careBehaviorTimelineByQuestionId[questionId]
      : resolveQuestionTimelineSource(question)
    if (source) {
      candidates.push(source)
    }
  }

  const resolvedReferenceDate = resolveReferenceDateFromContext(options, payload, candidates)

  const merged = mergeTimelineCandidates(candidates, {
    referenceDate: resolvedReferenceDate,
    dateWindow: options.dateWindow,
    dateWindowSet: options.dateWindowSet
  })

  if (!hasMeaningfulCareBehaviorTimeline(merged)) {
    return payload
  }

  return {
    ...payload,
    careBehaviorTimeline: normalizeCareBehaviorTimeline(merged, {
      referenceDate: resolvedReferenceDate || merged.reference_date
    })
  }
}

export function extractCareBehaviorSidecar(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const sidecar = pickByKeys(payload, ['careBehaviorTimeline', 'care_behavior_timeline', 'careBehavior'])
  if (sidecar && typeof sidecar === 'object') {
    return sidecar
  }

  const result = {
    ...(Object.prototype.hasOwnProperty.call(payload, 'watering_events_10d')
      ? { watering_events_10d: normalizeCareBehaviorEventList(payload.watering_events_10d, new Set(), 'watering') }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'fertilizing_events_10d')
      ? { fertilizing_events_10d: normalizeCareBehaviorEventList(payload.fertilizing_events_10d, new Set(), 'fertilizing') }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'light_change_events_10d')
      ? { light_change_events_10d: normalizeCareBehaviorEventList(payload.light_change_events_10d, new Set(), 'light_change') }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'reference_date') ? { reference_date: coerceDateValue(payload.reference_date) } : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'referenceDate') ? { reference_date: coerceDateValue(payload.referenceDate) } : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'last_fertilized_bucket')
      ? { last_fertilized_bucket: normalizeBucket(payload.last_fertilized_bucket) }
      : {})
  }

  return Object.keys(result).length ? result : null
}

export function buildCareBehaviorTimelineFromDateEvents(dateEvents = {}, options = {}) {
  const timeline = normalizeCareBehaviorTimeline({}, { ...options, referenceDate: options.referenceDate || new Date() })
  const timelineWindow = normalizeDateWindow(options)

  const wateringEvents = []
  const fertilizingEvents = []
  const lightChangeEvents = []
  const source = dateEvents && typeof dateEvents === 'object' ? dateEvents : {}

  for (const [rawDate, rawState] of Object.entries(source)) {
    const date = coerceDateValue(rawDate)
    if (!date || (timelineWindow.size && !timelineWindow.has(date)) || !rawState || typeof rawState !== 'object') {
      continue
    }
    if (rawState.isToday) {
      continue
    }
    if (rawState.watering) {
      wateringEvents.push({ date, watered: true, amount: CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT })
    }
    if (rawState.fertilizing) {
      fertilizingEvents.push({ date, fertilized: true, strength: CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH })
    }
    if (rawState.lightChange) {
      lightChangeEvents.push({ date, event: CARE_BEHAVIOR_LIGHT_CHANGE_EVENT })
    }
  }

  timeline.watering_events_10d = wateringEvents.sort((a, b) => a.date.localeCompare(b.date))
  timeline.fertilizing_events_10d = fertilizingEvents.sort((a, b) => a.date.localeCompare(b.date))
  timeline.light_change_events_10d = lightChangeEvents.sort((a, b) => a.date.localeCompare(b.date))

  timeline.last_fertilized_bucket = deriveLastFertilizedBucket(
    timeline.fertilizing_events_10d,
    options.referenceDate || DEFAULT_REFERENCE_DATE,
    options.last_fertilized_bucket || options.lastFertilizedBucket
  )

  return timeline
}
