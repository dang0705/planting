<template>
  <view class="follow-up-page">
    <swiper
      v-if="result?.followUpRequired && followUpQuestionStack.length"
      class="followup-page-swiper"
      :current="activeFollowUpQuestionIndex"
      :duration="260"
      :indicator-dots="false"
      :circular="false"
      @change="activeFollowUpQuestionIndex = Number($event?.detail?.current || 0)"
    >
      <swiper-item
        v-for="(question, questionIndex) in followUpQuestionStack"
        :key="question.questionId || question.questionKey || questionIndex"
        class="followup-page-swiper-item"
      >
        <scroll-view scroll-y class="followup-question-scroll">
          <view class="followup-question-shell">
            <view class="followup-question-card followup-question-card--animated">
              <text class="followup-question-count">
                问题 {{ questionIndex + 1 }} / {{ followUpQuestionStack.length || 1 }}
              </text>
              <text class="followup-question-title">
                {{ getQuestionTitle(question) }}
              </text>
              <text v-if="hasQuestionHelpText(question)" class="followup-question-help">
                {{ getQuestionHelpText(question) }}
              </text>

              <view class="followup-option-stack followup-option-stack--accordion">
                <view
                  v-for="option in question.options || []"
                  :key="option.optionId || option.optionKey || option.text"
                  class="followup-accordion-option"
                  :class="isSelectedFollowUpOption(question, option) ? 'followup-accordion-option--active' : ''"
                  @click="selectFollowUpOption(question, option)"
                >
                  <view class="followup-accordion-title">
                    <text class="followup-accordion-text">{{ getOptionText(option) }}</text>
                    <text class="followup-accordion-badge">
                      {{ isSelectedFollowUpOption(question, option) ? '已选' : '单选' }}
                    </text>
                  </view>
                </view>
              </view>

              <view class="followup-nav-row">
                <button
                  id="diagnose-followup-prev-button"
                  class="followup-nav-button"
                  :class="{ 'followup-nav-button--disabled': isSubmittingFollowUp || activeFollowUpQuestionIndex <= 0 }"
                  :disabled="isSubmittingFollowUp || activeFollowUpQuestionIndex <= 0"
                  @click="goPreviousFollowUpQuestion"
                >上一题</button>
                <button
                  id="diagnose-followup-next-button"
                  class="followup-nav-button followup-nav-button--primary"
                  :class="{ 'followup-nav-button--disabled': !canProceedFollowUpQuestion() }"
                  :disabled="!canProceedFollowUpQuestion()"
                  @click="handleNextFollowUpQuestion"
                >{{ isSubmittingFollowUp ? '处理中...' : '下一题' }}</button>
              </view>

              <text v-if="hasDirtyFollowUpAnswers" class="followup-dirty-hint">
                你修改了之前的答案，继续后会重新整理后续问题。
              </text>
            </view>
          </view>
        </scroll-view>
      </swiper-item>
    </swiper>

    <scroll-view
      v-else-if="result && !result.followUpRequired && !hasRouteConvergenceDetails"
      scroll-y
      class="followup-outcome-scroll"
    >
      <view class="followup-outcome-shell">
        <view class="followup-outcome-card">
          <text class="followup-outcome-kicker">问诊已完成</text>
          <text class="followup-outcome-title">{{ outcomeDisplayTitle || '已形成诊断结论' }}</text>
          <text
            v-if="outcomeSummaryText"
            class="followup-outcome-summary"
          >
            {{ outcomeSummaryText }}
          </text>

          <view class="followup-outcome-status">
            <text class="followup-outcome-status-label">当前状态</text>
            <text class="followup-outcome-status-value">{{ result.healthStatusText || '待进一步确认' }}</text>
          </view>
        </view>

        <view v-if="actionAdviceTexts.length" class="followup-advice-card followup-advice-card--action">
          <text class="followup-advice-title">处理建议</text>
          <text
            v-for="(item, index) in actionAdviceTexts"
            :key="`action_${index}`"
            class="followup-advice-text"
          >
            {{ item }}
          </text>
        </view>

        <view v-if="avoidAdviceTexts.length" class="followup-advice-card followup-advice-card--avoid">
          <text class="followup-advice-title">暂时不要做</text>
          <text
            v-for="(item, index) in avoidAdviceTexts"
            :key="`avoid_${index}`"
            class="followup-advice-text"
          >
            {{ item }}
          </text>
        </view>
      </view>
    </scroll-view>

    <scroll-view v-else-if="hasCompletedDiagnosis" scroll-y class="followup-result-scroll">
      <view class="followup-result-shell">
        <view class="followup-result-card">
          <text class="followup-result-kicker">问诊已完成</text>
          <text class="followup-result-title">{{ outcomeDisplayTitle }}</text>
          <text class="followup-result-summary">{{ outcomeSummaryText }}</text>

          <view class="followup-result-meta">
            <view class="followup-result-meta-item">
              <text class="followup-result-meta-label">结论类型</text>
              <text class="followup-result-meta-value">{{ outcomeTypeText }}</text>
            </view>
            <view class="followup-result-meta-item">
              <text class="followup-result-meta-label">可信度</text>
              <text class="followup-result-meta-value">{{ confidenceLevelText }}</text>
            </view>
          </view>
        </view>

        <view v-if="primaryOutcomeDisplay || secondaryOutcomeDisplays.length || visibleOutcomeDisplays.length" class="followup-result-section">
          <text class="followup-result-section-title">路径收敛结果</text>
          <view v-if="primaryOutcomeDisplay" class="followup-result-list">
            <text class="followup-result-list-item">主要判断：{{ primaryOutcomeDisplay }}</text>
          </view>
          <view v-if="secondaryOutcomeDisplays.length" class="followup-result-list">
            <text
              v-for="(item, index) in secondaryOutcomeDisplays"
              :key="`secondary_${index}`"
              class="followup-result-list-item"
            >伴随方向：{{ item }}</text>
          </view>
          <view v-if="visibleOutcomeDisplays.length" class="followup-result-chip-row">
            <text
              v-for="(item, index) in visibleOutcomeDisplays"
              :key="`visible_${index}`"
              class="followup-result-chip"
            >{{ item }}</text>
          </view>
        </view>

        <view v-if="observedItems.length" class="followup-result-section">
          <text class="followup-result-section-title">视觉证据</text>
          <view class="followup-result-chip-row">
            <text
              v-for="item in observedItems"
              :key="item.key"
              class="followup-result-chip"
            >{{ item.label }}</text>
          </view>
        </view>

        <view class="followup-result-section">
          <text class="followup-result-section-title">建议先这样做</text>
          <view v-if="actionAdviceTexts.length" class="followup-result-list">
            <text
              v-for="(item, index) in actionAdviceTexts"
              :key="`action_${index}`"
              class="followup-result-list-item"
            >{{ index + 1 }}. {{ item }}</text>
          </view>
          <text v-else class="followup-result-muted">暂时没有更具体的行动建议，建议先保持观察并避免过度处理。</text>
        </view>

        <view v-if="avoidAdviceTexts.length" class="followup-result-section">
          <text class="followup-result-section-title">暂时避免</text>
          <view class="followup-result-list">
            <text
              v-for="(item, index) in avoidAdviceTexts"
              :key="`avoid_${index}`"
              class="followup-result-list-item"
            >{{ index + 1 }}. {{ item }}</text>
          </view>
        </view>

        <view v-if="showRouteDebugPanel" class="followup-result-section">
          <text class="followup-result-section-title">Route Debug</text>
          <view class="followup-result-list">
            <text v-if="routeDebugSummaryText" class="followup-result-list-item">决策原因：{{ routeDebugSummaryText }}</text>
            <text v-if="routeDebugModeText" class="followup-result-list-item">模式：{{ routeDebugModeText }}</text>
            <text v-if="routeDebugPrimaryOutcomeKey" class="followup-result-list-item">主方向 Key：{{ routeDebugPrimaryOutcomeKey }}</text>
            <text v-if="routeDebugVisibleOutcomeText" class="followup-result-list-item">可见方向 Keys：{{ routeDebugVisibleOutcomeText }}</text>
            <text v-if="routeDebugSecondaryOutcomeText" class="followup-result-list-item">伴随方向 Keys：{{ routeDebugSecondaryOutcomeText }}</text>
            <text v-if="routeDebugNextQuestionText" class="followup-result-list-item">下一题 Keys：{{ routeDebugNextQuestionText }}</text>
            <text v-if="routeDebugGroupText" class="followup-result-list-item">激活 Route Group：{{ routeDebugGroupText }}</text>
            <text v-if="routeDebugFallbackPolicy" class="followup-result-list-item">Fallback：{{ routeDebugFallbackPolicy }}</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <view v-else class="followup-empty-state">
      <text class="followup-empty-title">暂时没有需要继续回答的问题</text>
      <text class="followup-empty-text">如果刚完成视觉诊断，请返回上一页重新进入问诊。</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDiagnoseStore } from '@/store/diagnose.js'
