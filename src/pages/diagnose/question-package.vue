<template>
  <view
    id="diagnose-question-package-page"
    class="box-border flex h-screen min-h-screen flex-col bg-[#f8faf9]"
  >
    <template v-if="result?.hasActiveQuestions && questionStack.length">
      <view class="flex min-h-0 flex-1 flex-col pt-6">
        <view class="mb-3 px-4">
          <text class="block text-xl font-extrabold leading-snug text-gray-900">{{
            questionDiagnosisContextText
          }}</text>
          <text class="mt-2 block text-sm font-semibold leading-5 text-[#5a7a68]">{{
            questionProgressText
          }}</text>
        </view>

        <view
          id="diagnose-question-package-page-swiper"
          class="min-h-0 w-full flex-1 overflow-x-hidden overflow-y-visible"
          :style="questionSwiperStyle"
        >
          <view
            class="flex h-full min-h-0 w-full transition-transform duration-[260ms] ease-in-out will-change-transform"
            :style="questionPageTrackStyle"
          >
            <view
              v-for="(question, questionIndex) in questionStack"
              :key="question.questionId || question.questionKey || questionIndex"
              :id="`diagnose-question-package-page-item-${question.questionId || questionIndex}`"
              class="h-full w-full shrink-0 grow-0 basis-full overflow-x-hidden overflow-y-visible"
            >
              <scroll-view
                :id="`diagnose-question-package-page-question-scroll-${question.questionId || questionIndex}`"
                scroll-y
                class="h-full"
              >
                <view
                  :id="`diagnose-question-package-page-question-shell-${question.questionId || questionIndex}`"
                  class="box-border min-h-full px-4 pb-[34px]"
                >
                  <view
                    :id="`diagnose-question-package-page-question-card-${question.questionId || questionIndex}`"
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
                      :loading="environmentWeatherWindowLoading"
                      :error="environmentWeatherWindowError"
                      @change="payload => handleCareBehaviorTimelineChange(question, payload)"
                    />

                    <view
                      v-if="getVisibleCareBehaviorOptions(question).length"
                      :id="`diagnose-question-package-page-option-stack-${question.questionId || questionIndex}`"
                      class="mt-4 flex flex-col gap-2.5"
                    >
                      <view
                        v-for="(option, optionIndex) in getVisibleCareBehaviorOptions(question)"
                        :key="option.optionId || option.optionKey || option.text"
                        :id="`diagnose-question-package-page-option-${question.questionId || questionIndex}-${option.optionId || option.optionKey || optionIndex}`"
                        class="overflow-hidden rounded-2xl border border-emerald-100 bg-white"
                        :class="
                          isSelectedQuestionOption(question, option)
                            ? 'border-[#2d7a4f] bg-emerald-50'
                            : ''
                        "
                        @click="selectQuestionOption(question, option)"
                      >
                        <view class="flex items-center justify-between gap-3 px-3.5 py-3">
                          <text
                            class="min-w-0 flex-1 text-[13px] font-bold leading-snug text-gray-700"
                            >{{ getOptionText(question, option) }}</text
                          >
                          <text
                            class="shrink-0 rounded-full border border-current px-2 py-0.5 text-[10px] font-extrabold text-[#8b7355]"
                          >
                            {{ isSelectedQuestionOption(question, option) ? '已选' : '单选' }}
                          </text>
                        </view>
                        <text
                          v-if="getOptionDescription(option)"
                          class="block whitespace-pre-line px-3.5 pb-3 text-[11px] leading-relaxed text-gray-500"
                        >
                          {{ getOptionDescription(option) }}
                        </text>
                      </view>
                    </view>

                    <view class="mt-[18px] flex gap-3">
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
                </view>
              </scroll-view>
            </view>
          </view>
        </view>
      </view>
    </template>

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
          <text class="block text-[11px] font-black tracking-wide text-[#2d7a4f]">问诊已完成</text>
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

        <view
          v-if="actionAdviceGroups.length"
          id="diagnose-question-package-outcome-action-advice"
          class="mt-3.5 rounded-[22px] bg-emerald-50 p-4"
        >
          <text class="block text-[15px] font-black text-gray-900">建议行动清单</text>
          <view v-for="group in actionAdviceGroups" :key="group.key" class="mb-3 last:mb-0">
            <text class="mt-2.5 block text-xs font-extrabold leading-snug text-gray-800"
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

        <ResultRiskSections
          id-prefix="diagnose-question-package-outcome"
          :high-risk-warning-text="highRiskWarningText"
          :blocked-action-explanations="blockedActionExplanations"
          :observation-period-text="observationPeriodText"
        />

        <view
          v-if="avoidAdviceGroups.length"
          id="diagnose-question-package-outcome-avoid-advice"
          class="mt-3.5 rounded-[22px] bg-orange-50 p-4"
        >
          <text class="block text-[15px] font-black text-gray-900">暂时不要做</text>
          <view v-for="group in avoidAdviceGroups" :key="group.key" class="mb-3 last:mb-0">
            <text class="mt-2.5 block text-xs font-extrabold leading-snug text-gray-800"
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
          <text class="block text-[11px] font-black tracking-wide text-[#2d7a4f]">问诊已完成</text>
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
          <text class="block text-[15px] font-black text-gray-900">建议行动清单</text>
          <view v-if="actionAdviceGroups.length" class="mt-3 flex flex-col gap-2">
            <view
              v-for="group in actionAdviceGroups"
              :key="`action_group_${group.key}`"
              class="mb-2 last:mb-0"
            >
              <text class="block text-xs font-extrabold leading-snug text-gray-800"
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

        <ResultRiskSections
          id-prefix="diagnose-question-package-result"
          :high-risk-warning-text="highRiskWarningText"
          :blocked-action-explanations="blockedActionExplanations"
          :observation-period-text="observationPeriodText"
          risk-class="mt-3.5 rounded-[22px] border border-red-100 bg-red-50 p-4 shadow-sm"
          observation-class="mt-3.5 rounded-[22px] border border-[#e7e0d1] bg-[#fffdf8] p-4 shadow-sm"
          use-list-wrapper
        />

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
              <text class="block text-xs font-extrabold leading-snug text-gray-800"
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

        <RouteDebugPanel
          :show="showRouteDebugPanel"
          :summary-text="routeDebugSummaryText"
          :mode-text="routeDebugModeText"
          :visible-outcome-text="routeDebugVisibleOutcomeText"
          :next-question-text="routeDebugNextQuestionText"
          :group-text="routeDebugGroupText"
          :fallback-policy="routeDebugFallbackPolicy"
        />
      </view>
    </scroll-view>

    <view
      v-else
      id="diagnose-question-package-empty-state"
      class="box-border min-h-screen px-4 py-7"
    >
      <text class="block text-[17px] font-extrabold text-gray-900">暂时没有需要继续回答的问题</text>
      <text class="mt-2 block text-xs leading-relaxed text-gray-500"
        >如果刚完成视觉诊断，请返回上一页重新进入问诊。</text
      >
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { useUserStore } from '@/store/user.js'
import CareBehaviorTimeline from '@/components/CareBehaviorTimeline.vue'
import { useDiagnosisAnswerMutation } from '@/vue-query/diagnose/mutations/useDiagnosisAnswerMutation.js'
import ResultRiskSections from './question-package/ResultRiskSections.vue'
import RouteDebugPanel from './question-package/RouteDebugPanel.vue'
import {
  DEFAULT_CACHE_KEY,
  resolveQuestionPackagePayload,
  resolveInitialDiagnosisResult
} from './question-package/payload.js'
import {
  getQuestionId,
  getOptionDescription,
  getOptionText,
  getQuestionHelpText,
  getQuestionTitle,
  useQuestionPackageFlow
} from './question-package/question-flow.js'
import { useQuestionPackageResultView } from './question-package/result-view.js'

