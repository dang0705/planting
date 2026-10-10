/**
 * 视觉诊断图片的云存储路径与归属规则（diagnosis-visual-api.md §2.1）。
 *
 * 通俗说明：像前端直传 OSS 时约定的「按用户分目录」——上传路径由服务端生成，
 * 登记时只认本人目录、合法扩展名的文件 ID；压缩后的图片写到同一用户目录下的独立子目录，原图不被覆盖。
 */

/** 用户公开编号格式（usr_…）。 */
const userRefPattern = /^usr_[A-Za-z0-9_-]{8,60}$/u
/** 32 位随机十六进制。 */
const hexPattern = /^[0-9a-f]{32}$/u
/** 本人上传图片的云文件 ID：cloud://{环境}.{桶}/diagnosis/{usr}/visual/{yyyyMM}/{32hex}.{jpg|png|webp}。 */
const visualFileIdPattern =
  /^cloud:\/\/[A-Za-z0-9-]{1,64}\.[A-Za-z0-9-]{1,128}\/diagnosis\/(usr_[A-Za-z0-9_-]{8,60})\/visual\/[0-9]{6}\/[0-9a-f]{32}\.(jpg|png|webp)$/u
/** 扩展名 → 声明类型（只作登记前的初筛，真实类型以文件魔数为准）。 */
const mimeByExtension = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const

/** UTC 年月 yyyyMM。 */
function yearMonth(nowMs: number): string {
  const date = new Date(nowMs)
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 生成本次上传路径（不含扩展名，前端追加 .jpg/.png/.webp）。 */
export function buildVisualUploadPath(userRef: string, nowMs: number, randomHex: string): string {
  if (!userRefPattern.test(userRef) || !hexPattern.test(randomHex)) {
    throw new RangeError('上传路径参数不合法')
  }
  return `diagnosis/${userRef}/visual/${yearMonth(nowMs)}/${randomHex}`
}

/** 文件 ID 是否位于本人的视觉诊断上传目录。 */
export function isOwnVisualFileId(fileId: string, userRef: string): boolean {
  const match = visualFileIdPattern.exec(fileId)
  return match !== null && match[1] === userRef
}

/** 按扩展名给出声明类型；不合法的文件 ID 返回 null。 */
export function mimeOfVisualFileId(fileId: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const match = visualFileIdPattern.exec(fileId)
  return match === null ? null : mimeByExtension[match[2] as keyof typeof mimeByExtension]
}

/** 压缩后图片的对象路径：diagnosis/{usr}/visual-normalized/{yyyyMM}/{vds}-{序号}.jpg。 */
export function buildNormalizedImageObjectId(
  userRef: string,
  nowMs: number,
  visualDiagnosisRef: string,
  imageIndex: number
): string {
  if (
    !userRefPattern.test(userRef) ||
    !/^vds_[A-Za-z0-9_-]{8,60}$/u.test(visualDiagnosisRef) ||
    !Number.isSafeInteger(imageIndex) ||
    imageIndex < 1
  ) {
    throw new RangeError('压缩图片路径参数不合法')
  }
  return `diagnosis/${userRef}/visual-normalized/${yearMonth(nowMs)}/${visualDiagnosisRef}-${imageIndex}.jpg`
}
