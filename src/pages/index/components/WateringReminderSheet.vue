<template>
  <view>
    <!-- 浇水提醒底部弹框 -->
    <uni-popup
      ref="popupRef"
      type="bottom"
      :is-mask-click="!loading"
      @change="onPopupChange"
    >
      <view class="watering-reminder-sheet rounded-t-[20px] bg-white pb-[env(safe-area-inset-bottom)]">
        <!-- 拖拽条 -->
        <view class="mx-auto mt-2.5 h-1 w-14 rounded-full bg-gray-300" />

        <!-- 标题区 -->
        <view class="px-5 pt-4">
          <text class="text-lg font-medium text-gray-900">
            浇水提醒
          </text>
        </view>

        <!-- 上次浇水入口 -->
        <view
          class="mx-[15px] mt-[24px] flex items-center rounded-[12px] bg-gray-50 p-4"
          @click="openLastWateringPicker"
        >
          <!-- 图标容器 -->
          <view class="flex size-11 items-center justify-center rounded-full bg-[#e8f5f0]">
            <image
              :src="waterDefaultIcon"
              class="size-5"
              mode="aspectFit"
            />
          </view>
          <view class="ml-3 flex-1">
            <text class="block text-sm font-medium text-gray-900">
              上次浇水
            </text>
            <text class="mt-0.5 block text-sm text-gray-500">
              {{ lastWateringText }}
            </text>
            <text class="mt-0.5 block text-xs text-gray-400">
              选择最近 10 天的浇水记录
            </text>
          </view>
          <text class="text-lg text-gray-400">›</text>
        </view>

      <!-- 建议下次浇水 Summary -->
      <view
        class="mx-[15px] mt-3 rounded-[12px] p-4"
        :class="isOverWateringBlocked ? 'bg-[#fff3e0]' : 'bg-[#f0f9f0]'"
      >
        <text class="block text-xs text-gray-500">
          {{ isOverWateringBlocked ? '过浇警示' : '建议下次浇水' }}
        </text>
        <view class="mt-1 flex items-center justify-between">
          <text
            class="text-xl font-medium"
            :class="isOverWateringBlocked ? 'text-[#e65100]' : 'text-gray-900'"
          >
            {{ nextWaterDisplay }}
          </text>
          <view
            v-if="hasWeatherRef"
            class="rounded-full bg-[#2d7a4f] px-2 py-0.5"
          >
            <text class="text-[11px] text-white">已参考天气</text>
          </view>
        </view>
        <text v-if="plannerResult?.nextWaterReason" class="mt-1 block text-xs text-gray-500">
          {{ plannerResult.nextWaterReason }}
        </text>
      </view>

      <!-- 主操作按钮 -->
      <view class="px-[15px] pt-4">
        <button
          class="m-0 w-full rounded-[10px] py-3 text-sm font-medium text-white after:border-0"
          :class="isOverWateringBlocked ? 'bg-gray-400' : 'bg-[#2d7a4f]'"
          hover-class="none"
          :disabled="loading || !canAddToCalendar"
          @click="addToCalendar"
        >
          {{ loading ? '计算中...' : isOverWateringBlocked ? '近期过浇，暂不安排浇水' : (canAddToCalendar ? '添加至日历' : '添加至日历') }}
        </button>
      </view>

        <view class="h-4" />
      </view>
    </uni-popup>

    <!-- 二级弹框：上次浇水日期选择（与主弹框同级，避免嵌套 uni-popup 无法打开） -->
    <uni-popup
      ref="datePickerPopupRef"
      type="center"
      :is-mask-click="true"
      @change="onDatePickerChange"
    >
      <view class="watering-date-picker mx-5 w-[353px] rounded-[16px] bg-white p-0">
        <!-- 标题区 -->
        <view class="flex items-center justify-between px-5 pt-[18px]">
          <text class="text-lg font-medium text-gray-900">
            选择浇水日期
          </text>
          <view
            class="flex size-7 items-center justify-center rounded-full bg-gray-100"
            @click="closeDatePicker"
          >
            <text class="text-sm text-gray-500">✕</text>
          </view>
        </view>
        <view class="px-5 pt-2">
          <text class="block text-xs leading-4 text-gray-400">
            勾选最近 10 天内的浇水日期，用于计算浇水频率与建议下次浇水时间
          </text>
        </view>

        <!-- 日期选择网格：复用 CareBehaviorTimeline -->
        <view class="px-4 pt-3">
          <CareBehaviorTimeline
            id-prefix="home-watering"
            :timeline="timelineInput"
            @change="onTimelineChange"
          />
        </view>

        <!-- 分隔线 -->
        <view class="mx-5 mt-2 h-px bg-gray-100" />

        <!-- 底部按钮 -->
        <view class="flex gap-3 px-5 py-3">
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
const loading = ref(false)
const plannerResult = ref(null)
const hasWeatherRef = ref(false)
const weatherDays = ref([])
const forecastDays = ref([])
const environmentWeatherWindow = ref(null)
const weatherLoading = ref(false)

