import { computed, ref } from 'vue'

function createEntryId() {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeSuffixes(suffix = []) {
  const values = Array.isArray(suffix) ? suffix : String(suffix || '').split(',')
  return values
    .map(item => String(item || '').trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)
}

function normalizeCompressionQuality(compressionRate = 80) {
  const value = Number(compressionRate || 0)
  if (!Number.isFinite(value) || value <= 0) return 80
  if (value <= 1) return Math.max(1, Math.min(100, Math.round(value * 100)))
  return Math.max(1, Math.min(100, Math.round(value)))
}

function normalizeMaxSizeBytes(size = 5) {
  const value = Number(size || 0)
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value <= 100) {
    return Math.round(value * 1024 * 1024)
  }
  return Math.round(value)
}

function normalizeSizeType(sizeType = ['compressed']) {
  const values = Array.isArray(sizeType) ? sizeType : String(sizeType || '').split(',')
  const normalized = values
    .map(item => String(item || '').trim())
    .filter(item => item === 'original' || item === 'compressed')
  return normalized.length ? Array.from(new Set(normalized)) : ['compressed']
}

function getFileExtension(filePath = '') {
  const normalized = String(filePath || '').trim().split('?')[0]
  const match = normalized.match(/\.([a-zA-Z0-9]+)$/)
  return match ? String(match[1] || '').toLowerCase() : ''
}

function statFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().stat({
      path: filePath,
      success: res => resolve(res?.stats?.size || 0),
      fail: reject
    })
  })
}

function getImageInfo(filePath) {
  return new Promise(resolve => {
    try {
      wx.getImageInfo({
        src: filePath,
        success: res =>
          resolve({
            width: Number(res?.width || 0),
            height: Number(res?.height || 0)
          }),
        fail: () => resolve({ width: 0, height: 0 })
      })
    } catch {
      resolve({ width: 0, height: 0 })
    }
  })
}

function formatSizeLabel(sizeBytes = 0) {
  const value = Number(sizeBytes || 0)
  if (!Number.isFinite(value) || value <= 0) {
    return '0MB'
  }

  return `${Math.max(0.1, Math.round((value / 1024 / 1024) * 10) / 10)}MB`
}

function buildCompressionQualities(initialQuality = 80, minimumQuality = 56) {
  const start = Math.max(1, Math.min(100, Math.round(initialQuality)))
  const end = Math.max(1, Math.min(start, Math.round(minimumQuality)))
  const qualities = []

  for (let quality = start; quality >= end; quality -= 6) {
    qualities.push(quality)
  }

  if (!qualities.includes(end)) {
    qualities.push(end)
  }

  return Array.from(new Set(qualities)).filter(value => value < 100)
}

function resolveCompressionPlan({
  fileSize = 0,
  width = 0,
  height = 0,
  maxSizeBytes = 0,
  preferredQuality = 80,
  forceCompress = false,
  preserveImageDetails = false
} = {}) {
  const megaPixels = width > 0 && height > 0 ? (width * height) / 1000000 : 0
  let targetBytes = 0

  if (preserveImageDetails) {
    const detailTargetBytes = maxSizeBytes > 0 ? Math.round(maxSizeBytes * 0.96) : 0
    const detailMinimumQuality =
      fileSize >= 8 * 1024 * 1024 || megaPixels >= 14
        ? 78
        : fileSize >= 5 * 1024 * 1024 || megaPixels >= 9
          ? 82
          : 88
    return {
      shouldCompress: Boolean(forceCompress) || (maxSizeBytes > 0 && fileSize > maxSizeBytes),
      targetBytes: detailTargetBytes,
      initialQuality: Math.max(
        detailMinimumQuality,
        Math.min(96, Math.round(preferredQuality || 96))
      ),
      minimumQuality: detailMinimumQuality,
      preserveImageDetails: true
    }
  }

  if (fileSize >= 6 * 1024 * 1024 || megaPixels >= 12) {
    targetBytes = 900 * 1024
  } else if (fileSize >= 4 * 1024 * 1024 || megaPixels >= 8) {
    targetBytes = 720 * 1024
  } else if (fileSize >= 2 * 1024 * 1024 || megaPixels >= 5) {
    targetBytes = 560 * 1024
  } else if (fileSize >= 1 * 1024 * 1024 || megaPixels >= 3) {
    targetBytes = 420 * 1024
  } else if (fileSize >= 450 * 1024) {
    targetBytes = 300 * 1024
  }

  if (maxSizeBytes > 0) {
    const cappedBytes = Math.round(maxSizeBytes * 0.96)
    targetBytes = targetBytes > 0 ? Math.min(targetBytes, cappedBytes) : cappedBytes
  }

  let minimumQuality = 60
  if (fileSize >= 6 * 1024 * 1024 || megaPixels >= 12) {
    minimumQuality = 50
  } else if (fileSize >= 3 * 1024 * 1024 || megaPixels >= 7) {
    minimumQuality = 54
  } else if (fileSize >= 1.5 * 1024 * 1024 || megaPixels >= 4) {
    minimumQuality = 58
  }

  const initialQuality = Math.max(
    minimumQuality,
    Math.min(
      92,
      Math.round(
        preferredQuality -
          (fileSize >= 5 * 1024 * 1024 || megaPixels >= 10
            ? 8
            : fileSize >= 2 * 1024 * 1024 || megaPixels >= 6
              ? 4
              : 0)
      )
    )
  )

  const shouldCompress =
    Boolean(forceCompress) ||
    (preferredQuality < 100 && fileSize >= 280 * 1024) ||
    (targetBytes > 0 && fileSize > targetBytes) ||
    (maxSizeBytes > 0 && fileSize > maxSizeBytes)

  return {
    shouldCompress,
    targetBytes,
    initialQuality,
    minimumQuality,
    preserveImageDetails: false
  }
}

