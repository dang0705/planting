import { describe, expect, test } from 'vitest'

import {
  ImageNormalizerUnavailableError,
  hasJpegMetadataSegments,
  planDownscale,
  unavailableImageNormalizer
} from '../../src/diagnosis/image/image-normalizer.js'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnc 服务端图片压缩条款与 diagnosis-visual-image-input/v1——
 * 缩放到 1024² 像素（1,048,576）以内、保持长宽比、只缩不放大；统一重新编码并清除 EXIF/GPS。
 * 依赖尚未经用户确认安装，本轮只落接口与占位实现：占位实现必须明确失败（不得原样放行图片）。
 * 测试层次：unit_fake。
 */
const fixture = fs.readFileSync(
  path.join(
    findProjectRoot(),
    'cloudfunctions-v2/test/fixtures/diagnosis/synthetic-exif-1600x1200.jpg'
  )
)

describe('图片缩放计划（纯函数）', () => {
  test.each([
    [1600, 1200, 1182, 886],
    [4000, 3000, 1182, 886],
    [3000, 4000, 886, 1182],
    [1024, 1024, 1024, 1024],
    [800, 600, 800, 600],
    [10000, 100, 10000, 100]
  ])(
    '%s×%s → %s×%s（像素 ≤1024²，保持比例，只缩不放大）',
    (width, height, expectedWidth, expectedHeight) => {
      const plan = planDownscale(width, height, 1048576)
      expect(plan).toEqual({
        width: expectedWidth,
        height: expectedHeight,
        resized: width !== expectedWidth
      })
      expect(plan.width * plan.height).toBeLessThanOrEqual(1048576)
    }
  )

  test('拒绝非法尺寸', () => {
    expect(() => planDownscale(0, 100, 1048576)).toThrow()
    expect(() => planDownscale(100.5, 100, 1048576)).toThrow()
  })
})

describe('元数据检测与占位实现', () => {
  test('能识别 JPEG 中的 EXIF（APP1）段', () => {
    expect(hasJpegMetadataSegments(fixture)).toBe(true)
  })

  test('依赖未安装前，占位实现明确失败而不是原样放行', async () => {
    await expect(
      unavailableImageNormalizer.normalize(fixture, 'image/jpeg')
    ).rejects.toBeInstanceOf(ImageNormalizerUnavailableError)
  })
})
