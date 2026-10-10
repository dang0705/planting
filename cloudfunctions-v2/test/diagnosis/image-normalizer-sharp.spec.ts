import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  ImageNormalizationError,
  createImageNormalizer,
  hasJpegMetadataSegments
} from '../../src/diagnosis/image/image-normalizer.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-11 裁决（协调方转达）——安装 sharp 0.35.5；压缩要求「长边不超过 1024，只缩不放大，
 * 统一转成 JPEG，清除 EXIF 和 GPS」；不接收 HEIC，上传白名单保持 JPEG / PNG / WebP（storage.upload.allowed_mime_types）。
 * 补充 Expected（手机照片常识与安全要求）：清除元数据前先按 EXIF 方向转正，否则竖拍照片会躺倒；
 * 声明类型与真实内容不符、无法解码或像素数过大（解压炸弹）时拒绝，绝不原样放行。
 * 测试层次：unit_real_data（真实 sharp 处理合成图片；输入图片由测试现场合成，不来自用户）。
 * RED 证据：2026-10-11 以 image-normalizer.red.spec.ts 落盘，sharp 未安装时 9 条全部失败；安装并实现后转绿，并入默认套件。
 */
const fixture = fs.readFileSync(
  path.join(
    findProjectRoot(),
    'cloudfunctions-v2/test/fixtures/diagnosis/synthetic-exif-1600x1200.jpg'
  )
)

/** 用 sharp 现场合成一张纯色测试图（只作为输入，不参与 Expected 推导）。 */
async function synthesize(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' | 'gif',
  options: { alpha?: boolean; orientation?: number } = {}
): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  let image = sharp({
    create: {
      width,
      height,
      channels: options.alpha ? 4 : 3,
      background: options.alpha ? { r: 0, g: 128, b: 0, alpha: 0 } : { r: 0, g: 128, b: 0 }
    }
  })
  if (options.orientation !== undefined) {
    image = image.withMetadata({ orientation: options.orientation })
  }
  return image.toFormat(format).toBuffer()
}

/** 读出输出 JPEG 的真实尺寸与格式。 */
async function inspect(bytes: Buffer) {
  const { default: sharp } = await import('sharp')
  return sharp(bytes).metadata()
}

describe('真实图片压缩（sharp 0.35.5）', () => {
  test('1600×1200 带 EXIF/GPS 的 JPEG → 1024×768 JPEG，元数据全部清除', async () => {
    const result = await createImageNormalizer().normalize(fixture, 'image/jpeg')
    expect(result).toMatchObject({ mime: 'image/jpeg', width: 1024, height: 768 })
    expect(await inspect(result.bytes)).toMatchObject({ format: 'jpeg', width: 1024, height: 768 })
    expect(hasJpegMetadataSegments(result.bytes)).toBe(false)
    expect(result.bytes.includes(Buffer.from('GPS-LATITUDE'))).toBe(false)
    expect((await inspect(result.bytes)).exif).toBeUndefined()
  })

  test('竖拍照片（EXIF 方向 6）先转正再缩放：长边 1024 在高度上，输出不再带方向标记', async () => {
    const rotated = await synthesize(2000, 1500, 'jpeg', { orientation: 6 })
    const result = await createImageNormalizer().normalize(rotated, 'image/jpeg')
    expect(result).toMatchObject({ width: 768, height: 1024 })
    const metadata = await inspect(result.bytes)
    expect(metadata.orientation).toBeUndefined()
    expect(hasJpegMetadataSegments(result.bytes)).toBe(false)
  })

  test('带透明通道的 PNG 统一转成 JPEG（透明处铺白底），长边缩到 1024', async () => {
    const png = await synthesize(2000, 500, 'png', { alpha: true })
    const result = await createImageNormalizer().normalize(png, 'image/png')
    expect(result).toMatchObject({ mime: 'image/jpeg', width: 1024, height: 256 })
    const { default: sharp } = await import('sharp')
    const { data } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]].every(channel => (channel ?? 0) >= 250)).toBe(true)
  })

  test('小于上限的 WebP 只转格式不放大', async () => {
    const webp = await synthesize(600, 400, 'webp')
    const result = await createImageNormalizer().normalize(webp, 'image/webp')
    expect(result).toMatchObject({ mime: 'image/jpeg', width: 600, height: 400 })
    expect((await inspect(result.bytes)).format).toBe('jpeg')
  })

  test.each([
    ['image/gif', 'gif', 'unsupported_format'],
    ['image/heic', 'jpeg', 'unsupported_format'],
    ['image/png', 'jpeg', 'mime_mismatch']
  ] as const)('声明 %s、真实内容 %s 时拒绝：%s', async (mime, format, reason) => {
    const bytes = await synthesize(100, 100, format)
    const error = await createImageNormalizer()
      .normalize(bytes, mime)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ImageNormalizationError)
    expect((error as ImageNormalizationError).reason).toBe(reason)
  })

  test('无法解码的字节拒绝为 decode_failed', async () => {
    const error = await createImageNormalizer()
      .normalize(Buffer.from('not an image at all'), 'image/jpeg')
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ImageNormalizationError)
    expect((error as ImageNormalizationError).reason).toBe('decode_failed')
  })

  test('像素数超过 5000 万（解压炸弹防护）时拒绝为 too_many_pixels', async () => {
    const huge = await synthesize(10000, 5001, 'png')
    const error = await createImageNormalizer()
      .normalize(huge, 'image/png')
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ImageNormalizationError)
    expect((error as ImageNormalizationError).reason).toBe('too_many_pixels')
  })
})
