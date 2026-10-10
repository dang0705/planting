import type { MvpWateringRuntimeRules } from '../../configuration/mvp-watering-policy.js'
import type { DryingInterval } from './replay-dry-progress.js'

/**
 * 环境数据缺段可保守补齐的最长小时数自用户 2026-10-10 裁定起来自浇水策略 care-watering-mvp/v4 的 `dryingGapFillMaxHours`
 * （v3 按版本语义为 6 小时；目录 `care.watering.drying_gap_fill_max_hours`），由调用方传入，本文件不写死。
 */
/** 每小时毫秒数。 */
const millisecondsPerHour = 3_600_000

/**
 * 合同 8.11：相邻两个有效时段之间的缺口（时段缺失，或 PPFD/VPD 缺失、超出有效域而被丢弃）
 * 若总时长不超过 maxGapHours 小时，用 `filler` 生成的保守全区间时段补上；超过则保持空洞（积分仍判无结论）。
 * 只补“两个有效时段之间”的内部缺口：第一个有效时段之前与最后一个之后（预报覆盖终点）都不补。
 * 输入须为互不重叠的时段；输出按起点排序。
 */
export function fillMvpDryingGaps(intervals: readonly DryingInterval[], filler: (start: number, end: number) => DryingInterval,
  maxGapHours: NonNullable<MvpWateringRuntimeRules['dryingGapFillMaxHours']>): DryingInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const output: DryingInterval[] = []
  for (const [index, interval] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && interval.start > previous.end
      && interval.start - previous.end <= maxGapHours * millisecondsPerHour) {
      output.push(filler(previous.end, interval.start))
    }
    output.push(interval)
  }
  return output
}
