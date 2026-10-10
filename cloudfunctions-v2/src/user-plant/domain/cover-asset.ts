import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'

/**
 * 用户植物封面规则（docs/backend-v2/contracts/user-plant-cover-asset.md；配置目录 confirmed 值，与目录一致性由测试锁定）。
 */
export const COVER_ASSET_RULES = Object.freeze({
  /** user-plant.assets.max_count_per_plant：每株最多有效封面数（统一入口）。 */
  maxCountPerPlant: RUNTIME_PARAMETERS.userPlant.coverMaxCountPerPlant.value,
  /** storage.upload.allowed_mime_types：只接受的图片类型（按文件魔数判断，统一入口）。 */
  allowedMimeTypes: RUNTIME_PARAMETERS.storage.uploadAllowedMimeTypes.value,
  /** storage.upload.max_image_bytes：单张图片字节上限（统一入口）。 */
  maxImageBytes: RUNTIME_PARAMETERS.storage.uploadMaxImageBytes.value,
  /** user-plant.assets.replaced_cover_cleanup_days：换下的旧封面最早可清理天数（统一入口）。 */
  replacedCoverCleanupDays: RUNTIME_PARAMETERS.userPlant.replacedCoverCleanupDays.value
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

/** 上传路径随机段：32 位小写十六进制（16 字节随机数）。 */
const uploadRandomPattern = /^[a-f0-9]{32}$/u
const uploadUserRefPattern = /^usr_[A-Za-z0-9_-]{8,60}$/u
const uploadPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u

/**
 * 本次封面上传路径（不含扩展名，user-plant-cover-asset/v1 §2.1）：user-plant/{本人用户公开编号}/covers/{植物引用}-{随机段}。
 * 前端追加 .jpg/.png/.webp 后上传；登记时仍由 isOwnCoverFileId 复核“目录 = 本人”。任一段格式不对抛 TypeError。
 */
export function buildCoverUploadPath(userRef: string, userPlantRef: string, randomHex: string): string {
  if (!uploadUserRefPattern.test(userRef) || !uploadPlantRefPattern.test(userPlantRef) || !uploadRandomPattern.test(randomHex)) {
    throw new TypeError('封面上传路径参数不合法')
  }
  return `user-plant/${userRef}/covers/${userPlantRef}-${randomHex}`
}
