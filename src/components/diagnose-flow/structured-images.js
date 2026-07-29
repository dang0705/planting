import { buildSlotMetadata, normalizeSlotType } from '@/utils/diagnose-image-slots.js'

function normalizePositiveNumber(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

export function buildUploadCompressionTrace(item = {}) {
  const compression = item?.compressed || null
  if (!compression || typeof compression !== 'object') {
    return null
  }

  const originalSizeBytes = normalizePositiveNumber(compression.originalSize || item?.size)
  const uploadedSizeBytes = normalizePositiveNumber(compression.fileSize)
  const quality = normalizePositiveNumber(compression.quality)
  const width = normalizePositiveNumber(compression.width)
  const height = normalizePositiveNumber(compression.height)
  const sourceWidth = normalizePositiveNumber(compression.sourceWidth)
  const sourceHeight = normalizePositiveNumber(compression.sourceHeight)
  const sourcePixelCount = normalizePositiveNumber(compression.sourcePixelCount)
  const outputPixelCount = normalizePositiveNumber(compression.outputPixelCount)
  const maxPixels = normalizePositiveNumber(compression.maxPixels)
  const pixelAlignment = normalizePositiveNumber(compression.pixelAlignment)
  const estimatedQwenVisualTokens = normalizePositiveNumber(compression.estimatedQwenVisualTokens)
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
    sourceWidth: sourceWidth || null,
    sourceHeight: sourceHeight || null,
    sourcePixelCount: sourcePixelCount || null,
    outputPixelCount: outputPixelCount || null,
    maxPixels: maxPixels || null,
    pixelAlignment: pixelAlignment || null,
    estimatedQwenVisualTokens: estimatedQwenVisualTokens || null,
    resized: Boolean(compression.resized),
    targetSizeBytes: targetSizeBytes || null,
    minimumQuality: minimumQuality || null,
    preserveImageDetails: Boolean(compression.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(item?.uploaded?.tempUrl || item?.uploaded?.url)
  }
}

export function buildStructuredImageInputs(files = []) {
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
      const captureRegion = String(
        item?.captureRegion || item?.capture_region || item?.regionRef || item?.region_ref || ''
      ).trim()
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
        ...(captureRegion ? { captureRegion } : {}),
        ...(item?.uploaded?.fileId ? { fileId: item.uploaded.fileId } : {})
      }
    })
    .filter(Boolean)
}
