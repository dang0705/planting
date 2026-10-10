import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { COVER_ASSET_RULES, detectCoverImageMime, isOwnCoverFileId } from '../../src/user-plant/domain/cover-asset.js'
import { userPlantAssetRulesV1 } from '../support/business-policy-fixtures.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：user-plant-cover-asset.md §1～§2（2026-10-10 用户裁决：目录 user-plant/{用户公开编号}/covers/，魔数判类型）；
 * 配置目录 confirmed：user-plant.assets.max_count_per_plant=1、storage.upload.allowed_mime_types=[jpeg,png,webp]、
 * storage.upload.max_image_bytes=5242880、user-plant.assets.replaced_cover_cleanup_days=7。层次：L1 / unit_fake（纯函数 + 目录读取）。
 */
const catalog = JSON.parse(fs.readFileSync(path.join(findProjectRoot(), 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as { variables: Array<{ id: string; currentValue: unknown }> }
const value = (id: string) => catalog.variables.find(variable => variable.id === id)?.currentValue

describe('封面资产规则', () => {
  // 用户 2026-10-10 第三轮裁定：MIME / 字节上限 / 清理天数迁入策略发布 user-plant/asset_rules（取值不变）；每株封面数（单槽数据结构）仍为代码硬边界。
  test('策略 v1 与代码硬边界取值与配置目录一致', () => {
    const rules = userPlantAssetRulesV1()
    expect(COVER_ASSET_RULES).toEqual({ maxCountPerPlant: value('user-plant.assets.max_count_per_plant') })
    expect({ allowedMimeTypes: rules.allowedMimeTypes, maxImageBytes: rules.maxImageBytes, replacedCoverCleanupDays: rules.replacedCoverCleanupDays }).toEqual({
      allowedMimeTypes: value('storage.upload.allowed_mime_types'),
      maxImageBytes: value('storage.upload.max_image_bytes'),
      replacedCoverCleanupDays: value('user-plant.assets.replaced_cover_cleanup_days')
    })
  })

  test.each([
    ['cloud://env-1.bucket-1/user-plant/usr_cover_owner0001/covers/a.jpg', true],
    ['cloud://env-1.bucket-1/user-plant/usr_cover_owner0001/covers/IMG_2026-10-10.webp', true],
    ['cloud://env-1.bucket-1/user-plant/usr_cover_other00001/covers/a.jpg', false],
    ['cloud://env-1.bucket-1/user-plant/usr_cover_owner0001/a.jpg', false],
    ['cloud://env-1.bucket-1/user-plant/usr_cover_owner0001/covers/../x.jpg', false],
    ['cloud://env-1.bucket-1/user-plant/usr_cover_owner0001/covers/sub/a.jpg', false],
    ['https://evil.example/user-plant/usr_cover_owner0001/covers/a.jpg', false],
    ['cloud://env-1.bucket-1/user-plant/usr_cover_owner00011/covers/a.jpg', false]
  ])('%s 是否属于本人封面目录 → %s', (fileId, expected) => {
    expect(isOwnCoverFileId(fileId, 'usr_cover_owner0001')).toBe(expected)
  })

  test('魔数识别 jpeg/png/webp；gif、svg、伪装扩展名一律 null', () => {
    expect(detectCoverImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg')
    expect(detectCoverImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(detectCoverImageMime(new Uint8Array([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP')]))).toBe('image/webp')
    expect(detectCoverImageMime(new Uint8Array([...Buffer.from('GIF89a')]))).toBeNull()
    expect(detectCoverImageMime(new Uint8Array([...Buffer.from('<svg xmlns=')]))).toBeNull()
    expect(detectCoverImageMime(new Uint8Array([]))).toBeNull()
  })
})
