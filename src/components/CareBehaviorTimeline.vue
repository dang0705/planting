<template>
  <view
    :id="`diagnose-care-behavior-timeline-${questionId}`"
    class="care-behavior-timeline"
  >
    <view class="care-behavior-timeline-header">
      <text class="care-behavior-timeline-title">请查看过去10天的养护记录</text>
      <text class="care-behavior-timeline-subtitle">查看温湿度变化和浇水施肥记录，帮助我们更准确分析</text>
    </view>

    <view class="care-behavior-weekday-header">
      <text
        v-for="day in weekLabels"
        :key="day"
        class="care-behavior-weekday-item"
      >{{ day }}</text>
    </view>

    <view class="care-behavior-grid">
      <view
        v-for="item in cellItems"
        :key="item.date"
        :id="`diagnose-care-behavior-date-${item.date}`"
        :class="[
          'care-behavior-cell',
          item.isSelected ? 'care-behavior-cell--selected' : '',
          item.isToday ? 'care-behavior-cell--today' : '',
          item.isFuture ? 'care-behavior-cell--future' : '',
          item.isHistoricalOutOfRange ? 'care-behavior-cell--historical' : '',
          item.canOpenDetail ? 'care-behavior-cell--selectable' : 'care-behavior-cell--locked'
        ]"
        @click="selectDate(item)"
      >
        <view class="care-behavior-day-wrap">
          <text class="care-behavior-day">{{ item.day }}</text>
          <text v-if="item.isToday" class="care-behavior-day-mark">D0</text>
        </view>

        <view class="care-behavior-metrics">
          <view class="care-behavior-metric">
            <text class="care-behavior-metric-icon care-behavior-metric-icon--temp">温</text>
            <text class="care-behavior-metric-value">{{ item.temperatureText || '—' }}</text>
          </view>
          <view class="care-behavior-metric">
            <text class="care-behavior-metric-icon care-behavior-metric-icon--humidity">湿</text>
            <text class="care-behavior-metric-value">{{ item.humidityText || '—' }}</text>
          </view>
        </view>

        <view class="care-behavior-dot-row">
          <view
            :id="`diagnose-care-behavior-water-${item.date}`"
            class="care-behavior-marker care-behavior-marker--water"
            :class="{ 'care-behavior-marker--active': item.watering }"
          >
            <view class="care-behavior-dot care-behavior-dot--water" :class="{ 'care-behavior-dot--active': item.watering }">
              <view class="care-behavior-dot-fill" />
            </view>
          </view>
          <view
            :id="`diagnose-care-behavior-fertilize-${item.date}`"
            class="care-behavior-marker care-behavior-marker--fertilize"
            :class="{ 'care-behavior-marker--active': item.fertilizing }"
          >
            <view class="care-behavior-dot care-behavior-dot--fertilize" :class="{ 'care-behavior-dot--active': item.fertilizing }">
              <view class="care-behavior-dot-fill" />
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="selectedDateState" class="care-behavior-detail-panel">
      <view class="care-behavior-detail-header">
        <text class="care-behavior-detail-date">{{ selectedDateLabel }}</text>
        <text class="care-behavior-detail-weather">{{ selectedDateWeatherText || '暂无天气数据' }}</text>
      </view>
      <view class="care-behavior-action-row">
        <view
          :id="`diagnose-care-behavior-action-water-${selectedDateState.date}`"
          class="care-behavior-action-chip care-behavior-action-chip--water"
          :class="{ 'care-behavior-action-chip--active': selectedDateState.watering, 'care-behavior-action-chip--disabled': !selectedDateState.isSelectable }"
          @click="toggleCareAction(selectedDateState.date, 'watering')"
        >
          <text>浇水</text>
        </view>
        <view
          :id="`diagnose-care-behavior-action-fertilize-${selectedDateState.date}`"
          class="care-behavior-action-chip care-behavior-action-chip--fertilize"
          :class="{ 'care-behavior-action-chip--active': selectedDateState.fertilizing, 'care-behavior-action-chip--disabled': !selectedDateState.isSelectable }"
          @click="toggleCareAction(selectedDateState.date, 'fertilizing')"
        >
          <text>施肥</text>
        </view>
        <view
          :id="`diagnose-care-behavior-action-light-${selectedDateState.date}`"
          class="care-behavior-action-chip care-behavior-action-chip--light"
          :class="{ 'care-behavior-action-chip--active': selectedDateState.lightChange, 'care-behavior-action-chip--disabled': !selectedDateState.isSelectable }"
          @click="toggleCareAction(selectedDateState.date, 'lightChange')"
        >
          <text>强光/位置变化</text>
        </view>
      </view>
    </view>

    <view class="care-behavior-legend">
      <view class="care-behavior-legend-item">
        <view class="care-behavior-legend-dot care-behavior-dot--water" />
        <text>浇水</text>
      </view>
      <view class="care-behavior-legend-item">
        <view class="care-behavior-legend-dot care-behavior-dot--fertilize" />
        <text>施肥</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  buildCareBehaviorTimelineFromDateEvents,
  buildCareBehaviorDisplayWindow,
  getCareBehaviorDateSet,
  getCareBehaviorDateWindow,
  normalizeCareBehaviorTimeline
} from '@/utils/care-behavior-timeline.js'
import { formatWeatherText } from '@/utils/care-behavior-weather.js'

