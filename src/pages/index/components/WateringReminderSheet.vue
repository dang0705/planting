<template>
  <view>
    <uni-popup ref="popupRef" type="bottom" :is-mask-click="!loading" @change="onPopupChange">
      <view
        class="watering-reminder-sheet rounded-t-[20px] bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <view class="mx-auto mt-2.5 h-1 w-14 rounded-full bg-[#d7e6dc]" />
        <view class="px-5 pt-4">
          <text class="text-[18px] font-semibold text-[#1d2a23]">添加浇水提醒</text>
        </view>

        <view
          id="watering-reminder-last-watering-row"
          class="mx-[15px] mt-[24px] flex items-center rounded-[14px] bg-white border border-[#e8efeb] p-4"
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

        <view class="mx-[15px] mt-2">
          <view class="flex items-center justify-between">
            <text class="text-[13px] font-semibold text-[#53645a]">补填信息</text>
            <text class="text-[12px] text-[#8a978e]">用于修正光照与盆土水分衰减</text>
          </view>
          <view
            id="watering-reminder-pot-profile-row"
            class="mt-1.5 flex items-center rounded-[14px] bg-[#f7faf5] border border-[#e1e9dd] p-3"
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
          class="mx-[15px] mt-3 rounded-[14px] border p-4"
          :class="
            isOverWateringBlocked
              ? 'bg-[#fff3e0] border-[#f2d99a]'
              : 'bg-[#f8faf9] border-[#d7e6dc]'
          "
        >
          <text class="block text-[12px] text-[#5a7868]">{{
            isOverWateringBlocked ? '过浇警示' : '建议下次浇水'
          }}</text>
          <view class="mt-1 flex items-center justify-between">
            <text
              class="text-[20px] font-semibold"
              :class="isOverWateringBlocked ? 'text-[#e65100]' : 'text-[#1d2a23]'"
              >{{ nextWaterDisplay }}</text
            >
            <view
              v-if="hasWeatherRef"
              class="rounded-[11px] border bg-[#fff7df] border-[#f2d99a] px-2 py-0.5"
            >
              <text class="text-[11px] text-[#d88900]">已参考天气</text>
            </view>
          </view>
          <text
            v-if="plannerResult?.nextWaterReason"
            class="mt-1 block text-[12px] text-[#5a7868]"
            >{{ plannerResult.nextWaterReason }}</text
          >
          <view v-if="plannerSummaryRows.length" class="mt-2 border-t border-gray-200/50 pt-2">
            <view
              v-for="(row, index) in plannerSummaryRows"
              :key="row.label"
              class="flex items-center justify-between"
              :class="index > 0 ? 'mt-0.5' : ''"
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
              >{{ reasonCodeLabel(code) }}</text
            >
          </view>
        </view>

        <view class="px-[15px] pt-4">
          <button
            class="m-0 w-full rounded-[10px] py-3 text-[15px] font-medium text-white after:border-0"
            :class="isOverWateringBlocked ? 'bg-gray-400' : 'bg-[#0084d1]'"
            hover-class="none"
            :disabled="loading || !canAddToCalendar"
            @click="addToCalendar"
          >
            {{
              loading
                ? '计算中...'
                : isOverWateringBlocked
                  ? '近期过浇，暂不安排浇水'
                  : '添加到手机日历'
            }}
          </button>
        </view>
        <view class="h-4" />
      </view>
    </uni-popup>

    <uni-popup
      ref="datePickerPopupRef"
      type="center"
      :is-mask-click="true"
      @change="onDatePickerChange"
    >
      <view class="watering-date-picker mx-5 w-[353px] rounded-[16px] bg-white p-0">
        <view class="flex items-center justify-between px-5 pt-[18px]">
          <text class="text-lg font-medium text-gray-900">选择浇水日期</text>
          <view
            class="flex size-7 items-center justify-center rounded-full bg-gray-100"
            @click="closeDatePicker"
          >
            <text class="text-sm text-gray-500">✕</text>
          </view>
        </view>
        <view class="px-5 pt-2">
          <text class="block text-xs leading-4 text-gray-400"
            >勾选最近 10 天内的浇水日期，用于计算浇水频率与建议下次浇水时间</text
          >
        </view>
        <view class="px-4 pt-3">
          <CareBehaviorTimeline
            id-prefix="home-watering"
            :timeline="timelineInput"
            :enable-dose-per-date="true"
            :pot-volume-ml="potVolumeMl"
            @change="onTimelineChange"
          />
        </view>
        <view class="mx-4 mt-2 flex gap-3 pb-3">
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
      </view>
    </uni-popup>

    <PotProfileEditor ref="potProfileEditorRef" :plant="props.plant" @saved="onPotProfileSaved" />
  </view>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { usePlantStore } from '@/store/plants.js'
import { usePlantingStore } from '@/store/planting.js'
import { useUserStore } from '@/store/user.js'
import { requestHttpFunction } from '@/api/http'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import PotProfileEditor from './PotProfileEditor.vue'
import { formatMlRangeToBottleText, estimatePotVolumeMl } from '@/utils/water-volume-format.js'
import waterDefaultIcon from '@/assets/icons/home-card-water-default.svg'

const props = defineProps({
  plant: { type: Object, default: null }
})
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

const substrateLabelMap = {
  general: '田园土',
  coco: '椰糠',
  ceramsite: '陶粒',
  peat: '泥炭土',
  perlite: '珍珠岩',
  bark: '树皮',
  sphagnum: '水苔',
  gritty: '颗粒土',
  coarse_sand: '粗砂'
}

/**
 * 盆体积 ml：优先用 planner 后端精确值，兜底用 potProfile 估算。
 * 日期选择器打开时 planner 可能还没触发，需用 potProfile 兜底让录入侧瓶档即时动态生成。
 */
const potVolumeMl = computed(() => {
  const fromPlanner = plannerResult.value?.potVolumeMl
  if (fromPlanner && fromPlanner > 0) {
    return fromPlanner
  }
  return estimatePotVolumeMl(props.plant?.potProfile)
})

const potProfileSummary = computed(() => {
  const p = props.plant?.potProfile
  if (!p) {
    return '点击补充盆型信息'
  }
  const parts = []
  if (p.potTopDiameterCm) {
    parts.push('口径 ' + p.potTopDiameterCm + 'cm')
  }
  if (p.hasDrainageHole === 'true') {
    parts.push('有排水孔')
  } else {
    parts.push('无/不确定排水孔')
  }
  let composition = p.substrateComposition
  if (!composition && typeof p.substrateType === 'string' && p.substrateType.startsWith('[')) {
    try {
      composition = JSON.parse(p.substrateType)
    } catch {
      composition = null
    }
  }
  if (composition && composition.length) {
    parts.push(composition.map(s => substrateLabelMap[s.material] || s.material).join('+'))
  }
  if (!parts.length) {
    return '点击补充盆型信息'
  }
  return parts.join(' · ')
})

const initialWateringEvents = computed(() =>
  Array.isArray(props.plant?.wateringEvents) ? props.plant.wateringEvents : []
)

const timelineInput = computed(() => {
  const base = { reference_date: todayStr(), watering_events_10d: initialWateringEvents.value }
  if (!environmentWeatherWindow.value) {
    return base
  }
  return mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(base, environmentWeatherWindow.value)
})

const selectedWateringEventsForPlanner = computed(() =>
  selectedWateringEvents.value.length > 0
    ? selectedWateringEvents.value
    : initialWateringEvents.value
)

const lastWateringText = computed(() => {
  const events = selectedWateringEventsForPlanner.value
  if (!events.length) {
    return '尚无记录'
  }
  const sorted = [...events].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
  )
  return sorted[0]?.date || '尚无记录'
})

