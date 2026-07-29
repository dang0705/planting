'use strict'

const { buildPublicVisualAggregateSummary } = require('../utils/public-runtime-summary')
const { buildPublicCoreProcess } = require('../utils/public-core-process')
const { normalizePublicDerivedEvidenceSet } = require('../utils/derived-evidence')
const { normalizePublicDiagnosisDirectionSet } = require('../utils/diagnosis-directions')
const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')
const { diagnosisRoundPresenterHelpers } = require('./diagnosis-round-presenter-helpers')
const {
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildCompactActionAdvice,
  buildCompactOutcomeEntry,
  buildCompactVisualBatchTrace,
  buildCompactVisualAggregateSummary,
  buildCompactFinalResult
} = require('./diagnosis-round-compact-presenter')

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compactCareBehaviorEvent(event = {}, eventType = '') {
  if (!isPlainObject(event)) {
    return null
  }
  const date = String(event.date || '').trim()
  if (!date) {
    return null
  }

  if (eventType === 'watering') {
    return {
      date,
      watered: Boolean(event.watered !== false),
      amount: String(event.amount || '').trim()
    }
  }

  if (eventType === 'fertilizing') {
    return {
      date,
      fertilized: Boolean(event.fertilized !== false),
      strength: String(event.strength || '').trim()
    }
  }

  return {
    date,
    event: String(event.event || '').trim()
  }
}

function compactCareBehaviorEventList(events = [], eventType = '') {
  return (Array.isArray(events) ? events : [])
    .slice(0, 10)
    .map(event => compactCareBehaviorEvent(event, eventType))
    .filter(Boolean)
}

function compactCareBehaviorSummary(summary = null) {
  if (!isPlainObject(summary)) {
    return null
  }

  return {
    effectiveHydrationLoad:
      summary.effectiveHydrationLoad === null || summary.effectiveHydrationLoad === undefined
        ? null
        : Number(summary.effectiveHydrationLoad),
    wetPressureLoad:
      summary.wetPressureLoad === null || summary.wetPressureLoad === undefined
        ? null
        : Number(summary.wetPressureLoad),
    lastEffectiveRootWateredDaysAgo:
      summary.lastEffectiveRootWateredDaysAgo === null ||
      summary.lastEffectiveRootWateredDaysAgo === undefined
        ? null
        : Number(summary.lastEffectiveRootWateredDaysAgo),
    rootZoneMoistureIndex:
      summary.rootZoneMoistureIndex === null || summary.rootZoneMoistureIndex === undefined
        ? null
        : Number(summary.rootZoneMoistureIndex),
    thoroughWateringCount10d: Number(summary.thoroughWateringCount10d || 0),
    fertilizingCount10d: Number(summary.fertilizingCount10d || 0),
    lastWateredDaysAgo:
      summary.lastWateredDaysAgo === null || summary.lastWateredDaysAgo === undefined
        ? null
        : Number(summary.lastWateredDaysAgo),
    lastFertilizedBucket: String(summary.lastFertilizedBucket || '').trim(),
    movedToStrongerLightWithin10d: Boolean(summary.movedToStrongerLightWithin10d),
    userHasDirectSunExposure: Boolean(summary.userHasDirectSunExposure)
  }
}

function compactEnvironmentSummary(summary = null) {
  if (!isPlainObject(summary)) {
    return null
  }

  return {
    windowDays:
      summary.windowDays === null || summary.windowDays === undefined
        ? null
        : Number(summary.windowDays),
    recordCount:
      summary.recordCount === null || summary.recordCount === undefined
        ? null
        : Number(summary.recordCount),
    highHumidityDays: Number(summary.highHumidityDays || 0),
    lowHumidityDays: Number(summary.lowHumidityDays || 0),
    coldHumidDays: Number(summary.coldHumidDays || 0),
    hotDryDays: Number(summary.hotDryDays || 0),
    hotHumidDays: Number(summary.hotHumidDays || 0),
    rainyDays: Number(summary.rainyDays || 0),
    maxConsecutiveHighHumidityDays: Number(summary.maxConsecutiveHighHumidityDays || 0),
    maxConsecutiveLowHumidityDays: Number(summary.maxConsecutiveLowHumidityDays || 0),
    maxConsecutiveColdHumidDays: Number(summary.maxConsecutiveColdHumidDays || 0),
    maxConsecutiveHotDryDays: Number(summary.maxConsecutiveHotDryDays || 0),
    maxConsecutiveRainyDays: Number(summary.maxConsecutiveRainyDays || 0),
    thresholds: isPlainObject(summary.thresholds) ? summary.thresholds : null,
    ...(summary.maxUvIndex === null || summary.maxUvIndex === undefined
      ? {}
      : { maxUvIndex: Number(summary.maxUvIndex) }),
    ...(summary.aboveGenusUvMaxDays === null || summary.aboveGenusUvMaxDays === undefined
      ? {}
      : { aboveGenusUvMaxDays: Number(summary.aboveGenusUvMaxDays) })
  }
}

function compactWateringPlanner(value = null) {
  if (!isPlainObject(value)) {
    return null
  }
  return {
    baseline: isPlainObject(value.baseline) ? value.baseline : null,
    wateringContext: String(value.wateringContext || '').trim(),
    action: String(value.action || '').trim(),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    thresholds: isPlainObject(value.thresholds) ? value.thresholds : null,
    calculation: isPlainObject(value.calculation) ? value.calculation : null,
    summary: compactCareBehaviorSummary(value.summary)
  }
}

