import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  createImageNormalizer,
  hasJpegMetadataSegments
} from '../../src/diagnosis/image/image-normalizer.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * RED（尚未实现，须显式运行 npm run test:red）：真实图片压缩依赖经用户确认安装后才能转绿。
 * Expected：1600×1200 带 EXIF/GPS 的 JPEG → 输出 JPEG、像素 ≤1024²、保持比例、不含 APP1 段与 GPS 标记。
 * 测试层次：unit_real_data（待依赖安装后用真实图像库处理合成图片）。
 */
const fixture = fs.readFileSync(
  path.join(
    findProjectRoot(),
    'cloudfunctions-v2/test/fixtures/diagnosis/synthetic-exif-1600x1200.jpg'
  )
)

describe('真实图片压缩（待依赖安装）', () => {
  test('缩放到 1024² 以内并清除 EXIF/GPS', async () => {
    const normalizer = createImageNormalizer()
    const result = await normalizer.normalize(fixture, 'image/jpeg')
    expect(result.mime).toBe('image/jpeg')
    expect(result.width * result.height).toBeLessThanOrEqual(1048576)
    expect(result.width / result.height).toBeCloseTo(1600 / 1200, 2)
    expect(hasJpegMetadataSegments(result.bytes)).toBe(false)
    expect(result.bytes.includes(Buffer.from('GPS-LATITUDE'))).toBe(false)
  })
})
