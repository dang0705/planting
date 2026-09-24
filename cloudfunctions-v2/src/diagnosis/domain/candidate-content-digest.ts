import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'

/** JSON 合法值；候选必须先通过对应版本的 JSON Schema 校验。 */
export type CandidateDigestJsonValue = CanonicalJsonValue

/** JSON 对象，表示通过候选 v1 Schema 校验后的完整候选内容。 */
export type CandidateDigestJsonObject = CanonicalJsonObject

/**
 * 计算通过候选结构 Schema 的完整 JSON 内容摘要。
 *
 * `schemaVersion`、`bundleCode`、`revisionNo` 与所有候选字段都属于输入；审核决定、
 * 候选行状态/时间、候选公开引用和活动指针等行外元数据不属于候选 JSON。对象键
 * 递归排序，数组按提交 JSON 原次序保留，再以紧凑 UTF-8 字节计算小写十六进制 SHA-256。
 * 调用方不得用无序 SQL/CMS 列重新拼装数组后计算该摘要。
 *
 * @param candidate - 已通过候选版本 Schema 校验的完整候选 JSON 对象。
 * @returns 完整规范化候选内容的 SHA-256 小写十六进制字符串。
 */
export function calculateCandidateContentSha256(candidate: CandidateDigestJsonObject): string {
  return calculateCanonicalJsonSha256(candidate)
}
