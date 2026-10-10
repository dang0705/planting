import type { Sharp, SharpOptions } from 'sharp'

/**
 * 服务端图片压缩（ClickUp z8v0kmvhnc/z8v0kmvhnd、diagnosis-visual-image-input/v1、用户 2026-10-11 裁决）。
 *
 * 通俗说明：像前端上传前用 canvas 压缩图片，只不过放在服务端做、而且是必经步骤：
 * 1. 只接收 JPEG / PNG / WebP（不接收 HEIC），并核对声明类型与真实内容一致；
 * 2. 先按 EXIF 方向把竖拍照片转正，再把长边缩到 1024 以内（只缩不放大，保持比例）；
 * 3. 统一重新编码为 JPEG（透明处铺白底），输出不带任何 EXIF/GPS 等元数据；
 * 4. 像素数过大（解压炸弹）、无法解码或类型不符时明确拒绝，绝不原样放行原图。
 * 图像库使用 sharp 0.35.5（依赖审查见 docs/backend-v2/architecture/image-compression-dependency-review-2026-10-11.md），
 * 按需懒加载：原生库加载失败只让视觉诊断返回 503，不影响同一函数里的其他路由。
 */

/** 输出长边上限（像素），用户 2026-10-11 裁决的硬规则；同时保证像素数 ≤1024²。 */
export const IMAGE_LONG_EDGE_MAX_PX = 1024
/** 输出 JPEG 质量（1～100），硬规则 diagnosis.visual.image_normalization。 */
export const IMAGE_OUTPUT_JPEG_QUALITY = 85
/** 解码前允许的最大像素数（解压炸弹防护），硬规则 diagnosis.visual.image_normalization。 */
export const IMAGE_MAX_INPUT_PIXELS = 50_000_000

/** 可接收的声明类型 → sharp 识别出的真实格式；与 storage.upload.allowed_mime_types 一致，不含 HEIC。 */
const acceptedFormatByMime: Readonly<Record<string, 'jpeg' | 'png' | 'webp'>> = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp'
})

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

/** 图像库加载失败（例如原生二进制与运行平台不符）；调用方应按 503 处理。 */
export class ImageNormalizerUnavailableError extends Error {
  constructor() {
    super('图片压缩能力暂不可用')
    this.name = 'ImageNormalizerUnavailableError'
  }
}

/** 图片被拒绝的原因代码；调用方按 400 处理并提示用户重新上传。 */
export type ImageRejectReason =
  | 'unsupported_format'
  | 'mime_mismatch'
  | 'decode_failed'
  | 'too_many_pixels'

/** 图片不合格；消息只含原因代码，不含图片内容或文件名。 */
export class ImageNormalizationError extends Error {
  /** 拒绝原因代码。 */
  readonly reason: ImageRejectReason

  constructor(reason: ImageRejectReason) {
    super(`图片不合格：${reason}`)
    this.name = 'ImageNormalizationError'
    this.reason = reason
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

/** 计算缩放目标：长边不超过 maxLongEdge，保持长宽比，只缩不放大；短边按比例四舍五入，至少 1 像素。 */
export function planDownscale(width: number, height: number, maxLongEdge: number): DownscalePlan {
  if (![width, height, maxLongEdge].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('图片尺寸必须是正整数')
  }
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) {
    return { width, height, resized: false }
  }
  const scale = maxLongEdge / longEdge
  return width >= height
    ? { width: maxLongEdge, height: Math.max(1, Math.round(height * scale)), resized: true }
    : { width: Math.max(1, Math.round(width * scale)), height: maxLongEdge, resized: true }
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

/** sharp 工厂函数的最小形状（便于测试注入加载失败）。 */
export type SharpFactory = (input: Buffer, options?: SharpOptions) => Sharp

/** 默认加载器：懒加载 sharp；加载失败统一转成 ImageNormalizerUnavailableError。 */
async function loadSharp(): Promise<SharpFactory> {
  try {
    const module = await import('sharp')
    return module.default
  } catch {
    throw new ImageNormalizerUnavailableError()
  }
}

/** 读取图片头信息并核对格式与像素数；返回转正后的宽高。 */
async function inspectInput(
  sharp: SharpFactory,
  input: Buffer,
  expectedFormat: 'jpeg' | 'png' | 'webp'
): Promise<{ width: number; height: number }> {
  let metadata
  try {
    metadata = await sharp(input, { failOn: 'error' }).metadata()
  } catch {
    throw new ImageNormalizationError('decode_failed')
  }
  if (metadata.format !== expectedFormat) {
    throw new ImageNormalizationError('mime_mismatch')
  }
  const width = metadata.autoOrient?.width ?? metadata.width
  const height = metadata.autoOrient?.height ?? metadata.height
  if (!width || !height) {
    throw new ImageNormalizationError('decode_failed')
  }
  if (width * height > IMAGE_MAX_INPUT_PIXELS) {
    throw new ImageNormalizationError('too_many_pixels')
  }
  return { width, height }
}

/**
 * 创建图片压缩器。
 * @param load sharp 加载器；默认懒加载真实 sharp，测试可注入失败的加载器验证 503 路径。
 */
export function createImageNormalizer(
  load: () => Promise<SharpFactory> = loadSharp
): ImageNormalizer {
  return Object.freeze({
    async normalize(input: Buffer, mime: string): Promise<NormalizedImage> {
      const expectedFormat = acceptedFormatByMime[mime]
      if (expectedFormat === undefined) {
        throw new ImageNormalizationError('unsupported_format')
      }
      const sharp = await load()
      const oriented = await inspectInput(sharp, input, expectedFormat)
      const plan = planDownscale(oriented.width, oriented.height, IMAGE_LONG_EDGE_MAX_PX)
      try {
        let pipeline = sharp(input, { failOn: 'error', limitInputPixels: IMAGE_MAX_INPUT_PIXELS })
          .autoOrient()
          .flatten({ background: '#ffffff' })
        if (plan.resized) {
          pipeline = pipeline.resize(plan.width, plan.height, { fit: 'fill' })
        }
        // sharp 默认不保留任何元数据（EXIF、GPS、XMP、IPTC、方向标记），这里不得调用 keepMetadata/withMetadata。
        const { data, info } = await pipeline
          .jpeg({ quality: IMAGE_OUTPUT_JPEG_QUALITY })
          .toBuffer({ resolveWithObject: true })
        return { bytes: data, mime: 'image/jpeg', width: info.width, height: info.height }
      } catch {
        throw new ImageNormalizationError('decode_failed')
      }
    }
  })
}
