import { computed } from 'vue'
import { useImageUploader } from './useImageUploader'
import {
  requestDiagnoseImageDelete,
  requestDiagnoseImageUpload
} from '@/http-functions/storage/client'

const QWEN_VISUAL_PATCH_SIZE = 32
const QWEN_VISUAL_BOUNDARY_TOKENS = 2

function normalizePositiveInteger(value) {
  const number = Math.floor(Number(value) || 0)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function resolveImagePixelBudget({
  width = 0,
  height = 0,
  maxPixels = 0,
  alignment = QWEN_VISUAL_PATCH_SIZE
} = {}) {
  const sourceWidth = normalizePositiveInteger(width)
  const sourceHeight = normalizePositiveInteger(height)
  const pixelBudget = normalizePositiveInteger(maxPixels)
  const grid = Math.max(1, normalizePositiveInteger(alignment) || QWEN_VISUAL_PATCH_SIZE)
  const sourcePixelCount = sourceWidth * sourceHeight
  let outputWidth = sourceWidth
  let outputHeight = sourceHeight

  if (sourcePixelCount > pixelBudget && pixelBudget > 0) {
    const scale = Math.sqrt(pixelBudget / sourcePixelCount)
    if (sourceWidth >= sourceHeight) {
      outputWidth = Math.max(1, Math.floor((sourceWidth * scale) / grid) * grid)
      outputHeight = Math.max(
        1,
        Math.round((outputWidth * sourceHeight) / sourceWidth / grid) * grid
      )
      while (outputWidth * outputHeight > pixelBudget && outputHeight > grid) {
        outputHeight -= grid
      }
      if (outputWidth * outputHeight > pixelBudget) {
        outputHeight = Math.max(1, Math.floor(pixelBudget / outputWidth))
      }
    } else {
      outputHeight = Math.max(1, Math.floor((sourceHeight * scale) / grid) * grid)
      outputWidth = Math.max(
        1,
        Math.round((outputHeight * sourceWidth) / sourceHeight / grid) * grid
      )
      while (outputWidth * outputHeight > pixelBudget && outputWidth > grid) {
        outputWidth -= grid
      }
      if (outputWidth * outputHeight > pixelBudget) {
        outputWidth = Math.max(1, Math.floor(pixelBudget / outputHeight))
      }
    }
  }

  return {
    sourceWidth,
    sourceHeight,
    width: outputWidth,
    height: outputHeight,
    sourcePixelCount,
    outputPixelCount: outputWidth * outputHeight,
    maxPixels: pixelBudget,
    pixelAlignment: grid,
    resized: outputWidth !== sourceWidth || outputHeight !== sourceHeight,
    estimatedQwenVisualTokens:
      outputWidth > 0 && outputHeight > 0
        ? Math.ceil(outputWidth / grid) * Math.ceil(outputHeight / grid) +
          QWEN_VISUAL_BOUNDARY_TOKENS
        : 0
  }
}

function getLocalImageInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: result =>
        resolve({
          width: normalizePositiveInteger(result?.width),
          height: normalizePositiveInteger(result?.height)
        }),
      fail: reject
    })
  })
}

function resizeLocalImage(filePath, dimensions) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality: 100,
      compressedWidth: dimensions.width,
      compressedHeight: dimensions.height,
      success: result => resolve(result?.tempFilePath || ''),
      fail: reject
    })
  })
}

export async function prepareImageForPixelBudget(
  filePath,
  { maxPixels = 0, alignment = QWEN_VISUAL_PATCH_SIZE } = {}
) {
  const source = await getLocalImageInfo(filePath)
  const plan = resolveImagePixelBudget({ ...source, maxPixels, alignment })
  if (!plan.resized) {
    return { filePath, compression: plan }
  }

  const resizedPath = await resizeLocalImage(filePath, plan)
  if (!resizedPath) {
    throw new Error('图片尺寸压缩失败，请重试')
  }
  const output = await getLocalImageInfo(resizedPath)
  const actual = resolveImagePixelBudget({
    width: output.width,
    height: output.height,
    maxPixels,
    alignment
  })
  if (!output.width || !output.height || actual.sourcePixelCount > plan.maxPixels) {
    throw new Error('图片尺寸压缩失败，请重试')
  }

  return {
    filePath: resizedPath,
    compression: {
      ...plan,
      width: output.width,
      height: output.height,
      outputPixelCount: output.width * output.height,
      estimatedQwenVisualTokens:
        Math.ceil(output.width / plan.pixelAlignment) *
          Math.ceil(output.height / plan.pixelAlignment) +
        QWEN_VISUAL_BOUNDARY_TOKENS
    }
  }
}

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
  preserveImageDetails = false,
  maxImagePixels = 0,
  imageDimensionAlignment = QWEN_VISUAL_PATCH_SIZE,
  minimumCompressionQuality = 0
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
    minimumCompressionQuality,
    prepareImage:
      normalizePositiveInteger(maxImagePixels) > 0
        ? filePath =>
            prepareImageForPixelBudget(filePath, {
              maxPixels: maxImagePixels,
              alignment: imageDimensionAlignment
            })
        : null,
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
