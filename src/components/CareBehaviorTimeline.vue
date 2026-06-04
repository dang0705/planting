<template>
  <view :id="`diagnose-care-behavior-timeline-${questionId}`" class="care-behavior-timeline">
    <view v-if="loadingErrorText" class="care-behavior-error-banner">
      <text class="care-behavior-error-text">{{ loadingErrorText }}</text>
    </view>

    <view
      class="care-behavior-calendar-card relative box-border rounded-xl border border-[rgba(45,122,79,0.15)] bg-white p-5 shadow-[0_1px_0_rgba(45,122,79,0.02)]"
    >
      <view class="care-behavior-weekday-header">
        <text v-for="day in weekLabels" :key="day" class="care-behavior-weekday-item">{{
          day
        }}</text>
      </view>

      <view class="care-behavior-grid-stage relative overflow-visible">
        <view v-if="showLoadingSkeleton" class="care-behavior-grid-skeleton" aria-hidden="true">
          <view v-for="item in skeletonCellItems" :key="item" class="care-behavior-skeleton-cell">
            <view class="care-behavior-skeleton-day" />
            <view class="care-behavior-skeleton-metric care-behavior-skeleton-metric--one" />
            <view class="care-behavior-skeleton-metric care-behavior-skeleton-metric--two" />
            <view class="care-behavior-skeleton-dot-row">
              <view class="care-behavior-skeleton-dot" />
              <view class="care-behavior-skeleton-dot" />
              <view class="care-behavior-skeleton-dot" />
            </view>
          </view>
        </view>

        <view v-else class="care-behavior-grid">
          <view
            v-for="item in cellItems"
            :key="item.date"
            :id="`diagnose-care-behavior-date-${item.date}`"
            :class="[
              'care-behavior-cell',
              item.isSelected ? 'care-behavior-cell--selected' : '',
              item.isFuture ? 'care-behavior-cell--future' : '',
              item.isHistoricalOutOfRange ? 'care-behavior-cell--historical' : '',
              item.isToday ? 'care-behavior-cell--today' : '',
              item.canOpenDetail ? 'care-behavior-cell--selectable' : 'care-behavior-cell--locked'
            ]"
            @click="selectDate(item)"
            @touchstart="handleDatePressStart(item)"
            @touchend="handleDatePressEnd"
            @touchcancel="handleDatePressEnd"
            @mousedown="handleDatePressStart(item)"
            @mouseup="handleDatePressEnd"
            @mouseleave="handleDatePressEnd"
          >
            <view class="care-behavior-day-wrap">
              <text
                class="care-behavior-day"
                :class="item.isToday ? 'care-behavior-day--today' : ''"
                >{{ item.day }}</text
              >
            </view>

            <view
              class="care-behavior-metrics flex h-[30px] w-full flex-col justify-center gap-0 overflow-hidden"
            >
              <template v-if="item.hasWeatherMetrics">
                <view
                  v-if="item.temperatureText"
                  class="care-behavior-metric flex h-[15px] min-w-0 items-center justify-center gap-0.5 overflow-hidden leading-[15px]"
                >
                  <view
                    class="care-behavior-metric-icon care-behavior-metric-icon--temp relative h-[10px] w-[10px] shrink-0 text-[#5a7a68]"
                    aria-hidden="true"
                  >
                    <image
                      class="care-behavior-metric-icon-svg"
                      :src="temperatureIconSrc"
                      mode="aspectFit"
                      aria-hidden="true"
                    />
                  </view>
                  <text
                    class="care-behavior-metric-value min-w-0 max-w-[28px] shrink overflow-hidden whitespace-nowrap text-[10px] font-medium leading-[15px] text-[#5a7a68]"
                    >{{ item.temperatureDisplayText }}</text
                  >
                </view>
                <view
                  v-if="item.humidityText"
                  class="care-behavior-metric flex h-[15px] min-w-0 items-center justify-center gap-0.5 overflow-hidden leading-[15px]"
                >
                  <view
                    class="care-behavior-metric-icon care-behavior-metric-icon--humidity relative h-[10px] w-[10px] shrink-0 text-[#5a7a68]"
                    aria-hidden="true"
                  >
                    <image
                      class="care-behavior-metric-icon-svg"
                      :src="humidityIconSrc"
                      mode="aspectFit"
                      aria-hidden="true"
                    />
                  </view>
                  <text
                    class="care-behavior-metric-value min-w-0 max-w-[28px] shrink overflow-hidden whitespace-nowrap text-[10px] font-medium leading-[15px] text-[#5a7a68]"
                    >{{ item.humidityDisplayText }}</text
                  >
                </view>
              </template>
              <view v-else class="care-behavior-metrics-spacer h-[30px] w-full" />
            </view>

            <view class="care-behavior-dot-row">
              <view
                :id="`diagnose-care-behavior-water-${item.date}`"
                class="care-behavior-marker care-behavior-marker--water"
              >
                <view v-if="item.watering" class="care-behavior-dot care-behavior-dot--water" />
              </view>
              <view
                :id="`diagnose-care-behavior-fertilize-${item.date}`"
                class="care-behavior-marker care-behavior-marker--fertilize"
              >
                <view
                  v-if="item.fertilizing"
                  class="care-behavior-dot care-behavior-dot--fertilize"
                />
              </view>
              <view
                :id="`diagnose-care-behavior-light-${item.date}`"
                class="care-behavior-marker care-behavior-marker--light"
              >
                <view v-if="item.lightChange" class="care-behavior-dot care-behavior-dot--light" />
              </view>
            </view>
          </view>
        </view>

        <view
          v-if="selectedDateState"
          class="care-behavior-detail-popover absolute z-[5] w-[95px] max-w-[320px]"
          @click="resetDatePopoverAutoHide"
          :style="selectedDatePopoverStyle"
        >
          <view
            class="care-behavior-detail-popover-arrow absolute top-[-5px] -translate-x-1/2"
            :style="selectedDatePopoverArrowStyle"
          />
          <view
            class="care-behavior-detail-popover-card relative box-border w-[95px] overflow-hidden rounded-xl border border-[rgba(45,122,79,0.15)] bg-white px-[13px] py-[9px] shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
          >
            <text
              class="care-behavior-detail-date block whitespace-nowrap text-base font-medium leading-6 text-[#0f172a]"
              >{{ selectedDateLabel }}</text
            >
            <view class="care-behavior-detail-body flex flex-col pt-1">
              <text
                class="care-behavior-detail-row block whitespace-nowrap pt-1 text-sm leading-5 text-[#0f172a]"
                >温度: {{ selectedDateDialogTemperatureText }}</text
              >
              <text
                class="care-behavior-detail-row block whitespace-nowrap pt-1 text-sm leading-5 text-[#0f172a]"
                >湿度: {{ selectedDateDialogHumidityText }}</text
              >
              <text
                :id="`diagnose-care-behavior-action-water-${selectedDateState.date}`"
                class="care-behavior-detail-status block whitespace-nowrap pt-1 text-sm leading-5 text-slate-400"
                :class="{
                  'text-[#51a2ff]': selectedDateHasBehavior,
                  'opacity-[0.58]': !selectedDateState.isSelectable
                }"
                @click="toggleCareAction(selectedDateState.date, 'watering')"
                >{{ selectedDateBehaviorStatusText }}</text
              >
            </view>
          </view>
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  buildCareBehaviorTimelineFromDateEvents,
  buildCareBehaviorDisplayWindow,
  getCareBehaviorDateSet,
  getCareBehaviorDateWindow,
  normalizeCareBehaviorTimeline
} from '@/utils/care-behavior-timeline.js'
import { formatWeatherText } from '@/utils/care-behavior-weather.js'
import { buildWeatherByDateFromEnvironmentWeatherWindow } from '@/utils/care-behavior-weather-window.js'

