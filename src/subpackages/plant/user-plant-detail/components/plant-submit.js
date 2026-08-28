import { uploadPlantImage } from '@/api/storage.js'
import { normalizeOptionalLightEnvironment } from '@/utils/light-environment.js'

function appendPotProfilePayload(payload, potProfile) {
  if (!potProfile) {
    return
  }
  payload.potTopDiameterCm = potProfile.potTopDiameterCm || null
  payload.potBottomDiameterCm = potProfile.potBottomDiameterCm || null
  payload.potHeightCm = potProfile.potHeightCm || null
  payload.hasDrainageHole = potProfile.hasDrainageHole || 'true'
  payload.potMaterial = potProfile.potMaterial || 'unknown'
  payload.substrateType = potProfile.substrateType || 'unknown'
  payload.source = potProfile.source || 'user'
  payload.confidence = potProfile.confidence || 'normal'
}

async function resolvePhotoFileId({ image, imageFileId, selectedPlant, userId }) {
  const existingFileId = String(imageFileId || '').trim()
  if (existingFileId) {
    return existingFileId
  }
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
  userId = '',
  includeLightEnvironment = true,
  includeAirEnvironment = true,
  includePotProfile = true
}) {
  const sourcePlant = selectedPlant || identifyContext?.selectedPlant || null
  const plantIdentityId = String(sourcePlant?.plantIdentityId || '').trim()
  const sessionPlantId = String(sourcePlant?.sessionPlantId || '').trim()
  const plantId = String(
    sourcePlant?.plantId || sourcePlant?.id || sessionPlantId || plantIdentityId || ''
  ).trim()
  const localPhotoFileId = await resolvePhotoFileId({
    image: formData.image,
    imageFileId: formData.imageFileId,
    selectedPlant: sourcePlant,
    userId
  })

  const payload = {
    plantId: plantId || null,
    plantIdentityId: plantIdentityId || null,
    sessionPlantId: sessionPlantId || null,
    recognizedName: identifyContext?.recognizedName || recognizedName || null,
    nickname: formData.nickname || sourcePlant?.canonicalName || recognizedName || null,
    careLocation: formData.careLocation,
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

  if (includePotProfile) {
    appendPotProfilePayload(payload, formData.potProfile)
  }

  if (includeLightEnvironment) {
    payload.lightEnvironment = normalizeOptionalLightEnvironment(formData.lightEnvironment)
  }

  if (includeAirEnvironment) {
    payload.airEnvironment = formData.airEnvironment || null
  }

  return payload
}
