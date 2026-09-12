// 养护行为时间线主流程
// 将原始多源数据归一为标准 timeline 结构：reference_date + 三类事件 10d 列表 + last_fertilized_bucket。
// bucket 协调规则：10d 内有施肥事件 → within_10d；否则取显式声明，缺失时由施肥日期推导。

import { CARE_FIELD_MAP } from './constants.js'
import { toDateString, toDateValue } from './date-utils.js'
import {
  normalizeBucket,
  normalizeCareBehaviorEventList,
  pickByKeys,
  pickByKeysWithFound
} from './normalize.js'
import { getCareBehaviorDateSet } from './date-window.js'
import { deriveLastFertilizedBucket } from './fertilizer-bucket.js'

function explicitReference(source = {}, options = {}) {
  const explicit = pickByKeysWithFound(source, CARE_FIELD_MAP.reference_date)
  const optionReference = pickByKeysWithFound(options, ['reference_date', 'referenceDate'])
  return optionReference.found ? optionReference.value : explicit.found ? explicit.value : null
}

export function normalizeCareBehaviorTimeline(raw = {}, options = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const referenceInput =
    explicitReference(source, options) ||
    options.referenceDate ||
    options.referenceDateInput ||
    new Date()
  const referenceDate = toDateValue(referenceInput) || new Date()
  const anchor = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  )
  const dateWindow = options.dateWindow ? options.dateWindow : getCareBehaviorDateSet(anchor)

  const sourceBucket = pickByKeysWithFound(source, CARE_FIELD_MAP.last_fertilized_bucket)
  const optionBucket = pickByKeysWithFound(options, [
    'last_fertilized_bucket',
    'lastFertilizedBucket',
    'last_fertilizedBucket',
    'lastFertilized',
    'fertilizedBucket'
  ])
  const explicitBucket = optionBucket.found
    ? optionBucket.value
    : sourceBucket.found
      ? sourceBucket.value
      : null

  const timeline = {
    reference_date: toDateString(anchor),
    watering_events_10d: normalizeCareBehaviorEventList(
      pickByKeys(source, CARE_FIELD_MAP.watering),
      dateWindow,
      'watering'
    ),
    fertilizing_events_10d: normalizeCareBehaviorEventList(
      pickByKeys(source, CARE_FIELD_MAP.fertilizing),
      dateWindow,
      'fertilizing'
    ),
    light_change_events_10d: normalizeCareBehaviorEventList(
      pickByKeys(source, CARE_FIELD_MAP.light_change),
      dateWindow,
      'light_change'
    ),
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
    timeline.last_fertilized_bucket =
      explicitBucket !== null ? explicitNormalizedBucket : inferredBucket
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
  return question && typeof question === 'object'
    ? pickByKeys(question, [
        'careBehaviorTimeline',
        'care_behavior_timeline',
        'careBehavior',
        'timeline'
      ]) ||
        pickByKeys(question?.payload || {}, [
          'careBehaviorTimeline',
          'care_behavior_timeline',
          'careBehavior',
          'timeline'
        ]) ||
        pickByKeys(question?.data || {}, [
          'careBehaviorTimeline',
          'care_behavior_timeline',
          'careBehavior',
          'timeline'
        ]) ||
        pickByKeys(question?.meta || {}, [
          'careBehaviorTimeline',
          'care_behavior_timeline',
          'careBehavior',
          'timeline'
        ]) ||
        {}
    : {}
}

export function extractCareBehaviorTimelineFromQuestion(question = {}) {
  const source = question && typeof question === 'object' ? question : {}
  return normalizeCareBehaviorTimeline(resolveQuestionTimelineSource(source))
}

export { resolveQuestionTimelineSource }
