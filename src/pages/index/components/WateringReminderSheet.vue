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
          class="mt-1.5 flex items-center rounded-[14px] border border-[#e1e9dd] bg-[#f7faf5] p-3"
          @click="openPotProfileEditor"
        >
          <view class="flex-1">
            <text class="block text-[14px] font-semibold text-[#1f2933]">盆形信息</text>
            <text class="mt-0.5 block text-[12px] text-[#718075]">{{ potProfileSummary }}</text>
          </view>
          <view class="mr-2 rounded-[12px] border border-[#bfd9c5] bg-white px-2 py-0.5">
            <text class="text-[12px] text-[#2f8f57]">补填</text>
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
    </BottomSheet>

    <BottomSheet
      ref="datePickerPopupRef"
      panel-id="watering-date-picker-sheet"
      content-id="watering-date-picker-content"
      close-id="watering-date-picker-close-button"
      title="选择浇水日期"
      subtitle="勾选最近 10 天内的浇水日期，用于计算浇水频率与建议下次浇水时间"
      @change="onDatePickerChange"
    >
      <view class="pt-1">
        <CareBehaviorTimeline
          id-prefix="home-watering"
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
import BottomSheet from '@/components/diagnose-popup/BottomSheet.vue'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import { requestHttpFunction } from '@/api/http'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import waterDefaultIcon from '@/assets/icons/home-card-water-default.svg'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import {
  estimatePotVolumeMl,
  formatMlRangeToBottleText,
  formatMlToBottleText
} from '@/utils/water-volume-format.js'
import PotProfileEditor from './PotProfileEditor.vue'
import {
  REASON_CODE_LABEL_MAP,
  SUBSTRATE_LABEL_MAP,
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
const loading = ref(false)
const plannerResult = ref(null)
const hasWeatherRef = ref(false)
const weatherDays = ref([])
const forecastDays = ref([])
const environmentWeatherWindow = ref(null)
const weatherLoading = ref(false)
const selectedWateringEvents = ref([])
const potVolumeMl = computed(
  () => plannerResult.value?.potVolumeMl || estimatePotVolumeMl(props.plant?.potProfile)
)
const potProfileSummary = computed(() => {
  const profile = props.plant?.potProfile
  if (!profile) {
    return '点击补充盆型信息'
  }
  const parts = []
  if (profile.potTopDiameterCm) {
    parts.push(`口径 ${profile.potTopDiameterCm}cm`)
  }
  parts.push(profile.hasDrainageHole === 'true' ? '有排水孔' : '无/不确定排水孔')
  const composition = parseComposition(profile)
  if (composition?.length) {
    parts.push(
      composition.map(item => SUBSTRATE_LABEL_MAP[item.material] || item.material).join('+')
    )
  }
  return parts.join(' · ')
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
  selectedWateringEvents.value.length ? selectedWateringEvents.value : initialWateringEvents.value
)
const lastWateringText = computed(() => {
  const sorted = [...selectedWateringEventsForPlanner.value].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
  )
  return sorted[0]?.date || '尚无记录'
})
const isOverWateringBlocked = computed(
  () => plannerResult.value?.wateringContext === 'likely_too_wet'
)
const canAddToCalendar = computed(
  () => !isOverWateringBlocked.value && Boolean(plannerResult.value?.nextWaterDate)
)
const addToCalendarText = computed(() =>
  isOverWateringBlocked.value ? '近期过浇，暂不安排浇水' : '添加到手机日历'
)
const nextWaterDisplay = computed(() => {
  if (!plannerResult.value?.nextWaterDate) {
    return plannerResult.value?.wateringContext === 'likely_too_wet'
      ? '建议暂停浇水'
      : '请先选择浇水记录'
  }
  return plannerResult.value.nextWaterDate
})
const amountBottleText = computed(
  () =>
    plannerResult.value?.amountBottleText ||
    (Array.isArray(plannerResult.value?.amountRangeMl)
      ? formatMlRangeToBottleText(plannerResult.value.amountRangeMl)
      : '')
)
const plannerSummaryRows = computed(() => {
  if (!amountBottleText.value || isOverWateringBlocked.value) {
    return []
  }
  const rows = [
    {
      label: '建议水量',
      value: amountBottleText.value,
      valueClass: 'text-xs font-medium text-gray-700'
    }
  ]
  if (plannerResult.value?.stopCondition) {
    rows.push({
      label: '停止条件',
      value: plannerResult.value.stopCondition,
      valueClass: 'text-xs text-gray-600'
    })
  }
  if (plannerResult.value?.confidenceLevel) {
    rows.push({
      label: '置信度',
      value: { low: '低', normal: '中', high: '高' }[plannerResult.value.confidenceLevel] || '低',
      valueClass: 'text-xs text-gray-600'
    })
  }
  const doseText = resolveDoseText(plannerResult.value?.userDoseEcho)
  if (doseText) {
    rows.push({ label: '你通常浇', value: doseText, valueClass: 'text-xs text-gray-500' })
  }
  return rows
})

function parseComposition(profile) {
  if (profile?.substrateComposition) {
    return profile.substrateComposition
  }
  if (typeof profile?.substrateType !== 'string' || !profile.substrateType.startsWith('[')) {
    return null
  }
  try {
    return JSON.parse(profile.substrateType)
  } catch {
    return null
  }
}
function resolveDoseText(echo) {
  if (!echo) {
    return ''
  }
  const doseClass = typeof echo === 'string' ? echo : echo?.doseClass
  const amountMl = typeof echo === 'object' ? Number(echo?.amountMl) : null
  const ratios = { mist: 0.03, small: 0.1, normal: 0.25, thorough: 0.5 }
  if (doseClass === 'mist') {
    return '喷一喷'
  }
  if (doseClass === 'thorough') {
    return '浇到出水'
  }
  if (doseClass && ratios[doseClass] && potVolumeMl.value > 0) {
    return formatMlToBottleText(
      amountMl > 0 ? amountMl : Math.round(potVolumeMl.value * ratios[doseClass])
    )
  }
  return ''
}
function reasonCodeLabel(code) {
  return REASON_CODE_LABEL_MAP[code] || ''
}
function resolveWeatherLocation() {
  const location = userStore.location || {}
  const lat = Number(location.latitude ?? location.lat)
  const lng = Number(location.longitude ?? location.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
    ? {
        lat,
        lng,
        city: String(location.city || '').trim(),
        province: String(location.province || '').trim()
      }
    : null
}
async function loadWeatherDays() {
  const location = resolveWeatherLocation()
  if (!location) {
    hasWeatherRef.value = false
    weatherDays.value = []
    return
  }
  weatherLoading.value = true
  try {
    const window = await getEnvironmentWeatherWindow({
      ...location,
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
const open = () => callComponentMethod(popupRef, 'open')
const close = () => callComponentMethod(popupRef, 'close')
function onPopupChange(event) {
  if (!event.show) {
    emit('close')
  }
}
async function openLastWateringPicker() {
  callComponentMethod(datePickerPopupRef, 'open')
  if (!environmentWeatherWindow.value && !weatherLoading.value) {
    await loadWeatherDays()
  }
}
const closeDatePicker = () => callComponentMethod(datePickerPopupRef, 'close')
const onDatePickerChange = () => {}
function onTimelineChange(payload) {
  selectedWateringEvents.value = payload?.watering_events_10d || []
}
async function confirmDatePicker() {
  callComponentMethod(datePickerPopupRef, 'close')
  await nextTick()
  await fetchPlanner()
}
async function fetchPlanner() {
  if (!props.plant?.id) {
    return
  }
  loading.value = true
  try {
    const response = await requestHttpFunction('plant-user-http/user-plants/watering-planner', {
      method: 'POST',
      body: {
        plantId: props.plant.id,
        wateringEvents: selectedWateringEventsForPlanner.value,
        referenceDate: todayStr(),
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value
      }
    })
    if (response?.code === 200) {
      plannerResult.value = normalizePlannerResult(response.data)
    }
  } catch (error) {
    uni.showToast({ title: error?.message || '建议计算失败，请重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}
function normalizePlannerResult(data = {}) {
  if (data.nextWaterDate && data.nextWaterDate < todayStr()) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return { ...data, nextWaterDate: todayStrFromDate(tomorrow) }
  }
  return data
}
function todayStrFromDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}
const openPotProfileEditor = () => callComponentMethod(potProfileEditorRef, 'open')
const onPotProfileSaved = () => fetchPlanner()
async function addToCalendar() {
  if (!canAddToCalendar.value || !props.plant?.id) {
    return
  }
  const nextWaterDate = plannerResult.value.nextWaterDate
  const planId = plannerResult.value?.planId || null
  const newEvents = selectedWateringEventsForPlanner.value.map(event => ({ ...event, planId }))
  await plantStore.completeWatering(props.plant.id, { wateringEvents: newEvents, nextWaterDate })
  plantingStore.setPlantReminder({
    plantId: props.plant.id,
    plantName: props.plant.displayName || props.plant.canonicalName || '当前植物',
    type: 'water',
    nextTime: `${nextWaterDate}T09:00:00.000Z`,
    intervalDays: plannerResult.value?.nextWaterWindow?.[0] || 7
  })
  uni.showToast({ title: '已添加浇水提醒', icon: 'success' })
  close()
}
watch(
  () => props.plant?.id,
  () => {
    selectedWateringEvents.value = []
    plannerResult.value = null
    hasWeatherRef.value = false
    weatherDays.value = []
    forecastDays.value = []
    environmentWeatherWindow.value = null
  }
)
defineExpose({ open, close })
</script>
