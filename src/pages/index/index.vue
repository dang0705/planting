<template>
  <Layout title="青花植" :show-weather-header="true">
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
        <view v-if="loadingPlants" id="index-plants-loading-skeleton" class="space-y-4 p-4">
          <view
            v-for="skeletonIndex in 2"
            :key="skeletonIndex"
            class="flex h-[129px] animate-pulse overflow-hidden rounded-[12px] border border-[rgba(45,122,79,0.15)] bg-white p-px shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]"
          >
            <view class="h-[127px] w-[112px] flex-[0_0_112px] bg-gray-200" />
            <view class="flex h-[127px] min-w-0 flex-1 flex-col gap-2 p-3">
              <view class="h-[27px] w-32 rounded bg-gray-200" />
              <view class="h-[22px] w-20 rounded-full bg-gray-100" />
              <view class="flex h-[38px] min-w-0 w-full gap-2">
                <view class="h-9 min-w-0 w-0 flex-1 rounded-[10px] bg-gray-200" />
                <view class="h-9 min-w-0 w-0 flex-1 rounded-[10px] bg-gray-100" />
              </view>
            </view>
            <view
              class="flex h-[127px] w-[49px] flex-[0_0_49px] flex-col items-center justify-center gap-2 border-l border-[rgba(45,122,79,0.15)] py-3 pl-[9px] pr-2"
            >
              <view class="size-8 rounded-full bg-gray-100" />
              <view class="size-8 rounded-full bg-gray-100" />
            </view>
          </view>
        </view>

        <view v-else-if="plantsError" class="flex flex-col items-center px-8 py-16 text-center">
          <text class="text-4xl">🌿</text>
          <text class="mt-4 text-lg font-semibold text-gray-800">植物暂时加载失败</text>
          <text class="mt-2 text-sm leading-6 text-gray-400">请检查网络后再试一次</text>
          <button
            id="index-plants-retry-button"
            class="mt-6 rounded-3xl bg-primary px-8 py-3.5 text-white"
            @click="loadUserPlants"
          >
            重新加载
          </button>
        </view>

        <view
          v-else-if="!plantStore.hasPlants"
          class="flex flex-col items-center px-8 py-16 text-center"
        >
          <text class="text-6xl">🌱</text>
          <text class="mt-4 text-lg font-semibold text-gray-800">还没有添加植物</text>
          <text class="mt-2 text-sm leading-6 text-gray-400">
            记录你的每一株植物，方便持续查看养护建议
          </text>
          <button
            id="index-empty-add-plant-button"
            class="mt-6 rounded-3xl bg-primary px-8 py-3.5 text-white"
            @click="handleAddPlant"
          >
            添加第一株植物
          </button>
        </view>

        <view v-else id="index-plant-list" class="p-4">
          <view class="mb-2 flex justify-end">
            <view
              id="index-add-plant-button"
              class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary active:bg-[#eef3ef]"
              @click="handleAddPlant"
            >
              <uni-icons type="plusempty" size="14" color="#2d7a4f" />
              <text>添加植物</text>
            </view>
          </view>
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
              @fertilization="openFertilization"
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
            id="index-watering-advisor-entry"
            class="mt-3 flex items-center justify-between rounded-[20px] bg-white p-4 shadow-sm"
            @click="handleGoWateringAdvisor"
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
          >登录后可使用植物识别、植物状况检查、养护记录和历史同步。</text
        >
        <!-- #ifdef MP-WEIXIN -->
        <button
          id="index-phone-login-button"
          class="mb-3 w-full rounded-2xl bg-primary py-3.5 text-white"
          :class="{ 'opacity-60': phoneLoggingIn }"
          :disabled="phoneLoggingIn"
          :loading="phoneLoggingIn"
          open-type="getPhoneNumber"
          @getphonenumber="handleIndexPhoneLogin"
        >
          {{ phoneLoggingIn ? '登录中…' : '微信手机号登录' }}
        </button>
        <!-- #endif -->
        <!-- #ifdef MP-TOUTIAO || MP-XHS -->
        <button
          id="index-platform-phone-login-button"
          class="mb-3 w-full rounded-2xl bg-primary py-3.5 text-white"
          :class="{ 'opacity-60': platformPhoneLoggingIn }"
          :disabled="platformPhoneLoggingIn"
          :loading="platformPhoneLoggingIn"
          :open-type="loginCodeReady ? 'getPhoneNumber' : ''"
          @click="handlePlatformLoginTap"
          @getphonenumber="handlePlatformPhoneLogin"
        >
          {{
            platformPhoneLoggingIn
              ? '登录中…'
              : loginCodeReady
                ? '授权手机号快捷登录'
                : '准备手机号登录'
          }}
        </button>
        <text v-if="loginPreparationError" class="mb-3 block text-sm leading-6 text-[#B42318]">
          {{ loginPreparationError }}
        </text>
        <!-- #endif -->
      </view>

      <WateringReminderSheet
        ref="wateringReminderRef"
        :plant="currentReminderPlant"
        @close="currentReminderPlantId = null"
      />
      <FertilizationMonthlySheet
        ref="fertilizationMonthlyRef"
        :plant="currentFertilizationPlant"
        @close="currentFertilizationPlantId = null"
        @changed="loadUserPlants()"
      />
    </view>
    <!-- #ifdef MP-TOUTIAO -->
    <PlatformPrivacyModal
      :model-value="privacyVisible"
      @open-contract="openPrivacyContract"
      @agree="agreePrivacyAuthorization"
    />
    <!-- #endif -->
    <FeatureUnavailableModal v-model="featureUnavailableVisible" :feature-key="openedFeatureKey" />
  </Layout>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import HeaderWeatherInfo from '@/components/HeaderWeatherInfo.vue'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import PlatformPrivacyModal from '@/components/PlatformPrivacyModal.vue'
import { getDiagnosisHistory } from '@/api/diagnosis-history.js'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { createAsyncActionGuard, createLeadingThrottle } from '@/utils/interaction-guard.js'
import { requireMvpAccess } from '@/utils/subscription-access.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isDiagnosisAvailable, isFeatureAvailable } from '@/utils/platform-capabilities.js'
import { getActivePlatformAccessToken } from '@/api/platform-session.js'
import { usePlatformPhoneLogin } from '@/composables/usePlatformPhoneLogin.js'
import PlantCard from './components/PlantCard.vue'
import FertilizationMonthlySheet from './components/FertilizationMonthlySheet.vue'
import WateringReminderSheet from './components/WateringReminderSheet.vue'

const JUST_NOW_MS = 60000
const ONE_HOUR_MS = 3600000
const ONE_DAY_MS = 86400000
const qaPerformanceRefresh = import.meta.env.VITE_QA_PERFORMANCE_COLD_LANE === '1'

const plantStore = usePlantStore()
const userStore = useUserStore()
const plantingStore = usePlantingStore()
const loadingPlants = ref(true)
const plantLoadStarted = ref(false)
const plantsError = ref('')
const wateringReminderRef = ref(null)
const fertilizationMonthlyRef = ref(null)
const currentReminderPlantId = ref(null)
const currentFertilizationPlantId = ref(null)
const phoneLoginAction = createAsyncActionGuard()
const phoneLoggingIn = ref(false)
const plantDiagnoseHistory = reactive({})
const currentReminderPlant = computed(() =>
  currentReminderPlantId.value === null
    ? null
    : plantStore.userPlants.find(
        plant => Number(plant.id) === Number(currentReminderPlantId.value)
      ) || null
)
const currentFertilizationPlant = computed(() =>
  currentFertilizationPlantId.value === null
    ? null
    : plantStore.userPlants.find(
        plant => Number(plant.id) === Number(currentFertilizationPlantId.value)
      ) || null
)
const {
  loginCodeReady,
  loginPreparationError,
  loggingIn: platformPhoneLoggingIn,
  handleGetPhoneNumber: handlePlatformPhoneLogin,
  prepareLoginCode,
  privacyVisible,
  openPrivacyContract,
  agreePrivacyAuthorization
} = usePlatformPhoneLogin({
  onSuccess: async user => {
    await userStore.setLoginInfo({
      user,
      token: getActivePlatformAccessToken()
    })
    await loadUserPlants()
  }
})
async function handlePlatformLoginTap() {
  if (loginCodeReady.value || platformPhoneLoggingIn.value) {
    return
  }
  await prepareLoginCode()
}
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()
onMounted(async () => {
  if (await userStore.ensureLogin()) {
    await loadUserPlants()
  } else {
    loadingPlants.value = false
  }
})

onShow(() => {
  Object.keys(plantDiagnoseHistory).forEach(key => delete plantDiagnoseHistory[key])
  if (qaPerformanceRefresh && userStore.isAuthenticated) {
    userStore
      .ensureLogin()
      .then(isLoggedIn => {
        if (isLoggedIn) {
          return loadUserPlants()
        }
        return undefined
      })
      .catch(() => undefined)
  }
})

async function loadUserPlants() {
  if (plantLoadStarted.value && loadingPlants.value) {
    return
  }
  plantLoadStarted.value = true
  loadingPlants.value = true
  plantsError.value = ''
  try {
    const result = await plantStore.getUserPlants(1, 50)
    if (!result?.success && !result?.stale) {
      plantsError.value = result?.message || '暂时无法加载植物，请检查网络后重试'
    }
  } finally {
    loadingPlants.value = false
  }
}
function handleIndexPhoneLogin(event) {
  if (phoneLoggingIn.value) {
    return
  }
  phoneLoggingIn.value = true
  return phoneLoginAction.run(async () => {
    try {
      await userStore.phoneLogin({
        code: event?.detail?.code || '',
        cloudId: event?.detail?.cloudID || event?.detail?.cloudId || ''
      })
      await loadUserPlants()
    } finally {
      phoneLoggingIn.value = false
    }
  })
}
function addPlant() {
  reportAnalyticsEvent(ANALYTICS_EVENTS.USER_CLICK_CREATE_PLANT)
  uni.navigateTo({ url: '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create' })
}
async function goWateringAdvisor() {
  if (!isFeatureAvailable('watering')) {
    openFeatureUnavailable('watering')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'index_watering_advisor' }))) {
    return
  }
  reportAnalyticsEvent(ANALYTICS_EVENTS.ISOLATED_WATERING_PLANNER)
  uni.navigateTo({ url: '/subpackages/care/watering-advisor/watering-advisor' })
}
const handleAddPlant = createLeadingThrottle(addPlant, 500)
const handleGoWateringAdvisor = createLeadingThrottle(goWateringAdvisor, 500)
function openEditPlant(plant) {
  uni.navigateTo({
    url: `/subpackages/plant/user-plant-detail/user-plant-detail?mode=edit&id=${plant.id}`
  })
}
function getReminderSummary(plant) {
  const backendReminder = normalizeBackendWaterReminder(plant?.wateringReminder)
  const localWater = plantingStore.getPlantReminderState(plant.id, 'water')
  return {
    water: backendReminder || localWater,
    fertilize: {
      active: Boolean(plant?.fertilizationReminder?.active),
      reminder: plant?.fertilizationReminder || null,
      nextTime: plant?.fertilizationReminder?.nextTime || ''
    }
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
async function openDiagnose(plant) {
  if (!plant?.id) {
    return
  }
  if (!isDiagnosisAvailable('plant_card')) {
    openFeatureUnavailable('diagnosis')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'index_plant_diagnose' }))) {
    return
  }
  const plantId = encodeURIComponent(String(plant.id))
  const plantCatalogId = plant.plantId
    ? `&plantCatalogId=${encodeURIComponent(String(plant.plantId))}`
    : ''
  const plantName = encodeURIComponent(plant.canonicalName || plant.displayName || '当前植物')
  uni.navigateTo({
    url: `/subpackages/diagnosis/flow?plantId=${plantId}${plantCatalogId}&plantName=${plantName}&entrySource=plant_card`
  })
}
async function openPlantHistory(plant) {
  if (!isDiagnosisAvailable('plant_history')) {
    openFeatureUnavailable('diagnosis')
    return
  }
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
  const featureKey = type === 'water' ? 'watering' : 'fertilization'
  if (!isFeatureAvailable(featureKey)) {
    openFeatureUnavailable(featureKey)
    return
  }
  if (!(await requireMvpAccess(userStore, { source: `index_${type}_reminder` }))) {
    return
  }
  if (type === 'water') {
    currentReminderPlantId.value = plant.id
    await nextTick()
    callComponentMethod(wateringReminderRef, 'open')
  }
}
async function openFertilization(plant) {
  if (!isFeatureAvailable('fertilization')) {
    openFeatureUnavailable('fertilization')
    return
  }
  if (!(await requireMvpAccess(userStore, { source: 'index_fertilization_reminder' }))) {
    return
  }
  currentFertilizationPlantId.value = plant.id
  await nextTick()
  callComponentMethod(fertilizationMonthlyRef, 'open')
}
function viewDiagnoseDetail(recordId) {
  uni.navigateTo({
    url: `/subpackages/diagnosis/result?id=${recordId}&entrySource=plant_history`
  })
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