const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
const temperatureIconSrc =
  'data:image/svg+xml;utf8,%3Csvg%20preserveAspectRatio%3D%22none%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20overflow%3D%22visible%22%20style%3D%22display%3A%20block%3B%22%20viewBox%3D%220%200%209.9934%209.9934%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20id%3D%22Icon%22%20clip-path%3D%22url(%23clip0_0_7)%22%3E%3Cpath%20id%3D%22Vector%22%20d%3D%22M5.82948%201.66557V6.05433C6.14701%206.23766%206.39517%206.52063%206.53548%206.85937C6.67579%207.19811%206.70041%207.57368%206.60551%207.92784C6.51062%208.28199%206.30151%208.59494%206.01063%208.81814C5.71975%209.04134%205.36335%209.16232%204.9967%209.16232C4.63005%209.16232%204.27365%209.04134%203.98277%208.81814C3.69189%208.59494%203.48278%208.28199%203.38789%207.92784C3.29299%207.57368%203.31761%207.19811%203.45792%206.85937C3.59823%206.52063%203.84639%206.23766%204.16392%206.05433V1.66557C4.16392%201.4447%204.25166%201.23288%204.40783%201.0767C4.56401%200.920523%204.77583%200.832783%204.9967%200.832783C5.21757%200.832783%205.42939%200.920523%205.58557%201.0767C5.74174%201.23288%205.82948%201.4447%205.82948%201.66557Z%22%20stroke%3D%22%235A7A68%22%20stroke-width%3D%220.832783%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3CclipPath%20id%3D%22clip0_0_7%22%3E%3Crect%20width%3D%229.9934%22%20height%3D%229.9934%22%20fill%3D%22white%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3C%2Fsvg%3E'
