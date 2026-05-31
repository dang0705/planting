import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import {
  appendCareBehaviorSidecar,
  buildCareBehaviorTimelineFromDateEvents,
  buildCareBehaviorDisplayWindow,
  getVisibleCareBehaviorOptions,
  hasMeaningfulCareBehaviorTimeline,
  isLegacyWateringTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  normalizeCareBehaviorTimeline
} from './src/utils/care-behavior-timeline.js'
import {
  buildFollowUpPayload,
  createFollowUpAnswerMap,
  normalizeQuestions
} from './src/utils/diagnose-flow.js'
import { formatWeatherText } from './src/utils/care-behavior-weather.js'
import {
  buildWeatherByDateFromEnvironmentWeatherWindow,
  mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline
} from './src/utils/care-behavior-weather-window.js'

const require = createRequire(import.meta.url)
const { buildSyntheticFollowUpOptionMappings } = require('./cloudfunctions/diagnose-http/utils/synthetic-follow-up/option-mappings.js')

const baseDate = '2026-05-28'

const normalizedFromLegacy = normalizeCareBehaviorTimeline({
  referenceDate: baseDate,
  wateringEvents: ['2026-05-20', '2026-05-21'],
  fertilizingEvents10d: ['2026-05-20'],
  light_change_events_10d: { '2026-05-27': true },
  last_fertilized_bucket: '31_60d'
})

assert.equal(normalizedFromLegacy.reference_date, baseDate)
assert.equal(normalizedFromLegacy.watering_events_10d.length, 2)
assert.equal(normalizedFromLegacy.fertilizing_events_10d.length, 1)
assert.equal(normalizedFromLegacy.light_change_events_10d.length, 1)
assert.equal(normalizedFromLegacy.watering_events_10d[0].watered, true)
assert.equal(normalizedFromLegacy.watering_events_10d[0].amount, 'normal')
assert.equal(normalizedFromLegacy.fertilizing_events_10d[0].fertilized, true)
assert.equal(normalizedFromLegacy.fertilizing_events_10d[0].strength, 'thin')
assert.equal(normalizedFromLegacy.light_change_events_10d[0].event, 'direct_sun_exposure')
assert.equal(normalizedFromLegacy.last_fertilized_bucket, 'within_10d')

const displayWindow = buildCareBehaviorDisplayWindow(new Date(baseDate))
assert.equal(displayWindow.length, 21)
assert.equal(displayWindow[0].date, '2026-05-12')
assert.equal(displayWindow[displayWindow.length - 1].date, '2026-06-01')
assert.equal(displayWindow.find(item => item.date === baseDate).isToday, true)
assert.equal(displayWindow.find(item => item.date === baseDate).isSelectable, false)
assert.equal(displayWindow.find(item => item.date === '2026-05-17').isHistoricalOutOfRange, true)
assert.equal(displayWindow.find(item => item.date === '2026-05-17').isSelectable, false)
assert.equal(displayWindow.find(item => item.date === '2026-06-01').isFuture, true)
assert.equal(displayWindow.find(item => item.date === '2026-06-01').canOpenDetail, true)

const timelineWriteGuard = buildCareBehaviorTimelineFromDateEvents({
  '2026-05-17': { watering: true, fertilizing: true, lightChange: true },
  '2026-05-28': { watering: true, fertilizing: true, lightChange: true, isToday: true },
  '2026-05-29': { watering: true, fertilizing: true, lightChange: true }
}, {
  referenceDate: baseDate
})

assert.equal(timelineWriteGuard.watering_events_10d.length, 0)
assert.equal(timelineWriteGuard.fertilizing_events_10d.length, 0)
assert.equal(timelineWriteGuard.light_change_events_10d.length, 0)

const fromCamelCase = normalizeCareBehaviorTimeline({
  referenceDate: baseDate,
  wateringEvents10d: ['2026-05-25'],
  fertilizingEvents: ['2026-05-23'],
  lightChangeEvents: ['2026-05-24'],
  lastFertilizedBucket: '11_30d'
})

assert.equal(fromCamelCase.watering_events_10d[0].date, '2026-05-25')
assert.equal(fromCamelCase.fertilizing_events_10d[0].date, '2026-05-23')
assert.equal(fromCamelCase.last_fertilized_bucket, 'within_10d')

