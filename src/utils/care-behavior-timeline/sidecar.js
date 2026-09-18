// 养护行为 sidecar 合并
// 将多个问题来源的 timeline 候选合并为单一 sidecar，附加到诊断 payload；
// 同时提供从 payload 抽取 sidecar 与从日期事件构建 timeline 的能力。

import {
  CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH,
  CARE_BEHAVIOR_LIGHT_CHANGE_EVENT,
  CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT,
  CARE_FIELD_MAP,
  DEFAULT_REFERENCE_DATE
} from './constants.js'
import { coerceDateValue, toDateValue, toDateString } from './date-utils.js'
import {
  normalizeBucket,
  normalizeCareBehaviorEventList,
  pickByKeys,
  pickByKeysWithFound
} from './normalize.js'
import { getCareBehaviorDateSet } from './date-window.js'
import { deriveLastFertilizedBucket } from './fertilizer-bucket.js'
import {
  hasMeaningfulCareBehaviorTimeline,
  normalizeCareBehaviorTimeline,
  resolveQuestionTimelineSource
} from './timeline-core.js'
import { isCareBehaviorTimelineQuestion } from './question-helpers.js'

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
    reference_date: toDateString(
      new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
    ),
    watering_events_10d: [],
    fertilizing_events_10d: [],
    light_change_events_10d: [],
    last_fertilized_bucket: 'unknown'
  }

  let explicitBucket = ''

  for (const source of candidates) {
    const normalized = normalizeCareBehaviorTimeline(source, {
      ...options,
      referenceDate: options.referenceDate,
      dateWindow
    })
    if (!hasMeaningfulCareBehaviorTimeline(normalized)) {
      continue
    }

    merged.reference_date = normalized.reference_date || merged.reference_date
    merged.watering_events_10d = mergeCandidateEvents(
      merged.watering_events_10d,
      normalized.watering_events_10d
    )
    merged.fertilizing_events_10d = mergeCandidateEvents(
      merged.fertilizing_events_10d,
      normalized.fertilizing_events_10d
    )
    merged.light_change_events_10d = mergeCandidateEvents(
      merged.light_change_events_10d,
      normalized.light_change_events_10d
    )

    const candidateBucket = normalizeBucket(normalized.last_fertilized_bucket)
    if (
      !explicitBucket &&
      candidateBucket !== 'unknown' &&
      !normalized.fertilizing_events_10d.length
    ) {
      explicitBucket = candidateBucket
    }
  }

  const inferredBucket = deriveLastFertilizedBucket(
    merged.fertilizing_events_10d,
    toDateValue(merged.reference_date) || anchor,
    explicitBucket || 'unknown'
  )

  merged.last_fertilized_bucket = merged.fertilizing_events_10d.length
    ? 'within_10d'
    : explicitBucket || inferredBucket
  return merged
}

export function appendCareBehaviorSidecar(payload = {}, options = {}) {
  const questionStack = Array.isArray(options?.questionStack) ? options.questionStack : []
  const careBehaviorTimelineByQuestionId =
    options?.careBehaviorTimelineByQuestionId || options?.timelineByQuestionId || {}
  const excludedQuestionIds = new Set(
    Array.isArray(options?.excludedQuestionIds)
      ? options.excludedQuestionIds
          .map(questionId => String(questionId || '').trim())
          .filter(Boolean)
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
    const source =
      questionId && careBehaviorTimelineByQuestionId[questionId]
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

  const sidecar = pickByKeys(payload, [
    'careBehaviorTimeline',
    'care_behavior_timeline',
    'careBehavior'
  ])
  if (sidecar && typeof sidecar === 'object') {
    return sidecar
  }

  const result = {
    ...(Object.prototype.hasOwnProperty.call(payload, 'watering_events_10d')
      ? {
          watering_events_10d: normalizeCareBehaviorEventList(
            payload.watering_events_10d,
            new Set(),
            'watering'
          )
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'fertilizing_events_10d')
      ? {
          fertilizing_events_10d: normalizeCareBehaviorEventList(
            payload.fertilizing_events_10d,
            new Set(),
            'fertilizing'
          )
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'light_change_events_10d')
      ? {
          light_change_events_10d: normalizeCareBehaviorEventList(
            payload.light_change_events_10d,
            new Set(),
            'light_change'
          )
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'reference_date')
      ? { reference_date: coerceDateValue(payload.reference_date) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'referenceDate')
      ? { reference_date: coerceDateValue(payload.referenceDate) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'last_fertilized_bucket')
      ? { last_fertilized_bucket: normalizeBucket(payload.last_fertilized_bucket) }
      : {})
  }

  return Object.keys(result).length ? result : null
}

export function buildCareBehaviorTimelineFromDateEvents(dateEvents = {}, options = {}) {
  const timeline = normalizeCareBehaviorTimeline(
    {},
    { ...options, referenceDate: options.referenceDate || new Date() }
  )
  const timelineWindow = normalizeDateWindow(options)

  const wateringEvents = []
  const fertilizingEvents = []
  const lightChangeEvents = []
  const source = dateEvents && typeof dateEvents === 'object' ? dateEvents : {}

  for (const [rawDate, rawState] of Object.entries(source)) {
    const date = coerceDateValue(rawDate)
    if (
      !date ||
      (timelineWindow.size && !timelineWindow.has(date)) ||
      !rawState ||
      typeof rawState !== 'object'
    ) {
      continue
    }
    if (rawState.watering) {
      wateringEvents.push({ date, watered: true, amount: CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT })
    }
    if (rawState.fertilizing) {
      fertilizingEvents.push({
        date,
        fertilized: true,
        strength: CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH
      })
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
