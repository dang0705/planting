/**
 * 用户植物封面规则（docs/backend-v2/contracts/user-plant-cover-asset.md；配置目录 confirmed 值，与目录一致性由测试锁定）。
 */
export const COVER_ASSET_RULES = Object.freeze({
  /** user-plant.assets.max_count_per_plant：每株最多 1 张有效封面。 */
  maxCountPerPlant: 1,
  /** storage.upload.allowed_mime_types：只接受这三种图片（按文件魔数判断）。 */
  allowedMimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  /** storage.upload.max_image_bytes：单张最多 5 MiB。 */
  maxImageBytes: 5_242_880,
  /** user-plant.assets.replaced_cover_cleanup_days：换下的旧封面 7 天后才可清理。 */
  replacedCoverCleanupDays: 7
})

/** 允许的封面图片类型。 */
export type CoverImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

const coverFileIdPattern = /^cloud:\/\/[A-Za-z0-9-]{1,64}\.[A-Za-z0-9-]{1,128}\/user-plant\/(usr_[A-Za-z0-9_-]{8,60})\/covers\/([A-Za-z0-9._-]{1,128})$/u

/** fileID 是否位于当前用户的封面目录（user-plant/{本人用户公开编号}/covers/{文件名}），拒绝子目录与 `..`。 */
export function isOwnCoverFileId(fileId: string, userRef: string): boolean {
  const match = coverFileIdPattern.exec(fileId)
  return match !== null && match[1] === userRef && match[2] !== '.' && match[2] !== '..' && !match[2]!.includes('..')
}

/** 按文件魔数判断图片类型；不是 jpeg/png/webp 返回 null（不信任扩展名或上传方声明）。 */
export function detectCoverImageMime(bytes: Uint8Array): CoverImageMime | null {
  const starts = (signature: readonly number[], offset = 0) => bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value)
  if (starts([0xff, 0xd8, 0xff])) { return 'image/jpeg' }
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) { return 'image/png' }
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) { return 'image/webp' }
  return null
}
