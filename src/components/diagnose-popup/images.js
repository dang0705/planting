/* oxlint-disable no-unused-vars, no-magic-numbers */

export function useDiagnoseImages(ctx) {
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
  const navigateToDiagnosisQuestionPackagePage = (...args) =>
    ctx.navigateToDiagnosisQuestionPackagePage(...args)
  const startQuestionDiagnosisFromSymptomClass = (...args) =>
    ctx.startQuestionDiagnosisFromSymptomClass(...args)
  const resetQuestionState = (...args) => ctx.resetQuestionState(...args)
  const setQuestionAnswer = (...args) => ctx.setQuestionAnswer(...args)
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

  function buildStructuredImageInputs(files = []) {
    return (Array.isArray(files) ? files : [])
      .filter(item => item?.status === 'success')
      .map((item, index) => {
        const imageRef = String(item?.uploaded?.tempUrl || item?.uploaded?.url || '').trim()
        if (!imageRef) {
          return null
        }

        const slotType = normalizeSlotType(
          item?.inputSlotType || item?.userDeclaredOrganType || '',
          'unknown'
        )
        const metadata = buildSlotMetadata(slotType, index)
        const uploadCompression = buildUploadCompressionTrace(item)
        const declaredConfidence =
          item?.userDeclaredOrganConfidence === null ||
          item?.userDeclaredOrganConfidence === undefined ||
          item?.userDeclaredOrganConfidence === ''
            ? metadata.userDeclaredOrganConfidence
            : Number(item.userDeclaredOrganConfidence)

        return {
          imageRef,
          inputSlotType: slotType,
          orderIndex: index,
          inputSlotOrder: index,
          inputSlotLabel: metadata.inputSlotLabel,
          userDeclaredOrganType: String(
            item?.userDeclaredOrganType || metadata.userDeclaredOrganType || ''
          ).trim(),
          userDeclaredOrganConfidence:
            declaredConfidence === null ||
            declaredConfidence === undefined ||
            Number.isNaN(declaredConfidence)
              ? null
              : Number(declaredConfidence),
          ...(uploadCompression ? { uploadCompression } : {}),
          ...(item?.uploaded?.fileId ? { fileId: item.uploaded.fileId } : {})
        }
      })
      .filter(Boolean)
  }

  function normalizePositiveNumber(value) {
    const normalized = Number(value)
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
  }

  function buildUploadCompressionTrace(item = {}) {
    const compression = item?.compressed || null
    if (!compression || typeof compression !== 'object') {
      return null
    }

    const originalSizeBytes = normalizePositiveNumber(compression.originalSize || item?.size)
    const uploadedSizeBytes = normalizePositiveNumber(compression.fileSize)
    const quality = normalizePositiveNumber(compression.quality)
    const width = normalizePositiveNumber(compression.width)
    const height = normalizePositiveNumber(compression.height)
    const targetSizeBytes = normalizePositiveNumber(compression.targetBytes)
    const minimumQuality = normalizePositiveNumber(compression.minimumQuality)

    return {
      source: 'client_upload_before_cloud_storage',
      compressed: Boolean(compression.compressed),
      originalSizeBytes,
      uploadedSizeBytes,
      compressionRatio:
        originalSizeBytes > 0 && uploadedSizeBytes > 0
          ? Math.round((uploadedSizeBytes / originalSizeBytes) * 1000) / 1000
          : null,
      quality: quality || null,
      width: width || null,
      height: height || null,
      targetSizeBytes: targetSizeBytes || null,
      minimumQuality: minimumQuality || null,
      preserveImageDetails: Boolean(compression.preserveImageDetails),
      doubleConfirmedForHunyuan: Boolean(item?.uploaded?.tempUrl || item?.uploaded?.url)
    }
  }

  function getPreviewImagesFromFiles(files = []) {
    return uniqueStrings((Array.isArray(files) ? files : []).map(item => item?.previewUrl))
  }

  function getCasePreviewImages({ includeAdditionalImages = false } = {}) {
    const baseImages = casePreviewImages.value.length
      ? casePreviewImages.value
      : getPreviewImagesFromFiles(imageFiles.value)

    if (!includeAdditionalImages) {
      return uniqueStrings(baseImages)
    }

    return uniqueStrings([...baseImages, ...getPreviewImagesFromFiles(additionalImageFiles.value)])
  }

  function detectUsedAdditionalImageSubmission(currentResult = null) {
    const trace = currentResult?.visualBatchTrace
    if (!trace || typeof trace !== 'object') {
      return false
    }

    const currentBatchId = String(
      trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || ''
    ).trim()
    const originBatchId = String(
      trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || ''
    ).trim()
    const supersedeApplied = Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) === 1

    return (
      supersedeApplied ||
      Boolean(currentBatchId && originBatchId && currentBatchId !== originBatchId)
    )
  }

  async function chooseImage(slotType = 'other') {
    const normalizedSlotType = normalizeSlotType(slotType, 'other')
    const slotLimit = getSlotCapacity(PRIMARY_IMAGE_LIMIT)
    if (imageFiles.value.length >= PRIMARY_IMAGE_LIMIT) {
      uni.showToast({ title: `最多上传 ${PRIMARY_IMAGE_LIMIT} 张`, icon: 'none' })
      return
    }
    if (getSlotFileCount(imageFiles.value, normalizedSlotType) >= slotLimit) {
      uni.showToast({
        title: `${getOrganOptionLabel(normalizedSlotType)}最多 ${slotLimit} 张`,
        icon: 'none'
      })
      return
    }

    try {
      await uploader.chooseAndUpload({
        plantId: props.plantId,
        maxAge: 7200,
        pickCount: 1,
        entryPatch: buildSlotMetadata(normalizedSlotType, imageFiles.value.length)
      })
    } catch (error) {
      const message = String(error?.errMsg || error?.message || '')
      if (message.includes('cancel')) {
        return
      }

      console.error('选择图片失败:', error)
      uni.showToast({
        title: '选择图片失败，请重试',
        icon: 'none'
      })
    }
  }

  async function chooseAdditionalImage(slotType = 'whole_plant') {
    const normalizedSlotType = normalizeSlotType(slotType, 'whole_plant')
    const slotLimit = getSlotCapacity(ADDITIONAL_IMAGE_LIMIT)
    if (additionalImageFiles.value.length >= ADDITIONAL_IMAGE_LIMIT) {
      uni.showToast({ title: `最多补 ${ADDITIONAL_IMAGE_LIMIT} 张`, icon: 'none' })
      return
    }
    if (getSlotFileCount(additionalImageFiles.value, normalizedSlotType) >= slotLimit) {
      uni.showToast({
        title: `${getOrganOptionLabel(normalizedSlotType)}最多 ${slotLimit} 张`,
        icon: 'none'
      })
      return
    }

    try {
      await additionalImageUploader.chooseAndUpload({
        plantId: props.plantId,
        maxAge: 7200,
        pickCount: 1,
        entryPatch: buildSlotMetadata(normalizedSlotType, additionalImageFiles.value.length)
      })
    } catch (error) {
      const message = String(error?.errMsg || error?.message || '')
      if (message.includes('cancel')) {
        return
      }

      console.error('选择补图失败:', error)
      uni.showToast({
        title: '选择补图失败，请重试',
        icon: 'none'
      })
    }
  }

  function removeImage(index) {
    uploader.removeAt(index)
  }

  function removeAdditionalImage(index) {
    additionalImageUploader.removeAt(index)
  }

  async function resetAdditionalImages() {
    await additionalImageUploader.reset()
  }

  async function startDiagnose() {
    const propObservedSymptoms = Array.isArray(props.observedSymptoms) ? props.observedSymptoms : []
    const effectiveObservedSymptoms = propObservedSymptoms
    const effectiveObservedEvidenceSet = []
    const hasObservedSymptoms = effectiveObservedSymptoms.length > 0
    const structuredImages = primaryStructuredImages.value
    const uploadedImageUrls = structuredImages.map(item => item.imageRef)

    if (
      imageFiles.value.length === 0 &&
      !uploadedImageUrls.length &&
      hasSelectedSymptomMode.value
    ) {
      await startQuestionDiagnosisFromSymptomClass()
      return
    }

    if (imageFiles.value.length === 0 && !hasObservedSymptoms) {
      uni.showToast({ title: '请先添加照片', icon: 'none' })
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

    if (uploadedImageUrls.length === 0 && !hasObservedSymptoms) {
      uni.showToast({ title: '请至少保留 1 张上传成功的图片', icon: 'none' })
      return
    }

    if (!userStore.canDiagnose) {
      uni.showModal({
        title: '提示',
        content: '免费诊断次数已用完，升级会员享受无限次诊断',
        confirmText: '升级会员',
        success: res => {
          if (res.confirm) {
            closePopup()
            uni.switchTab({ url: '/pages/profile/profile' })
          }
        }
      })
      return
    }

    try {
      const imageUrls = hasObservedSymptoms ? [] : uploadedImageUrls

      const diagnosePayload = {
        image: imageUrls[0] || '',
        images: hasObservedSymptoms ? [] : structuredImages,
        imageIds: imageUrls,
        plantId: props.plantId,
        plantName: props.plantName,
        observedSymptoms: hasObservedSymptoms ? effectiveObservedSymptoms : [],
        observedEvidenceSet: effectiveObservedEvidenceSet,
        description: `共上传 ${imageUrls.length} 张照片`
      }

      pendingDiagnosePayload.value = diagnosePayload
      showAIDialog.value = true
      await new Promise(resolve => setTimeout(resolve, 100))
      aiStreamDialogRef.value?.startStream()

      await diagnoseMutation.mutateAsync({
        ...diagnosePayload,
        onText: (text, fullText) => {
          aiStreamDialogRef.value?.setText(fullText)
        },
        onFinish: diagnosisResult => {
          aiStreamDialogRef.value?.finishStream(diagnosisResult)
          userStore.useAIQuota()
        },
        onError: error => {
          aiStreamDialogRef.value?.setError(error)
        }
      })
    } catch (error) {
      console.error('诊断失败:', error)
      uni.hideLoading()
      uni.showToast({ title: error?.message || '诊断失败，请重试', icon: 'none' })
    }
  }

  return {
    buildStructuredImageInputs,
    normalizePositiveNumber,
    buildUploadCompressionTrace,
    getPreviewImagesFromFiles,
    getCasePreviewImages,
    detectUsedAdditionalImageSubmission,
    chooseImage,
    chooseAdditionalImage,
    removeImage,
    removeAdditionalImage,
    resetAdditionalImages,
    startDiagnose
  }
}
