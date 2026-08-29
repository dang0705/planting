<template>
  <Layout title="养护日历" background-class="bg-[#F8F6F0]">
    <view class="min-h-screen bg-[#F8F6F0]">
      <!-- 天气预报 -->
      <view
        class="px-4 py-6 text-white"
        style="background: linear-gradient(135deg, #52b788, #2d7a4f)"
      >
        <view class="flex items-center justify-between mb-4">
          <view>
            <text class="block text-2xl font-bold mb-1">{{ weather.current?.temp ?? '--' }}°C</text>
            <text class="block text-sm opacity-90">{{
              weather.current?.desc || '暂无天气数据'
            }}</text>
          </view>
          <text class="text-5xl">{{ weather.current?.icon || '—' }}</text>
        </view>

        <!-- 7天预报 -->
        <view v-if="weather.forecast.length" class="flex gap-2 overflow-x-auto">
          <view
            v-for="day in weather.forecast"
            :key="day.date"
            class="flex-shrink-0 bg-white/20 rounded-2xl px-3 py-2 text-center"
          >
            <text class="block text-xs opacity-80 mb-1">{{ day.weekday }}</text>
            <text class="block text-lg mb-1">{{ day.icon }}</text>
            <text class="block text-xs font-semibold">{{ day.temp }}°</text>
          </view>
        </view>
        <text v-else-if="weatherLoading" class="block text-xs opacity-80">正在读取天气...</text>
        <text v-else class="block text-xs opacity-80">设置养护位置后显示天气参考</text>
      </view>

      <!-- 二十四节气 -->
      <view class="px-4 py-4 bg-white">
        <view class="flex items-center justify-between">
          <view class="flex items-center">
            <text class="text-2xl mr-2">🌾</text>
            <view>
              <text class="block text-base font-semibold text-gray-900">{{
                currentSolarTerm.name
              }}</text>
              <text class="block text-xs text-gray-600">{{ currentSolarTerm.date }}</text>
            </view>
          </view>
          <text
            id="calendar-solar-term-details"
            class="text-xs text-primary"
            @click="viewSolarTerms"
            >查看全部</text
          >
        </view>
        <text class="block text-sm text-gray-700 mt-3">{{ currentSolarTerm.tip }}</text>
      </view>

      <CalendarTaskSection
        :loading-plants="loadingPlants"
        :today-tasks="todayTasks"
        :undoable-tasks="undoableTasks"
        :action-state="actionState"
        @complete="completeTask"
        @postpone="postponeTask"
        @undo="undoTask"
      />

      <!-- 种植计划 -->
      <view class="px-4 pb-20">
        <view class="flex items-center justify-between mb-3">
          <text class="block text-lg font-bold text-gray-900">🌱 我的植物</text>
          <button
            id="calendar-add-plant-button"
            class="bg-primary text-white text-sm px-4 py-2 rounded-full"
            @click="addPlan"
          >
            + 添加
          </button>
        </view>

        <view
          v-if="plantStore.userPlants.length === 0"
          class="bg-white rounded-2xl p-6 text-center"
        >
          <text class="block text-4xl mb-2">🪴</text>
          <text class="block text-sm text-gray-600 mb-4">还没有种植计划</text>
          <button
            id="calendar-empty-add-plant-button"
            class="bg-primary text-white text-sm px-6 py-2 rounded-full"
            @click="addPlan"
          >
            添加第一株植物
          </button>
        </view>

        <view
          v-for="plan in plantStore.userPlants"
          :key="plan.id"
          class="bg-white rounded-2xl p-4 mb-3 shadow-sm"
          :id="`calendar-plant-plan-${plan.id}`"
          @click="viewPlanDetail(plan)"
        >
          <view class="flex items-center justify-between mb-2">
            <text class="block text-base font-semibold text-gray-900">{{ plan.plantName }}</text>
            <text class="text-xs text-gray-500">{{ formatPlantingAge(plan.plantDate) }}</text>
          </view>

          <view class="flex items-center gap-2 mb-3">
            <view class="bg-gray-100 px-2 py-1 rounded">
              <text class="text-xs text-gray-700">{{ plan.location }}</text>
            </view>
            <view class="px-2 py-1 rounded" :class="resolveHealthStatusPresentation(plan.healthStatus).className">
              <text class="text-xs">{{ resolveHealthStatusPresentation(plan.healthStatus).label }}</text>
            </view>
          </view>

          <text v-if="plan.notes" class="block text-sm text-gray-600">{{ plan.notes }}</text>
        </view>
      </view>
    </view>
  </Layout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import Layout from '@/Layout.vue'
