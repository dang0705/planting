import { computed, ref, watch } from 'vue'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import {
  buildQuestionAnswerPayload,
  createQuestionAnswerMap,
  normalizeDiagnosisResult
} from '@/utils/diagnose-flow.js'
import {
  extractCareBehaviorTimelineFromQuestion,
  getVisibleCareBehaviorOptions,
  hasMeaningfulCareBehaviorTimeline,
  isCareBehaviorTimelineSentinelAnswer,
  isCareBehaviorTimelineUnclearAnswer,
  isCareBehaviorWateringTimelineQuestion,
  isLegacyWateringTimelineQuestion,
  normalizeCareBehaviorTimeline,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  resolveCareBehaviorTimelineRecordedAnswerOptionId
} from '@/utils/care-behavior-timeline.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function sanitizeTemplateText(value = '') {
  return String(value || '').replace(/\{\{[^}]+\}\}/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function dedupeQuestionsById(questions = []) {
  const seen = new Set()
  return (Array.isArray(questions) ? questions : [])
    .map(item => item || {})
    .filter(item => {
      const questionId = normalizeText(item?.questionId)
      if (!questionId || seen.has(questionId)) {return false}
      seen.add(questionId)
      return true
    })
}

function isPackageResult(value = {}) {
  return value?.uiHints?.answerSubmitMode === 'package' ||
    value?.uiHints?.questionDisplayMode === 'package' ||
    value?.questionPackage?.answerSubmitMode === 'package'
}

function isFrequencyOption(optionKey = '', optionText = '', optionKeys = []) {
  if (optionKeys.includes(optionKey)) {return true}
  if (!optionText) {return false}
  return optionKeys.some(item => optionText.includes(item.replaceAll('_', '')))
}

function isYellowingQuestion(question = {}) {
  const questionKey = normalizeText(question?.questionKey)
  const questionText = normalizeText(question?.questionTextCn || question?.questionTextUserCn || question?.questionText || '')
  return questionKey.includes('yellowing') || questionText.includes('黄叶')
}

function isYellowingWateringQuestion(questionKey = '', targetDimension = '') {
  return questionKey.includes('watering_frequency_context') ||
    questionKey.includes('watering_context') ||
    questionKey.includes('watering') ||
    targetDimension.includes('watering')
}

function isYellowingFertilizationQuestion(questionKey = '', targetDimension = '') {
  return questionKey.includes('fertilization_growth_context') ||
    questionKey.includes('fertilization_context') ||
    questionKey.includes('fertilization_reference') ||
    questionKey.includes('fertilization') ||
    targetDimension.includes('fertilization')
}

function resolveYellowingQuestionOptionText(question = {}, option = {}) {
  if (!isYellowingQuestion(question)) {return ''}
  const optionKey = normalizeText(option?.optionKey || option?.value || option?.optionId || option?.id || '')
  const optionText = normalizeText(option?.optionTextUserCn || option?.optionTextCn || option?.text || option?.optionText || option?.label || '')
  const questionKey = normalizeText(question?.questionKey)
  const targetDimension = normalizeText(question?.targetDimension)

  if (isYellowingWateringQuestion(questionKey, targetDimension)) {
    if (isFrequencyOption(optionKey, optionText, ['often_wet','more_wet','too_wet','over_wet','yes'])) {return '近2周 2 次以上'}
    if (isFrequencyOption(optionKey, optionText, ['normal_or_stable','no_change','normal','stable'])) {return '近2周 1-2 次'}
    if (isFrequencyOption(optionKey, optionText, ['often_dry','more_dry','not_enough','dry','lack'])) {return '近2周 0 次'}
  }
  if (isYellowingFertilizationQuestion(questionKey, targetDimension)) {
    if (isFrequencyOption(optionKey, optionText, ['low_or_no_fertilizer','no','none','not_fertilized'])) {return '近1个月 0 次'}
    if (isFrequencyOption(optionKey, optionText, ['normal_light_fertilizer','normal','appropriate'])) {return '近1个月 1-2 次'}
    if (isFrequencyOption(optionKey, optionText, ['recent_heavy_fertilizer_or_repot','heavy_fertilizer','heavy','repot','fertilize'])) {return '近1个月 2 次以上'}
  }
  return ''
}

export function getQuestionId(question = {}) {
  return normalizeText(question?.questionId)
}

export function getQuestionTitle(question = {}) {
  if (isCareBehaviorWateringTimelineQuestion(question)) {
    return '请您选择在过去的10天内，哪几天浇了水？'
  }
  return sanitizeTemplateText(question?.questionTextUserCn || question?.questionTextCn || question?.questionText || question?.text || '')
}

