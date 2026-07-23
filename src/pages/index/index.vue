<template>
  <Layout title="青花植" content-class="pb-[70px]">
    <template #left-info>
      <HeaderWeatherInfo />
    </template>

    <view id="index-page" class="min-h-screen">
      <view v-if="plantStore.plantsNeedWater.length" class="m-4 rounded-2xl bg-[#FFF3E0] px-4 py-3">
        <text class="text-sm font-semibold text-[#F57C00]">
          今日需要浇水 {{ plantStore.plantsNeedWater.length }} 株植物
        </text>
      </view>

      <template v-if="userStore.isAuthenticated">
        <view v-if="loadingPlants" class="py-10 text-center">
          <image :src="loadingIcon" class="mx-auto size-16" />
          <text class="mt-3 block text-sm text-gray-500">加载中...</text>
        </view>

        <view
          v-else-if="!plantStore.hasPlants"
          class="flex flex-col items-center px-8 py-16 text-center"
        >
          <text class="text-6xl">🌱</text>
          <text class="mt-4 text-lg font-semibold text-gray-800">还没有添加植物</text>
          <text class="mt-2 text-sm leading-6 text-gray-400">
            记录你的每一株植物，让 AI 帮你更好地照顾它们
          </text>
          <button class="mt-6 rounded-3xl bg-primary px-8 py-3.5 text-white" @click="addPlant">
            添加第一株植物
          </button>
        </view>

        <view v-else id="index-plant-list" class="p-4">
          <view
            v-for="plant in plantStore.userPlants"
            :key="plant.id"
            class="mb-4 rounded-3xl bg-white shadow-sm"
          >
            <PlantCard
              :plant="plant"
              :reminder-summary="getReminderSummary(plant)"
              @diagnose="openDiagnose"
              @history="openPlantHistory"
              @edit="openEditPlant"
              @reminder="openReminder"
            />
            <view
              v-if="plantDiagnoseHistory[plant.id]?.length"
              :id="`index-diagnose-history-list-${plant.id}`"
              class="mt-3 rounded-2xl bg-gray-50 p-3"
            >
              <view
                v-for="record in plantDiagnoseHistory[plant.id]"
                :key="record._id"
                :id="`index-diagnose-record-${record._id}`"
                class="border-b border-gray-100 py-2 last:border-0"
                @click="viewDiagnoseDetail(record._id)"
              >
                <text class="block text-xs font-semibold text-gray-800">
                  {{ record.mainIssue || '诊断记录' }}
                </text>
                <text class="mt-1 block text-[10px] text-gray-400">
                  {{ formatTime(record.createdAt) }}
                </text>
              </view>
            </view>
          </view>
          <view
            class="mt-4 flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-primary bg-white p-5"
            @click="addPlant"
          >
            <uni-icons type="plusempty" />
            <text class="text-sm font-semibold text-primary">添加新植物</text>
          </view>
          <view
            id="index-watering-advisor-entry"
            class="mt-3 flex items-center justify-between rounded-[20px] bg-white p-4 shadow-sm"
            @click="goWateringAdvisor"
          >
            <view class="flex items-center gap-3">
              <text class="text-[24px]">💧</text>
              <view>
                <text class="block text-sm font-semibold text-gray-800">独立浇水建议</text>
                <text class="block text-[11px] text-gray-400">不添加植物也能获取浇水方案</text>
              </view>
            </view>
            <text class="text-[18px] text-gray-300">›</text>
          </view>
        </view>
      </template>

      <view v-else class="mx-4 mt-6 rounded-[24px] bg-white p-5 shadow-sm">
        <text class="mb-2 block text-lg font-semibold text-gray-800">登录后开始记录植物</text>
        <text class="mb-5 block text-sm text-gray-500"
          >登录后可使用植物识别、AI 诊断、养护记录和历史同步能力。</text
        >
        <!-- #ifdef MP-WEIXIN -->
        <button
          id="index-phone-login-button"
          class="mb-3 w-full rounded-2xl bg-primary py-3.5 text-white"
          open-type="getPhoneNumber"
          @getphonenumber="handleIndexPhoneLogin"
        >
          微信手机号登录
        </button>
        <!-- #endif -->
        <button
          id="index-quick-login-button"
          class="w-full rounded-2xl bg-[#EEF3EF] py-3.5 text-[#2D7A4F]"
          @click="userLogin"
        >
          快速登录
        </button>
      </view>

      <DiagnosePopup
        ref="diagnosePopupRef"
        :plant-id="currentPlantId"
        :plant-name="currentPlantName"
        diagnosis-profile="full"
        entry-source="plant_card"
        @success="handleDiagnoseSuccess"
        @close="handleDiagnosePopupClose"
      />
      <WateringReminderSheet
        ref="wateringReminderRef"
        :plant="currentReminderPlant"
        @close="currentReminderPlantId = null"
      />
    </view>
  </Layout>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import HeaderWeatherInfo from '@/components/HeaderWeatherInfo.vue'