// 用户选中的浇水事件集合（来自 CareBehaviorTimeline change emit）
const selectedWateringEvents = ref([])

// 初始已有的事件（从 plant.wateringEvents 恢复）
const initialWateringEvents = computed(() => {
  if (!props.plant?.wateringEvents) return []
  return Array.isArray(props.plant.wateringEvents)
    ? props.plant.wateringEvents
    : []
})

// 传给 CareBehaviorTimeline 的 timeline 数据（合入天气后组件可渲染每日温湿度）
const timelineInput = computed(() => {
  const base = {
    reference_date: todayStr(),
    watering_events_10d: initialWateringEvents.value
  }
  if (!environmentWeatherWindow.value) {
    return base
  }
  return mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(base, environmentWeatherWindow.value)
})

const selectedWateringEventsForPlanner = computed(() => {
  if (selectedWateringEvents.value.length > 0) {
    return selectedWateringEvents.value
  }
  return initialWateringEvents.value
})

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

const isOverWateringBlocked = computed(() => {
  return plannerResult.value?.wateringContext === 'likely_too_wet'
})

const canAddToCalendar = computed(() => {
  if (isOverWateringBlocked.value) {
    return false
  }
  return Boolean(plannerResult.value?.nextWaterDate)
})

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 从 userStore.location 解析天气请求所需的坐标。
 */
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

/**
 * 点击"上次浇水"入口时请求环境天气窗口。
 * 获取后存入 environmentWeatherWindow，timelineInput 会自动合入 weatherByDate 供组件渲染；
 * 同时提取 historicalDays 传给后端 planner 叠加天气信号。
 */
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

async function open() {
  popupRef.value?.open()
  // 不在此处调 fetchPlanner：天气数据尚未加载，planner 算出的结果不准
  // 用户需点击"上次浇水"入口加载天气 + 选择浇水日期后，确认时才调 planner
}

function close() {
  popupRef.value?.close()
}

function onPopupChange(e) {
  if (!e.show) {
    emit('close')
  }
}

async function openLastWateringPicker() {
  datePickerPopupRef.value?.open()
  // 点击"上次浇水"入口时才加载天气数据，用于组件渲染 + planner 天气信号
  if (!environmentWeatherWindow.value && !weatherLoading.value) {
    await loadWeatherDays()
  }
}

function closeDatePicker() {
  datePickerPopupRef.value?.close()
}

function onDatePickerChange(e) {
  // uni-popup change 事件处理，关闭时无需额外操作
}

function onTimelineChange(payload) {
  selectedWateringEvents.value = payload?.watering_events_10d || []
}

async function confirmDatePicker() {
  datePickerPopupRef.value?.close()
  await nextTick()
  await fetchPlanner()
}

async function fetchPlanner() {
  if (!props.plant?.id) return
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
      // Fix 4: 后端已 clamp nextWaterDate 到至少明天，前端额外保险
      const nextWaterDate = response.data?.nextWaterDate
      if (nextWaterDate) {
        const today = todayStr()
        if (nextWaterDate < today) {
          // 如果后端返回过去日期，前端再 clamp 一次
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          response.data.nextWaterDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
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

async function addToCalendar() {
  if (!canAddToCalendar.value || !props.plant?.id) return

  const wateringEvents = selectedWateringEventsForPlanner.value
  const nextWaterDate = plannerResult.value.nextWaterDate

  try {
    // 1. 写回浇水事件集合 + nextWater
    await plantStore.completeWatering(props.plant.id, {
      wateringEvents,
      nextWaterDate
    })

    // 2. 创建 water 提醒
    plantingStore.setPlantReminder({
      plantId: props.plant.id,
      plantName: props.plant.displayName || props.plant.canonicalName || '当前植物',
      type: 'water',
      nextTime: `${nextWaterDate}T09:00:00.000Z`,
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
