import { computed, ref, watch } from 'vue'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import { createQuestionAnswerMap } from '@/utils/diagnose-flow.js'
import { getQuestionIdentity as getQuestionId } from '@/utils/diagnose-question-identity.js'
import {
  extractCareBehaviorTimelineFromQuestion,
  getVisibleCareBehaviorOptions,
  hasMeaningfulCareBehaviorTimeline,
  isCareBehaviorTimelineSentinelAnswer,
  isCareBehaviorTimelineUnclearAnswer,
  isCareBehaviorWateringTimelineQuestion,
  isSessionWateringTimelineQuestion,
  normalizeCareBehaviorTimeline,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  resolveCareBehaviorTimelineRecordedAnswerOptionId
} from '@/utils/care-behavior-timeline.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import {
  getLightEnvironmentSignature,
  isLightEnvironmentQuestion,
  resolveLightEnvironmentAnswerKey,
  sanitizeLightEnvironment
} from './light-environment.js'
import {
  buildEnvironmentWeatherWindowRequestKey,
  buildLightEnvironmentByQuestionIdMap,
  dedupeQuestionsById,
  getLightEnvironmentForQuestion,
  resolveCareBehaviorReferenceDate,
  resolveCareBehaviorWeatherLocation
} from './question-environment.js'
import { estimateQuestionSwiperHeight } from './question-display.js'
import { submitQuestionPackageAnswers } from './question-submit.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function isPackageResult(value = {}) {
  return (
    value?.uiHints?.answerSubmitMode === 'package' ||
    value?.uiHints?.questionDisplayMode === 'package' ||
    value?.questionPackage?.answerSubmitMode === 'package'
  )
}

function getQuestionOptionId(option = {}) {
  return normalizeText(option?.optionId)
}