import { getWeatherInfo } from '@/api/weather.js'
import { saveWateringReminder } from '@/api/plants-http.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import CalendarTaskSection from './CalendarTaskSection.vue'
import {
  SOLAR_TERMS,
  addDays,
  dateText,
  formatPlantingAge,
  normalizeForecast,
  resolveHealthStatusPresentation,
  resolveWeatherIcon,
  solarTermTip
} from './calendar-helpers.js'

const HTTP_OK = 200
const plantStore = usePlantStore()
const userStore = useUserStore()
const loadingPlants = ref(false)
const weatherLoading = ref(false)
const actionState = reactive({})
const undoState = reactive({})

const undoableTasks = computed(() =>
  Object.values(undoState)
    .filter(Boolean)
    .map(item => ({
      plantId: item.plantId,
      plantName: item.plantName,
      actionLabel: item.actionLabel
    }))
)

// 天气数据
const weather = ref({
  current: null,
  forecast: []
})

// 当前节气
const currentSolarTerm = ref({
  name: '当前节气',
  date: '',
  tip: '根据今天的日期显示节气养护提示。'
})
const nextSolarTerm = ref(null)

onMounted(async () => {
  getSolarTermData()
  await Promise.all([loadUserPlants(), getWeatherData()])
})

const todayTasks = computed(() => {
  const today = dateText(new Date())
  return plantStore.userPlants.flatMap(plant => {
    const reminder = plant?.wateringReminder
    const nextDate = String(reminder?.nextWaterDate || reminder?.nextTime || '').slice(0, 10)
    if (!reminder?.nextTime || !nextDate || nextDate > today) {
      return []
    }
    return [
      {
        id: `water-${plant.id}`,
        plantId: plant.id,
        plantName: plant.displayName || plant.canonicalName || '我的植物',
        location: plant.location || '未设置位置',
        type: 'water',
        saving: Boolean(actionState[plant.id])
      }
    ]
  })
})

async function loadUserPlants() {
  if (loadingPlants.value) {
    return
  }
  if (!(await userStore.ensureLogin())) {
    return
  }
  loadingPlants.value = true
  try {
    await plantStore.getUserPlants(1, 50)
  } finally {
    loadingPlants.value = false
  }
}

async function getWeatherData() {
  const { latitude, longitude, city, province } = userStore.location || {}
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return
  }
  weatherLoading.value = true
  try {
    const result = await getWeatherInfo({
      lat: Number(latitude),
      lng: Number(longitude),
      city,
      province
    })
    if (!result || result.isFallback) {
      return
    }
    weather.value = {
      current: {
        temp: Number(result.temperature ?? result.temp),
        desc: String(result.weather || result.condition?.text || '天气正常'),
        icon: resolveWeatherIcon(result.weather || result.condition?.text)
      },
      forecast: normalizeForecast(result.forecast || result.forecastDays)
    }
  } catch (error) {
    console.warn('[calendar] weather unavailable', error)
  } finally {
    weatherLoading.value = false
  }
}

function getSolarTermData(now = new Date()) {
  const year = now.getFullYear()
  const terms = SOLAR_TERMS.map(([name, month, day]) => ({
    name,
    month,
    day,
    timestamp: new Date(year, month - 1, day).getTime()
  }))
  const today = now.getTime()
  let currentIndex = terms.length - 1
  for (let index = 0; index < terms.length; index += 1) {
    if (terms[index].timestamp <= today) {
      currentIndex = index
    }
  }
  const current = terms[currentIndex]
  const next = terms[(currentIndex + 1) % terms.length]
  currentSolarTerm.value = {
    name: current.name,
    date: `${current.month}月${current.day}日`,
    tip: solarTermTip(current.name)
  }
  nextSolarTerm.value = {
    name: next.name,
    date: `${next.month}月${next.day}日`
  }
}

function viewSolarTerms() {
  uni.showModal({
    title: '节气提醒',
    content: `${currentSolarTerm.value.name}：${currentSolarTerm.value.tip}\n下一个节气：${nextSolarTerm.value?.name || '待更新'} ${nextSolarTerm.value?.date || ''}`,
    showCancel: false,
    confirmText: '知道了'
  })
}

async function completeTask(plantId) {
  if (actionState[plantId]) {
    return
  }
  const plant = plantStore.userPlants.find(item => item.id === plantId)
  if (!plant) {
    uni.showToast({ title: '未找到可完成的任务', icon: 'none' })
    return
  }
  captureTaskSnapshot(plant, '完成')
  actionState[plantId] = true
  try {
    const result = await plantStore.completeWatering(plantId)
    if (!result.success) {
      throw new Error(result.message || '任务保存失败')
    }
    reportAnalyticsEvent(ANALYTICS_EVENTS.WATERING_RECORDED)
    uni.showToast({ title: '任务已完成', icon: 'success' })
    await loadUserPlants()
  } catch {
    uni.showToast({ title: '暂时无法完成任务，请检查网络后重试', icon: 'none' })
  } finally {
    delete actionState[plantId]
  }
}

