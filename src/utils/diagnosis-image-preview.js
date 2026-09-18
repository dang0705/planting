function normalizePreviewUrl(value) {
  return String(value || '').trim()
}

function getPreviewUrl(item) {
  return normalizePreviewUrl(typeof item === 'string' ? item : item?.previewUrl)
}

export function previewDiagnosisImage(target, imageFiles = []) {
  const current = getPreviewUrl(target)
  if (!current) {
    return false
  }

  const urls = Array.from(
    new Set([
      current,
      ...(Array.isArray(imageFiles) ? imageFiles.map(item => getPreviewUrl(item)) : [])
    ])
  ).filter(Boolean)

  if (!urls.length) {
    return false
  }

  uni.previewImage({ current, urls })
  return true
}
