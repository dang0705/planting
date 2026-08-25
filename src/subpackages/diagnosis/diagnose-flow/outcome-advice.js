/* oxlint-disable no-unused-vars, no-magic-numbers */

export function useDiagnoseOutcomeAdvice(ctx) {
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
  const refreshEnvironmentWeatherWindowForCareBehavior = (...args) =>
    ctx.refreshEnvironmentWeatherWindowForCareBehavior(...args)
  const refreshViewportHeight = (...args) => ctx.refreshViewportHeight(...args)
  const findQuestionById = (...args) => ctx.findQuestionById(...args)
  const buildCareBehaviorTimelineByQuestionIdMap = (...args) =>
    ctx.buildCareBehaviorTimelineByQuestionIdMap(...args)
  const isAccordionQuestion = (...args) => ctx.isAccordionQuestion(...args)
  const uniqueStrings = (...args) => ctx.uniqueStrings(...args)

  function sanitizeTemplateText(value = '') {
    return String(value || '')
      .replace(/\{\{[^}]+\}/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function normalizeText(value = '') {
    return String(value || '').trim()
  }

  function normalizeArrayText(values = []) {
    return (Array.isArray(values) ? values : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }

  function normalizeTextList(values = []) {
    return (Array.isArray(values) ? values : [values])
      .map(item => normalizeText(item))
      .filter(Boolean)
  }

  function normalizeUserFriendlyOutcomeLabel(value = '') {
    return String(value || '')
      .replace(/根区压力/g, '根部状态不佳')
      .replace(/根部压力/g, '根部状态不佳')
      .replace(/压力/g, '受影响')
      .trim()
  }

  function formatOutcomeDisplayLabel(outcome = null) {
    if (typeof outcome === 'string') {
      return normalizeUserFriendlyOutcomeLabel(String(outcome || '').trim())
    }
    if (!outcome || typeof outcome !== 'object') {
      return ''
    }
    return normalizeUserFriendlyOutcomeLabel(
      String(
        outcome.displayNameCn ||
          outcome.displayName ||
          outcome.title ||
          outcome.problemName ||
          outcome.problemKey ||
          outcome.outcomeKey ||
          ''
      ).trim()
    )
  }

  function normalizeOutcomeDisplayKey(outcome = {}, index = 0) {
    return String(
      outcome?.outcomeKey ||
        outcome?.problemKey ||
        outcome?.problemId ||
        outcome?.displayNameCn ||
        outcome?.displayName ||
        outcome?.title ||
        `outcome_${index}`
    ).trim()
  }

  function buildUniqueOutcomesForAdvice(outcomes = []) {
    const seen = new Set()
    return (Array.isArray(outcomes) ? outcomes : [])
      .map((outcome, index) => ({ outcome, index }))
      .filter(item => item.outcome && typeof item.outcome === 'object')
      .filter(item => {
        const key = normalizeOutcomeDisplayKey(item.outcome, item.index)
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
      .map(item => item.outcome)
  }

  function buildOutcomeAdviceGroups({
    outcomeSources = [],
    getOutcomeItems,
    fallbackItems = [],
    fallbackLabel = '通用建议'
  } = {}) {
    const sourceOutcomes = buildUniqueOutcomesForAdvice(outcomeSources)
    const sourceGroups = sourceOutcomes
      .map((outcome, index) => ({
        key: normalizeOutcomeDisplayKey(outcome, index),
        outcomeLabel: formatOutcomeDisplayLabel(outcome),
        items: uniqueStrings(getOutcomeItems ? getOutcomeItems(outcome) : [])
      }))
      .filter(group => group.outcomeLabel && group.items.length)

    if (sourceGroups.length || !fallbackItems.length) {
      return sourceGroups.map(group => ({
        ...group,
        showOutcomeLabel: sourceOutcomes.length > 1
      }))
    }

    return [
      {
        key: '__fallback__',
        outcomeLabel: fallbackLabel,
        items: uniqueStrings(fallbackItems),
        showOutcomeLabel: true
      }
    ]
  }

  function buildOutcomeActionAdviceItems(outcome = {}) {
    return uniqueStrings([
      ...normalizeTextList(outcome?.actionAdviceItems),
      ...normalizeTextList(outcome?.todayActions),
      ...normalizeTextList(outcome?.threeDayActions),
      ...normalizeTextList(outcome?.sevenDayObserve),
      ...normalizeTextList([outcome?.firstAid]),
      ...normalizeTextList([outcome?.recommendation]),
      ...normalizeTextList([outcome?.actionAdvice])
    ])
  }

  function buildOutcomeAvoidAdviceItems(outcome = {}) {
    return uniqueStrings([
      ...normalizeTextList(outcome?.avoidAdviceItems),
      ...normalizeTextList(outcome?.avoidActions),
      ...normalizeTextList(outcome?.retakeOrEscalate),
      ...normalizeTextList([outcome?.avoid]),
      ...normalizeTextList([outcome?.reassurance]),
      ...normalizeTextList([outcome?.preventionAdvice])
    ])
  }

  return {
    sanitizeTemplateText,
    normalizeText,
    normalizeArrayText,
    normalizeTextList,
    normalizeUserFriendlyOutcomeLabel,
    formatOutcomeDisplayLabel,
    normalizeOutcomeDisplayKey,
    buildUniqueOutcomesForAdvice,
    buildOutcomeAdviceGroups,
    buildOutcomeActionAdviceItems,
    buildOutcomeAvoidAdviceItems
  }
}