import { useDiagnoseFollowUpMutation } from '@/vue-query/diagnose/mutations/useDiagnoseFollowUpMutation.js'
import {
  normalizeDiagnosisResult,
  createFollowUpAnswerMap,
  buildFollowUpPayload
} from '@/utils/diagnose-flow.js'

const DEFAULT_CACHE_KEY = 'diagnose_follow_up_payload'

const diagnoseStore = useDiagnoseStore()
const followUpMutation = useDiagnoseFollowUpMutation()

const routeOptions = ref({})
const payload = ref({})
const result = ref(null)
const images = ref([])
const followUpQuestionStack = ref([])
const activeFollowUpQuestionIndex = ref(0)
const followUpAnswers = ref({})
const committedFollowUpAnswers = ref({})
const dirtyFollowUpFromIndex = ref(-1)
const followUpAnswerRevision = ref(0)
const expandedFollowUpOptionByQuestion = ref({})
const isSubmittingFollowUp = ref(false)
const runtimeEnv = import.meta.env || {}
const isLocalDevelopmentBuild = Boolean(runtimeEnv.DEV) || runtimeEnv.MODE === 'development'
let routeDebugEnabled =
  runtimeEnv.VITE_APP_ENV === 'development' ||
  (isLocalDevelopmentBuild && runtimeEnv.VITE_APP_ENV !== 'production')
