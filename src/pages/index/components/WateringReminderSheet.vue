<template>
  <view>
    <BottomSheet
      ref="popupRef"
      panel-id="watering-reminder-sheet"
      content-id="watering-reminder-sheet-content"
      close-id="watering-reminder-close-button"
      confirm-id="watering-reminder-confirm-button"
      title="添加浇水提醒"
      :confirm-text="addToCalendarText"
      loading-text="计算中..."
      show-confirm
      :mask-click="!loading"
      :confirm-loading="loading"
      :confirm-disabled="!canAddToCalendar"
      :on-confirm="addToCalendar"
      @change="onPopupChange"
    >
      <view
        id="watering-reminder-last-watering-row"
        class="mt-2 flex items-center rounded-[14px] border border-[#e8efeb] bg-white p-4"
        @click="openLastWateringPicker"
      >
        <view class="flex size-11 items-center justify-center rounded-full bg-[#e8f5f0]">
          <image :src="waterDefaultIcon" class="size-5" mode="aspectFit" />
        </view>
        <view class="ml-3 flex-1">
          <text class="block text-[15px] font-semibold text-[#1d2a23]">上次浇水</text>
          <text class="mt-0.5 block text-[13px] text-[#5a7868]">{{ lastWateringText }}</text>
          <text class="mt-0.5 block text-[11px] text-[#8a9690]">用于校准下次浇水日期</text>
        </view>
        <text class="text-[20px] text-[#8a9690]">›</text>
      </view>

      <view class="mt-2">
        <view class="flex items-center justify-between">
          <text class="text-[13px] font-semibold text-[#53645a]">补填信息</text>
          <text class="text-[12px] text-[#8a978e]">用于修正光照与盆土水分衰减</text>
        </view>
        <view
          id="watering-reminder-pot-profile-row"
          class="mt-1.5 flex items-center rounded-[14px] border border-[#e1e9dd] p-3"
          @click="openPotProfileEditor"
        >
          <view class="flex-1">
            <text class="block text-[14px] font-semibold text-[#1f2933]">盆形信息</text>
            <text class="mt-0.5 block text-[12px] text-[#718075]">{{ potProfileSummary }}</text>
          </view>
          <text class="text-[20px] text-[#94a39a]">›</text>
        </view>
      </view>

      <view
        class="mt-3 rounded-[14px] border p-4"
        :class="
          isOverWateringBlocked ? 'border-[#f2d99a] bg-[#fff3e0]' : 'border-[#d7e6dc] bg-[#f8faf9]'
        "
      >
        <text class="block text-[12px] text-[#5a7868]">{{
          isOverWateringBlocked ? '过浇警示' : '建议下次浇水'
        }}</text>
        <view class="mt-1 flex items-center justify-between">
          <text
            class="text-[20px] font-semibold"
            :class="isOverWateringBlocked ? 'text-[#e65100]' : 'text-[#1d2a23]'"
          >
            {{ nextWaterDisplay }}
          </text>
          <view
            v-if="hasWeatherRef"
            class="rounded-[11px] border border-[#f2d99a] bg-[#fff7df] px-2 py-0.5"
          >
            <text class="text-[11px] text-[#d88900]">已参考天气</text>
          </view>
        </view>
        <text v-if="plannerResult?.nextWaterReason" class="mt-1 block text-[12px] text-[#5a7868]">
          {{ plannerResult.nextWaterReason }}
        </text>
        <view v-if="plannerSummaryRows.length" class="mt-2 border-t border-gray-200/50 pt-2">
          <view
            v-for="row in plannerSummaryRows"
            :key="row.label"
            class="flex items-center justify-between"
          >
            <text class="text-xs text-gray-500">{{ row.label }}</text>
            <text :class="row.valueClass">{{ row.value }}</text>
          </view>
        </view>
        <view v-if="plannerResult?.reasonCodes?.length" class="mt-2 flex flex-wrap gap-1">
          <text
            v-for="code in plannerResult.reasonCodes"
            :key="code"
            v-show="reasonCodeLabel(code)"
            class="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-gray-500"
          >
            {{ reasonCodeLabel(code) }}
          </text>
        </view>
      </view>

      <SavedWateringReminderState v-if="savedReminderActive" :display="savedReminderDisplay" />
    </BottomSheet>

    <BottomSheet
      ref="datePickerPopupRef"
      panel-id="watering-date-picker-sheet"
      content-id="watering-date-picker-content"
      close-id="watering-date-picker-close-button"
      title="选择浇水日期"
      subtitle="勾选最近 10 天内的浇水日期，用于计算浇水频率与建议下次浇水时间"
      height-mode="fullHeight"
    >
      <view class="pt-1">
        <CareBehaviorTimeline
          id-prefix="home-watering"
          :sticky="true"
          :timeline="timelineInput"
          :enable-dose-per-date="true"
          :pot-volume-ml="potVolumeMl"
          @change="onTimelineChange"
        />
      </view>
      <template #confirm>
        <view class="flex gap-3">
          <button
            class="m-0 flex-1 rounded-[10px] border border-gray-200 bg-white py-2.5 text-sm text-gray-700 after:border-0"
            hover-class="none"
            @click="closeDatePicker"
          >
            取消
          </button>
          <button
            class="m-0 flex-1 rounded-[10px] bg-[#2d7a4f] py-2.5 text-sm font-medium text-white after:border-0"
            hover-class="none"
            @click="confirmDatePicker"
          >
            确认
          </button>
        </view>
      </template>
    </BottomSheet>

    <PotProfileEditor ref="potProfileEditorRef" :plant="props.plant" @saved="onPotProfileSaved" />
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BottomSheet from '@/components/common/BottomSheet.vue'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import { fetchWateringReminder, saveWateringReminder } from '@/api/plants-http.js'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import waterDefaultIcon from '@/assets/icons/home-card-water-default.svg'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { estimatePotVolumeMl, formatMlRangeToBottleText } from '@/utils/water-volume-format.js'
import PotProfileEditor from './PotProfileEditor.vue'
import SavedWateringReminderState from './SavedWateringReminderState.vue'
import {
  addPhoneCalendar,
  attachPlanIdToWateringEvents,
  buildPlannerSummaryRows,
  buildPotProfileSummary,
  buildReminderNextTime,
  buildSavedReminderDisplay,
  buildWateringReminderInputSignature,
  buildWateringReminderCalendarPayload,
  buildWateringReminderSavePayload,
  fetchWateringPlannerResult,
  isWateringReminderActive,
  normalizeSavedReminderPlannerResult,
  reasonCodeLabel,
  resolveLastWateringDate,
  resolvePlantDisplayName,
  resolveWeatherLocation,
  todayStr
} from './watering-reminder-options.js'