const ordinaryWateringQuestion = {
  questionId: 'w-plain',
  questionKey: 'watering_frequency_context',
  targetDimension: 'watering',
  options: [
    { optionId: 'often_wet', optionText: '近2周 2 次以上' },
    { optionId: 'unknown', optionText: '说不清' },
    { optionId: 'unclear', optionText: '没留意' }
  ]
}
assert.equal(isLegacyWateringTimelineQuestion(ordinaryWateringQuestion), true)
assert.equal(isCareBehaviorWateringTimelineQuestion(ordinaryWateringQuestion), true)
assert.deepEqual(
  getVisibleCareBehaviorOptions(ordinaryWateringQuestion).map(option => option.optionId),
  ['unknown', 'unclear']
)

const legacyWateringQuestion = {
  questionId: 'legacy-water',
  questionKey: 'watering_frequency_context',
  targetDimension: 'watering',
  defaultOptionId: 'often_wet',
  options: [
    { optionId: 'often_wet', optionKey: 'often_wet', optionText: '近2周 2 次以上', isDefault: true },
    { optionId: 'normal_or_stable', optionKey: 'normal_or_stable', optionText: '频率正常' },
    { optionId: 'often_dry', optionKey: 'often_dry', optionText: '近2周 0 次' },
    { optionId: 'unknown', optionKey: 'unknown', optionText: '说不清' },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '没留意' }
  ]
}

assert.equal(isCareBehaviorWateringTimelineQuestion(legacyWateringQuestion), true)
assert.deepEqual(
  getVisibleCareBehaviorOptions(legacyWateringQuestion).map(option => option.optionId),
  ['unknown', 'unclear']
)

const legacyInitialAnswerMap = createFollowUpAnswerMap([legacyWateringQuestion])
assert.equal(legacyInitialAnswerMap[legacyWateringQuestion.questionId], '')