const humidityIconSrc =
  'data:image/svg+xml;utf8,%3Csvg%20preserveAspectRatio%3D%22none%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20overflow%3D%22visible%22%20style%3D%22display%3A%20block%3B%22%20viewBox%3D%220%200%209.9934%209.9934%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20id%3D%22Icon%22%20clip-path%3D%22url(%23clip0_0_4)%22%3E%3Cpath%20id%3D%22Vector%22%20d%3D%22M2.91474%206.78718C3.8308%206.78718%204.58031%206.02519%204.58031%205.1008C4.58031%204.61778%204.34297%204.15975%203.86828%203.77251C3.39359%203.38526%203.0355%202.81064%202.91474%202.20688C2.79399%202.81064%202.44006%203.38943%201.9612%203.77251C1.48235%204.15559%201.24917%204.62195%201.24917%205.1008C1.24917%206.02519%201.99868%206.78718%202.91474%206.78718Z%22%20stroke%3D%22%235A7A68%22%20stroke-width%3D%220.832783%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20id%3D%22Vector_2%22%20d%3D%22M5.22988%202.74818C5.51626%202.29062%205.71926%201.78592%205.82948%201.2575C6.03768%202.29848%206.66227%203.29782%207.49505%203.96405C8.32783%204.63028%208.74423%205.42142%208.74423%206.2542C8.7466%206.82978%208.57803%207.3931%208.25988%207.87275C7.94172%208.35241%207.48831%208.7268%206.95713%208.94846C6.42594%209.17012%205.8409%209.22907%205.27617%209.11784C4.71144%209.00661%204.19245%208.73021%203.785%208.32367%22%20stroke%3D%22%235A7A68%22%20stroke-width%3D%220.832783%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3CclipPath%20id%3D%22clip0_0_4%22%3E%3Crect%20width%3D%229.9934%22%20height%3D%229.9934%22%20fill%3D%22white%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3C%2Fsvg%3E'
const gridColumnCount = 7
const dateCellHeightPx = 75
const dateCellWidthPx = 42
const gridGapPx = 4
const popoverOffsetPx = 8
const popoverWidthPx = 95
const props = defineProps({
  questionId: { type: String, default: '' },
  timeline: { type: Object, default: () => ({}) },
  question: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  error: { type: [String, Object], default: '' }
})
const emit = defineEmits(['change'])
const skeletonCellItems = Array.from({ length: 21 }, (_, index) => index)

const bucketSelection = ref('unknown')
const baseBucketSelection = ref('unknown')
const dateStates = ref({})
const selectedDate = ref('')
const popoverDate = ref('')
const longPressTimer = ref(null)
const popoverAutoHideTimer = ref(null)
const popoverOpenedAt = ref(0)
const LONG_PRESS_DURATION_MS = 1000
const POPOVER_AUTO_HIDE_MS = 5000
const CLICK_SUPPRESS_AFTER_LONG_PRESS_MS = 450
const longPressedDate = ref('')

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
const timelineSource = computed(() =>
  normalizeCareBehaviorTimeline(props.timeline, {
    dateWindow: dateWindowSet.value,
    referenceDate: referenceDate.value
  })
)

function collectWeatherSources(question = {}, timeline = {}) {
  const qTimeline = question?.careBehaviorTimeline || {}
  const environmentContext = question?.environmentContext || {}
  const payload = question?.payload || {}
  const payloadTimeline =
    payload?.careBehaviorTimeline || payload?.care_behavior_timeline || payload?.timeline || {}
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
  const cleaned = raw.replace(/[℃°℉%]/g, '').trim()
  if (!cleaned) {
    return ''
  }
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? `${Math.round(numeric)}` : cleaned
}

