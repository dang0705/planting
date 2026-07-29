/* oxlint-disable no-unused-vars, no-magic-numbers */
import { computed, nextTick, ref, watch } from 'vue'
import { formatRetakeCountdownText, getRetakeRemainingSeconds } from './retake-clock'

function normalizeQuestionMode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function visibleOutcomeCountFromResult(value = null) {
  if (Array.isArray(value?.visibleOutcomes) && value.visibleOutcomes.length) {
    return value.visibleOutcomes.length
  }
  if (Array.isArray(value?.finalResult?.visibleOutcomes)) {
    return value.finalResult.visibleOutcomes.length
  }
  return 0
}

function shouldSuppressDirectionChoices(value = null) {
  const visibleOutcomeCount = visibleOutcomeCountFromResult(value)
  if (!visibleOutcomeCount || visibleOutcomeCount > 1) {
    return false
  }
  const status = normalizeQuestionMode(value?.status || value?.sessionStatus || '')
  const routePrimaryAction = normalizeQuestionMode(value?.routePrimaryAction || '')
  return (
    value?.questionRequired === false ||
    status === 'completed' ||
    status === 'closed' ||
    routePrimaryAction === 'finalize' ||
    routePrimaryAction === 'direct_result'
  )
}

export function useDiagnoseComputed(ctx) {
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
    retakeNow,
    currentNow,
    retakeAuthorizationReceivedClientAt,
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
    DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX,
    buildStructuredImageInputs,
    detectUsedAdditionalImageSubmission,
    uniqueStrings,
    formatOutcomeDisplayLabel,
    buildUniqueOutcomesForAdvice,
    buildOutcomeAdviceGroups,
    buildOutcomeActionAdviceItems,
    buildOutcomeAvoidAdviceItems,
    isAccordionQuestion,
    getExpandedQuestionOptionId,
    normalizeCollapseOptionValue,
    setExpandedQuestionOption,
    setQuestionAnswer
  } = ctx

  const selectedDevSymptomClassKey = ref('')
  const selectedDiagnosisProfile = ref(props.diagnosisProfile === 'pest' ? 'pest' : 'full')

  const primaryStructuredImages = computed(() => buildStructuredImageInputs(imageFiles.value))

  const additionalStructuredImages = computed(() =>
    buildStructuredImageInputs(additionalImageFiles.value)
  )

  const selectedDevSymptomClassOption = computed(
    () =>
      SYMPTOM_CLASS_QUICK_SELECT_OPTIONS.find(
        item => item.classKey === selectedDevSymptomClassKey.value
      ) || null
  )

  const hasSelectedSymptomMode = computed(() => Boolean(selectedDevSymptomClassOption.value))

  const additionalImageCaptureSuggestions = computed(() =>
    Array.isArray(result.value?.visualAggregateSummary?.suggestedAdditionalImageCapture)
      ? result.value.visualAggregateSummary.suggestedAdditionalImageCapture
      : []
  )

  const additionalImageSlotTypes = computed(() => {
    const inferredSlotTypes = uniqueStrings(
      additionalImageCaptureSuggestions.value.map(item =>
        inferAdditionalImageSlotTypeFromSuggestion(item, 'whole_plant')
      )
    )

    if (inferredSlotTypes.length) {
      return uniqueStrings([...inferredSlotTypes, 'other'])
    }

    return [...ADDITIONAL_IMAGE_SLOT_SEQUENCE]
  })

  const primarySlotGroups = computed(() =>
    buildSlotGroups(imageFiles.value, PRIMARY_SLOT_SEQUENCE, PRIMARY_IMAGE_LIMIT)
  )

  const additionalImageSlotGroups = computed(() =>
    buildSlotGroups(
      additionalImageFiles.value,
      additionalImageSlotTypes.value,
      ADDITIONAL_IMAGE_LIMIT
    )
  )

  const hasUsedAdditionalImageSubmission = computed(() =>
    detectUsedAdditionalImageSubmission(result.value)
  )

  const activeDiagnosisQuestions = computed(() =>
    Array.isArray(result.value?.questions)
      ? result.value.questions.filter(item => getQuestionId(item))
      : []
  )

  const hasActiveDiagnosisQuestions = computed(() =>
    Boolean(result.value?.hasActiveQuestions && activeDiagnosisQuestions.value.length)
  )

  const canShowAdditionalImageUploader = computed(() =>
    Boolean(
      (hasActiveDiagnosisQuestions.value && result.value?.uiHints?.canUploadMoreImages) ||
      hasActiveRetakeAuthorization.value
    )
  )

  const additionalImageUploadBlockedReason = computed(() => {
    if (hasRetakeRequest.value && !hasActiveRetakeAuthorization.value) {
      return retakeExpired.value ? '补拍时间已结束' : '确认开始补拍后再上传补充照片。'
    }
    if (!hasActiveDiagnosisQuestions.value) {
      return '当前没有开放补图。'
    }

    if (hasUsedAdditionalImageSubmission.value) {
      return '本次会话的补图机会已使用，请继续答题或重新开始新的诊断。'
    }

    return '当前轮次没有开放补图入口，请优先回答问题。'
  })

  const isSubmittingQuestionFlow = computed(() => Boolean(submittingQuestionMode.value))

  const isSubmittingQuestionAnswer = computed(() => submittingQuestionMode.value === 'answers')

  const isSubmittingAdditionalImage = computed(() => submittingQuestionMode.value === 'images')

  const retakeRequest = computed(() =>
    result.value?.retakeRequest && typeof result.value.retakeRequest === 'object'
      ? result.value.retakeRequest
      : null
  )

  const retakeAuthorizationState = computed(() =>
    result.value?.retakeAuthorizationState &&
    typeof result.value.retakeAuthorizationState === 'object'
      ? result.value.retakeAuthorizationState
      : null
  )

  const hasRetakeRequest = computed(() => Boolean(retakeRequest.value))

  const retakeRemainingSeconds = computed(() => {
    return getRetakeRemainingSeconds({
      retakeExpiresAt: retakeAuthorizationState.value?.retakeExpiresAt,
      serverNow: retakeAuthorizationState.value?.serverNow,
      receivedClientAt: retakeAuthorizationReceivedClientAt.value,
      currentNow: currentNow.value
    })
  })

  const retakeExpired = computed(() =>
    Boolean(retakeAuthorizationState.value && retakeRemainingSeconds.value <= 0)
  )

  const hasActiveRetakeAuthorization = computed(
    () => retakeAuthorizationState.value?.status === 'active' && !retakeExpired.value
  )

  const retakeCountdownText = computed(() => {
    return formatRetakeCountdownText({
      authorization: retakeAuthorizationState.value,
      expired: retakeExpired.value,
      total: retakeRemainingSeconds.value
    })
  })

  const directionChoices = computed(() => {
    if (shouldSuppressDirectionChoices(result.value)) {
      return []
    }
    return Array.isArray(result.value?.directionChoices) ? result.value.directionChoices : []
  })

  const hasDirectionChoices = computed(() => directionChoices.value.length > 0)

  const currentQuestion = computed(() => {
    const items = Array.isArray(questionStack.value) ? questionStack.value : []
    return items[activeQuestionIndex.value] || null
  })

  const hasDirtyQuestionAnswers = computed(() => dirtyQuestionFromIndex.value >= 0)

  const questionSwiperTrackStyle = computed(
    () => `transform: translateX(-${questionSwiperCurrent.value * 100}%);`
  )

  const currentQuestionAccordionValue = computed({
    get() {
      const question = currentQuestion.value
      if (!isAccordionQuestion(question)) {
        return ''
      }
      return getExpandedQuestionOptionId(question)
    },
    set(value) {
      const question = currentQuestion.value
      if (!isAccordionQuestion(question)) {
        return
      }
      const optionId = normalizeCollapseOptionValue(value)
      if (!optionId) {
        return
      }
      setExpandedQuestionOption(question, optionId)
      setQuestionAnswer(getQuestionId(question), optionId)
    }
  })

  watch(
    currentQuestion,
    async question => {
      if (!question) {
        questionSwiperPages.value = [null, null]
        questionSwiperCurrent.value = 0
        return
      }

      const activeIndex = questionSwiperCurrent.value
      const activeQuestion = questionSwiperPages.value[activeIndex]
      const questionId = getQuestionId(question)

      if (!activeQuestion) {
        questionSwiperPages.value = [question, null]
        questionSwiperCurrent.value = 0
        return
      }

      if (getQuestionId(activeQuestion) === questionId) {
        questionSwiperPages.value = questionSwiperPages.value.map((item, index) =>
          index === activeIndex ? question : item
        )
        return
      }

      const nextIndex = activeIndex === 0 ? 1 : 0
      questionSwiperPages.value = questionSwiperPages.value.map((item, index) =>
        index === nextIndex ? question : item
      )
      await nextTick()
      questionSwiperCurrent.value = nextIndex
    },
    { immediate: true }
  )

  const actionAdviceTexts = computed(() => {
    const explanation = result.value?.explanation || result.value?.resultExplanation || {}
    const nextSteps = Array.isArray(result.value?.nextSteps)
      ? result.value.nextSteps.map(item => String(item?.text || '').trim()).filter(Boolean)
      : []
    const treatmentText = String(result.value?.treatmentText || explanation?.firstAid || '').trim()
    return uniqueStrings([...nextSteps, ...(treatmentText ? [treatmentText] : [])])
  })

  const resultMainIssueText = computed(() => formatOutcomeDisplayLabel(result.value?.mainIssueText))

  const resultSummaryText = computed(() => formatOutcomeDisplayLabel(result.value?.summaryText))

  const avoidAdviceTexts = computed(() => {
    const explanation = result.value?.explanation || result.value?.resultExplanation || {}
    const whatToAvoid = Array.isArray(result.value?.whatToAvoid)
      ? result.value.whatToAvoid.map(item => String(item || '').trim()).filter(Boolean)
      : []
    const preventionText = String(result.value?.preventionText || explanation?.avoid || '').trim()
    return uniqueStrings([...whatToAvoid, ...(preventionText ? [preventionText] : [])])
  })

  const visibleOutcomeSource = computed(() =>
    Array.isArray(result.value?.visibleOutcomes) && result.value.visibleOutcomes.length
      ? result.value.visibleOutcomes
      : Array.isArray(result.value?.finalResult?.visibleOutcomes)
        ? result.value.finalResult.visibleOutcomes
        : []
  )

  const visibleOutcomeDisplays = computed(() =>
    uniqueStrings(visibleOutcomeSource.value.map(formatOutcomeDisplayLabel))
  )

  const allOutcomeDisplays = computed(() => visibleOutcomeDisplays.value)

  const outcomeAdviceSources = computed(() =>
    buildUniqueOutcomesForAdvice(visibleOutcomeSource.value)
  )

  const actionAdviceGroups = computed(() =>
    buildOutcomeAdviceGroups({
      outcomeSources: outcomeAdviceSources.value,
      getOutcomeItems: buildOutcomeActionAdviceItems,
      fallbackItems: actionAdviceTexts.value,
      fallbackLabel: '通用建议'
    })
  )

  const avoidAdviceGroups = computed(() =>
    buildOutcomeAdviceGroups({
      outcomeSources: outcomeAdviceSources.value,
      getOutcomeItems: buildOutcomeAvoidAdviceItems,
      fallbackItems: avoidAdviceTexts.value,
      fallbackLabel: '通用建议'
    })
  )

  const popupHeight = computed(() => {
    const totalHeight = Number(viewportHeight.value || 0)
    const navbarHeight = Number(userStore.navbarHeight || 0)
    const bottomTabBarHeight = Number(tabBarOccupiedHeight.value || 0)
    if (!totalHeight) {
      return 640
    }
    return Math.max(420, totalHeight - navbarHeight - bottomTabBarHeight)
  })

  const popupPanelStyle = computed(() => ({
    height: `${popupHeight.value}px`
  }))

  return {
    selectedDevSymptomClassKey,
    selectedDiagnosisProfile,
    primaryStructuredImages,
    additionalStructuredImages,
    selectedDevSymptomClassOption,
    hasSelectedSymptomMode,
    additionalImageCaptureSuggestions,
    additionalImageSlotTypes,
    primarySlotGroups,
    additionalImageSlotGroups,
    hasUsedAdditionalImageSubmission,
    activeDiagnosisQuestions,
    hasActiveDiagnosisQuestions,
    canShowAdditionalImageUploader,
    hasRetakeRequest,
    hasActiveRetakeAuthorization,
    retakeRemainingSeconds,
    retakeCountdownText,
    retakeExpired,
    retakeRequest,
    directionChoices,
    hasDirectionChoices,
    additionalImageUploadBlockedReason,
    isSubmittingQuestionFlow,
    isSubmittingQuestionAnswer,
    isSubmittingAdditionalImage,
    currentQuestion,
    hasDirtyQuestionAnswers,
    questionSwiperTrackStyle,
    currentQuestionAccordionValue,
    actionAdviceTexts,
    resultMainIssueText,
    resultSummaryText,
    avoidAdviceTexts,
    visibleOutcomeSource,
    visibleOutcomeDisplays,
    allOutcomeDisplays,
    outcomeAdviceSources,
    actionAdviceGroups,
    avoidAdviceGroups,
    popupHeight,
    popupPanelStyle
  }
}
