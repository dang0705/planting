import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  buildCareBehaviorTimelineFromDateEvents,
  buildCareBehaviorDisplayWindow,
  getCareBehaviorDateSet,
  normalizeCareBehaviorTimeline
} from '@/utils/care-behavior-timeline.js'
import {
  collectWeatherSources,
  formatCellMetricText,
  formatDateLabel,
  formatDialogHumidityText,
  formatDialogTemperatureText,
  normalizeDateValue,
  normalizeErrorText,
  normalizeWeatherInput
} from './weather.js'
import { buildTimelineEventSources, buildTimelinePayloadDateEvents } from './event-sources.js'
import {
  getDatePopoverArrowStyle,
  getDatePopoverStyle,
  POPOVER_REOPEN_SUPPRESS_MS
} from './popover-position.js'

const LONG_PRESS_DURATION_MS = 1000
const POPOVER_AUTO_HIDE_MS = 5000
const LONG_PRESS_CLICK_SUPPRESS_MS = 450
const INITIAL_SKELETON_VISIBLE_MS = 800

function normalizeBucket(value = 'unknown') {
  const normalized = String(value || '').trim()
  return ['within_10d', '11_30d', '31_60d', 'over_60d', 'almost_never', 'unknown'].includes(
    normalized
  )
    ? normalized
    : 'unknown'
}

function isDateInEvents(date, events = []) {
  return (events || []).some(item => String(item?.date || '').trim() === date)
}

function useReferenceDate(props) {
  return computed(() => {
    const candidate =
      props.question?.referenceDate ||
      props.question?.reference_date ||
      props.timeline?.reference_date ||
      props.timeline?.referenceDate ||
      new Date()
    const value = candidate instanceof Date ? candidate : new Date(candidate)
    return Number.isNaN(value.getTime()) ? new Date() : value
  })
}

