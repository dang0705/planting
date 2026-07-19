import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import {
  appendCareBehaviorSidecar,
  buildCareBehaviorTimelineFromDateEvents,
  buildCareBehaviorDisplayWindow,
  getVisibleCareBehaviorOptions,
  hasMeaningfulCareBehaviorTimeline,
  isSessionWateringTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  resolveCareBehaviorTimelineRecordedAnswerOptionId,
  normalizeCareBehaviorTimeline
} from '../../../../src/utils/care-behavior-timeline.js'
import {
  buildQuestionAnswerPayload,
  createQuestionAnswerMap,
  normalizeQuestions
} from '../../../../src/utils/diagnose-flow.js'
import { formatWeatherText } from '../../../../src/utils/care-behavior-weather.js'
import {
  buildWeatherByDateFromEnvironmentWeatherWindow,
  mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline
} from '../../../../src/utils/care-behavior-weather-window.js'

const require = createRequire(import.meta.url)
const {
  buildSyntheticQuestionOptionMappings
} = require('../../../../cloudfunctions/diagnose-http/utils/synthetic-question-package/option-mappings.js')

const baseDate = '2026-05-28'

const normalizedFromSession = normalizeCareBehaviorTimeline({
  referenceDate: baseDate,
  wateringEvents: ['2026-05-20', '2026-05-21'],
  fertilizingEvents10d: ['2026-05-20'],
  light_change_events_10d: { '2026-05-27': true },
  last_fertilized_bucket: '31_60d'
})

assert.equal(normalizedFromSession.reference_date, baseDate)
assert.equal(normalizedFromSession.watering_events_10d.length, 2)
assert.equal(normalizedFromSession.fertilizing_events_10d.length, 1)
assert.equal(normalizedFromSession.light_change_events_10d.length, 1)
assert.equal(normalizedFromSession.watering_events_10d[0].watered, true)
assert.equal(normalizedFromSession.watering_events_10d[0].amount, 'normal')
assert.equal(normalizedFromSession.fertilizing_events_10d[0].fertilized, true)
assert.equal(normalizedFromSession.fertilizing_events_10d[0].strength, 'thin')
assert.equal(normalizedFromSession.light_change_events_10d[0].event, 'direct_sun_exposure')
assert.equal(normalizedFromSession.last_fertilized_bucket, 'within_10d')

const displayWindow = buildCareBehaviorDisplayWindow(new Date(baseDate))
assert.equal(displayWindow.length, 21)
assert.equal(displayWindow[0].date, '2026-05-12')
assert.equal(displayWindow[displayWindow.length - 1].date, '2026-06-01')
assert.equal(displayWindow.find(item => item.date === baseDate).isToday, true)
assert.equal(displayWindow.find(item => item.date === baseDate).isSelectable, true)
assert.equal(displayWindow.find(item => item.date === '2026-05-17').isHistoricalOutOfRange, true)
assert.equal(displayWindow.find(item => item.date === '2026-05-17').isSelectable, false)
assert.equal(displayWindow.find(item => item.date === '2026-06-01').isFuture, true)
assert.equal(displayWindow.find(item => item.date === '2026-06-01').canOpenDetail, true)

const timelineWriteGuard = buildCareBehaviorTimelineFromDateEvents(
  {
    '2026-05-17': { watering: true, fertilizing: true, lightChange: true },
    '2026-05-28': { watering: true, fertilizing: true, lightChange: true, isToday: true },
    '2026-05-29': { watering: true, fertilizing: true, lightChange: true }
  },
  {
    referenceDate: baseDate
  }
)

assert.equal(timelineWriteGuard.watering_events_10d.length, 1)
assert.equal(timelineWriteGuard.fertilizing_events_10d.length, 1)
assert.equal(timelineWriteGuard.light_change_events_10d.length, 1)
assert.equal(timelineWriteGuard.watering_events_10d[0].date, baseDate)
assert.equal(
  normalizeCareBehaviorTimeline({
    referenceDate: baseDate,
    wateringEvents10d: [baseDate]
  }).watering_events_10d.some(item => item.date === baseDate),
  true
)

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
  packageTopic: 'watering',
  options: [
    { optionId: 'often_wet', optionText: '近2周 2 次以上' },
    { optionId: 'unknown', optionText: '说不清' },
    { optionId: 'unclear', optionText: '没留意' }
  ]
}
assert.equal(isSessionWateringTimelineQuestion(ordinaryWateringQuestion), true)
assert.equal(isCareBehaviorWateringTimelineQuestion(ordinaryWateringQuestion), true)
assert.deepEqual(
  getVisibleCareBehaviorOptions(ordinaryWateringQuestion).map(option => option.optionId),
  ['unknown', 'unclear']
)

