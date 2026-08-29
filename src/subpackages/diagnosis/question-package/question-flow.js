import { computed, ref, watch } from 'vue'
import { usePlantStore } from '@/store/plants.js'
import { createQuestionAnswerMap } from '../utils/diagnose-flow.js'
import { getQuestionIdentity as getQuestionId } from '../utils/diagnose-question-identity.js'
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
  hasMeaningfulLightEnvironment,
  isLightEnvironmentQuestion,
  isUserConfirmedLightEnvironment,
  sanitizeLightEnvironment
} from '@/utils/light-environment.js'
import {
  buildLightEnvironmentByQuestionIdMap,
  dedupeQuestionsById,
  getLightEnvironmentForQuestion,
  getSavedLightEnvironment
} from './question-environment.js'
import { fetchUserPlant, patchUserPlant } from '@/api/plants-http.js'
import { createAsyncActionGuard } from '@/utils/interaction-guard.js'
import { estimateQuestionSwiperHeight } from './question-display.js'
import { useEnvironmentWeatherWindow } from './question-weather-window.js'
import { submitQuestionPackageAnswers } from './question-submit.js'
import { useQuestionAirEnvironment } from './question-air-environment.js'

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

function requiresAirEnvironmentPackageRestart(value = {}) {
  const mode = normalizeText(value?.questionPackage?.mode)
  return (
    ['yellow_leaf', 'wilting_droop'].includes(mode) &&
    Number(value?.questionPackage?.packageVersion || 1) < 2 &&
    Boolean(value?.hasActiveQuestions)
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
  const plantStore = usePlantStore()
  const questionStack = ref([])
  const activeQuestionIndex = ref(0)
  const questionAnswers = ref({})
  const careBehaviorTimelineByQuestionId = ref({})
  const lightEnvironmentByQuestionId = ref({})
  const lightEnvironmentConfirmedByQuestionId = ref({})
  const suppressedTimelineAnswerByQuestionId = ref({})
  const isSubmittingQuestionAnswer = ref(false)
  const submitQuestionAnswersAction = createAsyncActionGuard()
  const isQuestionStatePreparing = ref(false)
  const packageRestartRequired = ref(false)
  const airEnvironment = useQuestionAirEnvironment({
    result,
    plantStore,
    setQuestionAnswer
  })
  const {
    environmentWeatherWindow,
    environmentWeatherByDate,
    environmentWeatherWindowLoading,
    environmentWeatherWindowError,
    refreshEnvironmentWeatherWindowForCareBehavior
  } = useEnvironmentWeatherWindow({ result, plantStore, userStore })

  const currentQuestion = computed(() => questionStack.value[activeQuestionIndex.value] || null)
  const isQuestionPackageMode = computed(() => isPackageResult(result.value))
  const questionSwiperStyle = computed(() => {
    // 光照环境题同时包含光型图例、进入方式、补光灯和近期变化，
    // 固定像素高度容易裁剪折叠面板下方内容；改为占满可用高度，由内部 scroll-view 自行滚动。
    if (isLightEnvironmentQuestion(currentQuestion.value)) {
      return {}
    }
    // 养护行为浇水时间线题包含 CareBehaviorWateringDoseList，多日期 dose slider 行数动态，
    // 固定像素高度（estimateQuestionSwiperHeight 默认 220）会裁剪多日期档位；
    // 改为占满可用高度，由内部 scroll-view 自行滚动，保证所有档位 slider 都可见。
    if (isCareBehaviorWateringTimelineQuestion(currentQuestion.value)) {
      return {}
    }
    return {
      height: `${estimateQuestionSwiperHeight(currentQuestion.value)}px`
    }
  })
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

  async function resetQuestionState(questions = []) {
    packageRestartRequired.value = requiresAirEnvironmentPackageRestart(result.value)
    if (packageRestartRequired.value) {
      questionStack.value = []
      activeQuestionIndex.value = 0
      questionAnswers.value = {}
      careBehaviorTimelineByQuestionId.value = {}
      lightEnvironmentByQuestionId.value = {}
      lightEnvironmentConfirmedByQuestionId.value = {}
      suppressedTimelineAnswerByQuestionId.value = {}
      airEnvironment.reset([])
      return
    }
    isQuestionStatePreparing.value = true
    questionStack.value = []
    try {
      const nextQuestions = dedupeQuestionsById(
        Array.isArray(questions) ? questions.filter(item => getQuestionId(item)) : []
      )
      activeQuestionIndex.value = 0
      questionAnswers.value = createQuestionAnswerMap(nextQuestions)
      careBehaviorTimelineByQuestionId.value = {}
      const savedLightEnvironment = getSavedLightEnvironment(result.value, plantStore)
      lightEnvironmentByQuestionId.value = buildLightEnvironmentByQuestionIdMap(
        nextQuestions,
        lightEnvironmentByQuestionId.value,
        savedLightEnvironment
      )
      lightEnvironmentConfirmedByQuestionId.value = Object.fromEntries(
        nextQuestions
          .filter(item => isLightEnvironmentQuestion(item))
          .map(item => [getQuestionId(item), false])
      )
      suppressedTimelineAnswerByQuestionId.value = {}
      airEnvironment.reset(nextQuestions)
      careBehaviorTimelineByQuestionId.value =
        buildCareBehaviorTimelineByQuestionIdMap(nextQuestions)
      questionStack.value = nextQuestions
      hydrateSavedLightEnvironment(nextQuestions)
      if (nextQuestions.some(item => isCareBehaviorWateringTimelineQuestion(item))) {
        // 天气是时间线的补充数据，不能阻塞独立问诊的题目挂载。请求完成后通过
        // environmentWeatherByDate 与时间线 map 的响应式更新填充指标；失败只在时间线提示。
        refreshEnvironmentWeatherWindowForCareBehavior(
          nextQuestions,
          careBehaviorTimelineByQuestionId
        ).then(() => {
          careBehaviorTimelineByQuestionId.value =
            buildCareBehaviorTimelineByQuestionIdMap(nextQuestions)
        })
      }
    } finally {
      isQuestionStatePreparing.value = false
    }
  }

  async function hydrateSavedLightEnvironment(questions = []) {
    const lightQuestions = (Array.isArray(questions) ? questions : []).filter(item =>
      isLightEnvironmentQuestion(item)
    )
    const userPlantId = Number(
      result.value?.plantContext?.userPlantId || result.value?.userPlantId || 0
    )
    if (!lightQuestions.length || !userPlantId) {
      return
    }
    try {
      const response = await fetchUserPlant(userPlantId)
      const saved = response?.code === 200 ? response.data?.lightEnvironment : null
      if (!hasMeaningfulLightEnvironment(saved)) {
        return
      }
      const nextMap = { ...lightEnvironmentByQuestionId.value }
      let changed = false
      for (const question of lightQuestions) {
        const questionId = getQuestionId(question)
        if (
          questionId &&
          !isLightEnvironmentConfirmed(question) &&
          !hasMeaningfulLightEnvironment(nextMap[questionId])
        ) {
          nextMap[questionId] = sanitizeLightEnvironment(saved)
          changed = true
        }
      }
      if (changed) {
        lightEnvironmentByQuestionId.value = nextMap
      }
    } catch (error) {
      console.warn('读取已有光照环境失败:', error)
    }
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
    lightEnvironmentConfirmedByQuestionId.value = {
      ...lightEnvironmentConfirmedByQuestionId.value,
      [questionId]: isUserConfirmedLightEnvironment(normalized)
    }
  }

  function confirmLightEnvironment(question, nextEnvironment = {}) {
    handleLightEnvironmentChange(question, nextEnvironment)
  }

  function isLightEnvironmentConfirmed(question = {}) {
    return Boolean(lightEnvironmentConfirmedByQuestionId.value[getQuestionId(question)])
  }

  function requiresLightEnvironmentConfirmation(question = {}) {
    const environment = getLightEnvironmentByQuestion(question)
    return (
      hasMeaningfulLightEnvironment(environment) &&
      environment.captureSource === 'user' &&
      !isLightEnvironmentConfirmed(question)
    )
  }

  async function persistConfirmedLightEnvironment() {
    const entry = questionStack.value
      .filter(item => isLightEnvironmentQuestion(item))
      .map(item => ({
        question: item,
        environment: lightEnvironmentByQuestionId.value[getQuestionId(item)]
      }))
      .find(
        item =>
          isLightEnvironmentConfirmed(item.question) &&
          isUserConfirmedLightEnvironment(item.environment)
      )
    if (!entry) {
      return
    }
    const userPlantId = Number(
      result.value?.plantContext?.userPlantId || result.value?.userPlantId || 0
    )
    if (!userPlantId) {
      return
    }
    const response = await patchUserPlant({
      id: userPlantId,
      lightEnvironment: entry.environment
    })
    if (response?.code !== 200) {
      throw new Error(response?.message || '光照环境保存失败，请重试')
    }
    plantStore.updateUserPlantLocal(userPlantId, {
      lightEnvironment: entry.environment
    })
    if (Number(plantStore.currentPlant?.id) === userPlantId) {
      plantStore.currentPlant = {
        ...plantStore.currentPlant,
        lightEnvironment: entry.environment
      }
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
    if (airEnvironment.isAirEnvironmentQuestion(question)) {
      airEnvironment.selectUnknown(question)
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

  const getSelectedQuestionOptionId = question =>
    normalizeText(questionAnswers.value[getQuestionId(question)])

  async function skipQuestionRisk(question, option) {
    selectQuestionOption(question, option)
    await handleNextQuestion()
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
        hasMeaningfulLightEnvironment(lightEnvironmentByQuestionId.value[questionId]) &&
        isLightEnvironmentConfirmed(question)
      )
    }
    if (airEnvironment.isAirEnvironmentQuestion(question)) {
      return airEnvironment.isAnswered(question, questionAnswers.value[questionId])
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

  function submitQuestionAnswers() {
    return submitQuestionAnswersAction.run(async () => {
      if (!result.value || !canProceedQuestion()) {
        return
      }
      isSubmittingQuestionAnswer.value = true
      try {
        await persistConfirmedLightEnvironment()
        const frozenAirEnvironment = airEnvironment.freezeForSubmit(questionStack.value)
        airEnvironment.saveInBackground(questionStack.value, frozenAirEnvironment)
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
          airEnvironmentByQuestionId: frozenAirEnvironment.byQuestionId,
          airEnvironmentSnapshotsByQuestionId: frozenAirEnvironment.snapshotsByQuestionId,
          environmentWeatherWindow: environmentWeatherWindow.value,
          diagnosisAnswerMutation,
          diagnoseStore,
          resetQuestionState
        })
      } catch (error) {
        console.error('问诊处理失败:', error)
        uni.showToast({ title: '暂时无法提交回答，请检查网络后重试', icon: 'none' })
      } finally {
        isSubmittingQuestionAnswer.value = false
      }
    })
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

  watch(
    () => [
      userStore.location?.latitude,
      userStore.location?.longitude,
      userStore.location?.city,
      userStore.location?.province,
      questionStack.value.map(item => getQuestionId(item)).join('|')
    ],
    () =>
      refreshEnvironmentWeatherWindowForCareBehavior(
        questionStack.value,
        careBehaviorTimelineByQuestionId
      ),
    { immediate: true }
  )

  return {
    questionStack,
    activeQuestionIndex,
    questionAnswers,
    lightEnvironmentByQuestionId,
    lightEnvironmentConfirmedByQuestionId,
    currentQuestion,
    isQuestionPackageMode,
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
    getVisibleCareBehaviorOptions,
    isCareBehaviorWateringTimelineQuestion,
    isLightEnvironmentQuestion,
    isAirEnvironmentQuestion: airEnvironment.isAirEnvironmentQuestion,
    airEnvironmentUi: airEnvironment,
    openAirEnvironmentEditor: airEnvironment.openEditor,
    confirmAirEnvironmentLocation: airEnvironment.confirmSavedProfile,
    handleAirEnvironmentChange: airEnvironment.change,
    selectAirEnvironmentUnknown: airEnvironment.selectUnknown,
    selectQuestionOption,
    isSelectedQuestionOption,
    getSelectedQuestionOptionId,
    skipQuestionRisk,
    canProceedQuestion,
    goPreviousQuestion,
    handleNextQuestion
  }
}