const nextWaterDisplay = computed(() => {
  if (!plannerResult.value) {
    return '请先选择浇水记录'
  }
  if (plannerResult.value.wateringContext === 'likely_too_wet') {
    return '建议暂停浇水'
  }
  if (!plannerResult.value.nextWaterDate) {
    return '请先选择浇水记录'
  }
  return plannerResult.value.nextWaterDate
})

const isOverWateringBlocked = computed(
  () => plannerResult.value?.wateringContext === 'likely_too_wet'
)
const canAddToCalendar = computed(
  () => !isOverWateringBlocked.value && Boolean(plannerResult.value?.nextWaterDate)
)

const amountBottleText = computed(() => {
  const result = plannerResult.value
  if (!result) {
    return ''
  }
  if (result.amountBottleText) {
    return result.amountBottleText
  }
  if (Array.isArray(result.amountRangeMl)) {
    return formatMlRangeToBottleText(result.amountRangeMl)
  }
  return ''
})

const confidenceLevelLabel = computed(() => {
  const map = { low: '低', normal: '中', high: '高' }
  return map[plannerResult.value?.confidenceLevel] || '低'
})

const confidenceLevelClass = computed(() => {
  const level = plannerResult.value?.confidenceLevel
  if (level === 'high') {
    return 'text-[#2f8f57]'
  }
  if (level === 'normal') {
    return 'text-[#53645a]'
  }
  return 'text-[#e65100]'
})

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
      value: confidenceLevelLabel.value,
      valueClass: 'text-xs ' + confidenceLevelClass.value
    })
  }
  if (plannerResult.value?.userDoseEcho) {
    const echo = plannerResult.value.userDoseEcho
    // 兼容对象 { doseClass, amountMl } 和旧字符串格式
    const doseClass = typeof echo === 'string' ? echo : echo?.doseClass
    const echoMap = {
      unknown: '不确定',
      mist: '喷一喷',
      small: '小半瓶',
      normal: '约一瓶',
      thorough: '浇到出水'
    }
    rows.push({
      label: '你通常浇',
      value: echoMap[doseClass] || '约一瓶',
      valueClass: 'text-xs text-gray-500'
    })
  }
  return rows
})

