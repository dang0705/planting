import { createHash } from 'node:crypto'

const firstArrayIndex = Number('0')
const arrayIndexIncrement = Number('1')

/** JSON 合法值；候选必须先通过对应版本的 JSON Schema 校验。 */
export type CandidateDigestJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CandidateDigestJsonValue[]
  | CandidateDigestJsonObject

/** JSON 对象，表示通过候选 v1 Schema 校验后的完整候选内容。 */
export type CandidateDigestJsonObject = {
  readonly [key: string]: CandidateDigestJsonValue
}

/** 让 TypeScript 正确区分只读 JSON 数组与对象分支。 */
function isJsonArray(
  value: CandidateDigestJsonValue
): value is readonly CandidateDigestJsonValue[] {
  return Array.isArray(value)
}

/**
 * 把 JSON 值序列化为摘要专用的紧凑文本：对象键按字典序递归排序，数组保留输入次序。
 * 运行前提是调用方已完成候选 Schema 校验；遇到非 JSON 值时失败关闭。
 */
function serializeCanonicalJson(value: CandidateDigestJsonValue): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('候选摘要不能包含非有限 JSON 数值。')
    }
    return JSON.stringify(value)
  }

  if (isJsonArray(value)) {
    const serializedItems: string[] = []
    for (
      let arrayIndex = firstArrayIndex;
      arrayIndex < value.length;
      arrayIndex += arrayIndexIncrement
    ) {
      if (!Object.prototype.hasOwnProperty.call(value, arrayIndex)) {
        throw new TypeError('候选摘要不能包含稀疏数组元素。')
      }
      const item: CandidateDigestJsonValue | undefined = value[arrayIndex]
      if (item === undefined) {
        throw new TypeError('候选摘要不能包含未定义的 JSON 数组元素。')
      }
      serializedItems.push(serializeCanonicalJson(item))
    }
    return `[${serializedItems.join(',')}]`
  }

  if (typeof value === 'object') {
    const members = Object.keys(value)
      .sort()
      .map(key => {
        const memberValue = value[key]
        if (memberValue === undefined) {
          throw new TypeError('候选摘要不能包含未定义的 JSON 成员。')
        }
        return `${JSON.stringify(key)}:${serializeCanonicalJson(memberValue)}`
      })
    return `{${members.join(',')}}`
  }

  throw new TypeError('候选摘要输入必须是完整 JSON 值。')
}

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
  const canonicalJson = serializeCanonicalJson(candidate)
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex')
}
