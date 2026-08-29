<template>
  <Layout title="浇水建议" left-action="back" background-class="bg-[#f8faf9]">
    <view class="flex h-screen min-h-0 flex-col bg-[#f8faf9] pb-5">
      <view class="flex items-center justify-center gap-2 px-4 pt-4">
        <view v-for="(label, index) in stepLabels" :key="index" class="flex items-center gap-2">
          <view
            class="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
            :class="index <= activeStep ? 'bg-[#2d7a4f] text-white' : 'bg-[#e1e9dd] text-[#53645a]'"
          >
            {{ index + 1 }}
          </view>
          <text
            class="text-[12px]"
            :class="index <= activeStep ? 'font-semibold text-[#1f2933]' : 'text-[#9ca3af]'"
          >
            {{ label }}
          </text>
          <view v-if="index < stepLabels.length - 1" class="mx-1 h-[1px] w-6 bg-[#e1e9dd]" />
        </view>
      </view>
      <ButtonStepTrack
        id="watering-advisor-swiper"
        :active-index="activeStep"
        :step-count="stepLabels.length"
        viewport-class="w-full"
        item-class="relative min-h-0 overflow-hidden"
        active-item-class="h-full"
      >
        <template #step="{ index, active }">
          <view v-if="active && index === STEP_SOURCE" class="h-full">
            <CatalogPlantSearch
              ref="searchRef"
              :selected-plant="selectedCatalogPlant"
              :my-plants-expanded="showMyPlantsList"
              :my-plants-loading="shouldShowMyPlantsLoading"
              :my-plants="plantStore.userPlants"
              :selected-user-plant-id="selectedUserPlantId"
              @toggle-my-plants="handleMyPlantsPanelToggle"
              @select-user-plant="selectUserPlant"
              @load-more="handleScrollLower"
              @select="selectCatalogPlant"
            />
          </view>
          <scroll-view
            v-if="active && isUserPlant && index === AIR_ENVIRONMENT_STEP"
            scroll-y
            class="box-border h-full min-h-0 px-4 pt-6 pb-[112px]"
          >
            <view class="mb-4">
              <text class="block text-[20px] font-bold leading-7 text-[#1f2937]">空气环境</text>
              <text class="mt-1 block text-[13px] text-[#6b7280]">
                这项信息会帮助调整检查节奏，但不会替代盆土判断
              </text>
            </view>
            <AirEnvironmentSummaryCard
              v-if="showSavedAirEnvironmentSummary"
              id="watering-advisor-air-environment-summary"
              edit-button-id="watering-advisor-air-environment-edit"
              confirm-button-id="watering-advisor-air-environment-confirm-location"
              :summary="savedAirEnvironmentSummary"
              :needs-confirmation="airEnvironmentNeedsConfirmation"
              @edit="openAirEnvironmentEditor"
              @confirm="confirmAirEnvironmentLocation"
            />
            <view
              v-if="airEnvironmentNeedsConfirmation && airEnvironmentEditorOpen"
              id="watering-advisor-air-environment-location-confirmation"
              class="mb-3 rounded-xl bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#9a5a14]"
            >
              <text class="block">植物位置可能已变化，已带入旧资料；请确认或修改后再继续。</text>
              <button
                id="watering-advisor-air-environment-confirm-location"
                class="mt-2 h-8 rounded-lg border border-[#b86d1b] bg-white px-3 text-xs font-semibold leading-8 text-[#9a5a14]"
                @click="confirmAirEnvironmentLocation"
              >
                确认当前位置未变
              </button>
            </view>
            <AirEnvironmentAssessment
              v-if="!showSavedAirEnvironmentSummary || airEnvironmentEditorOpen"
              id-prefix="watering-advisor-air-environment"
              layout-mode="single-page"
              height-mode="content"
              :model-value="airEnvironmentDraft"
              footer-position="fixed"
              back-label="上一步"
              back-id="watering-advisor-air-environment-back"
              completion-label="下一步：输入盆型"
              completion-id="watering-advisor-air-environment-next"
              @change="handleAirEnvironmentChange"
              @back="goToSourceStep"
              @complete="goToPotProfile"
            />
            <text
              v-if="airEnvironmentLoadError"
              id="watering-advisor-air-environment-load-error"
              class="mt-3 block text-xs text-[#b45309]"
            >
              {{ airEnvironmentLoadError }}，可直接重新填写
            </text>
          </scroll-view>
          <scroll-view
            v-if="active && index === potProfileStep"
            scroll-y
            class="box-border h-full min-h-0 px-4 pt-6 pb-[112px]"
          >
            <view class="mb-4">
              <text class="block text-[20px] font-bold leading-7 text-[#1f2937]">盆型信息</text>
              <text class="mt-1 block text-[13px] text-[#6b7280]">
                尺寸用于估算水量，基质和排水孔影响浇水策略
              </text>
            </view>
            <view
              class="mb-4 flex items-center gap-3 rounded-2xl border border-[#e1e9dd] bg-white p-3"
            >
              <image
                v-if="selectedCatalogPlant?.imageUrl"
                :src="selectedCatalogPlant.imageUrl"
                class="h-10 w-10 rounded-lg object-cover"
                mode="aspectFill"
              />
              <view
                v-else
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0f4ed]"
              >
                <text class="text-[16px]">🌿</text>
              </view>
              <text class="flex-1 text-[14px] font-medium text-[#1f2933]">
                {{ selectedCatalogPlantName }}
              </text>
            </view>
            <PotProfileFormCore
              ref="potProfileFormRef"
              :initial-profile="selectedCatalogPlantPotProfile"
              :id-prefix="'watering-advisor-pot-profile'"
            />
          </scroll-view>
          <scroll-view
            v-if="active && index === resultStep"
            scroll-y
            class="box-border h-full min-h-0 px-4 pt-6 pb-[112px]"
          >
            <view v-if="computing" class="flex flex-col items-center justify-center py-20">
              <text class="text-[14px] text-[#9ca3af]">正在计算浇水建议...</text>
            </view>
            <view v-else-if="plannerResult" class="pb-6">
              <view
                v-if="isUserPlant && airEnvironmentSyncMessage"
                id="watering-advisor-air-environment-sync-status"
                class="mb-3 rounded-2xl border border-[rgba(45,122,79,0.14)] bg-white px-4 py-3"
              >
                <text class="block text-xs leading-5 text-[#5a7a68]">{{
                  airEnvironmentSyncMessage
                }}</text>
                <button
                  v-if="airEnvironmentSyncState === 'failed'"
                  id="watering-advisor-air-environment-retry-save"
                  class="mt-2 h-8 rounded-lg border border-[#2d7a4f] bg-white px-3 text-xs font-semibold leading-8 text-[#2d7a4f]"
                  @click="retryAirEnvironmentSave"
                >
                  重试保存
                </button>
              </view>
              <view
                id="watering-advisor-result-amount"
                class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white p-6 text-center"
              >
                <text class="block text-[22px] font-bold text-[#2d7a4f]">
                  {{ amountText || '暂无建议' }}
                </text>
              </view>
              <view
                v-if="plannerResult?.soilCheck?.message"
                id="watering-advisor-result-soil-check"
                class="mb-3 rounded-2xl border border-[#d7e6dc] bg-white px-4 py-3"
              >
                <text class="block text-sm font-semibold text-[#2d7a4f]">浇水前先看盆土</text>
                <text class="mt-1 block text-xs leading-5 text-[#5a7868]">
                  {{ plannerResult.soilCheck.message }}
                </text>
              </view>
              <view
                v-if="!plannerResult.nextWaterDate && !wateringConfirmed"
                id="watering-advisor-result-no-history"
                class="mb-3 rounded-2xl border border-[#f0dfbd] bg-[#fffaf0] px-4 py-3"
              >
                <text class="block text-sm font-semibold text-[#9a6a20]">暂不安排下一次日期</text>
                <text class="mt-1 block text-xs leading-5 text-[#8a6b36]">
                  当前没有上次浇水记录，建议先观察盆土；完成本次浇水后，后续提醒会从这次记录开始计算。
                </text>
              </view>
              <view
                v-if="!isUserPlant && !wateringConfirmed"
                id="watering-advisor-result-confirm-watered"
                class="mb-3 rounded-2xl border border-[#d7e6dc] bg-white px-4 py-3"
              >
                <text class="block text-sm font-semibold text-[#2d7a4f]">完成浇水后再记录</text>
                <text class="mt-1 block text-xs leading-5 text-[#5a7868]">
                  如果你今天已经按建议完成浇水，点这里记录；下次建议会把今天作为上次浇水日。
                </text>
                <button
                  id="watering-advisor-result-confirm-watered-button"
                  class="mt-2 h-9 rounded-lg bg-[#2d7a4f] px-3 text-xs font-semibold leading-9 text-white"
                  @click="confirmWatered"
                >
                  我已完成浇水
                </button>
              </view>
              <view
                v-if="wateringConfirmed"
                id="watering-advisor-result-confirm-watered-success"
                class="mb-3 rounded-2xl border border-[#d7e6dc] bg-[#f2faf4] px-4 py-3"
              >
                <text class="block text-sm font-semibold text-[#2d7a4f]">已记录本次浇水</text>
                <text class="mt-1 block text-xs leading-5 text-[#5a7868]">
                  下次建议会从今天的浇水记录开始计算。
                </text>
              </view>
              <view class="mb-3 rounded-2xl border border-[#e1e9dd] bg-white px-4 py-3">
                <text class="block text-xs font-semibold text-[#53645a]">建议依据</text>
                <text class="mt-1 block text-xs leading-5 text-[#718075]">
                  {{
                    plannerResult.confidenceLevel === 'low'
                      ? '当前信息较少，建议主要以盆土实际状态为准。'
                      : '建议主要依据植物属级资料和当前填写的盆、土、环境信息，仍请结合盆土确认。'
                  }}
                </text>
              </view>
            </view>
            <view v-else class="flex flex-col items-center justify-center py-20">
              <text class="text-[14px] text-[#9ca3af]">暂无建议结果</text>
            </view>
          </scroll-view>
        </template>
      </ButtonStepTrack>
      <view
        v-if="activeStep === STEP_SOURCE"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3"
      >
        <button
          id="watering-advisor-next-button"
          class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          :class="{ 'opacity-50': !selectedCatalogPlant || (isUserPlant && airEnvironmentLoading) }"
          :disabled="!selectedCatalogPlant || (isUserPlant && airEnvironmentLoading)"
          @click="goToNextStep"
        >
          {{ isUserPlant && airEnvironmentLoading ? '正在读取植物资料…' : '下一步：输入盆型' }}
        </button>
      </view>
      <view
        v-else-if="
          activeStep === AIR_ENVIRONMENT_STEP &&
          isUserPlant &&
          showSavedAirEnvironmentSummary &&
          !airEnvironmentEditorOpen
        "
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3"
      >
        <button
          id="watering-advisor-air-environment-back"
          class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
          @click="goToSourceStep"
        >
          上一步
        </button>
        <button
          id="watering-advisor-air-environment-next"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          @click="goToPotProfile"
        >
          下一步：输入盆型
        </button>
      </view>
      <view
        v-else-if="activeStep === potProfileStep"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3"
      >
        <button
          id="watering-advisor-back-1"
          class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
          @click="goBackFromPotProfile"
        >
          上一步
        </button>
        <button
          id="watering-advisor-compute-button"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          :class="{ 'opacity-50': computing }"
          :disabled="computing"
          @click="goToResult"
        >
          {{ computing ? '计算中...' : '获取建议' }}
        </button>
      </view>
      <view
        v-else-if="activeStep === resultStep"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#e1e9dd] bg-[#f8faf9] px-4 pb-5 pt-3"
      >
        <button
          id="watering-advisor-back-2"
          class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
          @click="goBackToPotProfile"
        >
          {{ plannerResult ? '重新输入' : '返回重新输入' }}
        </button>
        <button
          v-if="plannerResult"
          id="watering-advisor-done"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          @click="handleFinishAdvisor"
        >
          完成
        </button>
        <button
          v-else
          id="watering-advisor-empty-retry"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white"
          @click="goBackToPotProfile"
        >
          返回重新输入
        </button>
      </view>
    </view>
  </Layout>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import ButtonStepTrack from '@/components/common/ButtonStepTrack.vue'