const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
const props = defineProps({
  questionId: { type: String, default: '' },
  timeline: { type: Object, default: () => ({}) },
  question: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change'])

const bucketSelection = ref('unknown')
const baseBucketSelection = ref('unknown')
const dateStates = ref({})
const selectedDate = ref('')

const referenceDate = computed(() => {
  const candidate =
    props.question?.referenceDate ||
    props.question?.reference_date ||
    props.timeline?.reference_date ||
    props.timeline?.referenceDate ||
    new Date()
  const value = candidate instanceof Date ? candidate : new Date(candidate)
  return Number.isNaN(value.getTime()) ? new Date() : value
})

const dateWindow = computed(() => getCareBehaviorDateWindow(referenceDate.value))
const dateWindowSet = computed(() => getCareBehaviorDateSet(referenceDate.value))
const timelineSource = computed(() => normalizeCareBehaviorTimeline(props.timeline, {
  dateWindow: dateWindowSet.value,
  referenceDate: referenceDate.value
}))

function collectWeatherSources(question = {}, timeline = {}) {
  const qTimeline = question?.careBehaviorTimeline || {}
  const environmentContext = question?.environmentContext || {}
  const payload = question?.payload || {}
  const payloadTimeline = payload?.careBehaviorTimeline || payload?.care_behavior_timeline || payload?.timeline || {}
  const timelineEnvContext = payloadTimeline?.environmentContext || {}
  return [
    question?.weather,
    question?.weatherByDate,
    question?.environmentWeatherWindow,
    environmentContext?.weatherByDate,
    environmentContext?.weather,
    environmentContext?.environmentWeatherWindow,
    environmentContext?.careBehaviorTimeline,
    timeline?.weather,
    timeline?.weatherByDate,
    timeline?.environmentWeatherWindow,
    timeline?.careBehaviorTimeline,
    timeline?.environmentContext,
    qTimeline?.weather,
    qTimeline?.weatherByDate,
    qTimeline?.environmentWeatherWindow,
    qTimeline?.careBehaviorTimeline,
    payload?.weather,
    payload?.weatherByDate,
    payload?.environmentWeatherWindow,
    payload?.environmentContext,
    payload?.careBehaviorTimeline,
    payload?.care_behavior_timeline,
    payload?.timeline,
    payloadTimeline?.weather,
    payloadTimeline?.weatherByDate,
    payloadTimeline?.environmentWeatherWindow,
    payloadTimeline?.careBehaviorTimeline,
    timelineEnvContext?.weather,
    timelineEnvContext?.weatherByDate,
    timelineEnvContext?.environmentWeatherWindow
  ]
}

function parseWeatherEntry(entry = {}) {
  return formatWeatherText(entry)
}

function normalizeWeatherMetricValue(value = '') {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  const raw = String(value).trim()
  if (!raw) {
    return ''
  }
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? `${Math.round(numeric)}` : raw
}

function getWeatherTemperatureText(entry = {}) {
  const maxTemp = normalizeWeatherMetricValue(
    entry.tempMaxC ?? entry.tempMax ?? entry.maxTemp ?? entry.maxTemperature ?? entry.tempMaxF ?? ''
  )
  const minTemp = normalizeWeatherMetricValue(
    entry.tempMinC ?? entry.tempMin ?? entry.minTemp ?? entry.minTemperature ?? entry.tempMinF ?? ''
  )
  const singleTemp = normalizeWeatherMetricValue(entry.temp ?? entry.temperature)
  if (maxTemp && minTemp) {
    return `${maxTemp}/${minTemp}`
  }
  return maxTemp || minTemp || singleTemp || ''
}

function getWeatherHumidityText(entry = {}) {
  return normalizeWeatherMetricValue(entry.humidity ?? entry.humi)
}

function normalizeDateValue(value = '') {
  if (!value) {
    return ''
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(String(value))) {
    const [y, m, d] = String(value).split('-')
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

function normalizeWeatherInput(weatherInput = {}, fallbackDate = '') {
  if (!weatherInput) {
    return {}
  }
  if (typeof weatherInput === 'string' || typeof weatherInput === 'number') {
    const text = parseWeatherEntry({ weather: weatherInput })
    const normalizedDate = normalizeDateValue(fallbackDate)
    if (!normalizedDate || !text) {
      return {}
    }
    return { [normalizedDate]: { text, temperatureText: '', humidityText: '' } }
  }
  if (typeof weatherInput !== 'object' && !Array.isArray(weatherInput)) {
    return {}
  }
  const normalized = {}
  const addMapEntry = (date, entry) => {
    const normalizedDate = normalizeDateValue(date) || normalizeDateValue(fallbackDate)
    if (!normalizedDate) {
      return
    }
    const text = parseWeatherEntry(entry)
    if (!text) {
      return
    }
    normalized[normalizedDate] = {
      text,
      temperatureText: getWeatherTemperatureText(entry),
      humidityText: getWeatherHumidityText(entry)
    }
  }
  const mergeFromObject = candidate => {
    if (!candidate || (typeof candidate !== 'object' && !Array.isArray(candidate))) {
      return
    }

    const getDate = item => item?.date || item?.day || item?.dayKey || item?.dateKey || item?.fxDate

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (!item) {
          continue
        }
        addMapEntry(getDate(item), item)
      }
      return
    }
    if (Array.isArray(candidate.daily)) {
      for (const item of candidate.daily) {
        addMapEntry(getDate(item), item)
      }
      return
    }
    if (candidate.weatherByDate && typeof candidate.weatherByDate === 'object') {
      Object.entries(candidate.weatherByDate).forEach(([date, entry]) => addMapEntry(date, entry))
      return
    }
    if (candidate.environmentWeatherWindow && typeof candidate.environmentWeatherWindow === 'object') {
      if (Array.isArray(candidate.environmentWeatherWindow)) {
        candidate.environmentWeatherWindow.forEach(item => {
          addMapEntry(getDate(item), item)
        })
      } else {
        Object.entries(candidate.environmentWeatherWindow).forEach(([date, entry]) => addMapEntry(date, entry))
      }
      return
    }
    if (candidate.timeline && typeof candidate.timeline === 'object') {
      mergeFromObject(candidate.timeline)
      return
    }
    if (candidate.environmentContext && typeof candidate.environmentContext === 'object') {
      mergeFromObject(candidate.environmentContext)
      return
    }
    if (candidate.careBehaviorTimeline && typeof candidate.careBehaviorTimeline === 'object') {
      mergeFromObject(candidate.careBehaviorTimeline)
      return
    }
    if (candidate.weather && typeof candidate.weather === 'object' && !Object.prototype.hasOwnProperty.call(candidate, 'weatherByDate')) {
      if (typeof candidate.weather === 'object' || Array.isArray(candidate.weather)) {
        mergeFromObject(candidate.weather)
      } else {
        addMapEntry(fallbackDate, candidate)
      }
    }
    const isDateMap = Object.keys(candidate).every(key =>
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(key) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(key)
    )
    if (isDateMap) {
      Object.entries(candidate).forEach(([date, entry]) => addMapEntry(date, entry))
      return
    }

    const fallbackText = parseWeatherEntry(candidate)
    if (fallbackText) {
      const date = normalizeDateValue(fallbackDate)
      if (date) {
        normalized[date] = { text: fallbackText, temperatureText: '', humidityText: '' }
      }
    }
  }
  mergeFromObject(weatherInput)
  return normalized
}

function normalizeBucket(value = 'unknown') {
  const normalized = String(value || '').trim()
  return ['within_10d', '11_30d', '31_60d', 'over_60d', 'almost_never', 'unknown'].includes(normalized)
    ? normalized
    : 'unknown'
}

function isDateInEvents(date, events = []) {
  return (events || []).some(item => String(item?.date || '').trim() === date)
}

const selectedDateState = computed(() => {
  if (!selectedDate.value) {
    return null
  }
  return dateStates.value[selectedDate.value] || null
})

const selectedDateLabel = computed(() => {
  if (!selectedDateState.value) {
    return ''
  }
  return selectedDateState.value.isToday
    ? '今天'
    : selectedDateState.value.date
})

const selectedDateWeatherText = computed(() => {
  if (!selectedDateState.value) {
    return ''
  }
  const state = selectedDateState.value
  const weather = weatherByDate.value[state.date] || {}
  return weather.text || state.weatherText || ''
})

const weatherByDate = computed(() => {
  const merged = {}
  const fallbackDate = normalizeDateValue(referenceDate.value)
  for (const source of collectWeatherSources(props.question, props.timeline)) {
    Object.assign(merged, normalizeWeatherInput(source, fallbackDate))
  }
  return merged
})

const displayWindow = computed(() => buildCareBehaviorDisplayWindow(referenceDate.value))

const displayedCellItems = computed(() => {
  return displayWindow.value.map(item => {
    const state = dateStates.value[item.date] || {}
    return {
      ...item,
      isActive: true,
      isSelectable: Boolean(state.isSelectable),
      canOpenDetail: Boolean(state.canOpenDetail),
      isSelected: selectedDate.value === item.date,
      isFuture: Boolean(item.isFuture),
      isHistoricalOutOfRange: Boolean(item.isHistoricalOutOfRange),
      watering: Boolean(state.watering),
      fertilizing: Boolean(state.fertilizing),
      lightChange: Boolean(state.lightChange),
      weatherText: state.weatherText || weatherByDate.value[item.date]?.text || '',
      temperatureText: state.temperatureText || weatherByDate.value[item.date]?.temperatureText || '',
      humidityText: state.humidityText || weatherByDate.value[item.date]?.humidityText || ''
    }
  })
})

const cellItems = computed(() => displayedCellItems.value)

const timelinePayload = computed(() => ({
  ...buildCareBehaviorTimelineFromDateEvents(
    Object.fromEntries(
      Object.entries(dateStates.value).filter(([, state]) => Boolean(state?.isSelectable))
    ),
    {
      dateWindowSet: dateWindowSet.value,
      referenceDate: referenceDate.value,
      last_fertilized_bucket: bucketSelection.value
    }
  ),
  last_fertilized_bucket: bucketSelection.value
}))

watch(timelinePayload, value => {
  emit('change', value)
}, { deep: true, immediate: true })

watch(() => [props.timeline, props.question], () => {
  initializeTimelineFromProps()
}, { deep: true, immediate: true })

onMounted(initializeTimelineFromProps)

function initializeTimelineFromProps() {
  const sourceBucket = normalizeBucket(timelineSource.value.last_fertilized_bucket)
  baseBucketSelection.value = sourceBucket
  bucketSelection.value = sourceBucket
  dateStates.value = buildDateStates()
  selectedDate.value = resolveDefaultSelectedDate()
}

function buildDateStates() {
  const state = {}
  const source = timelineSource.value
  for (const item of displayWindow.value) {
    const weather = weatherByDate.value[item.date] || {}
    state[item.date] = {
      date: item.date,
      watering: isDateInEvents(item.date, source.watering_events_10d),
      fertilizing: isDateInEvents(item.date, source.fertilizing_events_10d),
      lightChange: isDateInEvents(item.date, source.light_change_events_10d),
      weatherText: weather.text || '',
      temperatureText: weather.temperatureText || '',
      humidityText: weather.humidityText || '',
      isToday: item.isToday,
      isFuture: item.isFuture,
      isHistoricalOutOfRange: item.isHistoricalOutOfRange,
      isSelectable: Boolean(item.isSelectable),
      canOpenDetail: Boolean(item.canOpenDetail)
    }
  }
  return state
}

function resolveDefaultSelectedDate() {
  const todayItem = displayWindow.value.find(item => item.isToday)
  if (todayItem?.date) {
    return todayItem.date
  }

  const selectableDates = displayWindow.value.filter(item => item.isSelectable).map(item => item.date)
  const activeSelectableDate = selectableDates.slice().reverse().find(date => {
    const state = dateStates.value[date]
    return Boolean(state?.watering || state?.fertilizing || state?.lightChange)
  })
  return activeSelectableDate || selectableDates[selectableDates.length - 1] || ''
}

function selectDate(item = {}) {
  if (!item?.date || item.canOpenDetail === false) {
    return
  }
  selectedDate.value = item.date
}

function syncBucketSelection(nextStates = {}) {
  const hasFertilizing = Object.values(nextStates).some(item => Boolean(item?.fertilizing))
  bucketSelection.value = hasFertilizing ? 'within_10d' : baseBucketSelection.value || 'unknown'
}

function toggleCareAction(date, action) {
  const state = dateStates.value[date]
  if (!state || !state.isSelectable || state.isToday || state.isFuture || state.isHistoricalOutOfRange) {
    return
  }
  const next = { ...state, [action]: !state[action] }
  const nextStates = { ...dateStates.value, [date]: next }
  dateStates.value = nextStates
  if (!selectedDate.value || selectedDate.value === date) {
    selectedDate.value = date
  }
  syncBucketSelection(nextStates)
}
</script>

<style scoped>
.care-behavior-timeline { margin: 0 0 10px; padding: 8px 0 0; }
.care-behavior-timeline-header { margin-bottom: 8px; }
.care-behavior-timeline-title { display: block; font-size: 15px; line-height: 1.35; color: #0f172a; font-weight: 700; margin-bottom: 3px; }
.care-behavior-timeline-subtitle { display: block; font-size: 11px; line-height: 1.45; color: #64748b; }
.care-behavior-weekday-header { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; margin: 0 0 2px; }
.care-behavior-weekday-item { text-align: center; color: #64748b; font-size: 10px; }
.care-behavior-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.care-behavior-cell { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 4px 3px 5px; height: 64px; border-radius: 12px; border: 1px solid #e5e7eb; background: #ffffff; overflow: hidden; }
.care-behavior-cell--selected { border-color: #94a3b8; box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.12) inset; }
.care-behavior-cell--today { border-color: #22c55e; background: #f0fdf4; }
.care-behavior-cell--historical,
.care-behavior-cell--future { background: #f8fafc; border-color: #e2e8f0; }
.care-behavior-cell--historical { opacity: .72; }
.care-behavior-cell--future { opacity: .55; }
.care-behavior-cell--locked { cursor: default; }
.care-behavior-cell--selectable { cursor: pointer; }
.care-behavior-day-wrap { display: flex; align-items: center; justify-content: center; gap: 3px; min-height: 16px; }
.care-behavior-day { font-size: 12px; color: #0f172a; font-weight: 700; line-height: 1.1; }
.care-behavior-day-mark { font-size: 9px; color: #15803d; background: #dcfce7; padding: 1px 4px; border-radius: 999px; }
.care-behavior-metrics { width: 100%; display: flex; flex-direction: column; gap: 2px; }
.care-behavior-metric { display: flex; align-items: center; justify-content: center; gap: 3px; line-height: 1; }
.care-behavior-metric-icon { width: 14px; height: 14px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #ffffff; }
.care-behavior-metric-icon--temp { background: #f97316; }
.care-behavior-metric-icon--humidity { background: #38bdf8; }
.care-behavior-metric-value { font-size: 9px; color: #334155; line-height: 1; }
.care-behavior-dot-row { display: flex; align-items: center; justify-content: center; gap: 4px; }
.care-behavior-dot-row--future { height: 12px; }
.care-behavior-cell--historical .care-behavior-day,
.care-behavior-cell--future .care-behavior-day,
.care-behavior-cell--historical .care-behavior-metric-value,
.care-behavior-cell--future .care-behavior-metric-value { color: #64748b; }
.care-behavior-cell--historical .care-behavior-marker,
.care-behavior-cell--future .care-behavior-marker { opacity: .55; }
.care-behavior-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(148, 163, 184, 0.45); position: relative; display: inline-flex; align-items: center; justify-content: center; background: #fff; }
.care-behavior-dot-fill { width: 6px; height: 6px; border-radius: 50%; opacity: 0; }
.care-behavior-dot--active { border-width: 2px; }
.care-behavior-dot--water { border-color: rgba(59, 130, 246, 0.55); }
.care-behavior-dot--water.care-behavior-dot--active { border-color: #2563eb; }
.care-behavior-dot--water.care-behavior-dot--active .care-behavior-dot-fill { opacity: 1; background: #2563eb; }
.care-behavior-dot--fertilize { border-color: rgba(249, 115, 22, 0.55); }
.care-behavior-dot--fertilize.care-behavior-dot--active { border-color: #ea580c; }
.care-behavior-dot--fertilize.care-behavior-dot--active .care-behavior-dot-fill { opacity: 1; background: #ea580c; }
.care-behavior-detail-panel { margin-top: 8px; padding: 8px 10px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
.care-behavior-detail-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.care-behavior-detail-date { font-size: 12px; color: #0f172a; font-weight: 600; }
.care-behavior-detail-weather { font-size: 10px; color: #64748b; text-align: right; }
.care-behavior-action-row { display: flex; flex-wrap: wrap; gap: 6px; }
.care-behavior-action-chip { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid #e2e8f0; background: #ffffff; color: #334155; font-size: 10px; line-height: 1; }
.care-behavior-action-chip--water { border-color: rgba(59, 130, 246, 0.25); }
.care-behavior-action-chip--fertilize { border-color: rgba(249, 115, 22, 0.25); }
.care-behavior-action-chip--light { border-color: rgba(34, 197, 94, 0.25); }
.care-behavior-action-chip--active.care-behavior-action-chip--water { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.care-behavior-action-chip--active.care-behavior-action-chip--fertilize { background: #fff7ed; border-color: #fdba74; color: #c2410c; }
.care-behavior-action-chip--active.care-behavior-action-chip--light { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.care-behavior-legend { margin-top: 6px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.care-behavior-legend-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #64748b; }
.care-behavior-legend-dot { width: 8px; height: 8px; border-radius: 50%; border: 2px solid rgba(148, 163, 184, 0.45); }
</style>