// #ifdef MP-WEIXIN
routeDebugEnabled =
  runtimeEnv.VITE_APP_ENV === 'development' ||
  (!runtimeEnv.PROD && runtimeEnv.VITE_APP_ENV !== 'production')
// #endif

onLoad(options => {
  routeOptions.value = options || {}
  const cacheKey = String(
    options?.draftKey || options?.cacheKey || options?.payloadKey || DEFAULT_CACHE_KEY
  ).trim() || DEFAULT_CACHE_KEY
  payload.value = resolveFollowUpPayload(routeOptions.value, cacheKey)
  images.value = Array.isArray(payload.value?.images) ? payload.value.images : []
  result.value = resolveInitialDiagnosisResult(payload.value)
  resetFollowUpQuestionState(result.value?.followUps || [], {
    answerRevision: result.value?.answerRevision || 0
  })
})

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

const plantSubtitle = computed(() => String(result.value?.scientificName || result.value?.identityResolutionStatus || '').trim())
const sessionId = computed(() => String(result.value?.diagnosisSessionId || payload.value?.diagnosisSessionId || routeOptions.value?.sessionId || '').trim())
const roundId = computed(() => String(result.value?.roundId || payload.value?.roundId || routeOptions.value?.roundId || '').trim())
const sessionLabel = computed(() => sessionId.value || '未提供 sessionId')
const roundLabel = computed(() => roundId.value || '未提供 roundId')
const currentFollowUpQuestion = computed(() => followUpQuestionStack.value[activeFollowUpQuestionIndex.value] || null)
const hasDirtyFollowUpAnswers = computed(() => dirtyFollowUpFromIndex.value >= 0)
const followUpSwiperStyle = computed(() => ({ height: `${estimateFollowUpSwiperHeight(currentFollowUpQuestion.value)}px` }))
const hasCompletedDiagnosis = computed(() => Boolean(result.value) && !result.value.followUpRequired)
const hasRouteConvergenceDetails = computed(() =>
  Boolean(
    primaryOutcomeDisplay.value ||
    secondaryOutcomeDisplays.value.length ||
    visibleOutcomeDisplays.value.length
  )
)
const finalOutcome = computed(() => result.value?.finalResult || {})
const outcomeDisplayTitle = computed(() => String(
  finalOutcome.value?.displayNameCn ||
  finalOutcome.value?.displayName ||
    finalOutcome.value?.problemName ||
    result.value?.mainIssueText ||
    result.value?.summaryCard?.title ||
    '诊断已完成'
).trim())
const outcomeSummaryText = computed(() => String(
  finalOutcome.value?.summaryCn ||
  finalOutcome.value?.summary ||
    result.value?.summaryText ||
    result.value?.summaryCard?.subtitle ||
    '系统已根据视觉证据和补充问诊整理出当前结论。'
).trim())
const outcomeTypeText = computed(() => {
  const type = String(result.value?.outcomeType || finalOutcome.value?.outcomeType || '').trim()
  const labels = {
    problem: '可能存在问题',
    non_problematic: '暂未发现明确问题',
    uncertain: '仍需谨慎观察',
    out_of_pool_no_mapping: '诊断范围外的可见异常'
  }
  return labels[type] || type || '已生成结论'
})
const confidenceLevelText = computed(() => {
  const level = String(result.value?.confidenceLevel || finalOutcome.value?.confidenceLevel || '').trim()
  const labels = {
    high: '较高',
    normal: '一般',
    medium: '一般',
    low: '较低'
  }
  return labels[level] || level || '一般'
})
const primaryOutcome = computed(() => result.value?.primaryOutcome || result.value?.finalResult?.primaryOutcome || null)
const secondaryOutcomeSource = computed(() =>
  Array.isArray(result.value?.secondaryOutcomes) && result.value.secondaryOutcomes.length
    ? result.value.secondaryOutcomes
    : Array.isArray(result.value?.finalResult?.secondaryOutcomes)
      ? result.value.finalResult.secondaryOutcomes
      : []
)
const visibleOutcomeSource = computed(() =>
  Array.isArray(result.value?.visibleOutcomes) && result.value.visibleOutcomes.length
    ? result.value.visibleOutcomes
    : Array.isArray(result.value?.finalResult?.visibleOutcomes)
      ? result.value.finalResult.visibleOutcomes
      : []
)
const primaryOutcomeDisplay = computed(() => formatOutcomeDisplayLabel(primaryOutcome.value))
const secondaryOutcomeDisplays = computed(() =>
  uniqueStrings(
    secondaryOutcomeSource.value.map(formatOutcomeDisplayLabel)
  )
)
const visibleOutcomeDisplays = computed(() =>
  uniqueStrings(
    visibleOutcomeSource.value.map(formatOutcomeDisplayLabel)
  )
)
const routeDebugDecision = computed(() => result.value?.routeDecision || null)
const showRouteDebugPanel = computed(() => routeDebugEnabled && Boolean(routeDebugDecision.value))
const routeDebugSummaryText = computed(() => String(
  routeDebugDecision.value?.decisionCause?.decisionCauseText ||
    result.value?.routeDecisionCause?.decisionCauseText ||
    ''
).trim())
const routeDebugModeText = computed(() => String(routeDebugDecision.value?.mode || '').trim())
const routeDebugPrimaryOutcomeKey = computed(() => String(routeDebugDecision.value?.primaryOutcomeKey || '').trim())
const routeDebugVisibleOutcomeText = computed(() =>
  normalizeArrayText(routeDebugDecision.value?.visibleOutcomeKeys).join(' / ')
)
const routeDebugSecondaryOutcomeText = computed(() =>
  normalizeArrayText(routeDebugDecision.value?.secondaryOutcomeKeys).join(' / ')
)
const routeDebugNextQuestionText = computed(() =>
  normalizeArrayText(routeDebugDecision.value?.nextQuestionKeys).join(' / ')
)
const routeDebugGroupText = computed(() =>
  normalizeArrayText(routeDebugDecision.value?.activeRouteGroupKeys).join(' / ')
)
const routeDebugFallbackPolicy = computed(() => String(routeDebugDecision.value?.fallbackPolicy || '').trim())