import AirEnvironmentAssessment from '@/components/AirEnvironmentAssessment.vue'
import AirEnvironmentSummaryCard from '@/components/AirEnvironmentSummaryCard.vue'
import PotProfileFormCore from '@/components/pot-profile/PotProfileFormCore.vue'
import { useUserStore } from '@/store/user.js'
import { usePlantStore } from '@/store/plants.js'
import { fetchUserPlantWateringPlanner } from '@/api/plants-http.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { createAsyncActionGuard, createLeadingThrottle } from '@/utils/interaction-guard.js'
import CatalogPlantSearch from './components/CatalogPlantSearch.vue'
import { formatMlRangeToBottleText } from '@/utils/water-volume-format.js'
import {
  confirmAdvisorSessionWatered,
  fetchAdhocPlannerResult,
  normalizePlannerResultDate,
  saveAdvisorSession,
  todayStr
} from '@/pages/index/components/watering-reminder-options.js'
import { useWateringAdvisorWeather } from './useWateringAdvisorWeather.js'
import { useUserPlantAirEnvironment } from '@/composables/useUserPlantAirEnvironment.js'
import {
  isAirEnvironmentAnswerReady,
  sanitizeAirEnvironmentInput
} from '@/utils/air-environment.js'
import { useWateringAdvisorAirEnvironment } from './useWateringAdvisorAirEnvironment.js'
import { useWateringAdvisorMyPlants } from './useWateringAdvisorMyPlants.js'
const userStore = useUserStore()
const plantStore = usePlantStore()
const STEP_SOURCE = 0
const AIR_ENVIRONMENT_STEP = 1
const AMOUNT_RANGE_MIN_LENGTH = 2
const activeStep = ref(STEP_SOURCE)
const selectedCatalogPlant = ref(null)
const computing = ref(false)
const plannerResult = ref(null)
const wateringConfirmed = ref(false)
const confirmWateredAction = createAsyncActionGuard()
const searchRef = ref(null)
const potProfileFormRef = ref(null)
const selectedUserPlantId = ref(null)
const airEnvironment = useUserPlantAirEnvironment({ plantStore })
const {
  draft: airEnvironmentDraft,
  loadError: airEnvironmentLoadError,
  loading: airEnvironmentLoading
} = airEnvironment
const { weatherDays, forecastDays, plannerLocationKey, loadWeatherDays } =
  useWateringAdvisorWeather({ selectedCatalogPlant, plantStore, userStore })
