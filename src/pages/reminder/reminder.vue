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
          添加植物后，可以在这里安排浇水或施肥提醒。
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
              <text class="mt-1 block text-xs leading-5 text-[#667085]">
                {{ getFertilizationReminderText(plant) }}
              </text>
            </view>
            <view class="flex shrink-0 flex-col gap-2">
              <button
                :id="`reminder-tab-water-${plant.id}`"
                class="rounded-lg bg-[#2D6A4F] px-4 py-2 text-xs font-semibold text-white"
                @click="openReminder(plant)"
              >
                浇水提醒
              </button>
              <button
                :id="`reminder-tab-fertilization-${plant.id}`"
                class="rounded-lg border border-[#2D6A4F] bg-white px-4 py-2 text-xs font-semibold text-[#2D6A4F] after:border-0"
                @click="openFertilizationReminder(plant)"
              >
                施肥提醒
              </button>
            </view>
          </view>
        </view>
      </view>

      <WateringReminderSheet
        ref="wateringReminderRef"
        :plant="currentReminderPlant"
        @close="currentReminderPlantId = null"
      />
      <FertilizationMonthlySheet
        ref="fertilizationReminderRef"
        :plant="currentFertilizationPlant"
        @close="currentFertilizationPlantId = null"
        @changed="loadUserPlants()"
      />
      <FeatureUnavailableModal
        v-model="featureUnavailableVisible"
        :feature-key="openedFeatureKey"
      />
    </view>
  </Layout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import loadingIcon from '@/assets/icons/loading.svg'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { requireMvpAccess } from '@/utils/subscription-access.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isFeatureAvailable } from '@/utils/platform-capabilities.js'
import WateringReminderSheet from '@/pages/index/components/WateringReminderSheet.vue'
import FertilizationMonthlySheet from '@/pages/index/components/FertilizationMonthlySheet.vue'

const plantStore = usePlantStore()
const plantingStore = usePlantingStore()
const userStore = useUserStore()
const loadingPlants = ref(false)
const wateringReminderRef = ref(null)
const fertilizationReminderRef = ref(null)
const currentReminderPlantId = ref(null)
const currentFertilizationPlantId = ref(null)
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()
const currentReminderPlant = computed(() =>
  currentReminderPlantId.value === null
    ? null
    : plantStore.userPlants.find(plant => plant.id === currentReminderPlantId.value) || null
)
const currentFertilizationPlant = computed(() =>
  currentFertilizationPlantId.value === null
    ? null
    : plantStore.userPlants.find(plant => plant.id === currentFertilizationPlantId.value) || null
)

onMounted(async () => {
  if (await userStore.ensureLogin()) {
    await loadUserPlants()
  }
})

async function loadUserPlants() {
  if (loadingPlants.value) {
    return
  }
  loadingPlants.value = true
  try {
    await plantStore.getUserPlants(1, 50)
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

function getFertilizationReminderText(plant) {
  const reminder = plant?.fertilizationReminder
  if (!reminder?.active) {
    return plant?.fertilizationMonthly?.available ? '还没有安排施肥提醒' : '暂无已审核的月度施肥表'
  }
  return reminder.isDue
    ? reminder.reminderKind === 'first_confirmation'
      ? '首次确认提醒已到，请打开查看'
      : '施肥提醒已到，请打开查看'
    : `${reminder.reminderKind === 'first_confirmation' ? '首次确认提醒' : '施肥提醒'}：${String(
        reminder.nextCheckDate || ''
      )
        .slice(5)
        .replace('-', '月')}日`
}

async function openReminder(plant) {
  if (!isFeatureAvailable('watering')) {
    openFeatureUnavailable('watering')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'reminder_water' }))) {
    return
  }
  currentReminderPlantId.value = plant.id
  await nextTick()
  callComponentMethod(wateringReminderRef, 'open')
}

async function openFertilizationReminder(plant) {
  if (!isFeatureAvailable('fertilization')) {
    openFeatureUnavailable('fertilization')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'reminder_fertilization' }))) {
    return
  }
  currentFertilizationPlantId.value = plant.id
  await nextTick()
  callComponentMethod(fertilizationReminderRef, 'open')
}
</script>
