import type { DryingRange } from './replay-dry-progress.js'

/** 主要材料至少占混合体积的比例（合同 8.10：“主要材料”定义为占一半及以上）。硬规则，不可配置。 */
const primaryMinimumShare = 0.5

/**
 * 配比未知的混合基质物性区间（合同 8.10，用户 2026-10-10 审定）。
 * - 未标主要材料：任意配比的线性混合都落在各组分下端最小值与上端最大值之间（并集）。
 * - 标了主要材料（占一半及以上）：区间 = 主材料区间 ∪「主材料与最极端其余组分对半混合」区间，
 *   即下端 = min(主.min, ½主.min + ½其余.min)，上端 = max(主.max, ½主.max + ½其余.max)。
 * 体积含水按体积比线性混合是近似（细颗粒填充粗颗粒孔隙时不成立，合同已记为局限）。
 * 调用方须先校验材料代码、主材料属于所选集合及各区间合法。
 */
export function combineMvpSubstrateMix(ranges: readonly { readonly material: string, readonly range: DryingRange }[], primaryMaterial: string | null): DryingRange {
  if (ranges.length === 0) { throw new TypeError('混合基质至少需要一种材料') }
  if (primaryMaterial === null) {
    return { min: Math.min(...ranges.map(item => item.range.min)), max: Math.max(...ranges.map(item => item.range.max)) }
  }
  const primary = ranges.find(item => item.material === primaryMaterial)
  if (primary === undefined) { throw new TypeError('主要材料必须属于所选材料') }
  const others = ranges.filter(item => item.material !== primaryMaterial)
  if (others.length === 0) { return { ...primary.range } }
  const otherMin = Math.min(...others.map(item => item.range.min))
  const otherMax = Math.max(...others.map(item => item.range.max))
  const share = primaryMinimumShare
  return {
    min: Math.min(primary.range.min, share * primary.range.min + (1 - share) * otherMin),
    max: Math.max(primary.range.max, share * primary.range.max + (1 - share) * otherMax),
  }
}
