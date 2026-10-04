import { createHash } from 'node:crypto'

/** 已通过业务 JSON Schema 校验的合法 JSON 值；不包含 undefined、稀疏数组或非有限数值。 */
export type CanonicalJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalJsonValue[]
  | CanonicalJsonObject

/** 已通过业务 JSON Schema 校验的对象；键的输入顺序不参与摘要。 */
export type CanonicalJsonObject = {
  /** JSON 对象成员；值仍需满足完整 JSON 值限制。 */
  readonly [key: string]: CanonicalJsonValue
}

/** 在递归分支中区分数组与 JSON 对象，避免把数组下标误当对象键排序。 */
function isJsonArray(value: CanonicalJsonValue): value is readonly CanonicalJsonValue[] {
  return Array.isArray(value)
}

/**
 * 生成摘要专用的紧凑 JSON：对象键递归排序，数组严格保留提交顺序。
 * 调用方先按所属业务版本 Schema 校验；遇到非 JSON 值仍失败关闭。
 */
export function serializeCanonicalJson(value: CanonicalJsonValue): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('规范 JSON 摘要不能包含非有限数值。')
    }
    return JSON.stringify(value)
  }

  if (isJsonArray(value)) {
    const serializedItems: string[] = []
    for (const arrayIndex of value.keys()) {
      if (!Object.prototype.hasOwnProperty.call(value, arrayIndex)) {
        throw new TypeError('规范 JSON 摘要不能包含稀疏数组元素。')
      }
      const item = value[arrayIndex]
      if (item === undefined) {
        throw new TypeError('规范 JSON 摘要不能包含未定义的数组元素。')
      }
      serializedItems.push(serializeCanonicalJson(item))
    }
    return `[${serializedItems.join(',')}]`
  }

  if (typeof value === 'object') {
    // 输入是纯 JSON 树，不接受 Date、Map 或类实例被 Object.keys 悄悄压成空对象。
    // 无原型字典仍是纯键值记录；嵌套对象经递归执行相同检查。
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('规范 JSON 摘要只接受纯对象，不接受日期、集合或类实例。')
    }
    const members = Object.keys(value)
      .sort()
      .map(key => {
        const memberValue = value[key]
        if (memberValue === undefined) {
          throw new TypeError('规范 JSON 摘要不能包含未定义的对象成员。')
        }
        return `${JSON.stringify(key)}:${serializeCanonicalJson(memberValue)}`
      })
    return `{${members.join(',')}}`
  }

  throw new TypeError('摘要输入必须是完整 JSON 值。')
}

/** 对规范 JSON 的 UTF-8 字节计算 SHA-256，返回小写十六进制摘要。 */
export function calculateCanonicalJsonSha256(value: CanonicalJsonValue): string {
  return createHash('sha256').update(serializeCanonicalJson(value), 'utf8').digest('hex')
}
