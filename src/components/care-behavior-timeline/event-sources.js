import { normalizeCareBehaviorTimeline } from '@/utils/care-behavior-timeline.js'

const TIMELINE_EVENT_FIELD_BY_TYPE = {
  fertilizing: 'fertilizing_events_10d',
  lightChange: 'light_change_events_10d',
  watering: 'watering_events_10d'
}

const SELECTED_WATERING_EVENT_KEYS = [
  'selected_watering_events_10d',
  'selectedWateringEvents10d',
  'selectedWateringEvents',
  'selected_watering_events'
]

const RECORDED_WATERING_EVENT_KEYS = [
  'recorded_watering_events_10d',
  'recordedWateringEvents10d',
  'actual_watering_events_10d',
  'actualWateringEvents10d'
]

const RECORDED_FERTILIZING_EVENT_KEYS = [
  'recorded_fertilizing_events_10d',
  'recordedFertilizingEvents10d',
  'actual_fertilizing_events_10d',
  'actualFertilizingEvents10d'
]

const RECORDED_LIGHT_CHANGE_EVENT_KEYS = [
  'recorded_light_change_events_10d',
  'recordedLightChangeEvents10d',
  'actual_light_change_events_10d',
  'actualLightChangeEvents10d'
]

function pickByKeys(source = {}, keys = []) {
  if (!source || typeof source !== 'object') {return undefined}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {return source[key]}
  }
  return undefined
}

function normalizeEventsByType(value, type, options = {}) {
  const field = TIMELINE_EVENT_FIELD_BY_TYPE[type] || TIMELINE_EVENT_FIELD_BY_TYPE.watering
  return normalizeCareBehaviorTimeline({ [field]: value }, options)[field] || []
}

function normalizeOptionalEventsByType(value, type, fallback = [], options = {}) {
  return value === undefined ? fallback : normalizeEventsByType(value, type, options)
}

export function buildTimelineEventSources(options = {}) {
  const rawTimeline = options.rawTimeline && typeof options.rawTimeline === 'object'
    ? options.rawTimeline
    : {}
  const timelineSource = options.timelineSource || {}
  const normalizeOptions = {
    dateWindow: options.dateWindow,
    referenceDate: options.referenceDate
  }
  return {
    recordedFertilizingEvents: normalizeOptionalEventsByType(
      pickByKeys(rawTimeline, RECORDED_FERTILIZING_EVENT_KEYS),
      'fertilizing',
      timelineSource.fertilizing_events_10d,
      normalizeOptions
    ),
    recordedLightChangeEvents: normalizeOptionalEventsByType(
      pickByKeys(rawTimeline, RECORDED_LIGHT_CHANGE_EVENT_KEYS),
      'lightChange',
      timelineSource.light_change_events_10d,
      normalizeOptions
    ),
    recordedWateringEvents: normalizeOptionalEventsByType(
      pickByKeys(rawTimeline, RECORDED_WATERING_EVENT_KEYS),
      'watering',
      timelineSource.watering_events_10d,
      normalizeOptions
    ),
    selectedWateringEvents: normalizeOptionalEventsByType(
      pickByKeys(rawTimeline, SELECTED_WATERING_EVENT_KEYS),
      'watering',
      timelineSource.watering_events_10d,
      normalizeOptions
    )
  }
}

export function buildTimelinePayloadDateEvents(dateStates = {}) {
  return Object.fromEntries(
    Object.entries(dateStates)
      .filter(([, state]) => Boolean(state?.isSelectable))
      .map(([date, state]) => [
        date,
        {
          ...state,
          fertilizing: state.recordedFertilizing,
          lightChange: state.recordedLightChange,
          watering: state.selectedWatering
        }
      ])
  )
}
