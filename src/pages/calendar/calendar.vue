<template>
  <view class="min-h-screen bg-[#F8F6F0]">
    <!-- 天气预报 -->
    <view class="bg-gradient-to-br from-[#52B788] to-primary px-4 py-6 text-white">
      <view class="flex items-center justify-between mb-4">
        <view>
          <text class="block text-2xl font-bold mb-1">{{ weather.current?.temp || '22' }}°C</text>
          <text class="block text-sm opacity-90">{{ weather.current?.desc || '晴' }}</text>
        </view>
        <text class="text-5xl">{{ weather.current?.icon || '🌤️' }}</text>
      </view>

      <!-- 7天预报 -->
      <view class="flex gap-2 overflow-x-auto">
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
    </view>

    <!-- 二十四节气 -->
    <view class="px-4 py-4 bg-white">
      <view class="flex items-center justify-between">
        <view class="flex items-center">
          <text class="text-2xl mr-2">🌾</text>
          <view>
            <text class="block text-base font-semibold text-gray-900">{{ currentSolarTerm.name }}</text>
            <text class="block text-xs text-gray-600">{{ currentSolarTerm.date }}</text>
          </view>
        </view>
        <text class="text-xs text-primary" @click="viewSolarTerms">查看全部</text>
      </view>
      <text class="block text-sm text-gray-700 mt-3">{{ currentSolarTerm.tip }}</text>
    </view>

    <!-- 今日提醒 -->
    <view class="px-4 py-4">
      <text class="block text-lg font-bold text-gray-900 mb-3">📅 今日提醒</text>

      <view v-if="plantingStore.todayReminders.length === 0" class="bg-white rounded-2xl p-6 text-center">
        <text class="block text-4xl mb-2">✨</text>
        <text class="block text-sm text-gray-600">今天没有养护任务</text>
      </view>

      <view
        v-for="reminder in plantingStore.todayReminders"
        :key="reminder.id"
        class="bg-white rounded-2xl p-4 mb-3 shadow-sm"
      >
        <view class="flex items-center justify-between mb-3">
          <view class="flex-1">
            <text class="block text-base font-semibold text-gray-900 mb-1">{{ reminder.plantName }}</text>
            <text class="block text-sm text-gray-600">{{ reminder.location }}</text>
          </view>
          <view class="bg-[#D8F3DC] px-3 py-1 rounded-full">
            <text class="text-xs text-primary font-medium">待完成</text>
          </view>
        </view>

        <view class="flex gap-2">
          <view
            v-for="task in reminder.reminders"
            :key="task.type"
            class="flex-1 bg-gray-50 rounded-xl p-2 text-center"
          >
            <text class="block text-lg mb-1">{{ getTaskIcon(task.type) }}</text>
            <text class="block text-xs text-gray-700">{{ getTaskName(task.type) }}</text>
          </view>
        </view>

        <view class="flex gap-2 mt-3">
          <button
            class="flex-1 bg-primary text-white text-sm py-2 rounded-xl"
            @click="completeTask(reminder.id)"
          >
            完成
          </button>
          <button
            class="flex-1 bg-gray-100 text-gray-700 text-sm py-2 rounded-xl"
            @click="postponeTask(reminder.id)"
          >
            推迟
          </button>
        </view>
      </view>
    </view>

    <!-- 种植计划 -->
    <view class="px-4 pb-20">
      <view class="flex items-center justify-between mb-3">
        <text class="block text-lg font-bold text-gray-900">🌱 我的植物</text>
        <button
          class="bg-primary text-white text-sm px-4 py-2 rounded-full"
          @click="addPlan"
        >
          + 添加
        </button>
      </view>

      <view v-if="plantingStore.activePlans.length === 0" class="bg-white rounded-2xl p-6 text-center">
        <text class="block text-4xl mb-2">🪴</text>
        <text class="block text-sm text-gray-600 mb-4">还没有种植计划</text>
        <button
          class="bg-primary text-white text-sm px-6 py-2 rounded-full"
          @click="addPlan"
        >
          添加第一株植物
        </button>
      </view>

      <view
        v-for="plan in plantingStore.activePlans"
        :key="plan.id"
        class="bg-white rounded-2xl p-4 mb-3 shadow-sm"
        @click="viewPlanDetail(plan)"
      >
        <view class="flex items-center justify-between mb-2">
          <text class="block text-base font-semibold text-gray-900">{{ plan.plantName }}</text>
          <text class="text-xs text-gray-500">{{ getDaysAgo(plan.plantDate) }}</text>
        </view>

        <view class="flex items-center gap-2 mb-3">
          <view class="bg-gray-100 px-2 py-1 rounded">
            <text class="text-xs text-gray-700">{{ plan.location }}</text>
          </view>
          <view class="bg-[#D8F3DC] px-2 py-1 rounded">
            <text class="text-xs text-primary">健康</text>
          </view>
        </view>

        <text v-if="plan.notes" class="block text-sm text-gray-600">{{ plan.notes }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { usePlantingStore } from '@/store/planting.js'

const plantingStore = usePlantingStore()

// 天气数据
const weather = ref({
  current: {
    temp: 22,
    desc: '晴',
    icon: '🌤️'
  },
  forecast: [
    { date: '2026-02-19', weekday: '今天', icon: '🌤️', temp: 22 },
    { date: '2026-02-20', weekday: '明天', icon: '☀️', temp: 24 },
    { date: '2026-02-21', weekday: '周五', icon: '⛅', temp: 20 },
    { date: '2026-02-22', weekday: '周六', icon: '🌧️', temp: 18 },
    { date: '2026-02-23', weekday: '周日', icon: '🌤️', temp: 21 },
    { date: '2026-02-24', weekday: '周一', icon: '☀️', temp: 23 },
    { date: '2026-02-25', weekday: '周二', icon: '⛅', temp: 22 }
  ]
})

// 当前节气
const currentSolarTerm = ref({
  name: '雨水',
  date: '2月19日',
  tip: '雨水时节，气温回升，适合播种。注意保持土壤湿润，但避免积水。'
})

onMounted(() => {
  // 获取天气数据
  getWeatherData()
  // 获取节气数据
  getSolarTermData()
})

function getWeatherData() {
  // TODO: 调用中国气象局 API
  console.log('获取天气数据')
}

function getSolarTermData() {
  // TODO: 获取二十四节气数据
  console.log('获取节气数据')
}

function viewSolarTerms() {
  uni.showToast({
    title: '节气详情功能开发中',
    icon: 'none'
  })
}

function getTaskIcon(type) {
  const icons = {
    water: '💧',
    fertilize: '🪴',
    prune: '✂️',
    check: '🔍'
  }
  return icons[type] || '📝'
}

function getTaskName(type) {
  const names = {
    water: '浇水',
    fertilize: '施肥',
    prune: '修剪',
    check: '检查'
  }
  return names[type] || '任务'
}

function completeTask(id) {
  uni.showToast({
    title: '任务已完成',
    icon: 'success'
  })
  // TODO: 更新任务状态
}

function postponeTask(id) {
  uni.showToast({
    title: '已推迟到明天',
    icon: 'none'
  })
  // TODO: 推迟任务
}

function addPlan() {
  uni.showToast({
    title: '添加植物功能开发中',
    icon: 'none'
  })
}

function viewPlanDetail(plan) {
  uni.showToast({
    title: '植物详情功能开发中',
    icon: 'none'
  })
}

function getDaysAgo(date) {
  const plantDate = new Date(date)
  const now = new Date()
  const days = Math.floor((now - plantDate) / (1000 * 60 * 60 * 24))
  return `种植 ${days} 天`
}
</script>

<style scoped>
/* 使用 Tailwind CSS */
</style>