const currentFollowUpAccordionValue = computed({
  get() {
    const question = currentFollowUpQuestion.value
    if (!isAccordionFollowUpQuestion(question)) {return ''}
    return getExpandedFollowUpOptionId(question)
  },
  set(value) {
    const question = currentFollowUpQuestion.value
    if (!isAccordionFollowUpQuestion(question)) {return}
    const optionId = normalizeCollapseOptionValue(value)
    if (!optionId) {return}
    setExpandedFollowUpOption(question, optionId)
    setFollowUpAnswer(getFollowUpQuestionId(question), optionId)
  }
})

const observedItems = computed(() => {
  const source = [
    ...(Array.isArray(payload.value?.observedSymptoms) ? payload.value.observedSymptoms : []),
    ...(Array.isArray(payload.value?.observedEvidenceSet) ? payload.value.observedEvidenceSet : []),
    ...(Array.isArray(result.value?.observedSymptoms) ? result.value.observedSymptoms : []),
    ...(Array.isArray(result.value?.observedEvidenceSet) ? result.value.observedEvidenceSet : [])
  ]
  const seen = new Set()
  return source
    .map((item, index) => {
      const key = String(item?.symptomKey || item?.evidenceKey || item?.key || item?.id || `item_${index}`).trim()
      const label = String(item?.symptomCn || item?.label || item?.displayName || item?.evidenceKey || item?.symptomKey || '').trim()
      if (!key || !label || seen.has(key)) {return null}
      seen.add(key)
      return { key, label }
    })
    .filter(Boolean)
})

const visualSummaryText = computed(() => String(
  payload.value?.visualSummary ||
    result.value?.summaryText ||
    result.value?.mainIssueText ||
    '视觉诊断已完成。请继续回答下面的问题，以便系统补齐关键上下文。'
).trim())

const actionAdviceTexts = computed(() => {
  const actionAdvice = result.value?.actionAdvice || {}
  const explanation = result.value?.explanation || result.value?.resultExplanation || {}
  const nextSteps = Array.isArray(result.value?.nextSteps)
    ? result.value.nextSteps.map(item => String(item?.text || '').trim()).filter(Boolean)
    : []
  const treatmentText = String(result.value?.treatmentText || explanation?.firstAid || '').trim()
  const structuredAdvice = [
    ...normalizeArrayText(actionAdvice?.todayActions),
    ...normalizeArrayText(actionAdvice?.threeDayActions),
    ...normalizeArrayText(actionAdvice?.sevenDayObserve),
    ...nextSteps
  ]
  return uniqueStrings([
    ...structuredAdvice,
    ...(!structuredAdvice.length && treatmentText ? [treatmentText] : [])
  ])
})

const avoidAdviceTexts = computed(() => {
  const actionAdvice = result.value?.actionAdvice || {}
  const explanation = result.value?.explanation || result.value?.resultExplanation || {}
  const whatToAvoid = Array.isArray(result.value?.whatToAvoid)
    ? result.value.whatToAvoid.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const preventionText = String(result.value?.preventionText || explanation?.avoid || '').trim()
  const structuredAdvice = [
    ...normalizeArrayText(actionAdvice?.avoidActions),
    ...(actionAdvice?.conflictDetected ? normalizeArrayText(actionAdvice?.retakeOrEscalate) : []),
    ...whatToAvoid
  ]
  return uniqueStrings([
    ...structuredAdvice,
    ...(!structuredAdvice.length && preventionText ? [preventionText] : [])
  ])
})

function resolveInitialDiagnosisResult(value = {}) {
  if (value?.normalizedResult) {return value.normalizedResult}
  const rawResult = value?.diagnosisResult || value?.result || value?.visualDiagnosisResult || value
  return normalizeDiagnosisResult(rawResult, {
    images: Array.isArray(value?.images) ? value.images : [],
    plantName: value?.plantName || value?.plant?.displayName || '植物'
  })
}

