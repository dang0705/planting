/* oxlint-disable no-unused-vars, no-magic-numbers */
import { computed } from 'vue'

export function useDiagnoseDialogSubmit(ctx) {
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
    hasPendingUploads,
    hasUploadErrors,
    additionalImageFiles,
    hasPendingAdditionalImageUploads,
    hasAdditionalImageUploadErrors,
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
  const closePopup = () => ctx.close?.()

  function handleAIDialogClose() {
    showAIDialog.value = false
  }

  function buildDiagnosisQuestionPackageStorageKey(diagnosisSessionId = '') {
    return `${DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX}${diagnosisSessionId || Date.now()}`
  }

  function navigateToDiagnosisQuestionPackagePage(diagnosisResult) {
    const previewImages = getCasePreviewImages({ includeAdditionalImages: false })
    const normalizedResult = normalizeDiagnosisResult(diagnosisResult, {
      images: previewImages,
      plantName: props.plantName || '植物'
    })
    const storageKey = buildDiagnosisQuestionPackageStorageKey(normalizedResult.diagnosisSessionId)

    uni.setStorageSync(storageKey, {
      plantId: props.plantId,
      plantName: props.plantName || '植物',
      images: previewImages,
      diagnosisResult,
      normalizedResult,
      createdAt: Date.now()
    })

    showAIDialog.value = false
    pendingDiagnosePayload.value = null
    closePopup()
    uni.navigateTo({
      url: `/pages/diagnose/question-package?draftKey=${encodeURIComponent(storageKey)}`
    })
  }

  function handleAIDialogCancel() {
    showAIDialog.value = false
    pendingDiagnosePayload.value = null
    closePopup()
  }

  function handleAIDialogConfirm(diagnosisResult) {
    if (diagnosisResult) {
      navigateToDiagnosisQuestionPackagePage(diagnosisResult)
      return
    }
    showAIDialog.value = false
  }

  function handleAIRetry() {
    if (pendingDiagnosePayload.value) {
      aiStreamDialogRef.value?.startStream()

      const callbackOpts = {
        ...pendingDiagnosePayload.value,
        onText: (text, fullText) => {
          aiStreamDialogRef.value?.setText(fullText)
        },
        onFinish: diagnosisResult => {
          aiStreamDialogRef.value?.finishStream(diagnosisResult)
        },
        onError: error => {
          aiStreamDialogRef.value?.setError(error)
        }
      }

      diagnoseMutation.mutateAsync(callbackOpts)
    }
  }

  function canStartDiagnose() {
    const hasObservedSymptoms =
      hasSelectedSymptomMode.value ||
      (Array.isArray(props.observedSymptoms) && props.observedSymptoms.length > 0)

    if (isQuestionStartSubmitting()) {
      return false
    }

    if (!hasObservedSymptoms && primaryStructuredImages.value.length === 0) {
      return false
    }

    if (hasUploadErrors.value) {
      return false
    }

    return !hasPendingUploads.value
  }

  function canSubmitAdditionalImages() {
    if (!canShowAdditionalImageUploader.value) {
      return false
    }

    if (hasUsedAdditionalImageSubmission.value) {
      return false
    }

    if (hasPendingAdditionalImageUploads.value || hasAdditionalImageUploadErrors.value) {
      return false
    }

    return additionalStructuredImages.value.length > 0
  }

  const canStartDiagnoseNow = computed(() => canStartDiagnose())
  const canSubmitAdditionalImagesNow = computed(() => canSubmitAdditionalImages())

  async function submitAdditionalImages() {
    if (!result.value || !canSubmitAdditionalImages()) {
      return
    }

    submittingQuestionMode.value = 'images'
    try {
      const structuredImages = additionalStructuredImages.value
      const imageIds = structuredImages.map(item => item.imageRef).filter(Boolean)
      const rerunResult = await diagnosisAnswerMutation.mutateAsync({
        diagnosisSessionId: result.value.diagnosisSessionId,
        roundId: result.value.roundId,
        image: imageIds[0] || '',
        images: structuredImages,
        imageIds,
        latestVisualCallBatchId: result.value.latestVisualCallBatchId,
        visualBatchTrace: result.value.visualBatchTrace
      })

      const nextPreviewImages = getCasePreviewImages({ includeAdditionalImages: true })
      casePreviewImages.value = nextPreviewImages
      result.value = normalizeDiagnosisResult(rerunResult, {
        images: nextPreviewImages,
        plantName: props.plantName || result.value.plantName || '植物'
      })
      resetQuestionState(result.value.questions, {
        answerRevision: result.value.answerRevision
      })

      diagnoseStore.addToHistory({
        images: nextPreviewImages,
        diagnosis: result.value,
        diagnosisId: result.value.diagnosisSessionId || ''
      })
      emit('success', result.value)
      await additionalImageUploader.reset()

      uni.showToast({
        title: result.value.hasActiveQuestions ? '补图已更新' : '补图诊断已完成',
        icon: 'success'
      })
    } catch (error) {
      console.error('提交补图失败:', error)
      uni.showToast({ title: error.message || '补图失败，请重试', icon: 'none' })
    } finally {
      submittingQuestionMode.value = ''
    }
  }

  async function resetDiagnose() {
    await Promise.all([uploader.reset(), additionalImageUploader.reset()])
    result.value = null
    pendingDiagnosePayload.value = null
    casePreviewImages.value = []
    questionAnswers.value = {}
    careBehaviorTimelineByQuestionId.value = {}
    questionStack.value = []
    activeQuestionIndex.value = 0
    committedQuestionAnswers.value = {}
    dirtyQuestionFromIndex.value = -1
    questionAnswerRevision.value = 0
    expandedQuestionOptionByQuestion.value = {}
    submittingQuestionMode.value = ''
    selectedDevSymptomClassKey.value = ''
  }

  return {
    handleAIDialogClose,
    buildDiagnosisQuestionPackageStorageKey,
    navigateToDiagnosisQuestionPackagePage,
    handleAIDialogCancel,
    handleAIDialogConfirm,
    handleAIRetry,
    canStartDiagnose,
    canStartDiagnoseNow,
    canSubmitAdditionalImages,
    canSubmitAdditionalImagesNow,
    submitAdditionalImages,
    resetDiagnose
  }
}