import Layout from '@/Layout.vue'
import DiagnosePopup from '@/components/DiagnosePopup.vue'
import loadingIcon from '@/assets/icons/loading.svg'
import { getDiagnosisHistory } from '@/api/plants-http.js'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import PlantCard from './components/PlantCard.vue'
import WateringReminderSheet from './components/WateringReminderSheet.vue'

const JUST_NOW_MS = 60000
const ONE_HOUR_MS = 3600000
const ONE_DAY_MS = 86400000

const plantStore = usePlantStore()
const userStore = useUserStore()
const plantingStore = usePlantingStore()
const loadingPlants = ref(false)
const diagnosePopupRef = ref(null)
const wateringReminderRef = ref(null)
const currentPlantId = ref('')
const currentPlantName = ref('')
const currentReminderPlantId = ref(null)
const plantDiagnoseHistory = reactive({})
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
async function userLogin() {
  await userStore.wechatLogin()
  await loadUserPlants(true)
}
async function handleIndexPhoneLogin(event) {
  await userStore.phoneLogin({
    code: event?.detail?.code || '',
    cloudId: event?.detail?.cloudID || event?.detail?.cloudId || ''
  })
  await loadUserPlants(true)
}
function addPlant() {
  uni.navigateTo({ url: '/pages/add-plant/add-plant' })
}
function goWateringAdvisor() {
  uni.navigateTo({ url: '/pages/watering-advisor/watering-advisor' })
}
function openEditPlant(plant) {
  uni.navigateTo({ url: `/pages/edit-plant/edit-plant?id=${plant.id}` })
}
function getReminderSummary(plant) {
  const backendReminder = normalizeBackendWaterReminder(plant?.wateringReminder)
  const localWater = plantingStore.getPlantReminderState(plant.id, 'water')
  return {
    water: backendReminder || localWater
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
function openDiagnose(plant) {
  currentPlantId.value = plant.id
  currentPlantName.value = plant.canonicalName || plant.displayName || '当前植物'
  callComponentMethod(diagnosePopupRef, 'open')
}
async function openPlantHistory(plant) {
  if (plantDiagnoseHistory[plant.id]) {
    return
  }
  const result = await getDiagnosisHistory({ plantId: plant.id, page: 1, pageSize: 3 })
  plantDiagnoseHistory[plant.id] = (result?.items || []).map(item => ({
    _id: item.resultId || item.historyId || '',
    mainIssue: item?.summary?.displayName || '诊断记录',
    createdAt: item.createdAt
  }))
}
async function openReminder({ plant, type }) {
  if (type === 'water') {
    currentReminderPlantId.value = plant.id
    await nextTick()
    callComponentMethod(wateringReminderRef, 'open')
  }
}
function handleDiagnoseSuccess() {
  if (currentPlantId.value) {
    delete plantDiagnoseHistory[currentPlantId.value]
  }
}
function handleDiagnosePopupClose() {
  currentPlantId.value = ''
  currentPlantName.value = ''
}
function viewDiagnoseDetail(recordId) {
  uni.navigateTo({ url: `/pages/diagnose/result?id=${recordId}` })
}
function formatTime(time) {
  const diff = Date.now() - new Date(time).getTime()
  if (diff < JUST_NOW_MS) {
    return '刚刚'
  }
  if (diff < ONE_HOUR_MS) {
    return `${Math.floor(diff / JUST_NOW_MS)}分钟前`
  }
  if (diff < ONE_DAY_MS) {
    return `${Math.floor(diff / ONE_HOUR_MS)}小时前`
  }
  return `${Math.floor(diff / ONE_DAY_MS)}天前`
}
</script>