function resolveFollowUpPayload(options = {}, key = DEFAULT_CACHE_KEY) {
  const inlinePayload = parseJsonLike(options?.payload || options?.data || '')
  if (inlinePayload) {return inlinePayload}
  const storedPayload = readStoragePayload(key)
  if (storedPayload) {return storedPayload}
  return {
    diagnosisSessionId: options?.diagnosisSessionId || options?.sessionId || '',
    roundId: options?.roundId || '',
    plantName: options?.plantName || '',
    followUps: []
  }
}

function readStoragePayload(key = DEFAULT_CACHE_KEY) {
  try {
    const value = uni.getStorageSync(key)
    if (!value) {return null}
    if (typeof value === 'string') {return parseJsonLike(value)}
    return typeof value === 'object' ? value : null
  } catch (error) {
    console.warn('读取问诊缓存失败:', error)
    return null
  }
}

function parseJsonLike(value = '') {
  if (!value) {return null}
  if (typeof value === 'object') {return value}
  try {
    const decoded = decodeURIComponent(String(value || ''))
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(item => String(item || '').trim()).filter(Boolean)))
}

function formatOutcomeDisplayLabel(outcome = null) {
  if (typeof outcome === 'string') {
    return outcome.trim()
  }
  if (!outcome || typeof outcome !== 'object') {
    return ''
  }
  return String(
    outcome.displayNameCn ||
      outcome.displayName ||
      outcome.title ||
      outcome.problemName ||
      outcome.problemKey ||
      outcome.outcomeKey ||
      ''
  ).trim()
}

function normalizeArrayText(values = []) {
  return (Array.isArray(values) ? values : []).map(item => String(item || '').trim()).filter(Boolean)
}

function estimateFollowUpSwiperHeight(question) {
  if (!question) {return 260}
  const options = Array.isArray(question.options) ? question.options : []
  const questionText = getQuestionTitle(question)
  const questionHelpText = getQuestionHelpText(question)
  const questionExtraRows = Math.ceil(Math.max(questionText.length - 26, 0) / 22)
  const helpExtraRows = questionHelpText ? Math.ceil(questionHelpText.length / 34) : 0
  const baseHeight = 118 + questionExtraRows * 18 + helpExtraRows * 16
  const optionHeight = options.reduce((sum, option) => {
    const optionTitle = getOptionText(option)
    const titleRows = Math.max(1, Math.ceil(String(optionTitle || '').length / 18))
    return sum + 52 + Math.max(0, titleRows - 1) * 18
  }, 0)
  return Math.max(280, Math.min(820, baseHeight + optionHeight + 72))
}

function sanitizeTemplateText(value = '') {
  const raw = String(value || '')
  return raw
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getQuestionTitle(question = {}) {
  return sanitizeTemplateText(
    question?.questionTextUserCn ||
    question?.questionTextCn ||
    question?.questionText ||
    question?.text ||
    ''
  )
}

function hasQuestionHelpText(question = {}) {
  return Boolean(getQuestionHelpText(question))
}

function getQuestionHelpText(question = {}) {
  return sanitizeTemplateText(
    question?.helpTextCn ||
    question?.helpText ||
    question?.questionHelpText ||
    ''
  )
}

function getOptionText(option = {}) {
  return sanitizeTemplateText(
    option?.optionTextUserCn ||
    option?.optionTextCn ||
    option?.text ||
    option?.optionText ||
    option?.label ||
    option?.desc ||
    ''
  )
}

function getOptionDescription(option = {}) {
  return sanitizeTemplateText(
    option?.descriptionCn ||
    option?.optionDescription ||
    option?.description ||
    option?.desc ||
    ''
  )
}

function getFollowUpQuestionId(question) {
  return String(question?.questionId || '').trim()
}

function getFollowUpOptionId(option) {
  return String(option?.optionId || '').trim()
}

function isAccordionFollowUpQuestion(question) {
  return String(question?.uiVariant || '').trim() === 'single_select_accordion'
}

function normalizeCollapseOptionValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeCollapseOptionValue(value.detail?.value ?? value.detail ?? value.value ?? '')
  }
  if (Array.isArray(value)) {return String(value[0] || '').trim()}
  return String(value || '').trim()
}

function getExpandedFollowUpOptionId(question) {
  const questionId = getFollowUpQuestionId(question)
  if (!questionId) {return ''}
  return String(expandedFollowUpOptionByQuestion.value[questionId] || followUpAnswers.value[questionId] || question?.defaultOptionId || '').trim()
}

function setExpandedFollowUpOption(question, optionId) {
  const questionId = getFollowUpQuestionId(question)
  const normalizedOptionId = String(optionId || '').trim()
  if (!questionId || !normalizedOptionId) {return}
  expandedFollowUpOptionByQuestion.value = {
    ...expandedFollowUpOptionByQuestion.value,
    [questionId]: normalizedOptionId
  }
}

function handleFollowUpAccordionChange(question, value) {
  const optionId = normalizeCollapseOptionValue(value)
  if (!optionId) {return}
  setExpandedFollowUpOption(question, optionId)
  setFollowUpAnswer(getFollowUpQuestionId(question), optionId)
}

