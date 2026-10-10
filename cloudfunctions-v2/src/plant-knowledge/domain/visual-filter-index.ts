import type { VisualAxisSources } from '../../configuration/business-policies/index.js'
import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type { VisualAxisCatalogAxis, VisualAxisCode } from './visual-axis-filter.js'

/**
 * 三轴筛选预计算索引的纯规则（plant-visual-axis-filter/v1 修订 1，031 迁移）。
 * 前端类比：把每株植物的多选标签压成「位开关」——像用一个数字的二进制位记录勾选了哪些复选框，
 * 查询时只需判断「我勾选的开关里有没有一个与它重合」（按位与不为 0），不用逐行解析 JSON。
 */

/** 一个轴的位掩码最多 64 位（列类型 BIGINT UNSIGNED）。 */
const maximumBitsPerAxis = 64

/** 某轴「值代码 → 位序号」映射。 */
export type VisualAxisBitMap = ReadonlyMap<string, number>

/** 索引批次定位键：策略 visualAxisSources 规范 JSON 的 SHA-256（字段顺序无关）。 */
export function visualFilterSourceKey(sources: VisualAxisSources): string {
  return calculateCanonicalJsonSha256(sources as unknown as CanonicalJsonValue)
}

/**
 * 按生效枚举顺序（读取方已按 sort_order、值代码排序）从 0 起为每轴分配位序号；
 * 某轴超过 64 个值时无法用 BIGINT 表示，拒绝构建。
 */
export function assignVisualValueBits(
  catalog: ReadonlyMap<VisualAxisCode, VisualAxisCatalogAxis>
): ReadonlyMap<VisualAxisCode, VisualAxisBitMap> {
  const result = new Map<VisualAxisCode, VisualAxisBitMap>()
  for (const [axisCode, axis] of catalog) {
    if (axis.values.length > maximumBitsPerAxis) {
      throw new Error(`三轴筛选索引：${axisCode} 枚举超过 ${maximumBitsPerAxis} 个值`)
    }
    result.set(axisCode, new Map(axis.values.map((value, index) => [value.valueCode, index])))
  }
  return result
}

/**
 * 计算某株在某轴的取值掩码：只收录 JSON 数组里属于位表的字符串代码（区分大小写）；
 * 非数组、空数组或全是目录外代码时为 0（等价于结果表规则中的「不命中」）。
 */
export function computeVisualAxisMask(values: unknown, bits: VisualAxisBitMap): bigint {
  if (!Array.isArray(values)) {
    return 0n
  }
  let mask = 0n
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const position = bits.get(value)
    if (position !== undefined) {
      mask |= 1n << BigInt(position)
    }
  }
  return mask
}

/** 请求掩码：同轴多值按位或；任一值不在位表（索引早于当前枚举，已过期）返回 null。 */
export function selectionMask(
  values: readonly string[],
  bits: VisualAxisBitMap | undefined
): bigint | null {
  if (bits === undefined) {
    return null
  }
  let mask = 0n
  for (const value of values) {
    const position = bits.get(value)
    if (position === undefined) {
      return null
    }
    mask |= 1n << BigInt(position)
  }
  return mask
}