const legacyMeaningfulPayload = buildFollowUpPayload(
  { diagnosisSessionId: 's-legacy-meaningful', roundId: 'r1' },
  { [legacyWateringQuestion.questionId]: 'care_behavior_timeline' },
  {
    questionStack: [legacyWateringQuestion],
    careBehaviorTimelineByQuestionId: {
      [legacyWateringQuestion.questionId]: {
        reference_date: baseDate,
        watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)

assert.equal(legacyMeaningfulPayload.answers[0].optionId, 'care_behavior_timeline')
assert.equal(Object.hasOwn(legacyMeaningfulPayload, 'careBehaviorTimeline'), true)

const legacyUnknownPayload = buildFollowUpPayload(
  { diagnosisSessionId: 's-legacy-unknown', roundId: 'r1' },
  { [legacyWateringQuestion.questionId]: 'unknown' },
  {
    questionStack: [legacyWateringQuestion],
    careBehaviorTimelineByQuestionId: {
      [legacyWateringQuestion.questionId]: {
        reference_date: baseDate,
        watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)

assert.equal(legacyUnknownPayload.answers[0].optionId, 'unknown')
assert.equal(Object.hasOwn(legacyUnknownPayload, 'careBehaviorTimeline'), false)

const ordinaryDefaultIdQuestion = {
  questionId: 'normal-default-id',
  questionKey: 'normal_default_id',
  targetDimension: 'light',
  defaultOptionId: 'yes-option',
  options: [
    { optionId: 'yes-option', optionKey: 'yes_option', optionText: '是' },
    { optionId: 'no-option', optionKey: 'no_option', optionText: '否' }
  ]
}

const ordinaryDefaultKeyQuestion = {
  questionId: 'normal-default-key',
  questionKey: 'normal_default_key',
  targetDimension: 'humidity',
  defaultOptionKey: 'yes_option',
  options: [
    { optionId: 'yes-option', optionKey: 'yes_option', optionText: '是' },
    { optionId: 'no-option', optionKey: 'no_option', optionText: '否' }
  ]
}

const ordinaryIsDefaultQuestion = {
  questionId: 'normal-is-default',
  questionKey: 'normal_is_default',
  targetDimension: 'soil',
  options: [
    { optionId: 'yes-option', optionKey: 'yes_option', optionText: '是', isDefault: true },
    { optionId: 'no-option', optionKey: 'no_option', optionText: '否' }
  ]
}

const ordinaryAnswerMap = createFollowUpAnswerMap([
  ordinaryDefaultIdQuestion,
  ordinaryDefaultKeyQuestion,
  ordinaryIsDefaultQuestion
])
assert.equal(ordinaryAnswerMap[ordinaryDefaultIdQuestion.questionId], 'yes-option')
assert.equal(ordinaryAnswerMap[ordinaryDefaultKeyQuestion.questionId], 'yes-option')
assert.equal(ordinaryAnswerMap[ordinaryIsDefaultQuestion.questionId], 'yes-option')

const baseTimeline = {
  reference_date: baseDate,
  watering_events_10d: [
    { date: '2026-05-26', watered: true, amount: 'normal' },
    { date: '2026-05-20', watered: true, amount: 'normal' }
  ],
  fertilizing_events_10d: [
    { date: '2026-05-26', fertilized: true, strength: 'thin' }
  ],
  light_change_events_10d: []
}

const withTimeline = {
  reference_date: baseDate,
  watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
  fertilizing_events_10d: [],
  light_change_events_10d: [{ date: '2026-05-27', event: 'direct_sun_exposure' }],
  last_fertilized_bucket: 'within_10d'
}

const appendResult = appendCareBehaviorSidecar({ diagnosisSessionId: 's1' }, {
  questionStack: [
    { questionId: 'q1', uiVariant: 'care_behavior_timeline' },
    { questionId: 'q2', uiVariant: 'care_behavior_timeline' }
  ],
  careBehaviorTimelineByQuestionId: {
    q1: baseTimeline,
    q2: withTimeline
  }
})

assert.equal(Object.hasOwn(appendResult, 'careBehaviorTimeline'), true)
assert.equal(appendResult.careBehaviorTimeline.reference_date, baseDate)
assert.equal(appendResult.careBehaviorTimeline.watering_events_10d.length, 3)
assert.equal(appendResult.careBehaviorTimeline.fertilizing_events_10d.length, 1)
assert.equal(appendResult.careBehaviorTimeline.light_change_events_10d.length, 1)
assert.equal(appendResult.careBehaviorTimeline.last_fertilized_bucket, 'within_10d')
const appendWithLegacyBucketButFertilize = appendCareBehaviorSidecar({ diagnosisSessionId: 's-conflict', answers: [{ questionId: 'q1', optionId: 'ok' }] }, {
  questionStack: [
    { questionId: 'q3', uiVariant: 'care_behavior_timeline' }
  ],
  careBehaviorTimelineByQuestionId: {
    q3: {
      reference_date: '2026-05-28',
      fertilizing_events_10d: [{ date: '2026-05-27', fertilized: true, strength: 'thin' }],
      last_fertilized_bucket: '31_60d'
    }
  }
})
assert.equal(appendWithLegacyBucketButFertilize.careBehaviorTimeline.reference_date, '2026-05-28')
assert.equal(appendWithLegacyBucketButFertilize.careBehaviorTimeline.last_fertilized_bucket, 'within_10d')
assert.equal(appendWithLegacyBucketButFertilize.answers.length, 1)
assert.equal(appendWithLegacyBucketButFertilize.answers[0].questionId, 'q1')
assert.equal(appendWithLegacyBucketButFertilize.answers[0].optionId, 'ok')

const timelineQuestion = {
  questionId: 'timeline-q',
  uiVariant: 'care_behavior_timeline',
  targetDimension: 'watering',
  defaultOptionId: 'timeline_recorded',
  options: [
    { optionId: 'timeline_recorded', optionKey: 'timeline_recorded', optionText: '记录已提供', isDefault: true },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '说不清/没留意' },
    { optionId: 'often_wet', optionKey: 'often_wet', optionText: '近2周 2 次以上' },
    { optionId: 'often_dry', optionKey: 'often_dry', optionText: '近2周 0 次' }
  ]
}

const visibleTimelineOptions = getVisibleCareBehaviorOptions(timelineQuestion)
assert.equal(visibleTimelineOptions.length, 1)
assert.equal(visibleTimelineOptions[0].optionId, 'unclear')

const resolvedDefaultTimelineAnswers = createFollowUpAnswerMap([timelineQuestion])
assert.equal(resolvedDefaultTimelineAnswers[timelineQuestion.questionId], 'timeline_recorded')

const componentSource = readFileSync('./src/components/CareBehaviorTimeline.vue', 'utf8')
const compactComponentSource = componentSource.replace(/\s+/g, ' ')
assert.ok(componentSource.includes('v-if="item.watering"'))
assert.ok(componentSource.includes('v-if="item.fertilizing"'))
assert.ok(componentSource.includes("selectedDateWeatherText || '—'"))
assert.ok(componentSource.includes('care-behavior-metric-symbol--temp'))
assert.ok(componentSource.includes('care-behavior-metric-symbol--humidity'))
assert.ok(componentSource.includes('care-behavior-dot--water'))
assert.ok(componentSource.includes('care-behavior-dot--fertilize'))
assert.ok(!componentSource.includes('care-behavior-metric-icon--temp'))
assert.ok(!componentSource.includes('care-behavior-dot-fill'))
assert.ok(componentSource.includes('care-behavior-metrics--empty'))
assert.ok(componentSource.includes('care-behavior-metrics-spacer'))
assert.ok(compactComponentSource.includes('canOpenDetail: Boolean(state.canOpenDetail && (item.isToday || item.isSelectable))'))
assert.ok(compactComponentSource.includes('canOpenDetail: Boolean(item.canOpenDetail && (item.isToday || item.isSelectable))'))
assert.ok(compactComponentSource.includes('item.canOpenDetail === false || item.isFuture || item.isHistoricalOutOfRange'))
assert.ok(compactComponentSource.includes('hasWeatherMetrics: Boolean(state.temperatureText || state.humidityText)'))
assert.ok(compactComponentSource.includes('hasWeatherMetrics: Boolean(weather.temperatureText || weather.humidityText)'))
assert.ok(compactComponentSource.includes('v-if="item.hasWeatherMetrics"'))
assert.ok(compactComponentSource.includes('v-if="item.temperatureText"'))
assert.ok(compactComponentSource.includes('v-if="item.humidityText"'))
assert.ok(!compactComponentSource.includes('letter-spacing: -0.02em'))

const hiddenDefaultTimelineQuestion = {
  questionId: 'timeline-hidden-default',
  uiVariant: 'care_behavior_timeline',
  targetDimension: 'watering',
  defaultOptionId: 'often_wet',
  options: [
    { optionId: 'often_wet', optionKey: 'often_wet', optionText: '近2周 2 次以上', isDefault: true },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '说不清/没留意' }
  ]
}

assert.equal(createFollowUpAnswerMap([hiddenDefaultTimelineQuestion])[hiddenDefaultTimelineQuestion.questionId], '')

const hiddenDefaultKeyTimelineQuestion = {
  questionId: 'timeline-hidden-default-key',
  uiVariant: 'care_behavior_timeline',
  targetDimension: 'watering',
  defaultOptionKey: 'often_wet',
  options: [
    { optionId: 'timeline_recorded', optionKey: 'timeline_recorded', optionText: '记录已提供' },
    { optionId: 'often_wet', optionKey: 'often_wet', optionText: '近2周 2 次以上', isDefault: true },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '说不清/没留意' }
  ]
}

assert.equal(createFollowUpAnswerMap([hiddenDefaultKeyTimelineQuestion])[hiddenDefaultKeyTimelineQuestion.questionId], '')

const legacySyntheticMappings = buildSyntheticFollowUpOptionMappings([
  'q_observed_probe__leaf_yellowing__watering_frequency_context'
])
assert.equal(
  legacySyntheticMappings.some(item => item.optionKey === 'care_behavior_timeline'),
  true
)

const appendUnknownOnly = appendCareBehaviorSidecar({ diagnosisSessionId: 's2' }, {
  questionStack: [
    { questionId: 'q2', uiVariant: 'care_behavior_timeline' }
  ],
  careBehaviorTimelineByQuestionId: {
    q2: {
      reference_date: baseDate,
      watering_events_10d: [],
      fertilizing_events_10d: [],
      light_change_events_10d: [],
      last_fertilized_bucket: 'unknown'
    }
  }
})

assert.equal(hasMeaningfulCareBehaviorTimeline(appendUnknownOnly.careBehaviorTimeline), false)
assert.equal(appendUnknownOnly.careBehaviorTimeline, undefined)

const timelineBuild = buildCareBehaviorTimelineFromDateEvents({
  '2026-05-27': {
    watering: true,
    fertilizing: true,
    lightChange: true,
    isSelectable: true,
    isToday: false
  },
  '2026-05-28': {
    watering: true,
    fertilizing: true,
    lightChange: true,
    isSelectable: false,
    isToday: true
  }
}, { referenceDate: new Date(baseDate) })
assert.equal(timelineBuild.watering_events_10d.some(item => item.date === '2026-05-28'), false)
assert.equal(timelineBuild.fertilizing_events_10d.some(item => item.date === '2026-05-28'), false)

const withInvalidBucket = normalizeCareBehaviorTimeline({
  reference_date: baseDate,
  last_fertilized_bucket: 'bad_bucket'
})

assert.equal(withInvalidBucket.last_fertilized_bucket, 'unknown')

const unknownLightEvent = normalizeCareBehaviorTimeline({
  reference_date: baseDate,
  light_change_events_10d: [{ date: '2026-05-27', event: 'weird_value' }],
  watering_events_10d: ['2026-05-27']
})

assert.equal(unknownLightEvent.light_change_events_10d[0].event, 'unknown')

const legacyReferenceDate = '2026-01-15'
const appendLegacyReferenceDate = appendCareBehaviorSidecar({ diagnosisSessionId: 's4' }, {
  questionStack: [
    { questionId: 'legacyRefQuestion', uiVariant: 'care_behavior_timeline' }
  ],
  careBehaviorTimelineByQuestionId: {
    legacyRefQuestion: {
      reference_date: legacyReferenceDate,
      watering_events_10d: [{ date: legacyReferenceDate, watered: true, amount: 'normal' }],
      fertilizing_events_10d: [],
      light_change_events_10d: []
    }
  }
})

assert.equal(appendLegacyReferenceDate.careBehaviorTimeline.reference_date, legacyReferenceDate)
assert.equal(appendLegacyReferenceDate.careBehaviorTimeline.watering_events_10d.length, 1)

const weatherTimelineQuestion = {
  questionId: 'w1',
  uiVariant: 'care_behavior_timeline',
  weatherByDate: {
    '2026-05-26': { weather: '阴', temperature: 22, humidity: 48 },
    '2026-05-27': { weather: '晴', temperature: 24, humidity: 40 }
  },
  options: [{ optionId: 'a', optionText: '是' }]
}

const normalizedQuestions = normalizeQuestions([weatherTimelineQuestion])
assert.equal(Array.isArray(normalizedQuestions), true)
assert.equal(normalizedQuestions.length, 1)
assert.equal(normalizedQuestions[0].weatherByDate['2026-05-26'].weather, '阴')

const weatherWrapperQuestion = {
  questionId: 'w2',
  uiVariant: 'care_behavior_timeline',
  weather: { weatherByDate: { '2026-05-26': { weather: '阴' } } },
  weatherByDate: { '2026-05-25': { weather: '雨' } },
  environmentContext: {
    weatherByDate: { '2026-05-24': { weather: '多云' } },
    weather: { weather: '雾' },
    environmentWeatherWindow: { '2026-05-23': { weather: '晴' } }
  },
  careBehaviorTimeline: {
    weatherByDate: { '2026-05-22': { weather: '雷阵雨' } }
  },
  payload: {
    weather: { weather: '阴天' },
    weatherByDate: { '2026-05-21': { weather: '小雨' } },
    environmentWeatherWindow: { '2026-05-20': { weather: '阴' } },
    timeline: { weather: { weather: '风大' } }
  },
  options: [{ optionId: 'a', optionText: '是' }]
}

const normalizedWrapperQuestions = normalizeQuestions([weatherWrapperQuestion])
const normalizedWrapperQuestion = normalizedWrapperQuestions[0]
assert.equal(normalizedWrapperQuestion.environmentContext.weatherByDate['2026-05-24'].weather, '多云')
assert.equal(normalizedWrapperQuestion.careBehaviorTimeline?.weatherByDate['2026-05-22'].weather, '雷阵雨')
assert.equal(normalizedWrapperQuestion.payload?.environmentWeatherWindow['2026-05-20'].weather, '阴')
assert.equal(normalizedWrapperQuestion.payload?.timeline?.weather.weather, '风大')
assert.equal(normalizedWrapperQuestion.payload?.weather?.weather, '阴天')

const environmentWeatherWindow = {
  meta: {
    diagnosisDate: baseDate,
    todaySource: 'forecast_15d_with_weather_now'
  },
  historicalDays: [
    {
      date: '2026-05-26',
      textDay: '小雨',
      tempMaxC: 25,
      tempMinC: 20,
      humidity: 82,
      source: 'qweather_historical_weather'
    }
  ],
  forecastDays: [
    {
      date: '2026-05-28',
      textDay: '晴',
      tempMaxC: 31,
      tempMinC: 24,
      humidity: 55,
      uvIndex: 8,
      source: 'qweather_forecast_15d'
    },
    {
      date: '2026-06-11',
      textDay: '阴',
      tempMaxC: 29,
      tempMinC: 22,
      humidity: 66,
      uvIndex: 4,
      source: 'qweather_forecast_15d'
    }
  ],
  currentWeather: {
    tempC: 30,
    humidity: 58,
    text: '多云',
    source: 'qweather_weather_now'
  }
}
const weatherWindowByDate = buildWeatherByDateFromEnvironmentWeatherWindow(environmentWeatherWindow)
assert.equal(weatherWindowByDate['2026-05-26'].weather, '小雨')
assert.equal(weatherWindowByDate['2026-05-26'].source, 'qweather_historical_weather')
assert.equal(weatherWindowByDate['2026-06-11'].weather, '阴')
assert.equal(weatherWindowByDate['2026-06-11'].source, 'qweather_forecast_15d')
assert.equal(weatherWindowByDate[baseDate].weather, '多云')
assert.equal(weatherWindowByDate[baseDate].temperature, 30)
assert.equal(weatherWindowByDate[baseDate].source, 'qweather_weather_now')

const timelineWithEnvironmentWeather = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
  { reference_date: baseDate },
  environmentWeatherWindow
)
assert.equal(timelineWithEnvironmentWeather.environmentWeatherWindow, environmentWeatherWindow)
assert.equal(timelineWithEnvironmentWeather.weatherByDate['2026-05-26'].weather, '小雨')
assert.equal(timelineWithEnvironmentWeather.weatherByDate['2026-06-11'].humidity, 66)

assert.ok(componentSource.includes('buildWeatherByDateFromEnvironmentWeatherWindow'))
assert.ok(componentSource.includes('timeline?.environmentWeatherWindow'))
assert.ok(componentSource.includes('payload?.environmentWeatherWindow'))

assert.equal(
  formatWeatherText({
    fxDate: '2026-05-28',
    textDay: '多云',
    tempMaxC: 32,
    tempMinC: 24,
    humidity: 78
  }),
  '多云 · 32/24℃ · 78%'
)

assert.equal(
  formatWeatherText({
    text: '阴',
    temperature: 'abc',
    humidity: 'N/A'
  }),
  '阴 · abc℃ · N/A%'
)

const meaningfulTimelinePayload = buildFollowUpPayload(
  {
    diagnosisSessionId: 'session-1',
    roundId: 'round-1',
    answerRevision: 7
  },
  resolvedDefaultTimelineAnswers,
  {
    questionStack: [timelineQuestion],
    careBehaviorTimelineByQuestionId: {
      'timeline-q': {
        reference_date: baseDate,
        watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)
assert.equal(meaningfulTimelinePayload.answers[0].optionId, 'timeline_recorded')
assert.equal(meaningfulTimelinePayload.careBehaviorTimeline.watering_events_10d.length, 1)
assert.equal(meaningfulTimelinePayload.careBehaviorTimeline.watering_events_10d[0].date, '2026-05-27')

const weatherWindowPayload = buildFollowUpPayload(
  {
    diagnosisSessionId: 'session-weather-window',
    roundId: 'round-weather-window'
  },
  resolvedDefaultTimelineAnswers,
  {
    questionStack: [timelineQuestion],
    environmentWeatherWindow,
    careBehaviorTimelineByQuestionId: {
      'timeline-q': {
        reference_date: baseDate,
        watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)
assert.equal(weatherWindowPayload.environmentWeatherWindow.meta.todaySource, 'forecast_15d_with_weather_now')
assert.equal(weatherWindowPayload.careBehaviorTimeline.watering_events_10d.length, 1)

const unclearOnlyPayload = buildFollowUpPayload(
  {
    diagnosisSessionId: 'session-2',
    roundId: 'round-2'
  },
  { 'timeline-q': 'unclear' },
  {
    questionStack: [timelineQuestion],
    careBehaviorTimelineByQuestionId: {
      'timeline-q': {
        reference_date: baseDate,
        watering_events_10d: [],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)
assert.equal(unclearOnlyPayload.answers[0].optionId, 'unclear')
assert.equal(Object.hasOwn(unclearOnlyPayload, 'careBehaviorTimeline'), false)

const unclearWithMeaningfulTimelinePayload = buildFollowUpPayload(
  {
    diagnosisSessionId: 'session-3',
    roundId: 'round-3'
  },
  { 'timeline-q': 'unclear' },
  {
    questionStack: [timelineQuestion],
    careBehaviorTimelineByQuestionId: {
      'timeline-q': {
        reference_date: baseDate,
        watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)
assert.equal(unclearWithMeaningfulTimelinePayload.answers[0].optionId, 'unclear')
assert.equal(Object.hasOwn(unclearWithMeaningfulTimelinePayload, 'careBehaviorTimeline'), false)