function isSelectedFollowUpOption(question, option) {
  const questionId = getFollowUpQuestionId(question)
  const optionId = getFollowUpOptionId(option)
  if (!questionId || !optionId) {return false}
  return String(followUpAnswers.value[questionId] || question?.defaultOptionId || '').trim() === optionId
}

function selectFollowUpOption(question, option) {
  const questionId = getFollowUpQuestionId(question)
  const optionId = getFollowUpOptionId(option)
  if (!questionId || !optionId) {return}
  setFollowUpAnswer(questionId, optionId)
  if (isAccordionFollowUpQuestion(question)) {setExpandedFollowUpOption(question, optionId)}
}

function findFollowUpQuestionIndex(questionId = '') {
  const normalizedQuestionId = String(questionId || '').trim()
  if (!normalizedQuestionId) {return -1}
  return followUpQuestionStack.value.findIndex(item => getFollowUpQuestionId(item) === normalizedQuestionId)
}

function updateDirtyFollowUpIndex(questionId = '', optionId = '') {
  const questionIndex = findFollowUpQuestionIndex(questionId)
  if (questionIndex < 0) {return}
  const committedOptionId = String(committedFollowUpAnswers.value?.[questionId]?.optionId || '').trim()
  const isHistoricalQuestion = questionIndex < followUpQuestionStack.value.length - 1
  if (committedOptionId && committedOptionId === String(optionId || '').trim()) {return}
  if (!committedOptionId && !isHistoricalQuestion) {return}
  dirtyFollowUpFromIndex.value = dirtyFollowUpFromIndex.value >= 0
    ? Math.min(dirtyFollowUpFromIndex.value, questionIndex)
    : questionIndex
}

function setFollowUpAnswer(questionId, answerValue) {
  updateDirtyFollowUpIndex(questionId, answerValue)
  followUpAnswers.value = {
    ...followUpAnswers.value,
    [questionId]: answerValue
  }
}

function goPreviousFollowUpQuestion() {
  activeFollowUpQuestionIndex.value = Math.max(0, activeFollowUpQuestionIndex.value - 1)
}

function goNextFollowUpQuestion() {
  if (hasDirtyFollowUpAnswers.value && activeFollowUpQuestionIndex.value >= dirtyFollowUpFromIndex.value) {return}
  activeFollowUpQuestionIndex.value = Math.min(Math.max(followUpQuestionStack.value.length - 1, 0), activeFollowUpQuestionIndex.value + 1)
}

function canProceedFollowUpQuestion() {
  const questionId = getFollowUpQuestionId(currentFollowUpQuestion.value)
  if (!questionId) {return false}
  if (isSubmittingFollowUp.value) {return false}
  return Boolean(followUpAnswers.value[questionId])
}

async function handleNextFollowUpQuestion() {
  if (!canProceedFollowUpQuestion()) {return}
  if (!hasDirtyFollowUpAnswers.value && activeFollowUpQuestionIndex.value < followUpQuestionStack.value.length - 1) {
    goNextFollowUpQuestion()
    return
  }
  await submitFollowUps()
}

function resetFollowUpQuestionState(followUps = [], { answerRevision = 0 } = {}) {
  const nextFollowUps = Array.isArray(followUps) ? followUps.filter(item => item?.questionId) : []
  followUpQuestionStack.value = nextFollowUps
  activeFollowUpQuestionIndex.value = 0
  followUpAnswers.value = createFollowUpAnswerMap(nextFollowUps)
  committedFollowUpAnswers.value = {}
  dirtyFollowUpFromIndex.value = -1
  followUpAnswerRevision.value = Number(answerRevision || 0)
  expandedFollowUpOptionByQuestion.value = {}
}

function mergeFollowUpQuestionState(nextResult = null, submittedPayload = null) {
  const nextFollowUps = Array.isArray(nextResult?.followUps) ? nextResult.followUps.filter(item => item?.questionId) : []
  const submittedAnswers = Array.isArray(submittedPayload?.answers) ? submittedPayload.answers : []
  const submittedAnswerMap = submittedAnswers.reduce((entries, item) => {
    const questionId = String(item?.questionId || '').trim()
    const optionId = String(item?.optionId || '').trim()
    if (questionId && optionId) {entries[questionId] = { optionId, answerRevision: Number(nextResult?.answerRevision || submittedPayload?.baseAnswerRevision || 0) }}
    return entries
  }, {})
  const dirtyIndex = dirtyFollowUpFromIndex.value
  const patchKeepUntilQuestionId = String(nextResult?.uiPatch?.keepUntilQuestionId || '').trim()
  const patchKeepIndex = patchKeepUntilQuestionId ? findFollowUpQuestionIndex(patchKeepUntilQuestionId) : -1
  const keepEndIndex = patchKeepIndex >= 0 ? patchKeepIndex : dirtyIndex >= 0 ? dirtyIndex : followUpQuestionStack.value.length - 1
  const keptQuestions = followUpQuestionStack.value.slice(0, Math.max(0, keepEndIndex + 1))
  const keptQuestionIds = new Set(keptQuestions.map(item => getFollowUpQuestionId(item)).filter(Boolean))
  const appendQuestions = nextFollowUps.filter(item => !keptQuestionIds.has(getFollowUpQuestionId(item)))
  const nextStack = nextResult?.followUpRequired ? [...keptQuestions, ...appendQuestions] : []
  const nextStackQuestionIds = new Set(nextStack.map(item => getFollowUpQuestionId(item)).filter(Boolean))

  followUpQuestionStack.value = nextStack
  followUpAnswers.value = {
    ...Object.fromEntries(Object.entries(followUpAnswers.value || {}).filter(([questionId]) => nextStackQuestionIds.has(questionId))),
    ...createFollowUpAnswerMap(appendQuestions)
  }
  committedFollowUpAnswers.value = {
    ...Object.fromEntries(Object.entries(committedFollowUpAnswers.value || {}).filter(([questionId]) => nextStackQuestionIds.has(questionId))),
    ...Object.fromEntries(Object.entries(submittedAnswerMap).filter(([questionId]) => nextStackQuestionIds.has(questionId)))
  }
  dirtyFollowUpFromIndex.value = -1
  followUpAnswerRevision.value = Number(nextResult?.answerRevision || followUpAnswerRevision.value || 0)
  activeFollowUpQuestionIndex.value = nextStack.length ? nextStack.length - 1 : 0
  expandedFollowUpOptionByQuestion.value = {}
}