const props = defineProps({ plant: { type: Object, default: null } })
const emit = defineEmits(['close'])
const plantStore = usePlantStore()
const plantingStore = usePlantingStore()
const userStore = useUserStore()
const popupRef = ref(null)
const datePickerPopupRef = ref(null)
const potProfileEditorRef = ref(null)
const isSheetOpen = ref(false)
const pendingReminderReload = ref(false)
const loading = ref(false)
const reminderLoading = ref(false)
const plannerResult = ref(null)
const savedReminder = ref(null)
const savedReminderInputSignature = ref('')
const hasWeatherRef = ref(false)
const weatherDays = ref([])
const forecastDays = ref([])
const environmentWeatherWindow = ref(null)
const weatherLoading = ref(false)
const selectedWateringEvents = ref([])
const savedReminderWateringEvents = computed(() =>
  Array.isArray(savedReminder.value?.wateringEvents) ? savedReminder.value.wateringEvents : []
)
const potVolumeMl = computed(
  () => plannerResult.value?.potVolumeMl || estimatePotVolumeMl(props.plant?.potProfile)
)
// D0 注入契约：locationKey 统一从 plant.careLocation.locationKey 读取，
// 用于后端从 day file latestSample 注入当日天气；缺失时 todayWeatherSource='missing'。
const plannerLocationKey = computed(() => {
  const fromPlant =
    props.plant?.careLocation?.locationKey || props.plant?.locationKey || ''
  const fromWindow =
    environmentWeatherWindow.value?.locationKey ||
    environmentWeatherWindow.value?.location?.locationKey ||
    ''
  return String(fromPlant || fromWindow || '').trim()
})
const plannerTimezone = computed(() => {
  const fromWindow =
    environmentWeatherWindow.value?.location?.timezone ||
    environmentWeatherWindow.value?.meta?.timezone ||
    ''
  return String(fromWindow || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
})
const potProfileSummary = computed(() => {
  return buildPotProfileSummary(props.plant?.potProfile)
})
const initialWateringEvents = computed(() =>
  Array.isArray(props.plant?.wateringEvents) ? props.plant.wateringEvents : []
)
const timelineInput = computed(() => {
  const base = { reference_date: todayStr(), watering_events_10d: initialWateringEvents.value }
  return environmentWeatherWindow.value
    ? mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(base, environmentWeatherWindow.value)
    : base
})
const selectedWateringEventsForPlanner = computed(() =>
  selectedWateringEvents.value.length
    ? selectedWateringEvents.value
    : savedReminderWateringEvents.value.length
      ? savedReminderWateringEvents.value
      : initialWateringEvents.value
)
const lastWateringText = computed(
  () => resolveLastWateringDate(selectedWateringEventsForPlanner.value) || '尚无记录'
)
const isOverWateringBlocked = computed(
  () => plannerResult.value?.wateringContext === 'likely_too_wet'
)
const savedReminderActive = computed(() => isWateringReminderActive(savedReminder.value))
const currentReminderInputSignature = computed(() =>
  buildWateringReminderInputSignature({
    lastWatered: lastWateringText.value === '尚无记录' ? '' : lastWateringText.value,
    potProfile: props.plant?.potProfile
  })
)
const savedReminderChanged = computed(
  () =>
    savedReminderActive.value &&
    savedReminderInputSignature.value &&
    currentReminderInputSignature.value !== savedReminderInputSignature.value
)
const canAddToCalendar = computed(
  () =>
    (!savedReminderActive.value || savedReminderChanged.value) &&
    !isOverWateringBlocked.value &&
    Boolean(plannerResult.value?.nextWaterDate)
)
const addToCalendarText = computed(() =>
  savedReminderActive.value && !savedReminderChanged.value
    ? '已添加到手机日历'
    : isOverWateringBlocked.value
      ? '近期过浇，暂不安排浇水'
      : '添加到手机日历'
)
const savedReminderDisplay = computed(() => buildSavedReminderDisplay(savedReminder.value))
const nextWaterDisplay = computed(() => {
  if (!plannerResult.value?.nextWaterDate) {
    return plannerResult.value?.wateringContext === 'likely_too_wet'
      ? '建议暂停浇水'
      : '请先选择浇水记录'
  }
  return plannerResult.value.nextWaterDate
})
const amountBottleText = computed(() => {
  // 前端负责单位换算，不依赖后端 amountBottleText
  if (Array.isArray(plannerResult.value?.amountRangeMl)) {
    return formatMlRangeToBottleText(plannerResult.value.amountRangeMl)
  }
  return ''
})
const plannerSummaryRows = computed(() => {
  return buildPlannerSummaryRows({
    plannerResult: plannerResult.value,
    amountBottleText: amountBottleText.value,
    isOverWateringBlocked: isOverWateringBlocked.value,
    potVolumeMl: potVolumeMl.value
  })
})

function currentPlantId() {
  return props.plant?.id === undefined || props.plant?.id === null ? '' : String(props.plant.id)
}
function resetReminderState() {
  selectedWateringEvents.value = []
  plannerResult.value = null
  savedReminder.value = null
  savedReminderInputSignature.value = ''
  hasWeatherRef.value = false
  weatherDays.value = []
  forecastDays.value = []
  environmentWeatherWindow.value = null
}
async function loadWeatherDays() {
  // D0 与 forecast 必须同源：优先用 plant.careLocation 拉 weather window，
  // 否则会出现 D0 用 plant location、forecast 用 user GPS 的拼接错位， corrupting humidity/rain/temp 摘要。
  // plant 无 careLocation 时 fallback 到 userStore.location（此时 D0 也用 user location，保持同源）。
  const plantCareLocation = props.plant?.careLocation || null
  const plantLocationSource = plantCareLocation
    ? {
        latitude: plantCareLocation.lat ?? plantCareLocation.latitude,
        longitude: plantCareLocation.lng ?? plantCareLocation.longitude,
        city: plantCareLocation.city || '',
        province: plantCareLocation.province || '',
        locationKey: plantCareLocation.locationKey || ''
      }
    : userStore.location
  const location = resolveWeatherLocation(plantLocationSource)
  if (!location) {
    hasWeatherRef.value = false
    weatherDays.value = []
    return
  }
  weatherLoading.value = true
  try {
    const window = await getEnvironmentWeatherWindow({
      ...location,
      // 透传 plant careLocation 的 locationKey，让后端用同一 key 解析 D0 day file
      ...(plantLocationSource.locationKey
        ? { locationKey: plantLocationSource.locationKey }
        : {}),
      diagnosisDate: todayStr(),
      mode: 'environment'
    })
    environmentWeatherWindow.value = window || null
    weatherDays.value = window?.historicalDays || window?.historical_days || []
    forecastDays.value = window?.forecastDays || window?.forecast_days || []
    hasWeatherRef.value = weatherDays.value.length > 0 || forecastDays.value.length > 0
  } finally {
    weatherLoading.value = false
  }
}
async function open() {
  isSheetOpen.value = true
  callComponentMethod(popupRef, 'open')
  await nextTick()
  await loadSavedReminder()
}
const close = () => callComponentMethod(popupRef, 'close')
function onPopupChange(event) {
  if (!event.show) {
    isSheetOpen.value = false
    emit('close')
    return
  }
  isSheetOpen.value = true
}
async function openLastWateringPicker() {
  callComponentMethod(datePickerPopupRef, 'open')
  if (!environmentWeatherWindow.value && !weatherLoading.value) {
    await loadWeatherDays()
  }
}
const closeDatePicker = () => callComponentMethod(datePickerPopupRef, 'close')
function onTimelineChange(payload) {
  selectedWateringEvents.value = payload?.watering_events_10d || []
}
async function confirmDatePicker() {
  callComponentMethod(datePickerPopupRef, 'close')
  await nextTick()
  await fetchPlanner()
}
async function loadSavedReminder() {
  const plantId = props.plant?.id
  const requestedPlantId = currentPlantId()
  if (!requestedPlantId) {
    return
  }
  if (reminderLoading.value) {
    pendingReminderReload.value = true
    return
  }
  reminderLoading.value = true
  try {
    const response = await fetchWateringReminder(plantId)
    if (currentPlantId() !== requestedPlantId) {
      pendingReminderReload.value = true
      return
    }
    const reminder = response?.code === 200 ? response.data : null
    if (isWateringReminderActive(reminder)) {
      savedReminder.value = reminder
      plannerResult.value = normalizeSavedReminderPlannerResult(reminder)
      selectedWateringEvents.value = Array.isArray(reminder.wateringEvents)
        ? reminder.wateringEvents
        : []
      savedReminderInputSignature.value = currentReminderInputSignature.value
      mirrorSavedReminder(reminder)
      return
    }
    savedReminder.value = null
  } catch (error) {
    console.warn('读取浇水提醒失败:', error)
  } finally {
    reminderLoading.value = false
    if (pendingReminderReload.value && isSheetOpen.value) {
      pendingReminderReload.value = false
      await nextTick()
      await loadSavedReminder()
    } else if (!isSheetOpen.value) {
      pendingReminderReload.value = false
    }
  }
}
async function fetchPlanner() {
  if (!props.plant?.id) {
    return
  }
  loading.value = true
  try {
    const result = await fetchWateringPlannerResult({
      plantId: props.plant.id,
      wateringEvents: selectedWateringEventsForPlanner.value,
      weatherDays: weatherDays.value,
      forecastDays: forecastDays.value,
      locationKey: plannerLocationKey.value,
      timezone: plannerTimezone.value
    })
    if (result) {
      plannerResult.value = result
    }
  } catch (error) {
    uni.showToast({ title: error?.message || '建议计算失败，请重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}
const openPotProfileEditor = () => callComponentMethod(potProfileEditorRef, 'open')
const onPotProfileSaved = () => fetchPlanner()
function mirrorSavedReminder(reminder) {
  plantStore.applyWateringReminder(props.plant.id, reminder)
  plantingStore.setPlantReminder({
    plantId: props.plant.id,
    plantName: resolvePlantDisplayName(props.plant),
    type: 'water',
    nextTime: reminder.nextTime || buildReminderNextTime(reminder.nextWaterDate),
    intervalDays: plannerResult.value?.nextWaterWindow?.[0] || 0,
    repeat: false
  })
}
async function addToCalendar() {
  if (!canAddToCalendar.value || !props.plant?.id) {
    return
  }
  const nextWaterDate = plannerResult.value.nextWaterDate
  const calendarPayload = buildWateringReminderCalendarPayload({
    plant: props.plant,
    nextWaterDate,
    amountText: amountBottleText.value,
    reasonText: plannerResult.value?.nextWaterReason || ''
  })
  loading.value = true
  try {
    await addPhoneCalendar(calendarPayload)
    const planId = plannerResult.value?.planId || `calendar_${Date.now()}`
    const wateringEvents = attachPlanIdToWateringEvents(
      selectedWateringEventsForPlanner.value,
      planId
    )
    const response = await saveWateringReminder(
      buildWateringReminderSavePayload({
        plantId: props.plant.id,
        planId,
        lastWatered: lastWateringText.value === '尚无记录' ? '' : lastWateringText.value,
        nextWaterDate,
        wateringEvents,
        plannerResult: plannerResult.value,
        calendarPayload
      })
    )
    if (response?.code !== 200 || !response.data) {
      throw new Error(response?.message || '应用内提醒保存失败')
    }
    savedReminder.value = response.data
    savedReminderInputSignature.value = currentReminderInputSignature.value
    mirrorSavedReminder(response.data)
    await new Promise(resolve => {
      uni.showModal({
        title: '提醒已添加',
        content: '提醒已添加，后续修改请到系统日历中操作。',
        showCancel: false,
        success: resolve,
        fail: resolve
      })
    })
    close()
  } catch (error) {
    uni.showToast({
      title: error?.message || '添加失败，请重试',
      icon: 'none'
    })
  } finally {
    loading.value = false
  }
}
watch(
  () => props.plant?.id,
  async newPlantId => {
    resetReminderState()
    if (newPlantId && isSheetOpen.value) {
      await nextTick()
      await loadSavedReminder()
    }
  }
)
defineExpose({ open, close })
</script>