export function useCareBehaviorTimeline(props, emit) {
  const bucketSelection = ref('unknown')
  const baseBucketSelection = ref('unknown')
  const dateStates = ref({})
  const selectedDate = ref('')
  const popoverDate = ref('')
  const longPressTimer = ref(null)
  const popoverAutoHideTimer = ref(null)
  const longPressSuppressTimer = ref(null)
  const popoverOpenedAt = ref(0)
  const longPressTriggeredDate = ref('')
  const suppressSelectDateAfterLongPress = ref('')
  const initialSkeletonVisible = ref(true)
  const wateringDoseByDate = ref({})

  function setWateringDose(date, amountMl) {
    if (!date) {
      return
    }
    wateringDoseByDate.value = { ...wateringDoseByDate.value, [date]: amountMl }
  }

  const referenceDate = useReferenceDate(props)
  const dateWindowSet = computed(() => getCareBehaviorDateSet(referenceDate.value))
  const timelineSource = computed(() =>
    normalizeCareBehaviorTimeline(props.timeline, {
      dateWindow: dateWindowSet.value,
      referenceDate: referenceDate.value
    })
  )
  const loadingErrorText = computed(() => normalizeErrorText(props.error))
  const timelineWeatherSources = computed(() => {
    const timeline = props?.timeline && typeof props.timeline === 'object' ? props.timeline : {}
    if (props.loading) {
      return []
    }
    return collectWeatherSources(props.question, timeline)
  })
  const weatherByDate = computed(() => {
    const merged = {}
    const fallbackDate = normalizeDateValue(referenceDate.value)
    for (const source of timelineWeatherSources.value) {
      Object.assign(merged, normalizeWeatherInput(source, fallbackDate))
    }
    return Object.fromEntries(
      Object.entries(merged).filter(([date]) => dateWindowSet.value.has(normalizeDateValue(date)))
    )
  })
  const displayWindow = computed(() => buildCareBehaviorDisplayWindow(referenceDate.value))
  const hasWeatherData = computed(() => Object.keys(weatherByDate.value || {}).length > 0)
  const showLoadingSkeleton = computed(() =>
    Boolean(props.loading || (initialSkeletonVisible.value && !hasWeatherData.value))
  )
  const timelineEventSources = computed(() => {
    return buildTimelineEventSources({
      dateWindow: dateWindowSet.value,
      rawTimeline: props.timeline,
      referenceDate: referenceDate.value,
      timelineSource: timelineSource.value
    })
  })

  const cellItems = computed(() =>
    displayWindow.value.map(item => {
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
          state.selectedWatering &&
          item.isSelectable &&
          !item.isHistoricalOutOfRange &&
          !item.isFuture
        ),
        isFuture: Boolean(item.isFuture),
        isHistoricalOutOfRange: Boolean(item.isHistoricalOutOfRange),
        watering: Boolean(state.recordedWatering),
        fertilizing: Boolean(state.recordedFertilizing),
        lightChange: Boolean(state.recordedLightChange),
        hasWeatherMetrics: Boolean(state.temperatureText || state.humidityText),
        weatherText: state.weatherText || weatherByDate.value[item.date]?.text || '',
        temperatureText:
          state.temperatureText || weatherByDate.value[item.date]?.temperatureText || '',
        humidityText: state.humidityText || weatherByDate.value[item.date]?.humidityText || '',
        temperatureDisplayText,
        humidityDisplayText
      }
    })
  )

  const selectedDateState = computed(() => {
    if (!popoverDate.value) {
      return null
    }
    return dateStates.value[popoverDate.value] || null
  })
  const selectedDateLabel = computed(() =>
    selectedDateState.value ? formatDateLabel(selectedDateState.value.date) : ''
  )
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
    if (selectedDateState.value.recordedWatering) {
      items.push('浇水')
    }
    if (selectedDateState.value.recordedFertilizing) {
      items.push('施肥')
    }
    if (selectedDateState.value.recordedLightChange) {
      items.push('强光/位置变化')
    }
    return items.length ? items.join(' / ') : '未记录'
  })
  const selectedDateHasBehavior = computed(() => {
    const state = selectedDateState.value
    return Boolean(
      state?.recordedWatering || state?.recordedFertilizing || state?.recordedLightChange
    )
  })
  const selectedDateBehaviorStatusText = computed(() =>
    selectedDateHasBehavior.value ? `${selectedDateBehaviorText.value} 00:00` : '未记录'
  )
  const selectedDateGridIndex = computed(() => {
    const date = selectedDateState.value?.date
    return date ? cellItems.value.findIndex(item => item.date === date) : -1
  })
  const selectedDatePopoverStyle = computed(() => {
    const index = selectedDateGridIndex.value
    return getDatePopoverStyle(index)
  })
  const selectedDatePopoverArrowStyle = computed(() => {
    const index = selectedDateGridIndex.value
    return getDatePopoverArrowStyle(index)
  })

  const timelinePayload = computed(() => {
    const nextTimeline = buildCareBehaviorTimelineFromDateEvents(
      buildTimelinePayloadDateEvents(dateStates.value),
      {
        dateWindowSet: dateWindowSet.value,
        referenceDate: referenceDate.value,
        last_fertilized_bucket: bucketSelection.value
      }
    )
    const wateringEventsWithDose = (nextTimeline.watering_events_10d || []).map(ev => {
      const hasSelection = Object.prototype.hasOwnProperty.call(wateringDoseByDate.value, ev.date)
      const selectedMl = hasSelection ? wateringDoseByDate.value[ev.date] : undefined
      const amountMl = selectedMl !== undefined ? selectedMl : ev.amountMl
      const next = { ...ev }
      if (amountMl !== null && amountMl !== undefined) {
        next.amountMl = amountMl
      } else {
        delete next.amountMl
      }
      return next
    })
    return {
      ...nextTimeline,
      watering_events_10d: wateringEventsWithDose,
      last_fertilized_bucket: bucketSelection.value,
      recorded_fertilizing_events_10d: timelineEventSources.value.recordedFertilizingEvents,
      recorded_light_change_events_10d: timelineEventSources.value.recordedLightChangeEvents,
      recorded_watering_events_10d: timelineEventSources.value.recordedWateringEvents,
      selected_watering_events_10d: wateringEventsWithDose
    }
  })

  const wateringDoseRows = computed(() =>
    (timelinePayload.value?.selected_watering_events_10d || []).map(ev => ({
      date: ev.date,
      amountMl: ev.amountMl ?? null,
      // 标记本次会话用户是否主动选过档位：用于区分「未选择」（默认第二档）与「选了不知道」（保持第一档）
      hasSelection: Object.prototype.hasOwnProperty.call(wateringDoseByDate.value, ev.date)
    }))
  )

  function buildDateStates() {
    const state = {}
    const source = timelineEventSources.value
    for (const item of displayWindow.value) {
      const weather = weatherByDate.value[item.date] || {}
      state[item.date] = {
        date: item.date,
        recordedFertilizing: isDateInEvents(item.date, source.recordedFertilizingEvents),
        recordedLightChange: isDateInEvents(item.date, source.recordedLightChangeEvents),
        recordedWatering: isDateInEvents(item.date, source.recordedWateringEvents),
        selectedWatering: isDateInEvents(item.date, source.selectedWateringEvents),
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
        return Boolean(
          state?.selectedWatering ||
          state?.recordedWatering ||
          state?.recordedFertilizing ||
          state?.recordedLightChange
        )
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

  function syncBucketSelection(nextStates = {}) {
    const hasFertilizing = Object.values(nextStates).some(item =>
      Boolean(item?.recordedFertilizing)
    )
    bucketSelection.value = hasFertilizing ? 'within_10d' : baseBucketSelection.value || 'unknown'
  }

  function toggleCareAction(date, action) {
    const state = dateStates.value[date]
    if (!state || !state.isSelectable || state.isFuture || state.isHistoricalOutOfRange) {
      return
    }
    if (action !== 'watering') {
      return
    }
    const next = { ...state, selectedWatering: !state.selectedWatering }
    const nextStates = { ...dateStates.value, [date]: next }
    dateStates.value = nextStates
    if (!selectedDate.value || selectedDate.value === date) {
      selectedDate.value = date
    }
    syncBucketSelection(nextStates)
  }

  function selectDate(item = {}) {
    if (
      !item?.date ||
      item.canOpenDetail === false ||
      item.isFuture ||
      item.isHistoricalOutOfRange
    ) {
      return
    }
    if (item.date === suppressSelectDateAfterLongPress.value) {
      clearLongPressSelectSuppression()
      return
    }
    selectedDate.value = item.date
    if (item.isSelectable) {
      toggleCareAction(item.date, 'watering')
    }
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

  function clearLongPressSuppressTimer() {
    if (longPressSuppressTimer.value) {
      clearTimeout(longPressSuppressTimer.value)
    }
    longPressSuppressTimer.value = null
  }

  function clearLongPressSelectSuppression() {
    clearLongPressSuppressTimer()
    longPressTriggeredDate.value = ''
    suppressSelectDateAfterLongPress.value = ''
  }

  function scheduleLongPressSelectSuppressionClear() {
    clearLongPressSuppressTimer()
    longPressSuppressTimer.value = setTimeout(() => {
      clearLongPressSelectSuppression()
    }, LONG_PRESS_CLICK_SUPPRESS_MS)
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
    if (popoverDate.value === date && now - popoverOpenedAt.value < POPOVER_REOPEN_SUPPRESS_MS) {
      return
    }
    popoverDate.value = date
    popoverOpenedAt.value = now
    longPressTriggeredDate.value = date
    suppressSelectDateAfterLongPress.value = date
    selectedDate.value = date
    resetDatePopoverAutoHide()
  }

  function handleDatePressStart(item = {}) {
    const canOpen = Boolean(
      item?.date && item.canOpenDetail && !item.isFuture && !item.isHistoricalOutOfRange
    )
    if (!canOpen) {
      return
    }
    clearLongPressTimer()
    longPressTimer.value = setTimeout(() => {
      openDatePopoverByDate(item.date)
    }, LONG_PRESS_DURATION_MS)
  }

  function handleDatePressEnd() {
    clearLongPressTimer()
    if (longPressTriggeredDate.value) {
      scheduleLongPressSelectSuppressionClear()
    }
  }

  function initializeSkeletonVisibility() {
    setTimeout(() => {
      initialSkeletonVisible.value = false
    }, INITIAL_SKELETON_VISIBLE_MS)
  }

  watch(timelinePayload, value => emit('change', value), { deep: true, immediate: true })
  watch(() => [props.timeline, props.question], initializeTimelineFromProps, {
    deep: true,
    immediate: true
  })
  // 盆体积变化导致档位变化时，清除旧的剂量选中态（旧 ml 不匹配新档位）
  watch(
    () => props.potVolumeMl,
    () => {
      wateringDoseByDate.value = {}
    }
  )
  onMounted(initializeSkeletonVisibility)
  onMounted(initializeTimelineFromProps)
  onUnmounted(() => {
    clearLongPressTimer()
    clearPopoverAutoHideTimer()
    clearLongPressSuppressTimer()
  })

  return {
    cellItems,
    loadingErrorText,
    selectedDateBehaviorStatusText,
    selectedDateDialogHumidityText,
    selectedDateDialogTemperatureText,
    selectedDateHasBehavior,
    selectedDateLabel,
    selectedDatePopoverArrowStyle,
    selectedDatePopoverStyle,
    selectedDateState,
    showLoadingSkeleton,
    handleDatePressEnd,
    handleDatePressStart,
    resetDatePopoverAutoHide,
    selectDate,
    wateringDoseRows,
    setWateringDose
  }
}
