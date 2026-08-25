/* oxlint-disable no-unused-vars, no-magic-numbers */

export function useDiagnoseCareBehavior(ctx) {
  const {
    props,
    emit,
    userStore,
    diagnoseStore,
    popup,
    result,
    showAIDialog,
    aiStreamDialogRef,
    pendingDiagnosePayload,
    casePreviewImages,
    questionAnswers,
    careBehaviorTimelineByQuestionId,
    environmentWeatherWindow,
    environmentWeatherWindowRequestKey,
    environmentWeatherWindowLoading,
    questionStack,
    activeQuestionIndex,
    committedQuestionAnswers,
    dirtyQuestionFromIndex,
    questionAnswerRevision,
    expandedQuestionOptionByQuestion,
    submittingQuestionMode,
    viewportHeight,
    tabBarOccupiedHeight,
    questionSwiperCurrent,
    questionSwiperPages,
    diagnoseMutation,
    questionStartMutation,
    diagnosisAnswerMutation,
    uploader,
    additionalImageUploader,
    imageFiles,
    additionalImageFiles,
    runtimeEnv,
    automationEnabled,
    getQuestionId,
    getVisibleCareBehaviorOptions,
    createQuestionAnswerMap,
    isQuestionAnswerComplete,
    buildQuestionAnswerPayload,
    normalizeDiagnosisResult,
    getEnvironmentWeatherWindow,
    extractCareBehaviorTimelineFromQuestion,
    hasMeaningfulCareBehaviorTimeline,
    isCareBehaviorTimelineSentinelAnswer,
    isSessionWateringTimelineQuestion,
    isCareBehaviorWateringTimelineQuestion,
    normalizeCareBehaviorTimeline,
    resolveCareBehaviorTimelineAutoAnswerOptionId,
    resolveCareBehaviorTimelineRecordedAnswerOptionId,
    mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline,
    PRIMARY_IMAGE_LIMIT,
    ADDITIONAL_IMAGE_LIMIT,
    PRIMARY_SLOT_SEQUENCE,
    ADDITIONAL_IMAGE_SLOT_SEQUENCE,
    getOrganOptionLabel,
    normalizeSlotType,
    getSlotCapacity,
    getSlotFileCount,
    buildSlotGroups,
    buildSlotMetadata,
    inferAdditionalImageSlotTypeFromSuggestion,
    SYMPTOM_CLASS_QUICK_SELECT_OPTIONS,
    AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY,
    DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX
  } = ctx

  const selectedDevSymptomClassKey = {
    get value() {
      return ctx.selectedDevSymptomClassKey?.value
    },
    set value(nextValue) {
      ctx.selectedDevSymptomClassKey.value = nextValue
    }
  }
  const selectedDevSymptomClassOption = {
    get value() {
      return ctx.selectedDevSymptomClassOption?.value
    }
  }
  const currentQuestion = {
    get value() {
      return ctx.currentQuestion?.value
    }
  }
  const primaryStructuredImages = {
    get value() {
      return ctx.primaryStructuredImages?.value || []
    }
  }
  const additionalStructuredImages = {
    get value() {
      return ctx.additionalStructuredImages?.value || []
    }
  }
  const hasSelectedSymptomMode = {
    get value() {
      return Boolean(ctx.hasSelectedSymptomMode?.value)
    }
  }
  const hasUsedAdditionalImageSubmission = {
    get value() {
      return Boolean(ctx.hasUsedAdditionalImageSubmission?.value)
    }
  }
  const canShowAdditionalImageUploader = {
    get value() {
      return Boolean(ctx.canShowAdditionalImageUploader?.value)
    }
  }
  const hasDirtyQuestionAnswers = {
    get value() {
      return Boolean(ctx.hasDirtyQuestionAnswers?.value)
    }
  }
  const isSubmittingQuestionFlow = {
    get value() {
      return Boolean(ctx.isSubmittingQuestionFlow?.value)
    }
  }
  const isQuestionStartSubmitting = (...args) => ctx.isQuestionStartSubmitting(...args)
  const navigateToDiagnosisQuestionPackagePage = (...args) =>
    ctx.navigateToDiagnosisQuestionPackagePage(...args)
  const startQuestionDiagnosisFromSymptomClass = (...args) =>
    ctx.startQuestionDiagnosisFromSymptomClass(...args)
  const resetQuestionState = (...args) => ctx.resetQuestionState(...args)
  const setQuestionAnswer = (...args) => ctx.setQuestionAnswer(...args)
  const getCasePreviewImages = (...args) => ctx.getCasePreviewImages(...args)
  const refreshViewportHeight = (...args) => ctx.refreshViewportHeight(...args)
  const isAccordionQuestion = (...args) => ctx.isAccordionQuestion(...args)
  const uniqueStrings = (...args) => ctx.uniqueStrings(...args)
  const sanitizeTemplateText = (...args) => ctx.sanitizeTemplateText(...args)
  const normalizeText = (...args) => ctx.normalizeText(...args)

  function findQuestionById(questionId = '') {
    const normalizedQuestionId = String(questionId || '').trim()
    if (!normalizedQuestionId) {
      return null
    }
    return questionStack.value.find(item => getQuestionId(item) === normalizedQuestionId) || null
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
    return careBehaviorTimelineByQuestionId.value[questionId] || fallbackTimeline
  }

  function buildCareBehaviorTimelineByQuestionIdMap(questions = []) {
    return (Array.isArray(questions) ? questions : [])
      .filter(item => isCareBehaviorWateringTimelineQuestion(item))
      .reduce((acc, item) => {
        const questionId = getQuestionId(item)
        if (!questionId) {
          return acc
        }
        const sourceTimeline =
          careBehaviorTimelineByQuestionId.value?.[questionId] ||
          extractCareBehaviorTimelineFromQuestion(item)
        acc[questionId] = mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
          sourceTimeline,
          environmentWeatherWindow.value
        )
        return acc
      }, {})
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
    careBehaviorTimelineByQuestionId.value = {
      ...careBehaviorTimelineByQuestionId.value,
      [questionId]: nextTimeline
    }
    syncCareBehaviorTimelineAnswer(question, nextTimeline)
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

  function resolveCareBehaviorReferenceDate(questions = []) {
    const candidates = Array.isArray(questions) ? questions : []
    for (const question of candidates) {
      const timeline = extractCareBehaviorTimelineFromQuestion(question)
      const referenceDate =
        question?.referenceDate ||
        question?.reference_date ||
        question?.payload?.referenceDate ||
        question?.payload?.reference_date ||
        timeline?.reference_date ||
        timeline?.referenceDate
      if (referenceDate) {
        return String(referenceDate).slice(0, 10)
      }
    }
    return new Date().toISOString().slice(0, 10)
  }

  function resolveCareBehaviorWeatherLocation() {
    const location = userStore.location || {}
    const lat = Number(location.latitude ?? location.lat)
    const lng = Number(location.longitude ?? location.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      return null
    }
    return {
      lat,
      lng,
      city: String(location.city || '').trim(),
      province: String(location.province || '').trim()
    }
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
    try {
      const timelineQuestions = (Array.isArray(questions) ? questions : []).filter(item =>
        isCareBehaviorWateringTimelineQuestion(item)
      )
      if (!timelineQuestions.length || environmentWeatherWindowLoading.value) {
        return
      }

      const location = resolveCareBehaviorWeatherLocation()
      if (!location) {
        return
      }

      const diagnosisDate = resolveCareBehaviorReferenceDate(timelineQuestions)
      const requestKey = [
        location.lat.toFixed(5),
        location.lng.toFixed(5),
        location.city,
        location.province,
        diagnosisDate
      ].join('|')
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
    } finally {
      if (environmentWeatherWindowLoading.value) {
        environmentWeatherWindowLoading.value = false
      }
    }
  }

  function syncCareBehaviorTimelineAnswer(question, timeline = null) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }

    const currentOptionId = String(questionAnswers.value[questionId] || '').trim()
    const recordedOptionId = resolveCareBehaviorTimelineRecordedAnswerOptionId(question)
    const meaningfulTimeline = hasMeaningfulCareBehaviorTimeline(timeline)
    const visibleOptions = getVisibleCareBehaviorOptions(question)
    const nextAnswerId = meaningfulTimeline
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

    if (
      !meaningfulTimeline &&
      visibleOptions.some(option => String(option?.optionId || '').trim() === currentOptionId)
    ) {
      return
    }

    if (currentOptionId) {
      setQuestionAnswer(questionId, '')
    }
  }

  return {
    findQuestionById,
    getCareBehaviorTimelineByQuestion,
    buildCareBehaviorTimelineByQuestionIdMap,
    handleCareBehaviorTimelineChange,
    getCareBehaviorTimelineChangeSignature,
    resolveCareBehaviorReferenceDate,
    resolveCareBehaviorWeatherLocation,
    applyEnvironmentWeatherWindowToCareBehaviorTimelines,
    refreshEnvironmentWeatherWindowForCareBehavior,
    syncCareBehaviorTimelineAnswer
  }
}