function reasonCodeLabel(code) {
  const map = {
    OVERWATERING_RISK_WARNING: '可能浇多了',
    CHECK_SOIL_BEFORE_WATERING: '先检查土壤',
    INCREASE_WATERING_FREQUENCY: '该浇水了',
    RECENT_THOROUGH_WATERING: '最近刚浇透',
    STRONG_WET_ENVIRONMENT: '最近天气很湿',
    HOT_DRY_FORECAST: '接下来又热又干',
    NO_RECENT_WATERING: '有一阵没浇了',
    BASELINE_INTERVAL: '按正常节奏来',
    MIST_DOES_NOT_OFFSET_DRY: '喷一下不够，要浇透',
    NO_DRAINAGE_NARROW_BOTTOM: '盆没孔要少浇',
    DRY_SUPPRESSED_BY_WET_ENVIRONMENT: '天气湿，先别急着浇',
    AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL: '上次浇水量记录有出入',
    WET_ENVIRONMENT_AMOUNT_REDUCED: '天气湿，少浇点',
    USER_DOSE_ANCHORED: '参考了你平时的浇水量'
  }
  return map[code] || ''
}

function todayStr() {
  const d = new Date()
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

function resolveWeatherLocation() {
  const location = userStore.location || {}
  const lat = Number(location.latitude ?? location.lat)
  const lng = Number(location.longitude ?? location.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null
  }
  return {
    lat,
    lng,
    city: String(location.city || '').trim(),
    province: String(location.province || '').trim()
  }
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
    if (window) {
      environmentWeatherWindow.value = window
      const histDays = window.historicalDays || window.historical_days || []
      const fcDays = window.forecastDays || window.forecast_days || []
      weatherDays.value = histDays
      forecastDays.value = fcDays
      hasWeatherRef.value = histDays.length > 0 || fcDays.length > 0
    } else {
      weatherDays.value = []
      forecastDays.value = []
      hasWeatherRef.value = false
    }
  } catch (error) {
    console.warn('获取环境天气窗口失败:', error)
    weatherDays.value = []
    forecastDays.value = []
    hasWeatherRef.value = false
  } finally {
    weatherLoading.value = false
  }
}

const open = () => popupRef.value?.open()
const close = () => popupRef.value?.close()

function onPopupChange(e) {
  if (!e.show) {
    emit('close')
  }
}

async function openLastWateringPicker() {
  datePickerPopupRef.value?.open()
  if (!environmentWeatherWindow.value && !weatherLoading.value) {
    await loadWeatherDays()
  }
}

const closeDatePicker = () => datePickerPopupRef.value?.close()

const onDatePickerChange = () => {}

function onTimelineChange(payload) {
  selectedWateringEvents.value = payload?.watering_events_10d || []
}

async function confirmDatePicker() {
  datePickerPopupRef.value?.close()
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
      const nextWaterDate = response.data?.nextWaterDate
      if (nextWaterDate) {
        const today = todayStr()
        if (nextWaterDate < today) {
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          response.data.nextWaterDate =
            tomorrow.getFullYear() +
            '-' +
            String(tomorrow.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(tomorrow.getDate()).padStart(2, '0')
        }
      }
      plannerResult.value = response.data
    }
  } catch (error) {
    console.error('浇水规划器请求失败:', error)
    uni.showToast({ title: '建议计算失败，请重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

const openPotProfileEditor = () => potProfileEditorRef.value?.open()
// 盆型保存已由 store.savePotProfile 乐观更新到 userPlants，这里只需重算浇水建议
const onPotProfileSaved = () => fetchPlanner()

async function addToCalendar() {
  if (!canAddToCalendar.value || !props.plant?.id) {
    return
  }
  const wateringEvents = selectedWateringEventsForPlanner.value
  const nextWaterDate = plannerResult.value.nextWaterDate
  const planId = plannerResult.value?.planId || null
  // 只传本次新增的浇水事件（带 planId 审计追溯），后端逐条 INSERT 到独立事件表
  const newEvents = wateringEvents.map(ev => ({ ...ev, planId }))
  try {
    await plantStore.completeWatering(props.plant.id, { wateringEvents: newEvents, nextWaterDate })
    plantingStore.setPlantReminder({
      plantId: props.plant.id,
      plantName: props.plant.displayName || props.plant.canonicalName || '当前植物',
      type: 'water',
      nextTime: nextWaterDate + 'T09:00:00.000Z',
      intervalDays: plannerResult.value?.nextWaterWindow?.[0] || 7
    })
    uni.showToast({ title: '已添加浇水提醒', icon: 'success' })
    close()
  } catch (error) {
    console.error('添加浇水提醒失败:', error)
    uni.showToast({ title: error.message || '添加失败', icon: 'none' })
  }
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