const sessionWateringQuestion = {
  questionId: 'session-water',
  questionKey: 'watering_frequency_context',
  packageTopic: 'watering',
  defaultOptionId: 'often_wet',
  options: [
    {
      optionId: 'often_wet',
      optionKey: 'often_wet',
      optionText: '近2周 2 次以上',
      isDefault: true
    },
    { optionId: 'normal_or_stable', optionKey: 'normal_or_stable', optionText: '频率正常' },
    { optionId: 'often_dry', optionKey: 'often_dry', optionText: '近2周 0 次' },
    { optionId: 'unknown', optionKey: 'unknown', optionText: '说不清' },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '没留意' }
  ]
}

assert.equal(isCareBehaviorWateringTimelineQuestion(sessionWateringQuestion), true)
assert.deepEqual(
  getVisibleCareBehaviorOptions(sessionWateringQuestion).map(option => option.optionId),
  ['unknown', 'unclear']
)

const sessionInitialAnswerMap = createQuestionAnswerMap([sessionWateringQuestion])
assert.equal(sessionInitialAnswerMap[sessionWateringQuestion.questionKey], '')

const sessionMeaningfulPayload = buildQuestionAnswerPayload(
  { diagnosisSessionId: 's-session-meaningful', roundId: 'r1' },
  { [sessionWateringQuestion.questionKey]: 'care_behavior_timeline' },
  {
    questionStack: [sessionWateringQuestion],
    careBehaviorTimelineByQuestionId: {
      [sessionWateringQuestion.questionKey]: {
        reference_date: baseDate,
        watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)

assert.equal(sessionMeaningfulPayload.answers[0].optionKey, 'care_behavior_timeline')
assert.equal(Object.hasOwn(sessionMeaningfulPayload, 'careBehaviorTimeline'), true)

const sessionUnknownPayload = buildQuestionAnswerPayload(
  { diagnosisSessionId: 's-session-unknown', roundId: 'r1' },
  { [sessionWateringQuestion.questionKey]: 'unknown' },
  {
    questionStack: [sessionWateringQuestion],
    careBehaviorTimelineByQuestionId: {
      [sessionWateringQuestion.questionKey]: {
        reference_date: baseDate,
        watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)

assert.equal(sessionUnknownPayload.answers[0].optionKey, 'unknown')
assert.equal(Object.hasOwn(sessionUnknownPayload, 'careBehaviorTimeline'), false)

const ordinaryDefaultIdQuestion = {
  questionId: 'normal-default-id',
  questionKey: 'normal_default_id',
  packageTopic: 'light',
  defaultOptionId: 'yes-option',
  options: [
    { optionId: 'yes-option', optionKey: 'yes_option', optionText: '是' },
    { optionId: 'no-option', optionKey: 'no_option', optionText: '否' }
  ]
}

const ordinaryDefaultKeyQuestion = {
  questionId: 'normal-default-key',
  questionKey: 'normal_default_key',
  packageTopic: 'humidity',
  defaultOptionKey: 'yes_option',
  options: [
    { optionId: 'yes-option', optionKey: 'yes_option', optionText: '是' },
    { optionId: 'no-option', optionKey: 'no_option', optionText: '否' }
  ]
}

const ordinaryIsDefaultQuestion = {
  questionId: 'normal-is-default',
  questionKey: 'normal_is_default',
  packageTopic: 'soil',
  options: [
    { optionId: 'yes-option', optionKey: 'yes_option', optionText: '是', isDefault: true },
    { optionId: 'no-option', optionKey: 'no_option', optionText: '否' }
  ]
}

const ordinaryAnswerMap = createQuestionAnswerMap([
  ordinaryDefaultIdQuestion,
  ordinaryDefaultKeyQuestion,
  ordinaryIsDefaultQuestion
])
assert.equal(ordinaryAnswerMap[ordinaryDefaultIdQuestion.questionKey], 'yes-option')
assert.equal(ordinaryAnswerMap[ordinaryDefaultKeyQuestion.questionKey], 'yes-option')
assert.equal(ordinaryAnswerMap[ordinaryIsDefaultQuestion.questionKey], 'yes-option')

const baseTimeline = {
  reference_date: baseDate,
  watering_events_10d: [
    { date: '2026-05-26', watered: true, amount: 'normal' },
    { date: '2026-05-20', watered: true, amount: 'normal' }
  ],
  fertilizing_events_10d: [{ date: '2026-05-26', fertilized: true, strength: 'thin' }],
  light_change_events_10d: []
}

const withTimeline = {
  reference_date: baseDate,
  watering_events_10d: [{ date: '2026-05-27', watered: true, amount: 'normal' }],
  fertilizing_events_10d: [],
  light_change_events_10d: [{ date: '2026-05-27', event: 'direct_sun_exposure' }],
  last_fertilized_bucket: 'within_10d'
}

const appendResult = appendCareBehaviorSidecar(
  { diagnosisSessionId: 's1' },
  {
    questionStack: [
      { questionId: 'q1', uiVariant: 'care_behavior_timeline' },
      { questionId: 'q2', uiVariant: 'care_behavior_timeline' }
    ],
    careBehaviorTimelineByQuestionId: {
      q1: baseTimeline,
      q2: withTimeline
    }
  }
)

assert.equal(Object.hasOwn(appendResult, 'careBehaviorTimeline'), true)
assert.equal(appendResult.careBehaviorTimeline.reference_date, baseDate)
assert.equal(appendResult.careBehaviorTimeline.watering_events_10d.length, 3)
assert.equal(appendResult.careBehaviorTimeline.fertilizing_events_10d.length, 1)
assert.equal(appendResult.careBehaviorTimeline.light_change_events_10d.length, 1)
assert.equal(appendResult.careBehaviorTimeline.last_fertilized_bucket, 'within_10d')
const appendWithSessionBucketButFertilize = appendCareBehaviorSidecar(
  { diagnosisSessionId: 's-conflict', answers: [{ questionId: 'q1', optionId: 'ok' }] },
  {
    questionStack: [{ questionId: 'q3', uiVariant: 'care_behavior_timeline' }],
    careBehaviorTimelineByQuestionId: {
      q3: {
        reference_date: '2026-05-28',
        fertilizing_events_10d: [{ date: '2026-05-27', fertilized: true, strength: 'thin' }],
        last_fertilized_bucket: '31_60d'
      }
    }
  }
)
assert.equal(appendWithSessionBucketButFertilize.careBehaviorTimeline.reference_date, '2026-05-28')
assert.equal(
  appendWithSessionBucketButFertilize.careBehaviorTimeline.last_fertilized_bucket,
  'within_10d'
)
assert.equal(appendWithSessionBucketButFertilize.answers.length, 1)
assert.equal(appendWithSessionBucketButFertilize.answers[0].questionId, 'q1')
assert.equal(appendWithSessionBucketButFertilize.answers[0].optionId, 'ok')

const timelineQuestion = {
  questionId: 'timeline-q',
  uiVariant: 'care_behavior_timeline',
  packageTopic: 'watering',
  defaultOptionId: 'timeline_recorded',
  options: [
    {
      optionId: 'timeline_recorded',
      optionKey: 'timeline_recorded',
      optionText: '记录已提供',
      isDefault: true
    },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '说不清/没留意' },
    { optionId: 'often_wet', optionKey: 'often_wet', optionText: '近2周 2 次以上' },
    { optionId: 'often_dry', optionKey: 'often_dry', optionText: '近2周 0 次' }
  ]
}

const visibleTimelineOptions = getVisibleCareBehaviorOptions(timelineQuestion)
assert.equal(visibleTimelineOptions.length, 1)
assert.equal(visibleTimelineOptions[0].optionId, 'unclear')

const resolvedDefaultTimelineAnswers = createQuestionAnswerMap([timelineQuestion])
assert.equal(resolvedDefaultTimelineAnswers[timelineQuestion.questionId], 'timeline_recorded')
assert.equal(
  resolveCareBehaviorTimelineRecordedAnswerOptionId(timelineQuestion),
  'timeline_recorded'
)

const unclearDefaultButRecordedTimelineQuestion = {
  questionId: 'timeline-unclear-default',
  uiVariant: 'care_behavior_timeline',
  packageTopic: 'watering',
  defaultOptionId: 'unclear',
  options: [
    { optionId: 'timeline_provided', optionKey: 'timeline_provided', optionText: '记录已提供' },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '说不清/没留意' },
    { optionId: 'often_wet', optionKey: 'often_wet', optionText: '近2周 2 次以上' },
    { optionId: 'often_dry', optionKey: 'often_dry', optionText: '近2周 0 次' }
  ]
}
const conservativeTimelineQuestion = {
  questionId: 'timeline-conservative',
  uiVariant: 'care_behavior_timeline',
  packageTopic: 'watering',
  defaultOptionId: 'unclear',
  options: [
    { optionId: 'care_behavior_timeline', optionText: '记录已提供' },
    { optionId: 'unclear', optionText: '说不清/没留意' }
  ]
}
const noSentinelTimelineQuestion = {
  questionId: 'timeline-no-sentinel',
  uiVariant: 'care_behavior_timeline',
  packageTopic: 'watering',
  defaultOptionId: 'unclear',
  options: [
    { optionId: 'unclear', optionText: '说不清/没留意' },
    { optionId: 'often_wet', optionText: '近2周 2 次以上' }
  ]
}

assert.equal(
  resolveCareBehaviorTimelineRecordedAnswerOptionId(unclearDefaultButRecordedTimelineQuestion),
  'timeline_provided'
)
assert.equal(
  resolveCareBehaviorTimelineRecordedAnswerOptionId(conservativeTimelineQuestion),
  'care_behavior_timeline'
)
assert.equal(
  resolveCareBehaviorTimelineRecordedAnswerOptionId(noSentinelTimelineQuestion),
  'care_behavior_timeline'
)

const componentSourceFiles = [
  './src/components/CareBehaviorTimeline.vue',
  './src/components/care-behavior-timeline/CareBehaviorTimelineCell.vue',
  './src/components/care-behavior-timeline/CareBehaviorTimelineGrid.vue',
  './src/components/care-behavior-timeline/CareBehaviorTimelineLegend.vue',
  './src/components/care-behavior-timeline/CareBehaviorTimelineMarker.vue',
  './src/components/care-behavior-timeline/CareBehaviorTimelineMetric.vue',
  './src/components/care-behavior-timeline/CareBehaviorTimelinePopover.vue',
  './src/components/care-behavior-timeline/CareBehaviorTimelineSkeleton.vue',
  './src/components/care-behavior-timeline/event-sources.js',
  './src/components/care-behavior-timeline/icons.js',
  './src/components/care-behavior-timeline/popover-position.js',
  './src/components/care-behavior-timeline/useCareBehaviorTimeline.js',
  './src/components/care-behavior-timeline/weather.js',
  './src/components/diagnose-popup/DiagnoseResultStage.vue'
]
const componentSource = componentSourceFiles.map(file => readFileSync(file, 'utf8')).join('\n')
const questionPageSource = readFileSync('./src/pages/diagnose/question-package.vue', 'utf8')
const questionFlowSource = readFileSync(
  './src/pages/diagnose/question-package/question-flow.js',
  'utf8'
)
const diagnosePopupSource = readFileSync('./src/components/DiagnosePopup.vue', 'utf8')
const compactComponentSource = componentSource.replace(/\s+/g, ' ')
const pageSwiperMatches =
  questionPageSource.match(/id="diagnose-question-package-page-swiper"/g) || []
const questionPageTrackStart = questionPageSource.indexOf('questionPageTrackStyle')
const questionPageItemStart = questionPageSource.indexOf('diagnose-question-package-page-item')
assert.ok(
  componentSource.includes('v-if="item.watering"') ||
    componentSource.includes(':active="item.watering"')
)
assert.ok(
  componentSource.includes('v-if="item.fertilizing"') ||
    componentSource.includes(':active="item.fertilizing"')
)
assert.ok(
  componentSource.includes('v-if="item.lightChange"') ||
    componentSource.includes(':active="item.lightChange"')
)
assert.ok(componentSource.includes('care-behavior-calendar-card'))
assert.ok(componentSource.includes('care-behavior-detail-popover'))
assert.ok(
  componentSource.includes(':style="selectedDatePopoverStyle"') ||
    componentSource.includes(':popover-style="selectedDatePopoverStyle"')
)
assert.ok(
  componentSource.includes(':style="selectedDatePopoverArrowStyle"') ||
    componentSource.includes(':arrow-style="selectedDatePopoverArrowStyle"')
)
assert.ok(componentSource.includes('selectedDateGridIndex'))
assert.ok(componentSource.includes('selectedDatePopoverStyle'))
assert.ok(componentSource.includes('selectedDatePopoverArrowStyle'))
assert.ok(componentSource.includes('selectedDateDialogTemperatureText'))
assert.ok(componentSource.includes('selectedDateDialogHumidityText'))
assert.ok(componentSource.includes('selectedDateBehaviorStatusText'))
assert.ok(componentSource.includes('care-behavior-detail-status'))
assert.ok(componentSource.includes('care-behavior-error-banner'))
assert.ok(componentSource.includes('care-behavior-skeleton-cell'))
assert.ok(componentSource.includes('showLoadingSkeleton'))
assert.ok(componentSource.includes('loadingErrorText'))
assert.ok(componentSource.includes('care-behavior-day--today'))
assert.ok(componentSource.includes('care-behavior-cell--today'))
assert.equal(componentSource.includes('.care-behavior-cell--today {\n  border: 0;'), false)
assert.ok(componentSource.includes('hover-class="none"'))
assert.ok(componentSource.includes('hover-stop-propagation'))
assert.ok(componentSource.includes('-webkit-tap-highlight-color: transparent'))
assert.ok(compactComponentSource.includes('const LONG_PRESS_DURATION_MS = 1000'))
assert.ok(compactComponentSource.includes('const POPOVER_AUTO_HIDE_MS = 5000'))
assert.ok(compactComponentSource.includes('const LONG_PRESS_CLICK_SUPPRESS_MS = 450'))
assert.ok(componentSource.includes('suppressSelectDateAfterLongPress'))
assert.ok(componentSource.includes('scheduleLongPressSelectSuppressionClear'))
assert.ok(componentSource.includes('handleDatePressStart'))
assert.ok(componentSource.includes('handleDatePressEnd'))
assert.ok(
  componentSource.includes('@select-date="selectDate"') ||
    componentSource.includes('@click="$emit(\'select\', item)"')
)
assert.ok(componentSource.includes('@longpress') || componentSource.includes('popoverDate'))
assert.equal(componentSource.includes('D0'), false)
assert.equal(componentSource.includes('care-behavior-detail-panel'), false)
assert.ok(componentSource.includes('care-behavior-metric-icon--temp'))
assert.ok(componentSource.includes('care-behavior-metric-icon--humidity'))
assert.ok(componentSource.includes('temperatureIconSrc'))
assert.ok(componentSource.includes('humidityIconSrc'))
assert.ok(componentSource.includes('data:image/svg+xml;utf8'))
assert.ok(componentSource.includes('viewBox%3D%220%200%209.9934%209.9934%22'))
assert.ok(componentSource.includes('stroke%3D%22%235A7A68%22'))
assert.ok(
  componentSource.includes(':src="temperatureIconSrc"') ||
    componentSource.includes(':icon-src="temperatureIconSrc"')
)
assert.ok(
  componentSource.includes(':src="humidityIconSrc"') ||
    componentSource.includes(':icon-src="humidityIconSrc"')
)
assert.equal(componentSource.includes('stroke="currentColor"'), false)
assert.ok(componentSource.includes('temperatureDisplayText'))
assert.ok(componentSource.includes('humidityDisplayText'))
assert.ok(componentSource.includes('care-behavior-dot--water'))
assert.ok(componentSource.includes('care-behavior-dot--fertilize'))
assert.ok(componentSource.includes('care-behavior-dot--light'))
assert.ok(componentSource.includes('care-behavior-metrics-spacer'))
assert.ok(
  /isSelected:\s*Boolean\(\s*state\.selectedWatering\s*&&\s*item\.isSelectable\s*&&\s*!item\.isHistoricalOutOfRange\s*&&\s*!item\.isFuture\s*\)/.test(
    componentSource
  )
)
assert.ok(componentSource.includes('watering: Boolean(state.recordedWatering)'))
assert.ok(componentSource.includes('fertilizing: Boolean(state.recordedFertilizing)'))
assert.ok(componentSource.includes('lightChange: Boolean(state.recordedLightChange)'))
assert.ok(componentSource.includes('selected_watering_events_10d: wateringEventsWithDose'))
assert.ok(
  componentSource.includes(
    'recorded_watering_events_10d: timelineEventSources.value.recordedWateringEvents'
  )
)
assert.ok(componentSource.includes("toggleCareAction(item.date, 'watering')"))
assert.ok(componentSource.includes('resolveSelectedDateAfterRebuild(nextDateStates)'))
assert.ok(
  /currentState\?\.canOpenDetail\s*&&\s*!currentState\.isFuture\s*&&\s*!currentState\.isHistoricalOutOfRange/.test(
    componentSource
  )
)
assert.ok(componentSource.includes('selectedDateTemperatureText'))
assert.ok(componentSource.includes('selectedDateHumidityText'))
assert.ok(componentSource.includes('selectedDateBehaviorText'))
assert.equal(
  componentSource.includes("@click=\"$emit('toggle-care-action', state.date, 'watering')\""),
  false
)
assert.equal(
  componentSource.includes('diagnose-care-behavior-action-fertilize-${selectedDateState.date}'),
  false
)
assert.equal(
  componentSource.includes('diagnose-care-behavior-action-light-${selectedDateState.date}'),
  false
)
assert.equal(componentSource.includes('care-behavior-action-row'), false)
assert.ok(
  questionFlowSource.includes('isCareBehaviorTimelineUnclearAnswer(question, currentOptionId)')
)
assert.ok(
  componentSource.indexOf('selectedDate.value = item.date') <
    componentSource.indexOf("toggleCareAction(item.date, 'watering')")
)
assert.equal(componentSource.includes('care-behavior-cell--focused'), false)
assert.equal(componentSource.includes('isFocused:'), false)
assert.ok(
  compactComponentSource.includes(
    'canOpenDetail: Boolean(state.canOpenDetail && (item.isToday || item.isSelectable))'
  )
)
assert.ok(
  compactComponentSource.includes(
    'canOpenDetail: Boolean(item.canOpenDetail && (item.isToday || item.isSelectable))'
  )
)
assert.ok(
  compactComponentSource.includes(
    'item.canOpenDetail === false || item.isFuture || item.isHistoricalOutOfRange'
  )
)
assert.ok(
  compactComponentSource.includes(
    'hasWeatherMetrics: Boolean(state.temperatureText || state.humidityText)'
  )
)
assert.ok(
  compactComponentSource.includes(
    'hasWeatherMetrics: Boolean(weather.temperatureText || weather.humidityText)'
  )
)
assert.ok(compactComponentSource.includes('return Object.fromEntries('))
assert.ok(
  compactComponentSource.includes(
    'Object.entries(merged).filter(([date]) => dateWindowSet.value.has(normalizeDateValue(date)))'
  )
)
assert.ok(compactComponentSource.includes('v-if="item.hasWeatherMetrics"'))
assert.ok(compactComponentSource.includes('v-if="item.temperatureText"'))
assert.ok(compactComponentSource.includes('v-if="item.humidityText"'))
assert.ok(compactComponentSource.includes('`${idPrefix}-care-behavior-light-${item.date}`'))
assert.ok(compactComponentSource.includes("raw.replace(/[℃°℉%]/g, '').trim()"))
assert.ok(
  compactComponentSource.includes('entry.temp ?? entry.temperature ?? entry.tempC ?? entry.tempF')
)
assert.ok(componentSource.includes('care-behavior-cell--selected border-2 !border-[#2d7a4f]'))
assert.ok(componentSource.includes('care-behavior-day--today font-bold text-red-500'))
assert.ok(
  componentSource.includes('flex h-[30px] w-full flex-col justify-center gap-0 overflow-hidden')
)
assert.ok(
  componentSource.includes(
    'flex h-[15px] min-w-0 items-center justify-center gap-0.5 overflow-hidden leading-[15px]'
  )
)
assert.ok(componentSource.includes('relative h-[10px] w-[10px] shrink-0 text-[#5a7a68]'))
assert.ok(componentSource.includes('bg-[rgba(241,248,244,0.5)]'))
assert.ok(componentSource.includes('text-[10px] font-medium leading-[15px] text-[#5a7a68]'))
assert.ok(componentSource.includes('absolute z-[5] w-[95px] max-w-[320px]'))
assert.ok(
  compactComponentSource.includes(
    'const top = `${row * (DATE_CELL_HEIGHT_PX + GRID_GAP_PX) + DATE_CELL_HEIGHT_PX + POPOVER_OFFSET_PX}px`'
  )
)
assert.ok(
  compactComponentSource.includes(
    "if (column === 0) {return { left: '0', top, transform: 'none' }}"
  )
)
assert.ok(
  compactComponentSource.includes(
    "if (column === GRID_COLUMN_COUNT - 1) { return { left: '100%', top, transform: 'translateX(-100%)' }"
  )
)
assert.ok(compactComponentSource.includes("transform: 'translateX(-50%)'"))
assert.ok(compactComponentSource.includes('return { left: `${DATE_CELL_WIDTH_PX / 2}px` }'))
assert.ok(
  compactComponentSource.includes(
    'return { left: `${POPOVER_WIDTH_PX - DATE_CELL_WIDTH_PX / 2}px` }'
  )
)
assert.ok(compactComponentSource.includes("return { left: '50%' }"))
assert.ok(componentSource.includes('shadow-[0_10px_24px_rgba(15,23,42,0.08)]'))
assert.equal(compactComponentSource.includes('width: calc(100% - 48px)'), false)
assert.equal(compactComponentSource.includes('margin: 12px auto 0'), false)
assert.ok(compactComponentSource.includes('温度'))
assert.ok(compactComponentSource.includes('湿度'))

assert.ok(questionPageSource.includes('id="diagnose-question-package-page"'))
assert.equal(pageSwiperMatches.length, 1)
assert.ok(questionPageSource.includes('questionDiagnosisContextText'))
assert.ok(questionPageSource.includes('questionProgressText'))
assert.ok(questionPageSource.includes('diagnose-question-package-page-swiper'))
assert.ok(questionPageSource.includes('questionPageTrackStyle'))
assert.ok(componentSource.includes('questionSwiperTrackStyle'))
assert.ok(componentSource.includes('diagnose-question-package-swiper'))
assert.equal(questionPageSource.includes('<swiper'), false)
assert.equal(questionPageSource.includes('<swiper-item'), false)
assert.equal(diagnosePopupSource.includes('<swiper'), false)
assert.equal(diagnosePopupSource.includes('<swiper-item'), false)
assert.ok(questionPageSource.includes('environmentWeatherWindowLoading'))
assert.ok(questionPageSource.includes('environmentWeatherWindowError'))
assert.ok(
  questionFlowSource.includes(
    'hasMeaningfulCareBehaviorTimeline(getCareBehaviorTimelineByQuestion(question))'
  )
)
assert.ok(questionPageSource.includes(':loading="environmentWeatherWindowLoading"'))
assert.ok(questionPageSource.includes(':error="environmentWeatherWindowError"'))
assert.ok(questionFlowSource.includes('Object.keys(storedTimeline).length'))
assert.ok(questionFlowSource.includes('mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline('))
assert.ok(questionPageSource.indexOf('questionDiagnosisContextText') < questionPageTrackStart)
assert.ok(questionPageItemStart > questionPageTrackStart)
assert.equal(questionPageSource.includes('question-package-question-count'), false)
assert.ok(questionPageSource.includes('uni.navigateBack({ delta: 1 })'))

const hiddenDefaultTimelineQuestion = {
  questionId: 'timeline-hidden-default',
  uiVariant: 'care_behavior_timeline',
  packageTopic: 'watering',
  defaultOptionId: 'often_wet',
  options: [
    {
      optionId: 'often_wet',
      optionKey: 'often_wet',
      optionText: '近2周 2 次以上',
      isDefault: true
    },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '说不清/没留意' }
  ]
}

assert.equal(
  createQuestionAnswerMap([hiddenDefaultTimelineQuestion])[
    hiddenDefaultTimelineQuestion.questionId
  ],
  ''
)

const hiddenDefaultKeyTimelineQuestion = {
  questionId: 'timeline-hidden-default-key',
  uiVariant: 'care_behavior_timeline',
  packageTopic: 'watering',
  defaultOptionKey: 'often_wet',
  options: [
    { optionId: 'timeline_recorded', optionKey: 'timeline_recorded', optionText: '记录已提供' },
    {
      optionId: 'often_wet',
      optionKey: 'often_wet',
      optionText: '近2周 2 次以上',
      isDefault: true
    },
    { optionId: 'unclear', optionKey: 'unclear', optionText: '说不清/没留意' }
  ]
}

assert.equal(
  createQuestionAnswerMap([hiddenDefaultKeyTimelineQuestion])[
    hiddenDefaultKeyTimelineQuestion.questionId
  ],
  ''
)

const sessionSyntheticMappings = buildSyntheticQuestionOptionMappings([
  'q_observed_probe__leaf_yellowing__watering_frequency_context'
])
assert.equal(
  sessionSyntheticMappings.some(item => item.optionKey === 'care_behavior_timeline'),
  true
)

const appendUnknownOnly = appendCareBehaviorSidecar(
  { diagnosisSessionId: 's2' },
  {
    questionStack: [{ questionId: 'q2', uiVariant: 'care_behavior_timeline' }],
    careBehaviorTimelineByQuestionId: {
      q2: {
        reference_date: baseDate,
        watering_events_10d: [],
        fertilizing_events_10d: [],
        light_change_events_10d: [],
        last_fertilized_bucket: 'unknown'
      }
    }
  }
)

assert.equal(hasMeaningfulCareBehaviorTimeline(appendUnknownOnly.careBehaviorTimeline), false)
assert.equal(appendUnknownOnly.careBehaviorTimeline, undefined)

const timelineBuild = buildCareBehaviorTimelineFromDateEvents(
  {
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
      isSelectable: true,
      isToday: true
    }
  },
  { referenceDate: new Date(baseDate) }
)
assert.equal(
  timelineBuild.watering_events_10d.some(item => item.date === '2026-05-28'),
  true
)
assert.equal(
  timelineBuild.fertilizing_events_10d.some(item => item.date === '2026-05-28'),
  true
)

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

const sessionReferenceDate = '2026-01-15'
const appendSessionReferenceDate = appendCareBehaviorSidecar(
  { diagnosisSessionId: 's4' },
  {
    questionStack: [{ questionId: 'sessionRefQuestion', uiVariant: 'care_behavior_timeline' }],
    careBehaviorTimelineByQuestionId: {
      sessionRefQuestion: {
        reference_date: sessionReferenceDate,
        watering_events_10d: [{ date: sessionReferenceDate, watered: true, amount: 'normal' }],
        fertilizing_events_10d: [],
        light_change_events_10d: []
      }
    }
  }
)

assert.equal(appendSessionReferenceDate.careBehaviorTimeline.reference_date, sessionReferenceDate)
assert.equal(appendSessionReferenceDate.careBehaviorTimeline.watering_events_10d.length, 1)

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
assert.equal(
  normalizedWrapperQuestion.environmentContext.weatherByDate['2026-05-24'].weather,
  '多云'
)
assert.equal(
  normalizedWrapperQuestion.careBehaviorTimeline?.weatherByDate['2026-05-22'].weather,
  '雷阵雨'
)
assert.equal(
  normalizedWrapperQuestion.payload?.environmentWeatherWindow['2026-05-20'].weather,
  '阴'
)
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

const meaningfulTimelinePayload = buildQuestionAnswerPayload(
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
assert.equal(meaningfulTimelinePayload.answers[0].optionKey, 'timeline_recorded')
assert.equal(meaningfulTimelinePayload.careBehaviorTimeline.watering_events_10d.length, 1)
assert.equal(
  meaningfulTimelinePayload.careBehaviorTimeline.watering_events_10d[0].date,
  '2026-05-27'
)

const weatherWindowPayload = buildQuestionAnswerPayload(
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
assert.equal(
  weatherWindowPayload.environmentWeatherWindow.meta.todaySource,
  'forecast_15d_with_weather_now'
)
assert.equal(weatherWindowPayload.careBehaviorTimeline.watering_events_10d.length, 1)

const unclearOnlyPayload = buildQuestionAnswerPayload(
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
assert.equal(unclearOnlyPayload.answers[0].optionKey, 'unclear')
assert.equal(Object.hasOwn(unclearOnlyPayload, 'careBehaviorTimeline'), false)

const unclearWithMeaningfulTimelinePayload = buildQuestionAnswerPayload(
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
assert.equal(unclearWithMeaningfulTimelinePayload.answers[0].optionKey, 'unclear')
assert.equal(Object.hasOwn(unclearWithMeaningfulTimelinePayload, 'careBehaviorTimeline'), false)