export function getQuestionHelpText(question = {}) {
  return sanitizeTemplateText(question?.helpTextCn || question?.helpText || question?.questionHelpText || '')
}

export function getOptionText(question = {}, option = {}) {
  const text = sanitizeTemplateText(option?.optionTextUserCn || option?.optionTextCn || option?.text || option?.optionText || option?.label || option?.desc || '')
  return resolveYellowingQuestionOptionText(question, option) || text
}

export function getOptionDescription(option = {}) {
  return sanitizeTemplateText(option?.descriptionCn || option?.optionDescription || option?.description || option?.desc || '')
}

function getQuestionOptionId(option = {}) {
  return normalizeText(option?.optionId)
}

function estimateQuestionSwiperHeight(question) {
  if (!question) {return 280}
  const options = Array.isArray(question.options) ? question.options : []
  const titleRows = Math.ceil(Math.max(getQuestionTitle(question).length - 26, 0) / 22)
  const helpRows = getQuestionHelpText(question) ? Math.ceil(getQuestionHelpText(question).length / 34) : 0
  const timelineHeight = isCareBehaviorWateringTimelineQuestion(question) ? 220 : 0
  const optionHeight = options.reduce((sum, option) => sum + 52 + Math.max(0, Math.ceil(getOptionText(question, option).length / 18) - 1) * 18, 0)
  return Math.max(280, Math.min(1020, 118 + titleRows * 18 + helpRows * 16 + timelineHeight + optionHeight + 72))
}

