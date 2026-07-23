/* oxlint-disable no-unused-vars, no-magic-numbers */
import { callComponentMethod } from '@/utils/component-ref.js'

export function useDiagnoseFlowActions(ctx) {
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
    normalizeDiagnosisDirectionChoices,
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
  const selectedDiagnosisProfile = {
    get value() {
      return ctx.selectedDiagnosisProfile?.value || 'full'
    },
    set value(nextValue) {
      ctx.selectedDiagnosisProfile.value = nextValue === 'pest' ? 'pest' : 'full'
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
  const navigateToDiagnosisQuestionPackagePage = (...args) =>
    ctx.navigateToDiagnosisQuestionPackagePage(...args)
  const resetQuestionState = (...args) => ctx.resetQuestionState(...args)
  const setQuestionAnswer = (...args) => ctx.setQuestionAnswer(...args)
  const getCasePreviewImages = (...args) => ctx.getCasePreviewImages(...args)
  const refreshEnvironmentWeatherWindowForCareBehavior = (...args) =>
    ctx.refreshEnvironmentWeatherWindowForCareBehavior(...args)
  const findQuestionById = (...args) => ctx.findQuestionById(...args)
  const buildCareBehaviorTimelineByQuestionIdMap = (...args) =>
    ctx.buildCareBehaviorTimelineByQuestionIdMap(...args)
  const isAccordionQuestion = (...args) => ctx.isAccordionQuestion(...args)
  const sanitizeTemplateText = (...args) => ctx.sanitizeTemplateText(...args)
  const normalizeText = (...args) => ctx.normalizeText(...args)

  function refreshViewportHeight() {
    try {
      const systemInfo = uni.getSystemInfoSync()
      viewportHeight.value = Math.max(
        Number(systemInfo?.screenHeight || 0),
        Number(systemInfo?.windowHeight || 0)
      )
      tabBarOccupiedHeight.value = 50 + Math.max(Number(systemInfo?.safeAreaInsets?.bottom || 0), 0)
    } catch {
      viewportHeight.value = 0
      tabBarOccupiedHeight.value = 50
    }
  }

  function open() {
    refreshViewportHeight()
    callComponentMethod(popup, 'open')
    callComponentMethod(popup, 'refreshLayout')
  }

  function close() {
    callComponentMethod(popup, 'close')
  }

  function handleChange(e) {
    if (!e.show) {
      emit('close')
    }
  }

  function uniqueStrings(values = []) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : []).map(item => String(item || '').trim()).filter(Boolean)
      )
    )
  }

  function selectDevSymptomClass(classKey = '') {
    selectedDevSymptomClassKey.value = String(classKey || '').trim()
  }

  function clearDevSymptomClass() {
    selectedDevSymptomClassKey.value = ''
  }

  function setDiagnosisProfile(profile = 'full') {
    selectedDiagnosisProfile.value = profile
  }

  function enrichDiagnosisResult(normalizedResult = {}, rawResult = {}) {
    const rawQuestions = Array.isArray(rawResult?.questions) ? rawResult.questions : []
    const directVisualResult =
      normalizedResult?.routePrimaryAction === 'direct_result' ||
      normalizedResult?.diagnosisModeRouteResult?.nextAction === 'direct_result' ||
      (normalizedResult?.questionRequired === false &&
        normalizedResult?.status === 'completed' &&
        Array.isArray(normalizedResult?.visibleOutcomes) &&
        normalizedResult.visibleOutcomes.length > 0)
    const questionPackage =
      !directVisualResult &&
      rawResult?.questionPackage &&
      typeof rawResult.questionPackage === 'object'
        ? rawResult.questionPackage
        : normalizedResult.questionPackage || null
    const questions = directVisualResult
      ? []
      : rawQuestions.length
        ? rawQuestions
        : normalizedResult.questions || []
    const uiHints =
      rawResult?.uiHints && typeof rawResult.uiHints === 'object'
        ? rawResult.uiHints
        : normalizedResult.uiHints || {}
    const hasActiveQuestions = Boolean(
      questions.length &&
      (uiHints.answerSubmitMode === 'package' ||
        questionPackage?.answerSubmitMode === 'package' ||
        normalizedResult.hasActiveQuestions)
    )
    const directionChoices = normalizeDiagnosisDirectionChoices(
      Array.isArray(rawResult?.directionChoices)
        ? rawResult.directionChoices
        : normalizedResult.directionChoices || [],
      {
        diagnosis: {
          ...rawResult,
          ...normalizedResult
        },
        visibleOutcomes: normalizedResult.visibleOutcomes || rawResult?.visibleOutcomes || []
      }
    )
    return {
      ...normalizedResult,
      questions,
      questionPackage: directVisualResult ? null : questionPackage,
      ...(questionPackage ? { questionPackage } : {}),
      hasActiveQuestions,
      uiHints,
      retakeRequest:
        rawResult?.retakeRequest && typeof rawResult.retakeRequest === 'object'
          ? rawResult.retakeRequest
          : normalizedResult.retakeRequest || null,
      retakeAuthorizationState:
        rawResult?.retakeAuthorizationState &&
        typeof rawResult.retakeAuthorizationState === 'object'
          ? rawResult.retakeAuthorizationState
          : normalizedResult.retakeAuthorizationState || null,
      directionChoices,
      candidateRefinementAvailable: Boolean(
        normalizedResult.candidateRefinementAvailable && directionChoices.length
      )
    }
  }

  function isQuestionStartSubmitting() {
    return Boolean(questionStartMutation.isPending?.value || questionStartMutation.isLoading?.value)
  }

  async function handleSymptomClassQuickSelect(option = null) {
    if (selectedDiagnosisProfile.value === 'pest') {
      uni.showToast({ title: '只看虫害需要先上传照片', icon: 'none' })
      return
    }
    selectDevSymptomClass(option?.classKey || '')
    if (imageFiles.value.length || primaryStructuredImages.value.length) {
      return
    }

    await startQuestionDiagnosisFromSymptomClass()
  }

  async function startQuestionDiagnosisFromSymptomClass() {
    const option = selectedDevSymptomClassOption.value
    if (selectedDiagnosisProfile.value === 'pest') {
      uni.showToast({ title: '只看虫害需要先上传照片', icon: 'none' })
      return
    }
    if (!option) {
      uni.showToast({ title: '请选择症状模式', icon: 'none' })
      return
    }

    if (isQuestionStartSubmitting()) {
      return
    }

    if (hasPendingUploads.value) {
      uni.showToast({ title: '请等待图片上传完成', icon: 'none' })
      return
    }

    if (hasUploadErrors.value) {
      uni.showToast({ title: '请先删除上传失败的图片', icon: 'none' })
      return
    }

    if (!userStore.canDiagnose) {
      uni.showModal({
        title: '提示',
        content: '免费诊断次数已用完，升级会员享受无限次诊断',
        confirmText: '升级会员',
        success: res => {
          if (res.confirm) {
            close()
            uni.switchTab({ url: '/pages/profile/profile' })
          }
        }
      })
      return
    }

    uni.showLoading({ title: '正在生成问诊...' })
    try {
      await questionStartMutation.mutateAsync({
        plantId: props.plantId,
        userPlantId: props.plantId,
        plantName: props.plantName,
        symptomClassKey: option.classKey,
        symptomKey: option.symptomKey,
        diagnosisProfile: selectedDiagnosisProfile.value,
        entrySource: props.entrySource || 'plant_card',
        description: `无图症状模式：${option.symptomCn}（${option.classNameCn}）`,
        onFinish: diagnosisResult => {
          userStore.useAIQuota()
          navigateToDiagnosisQuestionPackagePage(diagnosisResult)
        }
      })
    } catch (error) {
      uni.showToast({ title: error?.message || '问诊初始化失败，请重试', icon: 'none' })
    } finally {
      uni.hideLoading()
    }
  }

  return {
    refreshViewportHeight,
    open,
    close,
    handleChange,
    uniqueStrings,
    selectDevSymptomClass,
    clearDevSymptomClass,
    setDiagnosisProfile,
    enrichDiagnosisResult,
    isQuestionStartSubmitting,
    handleSymptomClassQuickSelect,
    startQuestionDiagnosisFromSymptomClass
  }
}
