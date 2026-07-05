/* oxlint-disable no-unused-vars, no-magic-numbers */

export function useDiagnoseAutomation(ctx) {
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
  const sanitizeTemplateText = (...args) => ctx.sanitizeTemplateText(...args)
  const normalizeText = (...args) => ctx.normalizeText(...args)

  function parseAutomationDiagnosePayload(rawInput = {}) {
    if (typeof rawInput !== 'string') {
      return rawInput && typeof rawInput === 'object' ? rawInput : {}
    }

    const trimmed = rawInput.trim()
    if (!trimmed) {
      return {}
    }

    try {
      return JSON.parse(trimmed)
    } catch {
      return { imageRef: trimmed }
    }
  }

  function buildAutomationDiagnoseImageEntry(rawInput = {}, index = 0) {
    const item = parseAutomationDiagnosePayload(rawInput)
    const imageRef = String(
      item?.imageRef || item?.imageUrl || item?.url || item?.image || ''
    ).trim()

    if (!imageRef) {
      return null
    }

    const slotType = normalizeSlotType(
      item?.inputSlotType || item?.slotType || item?.userDeclaredOrganType || 'leaf',
      'leaf'
    )
    const slotMetadata = buildSlotMetadata(slotType, index)
    const uploadedSizeBytes = Number(item?.uploadedSizeBytes || item?.size || 0)
    const originalSizeBytes = Number(item?.originalSizeBytes || item?.size || 0)

    return {
      id: `automation_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
      localPath: imageRef,
      previewUrl: imageRef,
      ext: String(item?.ext || item?.suffix || 'jpg').replace(/^\./, '') || 'jpg',
      size: Number.isFinite(originalSizeBytes) && originalSizeBytes > 0 ? originalSizeBytes : 0,
      status: 'success',
      loading: false,
      error: '',
      uploaded: {
        tempUrl: imageRef,
        url: imageRef,
        fileId: String(item?.fileId || imageRef)
      },
      compressed: {
        originalSize:
          Number.isFinite(originalSizeBytes) && originalSizeBytes > 0 ? originalSizeBytes : 0,
        fileSize:
          Number.isFinite(uploadedSizeBytes) && uploadedSizeBytes > 0 ? uploadedSizeBytes : 0,
        compressed: Boolean(item?.compressed),
        quality: Number(item?.quality || 100),
        width: Number(item?.width || 0),
        height: Number(item?.height || 0),
        targetBytes: Number(item?.targetSizeBytes || 0),
        minimumQuality: Number(item?.minimumQuality || 0),
        preserveImageDetails: true
      },
      ...slotMetadata,
      orderIndex: index,
      inputSlotOrder: index
    }
  }

  function injectAutomationDiagnoseImages(rawInput = {}) {
    const payload = parseAutomationDiagnosePayload(rawInput)
    const rawImages = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.images)
        ? payload.images
        : [payload]
    const entries = rawImages
      .slice(0, PRIMARY_IMAGE_LIMIT)
      .map((item, index) => buildAutomationDiagnoseImageEntry(item, index))
      .filter(Boolean)

    if (!entries.length) {
      throw new Error('缺少可注入的诊断图片')
    }

    imageFiles.value.splice(0, imageFiles.value.length, ...entries)
    pendingDiagnosePayload.value = null
    result.value = null

    return {
      count: entries.length,
      images: entries.map(item => ({
        imageRef: item.uploaded?.tempUrl || item.uploaded?.url || '',
        inputSlotType: item.inputSlotType,
        inputSlotLabel: item.inputSlotLabel
      }))
    }
  }

  function injectAutomationDiagnoseImagesFromStorage() {
    if (!automationEnabled) {
      return { count: 0, images: [] }
    }

    const payload = uni.getStorageSync(AUTOMATION_DIAGNOSE_IMAGES_STORAGE_KEY)
    return injectAutomationDiagnoseImages(payload)
  }

  return {
    parseAutomationDiagnosePayload,
    buildAutomationDiagnoseImageEntry,
    injectAutomationDiagnoseImages,
    injectAutomationDiagnoseImagesFromStorage
  }
}