function compactFertilizingPlanner(value = null) {
  if (!isPlainObject(value)) {
    return null
  }
  return {
    baseline: isPlainObject(value.baseline) ? value.baseline : null,
    action: String(value.action || '').trim(),
    lastFertilizedBucket: String(value.lastFertilizedBucket || '').trim(),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    thresholds: isPlainObject(value.thresholds) ? value.thresholds : null,
    calculation: isPlainObject(value.calculation) ? value.calculation : null
  }
}

function compactLightPlanner(value = null) {
  if (!isPlainObject(value)) {
    return null
  }
  return {
    lightContext: Array.isArray(value.lightContext)
      ? value.lightContext.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    userLightContext: isPlainObject(value.userLightContext) ? value.userLightContext : null,
    lightHealthScore:
      value.lightHealthScore === null || value.lightHealthScore === undefined
        ? null
        : Number(value.lightHealthScore),
    lightHealthLevel: String(value.lightHealthLevel || '').trim(),
    lightHealthReason: String(value.lightHealthReason || '').trim(),
    lightHealthEvidence: isPlainObject(value.lightHealthEvidence)
      ? value.lightHealthEvidence
      : null,
    realExposureScene: Boolean(value.realExposureScene)
  }
}

function compactCareBehaviorTimelineForPublic(value = null) {
  if (!isPlainObject(value)) {
    return null
  }

  const referenceDate = String(value.referenceDate || value.reference_date || '').trim()
  const dailyRecords = Array.isArray(value.dailyRecords)
    ? value.dailyRecords.slice(0, 10)
    : Array.isArray(value.daily_records)
      ? value.daily_records.slice(0, 10)
      : []
  const wateringEvents10d = compactCareBehaviorEventList(
    value.wateringEvents10d || value.watering_events_10d || [],
    'watering'
  )
  const fertilizingEvents10d = compactCareBehaviorEventList(
    value.fertilizingEvents10d || value.fertilizing_events_10d || [],
    'fertilizing'
  )
  const lightChangeEvents10d = compactCareBehaviorEventList(
    value.lightChangeEvents10d || value.light_change_events_10d || [],
    'light_change'
  )

  return {
    ...(referenceDate ? { referenceDate, reference_date: referenceDate } : {}),
    dailyRecords,
    daily_records: dailyRecords,
    wateringEvents10d,
    watering_events_10d: wateringEvents10d,
    fertilizingEvents10d,
    fertilizing_events_10d: fertilizingEvents10d,
    lightChangeEvents10d,
    light_change_events_10d: lightChangeEvents10d,
    lastFertilizedBucket: String(
      value.lastFertilizedBucket || value.last_fertilized_bucket || ''
    ).trim(),
    last_fertilized_bucket: String(
      value.lastFertilizedBucket || value.last_fertilized_bucket || ''
    ).trim(),
    summary: compactCareBehaviorSummary(value.summary)
  }
}

function compactEnvironmentCareContextForPublic(value = null, careBehaviorTimeline = null) {
  if (!isPlainObject(value)) {
    return null
  }

  const outputs = isPlainObject(value.outputs)
    ? {
        wateringContext: String(value.outputs.wateringContext || '').trim(),
        wateringAction: String(value.outputs.wateringAction || '').trim(),
        fertilizingAction: String(value.outputs.fertilizingAction || '').trim(),
        lightContext: Array.isArray(value.outputs.lightContext)
          ? value.outputs.lightContext.map(item => String(item || '').trim()).filter(Boolean)
          : [],
        lightHealthScore:
          value.outputs.lightHealthScore === null || value.outputs.lightHealthScore === undefined
            ? null
            : Number(value.outputs.lightHealthScore),
        lightHealthLevel: String(value.outputs.lightHealthLevel || '').trim(),
        lightHealthReason: String(value.outputs.lightHealthReason || '').trim(),
        lightHealthEvidence: isPlainObject(value.outputs.lightHealthEvidence)
          ? value.outputs.lightHealthEvidence
          : null
      }
    : null
  const compactTimeline = compactCareBehaviorTimelineForPublic(
    careBehaviorTimeline || value.careBehaviorTimeline || value.care_behavior_timeline || null
  )

  return {
    version: String(value.version || '').trim() || 'v7',
    outputs,
    behaviorSummary10d: compactCareBehaviorSummary(value.behaviorSummary10d),
    historicalSummary10d: compactEnvironmentSummary(value.historicalSummary10d),
    forecastSummary15d: compactEnvironmentSummary(value.forecastSummary15d),
    thresholds: isPlainObject(value.thresholds) ? value.thresholds : null,
    watering: compactWateringPlanner(value.watering),
    fertilizing: compactFertilizingPlanner(value.fertilizing),
    light: compactLightPlanner(value.light),
    calculationTrace: isPlainObject(value.calculationTrace) ? value.calculationTrace : null,
    ...(compactTimeline ? { careBehaviorTimeline: compactTimeline } : {})
  }
}

module.exports = {
  isPlainObject,
  compactCareBehaviorEvent,
  compactCareBehaviorEventList,
  compactCareBehaviorSummary,
  compactEnvironmentSummary,
  compactWateringPlanner,
  compactFertilizingPlanner,
  compactLightPlanner,
  compactCareBehaviorTimelineForPublic,
  compactEnvironmentCareContextForPublic,
  buildPublicVisualAggregateSummary,
  buildPublicCoreProcess,
  normalizePublicDerivedEvidenceSet,
  normalizePublicDiagnosisDirectionSet,
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction,
  diagnosisRoundPresenterHelpers,
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildCompactActionAdvice,
  buildCompactOutcomeEntry,
  buildCompactVisualBatchTrace,
  buildCompactVisualAggregateSummary,
  buildCompactFinalResult
}
