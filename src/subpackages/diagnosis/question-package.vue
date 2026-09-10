<template>
  <Layout title="继续问诊" left-action="back" background-class="bg-[#f8faf9]">
    <view
      id="diagnose-question-package-page"
      class="relative box-border h-[calc(100vh-var(--app-header-height))] min-h-0 bg-[#f8faf9]"
    >
      <QuestionPackageRestartRequired v-if="packageRestartRequired" @restart="returnPreviousPage" />
      <view
        v-else-if="isQuestionStatePreparing"
        id="diagnose-question-package-preparing"
        class="flex min-h-screen items-center justify-center px-6"
      >
        <text class="text-sm text-gray-500">正在准备问诊…</text>
      </view>
      <template v-else-if="result?.hasActiveQuestions && questionStack.length">
        <scroll-view
          id="diagnose-question-package-page-scroll"
          scroll-y
          :scroll-top="questionPageScrollTop"
          :scroll-with-animation="false"
          class="h-full min-h-0"
        >
          <view class="flex min-h-0 flex-col pt-6">
            <QuestionPackageProgressHeader
              :title="questionDiagnosisContextText"
              :progress="questionProgressText"
            />
            <view
              v-if="currentQuestion && !isCareBehaviorWateringTimelineQuestion(currentQuestion)"
              :id="`diagnose-question-package-page-question-scroll-${getQuestionId(currentQuestion)}`"
              class="w-full"
            >
              <view
                :id="`diagnose-question-package-page-active-question-${getQuestionId(currentQuestion)}`"
                class="pointer-events-none absolute h-0 w-0 overflow-hidden"
              />
              <view
                :id="`diagnose-question-package-page-question-shell-${getQuestionId(currentQuestion)}`"
                class="box-border min-h-full px-4 pb-[112px]"
              >
                <view
                  :id="`diagnose-question-package-page-question-card-${getQuestionId(currentQuestion)}`"
                  class="question-package-card-enter rounded-[20px] border border-emerald-100 bg-white px-4 py-4 shadow-sm"
                >
                  <text
                    v-if="!isLightEnvironmentQuestion(currentQuestion)"
                    class="block text-base font-semibold leading-7 text-[#2d7a4f]"
                  >
                    {{ getQuestionTitle(currentQuestion) }}
                  </text>
                  <text
                    v-if="
                      !isLightEnvironmentQuestion(currentQuestion) &&
                      getQuestionHelpText(currentQuestion)
                    "
                    class="mt-2 block text-xs leading-relaxed text-gray-500"
                  >
                    {{ getQuestionHelpText(currentQuestion) }}
                  </text>
                  <LightEnvironmentPicker
                    v-if="isLightEnvironmentQuestion(currentQuestion)"
                    :key="`light-${getQuestionId(currentQuestion)}`"
                    :question-id="getQuestionId(currentQuestion)"
                    :id-prefix="'diagnose-light'"
                    :plant-name="plantName"
                    :model-value="getLightEnvironmentByQuestion(currentQuestion)"
                    :requires-confirmation="requiresLightEnvironmentConfirmation(currentQuestion)"
                    :confirmed="isLightEnvironmentConfirmed(currentQuestion)"
                    @change="payload => handleLightEnvironmentChange(currentQuestion, payload)"
                    @confirm="payload => confirmLightEnvironment(currentQuestion, payload)"
                  />
                  <QuestionPackageAirEnvironmentStep
                    v-if="isAirEnvironmentQuestion(currentQuestion)"
                    :key="`air-${getQuestionId(currentQuestion)}`"
                    :question="currentQuestion"
                    :question-id="getQuestionId(currentQuestion)"
                    :air-environment="airEnvironmentUi"
                    footer-position="fixed"
                    back-label="上一题"
                    back-id="diagnose-question-package-page-prev-button"
                    :completion-label="nextButtonText"
                    completion-id="diagnose-question-package-page-next-button"
                    external-footer
                    @change="payload => handleAirEnvironmentChange(currentQuestion, payload)"
                    @unknown="selectAirEnvironmentUnknown(currentQuestion)"
                    @edit="openAirEnvironmentEditor(currentQuestion)"
                    @confirm="confirmAirEnvironmentLocation(currentQuestion)"
                    @back="goPreviousQuestion"
                    @complete="handleNextQuestion"
                  />
                  <QuestionPackageOptions
                    v-if="
                      !isAirEnvironmentQuestion(currentQuestion) &&
                      !isLightEnvironmentQuestion(currentQuestion) &&
                      getVisibleCareBehaviorOptions(currentQuestion).length
                    "
                    :key="`options-${getQuestionId(currentQuestion)}`"
                    :question="currentQuestion"
                    :question-id="getQuestionId(currentQuestion)"
                    :options="getVisibleCareBehaviorOptions(currentQuestion)"
                    :selected-option-id="getSelectedQuestionOptionId(currentQuestion)"
                    @select="option => selectQuestionOption(currentQuestion, option)"
                    @skip="option => skipQuestionRisk(currentQuestion, option)"
                  />
                </view>
              </view>
            </view>
            <view
              v-else
              :id="`diagnose-question-package-page-question-scroll-${getQuestionId(currentQuestion)}`"
              class="w-full"
            >
              <view
                :id="`diagnose-question-package-page-active-question-${getQuestionId(currentQuestion)}`"
                class="pointer-events-none absolute h-0 w-0 overflow-hidden"
              />
              <view
                :id="`diagnose-question-package-page-question-shell-${getQuestionId(currentQuestion)}`"
                class="box-border min-h-full px-4 pb-[112px]"
              >
                <view
                  :id="`diagnose-question-package-page-question-card-${getQuestionId(currentQuestion)}`"
                  class="question-package-card-enter rounded-[20px] border border-emerald-100 bg-white px-4 py-4 shadow-sm"
                >
                  <text class="block text-base font-semibold leading-7 text-[#2d7a4f]">
                    {{ getQuestionTitle(currentQuestion) }}
                  </text>
                  <text
                    v-if="getQuestionHelpText(currentQuestion)"
                    class="mt-2 block text-xs leading-relaxed text-gray-500"
                  >
                    {{ getQuestionHelpText(currentQuestion) }}
                  </text>
                  <CareBehaviorTimeline
                    :key="`${getQuestionId(currentQuestion)}-${activeQuestionIndex}`"
                    :question-id="getQuestionId(currentQuestion)"
                    :question="currentQuestion"
                    :timeline="getCareBehaviorTimelineByQuestion(currentQuestion)"
                    :reset-key="getCareBehaviorTimelineResetKey(currentQuestion)"
                    :id-prefix="`diagnose-question-package-${getQuestionId(currentQuestion)}`"
                    :environment-weather-window="environmentWeatherWindow"
                    :weather-by-date="environmentWeatherByDate"
                    :loading="environmentWeatherWindowLoading"
                    :error="environmentWeatherWindowError"
                    :enable-dose-per-date="true"
                    :pot-volume-ml="0"
                    @select-date="handleCareBehaviorTimelineDateSelect(currentQuestion)"
                    @change="payload => handleCareBehaviorTimelineChange(currentQuestion, payload)"
                  />
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
        <view
          class="fixed bottom-0 left-0 right-0 z-30 box-border flex flex-col gap-3 border-t border-emerald-100 bg-[#f8faf9] px-4 pb-5 pt-3"
        >
          <view class="flex gap-3">
            <button
              id="diagnose-question-package-page-prev-button"
              class="h-[52px] flex-1 rounded-xl border border-emerald-100 bg-white p-0 text-[13px] font-bold leading-[52px] text-[#2d6a4f]"
              :class="{
                'opacity-[0.45]': isSubmittingQuestionAnswer || activeQuestionIndex <= 0
              }"
              :disabled="isSubmittingQuestionAnswer || activeQuestionIndex <= 0"
              @click="goPreviousQuestion"
            >
              上一题
            </button>
            <button
              id="diagnose-question-package-page-next-button"
              class="h-[52px] flex-1 rounded-xl border border-[#2d7a4f] bg-[#2d7a4f] p-0 text-[13px] font-bold leading-[52px] text-white"
              :class="{ 'opacity-[0.45]': !canProceedQuestion() }"
              :disabled="!canProceedQuestion()"
              @click="handleNextQuestion"
            >
              {{ nextButtonText }}
            </button>
          </view>
          <button
            v-if="isAirEnvironmentQuestion(questionStack[activeQuestionIndex])"
            :id="`diagnose-air-environment-${getQuestionId(questionStack[activeQuestionIndex])}-unknown`"
            class="h-10 w-full rounded-xl border border-[#b8c9be] bg-white p-0 text-sm font-semibold leading-10 text-[#466054]"
            :disabled="isSubmittingQuestionAnswer"
            @click="selectAirEnvironmentUnknown(questionStack[activeQuestionIndex])"
          >
            不确定，跳过这项
          </button>
        </view>
      </template>
      <QuestionPackageRetake
        v-else-if="result?.retakeRequest"
        :retake-request="retakeRequest"
        :retake-authorization-state="retakeAuthorizationState"
        :retake-countdown-text="retakeCountdownText"
        :retake-expired="retakeExpired"
        :has-active-retake-authorization="hasActiveRetakeAuthorization"
        :files="retakeFiles"
        :can-choose-image="canChooseRetakeImage"
        :can-submit-image="canSubmitRetakeImage"
        :is-submitting-image="isSubmittingRetakeImage"
        :show-restart-action="showRetakeRestartAction"
        @begin="beginRetakeAuthorization"
        @skip="skipRetakeRequest"
        @choose="chooseRetakeImage"
        @remove="removeRetakeImage"
        @submit="submitRetakeImage"
        @restart="returnPreviousPage"
      />
      <scroll-view
        v-else-if="result && !result.hasActiveQuestions && !hasRouteConvergenceDetails"
        scroll-y
        class="h-screen"
      >
        <view
          id="diagnose-question-package-outcome-shell"
          class="box-border min-h-screen px-4 py-6 pb-9"
        >
          <view
            id="diagnose-question-package-outcome-card"
            class="rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-[18px] shadow-sm"
          >
            <text class="block text-[11px] font-black tracking-wide text-[#2d7a4f]"
              >问诊已完成</text
            >
            <text class="mt-2 block text-[21px] font-black leading-snug text-gray-900">{{
              outcomeDisplayTitle || '已形成诊断结论'
            }}</text>
            <text
              v-if="outcomeSummaryText"
              class="mt-2.5 block whitespace-pre-line text-[13px] leading-relaxed text-gray-600"
            >
              {{ outcomeSummaryText }}
            </text>
            <view
              class="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#f8f6f0] px-3 py-3"
            >
              <text class="text-xs font-bold text-gray-500">当前状态</text>
              <text class="text-xs font-black text-[#2d7a4f]">{{
                result.healthStatusText || '待进一步确认'
              }}</text>
            </view>
          </view>
          <DiagnosisFeedbackCard
            :result-id="feedbackResultId"
            id-prefix="diagnose-question-package-outcome-feedback"
          />
          <view
            v-if="actionAdviceGroups.length"
            id="diagnose-question-package-outcome-action-advice"
            class="mt-3.5 rounded-[22px] bg-emerald-50 p-4"
          >
            <text class="block text-[15px] font-black text-gray-900">处理建议</text>
            <view
              v-for="group in actionAdviceGroups"
              :key="group.key"
              data-advice-section="action"
              :data-advice-group-key="group.key"
              class="mb-3 last:mb-0"
            >
              <text
                v-if="group.showOutcomeLabel"
                class="mt-2.5 block text-xs font-extrabold leading-snug text-gray-800"
                >{{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}：</text
              >
              <text
                v-for="(item, index) in group.items"
                :key="`action_${group.key}_${index}`"
                class="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-gray-600"
              >
                {{ index + 1 }}. {{ item }}
              </text>
            </view>
          </view>
          <view
            v-if="avoidAdviceGroups.length"
            id="diagnose-question-package-outcome-avoid-advice"
            class="mt-3.5 rounded-[22px] bg-orange-50 p-4"
          >
            <text class="block text-[15px] font-black text-gray-900">暂时不要做</text>
            <view
              v-for="group in avoidAdviceGroups"
              :key="group.key"
              data-advice-section="avoid"
              :data-advice-group-key="group.key"
              class="mb-3 last:mb-0"
            >
              <text
                v-if="group.showOutcomeLabel"
                class="mt-2.5 block text-xs font-extrabold leading-snug text-gray-800"
                >{{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}：</text
              >
              <text
                v-for="(item, index) in group.items"
                :key="`avoid_${group.key}_${index}`"
                class="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-gray-600"
              >
                {{ index + 1 }}. {{ item }}
              </text>
            </view>
          </view>
        </view>
      </scroll-view>
      <scroll-view v-else-if="hasCompletedDiagnosis" scroll-y class="h-screen">
        <view
          id="diagnose-question-package-result-shell"
          class="box-border min-h-screen px-4 py-6 pb-9"
        >
          <view
            v-if="showNonProblemOutcomeResultCard"
            id="diagnose-question-package-result-card"
            class="rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-[18px] shadow-sm"
          >
            <text class="block text-[11px] font-black tracking-wide text-[#2d7a4f]"
              >问诊已完成</text
            >
            <text
              v-if="nonProblemOutcomeSummaryText"
              class="mt-2.5 block text-[13px] leading-relaxed text-gray-600"
            >
              {{ nonProblemOutcomeSummaryText }}
            </text>
            <view class="mt-4 flex gap-2.5">
              <view class="flex-1 rounded-2xl bg-emerald-50 px-3 py-3">
                <text class="block text-[10px] font-bold text-gray-500">当前状态</text>
                <text class="mt-1 block text-[13px] font-black leading-snug text-[#184d39]">{{
                  outcomeTypeText
                }}</text>
              </view>
            </view>
          </view>
          <view
            v-if="isProblematicOutcome && allOutcomeDisplays.length"
            id="diagnose-question-package-result-outcomes"
            class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-4 shadow-sm"
          >
            <text class="block text-[15px] font-black text-gray-900">诊断结论</text>
            <view class="mt-3 flex flex-wrap gap-2">
              <text
                v-for="(item, index) in allOutcomeDisplays"
                :key="`outcome_${index}`"
                data-diagnosis-outcome-label="true"
                class="rounded-full bg-emerald-50 px-2.5 py-2 text-[11px] font-extrabold leading-none text-[#2d6a4f]"
                >{{ item }}</text
              >
            </view>
          </view>
          <view
            v-if="observedItems.length"
            id="diagnose-question-package-result-observed"
            class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-4 shadow-sm"
          >
            <text class="block text-[15px] font-black text-gray-900">照片中看到</text>
            <view class="mt-3 flex flex-wrap gap-2">
              <text
                v-for="item in observedItems"
                :key="item.key"
                class="rounded-full bg-emerald-50 px-2.5 py-2 text-[11px] font-extrabold leading-none text-[#2d6a4f]"
              >
                {{ item.label }}
              </text>
            </view>
          </view>
          <view
            id="diagnose-question-package-result-action-advice"
            class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-4 shadow-sm"
          >
            <text class="block text-[15px] font-black text-gray-900">建议先这样做</text>
            <view v-if="actionAdviceGroups.length" class="mt-3 flex flex-col gap-2">
              <view
                v-for="group in actionAdviceGroups"
                :key="`action_group_${group.key}`"
                data-advice-section="action"
                :data-advice-group-key="group.key"
                class="mb-2 last:mb-0"
              >
                <text
                  v-if="group.showOutcomeLabel"
                  class="block text-xs font-extrabold leading-snug text-gray-800"
                  >{{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}：</text
                >
                <text
                  v-for="(item, index) in group.items"
                  :key="`action_group_${group.key}_${index}`"
                  class="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-gray-600"
                >
                  {{ index + 1 }}. {{ item }}
                </text>
              </view>
            </view>
            <text v-else class="mt-2.5 block text-xs leading-relaxed text-gray-600"
              >暂时没有更具体的行动建议，建议先保持观察并避免过度处理。</text
            >
          </view>
          <view
            v-if="avoidAdviceGroups.length"
            id="diagnose-question-package-result-avoid-advice"
            class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-4 shadow-sm"
          >
            <text class="block text-[15px] font-black text-gray-900">暂时避免</text>
            <view class="mt-3 flex flex-col gap-2">
              <view
                v-for="group in avoidAdviceGroups"
                :key="`avoid_group_${group.key}`"
                data-advice-section="avoid"
                :data-advice-group-key="group.key"
                class="mb-2 last:mb-0"
              >
                <text
                  v-if="group.showOutcomeLabel"
                  class="block text-xs font-extrabold leading-snug text-gray-800"
                  >{{ group.displayLabel || group.symptomLabel || group.outcomeLabel }}：</text
                >
                <text
                  v-for="(item, index) in group.items"
                  :key="`avoid_group_${group.key}_${index}`"
                  class="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-gray-600"
                >
                  {{ index + 1 }}. {{ item }}
                </text>
              </view>
            </view>
          </view>
          <DiagnosisFeedbackCard
            :result-id="feedbackResultId"
            id-prefix="diagnose-question-package-result-feedback"
          />
        </view>
      </scroll-view>
      <QuestionPackageEmptyState v-else @back="returnPreviousPage" />
      <view
        v-if="!diagnosisFlowAvailable"
        id="diagnose-question-package-unavailable"
        class="absolute inset-0 z-40 flex min-h-screen items-center justify-center bg-[#f8faf9] px-6 text-center"
      >
        <text class="text-sm leading-6 text-[#667085]">当前端暂未开放 AI 植物诊断，敬请期待。</text>
      </view>
      <FeatureUnavailableModal
        v-model="featureUnavailableVisible"
        :feature-key="openedFeatureKey"
      />
    </view>
  </Layout>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Layout from '@/Layout.vue'
import FeatureUnavailableModal from '@/components/FeatureUnavailableModal.vue'
import DiagnosisFeedbackCard from './components/DiagnosisFeedbackCard.vue'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { useUserStore } from '@/store/user.js'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import LightEnvironmentPicker from '@/components/LightEnvironmentPicker.vue'
import QuestionPackageAirEnvironmentStep from './question-package/QuestionPackageAirEnvironmentStep.vue'
import QuestionPackageOptions from './question-package/QuestionPackageOptions.vue'
import QuestionPackageRetake from './question-package/QuestionPackageRetake.vue'
import { useDiagnosisAnswerMutation } from './vue-query/diagnose/mutations/useDiagnosisAnswerMutation.js'
import QuestionPackageEmptyState from './question-package/QuestionPackageEmptyState.vue'
import QuestionPackageRestartRequired from './question-package/QuestionPackageRestartRequired.vue'
import QuestionPackageProgressHeader from './question-package/QuestionPackageProgressHeader.vue'
import { useQuestionPackageFlow } from './question-package/question-flow.js'
import { getQuestionIdentity as getQuestionId } from './utils/diagnose-question-identity.js'
import { getQuestionHelpText, getQuestionTitle } from './question-package/question-display.js'
import { useQuestionPackageResultView } from './question-package/result-view.js'
import { useQuestionPackageRetake } from './question-package/retake-flow.js'
import {
  bindQuestionPackagePageEntry,
  useQuestionPackageContext
} from './question-package/page-context.js'
import { useFeatureUnavailableModal } from '@/utils/feature-registry.js'
import { isDiagnosisFlowAvailable } from '@/utils/platform-capabilities.js'
const diagnoseStore = useDiagnoseStore()
const userStore = useUserStore()
const diagnosisFlowAvailable = computed(() => isDiagnosisFlowAvailable())
const {
  openedFeatureKey,
  visible: featureUnavailableVisible,
  openFeatureUnavailable
} = useFeatureUnavailableModal()
const diagnosisAnswerMutation = useDiagnosisAnswerMutation()
const routeOptions = ref({})
const payload = ref({})
const result = ref(null)
const images = ref([])
const returnPreviousPage = () => uni.navigateBack({ delta: 1 })
const { plantName, questionDiagnosisContextText } = useQuestionPackageContext({
  payload,
  result,
  routeOptions
})
const {
  questionStack,
  activeQuestionIndex,
  currentQuestion,
  questionProgressText,
  nextButtonText,
  isSubmittingQuestionAnswer,
  isQuestionStatePreparing,
  packageRestartRequired,
  environmentWeatherWindow,
  environmentWeatherByDate,
  environmentWeatherWindowLoading,
  environmentWeatherWindowError,
  resetQuestionState,
  getCareBehaviorTimelineByQuestion,
  handleCareBehaviorTimelineChange,
  handleCareBehaviorTimelineDateSelect,
  getCareBehaviorTimelineResetKey,
  getLightEnvironmentByQuestion,
  handleLightEnvironmentChange,
  confirmLightEnvironment,
  isLightEnvironmentConfirmed,
  requiresLightEnvironmentConfirmation,
  openAirEnvironmentEditor,
  confirmAirEnvironmentLocation,
  handleAirEnvironmentChange,
  getVisibleCareBehaviorOptions,
  isCareBehaviorWateringTimelineQuestion,
  isLightEnvironmentQuestion,
  isAirEnvironmentQuestion,
  airEnvironmentUi,
  selectQuestionOption,
  getSelectedQuestionOptionId,
  skipQuestionRisk,
  selectAirEnvironmentUnknown,
  canProceedQuestion,
  goPreviousQuestion,
  handleNextQuestion
} = useQuestionPackageFlow({
  result,
  images,
  plantName,
  payload,
  userStore,
  diagnoseStore,
  diagnosisAnswerMutation
})
const {
  retakeRequest,
  retakeAuthorizationState,
  retakeCountdownText,
  retakeExpired,
  hasActiveRetakeAuthorization,
  retakeFiles,
  canChooseRetakeImage,
  canSubmitRetakeImage,
  isSubmittingRetakeImage,
  showRetakeRestartAction,
  beginRetakeAuthorization,
  skipRetakeRequest,
  chooseRetakeImage,
  removeRetakeImage,
  submitRetakeImage
} = useQuestionPackageRetake({
  result,
  payload,
  images,
  plantName,
  diagnoseStore,
  diagnosisAnswerMutation,
  resetQuestionState
})
const {
  hasCompletedDiagnosis,
  hasRouteConvergenceDetails: routeConvergenceDetailsVisible,
  outcomeDisplayTitle,
  outcomeSummaryText,
  outcomeTypeText,
  isProblematicOutcome,
  showNonProblemOutcomeResultCard,
  nonProblemOutcomeSummaryText,
  allOutcomeDisplays,
  observedItems,
  actionAdviceGroups,
  avoidAdviceGroups
} = useQuestionPackageResultView({ result, payload, routeOptions })
const hasRouteConvergenceDetails = computed(() => routeConvergenceDetailsVisible.value)
const feedbackResultId = computed(() =>
  String(
    result.value?.resultId ||
      result.value?.diagnosisSessionId ||
      payload.value?.diagnosisSessionId ||
      routeOptions.value?.sessionId ||
      ''
  ).trim()
)

const QUESTION_PAGE_SCROLL_RESET_PULSE = 1
const questionPageScrollTop = ref(0)

async function resetActiveQuestionPageScroll() {
  questionPageScrollTop.value = QUESTION_PAGE_SCROLL_RESET_PULSE
  await nextTick()
  questionPageScrollTop.value = 0
}

watch(activeQuestionIndex, resetActiveQuestionPageScroll, { flush: 'sync' })

bindQuestionPackagePageEntry({ routeOptions, payload, images, result, resetQuestionState })
onMounted(() => {
  if (!diagnosisFlowAvailable.value) {
    openFeatureUnavailable('diagnosis')
  }
})
</script>
<style scoped src="./question-package.css"></style>
