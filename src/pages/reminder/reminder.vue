<template>
  <Layout title="提醒" content-class="bg-[#F8F6F0]">
    <view id="reminder-tab-page" class="min-h-screen bg-[#F8F6F0] p-4">
      <view v-if="loadingPlants" id="reminder-tab-loading" class="py-10 text-center">
        <image :src="loadingIcon" class="mx-auto size-16" />
        <text class="mt-3 block text-sm text-gray-500">加载中...</text>
      </view>

      <view v-else-if="!plantStore.hasPlants" id="reminder-tab-empty" class="py-16 text-center">
        <text class="block text-lg font-semibold text-gray-800">还没有可设置提醒的植物</text>
        <text class="mt-2 block text-sm leading-6 text-gray-500">
          添加植物后，可以在这里安排浇水提醒。
        </text>
      </view>

      <view v-else id="reminder-tab-plant-list" class="space-y-3">
        <view
          v-for="plant in plantStore.userPlants"
          :key="plant.id"
          :id="`reminder-tab-plant-${plant.id}`"
          class="rounded-lg bg-white p-4 shadow-sm"
        >
          <view class="flex items-start justify-between gap-3">
            <view class="min-w-0 flex-1">
              <text class="block truncate text-base font-semibold text-[#1F2933]">
                {{ plant.canonicalName || plant.displayName || '我的植物' }}
              </text>
              <text class="mt-1 block text-xs leading-5 text-[#667085]">
                {{ getWaterReminderText(plant) }}
              </text>
            </view>
            <button
              :id="`reminder-tab-water-${plant.id}`"
              class="shrink-0 rounded-lg bg-[#2D6A4F] px-4 py-2 text-xs font-semibold text-white"
              @click="openReminder(plant)"
            >
              浇水提醒
            </button>
          </view>
        </view>
      </view>

      <WateringReminderSheet
        ref="wateringReminderRef"
        :plant="currentReminderPlant"
        @close="currentReminderPlantId = null"
      />
    </view>
  </Layout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import Layout from '@/Layout.vue'
import loadingIcon from '@/assets/icons/loading.svg'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import WateringReminderSheet from '@/pages/index/components/WateringReminderSheet.vue'

const plantStore = usePlantStore()
const plantingStore = usePlantingStore()
const userStore = useUserStore()
const loadingPlants = ref(false)
const wateringReminderRef = ref(null)
const currentReminderPlantId = ref(null)
const currentReminderPlant = computed(() =>
  currentReminderPlantId.value === null
    ? null
    : plantStore.userPlants.find(plant => plant.id === currentReminderPlantId.value) || null
)

onMounted(async () => {
  if (await userStore.ensureLogin()) {
    await loadUserPlants(true)
  }
})

async function loadUserPlants(force = false) {
  if (loadingPlants.value && !force) {
    return
  }
  loadingPlants.value = true
  try {
    await plantStore.getUserPlants()
  } finally {
    loadingPlants.value = false
  }
}

function normalizeBackendWaterReminder(reminder) {
  if (!reminder?.nextTime) {
    return null
  }
  const nextTime = new Date(reminder.nextTime)
  if (Number.isNaN(nextTime.getTime()) || nextTime < new Date()) {
    return null
  }
  return {
    active: true,
    reminder: { ...reminder, type: 'water', enabled: true },
    nextTime: reminder.nextTime
  }
}

function getReminderSummary(plant) {
  return {
    water:
      normalizeBackendWaterReminder(plant?.wateringReminder) ||
      plantingStore.getPlantReminderState(plant.id, 'water')
  }
}

function getWaterReminderText(plant) {
  const summary = getReminderSummary(plant)
  return summary.water?.active ? '已有浇水提醒' : '还没有安排浇水提醒'
}

async function openReminder(plant) {
  currentReminderPlantId.value = plant.id
  await nextTick()
  callComponentMethod(wateringReminderRef, 'open')
}
</script>
