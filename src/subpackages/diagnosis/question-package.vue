<template>
  <Layout title="继续问诊" left-action="back" background-class="bg-[#f8faf9]">
    <view
      id="diagnose-question-package-page"
      class="box-border flex h-screen min-h-screen flex-col bg-[#f8faf9]"
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
        <view class="flex min-h-0 flex-1 flex-col pt-6">
          <QuestionPackageProgressHeader
            :title="questionDiagnosisContextText"
            :progress="questionProgressText"
          />
          <ButtonStepTrack
            id="diagnose-question-package-page-swiper"
            :items="questionStack"
            :active-index="activeQuestionIndex"
            viewport-class="min-h-0 w-full flex-1 overflow-y-visible"
            :viewport-style="questionSwiperStyle"
            item-class="relative h-full overflow-hidden"
          >
            <template #step="{ item: question, index: questionIndex }">
              <scroll-view
                v-if="question && shouldRenderQuestionContent(questionIndex)"
                :id="`diagnose-question-package-page-question-scroll-${getQuestionId(question) || questionIndex}`"
                scroll-y
                class="h-full"
              >
                <view
                  v-if="questionIndex === activeQuestionIndex"
                  :id="`diagnose-question-package-page-active-question-${getQuestionId(question) || questionIndex}`"
                  class="pointer-events-none absolute h-0 w-0 overflow-hidden"
                />
                <view
                  :id="`diagnose-question-package-page-question-shell-${getQuestionId(question) || questionIndex}`"
                  class="box-border min-h-full px-4 pb-[112px]"
                >
                  <view
                    :id="`diagnose-question-package-page-question-card-${getQuestionId(question) || questionIndex}`"
                    class="question-package-card-enter rounded-[20px] border border-emerald-100 bg-white px-4 py-4 shadow-sm"
                  >
                    <text class="block text-base font-semibold leading-7 text-[#2d7a4f]">
                      {{ getQuestionTitle(question) }}
                    </text>
                    <text
                      v-if="getQuestionHelpText(question)"
                      class="mt-2 block text-xs leading-relaxed text-gray-500"
                    >
                      {{ getQuestionHelpText(question) }}
                    </text>
                    <CareBehaviorTimeline
                      v-if="isCareBehaviorWateringTimelineQuestion(question)"
                      :question-id="getQuestionId(question)"
                      :question="question"
                      :timeline="getCareBehaviorTimelineByQuestion(question)"
                      :environment-weather-window="environmentWeatherWindow"
                      :weather-by-date="environmentWeatherByDate"
                      :loading="environmentWeatherWindowLoading"
                      :error="environmentWeatherWindowError"
                      :enable-dose-per-date="true"
                      :pot-volume-ml="0"
                      @change="payload => handleCareBehaviorTimelineChange(question, payload)"
                    />
                    <LightEnvironmentPicker
                      v-if="isLightEnvironmentQuestion(question)"
                      :question-id="getQuestionId(question)"
                      :id-prefix="'diagnose-light'"
                      :plant-name="plantName"
                      :model-value="getLightEnvironmentByQuestion(question)"
                      :requires-confirmation="requiresLightEnvironmentConfirmation(question)"
                      :confirmed="isLightEnvironmentConfirmed(question)"
                      @change="payload => handleLightEnvironmentChange(question, payload)"
                      @confirm="payload => confirmLightEnvironment(question, payload)"
                    />
                    <text
                      v-if="
                        isLightEnvironmentQuestion(question) &&
                        getVisibleCareBehaviorOptions(question).length
                      "
                      class="mb-2 mt-4 block text-sm font-medium leading-5 text-[#24382b]"
                    >
                      最近光照有变化吗？
                    </text>
                    <QuestionPackageAirEnvironmentStep
                      v-if="isAirEnvironmentQuestion(question)"
                      :question="question"
                      :question-id="getQuestionId(question)"
                      :air-environment="airEnvironmentUi"
                      footer-position="fixed"
                      back-label="上一题"
                      back-id="diagnose-question-package-page-prev-button"
                      :completion-label="nextButtonText"
                      completion-id="diagnose-question-package-page-next-button"
                      @change="payload => handleAirEnvironmentChange(question, payload)"
                      @unknown="selectAirEnvironmentUnknown(question)"
                      @edit="openAirEnvironmentEditor(question)"
                      @confirm="confirmAirEnvironmentLocation(question)"
                      @back="goPreviousQuestion"
                      @complete="handleNextQuestion"
                    />
                    <QuestionPackageOptions
                      v-if="
                        !isAirEnvironmentQuestion(question) &&
                        getVisibleCareBehaviorOptions(question).length
                      "
                      :question="question"
                      :question-id="getQuestionId(question) || String(questionIndex)"
                      :options="getVisibleCareBehaviorOptions(question)"
                      :selected-option-id="getSelectedQuestionOptionId(question)"
                      @select="option => selectQuestionOption(question, option)"
                      @skip="option => skipQuestionRisk(question, option)"
                    />
                  </view>
                </view>
              </scroll-view>
              <view
                v-else-if="question"
                :id="`diagnose-question-package-page-question-shell-${getQuestionId(question) || questionIndex}`"
                class="h-0 overflow-hidden"
              />
            </template>
          </ButtonStepTrack>
          <view
            v-if="!activeAirEnvironmentOwnsFooter"
            class="fixed bottom-0 left-0 right-0 z-30 box-border flex gap-3 border-t border-emerald-100 bg-[#f8faf9] px-4 pb-5 pt-3"
          >
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
            <view v-for="group in actionAdviceGroups" :key="group.key" class="mb-3 last:mb-0">
              <text
                v-if="group.showOutcomeLabel"
                class="mt-2.5 block text-xs font-extrabold leading-snug text-gray-800"
                >{{ group.outcomeLabel }}：</text
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
            <view v-for="group in avoidAdviceGroups" :key="group.key" class="mb-3 last:mb-0">
              <text
                v-if="group.showOutcomeLabel"
                class="mt-2.5 block text-xs font-extrabold leading-snug text-gray-800"
                >{{ group.outcomeLabel }}：</text
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
              <view class="flex-1 rounded-2xl bg-emerald-50 px-3 py-3">
                <text class="block text-[10px] font-bold text-gray-500">可信度</text>
                <text class="mt-1 block text-[13px] font-black leading-snug text-[#184d39]">{{
                  confidenceLevelText
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
            <text class="block text-[15px] font-black text-gray-900">视觉证据</text>
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
                class="mb-2 last:mb-0"
              >
                <text
                  v-if="group.showOutcomeLabel"
                  class="block text-xs font-extrabold leading-snug text-gray-800"
                  >{{ group.outcomeLabel }}：</text
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
                class="mb-2 last:mb-0"
              >
                <text
                  v-if="group.showOutcomeLabel"
                  class="block text-xs font-extrabold leading-snug text-gray-800"
                  >{{ group.outcomeLabel }}：</text
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
          <view
            v-if="showRouteDebugPanel"
            id="diagnose-question-package-debug-panel"
            class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-4 shadow-sm"
          >
            <text class="block text-[15px] font-black text-gray-900">决策详情</text>
            <view class="mt-3 flex flex-col gap-2">
              <text v-if="routeDebugSummaryText" class="block text-xs leading-relaxed text-gray-600"
                >决策原因：{{ routeDebugSummaryText }}</text
              >
              <text v-if="routeDebugModeText" class="block text-xs leading-relaxed text-gray-600"
                >模式：{{ routeDebugModeText }}</text
              >
              <text
                v-if="routeDebugVisibleOutcomeText"
                class="block text-xs leading-relaxed text-gray-600"
                >展示结果：{{ routeDebugVisibleOutcomeText }}</text
              >
              <text v-if="routeDebugGroupText" class="block text-xs leading-relaxed text-gray-600"
                >命中流程组：{{ routeDebugGroupText }}</text
              >
            </view>
          </view>
        </view>
      </scroll-view>
      <QuestionPackageEmptyState v-else @back="returnPreviousPage" />
    </view>
  </Layout>
</template>
<script setup>
import { computed, ref } from 'vue'
import Layout from '@/Layout.vue'
import DiagnosisFeedbackCard from './components/DiagnosisFeedbackCard.vue'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { useUserStore } from '@/store/user.js'
import ButtonStepTrack from '@/components/common/ButtonStepTrack.vue'
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
const diagnoseStore = useDiagnoseStore()
const userStore = useUserStore()
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
  questionSwiperStyle,
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
const activeAirEnvironmentOwnsFooter = computed(() => {
  const question = questionStack.value[activeQuestionIndex.value]
  if (!question || !isAirEnvironmentQuestion(question)) {
    return false
  }
  if (getSelectedQuestionOptionId(question) === 'air_environment_unknown') {
    return false
  }
  return !airEnvironmentUi.isSummaryVisible(question) || airEnvironmentUi.isEditorOpen(question)
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
  confidenceLevelText,
  allOutcomeDisplays,
  observedItems,
  actionAdviceGroups,
  avoidAdviceGroups,
  showRouteDebugPanel,
  routeDebugSummaryText,
  routeDebugModeText,
  routeDebugVisibleOutcomeText,
  routeDebugGroupText
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

// Keep the active card and its immediate neighbors mounted for the slide transition.
// Older cards only need a stable shell/count marker; mounting every question at once also
// mounts hidden scroll-views, SVG scenes, and interactive air-environment trees, which can
// wedge the WeChat renderer during App.captureScreenshot.
const shouldRenderQuestionContent = questionIndex =>
  Math.abs(Number(questionIndex) - Number(activeQuestionIndex.value)) <= 1

bindQuestionPackagePageEntry({ routeOptions, payload, images, result, resetQuestionState })
</script>
<style scoped src="./question-package.css"></style>
