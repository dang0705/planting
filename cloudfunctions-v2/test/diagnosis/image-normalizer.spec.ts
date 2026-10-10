import { describe, expect, test } from 'vitest'

import {
  ImageNormalizerUnavailableError,
  hasJpegMetadataSegments,
  createImageNormalizer,
  planDownscale
} from '../../src/diagnosis/image/image-normalizer.js'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-11 裁决（协调方转达）——压缩要求「长边不超过 1024，只缩不放大，统一转成 JPEG，清除 EXIF 和 GPS」；
 * 长边 1024 同时保证像素数 ≤1024²（diagnosis-visual-image-input/v1 模型输入硬上限）。
 * 缩放尺寸按比例四舍五入，至少 1 像素。图像库不可用时必须明确失败，不得原样放行图片。
 * 测试层次：unit_fake（纯函数与注入的失败加载器）。
 */
const fixture = fs.readFileSync(
  path.join(
    findProjectRoot(),
    'cloudfunctions-v2/test/fixtures/diagnosis/synthetic-exif-1600x1200.jpg'
  )
)

describe('图片缩放计划（纯函数，长边上限 1024）', () => {
  test.each([
    [1600, 1200, 1024, 768],
    [4000, 3000, 1024, 768],
    [3000, 4000, 768, 1024],
    [1024, 1024, 1024, 1024],
    [800, 600, 800, 600],
    [10000, 100, 1024, 10],
    [100, 30000, 3, 1024]
  ])(
    '%s×%s → %s×%s（长边 ≤1024，保持比例，只缩不放大）',
    (width, height, expectedWidth, expectedHeight) => {
      const plan = planDownscale(width, height, 1024)
      expect(plan).toEqual({
        width: expectedWidth,
        height: expectedHeight,
        resized: width !== expectedWidth || height !== expectedHeight
      })
      expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(1024)
      expect(plan.width * plan.height).toBeLessThanOrEqual(1048576)
    }
  )

  test('拒绝非法尺寸', () => {
    expect(() => planDownscale(0, 100, 1024)).toThrow()
    expect(() => planDownscale(100.5, 100, 1024)).toThrow()
  })
})

describe('元数据检测与图像库不可用', () => {
  test('能识别 JPEG 中的 EXIF（APP1）段', () => {
    expect(hasJpegMetadataSegments(fixture)).toBe(true)
  })

  test('图像库加载失败时明确失败（调用方按 503 处理），而不是原样放行', async () => {
    const normalizer = createImageNormalizer(() =>
      Promise.reject(new ImageNormalizerUnavailableError())
    )
    await expect(normalizer.normalize(fixture, 'image/jpeg')).rejects.toBeInstanceOf(
      ImageNormalizerUnavailableError
    )
  })
})