const diagnoseStore = useDiagnoseStore()
const userStore = useUserStore()
const diagnosisAnswerMutation = useDiagnosisAnswerMutation()

const routeOptions = ref({})
const payload = ref({})
const result = ref(null)
const images = ref([])

const plantName = computed(() => {
  const plant = payload.value?.plant || payload.value?.plantInfo || {}
  return String(
    payload.value?.plantName ||
      plant.displayName ||
      plant.name ||
      result.value?.plantName ||
      routeOptions.value?.plantName ||
      '植物'
  ).trim()
})
const questionDiagnosisContextText = computed(() => {
  const mode = String(result.value?.questionPackage?.mode || '').trim()
  const modeTitle = mode === 'wilting_droop' ? '枯萎 / 发蔫问诊' : '黄叶问诊'
  return `针对${plantName.value || '植物'}的${modeTitle}`
})

const {
  questionStack,
  activeQuestionIndex,
  questionPageTrackStyle,
  questionSwiperStyle,
  questionProgressText,
  nextButtonText,
  isSubmittingQuestionAnswer,
  environmentWeatherWindowLoading,
  environmentWeatherWindowError,
  resetQuestionState,
  getCareBehaviorTimelineByQuestion,
  handleCareBehaviorTimelineChange,
  getVisibleCareBehaviorOptions,
  isCareBehaviorWateringTimelineQuestion,
  selectQuestionOption,
  isSelectedQuestionOption,
  canProceedQuestion,
  goPreviousQuestion,
  handleNextQuestion
} = useQuestionPackageFlow({
  result,
  images,
  plantName,
  userStore,
  diagnoseStore,
  diagnosisAnswerMutation
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
  blockedActionExplanations,
  highRiskWarningText,
  observationPeriodText,
  showRouteDebugPanel,
  routeDebugSummaryText,
  routeDebugModeText,
  routeDebugVisibleOutcomeText,
  routeDebugNextQuestionText,
  routeDebugGroupText,
  routeDebugFallbackPolicy
} = useQuestionPackageResultView({ result, payload, routeOptions })
const hasRouteConvergenceDetails = computed(() => routeConvergenceDetailsVisible.value)

onLoad(options => {
  routeOptions.value = options || {}
  const cacheKey =
    String(
      options?.draftKey || options?.cacheKey || options?.payloadKey || DEFAULT_CACHE_KEY
    ).trim() || DEFAULT_CACHE_KEY
  payload.value = resolveQuestionPackagePayload(routeOptions.value, cacheKey)
  images.value = Array.isArray(payload.value?.images) ? payload.value.images : []
  result.value = resolveInitialDiagnosisResult(payload.value)
  resetQuestionState(result.value?.questions || [])
})
</script>

<style scoped src="./question-package.css"></style>