function compressImageAtQuality(filePath, quality) {
  if (quality >= 100) {
    return Promise.resolve(filePath)
  }

  return new Promise(resolve => {
    wx.compressImage({
      src: filePath,
      quality,
      success: res => resolve(res?.tempFilePath || filePath),
      fail: () => resolve(filePath)
    })
  })
}

async function compressLocalImage(
  filePath,
  { quality = 80, maxSizeBytes = 0, forceCompress = false, preserveImageDetails = false } = {}
) {
  const originalSize = await statFile(filePath)
  const imageInfo = await getImageInfo(filePath)
  const plan = resolveCompressionPlan({
    fileSize: originalSize,
    width: imageInfo.width,
    height: imageInfo.height,
    maxSizeBytes,
    preferredQuality: quality,
    forceCompress,
    preserveImageDetails
  })

  if (!plan.shouldCompress) {
    return {
      filePath,
      fileSize: originalSize,
      originalSize,
      compressed: false,
      quality: 100,
      width: imageInfo.width,
      height: imageInfo.height,
      preserveImageDetails: Boolean(preserveImageDetails)
    }
  }

  let bestCandidate = {
    filePath,
    fileSize: originalSize,
    originalSize,
    compressed: false,
    quality: 100,
    width: imageInfo.width,
    height: imageInfo.height,
    preserveImageDetails: Boolean(preserveImageDetails)
  }

  const qualities = buildCompressionQualities(plan.initialQuality, plan.minimumQuality)
  for (const currentQuality of qualities) {
    const compressedPath = await compressImageAtQuality(filePath, currentQuality)
    const compressedSize = await statFile(compressedPath)
    if (!compressedSize || compressedSize >= bestCandidate.fileSize) {
      continue
    }

    bestCandidate = {
      filePath: compressedPath,
      fileSize: compressedSize,
      originalSize,
      compressed: compressedPath !== filePath,
      quality: currentQuality,
      width: imageInfo.width,
      height: imageInfo.height,
      preserveImageDetails: Boolean(preserveImageDetails)
    }

    if (plan.targetBytes > 0 && compressedSize <= plan.targetBytes) {
      break
    }
  }

  return {
    ...bestCandidate,
    targetBytes: plan.targetBytes,
    minimumQuality: plan.minimumQuality,
    preserveImageDetails: Boolean(plan.preserveImageDetails)
  }
}

function chooseImages(count, sizeType = ['compressed']) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      sizeType: normalizeSizeType(sizeType),
      sourceType: ['camera', 'album'],
      success: res => resolve(Array.isArray(res?.tempFilePaths) ? res.tempFilePaths : []),
      fail: reject
    })
  })
}

