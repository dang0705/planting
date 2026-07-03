/**
 * 矿泉水瓶度量 —— 前端镜像（对应 cloudfunctions/layer/utils/water-volume-format.js）。
 *
 * 用途：
 *   1. 录入侧：把「瓶档选项」映射为绝对 ml（amountMl），提交给后端。
 *   2. 输出侧：把后端建议水量 ml 换算成「约 X 瓶」文案（后端已透出 amountBottleText，
 *      前端此处仅作兜底/一致性展示）。
 *
 * 前后端换算口径必须一致：BOTTLE_ML=550，0.5 瓶粒度。
 */

export const BOTTLE_ML = 550

/**
 * 录入侧「用户上次浇了多少」瓶档选项。
 * value 为该档的代表 ml（提交给后端 amountMl）。
 */
export const WATERING_BOTTLE_OPTIONS = [
  { label: '不知道', value: null, amountMl: null },
  { label: '喷一喷', value: 'spray', amountMl: 30 },
  { label: '小半瓶', value: 'quarter', amountMl: 150 },
  { label: '半瓶', value: 'half', amountMl: 275 },
  { label: '一瓶', value: 'one', amountMl: 550 },
  { label: '两瓶', value: 'two', amountMl: 1100 },
  { label: '一大桶', value: 'bucket', amountMl: 2600 }
]

const MIST_TEXT_MAX_ML = 50
const BUCKET_TEXT_MIN_ML = 2500

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * ml → 「约 X 瓶」文案（0.5 瓶粒度，附 ml）。与后端 formatMlToBottleText 一致。
 * @param {number} ml
 * @returns {string}
 */
export function formatMlToBottleText(ml) {
  const value = toFiniteNumber(ml)
  if (value === null || value <= 0) {
    return '无需浇水'
  }
  if (value <= MIST_TEXT_MAX_ML) {
    return `喷一喷（约${Math.round(value)}ml）`
  }
  if (value >= BUCKET_TEXT_MIN_ML) {
    return `一大桶（约${Math.round(value)}ml）`
  }
  const bottles = Math.round((value / BOTTLE_ML) * 2) / 2
  const roundedMl = Math.round(value)
  if (bottles <= 0.5) {
    return `约半瓶（${roundedMl}ml）`
  }
  return `约${bottles}瓶（${roundedMl}ml）`
}

/**
 * 水量区间 [min,max] → 瓶数文案（以上限为准）。与后端 formatMlRangeToBottleText 一致。
 * @param {number[]} rangeMl
 * @returns {string}
 */
export function formatMlRangeToBottleText(rangeMl) {
  if (!Array.isArray(rangeMl) || rangeMl.length < 2) {
    return '暂无建议水量'
  }
  const upper = toFiniteNumber(rangeMl[1])
  if (upper === null || upper <= 0) {
    return '暂停浇水'
  }
  return formatMlToBottleText(upper)
}

/**
 * 由 amountMl 反查最接近的瓶档 value（用于回显选中态）。
 * @param {number} amountMl
 * @returns {string|null}
 */
export function resolveBottleOptionValue(amountMl) {
  const ml = toFiniteNumber(amountMl)
  if (ml === null || ml <= 0) {
    return null
  }
  let best = null
  let bestDiff = Infinity
  for (const opt of WATERING_BOTTLE_OPTIONS) {
    if (opt.amountMl === null) {
      continue
    }
    const diff = Math.abs(opt.amountMl - ml)
    if (diff < bestDiff) {
      bestDiff = diff
      best = opt.value
    }
  }
  return best
}
