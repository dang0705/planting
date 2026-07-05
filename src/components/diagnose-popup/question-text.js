/* oxlint-disable no-unused-vars, no-magic-numbers */

export function useDiagnoseQuestionText(ctx) {
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
  const uniqueStrings = (...args) => ctx.uniqueStrings(...args)
  const sanitizeTemplateText = (...args) => ctx.sanitizeTemplateText(...args)
  const normalizeText = (...args) => ctx.normalizeText(...args)

  function isAccordionQuestion(question) {
    return String(question?.uiVariant || '').trim() === 'single_select_accordion'
  }

  function getQuestionTitle(question = {}) {
    return sanitizeTemplateText(
      question?.questionTextUserCn ||
        question?.questionTextCn ||
        question?.text ||
        question?.questionText ||
        question?.title ||
        ''
    )
  }

  function getQuestionHelpText(question = {}) {
    return sanitizeTemplateText(
      question?.helpTextCn || question?.helpText || question?.questionHelpText || ''
    )
  }

  function getOptionText(question = {}, option = {}) {
    const text = sanitizeTemplateText(
      option?.optionTextUserCn ||
        option?.optionTextCn ||
        option?.text ||
        option?.optionText ||
        option?.label ||
        option?.desc ||
        ''
    )
    const mappedText = resolveYellowingQuestionOptionText(question, option)
    return mappedText || text
  }

  function resolveYellowingQuestionOptionText(question = {}, option = {}) {
    if (!isYellowingQuestion(question)) {
      return ''
    }

    const optionKey = normalizeText(
      option?.optionKey || option?.value || option?.optionId || option?.id || ''
    )
    const optionText = normalizeText(
      option?.optionTextUserCn ||
        option?.optionTextCn ||
        option?.text ||
        option?.optionText ||
        option?.label ||
        ''
    )
    const questionKey = normalizeText(question?.questionKey)
    const packageTopic = normalizeText(question?.packageTopic)

    if (isYellowingWateringQuestion(questionKey, packageTopic)) {
      if (
        isFrequencyOption(optionKey, optionText, [
          'often_wet',
          'more_wet',
          'too_wet',
          'over_wet',
          'yes'
        ])
      ) {
        return '近2周 2 次以上'
      }
      if (
        isFrequencyOption(optionKey, optionText, [
          'normal_or_stable',
          'no_change',
          'normal',
          'stable'
        ])
      ) {
        return '近2周 1-2 次'
      }
      if (
        isFrequencyOption(optionKey, optionText, [
          'often_dry',
          'more_dry',
          'not_enough',
          'dry',
          'lack'
        ])
      ) {
        return '近2周 0 次'
      }
      return ''
    }

    if (isYellowingFertilizationQuestion(questionKey, packageTopic)) {
      if (
        isFrequencyOption(optionKey, optionText, [
          'low_or_no_fertilizer',
          'no',
          'none',
          'not_fertilized'
        ])
      ) {
        return '近1个月 0 次'
      }
      if (
        isFrequencyOption(optionKey, optionText, [
          'normal_light_fertilizer',
          'normal',
          'appropriate'
        ])
      ) {
        return '近1个月 1-2 次'
      }
      if (
        isFrequencyOption(optionKey, optionText, [
          'recent_heavy_fertilizer_or_repot',
          'heavy_fertilizer',
          'heavy',
          'repot',
          'fertilize'
        ])
      ) {
        return '近1个月 2 次以上'
      }
      return ''
    }

    return ''
  }

  function getOptionDescription(option = {}) {
    return sanitizeTemplateText(
      option?.optionDescriptionUserCn ||
        option?.descriptionCn ||
        option?.optionDescription ||
        option?.description ||
        option?.desc ||
        ''
    )
  }

  function isYellowingQuestion(question = {}) {
    const questionKey = normalizeText(question?.questionKey)
    const questionText = normalizeText(
      question?.questionTextCn || question?.questionTextUserCn || question?.questionText || ''
    )
    return questionKey.includes('yellowing') || questionText.includes('黄叶')
  }

  function isYellowingWateringQuestion(questionKey = '', packageTopic = '') {
    return (
      questionKey.includes('watering_frequency_context') ||
      questionKey.includes('watering_context') ||
      questionKey.includes('watering') ||
      packageTopic.includes('watering')
    )
  }

  function isYellowingFertilizationQuestion(questionKey = '', packageTopic = '') {
    return (
      questionKey.includes('fertilization_growth_context') ||
      questionKey.includes('fertilization_context') ||
      questionKey.includes('fertilization_reference') ||
      questionKey.includes('fertilization') ||
      packageTopic.includes('fertilization')
    )
  }

  function isFrequencyOption(optionKey = '', optionText = '', optionKeys = []) {
    if (optionKeys.includes(optionKey)) {
      return true
    }

    if (!optionText) {
      return false
    }

    const compactText = normalizeText(optionText).replace(/\s+/g, '')
    return optionKeys.some(item => compactText.includes(item.replaceAll('_', '')))
  }

  return {
    isAccordionQuestion,
    getQuestionTitle,
    getQuestionHelpText,
    getOptionText,
    resolveYellowingQuestionOptionText,
    getOptionDescription,
    isYellowingQuestion,
    isYellowingWateringQuestion,
    isYellowingFertilizationQuestion,
    isFrequencyOption
  }
}
