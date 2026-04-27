import { computed } from 'vue'
import { useImageUploader } from './useImageUploader'
import {
  requestDiagnoseImageDelete,
  requestDiagnoseImageUpload
} from '@/http-functions/storage/client'

function guessMimeType(ext = '') {
  const normalized = String(ext || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')

  switch (normalized) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'heic':
      return 'image/heic'
    default:
      return 'image/jpeg'
  }
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    try {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: res => {
          const base64 = String(res?.data || '').trim()
          if (!base64) {
            reject(new Error('读取图片失败'))
            return
          }
          resolve(base64)
        },
        fail: reject
      })
    } catch (error) {
      reject(error)
    }
  })
}

async function readFileAsDataUrl(filePath, ext) {
  const base64 = await readFileBase64(filePath)
  return `data:${guessMimeType(ext)};base64,${base64}`
}

export function useCloudImageUploader({
  count = 5,
  size = 5,
  suffix = ['jpg', 'jpeg', 'png', 'webp'],
  sizeType = ['compressed'],
  compressionRate = 80,
  compressionTargetSize = 0,
  forceCompression = false,
  preserveImageDetails = false
} = {}) {
  const uploader = useImageUploader({
    count,
    size,
    suffix,
    sizeType,
    compressionRate,
    compressionTargetSize,
    forceCompression,
    preserveImageDetails,
    uploadExecutor: async ({ filePath, ext, context }) => {
      const dataUrl = await readFileAsDataUrl(filePath, ext)
      return requestDiagnoseImageUpload({
        dataUrl,
        suffix: ext,
        plantId: context?.plantId,
        maxAge: context?.maxAge || 7200
      })
    },
    removeExecutor: async uploaded => {
      if (!uploaded?.fileId) {
        return
      }

      await requestDiagnoseImageDelete({
        fileId: uploaded.fileId
      })
    }
  })

  const uploadedUrls = computed(() =>
    uploader.uploadedFiles.value
      .map(item => String(item?.uploaded?.tempUrl || item?.uploaded?.url || '').trim())
      .filter(Boolean)
  )
  const uploadedFileIds = computed(() =>
    uploader.uploadedFiles.value
      .map(item => String(item?.uploaded?.fileId || '').trim())
      .filter(Boolean)
  )

  return {
    ...uploader,
    uploadedUrls,
    uploadedFileIds
  }
}
