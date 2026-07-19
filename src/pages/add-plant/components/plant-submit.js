import { uploadPlantImage } from '@/api/storage.js'
import { normalizeOptionalLightEnvironment } from '@/utils/light-environment.js'

async function resolvePhotoFileId({ image, selectedPlant, userId }) {
  const normalizedImage = String(image || '')
  if (!normalizedImage) {
    return ''
  }
  if (/^https?:\/\//i.test(normalizedImage)) {
    return selectedPlant?.imageFileId || ''
  }
  uni.showLoading({ title: '上传图片中...', mask: true })
  try {
    const result = await uploadPlantImage(normalizedImage, userId, '')
    return result.fileId
  } finally {
    uni.hideLoading()
  }
}

export async function buildPlantSubmitPayload({
  formData,
  selectedPlant,
  identifyContext = null,
  recognizedName = '',
  userId = ''
}) {
  const sourcePlant = selectedPlant || identifyContext?.selectedPlant || null
  const plantIdentityId = String(sourcePlant?.plantIdentityId || '').trim()
  const sessionPlantId = String(sourcePlant?.sessionPlantId || '').trim()
  const plantId = String(
    sourcePlant?.plantId || sourcePlant?.id || sessionPlantId || plantIdentityId || ''
  ).trim()
  const localPhotoFileId = await resolvePhotoFileId({
    image: formData.image,
    selectedPlant: sourcePlant,
    userId
  })

  return {
    plantId: plantId || null,
    plantIdentityId: plantIdentityId || null,
    sessionPlantId: sessionPlantId || null,
    recognizedName: identifyContext?.recognizedName || recognizedName || null,
    nickname: formData.nickname || sourcePlant?.canonicalName || recognizedName || null,
    location: formData.location,
    careLocation: formData.careLocation,
    lightEnvironment: normalizeOptionalLightEnvironment(formData.lightEnvironment),
    plantDate: formData.plantDate || null,
    notes: formData.notes || '',
    photos: localPhotoFileId ? [localPhotoFileId] : null,
    sourceType: identifyContext ? 'baidu' : plantId ? 'catalog' : 'baidu',
    recognitionType: identifyContext?.recognitionType || null,
    recognitionConfidence: Number.isFinite(identifyContext?.recognitionConfidence)
      ? identifyContext.recognitionConfidence
      : null,
    identityResolutionStatus: plantIdentityId
      ? 'matched'
      : identifyContext?.identityResolutionStatus || 'unresolved',
    visualCallBatchId: identifyContext?.visualCallBatchId || null
  }
}