function getWeatherTemperatureText(entry = {}) {
  return normalizeWeatherMetricValue(
    entry.temp ??
      entry.temperature ??
      entry.tempC ??
      entry.tempF ??
      entry.tempMaxC ??
      entry.tempMax ??
      entry.maxTemp ??
      entry.maxTemperature ??
      entry.tempMinC ??
      entry.tempMin ??
      entry.minTemp ??
      entry.minTemperature ??
      entry.tempMaxF ??
      entry.tempMinF ??
      ''
  )
}

function getWeatherHumidityText(entry = {}) {
  return normalizeWeatherMetricValue(entry.humidity ?? entry.humi)
}

function formatCellMetricText(value = '', suffix = '') {
  const normalized = normalizeWeatherMetricValue(value)
  return normalized ? `${normalized}${suffix}` : ''
}

function formatDialogTemperatureText(value = '') {
  const normalized = normalizeWeatherMetricValue(value)
  return normalized ? `${normalized}°C` : '—'
}

function formatDialogHumidityText(value = '') {
  const normalized = normalizeWeatherMetricValue(value)
  return normalized ? `${normalized}%` : '—'
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
    if (
      candidate.environmentWeatherWindow &&
      typeof candidate.environmentWeatherWindow === 'object'
    ) {
      mergeFromObject(candidate.environmentWeatherWindow)
      return
    }
    const environmentWindowWeatherByDate = buildWeatherByDateFromEnvironmentWeatherWindow(candidate)
    if (Object.keys(environmentWindowWeatherByDate).length) {
      Object.entries(environmentWindowWeatherByDate).forEach(([date, entry]) =>
        addMapEntry(date, entry)
      )
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
    if (
      candidate.weather &&
      typeof candidate.weather === 'object' &&
      !Object.prototype.hasOwnProperty.call(candidate, 'weatherByDate')
    ) {
      if (typeof candidate.weather === 'object' || Array.isArray(candidate.weather)) {
        mergeFromObject(candidate.weather)
      } else {
        addMapEntry(fallbackDate, candidate)
      }
    }
    const isDateMap = Object.keys(candidate).every(
      key => /^\d{4}-\d{1,2}-\d{1,2}$/.test(key) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(key)
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
  return ['within_10d', '11_30d', '31_60d', 'over_60d', 'almost_never', 'unknown'].includes(
    normalized
  )
    ? normalized
    : 'unknown'
}

function formatDateLabel(date = '') {
  const normalizedDate = normalizeDateValue(date)
  if (!normalizedDate) {
    return ''
  }
  const [, month, day] = normalizedDate.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function normalizeErrorText(error = '') {
  if (!error) {
    return ''
  }
  if (typeof error === 'string') {
    return error.trim()
  }
  if (typeof error === 'object') {
    return String(error.message || error.msg || error.errorMessage || '').trim()
  }
  return ''
}

function isDateInEvents(date, events = []) {
  return (events || []).some(item => String(item?.date || '').trim() === date)
}

const selectedDateState = computed(() => {
  if (!popoverDate.value) {
    return null
  }
  return dateStates.value[popoverDate.value] || null
})

const selectedDateLabel = computed(() => {
  if (!selectedDateState.value) {
    return ''
  }
  return formatDateLabel(selectedDateState.value.date)
})

const selectedDateTemperatureText = computed(() => {
  if (!selectedDateState.value) {
    return ''
  }
  return (
    selectedDateState.value.temperatureDisplayText ||
    formatCellMetricText(selectedDateState.value.temperatureText || '', '°')
  )
})

const selectedDateHumidityText = computed(() => {
  if (!selectedDateState.value) {
    return ''
  }
  return (
    selectedDateState.value.humidityDisplayText ||
    formatCellMetricText(selectedDateState.value.humidityText || '', '%')
  )
})

const selectedDateDialogTemperatureText = computed(() =>
  formatDialogTemperatureText(selectedDateTemperatureText.value)
)

const selectedDateDialogHumidityText = computed(() =>
  formatDialogHumidityText(selectedDateHumidityText.value)
)

const selectedDateBehaviorText = computed(() => {
  if (!selectedDateState.value) {
    return ''
  }
  const items = []
  if (selectedDateState.value.watering) {
    items.push('浇水')
  }
  if (selectedDateState.value.fertilizing) {
    items.push('施肥')
  }
  if (selectedDateState.value.lightChange) {
    items.push('强光/位置变化')
  }
  return items.length ? items.join(' / ') : '未记录'
})

const selectedDateHasBehavior = computed(() => {
  const state = selectedDateState.value
  return Boolean(state?.watering || state?.fertilizing || state?.lightChange)
})

const selectedDateBehaviorStatusText = computed(() =>
  selectedDateHasBehavior.value ? `${selectedDateBehaviorText.value} 00:00` : '未记录'
)

const selectedDateGridIndex = computed(() => {
  const date = selectedDateState.value?.date
  if (!date) {
    return -1
  }
  return cellItems.value.findIndex(item => item.date === date)
})

const selectedDatePopoverStyle = computed(() => {
  const index = selectedDateGridIndex.value
  if (index < 0) {
    return {}
  }
  const column = index % gridColumnCount
  const row = Math.floor(index / gridColumnCount)
  const top = `${row * (dateCellHeightPx + gridGapPx) + dateCellHeightPx + popoverOffsetPx}px`
  if (column === 0) {
    return { left: '0', top, transform: 'none' }
  }
  if (column === gridColumnCount - 1) {
    return { left: '100%', top, transform: 'translateX(-100%)' }
  }
  return {
    left: `${((column + 0.5) / gridColumnCount) * 100}%`,
    top,
    transform: 'translateX(-50%)'
  }
})

const selectedDatePopoverArrowStyle = computed(() => {
  const index = selectedDateGridIndex.value
  if (index < 0) {
    return {}
  }
  const column = index % gridColumnCount
  if (column === 0) {
    return { left: `${dateCellWidthPx / 2}px` }
  }
  if (column === gridColumnCount - 1) {
    return { left: `${popoverWidthPx - dateCellWidthPx / 2}px` }
  }
  return { left: '50%' }
})

const loadingErrorText = computed(() => normalizeErrorText(props.error))

const weatherByDate = computed(() => {
  const merged = {}
  const fallbackDate = normalizeDateValue(referenceDate.value)
  for (const source of collectWeatherSources(props.question, props.timeline)) {
    Object.assign(merged, normalizeWeatherInput(source, fallbackDate))
  }
  return Object.fromEntries(
    Object.entries(merged).filter(([date]) => dateWindowSet.value.has(normalizeDateValue(date)))
  )
})

const displayWindow = computed(() => buildCareBehaviorDisplayWindow(referenceDate.value))
const hasWeatherData = computed(() => Object.keys(weatherByDate.value || {}).length > 0)
const showLoadingSkeleton = computed(() => Boolean(props.loading) && !hasWeatherData.value)

const displayedCellItems = computed(() => {
  return displayWindow.value.map(item => {
    const state = dateStates.value[item.date] || {}
    const temperatureDisplayText = formatCellMetricText(
      state.temperatureText || weatherByDate.value[item.date]?.temperatureText || '',
      '°'
    )
    const humidityDisplayText = formatCellMetricText(
      state.humidityText || weatherByDate.value[item.date]?.humidityText || '',
      '%'
    )
    return {
      ...item,
      isActive: true,
      isSelectable: Boolean(state.isSelectable),
      canOpenDetail: Boolean(state.canOpenDetail && (item.isToday || item.isSelectable)),
      isSelected: Boolean(
        state.watering &&
        item.isSelectable &&
        !item.isToday &&
        !item.isHistoricalOutOfRange &&
        !item.isFuture
      ),
      isFuture: Boolean(item.isFuture),
      isHistoricalOutOfRange: Boolean(item.isHistoricalOutOfRange),
      watering: Boolean(state.watering),
      fertilizing: Boolean(state.fertilizing),
      lightChange: Boolean(state.lightChange),
      hasWeatherMetrics: Boolean(state.temperatureText || state.humidityText),
      weatherText: state.weatherText || weatherByDate.value[item.date]?.text || '',
      temperatureText:
        state.temperatureText || weatherByDate.value[item.date]?.temperatureText || '',
      humidityText: state.humidityText || weatherByDate.value[item.date]?.humidityText || '',
      temperatureDisplayText,
      humidityDisplayText
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

watch(
  timelinePayload,
  value => {
    emit('change', value)
  },
  { deep: true, immediate: true }
)

watch(
  () => [props.timeline, props.question],
  () => {
    initializeTimelineFromProps()
  },
  { deep: true, immediate: true }
)

onMounted(initializeTimelineFromProps)

function initializeTimelineFromProps() {
  const sourceBucket = normalizeBucket(timelineSource.value.last_fertilized_bucket)
  baseBucketSelection.value = sourceBucket
  bucketSelection.value = sourceBucket
  const nextDateStates = buildDateStates()
  dateStates.value = nextDateStates
  selectedDate.value = resolveSelectedDateAfterRebuild(nextDateStates)
  if (popoverDate.value && !nextDateStates[popoverDate.value]) {
    popoverDate.value = ''
  }
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
      hasWeatherMetrics: Boolean(weather.temperatureText || weather.humidityText),
      canOpenDetail: Boolean(item.canOpenDetail && (item.isToday || item.isSelectable))
    }
  }
  return state
}

function resolveDefaultSelectedDate() {
  const todayItem = displayWindow.value.find(item => item.isToday)
  if (todayItem?.date) {
    return todayItem.date
  }

  const selectableDates = displayWindow.value
    .filter(item => item.isSelectable)
    .map(item => item.date)
  const activeSelectableDate = selectableDates
    .slice()
    .reverse()
    .find(date => {
      const state = dateStates.value[date]
      return Boolean(state?.watering || state?.fertilizing || state?.lightChange)
    })
  return activeSelectableDate || selectableDates[selectableDates.length - 1] || ''
}

function resolveSelectedDateAfterRebuild(nextStates = {}) {
  const currentState = selectedDate.value ? nextStates[selectedDate.value] : null
  if (
    currentState?.canOpenDetail &&
    !currentState.isFuture &&
    !currentState.isHistoricalOutOfRange
  ) {
    return selectedDate.value
  }
  return resolveDefaultSelectedDate()
}

function selectDate(item = {}) {
  if (!item?.date || item.canOpenDetail === false || item.isFuture || item.isHistoricalOutOfRange) {
    return
  }
  if (
    item.date === longPressedDate.value &&
    Date.now() - popoverOpenedAt.value < CLICK_SUPPRESS_AFTER_LONG_PRESS_MS
  ) {
    longPressedDate.value = ''
    return
  }
  selectedDate.value = item.date
  if (item.isSelectable && !item.isToday) {
    toggleCareAction(item.date, 'watering')
  }
}

function hasLongPressTarget(item = {}) {
  return Boolean(item?.date && item.canOpenDetail && !item.isFuture && !item.isHistoricalOutOfRange)
}

function clearLongPressTimer() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
  }
  longPressTimer.value = null
}

function clearPopoverAutoHideTimer() {
  if (popoverAutoHideTimer.value) {
    clearTimeout(popoverAutoHideTimer.value)
  }
  popoverAutoHideTimer.value = null
}

function resetDatePopoverAutoHide() {
  clearPopoverAutoHideTimer()
  popoverAutoHideTimer.value = setTimeout(() => {
    popoverDate.value = ''
  }, POPOVER_AUTO_HIDE_MS)
}

function openDatePopoverByDate(date = '') {
  if (!date || !dateStates.value[date]?.canOpenDetail) {
    return
  }
  const now = Date.now()
  if (popoverDate.value === date && now - popoverOpenedAt.value < 220) {
    return
  }
  popoverDate.value = date
  popoverOpenedAt.value = now
  longPressedDate.value = date
  selectedDate.value = date
  resetDatePopoverAutoHide()
}

function handleDatePressStart(item = {}) {
  if (!hasLongPressTarget(item)) {
    return
  }
  clearLongPressTimer()
  longPressTimer.value = setTimeout(() => {
    openDatePopoverByDate(item.date)
  }, LONG_PRESS_DURATION_MS)
}

function handleDatePressEnd() {
  clearLongPressTimer()
}

function syncBucketSelection(nextStates = {}) {
  const hasFertilizing = Object.values(nextStates).some(item => Boolean(item?.fertilizing))
  bucketSelection.value = hasFertilizing ? 'within_10d' : baseBucketSelection.value || 'unknown'
}

function toggleCareAction(date, action) {
  const state = dateStates.value[date]
  if (
    !state ||
    !state.isSelectable ||
    state.isToday ||
    state.isFuture ||
    state.isHistoricalOutOfRange
  ) {
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

onUnmounted(() => {
  clearLongPressTimer()
  clearPopoverAutoHideTimer()
})
</script>

<style scoped>
.care-behavior-timeline {
  margin: 0 0 10px;
  padding: 0;
}
.care-behavior-error-banner {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(45, 122, 79, 0.15);
  background: rgba(248, 250, 249, 0.96);
}
.care-behavior-error-text {
  display: block;
  font-size: 12px;
  line-height: 18px;
  color: #5a7a68;
}
.care-behavior-weekday-header {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
  margin: 0 0 2px;
}
.care-behavior-weekday-item {
  text-align: center;
  color: #5a7a68;
  font-size: 12px;
  line-height: 16px;
}
.care-behavior-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.care-behavior-grid-skeleton {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.care-behavior-skeleton-cell {
  box-sizing: border-box;
  height: 75px;
  border-radius: 12px;
  border: 1px solid rgba(45, 122, 79, 0.12);
  background: linear-gradient(
    90deg,
    rgba(241, 248, 244, 0.72),
    rgba(248, 250, 249, 0.92),
    rgba(241, 248, 244, 0.72)
  );
  padding: 6px 4px 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  animation: careBehaviorPulse 1.2s ease-in-out infinite;
}
.care-behavior-skeleton-day,
.care-behavior-skeleton-metric,
.care-behavior-skeleton-dot {
  background: rgba(90, 122, 104, 0.14);
}
.care-behavior-skeleton-day {
  width: 16px;
  height: 10px;
  border-radius: 999px;
}
.care-behavior-skeleton-metric {
  width: 26px;
  height: 7px;
  border-radius: 999px;
}
.care-behavior-skeleton-metric--two {
  width: 22px;
}
.care-behavior-skeleton-dot-row {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  background: transparent;
}
.care-behavior-skeleton-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.care-behavior-cell {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 6px 2px 5px;
  height: 75px;
  border-radius: 12px;
  border: 1px solid rgba(45, 122, 79, 0.15);
  background: #ffffff;
  overflow: hidden;
}
.care-behavior-cell--selected {
  border: 2px solid #2d7a4f;
  background: rgba(45, 122, 79, 0.05);
  box-shadow: 0 0 0 1px rgba(45, 122, 79, 0.06) inset;
}
.care-behavior-cell--historical,
.care-behavior-cell--future {
  background: rgba(241, 248, 244, 0.5);
  border-color: rgba(45, 122, 79, 0.08);
  opacity: 0.5;
}
.care-behavior-cell--selected.care-behavior-cell--historical,
.care-behavior-cell--selected.care-behavior-cell--future {
  opacity: 1;
  border-color: rgba(45, 122, 79, 0.32);
  background: rgba(45, 122, 79, 0.035);
}
.care-behavior-cell--locked {
  cursor: default;
}
.care-behavior-cell--selectable {
  cursor: pointer;
}
.care-behavior-day-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 16px;
}
.care-behavior-day {
  font-size: 14px;
  color: #0f172a;
  font-weight: 500;
  line-height: 1.1;
}
.care-behavior-day--today {
  color: #ef4444;
  font-weight: 700;
}
.care-behavior-metric-icon {
  position: relative;
}
.care-behavior-metric-icon-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.care-behavior-cell--historical .care-behavior-day,
.care-behavior-cell--future .care-behavior-day,
.care-behavior-cell--historical .care-behavior-metric-value,
.care-behavior-cell--future .care-behavior-metric-value {
  color: #6b7f74;
}
.care-behavior-dot-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 10px;
}
.care-behavior-marker {
  width: 8px;
  height: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.care-behavior-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #2563eb;
}
.care-behavior-dot--water {
  background: #2b7fff;
}
.care-behavior-dot--fertilize {
  background: #fe9a00;
}
.care-behavior-dot--light {
  background: #22c55e;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.74) inset;
}
.care-behavior-detail-popover-arrow {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid #ffffff;
  filter: drop-shadow(0 -1px 1px rgba(45, 122, 79, 0.08));
}
.care-behavior-legend {
  margin-top: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: flex-end;
}
.care-behavior-legend-item {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: #5a7a68;
  line-height: 1.25;
}
.care-behavior-legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.care-behavior-legend-dot.care-behavior-dot--water {
  background: #2b7fff;
}
.care-behavior-legend-dot.care-behavior-dot--fertilize {
  background: #fe9a00;
}

@keyframes careBehaviorPulse {
  0%,
  100% {
    opacity: 0.72;
  }
  50% {
    opacity: 1;
  }
}
</style>
