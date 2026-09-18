'use strict'

const UPLOAD_COMPRESSION_NUMBER_FIELDS = Object.freeze(
  'originalSizeBytes uploadedSizeBytes compressionRatio quality width height sourceWidth sourceHeight sourcePixelCount outputPixelCount maxPixels pixelAlignment estimatedQwenVisualTokens targetSizeBytes minimumQuality'.split(
    ' '
  )
)

function normalizeUploadCompression(value = null) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const normalized = {
    source: String(value.source || '').trim(),
    compressed: Boolean(value.compressed),
    resized: Boolean(value.resized),
    preserveImageDetails: Boolean(value.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(value.doubleConfirmedForHunyuan)
  }

  for (const field of UPLOAD_COMPRESSION_NUMBER_FIELDS) {
    const number = Number(value[field])
    normalized[field] = Number.isFinite(number) && number > 0 ? number : null
  }

  return normalized
}

module.exports = {
  UPLOAD_COMPRESSION_NUMBER_FIELDS,
  normalizeUploadCompression
}
