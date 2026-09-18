<template>
  <Layout title="浇水建议" left-action="back" background-class="bg-[#f8faf9]">
    <view
      v-if="featureUnavailable"
      id="watering-advisor-unavailable"
      class="flex min-h-[520px] items-center justify-center bg-[#f8faf9] px-6 text-center"
    >
      <text class="text-sm leading-6 text-[#667085]">当前端暂未开放浇水提醒，敬请期待。</text>
    </view>
    <view v-else class="flex h-screen min-h-0 flex-col bg-[#f8faf9]">
      <view class="flex items-start px-5 pt-4 pb-2">
        <view
          v-for="(label, index) in stepLabels"
          :key="index"
          class="flex min-w-0 flex-1 items-start"
        >
          <view class="flex min-w-0 flex-1 flex-col items-center">
            <view
              class="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold"
              :class="
                index <= activeStep ? 'bg-[#2d7a4f] text-white' : 'bg-[#e1e9dd] text-[#53645a]'
              "
            >
              {{ index + 1 }}
            </view>
            <text
              class="mt-1 whitespace-nowrap text-[12px] leading-4"
              :class="index <= activeStep ? 'font-semibold text-[#1f2933]' : 'text-[#9ca3af]'"
            >
              {{ label }}
            </text>
          </view>
          <view
            v-if="index < stepLabels.length - 1"
            class="mx-1 mt-3 h-[1px] flex-1 bg-[#dbe7de]"
          />
        </view>
      </view>
      <ButtonStepTrack
        id="watering-advisor-swiper"
        :active-index="activeStep"
        :step-count="stepLabels.length"
        viewport-class="w-full"
        item-class="relative min-h-0 overflow-hidden"
        active-item-class="h-full"
        @step-change="resetWateringStepScroll"
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
            :scroll-top="stepScrollTop"
            :scroll-with-animation="false"
            class="box-border h-full min-h-0 px-4 pt-4 pb-[112px]"
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
            :scroll-top="stepScrollTop"
            :scroll-with-animation="false"
            class="box-border h-full min-h-0 px-4 pt-4 pb-[112px]"
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
                <image :src="plantLeafIcon" class="h-5 w-5" mode="aspectFit" />
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
            v-if="active && index === soilEvidenceStep"
            scroll-y
            :scroll-top="stepScrollTop"
            :scroll-with-animation="false"
            class="box-border h-full min-h-0 px-4 pt-4 pb-[112px]"
          >
            <WateringSoilEvidenceStage
              ref="soilEvidenceStageRef"
              :key="soilEvidenceResetKey"
              :plant-id="selectedCatalogPlant?.userPlantId || null"
              :continue-request="soilEvidenceContinueRequest"
              :show-continue="false"
              :show-analysis-confirm="false"
              :enable-interior-check="!isUserPlant"
              :environment-weather-window="wateringAdvisorWeatherWindow"
              @ready="handleSoilEvidenceReady"
              @change="handleSoilEvidenceChange"
            />
          </scroll-view>
          <scroll-view
            v-if="active && index === resultStep"
            scroll-y
            :scroll-top="stepScrollTop"
            :scroll-with-animation="false"
            class="box-border h-full min-h-0 px-4 pt-4 pb-[112px]"
          >
            <view v-if="computing" class="flex flex-col items-center justify-center py-20">
              <text class="text-[14px] text-[#9ca3af]">正在计算浇水建议...</text>
            </view>
            <view v-else-if="plannerResult" class="flex flex-col gap-3 pb-6">
              <view
                v-if="isUserPlant && airEnvironmentSyncMessage"
                id="watering-advisor-air-environment-sync-status"
                class="rounded-[20px] border border-[rgba(45,122,79,0.14)] bg-white px-4 py-3 shadow-[0_2px_10px_rgba(45,122,79,0.04)]"
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
                class="rounded-[24px] border border-[#d7e6dc] bg-white px-5 py-6 text-center shadow-[0_8px_24px_rgba(45,122,79,0.08)]"
              >
                <text class="block break-words text-[30px] font-bold leading-[1.35] text-[#2d7a4f]">
                  {{ amountText || '暂无建议' }}
                </text>
              </view>
              <WateringSoilVisualDecision
                v-if="wateringSoilDecision.resultText || wateringSoilDecision.actionText"
                result-label="盆土综合判断"
                action-label="浇水建议"
                :result-text="wateringSoilDecision.resultText"
                :action-text="wateringSoilDecision.actionText"
              />
              <view
                v-if="isUserPlant && !plannerResult.nextWaterDate && !wateringConfirmed"
                id="watering-advisor-result-no-history"
                class="rounded-[20px] border border-l-4 border-[#f0dfbd] border-l-[#d89b3d] bg-[#fffaf0] px-4 py-3"
              >
                <text class="block text-sm font-semibold text-[#9a6a20]">暂不安排下一次日期</text>
                <text class="mt-1 block text-xs leading-5 text-[#8a6b36]">
                  当前没有上次浇水记录，建议先观察盆土；完成本次浇水后，后续提醒会从这次记录开始计算。
                </text>
              </view>
              <view
                v-if="isUserPlant && !wateringConfirmed && !isOverWateringBlocked"
                id="watering-advisor-result-confirm-watered"
                class="rounded-[20px] border border-[#d7e6dc] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(45,122,79,0.04)]"
              >
                <text class="block text-sm font-semibold text-[#2d7a4f]">完成浇水后再记录</text>
                <text class="mt-1 block text-xs leading-5 text-[#5a7868]">
                  如果你今天已经按建议完成浇水，点这里记录；下次建议会把今天作为上次浇水日。
                </text>
                <button
                  id="watering-advisor-result-confirm-watered-button"
                  class="mt-3 h-10 rounded-xl bg-[#2d7a4f] px-3 text-xs font-semibold leading-10 text-white shadow-[0_2px_6px_rgba(45,122,79,0.16)]"
                  @click="confirmWatered"
                >
                  我已完成浇水
                </button>
              </view>
              <view
                v-if="isUserPlant && wateringConfirmed"
                id="watering-advisor-result-confirm-watered-success"
                class="rounded-[20px] border border-[#d7e6dc] bg-[#f2faf4] px-4 py-3"
              >
                <text class="block text-sm font-semibold text-[#2d7a4f]">已记录本次浇水</text>
                <text class="mt-1 block text-xs leading-5 text-[#5a7868]">
                  下次建议会从今天的浇水记录开始计算。
                </text>
              </view>
              <view
                v-if="isUserPlant"
                class="rounded-[20px] border border-[#e1e9dd] bg-[#fbfdfb] px-4 py-3"
              >
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
        class="fixed bottom-0 left-0 right-0 z-[100] box-border border-t border-[#dbe7de] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(20,70,40,0.06)]"
      >
        <button
          id="watering-advisor-next-button"
          class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white shadow-[0_2px_8px_rgba(45,122,79,0.18)]"
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
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#dbe7de] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(20,70,40,0.06)]"
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
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white shadow-[0_2px_8px_rgba(45,122,79,0.18)]"
          @click="goToPotProfile"
        >
          下一步：输入盆型
        </button>
      </view>
      <view
        v-else-if="activeStep === potProfileStep"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#dbe7de] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(20,70,40,0.06)]"
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
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white shadow-[0_2px_8px_rgba(45,122,79,0.18)]"
          :class="{ 'opacity-50': computing }"
          :disabled="computing"
          @click="goToSoilEvidence"
        >
          {{ computing ? '计算中...' : '下一步：拍盆土' }}
        </button>
      </view>
      <view
        v-else-if="activeStep === soilEvidenceStep && soilEvidenceAwaitingAnalysis"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border border-t border-[#dbe7de] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(20,70,40,0.06)]"
      >
        <button
          id="watering-soil-confirm-analysis-button"
          class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white shadow-[0_2px_8px_rgba(45,122,79,0.18)]"
          @click="startSoilPhotoAnalysis"
        >
          确认并开始分析
        </button>
      </view>
      <view
        v-else-if="activeStep === soilEvidenceStep && soilEvidence?.evidenceId && !computing"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border border-t border-[#dbe7de] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(20,70,40,0.06)]"
      >
        <button
          id="watering-soil-continue-button"
          class="m-0 h-[52px] w-full rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white shadow-[0_2px_8px_rgba(45,122,79,0.18)]"
          :class="{ 'opacity-50': !soilEvidenceCanContinue || computing }"
          :disabled="!soilEvidenceCanContinue || computing"
          @click="continueSoilEvidence"
        >
          继续查看建议
        </button>
      </view>
      <view
        v-else-if="activeStep === resultStep"
        class="fixed bottom-0 left-0 right-0 z-[100] box-border flex gap-3 border-t border-[#dbe7de] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(20,70,40,0.06)]"
      >
        <button
          id="watering-advisor-back-2"
          class="m-0 h-[52px] flex-1 rounded-2xl border border-[#2d7a4f] bg-white p-0 text-base font-bold leading-[52px] text-[#2d7a4f]"
          :disabled="computing"
          @click="goBackToPotProfile"
        >
          {{ plannerResult ? '重新输入' : '返回重新输入' }}
        </button>
        <button
          v-if="plannerResult"
          id="watering-advisor-done"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white shadow-[0_2px_8px_rgba(45,122,79,0.18)]"
          @click="handleFinishAdvisor"
        >
          完成
        </button>
        <button
          v-else
          id="watering-advisor-empty-retry"
          class="m-0 h-[52px] flex-[2] rounded-2xl bg-[#2d7a4f] p-0 text-base font-bold leading-[52px] text-white shadow-[0_2px_8px_rgba(45,122,79,0.18)]"
          @click="goBackToPotProfile"
        >
          返回重新输入
        </button>
      </view>
    </view>
    <FeatureUnavailableModal v-model="featureUnavailableVisible" :feature-key="openedFeatureKey" />
  </Layout>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { onShow, onUnload } from '@dcloudio/uni-app'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import ButtonStepTrack from '@/components/common/ButtonStepTrack.vue'
import AirEnvironmentAssessment from '@/components/AirEnvironmentAssessment.vue'
import AirEnvironmentSummaryCard from '@/components/AirEnvironmentSummaryCard.vue'
import PotProfileFormCore from '@/components/pot-profile/PotProfileFormCore.vue'
import WateringSoilEvidenceStage from '@/components/watering/WateringSoilEvidenceStage.vue'
import WateringSoilVisualDecision from '@/components/watering/WateringSoilVisualDecision.vue'
import plantLeafIcon from '@/assets/diagnosis/diagnosis-leaf.svg'
import { requestStorageFileDelete } from '@/http-functions/storage/client.js'
import { cleanupTemporaryWateringSoilEvidence } from '@/http-functions/diagnose/watering-soil.js'
import { useUserStore } from '@/store/user.js'
import { callComponentMethod } from '@/utils/component-ref.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isFeatureAvailable } from '@/utils/platform-capabilities.js'
import { usePlantStore } from '@/store/plants.js'
import { fetchUserPlantWateringPlanner } from '@/api/plants-http.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'
import { createAsyncActionGuard, createLeadingThrottle } from '@/utils/interaction-guard.js'
import CatalogPlantSearch from './components/CatalogPlantSearch.vue'
import { formatMlRangeToBottleText } from '@/utils/water-volume-format.js'
import { buildWateringSoilDecision } from '@/utils/watering-soil-decision.js'
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
import {
  buildAdvisorPlantCreateUrl,
  confirmSaveIndependentPlant
} from './useIndependentWateringExit.js'
const userStore = useUserStore()
const plantStore = usePlantStore()
const featureUnavailable = !isFeatureAvailable('watering')
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()
const STEP_SOURCE = 0
const AIR_ENVIRONMENT_STEP = 1
const AMOUNT_RANGE_MIN_LENGTH = 2
const INITIAL_SCROLL_TOP = 0
const STEP_SCROLL_RESET_PULSE = 1
const activeStep = ref(STEP_SOURCE)
const stepScrollTop = ref(INITIAL_SCROLL_TOP)
const selectedCatalogPlant = ref(null)
const computing = ref(false)
const plannerResult = ref(null)
const soilEvidence = ref(null)
const soilEvidenceResetKey = ref(0)
const soilEvidenceContinueRequest = ref(0)
const soilEvidenceStageRef = ref(null)
const soilEvidenceAwaitingAnalysis = ref(false)
const soilEvidenceCanContinue = ref(false)
const pendingPotProfile = ref(null)
const wateringConfirmed = ref(false)
const independentExitPending = ref(false)
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
const {
  weatherDays,
  forecastDays,
  plannerLocationKey,
  loadWeatherDays,
  resetWeatherDays,
  prepareWeatherOnEntry,
  locationPermissionStatus
} = useWateringAdvisorWeather({ selectedCatalogPlant, plantStore, userStore })
const wateringAdvisorWeatherWindow = computed(() => ({
  historicalDays: weatherDays.value,
  forecastDays: forecastDays.value
}))
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
const soilEvidenceStep = computed(() => potProfileStep.value + 1)
const resultStep = computed(() => soilEvidenceStep.value + 1)
const stepLabels = computed(() =>
  isUserPlant.value
    ? ['选植物', '空气', '盆型', '盆土', '建议']
    : ['选植物', '盆型', '盆土', '建议']
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
const isOverWateringBlocked = computed(
  () => plannerResult.value?.wateringContext === 'likely_too_wet'
)
const wateringSoilDecision = computed(() => {
  return buildWateringSoilDecision({
    visualSoilEvidence: plannerResult.value?.visualSoilEvidence,
    soilCheck: plannerResult.value?.soilCheck,
    wateringContext: plannerResult.value?.wateringContext,
    wateringAction: plannerResult.value?.action
  })
})
function selectCatalogPlant(plant) {
  if (computing.value) {
    return
  }
  selectedCatalogPlant.value = plant
  selectedUserPlantId.value = null
  wateringConfirmed.value = false
  soilEvidence.value = null
  soilEvidenceAwaitingAnalysis.value = false
  soilEvidenceCanContinue.value = false
  pendingPotProfile.value = null
  airEnvironment.reset()
  resetWateringAirEnvironment()
  resetWeatherDays()
}
async function selectUserPlant(plant) {
  if (computing.value) {
    return
  }
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
  soilEvidence.value = null
  soilEvidenceAwaitingAnalysis.value = false
  soilEvidenceCanContinue.value = false
  pendingPotProfile.value = null
  airEnvironment.reset(plant.id)
  resetWeatherDays()
  await loadForUserPlant(plant.id)
}
function goToNextStep() {
  if (!selectedCatalogPlant.value) {
    uni.showToast({ title: '请先选择植物', icon: 'none' })
    return
  }
  activeStep.value = isUserPlant.value ? AIR_ENVIRONMENT_STEP : potProfileStep.value
}

async function resetWateringStepScroll() {
  stepScrollTop.value = STEP_SCROLL_RESET_PULSE
  await nextTick()
  stepScrollTop.value = INITIAL_SCROLL_TOP
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
  if (computing.value) {
    return
  }
  activeStep.value = STEP_SOURCE
}
function goBackToPotProfile() {
  if (computing.value) {
    return
  }
  activeStep.value = potProfileStep.value
}
function goBackFromPotProfile() {
  if (computing.value) {
    return
  }
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
function goToSoilEvidence() {
  const payload = buildPotProfilePayload()
  if (!payload || !payload.potTopDiameterCm || !payload.potHeightCm) {
    uni.showToast({ title: '请填写盆型尺寸', icon: 'none' })
    return
  }
  pendingPotProfile.value = payload
  soilEvidence.value = null
  soilEvidenceAwaitingAnalysis.value = false
  soilEvidenceCanContinue.value = false
  activeStep.value = soilEvidenceStep.value
}

async function prepareSoilCalendarWeather() {
  if (isUserPlant.value) {
    return false
  }
  const prepared = await prepareWeatherOnEntry()
  if (!prepared) {
    return false
  }
  if (!weatherDays.value.length || !forecastDays.value.length) {
    await loadWeatherDays()
  }
  return true
}

async function handleSoilEvidenceReady(value) {
  if (computing.value || independentExitPending.value) {
    return
  }
  soilEvidence.value = value || null
  // 盆土页只展示视觉证据，不在这里弹窗或改变证据；统一交给 advisor
  // 计算，湿润提醒在最终建议页展示。
  await goToResult()
}

function handleSoilEvidenceChange(value) {
  soilEvidenceAwaitingAnalysis.value = value?.awaitingAnalysis === true
  soilEvidenceCanContinue.value = value?.canContinue === true
  const evidenceId = String(value?.evidenceId || '').trim()
  if (!evidenceId) {
    return
  }
  const previousEvidenceId = String(soilEvidence.value?.evidenceId || '').trim()
  // 上传/分析完成即同步父页面的当前证据，避免组件内已换图但最终计算仍提交上一次 ID。
  soilEvidence.value = {
    ...(soilEvidence.value || {}),
    ...value,
    evidenceId
  }
  if (evidenceId && !previousEvidenceId) {
    prepareSoilCalendarWeather().catch(() => {})
  }
}

function startSoilPhotoAnalysis() {
  callComponentMethod(soilEvidenceStageRef, 'startPhotoAnalysis')
}

function continueSoilEvidence() {
  if (!soilEvidence.value?.evidenceId || !soilEvidenceCanContinue.value || computing.value) {
    return
  }
  soilEvidenceContinueRequest.value += 1
}

function resetSoilEvidenceSubmission() {
  callComponentMethod(soilEvidenceStageRef, 'resetSubmissionGuard')
}

async function cleanupAdhocSoilEvidenceAfterClientFailure() {
  const evidenceId = String(soilEvidence.value?.evidenceId || '').trim()
  const fileId = String(soilEvidence.value?.temporaryFileId || '').trim()
  await Promise.all([
    evidenceId
      ? cleanupTemporaryWateringSoilEvidence(evidenceId).catch(() => {})
      : Promise.resolve(),
    fileId ? requestStorageFileDelete({ fileId }).catch(() => {}) : Promise.resolve()
  ])
}

async function goToResult() {
  // 盆土组件的完成事件、快速双击或异常重放都不能并发消费同一张临时盆土图。
  // 成功请求会清理该图；第二个请求若继续执行，就会把成功结果误替换成“照片过期”。
  if (computing.value) {
    return
  }
  const payload = pendingPotProfile.value || buildPotProfilePayload()
  if (!soilEvidence.value?.evidenceId) {
    uni.showToast({ title: '请先拍摄盆土照片', icon: 'none' })
    resetSoilEvidenceSubmission()
    activeStep.value = soilEvidenceStep.value
    return
  }
  computing.value = true
  plannerResult.value = null
  wateringConfirmed.value = false
  activeStep.value = resultStep.value
  try {
    await prepareWeatherOnEntry()
    if (
      locationPermissionStatus.value === 'authorized' &&
      (!weatherDays.value.length || !forecastDays.value.length)
    ) {
      await loadWeatherDays()
    }
    const selectedUserPlant = Boolean(selectedCatalogPlant.value?.userPlantId)
    const airEnvironmentOverride = selectedUserPlant
      ? frozenAirEnvironmentOverride.value ||
        sanitizeAirEnvironmentInput(airEnvironment.draft.value)
      : null
    if (selectedUserPlant && !isAirEnvironmentAnswerReady(airEnvironmentOverride)) {
      uni.showToast({ title: '请完成空气环境信息', icon: 'none' })
      resetSoilEvidenceSubmission()
      activeStep.value = AIR_ENVIRONMENT_STEP
      return
    }
    let result
    if (selectedUserPlant) {
      const userPlannerResult = await fetchUserPlantWateringPlanner({
        plantId: selectedCatalogPlant.value.userPlantId,
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value,
        potProfile: payload,
        airEnvironmentOverride,
        locationKey: plannerLocationKey.value,
        timezone: 'Asia/Shanghai',
        soilEvidenceId: soilEvidence.value.evidenceId,
        manualSoilConfirmed: soilEvidence.value.manualSoilConfirmed === true,
        forced: soilEvidence.value.forced === true,
        soilMoistureOverride: soilEvidence.value.soilMoistureOverride || '',
        wateringEvents: selectedCatalogPlant.value.wateringEvents || [],
        hasWateringHistoryInput: soilEvidence.value.hasWateringHistoryInput === true
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
        timezone: 'Asia/Shanghai',
        soilEvidenceId: soilEvidence.value.evidenceId,
        manualSoilConfirmed: soilEvidence.value.manualSoilConfirmed === true,
        forced: soilEvidence.value.forced === true,
        soilMoistureOverride: soilEvidence.value.soilMoistureOverride || '',
        wateringEvents: soilEvidence.value.wateringEvents || [],
        hasWateringHistoryInput: soilEvidence.value.hasWateringHistoryInput === true
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
      resetSoilEvidenceSubmission()
      activeStep.value = potProfileStep.value
    }
  } catch (error) {
    if (Number(error?.statusCode) === 422 && String(error?.message || '').includes('过期')) {
      soilEvidence.value = null
      soilEvidenceAwaitingAnalysis.value = false
      plannerResult.value = null
      soilEvidenceResetKey.value += 1
      resetSoilEvidenceSubmission()
      activeStep.value = soilEvidenceStep.value
      uni.showToast({ title: '盆土照片已过期，请重新拍摄', icon: 'none' })
      return
    }
    if (!selectedCatalogPlant.value?.userPlantId) {
      await cleanupAdhocSoilEvidenceAfterClientFailure()
    }
    uni.showToast({ title: '计算失败，请重试', icon: 'none' })
    resetSoilEvidenceSubmission()
    activeStep.value = potProfileStep.value
  } finally {
    computing.value = false
  }
}
async function finishIndependentAdvisor() {
  if (independentExitPending.value) {
    return
  }
  independentExitPending.value = true
  const shouldSave = await confirmSaveIndependentPlant()
  await cleanupAdhocSoilEvidenceAfterClientFailure()
  if (!shouldSave) {
    uni.navigateBack()
    return
  }
  const catalogPlantId =
    selectedCatalogPlant.value?.plantIdentityId || selectedCatalogPlant.value?.sessionPlantId || ''
  const url = buildAdvisorPlantCreateUrl({
    catalogPlantId,
    potProfile: pendingPotProfile.value || buildPotProfilePayload()
  })
  if (!url) {
    independentExitPending.value = false
    uni.showToast({ title: '植物或盆型信息不完整，请重试', icon: 'none' })
    return
  }
  uni.redirectTo({
    url,
    fail: () => {
      independentExitPending.value = false
      uni.showToast({ title: '暂时无法打开添加植物页，请重试', icon: 'none' })
    }
  })
}

async function finishAdvisor() {
  if (!selectedCatalogPlant.value?.userPlantId) {
    await finishIndependentAdvisor()
    return
  }
  uni.navigateBack()
}
const handleFinishAdvisor = createLeadingThrottle(finishAdvisor, 500)

onUnload(() => {
  if (!selectedCatalogPlant.value?.userPlantId) {
    cleanupAdhocSoilEvidenceAfterClientFailure()
  }
})
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

let hasShownOnce = false
onShow(() => {
  if (featureUnavailable) {
    openFeatureUnavailable('watering')
    return
  }
  // Child onMounted already performs the first load; only refresh on a real
  // return to the page so the initial lifecycle does not issue two requests.
  if (!hasShownOnce) {
    hasShownOnce = true
    prepareWeatherOnEntry().catch(() => {})
    return
  }
  loadInitialCatalog()
})
</script>
