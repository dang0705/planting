export function buildDiagnosePayload({
  plantId,
  userPlantId,
  plantCatalogId,
  image,
  images = [],
  imageIds = [],
  description,
  observedSymptoms = [],
  observedEvidenceSet = [],
  latestVisualCallBatchId = null,
  visualBatchTrace = null,
  skipAuth = false,
  platform = 'wechat-mini-program'
}) {
  const normalizedImages = normalizeDiagnoseImages(images)
  const normalizedImageIds = Array.isArray(imageIds)
    ? imageIds.filter(item => typeof item === 'string' && item.trim())
    : []
  const fallbackImageRef = normalizedImages[0]?.imageRef || ''
  const primaryImageRef = isValidDiagnoseImageReference(image) ? image : fallbackImageRef
  const resolvedImageIds = normalizedImageIds.length
    ? normalizedImageIds
    : normalizedImages.map(item => item.imageRef).filter(Boolean)

  return {
    plantId,
    userPlantId: userPlantId || plantId || null,
    ...(plantCatalogId ? { plantCatalogId } : {}),
    skipAuth,
    imageIds: resolvedImageIds.length ? resolvedImageIds : primaryImageRef ? [primaryImageRef] : [],
    ...(primaryImageRef ? { image: primaryImageRef } : {}),
    ...(normalizedImages.length ? { images: normalizedImages } : {}),
    ...(description ? { description } : {}),
    ...(Array.isArray(observedSymptoms) && observedSymptoms.length ? { observedSymptoms } : {}),
    ...(Array.isArray(observedEvidenceSet) && observedEvidenceSet.length ? { observedEvidenceSet } : {}),
    ...(latestVisualCallBatchId ? { latestVisualCallBatchId } : {}),
    ...(visualBatchTrace && typeof visualBatchTrace === 'object' ? { visualBatchTrace } : {}),
    clientContext: {
      source: 'DiagnosePopup',
      platform,
      visualInputVersion: 'multi_image_contract_v1',
      structuredImageCount: normalizedImages.length
    }
  }
}

function isValidDiagnoseImageReference(image) {
  const value = String(image || '').trim()

  if (!value) {
    return false
  }

  if (value.startsWith('data:image/')) {
    return true
  }

  if (/^https?:\/\//i.test(value) && !/^https?:\/\/tmp\//i.test(value)) {
    return true
  }

  return false
}

function normalizeDiagnoseImages(images = []) {
  return (Array.isArray(images) ? images : [])
    .map((item, index) => {
      if (typeof item === 'string') {
        const imageRef = String(item || '').trim()
        if (!isValidDiagnoseImageReference(imageRef)) {
          return null
        }
        return {
          imageRef,
          inputSlotType: 'unknown',
          orderIndex: index,
          inputSlotOrder: index,
          inputSlotLabel: `图片${index + 1}`,
          userDeclaredOrganType: '',
          userDeclaredOrganConfidence: null
        }
      }

      const imageRef = String(
        item?.imageRef || item?.imageUrl || item?.image || item?.url || item?.imageId || ''
      ).trim()

      if (!isValidDiagnoseImageReference(imageRef)) {
        return null
      }

      const normalizedOrderIndex = Number(item?.orderIndex ?? index)
      const normalizedInputSlotOrder = Number(item?.inputSlotOrder ?? item?.orderIndex ?? index)
      const normalizedConfidence = item?.userDeclaredOrganConfidence ?? item?.declaredOrganConfidence ?? null

      return {
        imageRef,
        inputSlotType: String(item?.inputSlotType || item?.slotType || item?.organHint || 'unknown').trim() || 'unknown',
        orderIndex: Number.isFinite(normalizedOrderIndex) ? normalizedOrderIndex : index,
        inputSlotOrder: Number.isFinite(normalizedInputSlotOrder) ? normalizedInputSlotOrder : index,
        inputSlotLabel: String(item?.inputSlotLabel || item?.slotLabel || `图片${index + 1}`).trim(),
        userDeclaredOrganType: String(
          item?.userDeclaredOrganType || item?.declaredOrganType || item?.userDeclaredOrgan || ''
        ).trim(),
        userDeclaredOrganConfidence:
          normalizedConfidence === null || normalizedConfidence === undefined || normalizedConfidence === ''
            ? null
            : Number.isFinite(Number(normalizedConfidence))
              ? Number(normalizedConfidence)
              : null,
        ...(item?.fileId ? { fileId: String(item.fileId).trim() } : {})
      }
    })
    .filter(Boolean)
}

export function validateDiagnoseInput({ plantId, userPlantId, image, images = [], observedSymptoms = [] }) {
  if (!plantId && !userPlantId) {
    throw new Error('缺少植物ID，无法进行诊断')
  }
  if (Array.isArray(observedSymptoms) && observedSymptoms.length) {
    return
  }
  if (normalizeDiagnoseImages(images).length > 0) {
    return
  }
  if (!isValidDiagnoseImageReference(image)) {
    throw new Error('请先上传诊断图片')
  }
}

export function runDiagnoseSuccessCallbacks(normalizedResult, { onText, onFinish } = {}) {
  const summary =
    normalizedResult?.finalResult?.summary ||
    normalizedResult?.summaryCard?.subtitle ||
    normalizedResult?.summaryCard?.title ||
    '诊断已更新'
  onText?.(summary, summary)
  onFinish?.(normalizedResult)
  return normalizedResult
}

export function handleDiagnoseError(error, { onError } = {}) {
  onError?.(error)
  throw error
}

export function buildFollowUpMutationPayload({
  diagnosisSessionId,
  roundId,
  answers = [],
  image = '',
  images = [],
  imageIds = [],
  latestVisualCallBatchId = null,
  visualBatchTrace = null
}) {
  if (!diagnosisSessionId) {
    throw new Error('缺少诊断会话ID，无法继续问诊')
  }

  const normalizedImages = normalizeDiagnoseImages(images)
  const normalizedImageIds = Array.isArray(imageIds)
    ? imageIds.filter(item => typeof item === 'string' && item.trim())
    : []
  const fallbackImageRef = normalizedImages[0]?.imageRef || ''
  const primaryImageRef = isValidDiagnoseImageReference(image) ? image : fallbackImageRef
  const resolvedImageIds = normalizedImageIds.length
    ? normalizedImageIds
    : normalizedImages.map(item => item.imageRef).filter(Boolean)

  return {
    diagnosisSessionId,
    roundId,
    answers,
    imageIds: resolvedImageIds.length ? resolvedImageIds : primaryImageRef ? [primaryImageRef] : [],
    ...(primaryImageRef ? { image: primaryImageRef } : {}),
    ...(normalizedImages.length ? { images: normalizedImages } : {}),
    ...(latestVisualCallBatchId ? { latestVisualCallBatchId } : {}),
    ...(visualBatchTrace && typeof visualBatchTrace === 'object' ? { visualBatchTrace } : {})
  }
}
