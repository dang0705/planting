/**
 * 服务端图片压缩接口（ClickUp z8v0kmvhnc、diagnosis-visual-image-input/v1）。
 *
 * 规则：缩放到 1024² 像素以内、保持长宽比、只缩不放大；统一重新编码为 JPEG，并清除 EXIF/GPS 等元数据。
 * 真实实现需要图像处理依赖（候选 sharp 或纯 JS 方案，见 docs/backend-v2/architecture/image-compression-dependency-review-2026-10-11.md），
 * 依赖须经用户确认后才安装。本轮只落接口、缩放计划纯函数和**明确失败**的占位实现：占位实现绝不原样放行图片。
 */

/** 压缩结果。 */
export interface NormalizedImage {
  /** 重新编码后的字节。 */
  readonly bytes: Buffer
  /** 输出类型，统一为 JPEG。 */
  readonly mime: 'image/jpeg'
  /** 输出宽度（像素）。 */
  readonly width: number
  /** 输出高度（像素）。 */
  readonly height: number
}

/** 图片压缩器。 */
export interface ImageNormalizer {
  /** 解码、缩放、去元数据并重新编码。 */
  normalize(input: Buffer, mime: string): Promise<NormalizedImage>
}

/** 压缩依赖尚未安装或不可用；调用方应按 503 处理。 */
export class ImageNormalizerUnavailableError extends Error {
  constructor() {
    super('图片压缩能力尚未启用')
    this.name = 'ImageNormalizerUnavailableError'
  }
}

/** 缩放计划。 */
export interface DownscalePlan {
  /** 缩放后的目标宽度（像素，向下取整）。 */
  readonly width: number
  /** 缩放后的目标高度（像素，向下取整）。 */
  readonly height: number
  /** 是否需要缩小；原图未超上限时为 false。 */
  readonly resized: boolean
}

/** 计算缩放目标：像素数不超过 maxPixels，保持长宽比，只缩不放大；结果向下取整，至少 1 像素。 */
export function planDownscale(width: number, height: number, maxPixels: number): DownscalePlan {
  if (![width, height, maxPixels].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('图片尺寸必须是正整数')
  }
  if (width * height <= maxPixels) {
    return { width, height, resized: false }
  }
  const scale = Math.sqrt(maxPixels / (width * height))
  let targetWidth = Math.max(1, Math.floor(width * scale))
  let targetHeight = Math.max(1, Math.floor(height * scale))
  while (targetWidth * targetHeight > maxPixels) {
    if (targetWidth >= targetHeight) {
      targetWidth -= 1
    } else {
      targetHeight -= 1
    }
  }
  return { width: targetWidth, height: targetHeight, resized: true }
}

/** JPEG 中承载元数据的段：APP1（EXIF/XMP）、APP13（IPTC）。 */
const metadataMarkers = new Set([0xe1, 0xed])

/** 检查 JPEG 是否含 EXIF/XMP/IPTC 元数据段（只扫描到图像数据开始处）。 */
export function hasJpegMetadataSegments(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false
  }
  let offset = 2
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0
    if (marker === 0xda) {
      return false
    }
    if (metadataMarkers.has(marker)) {
      return true
    }
    const length = bytes.readUInt16BE(offset + 2)
    offset += 2 + length
  }
  return false
}

/** 依赖未安装前的占位实现：总是明确失败。 */
export const unavailableImageNormalizer: ImageNormalizer = Object.freeze({
  normalize: () => Promise.reject(new ImageNormalizerUnavailableError())
})

/** 创建图片压缩器；依赖经用户确认安装前返回占位实现。 */
export function createImageNormalizer(): ImageNormalizer {
  return unavailableImageNormalizer
}
