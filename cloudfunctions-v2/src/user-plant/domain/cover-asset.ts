import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'

/**
 * 用户植物封面规则（docs/backend-v2/contracts/user-plant-cover-asset.md）。
 * 用户 2026-10-10 第三轮裁定：MIME 白名单、单图字节上限、旧封面清理天数迁入策略发布 user-plant/asset_rules（请求内快照传入）；
 * 这里只保留数据结构硬边界：每株一张当前封面（单槽替换）。
 */
export const COVER_ASSET_RULES = Object.freeze({
  /** user-plant.assets.max_count_per_plant：每株最多有效封面数（数据结构硬边界，统一入口）。 */
  maxCountPerPlant: RUNTIME_PARAMETERS.userPlant.coverMaxCountPerPlant.value
})

/** 允许的封面图片类型（代码已实现魔数识别的全集，策略只能选子集）。 */
export type CoverImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

/** 图片类型的中文提示名。 */
const mimeLabels: Readonly<Record<CoverImageMime, string>> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' }

/** 「只支持 …… 图片」提示（v1 = 只支持 JPEG、PNG、WebP 图片）。 */
export function describeAllowedCoverMimeTypes(types: readonly CoverImageMime[]): string {
  return `只支持 ${types.map(type => mimeLabels[type]).join('、')} 图片`
}

/** 「图片超过 …」提示（v1 = 图片超过 5 MiB）；非整 MiB 时保留至多两位小数。 */
export function describeCoverByteLimit(maxImageBytes: number): string {
  const mebibytes = maxImageBytes / (1024 * 1024)
  return `图片超过 ${Number.isInteger(mebibytes) ? String(mebibytes) : String(Math.round(mebibytes * 100) / 100)} MiB`
}

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