export function useImageUploader({
  count = 5,
  size = 5,
  suffix = ['jpg', 'jpeg', 'png', 'webp'],
  sizeType = ['compressed'],
  compressionRate = 80,
  compressionTargetSize = 0,
  forceCompression = false,
  preserveImageDetails = false,
  uploadExecutor,
  removeExecutor
} = {}) {
  const files = ref([])
  const maxCount = Math.max(1, Number(count || 1))
  const maxSizeBytes = normalizeMaxSizeBytes(size)
  const compressionTargetBytes = normalizeMaxSizeBytes(compressionTargetSize)
  const allowedSuffixes = normalizeSuffixes(suffix)
  const compressionQuality = normalizeCompressionQuality(compressionRate)

  const hasPendingUploads = computed(() =>
    files.value.some(item => item.status === 'queued' || item.status === 'uploading')
  )
  const hasUploadErrors = computed(() =>
    files.value.some(item => item.status === 'error')
  )
  const uploadedFiles = computed(() =>
    files.value.filter(item => item.status === 'success')
  )
  const allUploaded = computed(() =>
    files.value.length > 0 && files.value.every(item => item.status === 'success')
  )
  const remainingCount = computed(() => Math.max(0, maxCount - files.value.length))

  function resolvePickCount(context = {}) {
    const requested = Math.max(1, Number(context?.pickCount || 1))
    return Math.min(remainingCount.value, requested)
  }

  function patchFile(entryId, updater) {
    const index = files.value.findIndex(item => item.id === entryId)
    if (index < 0) return
    const current = files.value[index]
    files.value.splice(index, 1, {
      ...current,
      ...(typeof updater === 'function' ? updater(current) : updater)
    })
  }

  async function validateLocalFile(filePath) {
    const ext = getFileExtension(filePath)
    if (allowedSuffixes.length && (!ext || !allowedSuffixes.includes(ext))) {
      throw new Error(`仅支持 ${allowedSuffixes.join('/')}`)
    }

    const fileSize = await statFile(filePath)
    return {
      filePath,
      ext: ext || 'jpg',
      fileSize
    }
  }

  async function uploadEntry(entryId, context = {}) {
    patchFile(entryId, {
      status: 'uploading',
      loading: true,
      error: ''
    })

    const current = files.value.find(item => item.id === entryId)
    if (!current) return

    try {
      const compressed = await compressLocalImage(current.localPath, {
        quality: compressionQuality,
        maxSizeBytes: compressionTargetBytes || maxSizeBytes,
        forceCompress: forceCompression,
        preserveImageDetails
      })
      if (maxSizeBytes > 0 && compressed.fileSize > maxSizeBytes) {
        throw new Error(`压缩后仍需小于 ${formatSizeLabel(maxSizeBytes)}`)
      }

      const uploaded = await uploadExecutor({
        filePath: compressed.filePath,
        originalPath: current.localPath,
        ext: current.ext,
        size: compressed.fileSize,
        originalSize: current.size,
        compression: compressed,
        entryId,
        context
      })

      patchFile(entryId, {
        status: 'success',
        loading: false,
        error: '',
        compressed,
        uploaded
      })
    } catch (error) {
      patchFile(entryId, {
        status: 'error',
        loading: false,
        error: error?.message || '上传失败'
      })
    }
  }

  async function chooseAndUpload(context = {}) {
    if (typeof uploadExecutor !== 'function') {
      throw new Error('缺少 uploadExecutor')
    }
    if (remainingCount.value <= 0) {
      return []
    }

    const picked = await chooseImages(resolvePickCount(context), sizeType)
    if (!picked.length) {
      return []
    }

    const prepared = await Promise.all(
      picked.map(async filePath => {
        try {
          const validated = await validateLocalFile(filePath)
          return { ok: true, ...validated }
        } catch (error) {
          return {
            ok: false,
            filePath,
            error: error?.message || '文件校验失败'
          }
        }
      })
    )

    const rejected = prepared.filter(item => !item.ok)
    if (rejected.length) {
      uni.showToast({
        title: rejected[0]?.error || '部分图片不可用',
        icon: 'none'
      })
    }

    const accepted = prepared.filter(item => item.ok)
    const baseEntryPatch =
      context?.entryPatch && typeof context.entryPatch === 'object'
        ? context.entryPatch
        : {}
    const entries = accepted.map(item => ({
      id: createEntryId(),
      localPath: item.filePath,
      previewUrl: item.filePath,
      ext: item.ext,
      size: item.fileSize,
      status: 'queued',
      loading: true,
      error: '',
      uploaded: null,
      ...baseEntryPatch
    }))

    files.value.push(...entries)
    await Promise.all(entries.map(item => uploadEntry(item.id, context)))
    return entries
  }

  async function removeAt(index) {
    const target = files.value[index]
    if (!target) return

    files.value.splice(index, 1)

    if (typeof removeExecutor === 'function' && target.uploaded) {
      try {
        await removeExecutor(target.uploaded)
      } catch (error) {
        console.warn('清理已上传文件失败:', error)
      }
    }
  }

  async function reset() {
    const snapshot = [...files.value]
    files.value = []

    if (typeof removeExecutor !== 'function') {
      return
    }

    await Promise.all(
      snapshot
        .filter(item => item?.uploaded)
        .map(item =>
          removeExecutor(item.uploaded).catch(error => {
            console.warn('清理已上传文件失败:', error)
          })
        )
    )
  }

  return {
    files,
    remainingCount,
    hasPendingUploads,
    hasUploadErrors,
    uploadedFiles,
    allUploaded,
    chooseAndUpload,
    removeAt,
    reset
  }
}