export function useQuestionPackageFlow({
  result,
  images,
  plantName,
  userStore,
  diagnoseStore,
  diagnosisAnswerMutation
}) {
  const questionStack = ref([])
  const activeQuestionIndex = ref(0)
  const questionAnswers = ref({})
  const careBehaviorTimelineByQuestionId = ref({})
  const lightEnvironmentByQuestionId = ref({})
  const environmentWeatherWindow = ref(null)
  const environmentWeatherWindowRequestKey = ref('')
  const environmentWeatherWindowLoading = ref(false)
  const environmentWeatherWindowError = ref('')
  const suppressedTimelineAnswerByQuestionId = ref({})
  const isSubmittingQuestionAnswer = ref(false)

  const currentQuestion = computed(() => questionStack.value[activeQuestionIndex.value] || null)
  const isQuestionPackageMode = computed(
    () => isPackageResult(result.value) && questionStack.value.length > 1
  )
  const questionPageTrackStyle = computed(
    () => `transform: translateX(-${activeQuestionIndex.value * 100}%);`
  )
  const questionSwiperStyle = computed(() => ({
    height: `${estimateQuestionSwiperHeight(currentQuestion.value)}px`
  }))
  const questionProgressText = computed(() => {
    const currentIndex = Math.min(activeQuestionIndex.value + 1, questionStack.value.length || 1)
    return `问题 ${currentIndex} / ${questionStack.value.length || 1}`
  })
  const nextButtonText = computed(() => {
    if (isSubmittingQuestionAnswer.value) {
      return '处理中...'
    }
    return activeQuestionIndex.value >= questionStack.value.length - 1 ? '完成问诊' : '下一题'
  })

  function buildCareBehaviorTimelineByQuestionIdMap(questions = []) {
    return (Array.isArray(questions) ? questions : [])
      .filter(item => isCareBehaviorWateringTimelineQuestion(item))
      .reduce((acc, item) => {
        const questionId = getQuestionId(item)
        if (!questionId) {
          return acc
        }
        acc[questionId] = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
          careBehaviorTimelineByQuestionId.value?.[questionId] ||
            extractCareBehaviorTimelineFromQuestion(item),
          environmentWeatherWindow.value
        )
        return acc
      }, {})
  }

  function resetQuestionState(questions = []) {
    const nextQuestions = dedupeQuestionsById(
      Array.isArray(questions) ? questions.filter(item => getQuestionId(item)) : []
    )
    questionStack.value = nextQuestions
    activeQuestionIndex.value = 0
    questionAnswers.value = createQuestionAnswerMap(nextQuestions)
    careBehaviorTimelineByQuestionId.value = buildCareBehaviorTimelineByQuestionIdMap(nextQuestions)
    lightEnvironmentByQuestionId.value = buildLightEnvironmentByQuestionIdMap(
      nextQuestions,
      lightEnvironmentByQuestionId.value
    )
    suppressedTimelineAnswerByQuestionId.value = {}
    refreshEnvironmentWeatherWindowForCareBehavior(nextQuestions)
  }

  function getCareBehaviorTimelineByQuestion(question = {}) {
    const questionId = getQuestionId(question)
    const fallbackTimeline = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
      extractCareBehaviorTimelineFromQuestion(question),
      environmentWeatherWindow.value
    )
    if (!questionId) {
      return fallbackTimeline
    }
    const storedTimeline = careBehaviorTimelineByQuestionId.value[questionId]
    return storedTimeline && Object.keys(storedTimeline).length
      ? mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
          storedTimeline,
          environmentWeatherWindow.value
        )
      : fallbackTimeline
  }

  function getCareBehaviorTimelineChangeSignature(timeline = null) {
    const normalized = normalizeCareBehaviorTimeline(timeline || {})
    return JSON.stringify({
      reference_date: normalized.reference_date || '',
      watering_events_10d: normalized.watering_events_10d || [],
      fertilizing_events_10d: normalized.fertilizing_events_10d || [],
      light_change_events_10d: normalized.light_change_events_10d || [],
      last_fertilized_bucket: normalized.last_fertilized_bucket || 'unknown'
    })
  }

  function suppressTimelineAnswerSync(questionId = '', suppressed = false) {
    const normalizedQuestionId = normalizeText(questionId)
    if (!normalizedQuestionId) {
      return
    }
    const nextState = { ...suppressedTimelineAnswerByQuestionId.value }
    if (suppressed) {
      nextState[normalizedQuestionId] = true
    } else {
      delete nextState[normalizedQuestionId]
    }
    suppressedTimelineAnswerByQuestionId.value = nextState
  }

  function isTimelineAnswerSyncSuppressed(questionId = '') {
    return Boolean(suppressedTimelineAnswerByQuestionId.value[normalizeText(questionId)])
  }

  function syncCareBehaviorTimelineAnswer(question, timeline = null) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    const currentOptionId = normalizeText(questionAnswers.value[questionId])
    if (
      isCareBehaviorTimelineUnclearAnswer(question, currentOptionId) &&
      isTimelineAnswerSyncSuppressed(questionId)
    ) {
      return
    }
    const recordedOptionId = resolveCareBehaviorTimelineRecordedAnswerOptionId(question)
    const nextAnswerId = hasMeaningfulCareBehaviorTimeline(timeline)
      ? isSessionWateringTimelineQuestion(question)
        ? 'care_behavior_timeline'
        : recordedOptionId
      : ''
    if (nextAnswerId) {
      if (currentOptionId !== nextAnswerId) {
        setQuestionAnswer(questionId, nextAnswerId)
      }
      return
    }
    if (currentOptionId) {
      setQuestionAnswer(questionId, '')
    }
  }

  function handleCareBehaviorTimelineChange(question, timeline = null) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    const currentTimeline = careBehaviorTimelineByQuestionId.value?.[questionId] || {}
    const nextTimeline = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
      timeline || {},
      environmentWeatherWindow.value
    )
    if (
      getCareBehaviorTimelineChangeSignature(currentTimeline) ===
      getCareBehaviorTimelineChangeSignature(nextTimeline)
    ) {
      syncCareBehaviorTimelineAnswer(
        question,
        Object.keys(currentTimeline).length ? currentTimeline : nextTimeline
      )
      return
    }
    suppressTimelineAnswerSync(questionId, false)
    careBehaviorTimelineByQuestionId.value = {
      ...careBehaviorTimelineByQuestionId.value,
      [questionId]: nextTimeline
    }
    syncCareBehaviorTimelineAnswer(question, nextTimeline)
  }

  function getLightEnvironmentByQuestion(question = {}) {
    return getLightEnvironmentForQuestion(question, lightEnvironmentByQuestionId.value)
  }

  function handleLightEnvironmentChange(question, nextEnvironment = {}) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    const normalized = sanitizeLightEnvironment(nextEnvironment)
    const currentEnvironment = lightEnvironmentByQuestionId.value?.[questionId] || {}
    if (
      getLightEnvironmentSignature(currentEnvironment) !== getLightEnvironmentSignature(normalized)
    ) {
      lightEnvironmentByQuestionId.value = {
        ...lightEnvironmentByQuestionId.value,
        [questionId]: normalized
      }
    }
    const nextAnswerKey = resolveLightEnvironmentAnswerKey(question, normalized)
    if (nextAnswerKey) {
      setQuestionAnswer(questionId, nextAnswerKey)
    }
  }

  function setQuestionAnswer(questionId, answerValue) {
    const normalizedQuestionId = normalizeText(questionId)
    if (!normalizedQuestionId) {
      return
    }
    questionAnswers.value = { ...questionAnswers.value, [normalizedQuestionId]: answerValue }
    const question = questionStack.value.find(item => getQuestionId(item) === normalizedQuestionId)
    if (!question || !isCareBehaviorWateringTimelineQuestion(question)) {
      return
    }
    const answerId = normalizeText(answerValue)
    const autoAnswerId = resolveCareBehaviorTimelineAutoAnswerOptionId(question)
    if (
      isCareBehaviorTimelineSentinelAnswer(question, answerId) ||
      answerId === autoAnswerId ||
      isCareBehaviorTimelineUnclearAnswer(question, answerId)
    ) {
      if (isCareBehaviorTimelineUnclearAnswer(question, answerId)) {
        suppressTimelineAnswerSync(normalizedQuestionId, true)
      }
      return
    }
    suppressTimelineAnswerSync(normalizedQuestionId, false)
    careBehaviorTimelineByQuestionId.value = {
      ...careBehaviorTimelineByQuestionId.value,
      [normalizedQuestionId]: {}
    }
  }

  function selectQuestionOption(question, option) {
    const questionId = getQuestionId(question)
    const optionId = getQuestionOptionId(option)
    if (!questionId || !optionId) {
      return
    }
    suppressTimelineAnswerSync(
      questionId,
      isCareBehaviorWateringTimelineQuestion(question) &&
        isCareBehaviorTimelineUnclearAnswer(question, optionId)
    )
    setQuestionAnswer(questionId, optionId)
  }

  function isSelectedQuestionOption(question, option) {
    const questionId = getQuestionId(question)
    const optionId = getQuestionOptionId(option)
    return Boolean(
      questionId &&
      optionId &&
      normalizeText(questionAnswers.value[questionId] || question?.defaultOptionId) === optionId
    )
  }

  function isQuestionAnswered(question) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return false
    }
    if (isCareBehaviorWateringTimelineQuestion(question)) {
      return (
        Boolean(questionAnswers.value[questionId]) ||
        hasMeaningfulCareBehaviorTimeline(getCareBehaviorTimelineByQuestion(question))
      )
    }
    if (isLightEnvironmentQuestion(question)) {
      return (
        Boolean(questionAnswers.value[questionId]) &&
        Boolean(lightEnvironmentByQuestionId.value[questionId])
      )
    }
    return Boolean(questionAnswers.value[questionId])
  }

  function canProceedQuestion() {
    if (isSubmittingQuestionAnswer.value || !isQuestionAnswered(currentQuestion.value)) {
      return false
    }
    if (
      isQuestionPackageMode.value &&
      activeQuestionIndex.value >= questionStack.value.length - 1
    ) {
      return questionStack.value.every(isQuestionAnswered)
    }
    return true
  }

  function goPreviousQuestion() {
    activeQuestionIndex.value = Math.max(0, activeQuestionIndex.value - 1)
  }

  function goNextQuestion() {
    activeQuestionIndex.value = Math.min(
      Math.max(questionStack.value.length - 1, 0),
      activeQuestionIndex.value + 1
    )
  }

  async function submitQuestionAnswers() {
    if (!result.value || !canProceedQuestion()) {
      return
    }
    isSubmittingQuestionAnswer.value = true
    try {
      await submitQuestionPackageAnswers({
        result,
        images: images.value,
        plantName: plantName.value,
        questionAnswers: questionAnswers.value,
        questionStack: questionStack.value,
        currentQuestion: currentQuestion.value,
        isQuestionPackageMode: isQuestionPackageMode.value,
        careBehaviorTimelineByQuestionId: careBehaviorTimelineByQuestionId.value,
        lightEnvironmentByQuestionId: lightEnvironmentByQuestionId.value,
        environmentWeatherWindow: environmentWeatherWindow.value,
        diagnosisAnswerMutation,
        diagnoseStore,
        resetQuestionState
      })
    } catch (error) {
      console.error('问诊处理失败:', error)
      uni.showToast({ title: error.message || '问诊失败，请重试', icon: 'none' })
    } finally {
      isSubmittingQuestionAnswer.value = false
    }
  }

  async function handleNextQuestion() {
    if (!canProceedQuestion()) {
      return
    }
    if (activeQuestionIndex.value < questionStack.value.length - 1) {
      goNextQuestion()
      return
    }
    await submitQuestionAnswers()
  }

  function applyEnvironmentWeatherWindowToCareBehaviorTimelines() {
    if (!environmentWeatherWindow.value) {
      return
    }
    careBehaviorTimelineByQuestionId.value = Object.fromEntries(
      Object.entries(careBehaviorTimelineByQuestionId.value || {}).map(([questionId, timeline]) => [
        questionId,
        mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
          timeline,
          environmentWeatherWindow.value
        )
      ])
    )
  }

  async function refreshEnvironmentWeatherWindowForCareBehavior(questions = questionStack.value) {
    environmentWeatherWindowError.value = ''
    try {
      const environmentQuestions = (Array.isArray(questions) ? questions : []).filter(
        item => isCareBehaviorWateringTimelineQuestion(item) || isLightEnvironmentQuestion(item)
      )
      if (!environmentQuestions.length || environmentWeatherWindowLoading.value) {
        return
      }
      const location = resolveCareBehaviorWeatherLocation(userStore.location || {})
      if (!location) {
        return
      }
      const diagnosisDate = resolveCareBehaviorReferenceDate(environmentQuestions)
      const requestKey = buildEnvironmentWeatherWindowRequestKey(location, diagnosisDate)
      if (
        requestKey === environmentWeatherWindowRequestKey.value &&
        environmentWeatherWindow.value
      ) {
        applyEnvironmentWeatherWindowToCareBehaviorTimelines()
        return
      }
      environmentWeatherWindowLoading.value = true
      const weatherWindow = await getEnvironmentWeatherWindow({
        ...location,
        diagnosisDate,
        mode: 'diagnosis'
      })
      if (weatherWindow) {
        environmentWeatherWindow.value = weatherWindow
        environmentWeatherWindowRequestKey.value = requestKey
        applyEnvironmentWeatherWindowToCareBehaviorTimelines()
      }
    } catch (error) {
      console.warn('获取养护时间线环境天气失败:', error)
      environmentWeatherWindowError.value = String(
        error?.message || error?.msg || '养护时间线天气加载失败，请稍后重试。'
      ).trim()
    } finally {
      environmentWeatherWindowLoading.value = false
    }
  }

  watch(
    () => [
      userStore.location?.latitude,
      userStore.location?.longitude,
      userStore.location?.city,
      userStore.location?.province,
      questionStack.value.map(item => getQuestionId(item)).join('|')
    ],
    () => refreshEnvironmentWeatherWindowForCareBehavior()
  )

  return {
    questionStack,
    activeQuestionIndex,
    questionAnswers,
    lightEnvironmentByQuestionId,
    currentQuestion,
    isQuestionPackageMode,
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
    getLightEnvironmentByQuestion,
    handleLightEnvironmentChange,
    getVisibleCareBehaviorOptions,
    isCareBehaviorWateringTimelineQuestion,
    isLightEnvironmentQuestion,
    selectQuestionOption,
    isSelectedQuestionOption,
    canProceedQuestion,
    goPreviousQuestion,
    handleNextQuestion
  }
}