export function useQuestionPackageFlow({ result, images, plantName, userStore, diagnoseStore, diagnosisAnswerMutation }) {
  const questionStack = ref([])
  const activeQuestionIndex = ref(0)
  const questionAnswers = ref({})
  const careBehaviorTimelineByQuestionId = ref({})
  const environmentWeatherWindow = ref(null)
  const environmentWeatherWindowRequestKey = ref('')
  const environmentWeatherWindowLoading = ref(false)
  const environmentWeatherWindowError = ref('')
  const suppressedTimelineAnswerByQuestionId = ref({})
  const isSubmittingQuestionAnswer = ref(false)

  const currentQuestion = computed(() => questionStack.value[activeQuestionIndex.value] || null)
  const isQuestionPackageMode = computed(() => isPackageResult(result.value) && questionStack.value.length > 1)
  const questionPageTrackStyle = computed(() => `transform: translateX(-${activeQuestionIndex.value * 100}%);`)
  const questionSwiperStyle = computed(() => ({ height: `${estimateQuestionSwiperHeight(currentQuestion.value)}px` }))
  const questionProgressText = computed(() => {
    const currentIndex = Math.min(activeQuestionIndex.value + 1, questionStack.value.length || 1)
    return `问题 ${currentIndex} / ${questionStack.value.length || 1}`
  })
  const nextButtonText = computed(() => {
    if (isSubmittingQuestionAnswer.value) {return '处理中...'}
    return activeQuestionIndex.value >= questionStack.value.length - 1 ? '完成问诊' : '下一题'
  })

  function buildCareBehaviorTimelineByQuestionIdMap(questions = []) {
    return (Array.isArray(questions) ? questions : []).filter(item => isCareBehaviorWateringTimelineQuestion(item)).reduce((acc, item) => {
      const questionId = getQuestionId(item)
      if (!questionId) {return acc}
      acc[questionId] = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
        careBehaviorTimelineByQuestionId.value?.[questionId] || extractCareBehaviorTimelineFromQuestion(item),
        environmentWeatherWindow.value
      )
      return acc
    }, {})
  }

  function resetQuestionState(questions = []) {
    const nextQuestions = dedupeQuestionsById(Array.isArray(questions) ? questions.filter(item => item?.questionId) : [])
    questionStack.value = nextQuestions
    activeQuestionIndex.value = 0
    questionAnswers.value = createQuestionAnswerMap(nextQuestions)
    careBehaviorTimelineByQuestionId.value = buildCareBehaviorTimelineByQuestionIdMap(nextQuestions)
    suppressedTimelineAnswerByQuestionId.value = {}
    refreshEnvironmentWeatherWindowForCareBehavior(nextQuestions)
  }

  function getCareBehaviorTimelineByQuestion(question = {}) {
    const questionId = getQuestionId(question)
    const fallbackTimeline = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
      extractCareBehaviorTimelineFromQuestion(question),
      environmentWeatherWindow.value
    )
    if (!questionId) {return fallbackTimeline}
    const storedTimeline = careBehaviorTimelineByQuestionId.value[questionId]
    return storedTimeline && Object.keys(storedTimeline).length
      ? mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(storedTimeline, environmentWeatherWindow.value)
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
    if (!normalizedQuestionId) {return}
    const nextState = { ...suppressedTimelineAnswerByQuestionId.value }
    if (suppressed) {nextState[normalizedQuestionId] = true} else {delete nextState[normalizedQuestionId]}
    suppressedTimelineAnswerByQuestionId.value = nextState
  }

  function isTimelineAnswerSyncSuppressed(questionId = '') {
    return Boolean(suppressedTimelineAnswerByQuestionId.value[normalizeText(questionId)])
  }

  function syncCareBehaviorTimelineAnswer(question, timeline = null) {
    const questionId = getQuestionId(question)
    if (!questionId) {return}
    const currentOptionId = normalizeText(questionAnswers.value[questionId])
    if (isCareBehaviorTimelineUnclearAnswer(question, currentOptionId) && isTimelineAnswerSyncSuppressed(questionId)) {return}
    const recordedOptionId = resolveCareBehaviorTimelineRecordedAnswerOptionId(question)
    const nextAnswerId = hasMeaningfulCareBehaviorTimeline(timeline)
      ? (isLegacyWateringTimelineQuestion(question) ? 'care_behavior_timeline' : recordedOptionId)
      : ''
    if (nextAnswerId) {
      if (currentOptionId !== nextAnswerId) {setQuestionAnswer(questionId, nextAnswerId)}
      return
    }
    if (currentOptionId) {setQuestionAnswer(questionId, '')}
  }

  function handleCareBehaviorTimelineChange(question, timeline = null) {
    const questionId = getQuestionId(question)
    if (!questionId) {return}
    const currentTimeline = careBehaviorTimelineByQuestionId.value?.[questionId] || {}
    const nextTimeline = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(timeline || {}, environmentWeatherWindow.value)
    if (getCareBehaviorTimelineChangeSignature(currentTimeline) === getCareBehaviorTimelineChangeSignature(nextTimeline)) {
      syncCareBehaviorTimelineAnswer(question, Object.keys(currentTimeline).length ? currentTimeline : nextTimeline)
      return
    }
    suppressTimelineAnswerSync(questionId, false)
    careBehaviorTimelineByQuestionId.value = { ...careBehaviorTimelineByQuestionId.value, [questionId]: nextTimeline }
    syncCareBehaviorTimelineAnswer(question, nextTimeline)
  }

  function setQuestionAnswer(questionId, answerValue) {
    const normalizedQuestionId = normalizeText(questionId)
    if (!normalizedQuestionId) {return}
    questionAnswers.value = { ...questionAnswers.value, [normalizedQuestionId]: answerValue }
    const question = questionStack.value.find(item => getQuestionId(item) === normalizedQuestionId)
    if (!question || !isCareBehaviorWateringTimelineQuestion(question)) {return}
    const answerId = normalizeText(answerValue)
    const autoAnswerId = resolveCareBehaviorTimelineAutoAnswerOptionId(question)
    if (isCareBehaviorTimelineSentinelAnswer(question, answerId) || answerId === autoAnswerId || isCareBehaviorTimelineUnclearAnswer(question, answerId)) {
      if (isCareBehaviorTimelineUnclearAnswer(question, answerId)) {suppressTimelineAnswerSync(normalizedQuestionId, true)}
      return
    }
    suppressTimelineAnswerSync(normalizedQuestionId, false)
    careBehaviorTimelineByQuestionId.value = { ...careBehaviorTimelineByQuestionId.value, [normalizedQuestionId]: {} }
  }

  function selectQuestionOption(question, option) {
    const questionId = getQuestionId(question)
    const optionId = getQuestionOptionId(option)
    if (!questionId || !optionId) {return}
    suppressTimelineAnswerSync(questionId, isCareBehaviorWateringTimelineQuestion(question) && isCareBehaviorTimelineUnclearAnswer(question, optionId))
    setQuestionAnswer(questionId, optionId)
  }

  function isSelectedQuestionOption(question, option) {
    const questionId = getQuestionId(question)
    const optionId = getQuestionOptionId(option)
    return Boolean(questionId && optionId && normalizeText(questionAnswers.value[questionId] || question?.defaultOptionId) === optionId)
  }

  function isQuestionAnswered(question) {
    const questionId = getQuestionId(question)
    if (!questionId) {return false}
    if (isCareBehaviorWateringTimelineQuestion(question)) {
      return Boolean(questionAnswers.value[questionId]) || hasMeaningfulCareBehaviorTimeline(getCareBehaviorTimelineByQuestion(question))
    }
    return Boolean(questionAnswers.value[questionId])
  }

  function canProceedQuestion() {
    if (isSubmittingQuestionAnswer.value || !isQuestionAnswered(currentQuestion.value)) {return false}
    if (isQuestionPackageMode.value && activeQuestionIndex.value >= questionStack.value.length - 1) {
      return questionStack.value.every(isQuestionAnswered)
    }
    return true
  }

  function goPreviousQuestion() {
    activeQuestionIndex.value = Math.max(0, activeQuestionIndex.value - 1)
  }

  function goNextQuestion() {
    activeQuestionIndex.value = Math.min(Math.max(questionStack.value.length - 1, 0), activeQuestionIndex.value + 1)
  }

  async function submitQuestionAnswers() {
    if (!result.value || !canProceedQuestion()) {return}
    isSubmittingQuestionAnswer.value = true
    try {
      const submitQuestionStack = isQuestionPackageMode.value
        ? questionStack.value
        : currentQuestion.value ? [currentQuestion.value] : []
      const payloadForSubmit = buildQuestionAnswerPayload(result.value, questionAnswers.value, {
        questionStack: submitQuestionStack,
        requestMode: 'answer_submit',
        careBehaviorTimelineByQuestionId: careBehaviorTimelineByQuestionId.value,
        environmentWeatherWindow: environmentWeatherWindow.value
      })
      const rerunResult = await diagnosisAnswerMutation.mutateAsync(payloadForSubmit)
      result.value = normalizeDiagnosisResult(rerunResult, {
        images: images.value,
        plantName: plantName.value || result.value.plantName || '植物'
      })
      resetQuestionState(result.value?.questions || [])
      diagnoseStore.addToHistory({
        images: images.value,
        diagnosis: result.value,
        diagnosisId: result.value.diagnosisSessionId || ''
      })
      uni.showToast({ title: result.value.hasActiveQuestions ? '问诊已更新' : '诊断已完成', icon: 'success' })
    } catch (error) {
      console.error('问诊处理失败:', error)
      uni.showToast({ title: error.message || '问诊失败，请重试', icon: 'none' })
    } finally {
      isSubmittingQuestionAnswer.value = false
    }
  }

  async function handleNextQuestion() {
    if (!canProceedQuestion()) {return}
    if (activeQuestionIndex.value < questionStack.value.length - 1) {
      goNextQuestion()
      return
    }
    await submitQuestionAnswers()
  }

  function resolveCareBehaviorReferenceDate(questions = []) {
    for (const question of Array.isArray(questions) ? questions : []) {
      const timeline = extractCareBehaviorTimelineFromQuestion(question)
      const referenceDate = question?.referenceDate || question?.reference_date || question?.payload?.referenceDate || question?.payload?.reference_date || timeline?.reference_date || timeline?.referenceDate
      if (referenceDate) {return String(referenceDate).slice(0, 10)}
    }
    return new Date().toISOString().slice(0, 10)
  }

  function resolveCareBehaviorWeatherLocation() {
    const location = userStore.location || {}
    const lat = Number(location.latitude ?? location.lat)
    const lng = Number(location.longitude ?? location.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {return null}
    return {
      lat,
      lng,
      city: normalizeText(location.city),
      province: normalizeText(location.province)
    }
  }

  function applyEnvironmentWeatherWindowToCareBehaviorTimelines() {
    if (!environmentWeatherWindow.value) {return}
    careBehaviorTimelineByQuestionId.value = Object.fromEntries(
      Object.entries(careBehaviorTimelineByQuestionId.value || {}).map(([questionId, timeline]) => [
        questionId,
        mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(timeline, environmentWeatherWindow.value)
      ])
    )
  }

  async function refreshEnvironmentWeatherWindowForCareBehavior(questions = questionStack.value) {
    environmentWeatherWindowError.value = ''
    try {
      const timelineQuestions = (Array.isArray(questions) ? questions : []).filter(item => isCareBehaviorWateringTimelineQuestion(item))
      if (!timelineQuestions.length || environmentWeatherWindowLoading.value) {return}
      const location = resolveCareBehaviorWeatherLocation()
      if (!location) {return}
      const diagnosisDate = resolveCareBehaviorReferenceDate(timelineQuestions)
      const requestKey = [location.lat.toFixed(5), location.lng.toFixed(5), location.city, location.province, diagnosisDate].join('|')
      if (requestKey === environmentWeatherWindowRequestKey.value && environmentWeatherWindow.value) {
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
      environmentWeatherWindowError.value = String(error?.message || error?.msg || '养护时间线天气加载失败，请稍后重试。').trim()
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
    getVisibleCareBehaviorOptions,
    isCareBehaviorWateringTimelineQuestion,
    selectQuestionOption,
    isSelectedQuestionOption,
    canProceedQuestion,
    goPreviousQuestion,
    handleNextQuestion
  }
}