async function submitFollowUps() {
  if (!result.value || !canProceedFollowUpQuestion()) {return}
  isSubmittingFollowUp.value = true
  try {
    const isRevisionSubmit = hasDirtyFollowUpAnswers.value
    const submitQuestionStack = isRevisionSubmit
      ? followUpQuestionStack.value.slice(0, activeFollowUpQuestionIndex.value + 1)
      : currentFollowUpQuestion.value
        ? [currentFollowUpQuestion.value]
        : []
    const payloadForSubmit = buildFollowUpPayload(result.value, followUpAnswers.value, {
      questionStack: submitQuestionStack,
      requestMode: isRevisionSubmit ? 'answer_revision' : 'answer_submit',
      baseAnswerRevision: followUpAnswerRevision.value,
      dirtyFromQuestionId: dirtyFollowUpFromIndex.value >= 0 ? getFollowUpQuestionId(followUpQuestionStack.value[dirtyFollowUpFromIndex.value]) : ''
    })
    const rerunResult = await followUpMutation.mutateAsync({
      diagnosisSessionId: payloadForSubmit.diagnosisSessionId,
      roundId: payloadForSubmit.roundId,
      answers: payloadForSubmit.answers,
      requestMode: payloadForSubmit.requestMode,
      baseAnswerRevision: payloadForSubmit.baseAnswerRevision,
      dirtyFromQuestionId: payloadForSubmit.dirtyFromQuestionId
    })

    result.value = normalizeDiagnosisResult(rerunResult, {
      images: images.value,
      plantName: plantName.value || result.value.plantName || '植物'
    })
    mergeFollowUpQuestionState(result.value, payloadForSubmit)

    diagnoseStore.addToHistory({
      images: images.value,
      diagnosis: result.value,
      diagnosisId: result.value.diagnosisSessionId || ''
    })

    uni.showToast({ title: result.value.followUpRequired ? '问诊已更新' : '诊断已完成', icon: 'success' })
  } catch (error) {
    console.error('问诊处理失败:', error)
    uni.showToast({ title: error.message || '问诊失败，请重试', icon: 'none' })
  } finally {
    isSubmittingFollowUp.value = false
  }
}
</script>

<style scoped>
.follow-up-page {
  min-height: 100vh;
  background: #f8f6f0;
}

.followup-page-swiper {
  width: 100%;
  height: 100vh;
  overflow-x: hidden;
  overflow-y: visible;
}

.followup-page-swiper-item {
  overflow-x: hidden;
  overflow-y: visible;
}

.followup-question-scroll {
  height: 100vh;
}

.followup-question-shell {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24px 16px 34px;
}

.followup-question-count {
  display: block;
  color: #8b7355;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
}

.followup-question-title {
  display: block;
  margin-top: 10px;
  color: #111827;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.45;
}

.followup-question-help {
  display: block;
  margin-top: 8px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.55;
}

.followup-accordion-option {
  overflow: hidden;
  border: 1px solid #e7e0d1;
  border-radius: 16px;
  background: #ffffff;
}

.followup-accordion-option--active {
  border-color: #2d7a4f;
  background: #eaf6ef;
}

.followup-accordion-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
}

.followup-accordion-text {
  flex: 1;
  color: #374151;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.45;
}

.followup-accordion-option--active .followup-accordion-text {
  color: #184d39;
}

.followup-accordion-badge {
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: #8b7355;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 8px;
}

.followup-accordion-option--active .followup-accordion-badge {
  color: #2d7a4f;
}

.followup-dirty-hint {
  display: block;
  margin-top: 10px;
  color: #8b7355;
  font-size: 10px;
  line-height: 1.5;
}

.followup-empty-state {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 28px 16px;
}

.followup-outcome-scroll {
  height: 100vh;
}

.followup-outcome-shell {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24px 16px 34px;
}

.followup-outcome-card {
  border: 1px solid #d8f3dc;
  border-radius: 28px;
  background: #ffffff;
  padding: 18px;
}

