// 养护行为事件归一化
// 将多源、多形态的浇水/施肥/光照变化事件归一为统一结构，并按日期窗口过滤去重排序。

import {
  CARE_BEHAVIOR_BUCKET_SET,
  CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH,
  CARE_BEHAVIOR_LIGHT_CHANGE_EVENT,
  CARE_BEHAVIOR_LIGHT_CHANGE_EVENTS,
  CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT,
  EVENT_FIELD_MAP,
  LEGACY_LIGHT_CHANGE_EVENT
} from './constants.js'
import { coerceDateValue } from './date-utils.js'

const normalizeBucket = value => {
  const normalized = String(value || '').trim()
  return CARE_BEHAVIOR_BUCKET_SET.has(normalized) ? normalized : 'unknown'
}

const normalizeAmount = value => String(value || '').trim() || CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT
const normalizeStrength = value =>
  String(value || '').trim() || CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH

function normalizeLightEvent(value = '', options = {}) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
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
    return {
      date,
      watered: true,
      amount: normalizeAmount(value?.amount || value?.wateringAmount || value?.dose)
    }
  }
  if (type === 'fertilizing') {
    return {
      date,
      fertilized: true,
      strength: normalizeStrength(
        value?.strength || value?.fertilizingIntensity || value?.dose || value?.amount
      )
    }
  }
  const fallbackEvent =
    typeof value !== 'object' || value === null ? CARE_BEHAVIOR_LIGHT_CHANGE_EVENT : 'unknown'
  return {
    date,
    event: normalizeLightEvent(
      value?.event || value?.lightEvent || value?.changeType || value?.type,
      {
        fallback: fallbackEvent
      }
    )
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

export {
  normalizeBucket,
  normalizeAmount,
  normalizeStrength,
  normalizeLightEvent,
  normalizeCareBehaviorEvent,
  normalizeCareBehaviorEventList,
  isTrueish,
  shouldNormalizeCareBehaviorEvent,
  pickByKeys,
  pickByKeysWithFound
}