const selectedCatalogPlantName = computed(
  () =>
    selectedCatalogPlant.value?.primaryDisplayName ||
    selectedCatalogPlant.value?.canonicalName ||
    '未选择植物'
)
const {
  showMyPlantsList,
  shouldShowMyPlantsLoading,
  handleScrollLower,
  handleMyPlantsPanelToggle
} = useWateringAdvisorMyPlants({ userStore, plantStore, searchRef })
const isUserPlant = computed(() => Boolean(selectedCatalogPlant.value?.userPlantId))
const {
  airEnvironmentEditorOpen,
  airEnvironmentNeedsConfirmation,
  frozenAirEnvironmentOverride,
  airEnvironmentSyncState,
  showSavedAirEnvironmentSummary,
  savedAirEnvironmentSummary,
  airEnvironmentSyncMessage,
  reset: resetWateringAirEnvironment,
  loadForUserPlant,
  handleChange: handleWateringAirEnvironmentChange,
  openEditor: openAirEnvironmentEditor,
  confirmLocation: confirmAirEnvironmentLocation,
  freezeAndSync: freezeAndSyncAirEnvironment,
  retrySave: retryAirEnvironmentSave
} = useWateringAdvisorAirEnvironment({
  airEnvironment,
  selectedCatalogPlant,
  isUserPlant
})
const potProfileStep = computed(() => (isUserPlant.value ? 2 : 1))
const resultStep = computed(() => (isUserPlant.value ? 3 : 2))
const stepLabels = computed(() =>
  isUserPlant.value ? ['选植物', '空气', '盆型', '建议'] : ['选植物', '盆型', '建议']
)
const selectedCatalogPlantPotProfile = computed(() => {
  const plant = selectedCatalogPlant.value
  if (!plant?.userPlantId) {
    return null
  }
  const userPlant = plantStore.userPlants?.find(item => item.id === plant.userPlantId)
  return userPlant?.potProfile || null
})
const amountText = computed(() => {
  const range = plannerResult.value?.amountRangeMl
  if (!range || !Array.isArray(range) || range.length < AMOUNT_RANGE_MIN_LENGTH) {
    return ''
  }
  return formatMlRangeToBottleText(range)
})
function selectCatalogPlant(plant) {
  selectedCatalogPlant.value = plant
  selectedUserPlantId.value = null
  wateringConfirmed.value = false
  airEnvironment.reset()
  resetWateringAirEnvironment()
}
async function selectUserPlant(plant) {
  selectedUserPlantId.value = plant.id
  selectedCatalogPlant.value = {
    plantIdentityId: plant.plantIdentityId || '',
    sessionPlantId: plant.sessionPlantId || '',
    imageUrl: plant.image || '',
    primaryDisplayName: plant.displayName || '未命名植物',
    canonicalName: plant.canonicalName || '',
    plantGenus: plant.genus || '',
    userPlantId: plant.id,
    careLocationId: plant.careLocationId || '',
    locationKey: plant.locationKey || '',
    wateringEvents: plant.wateringEvents || null,
    lightEnvironment: plant.lightEnvironment || null,
    potProfile: plant.potProfile || null
  }
  wateringConfirmed.value = false
  airEnvironment.reset(plant.id)
  await loadForUserPlant(plant.id)
}
function goToNextStep() {
  if (!selectedCatalogPlant.value) {
    uni.showToast({ title: '请先选择植物', icon: 'none' })
    return
  }
  activeStep.value = isUserPlant.value ? AIR_ENVIRONMENT_STEP : potProfileStep.value
}
function goToPotProfile() {
  if (!isAirEnvironmentAnswerReady(airEnvironment.draft.value)) {
    uni.showToast({ title: '请完成空气环境信息', icon: 'none' })
    return
  }
  if (airEnvironmentNeedsConfirmation.value) {
    uni.showToast({ title: '请确认植物位置或修改空气环境', icon: 'none' })
    return
  }
  freezeAndSyncAirEnvironment()
  activeStep.value = potProfileStep.value
}
function goToSourceStep() {
  activeStep.value = STEP_SOURCE
}
function goBackToPotProfile() {
  activeStep.value = potProfileStep.value
}
function goBackFromPotProfile() {
  activeStep.value = isUserPlant.value ? AIR_ENVIRONMENT_STEP : STEP_SOURCE
}
function handleAirEnvironmentChange(value) {
  handleWateringAirEnvironmentChange(value)
}
watch(activeStep, step => {
  if (step === potProfileStep.value) {
    nextTick(() => {
      potProfileFormRef.value?.initCanvas()
    })
  }
})
function buildPotProfilePayload() {
  return potProfileFormRef.value?.getPayload() || null
}
async function goToResult() {
  const payload = buildPotProfilePayload()
  if (!payload || !payload.potTopDiameterCm || !payload.potHeightCm) {
    uni.showToast({ title: '请填写盆型尺寸', icon: 'none' })
    return
  }
  computing.value = true
  plannerResult.value = null
  wateringConfirmed.value = false
  activeStep.value = resultStep.value
  try {
    await loadWeatherDays()
    const selectedUserPlant = Boolean(selectedCatalogPlant.value?.userPlantId)
    const airEnvironmentOverride = selectedUserPlant
      ? frozenAirEnvironmentOverride.value ||
        sanitizeAirEnvironmentInput(airEnvironment.draft.value)
      : null
    if (selectedUserPlant && !isAirEnvironmentAnswerReady(airEnvironmentOverride)) {
      uni.showToast({ title: '请完成空气环境信息', icon: 'none' })
      activeStep.value = AIR_ENVIRONMENT_STEP
      return
    }
    let result
    if (selectedUserPlant) {
      const userPlannerResult = await fetchUserPlantWateringPlanner({
        plantId: selectedCatalogPlant.value.userPlantId,
        wateringEvents: selectedCatalogPlant.value.wateringEvents,
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value,
        potProfile: payload,
        airEnvironmentOverride,
        locationKey: plannerLocationKey.value,
        timezone: 'Asia/Shanghai'
      })
      result = userPlannerResult ? normalizePlannerResultDate(userPlannerResult) : null
    } else {
      const catalogPlantId =
        selectedCatalogPlant.value?.plantIdentityId ||
        selectedCatalogPlant.value?.sessionPlantId ||
        ''
      result = await fetchAdhocPlannerResult({
        catalogPlantId,
        potProfile: payload,
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value,
        locationKey: plannerLocationKey.value,
        timezone: 'Asia/Shanghai'
      })
    }
    if (result) {
      plannerResult.value = result
      reportAnalyticsEvent(ANALYTICS_EVENTS.WATERING_PLAN_READY)
      if (!selectedUserPlant) {
        try {
          const catalogPlantId =
            selectedCatalogPlant.value?.plantIdentityId ||
            selectedCatalogPlant.value?.sessionPlantId ||
            ''
          await saveAdvisorSession({
            catalogPlantId,
            catalogPlantName: selectedCatalogPlantName.value,
            potProfile: payload,
            weatherSummary: result.weatherSummary || {},
            plannerResult: result.plannerResult || result
          })
        } catch {
          // 保存历史仅用于下次打开时回显，不影响本次已生成的建议。
        }
      }
    } else {
      uni.showToast({ title: '计算失败，请重试', icon: 'none' })
      activeStep.value = potProfileStep.value
    }
  } catch {
    uni.showToast({ title: '计算失败，请重试', icon: 'none' })
    activeStep.value = potProfileStep.value
  } finally {
    computing.value = false
  }
}
function finishAdvisor() {
  uni.navigateBack()
}
const handleFinishAdvisor = createLeadingThrottle(finishAdvisor, 500)
function confirmWatered() {
  return confirmWateredAction.run(async () => {
    if (isUserPlant.value || wateringConfirmed.value) {
      return
    }
    const catalogPlantId =
      selectedCatalogPlant.value?.plantIdentityId ||
      selectedCatalogPlant.value?.sessionPlantId ||
      ''
    if (!catalogPlantId) {
      uni.showToast({ title: '缺少植物信息，暂时无法记录', icon: 'none' })
      return
    }
    try {
      await confirmAdvisorSessionWatered({ catalogPlantId, wateredDate: todayStr() })
      reportAnalyticsEvent(ANALYTICS_EVENTS.WATERING_RECORDED)
      wateringConfirmed.value = true
    } catch {
      uni.showToast({ title: '浇水记录暂未保存，请检查网络后重试', icon: 'none' })
    }
  })
}
function loadInitialCatalog() {
  searchRef.value?.loadPlants('')
}

onShow(() => {
  // Refresh when returning to this page after the child ref already exists.
  loadInitialCatalog()
})
</script>
