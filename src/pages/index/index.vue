<template>
  <Layout title="青花植">
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
            id="index-add-plant-button"
            class="mt-4 flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-primary bg-white p-5"
            @click="handleAddPlant"
          >
            <uni-icons type="plusempty" />
            <text class="text-sm font-semibold text-primary">添加新植物</text>
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
          open-type="getPhoneNumber"
          @getphonenumber="handleIndexPhoneLogin"
        >
          微信手机号登录
        </button>
        <!-- #endif -->
        <!-- #ifdef MP-TOUTIAO || MP-XHS -->
        <button
          id="index-platform-phone-login-button"
          class="mb-3 w-full rounded-2xl bg-primary py-3.5 text-white"
          :class="{ 'opacity-60': platformPhoneLoggingIn }"
          :disabled="platformPhoneLoggingIn"
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
import loadingIcon from '@/assets/icons/loading.svg'
import { getDiagnosisHistory } from '@/api/diagnosis-history.js'
import { usePlantingStore } from '@/store/planting.js'
import { usePlantStore } from '@/store/plants.js'
import { useUserStore } from '@/store/user.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { createAsyncActionGuard, createLeadingThrottle } from '@/utils/interaction-guard.js'
import { requireMvpAccess } from '@/utils/subscription-access.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isRestrictedMiniProgram } from '@/utils/platform-capabilities.js'
import { getActivePlatformAccessToken } from '@/api/platform-session.js'
import { usePlatformPhoneLogin } from '@/composables/usePlatformPhoneLogin.js'
import PlantCard from './components/PlantCard.vue'
import FertilizationMonthlySheet from './components/FertilizationMonthlySheet.vue'
import WateringReminderSheet from './components/WateringReminderSheet.vue'

const JUST_NOW_MS = 60000
const ONE_HOUR_MS = 3600000
const ONE_DAY_MS = 86400000

const plantStore = usePlantStore()
const userStore = useUserStore()
const plantingStore = usePlantingStore()
const loadingPlants = ref(false)
const plantsError = ref('')
const wateringReminderRef = ref(null)
const fertilizationMonthlyRef = ref(null)
const currentReminderPlantId = ref(null)
const currentFertilizationPlantId = ref(null)
const phoneLoginAction = createAsyncActionGuard()
const plantDiagnoseHistory = reactive({})
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
  }
})

onShow(() => {
  Object.keys(plantDiagnoseHistory).forEach(key => delete plantDiagnoseHistory[key])
})

async function loadUserPlants() {
  if (loadingPlants.value) {
    return
  }
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
  return phoneLoginAction.run(async () => {
    await userStore.phoneLogin({
      code: event?.detail?.code || '',
      cloudId: event?.detail?.cloudID || event?.detail?.cloudId || ''
    })
    await loadUserPlants()
  })
}
function addPlant() {
  reportAnalyticsEvent(ANALYTICS_EVENTS.USER_CLICK_CREATE_PLANT)
  uni.navigateTo({ url: '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create' })
}
async function goWateringAdvisor() {
  if (isRestrictedMiniProgram()) {
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
  if (isRestrictedMiniProgram()) {
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
  if (isRestrictedMiniProgram()) {
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
  if (isRestrictedMiniProgram()) {
    openFeatureUnavailable(type === 'water' ? 'watering' : 'fertilization')
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
  if (isRestrictedMiniProgram()) {
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
  uni.navigateTo({ url: `/subpackages/diagnosis/result?id=${recordId}` })
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