.followup-outcome-kicker {
  display: block;
  color: #8b7355;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
}

.followup-outcome-title {
  display: block;
  margin-top: 10px;
  color: #111827;
  font-size: 20px;
  font-weight: 900;
  line-height: 1.35;
}

.followup-outcome-summary {
  display: block;
  margin-top: 10px;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-line;
}

.followup-outcome-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  border-radius: 16px;
  background: #f8f6f0;
  padding: 12px 13px;
}

.followup-outcome-status-label {
  color: #6b7280;
  font-size: 12px;
  font-weight: 700;
}

.followup-outcome-status-value {
  color: #2d7a4f;
  font-size: 12px;
  font-weight: 900;
}

.followup-advice-card {
  margin-top: 14px;
  border-radius: 22px;
  padding: 15px;
}

.followup-advice-card--action {
  background: #f3faf5;
}

.followup-advice-card--avoid {
  background: #fff6f3;
}

.followup-advice-title {
  display: block;
  color: #111827;
  font-size: 15px;
  font-weight: 900;
  margin-bottom: 9px;
}

.followup-advice-text {
  display: block;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.65;
  margin-bottom: 8px;
  white-space: pre-line;
}

.followup-empty-title {
  display: block;
  color: #111827;
  font-size: 17px;
  font-weight: 800;
}

.followup-empty-text {
  display: block;
  margin-top: 8px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.55;
}

.followup-result-scroll {
  height: 100vh;
}

.followup-result-shell {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24px 16px 36px;
}

.followup-result-card,
.followup-result-section {
  border: 1px solid #e7e0d1;
  border-radius: 22px;
  background: #fffdf8;
  box-shadow: 0 14px 34px rgba(45, 122, 79, 0.08);
}

.followup-result-card {
  padding: 18px;
}

.followup-result-kicker {
  display: block;
  color: #2d7a4f;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
}

.followup-result-title {
  display: block;
  margin-top: 9px;
  color: #111827;
  font-size: 21px;
  font-weight: 900;
  line-height: 1.35;
}

.followup-result-summary {
  display: block;
  margin-top: 10px;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.65;
}

.followup-result-meta {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.followup-result-meta-item {
  flex: 1;
  border-radius: 16px;
  background: #eef7f1;
  padding: 11px 12px;
}

.followup-result-meta-label {
  display: block;
  color: #6b7280;
  font-size: 10px;
  font-weight: 700;
}

.followup-result-meta-value {
  display: block;
  margin-top: 5px;
  color: #184d39;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
}

.followup-result-section {
  margin-top: 14px;
  padding: 16px;
}

.followup-result-section-title {
  display: block;
  color: #111827;
  font-size: 15px;
  font-weight: 900;
}

.followup-result-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.followup-result-chip {
  border-radius: 999px;
  background: #eaf6ef;
  color: #2d6a4f;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  padding: 8px 10px;
}

.followup-result-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 12px;
}

.followup-result-list-item,
.followup-result-muted {
  display: block;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.65;
}

.followup-result-muted {
  margin-top: 10px;
}

.follow-up-scroll {
  height: 100vh;
}

.grid-gap {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.whitespace-pre-line {
  white-space: pre-line;
}

.followup-swiper {
  width: 100%;
}

.followup-swiper-item {
  overflow: visible;
}

.followup-question-card {
  padding: 14px;
  border-radius: 20px;
  background: #f8f6f0;
  border: 1px solid #d8f3dc;
}

.followup-question-card--animated {
  animation: followup-card-enter 240ms ease-out both;
}

.followup-option-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.followup-option-button {
  width: 100%;
  display: flex;
  justify-content: flex-start;
  text-align: left;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid #e7e0d1;
  background: #ffffff;
}

.followup-option-button--active {
  border-color: #2d7a4f;
  background: #eaf6ef;
}

.followup-option-content {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.followup-option-text {
  color: #1f2937;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.followup-option-description {
  color: #6b7280;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-line;
}

.followup-option-collapse {
  overflow: visible;
}

.followup-option-accordion-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid #e7e0d1;
  background: #ffffff;
}

.followup-option-accordion-title--active {
  border-color: #2d7a4f;
  background: #eaf6ef;
}

.followup-option-accordion-text {
  flex: 1;
  color: #1f2937;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
}

.followup-option-accordion-badge {
  flex-shrink: 0;
  color: #2d7a4f;
  font-size: 10px;
  font-weight: 700;
}

.followup-option-collapse-body {
  margin: 8px 2px 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fffdf8;
}

.followup-option-collapse-body--active {
  background: #f3faf5;
}

.followup-nav-row {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.followup-nav-button {
  flex: 1;
  height: 40px;
  padding: 0;
  border: 1px solid #b7dcc5;
  border-radius: 14px;
  background: #ffffff;
  color: #2d6a4f;
  font-size: 13px;
  font-weight: 700;
  line-height: 40px;
}

.followup-nav-button--primary {
  background: #2d7a4f;
  color: #ffffff;
}

.followup-nav-button--disabled {
  opacity: 0.45;
}

@keyframes followup-card-enter {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