async function postponeTask(plantId) {
  if (actionState[plantId]) {
    return
  }
  const plant = plantStore.userPlants.find(item => item.id === plantId)
  const reminder = plant?.wateringReminder
  if (!plant || !reminder) {
    uni.showToast({ title: '未找到可推迟的提醒', icon: 'none' })
    return
  }
  captureTaskSnapshot(plant, '推迟')
  actionState[plantId] = true
  try {
    const nextWaterDate = dateText(addDays(new Date(), 1))
    const response = await saveWateringReminder(
      buildReminderSavePayload({
        plantId,
        planId: reminder.planId || `watering-${plantId}`,
        lastWatered: reminder.lastWatered || '',
        nextWaterDate,
        wateringEvents: Array.isArray(reminder.wateringEvents) ? reminder.wateringEvents : [],
        plannerResult: reminder.plannerResult || {},
        calendarPayload: reminder.calendarPayload || null
      })
    )
    if (response?.code !== HTTP_OK || !response.data) {
      throw new Error(response?.message || '推迟失败')
    }
    uni.showToast({ title: '已推迟到明天', icon: 'none' })
    await loadUserPlants()
  } catch {
    uni.showToast({ title: '暂时无法推迟提醒，请检查网络后重试', icon: 'none' })
  } finally {
    delete actionState[plantId]
  }
}

function cloneSnapshot(value) {
  if (value === null || value === undefined) {
    return value
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function captureTaskSnapshot(plant, actionLabel) {
  undoState[plant.id] = {
    plantId: plant.id,
    plantName: plant.displayName || plant.canonicalName || '我的植物',
    actionLabel,
    lastWatered: plant.lastWatered ?? null,
    nextWater: plant.nextWater ?? null,
    reminder: cloneSnapshot(plant.wateringReminder)
  }
}

async function undoTask(plantId) {
  if (actionState[plantId]) {
    return
  }
  const snapshot = undoState[plantId]
  if (!snapshot) {
    return
  }
  actionState[plantId] = true
  try {
    const reminder = snapshot.reminder
    if (reminder) {
      const nextWaterDate = String(reminder.nextWaterDate || reminder.nextTime || '').slice(0, 10)
      if (!nextWaterDate) {
        throw new Error('原提醒日期不可恢复')
      }
      const response = await saveWateringReminder(
        buildReminderSavePayload({
          plantId,
          planId: reminder.planId || `watering-${plantId}`,
          lastWatered: reminder.lastWatered || '',
          nextWaterDate,
          nextTime: reminder.nextTime || `${nextWaterDate}T09:00:00`,
          wateringEvents: Array.isArray(reminder.wateringEvents) ? reminder.wateringEvents : [],
          plannerResult: reminder.plannerResult || {},
          calendarPayload: reminder.calendarPayload || null
        })
      )
      if (response?.code !== HTTP_OK || !response.data) {
        throw new Error(response?.message || '原提醒不可恢复')
      }
    }
    const restored = await plantStore.updateUserPlant(plantId, {
      lastWatered: snapshot.lastWatered,
      nextWater: snapshot.nextWater
    })
    if (!restored.success) {
      throw new Error(restored.message || '植物状态不可恢复')
    }
    delete undoState[plantId]
    uni.showToast({ title: '已撤销本次操作', icon: 'success' })
    await loadUserPlants()
  } catch {
    uni.showToast({ title: '暂时无法撤销本次操作，请检查网络后重试', icon: 'none' })
  } finally {
    delete actionState[plantId]
  }
}

function buildReminderSavePayload({
  plantId,
  planId,
  lastWatered,
  nextWaterDate,
  nextTime = null,
  wateringEvents,
  plannerResult,
  calendarPayload
}) {
  return {
    plantId,
    planId,
    lastWatered,
    nextWaterDate,
    nextWaterTime: '09:00:00',
    nextTime: nextTime || `${nextWaterDate}T09:00:00`,
    wateringEvents,
    plannerResult: { ...plannerResult, planId },
    calendarPayload
  }
}

function addPlan() {
  uni.navigateTo({ url: '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create' })
}

function viewPlanDetail(plan) {
  if (!plan?.id) {
    return
  }
  uni.navigateTo({
    url: `/subpackages/plant/user-plant-detail/user-plant-detail?mode=view&id=${plan.id}`
  })
}

</script>

<style scoped>
/* 使用 Tailwind CSS */
</style>
