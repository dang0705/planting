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

/** 5 升油桶（大水量计量单位）。 */
export const BUCKET_ML = 5000

/**
 * 录入侧「用户上次浇了多少」瓶档选项。
 * value 为该档的代表 ml（提交给后端 amountMl）。
 * 注意：此为无盆体积时的固定兜底选项，有盆体积时用 resolveWateringDoseOptions 动态生成。
 */
export const WATERING_BOTTLE_OPTIONS = [
  { label: '不知道', value: null, amountMl: null },
  { label: '喷一喷', value: 'spray', amountMl: 30 },
  { label: '小半瓶', value: 'quarter', amountMl: 150 },
  { label: '半瓶', value: 'half', amountMl: 275 },
  { label: '一瓶', value: 'one', amountMl: 550 },
  { label: '两瓶', value: 'two', amountMl: 1100 },
  { label: '约5瓶', value: 'five', amountMl: 2600 }
]

/** 落档体积百分比阈值（与后端 classifyDoseByVolumeRatio 一致）。 */
const VOLUME_RATIO_THRESHOLDS = { MIST_MAX: 0.05, SMALL_MAX: 0.15, NORMAL_MAX: 0.4 }

/**
 * 按盆体积动态生成录入侧瓶档选项。
 * 大盆（如 100cm 直径）的"浇透"可能是几十升，固定 5 瓶上限不合理。
 *
 * 档位按盆体积百分比生成（与 resolveMlToDoseClass 阈值一致）：
 *   - 喷一喷：≈3% 体积（mist 档代表值）
 *   - 少量：≈10% 体积（small 档代表值）
 *   - 常规：≈25% 体积（normal 档代表值）
 *   - 浇透：≈50% 体积（thorough 档代表值）
 *   - 大量：≈80% 体积（超浇透档代表值）
 *
 * 单位随档位 ml 自动切换：≤5000ml 用矿泉水瓶，>5000ml 用 5 升油桶。
 * 无盆体积时退回固定 WATERING_BOTTLE_OPTIONS。
 *
 * @param {number} potVolumeMl - 盆体积 ml（≤0 或非法视为无体积）
 * @returns {Array<{label:string,value:string,amountMl:number}>}
 */
export function resolveWateringDoseOptions(potVolumeMl) {
  const v = toFiniteNumber(potVolumeMl)
  if (v === null || v <= 0) {
    return WATERING_BOTTLE_OPTIONS
  }
  // 各档代表 ml = 盆体积 × 百分比
  const mistMl = Math.max(30, Math.round(v * 0.03))
  const smallMl = Math.round(v * 0.1)
  const normalMl = Math.round(v * 0.25)
  const thoroughMl = Math.round(v * 0.5)
  const heavyMl = Math.round(v * 0.8)

  // 全档位统一单位：以最高档（heavyMl）为基准判断
  // 最高档 ≥5000ml → 全用油桶；否则全用矿泉水瓶
  const useBucket = heavyMl >= BUCKET_ML

  // 油桶模式下保证桶数递增，避免多档重复"约1桶"
  let bucketCounts = null
  if (useBucket) {
    const rawCounts = [smallMl, normalMl, thoroughMl, heavyMl].map(ml => Math.max(1, Math.round(ml / BUCKET_ML)))
    bucketCounts = []
    for (let i = 0; i < rawCounts.length; i++) {
      const prev = i > 0 ? bucketCounts[i - 1] : 0
      bucketCounts.push(rawCounts[i] > prev ? rawCounts[i] : prev + 1)
    }
  }

  const labelFor = (ml, idx) => {
    if (useBucket) {
      return `约${bucketCounts[idx]}桶`
    }
    if (ml <= MIST_TEXT_MAX_ML) return '喷一喷'
    const bottles = Math.round((ml / BOTTLE_ML) * 2) / 2
    if (bottles <= 0.5) return '约半瓶'
    return `约${bottles}瓶`
  }

  const options = [
    { label: '不知道', value: null, amountMl: null }
  ]
  // 油桶模式（大盆）不展示"喷一喷"——3% 盆体积可能上千 ml，不是喷雾语义
  if (!useBucket) {
    options.push({ label: '喷一喷', value: 'spray', amountMl: mistMl })
  }
  options.push(
    { label: labelFor(smallMl, 0), value: 'quarter', amountMl: smallMl },
    { label: labelFor(normalMl, 1), value: 'half', amountMl: normalMl },
    { label: labelFor(thoroughMl, 2), value: 'one', amountMl: thoroughMl },
    { label: labelFor(heavyMl, 3), value: 'two', amountMl: heavyMl }
  )
  return options
}

/**
 * 判断动态瓶档是否使用油桶单位（供说明文案切换）。
 * @param {number} potVolumeMl
 * @returns {boolean}
 */
export function isDoseOptionsUsingBucket(potVolumeMl) {
  const v = toFiniteNumber(potVolumeMl)
  if (v === null || v <= 0) {
    return false
  }
  return Math.round(v * 0.8) >= BUCKET_ML
}

const MIST_TEXT_MAX_ML = 50
/** ≥ 5000ml（5 升）改用油桶计量。 */
const BUCKET_TEXT_MIN_ML = BUCKET_ML

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * ml → 用户可读文案。与后端 formatMlToBottleText 口径一致：
 * ≤50 喷一喷；50~5000 矿泉水瓶（0.5瓶粒度）；≥5000 用5升油桶「约N桶」四舍五入。
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
    const buckets = Math.max(1, Math.round(value / BUCKET_ML))
    return `约${buckets}桶（5升油桶，约${Math.round(value)}ml）`
  }
  const bottles = Math.round((value / BOTTLE_ML) * 2) / 2
  const roundedMl = Math.round(value)
  if (bottles <= 0.5) {
    return `约半瓶（${roundedMl}ml）`
  }
  return `约${bottles}瓶（${roundedMl}ml）`
}

/**
 * 水量区间 [min,max] → 瓶数文案。与后端 formatMlRangeToBottleText 一致。
 * - 下限 ≤ 50ml 或上下限差 ≤ 50ml → 取上限单值
 * - 都在油桶级（≥5000ml）→ 「约{min}~{max}桶」
 * - 都在瓶级（50~5000ml）→ 「约{min}~{max}瓶」
 * - 跨瓶/桶级 → 「约{min}ml~{max}ml」
 * @param {number[]} rangeMl
 * @returns {string}
 */
export function formatMlRangeToBottleText(rangeMl) {
  if (!Array.isArray(rangeMl) || rangeMl.length < 2) {
    return '暂无建议水量'
  }
  const lower = toFiniteNumber(rangeMl[0])
  const upper = toFiniteNumber(rangeMl[1])
  if (upper === null || upper <= 0) {
    return '暂停浇水'
  }
  if (lower !== null && lower > MIST_TEXT_MAX_ML && (upper - lower) > MIST_TEXT_MAX_ML) {
    if (lower >= BUCKET_TEXT_MIN_ML) {
      const loBuckets = Math.max(1, Math.round(lower / BUCKET_ML))
      const hiBuckets = Math.max(loBuckets, Math.round(upper / BUCKET_ML))
      return `约${loBuckets}~${hiBuckets}桶（5升油桶）`
    }
    if (upper < BUCKET_TEXT_MIN_ML) {
      const loBottles = Math.max(0.5, Math.round((lower / BOTTLE_ML) * 2) / 2)
      const hiBottles = Math.max(loBottles, Math.round((upper / BOTTLE_ML) * 2) / 2)
      if (loBottles === hiBottles) {
        return formatMlToBottleText(upper)
      }
      return `约${loBottles}~${hiBottles}瓶（${Math.round(lower)}~${Math.round(upper)}ml）`
    }
    return `约${Math.round(lower)}~${Math.round(upper)}ml`
  }
  return formatMlToBottleText(upper)
}

/**
 * 由 amountMl 反查最接近的瓶档 value（用于回显选中态）。
 * 支持动态选项列表（有盆体积时传入 resolveWateringDoseOptions 的结果）。
 * @param {number} amountMl
 * @param {Array} options - 可选，默认用固定 WATERING_BOTTLE_OPTIONS
 * @returns {string|null}
 */
export function resolveBottleOptionValue(amountMl, options = WATERING_BOTTLE_OPTIONS) {
  const ml = toFiniteNumber(amountMl)
  if (ml === null || ml <= 0) {
    return null
  }
  let best = null
  let bestDiff = Infinity
  for (const opt of options) {
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

/** 超大盆体积阈值：超过此值（50 升）视为异常大盆，保存时需二次确认。 */
export const OVERSIZED_POT_VOLUME_ML = 50000

/**
 * 由盆口/盆底直径与盆高估算盆体积（截锥体，ml=cm³）。与后端 computePotGeometry 口径一致。
 * 缺直径返回 0；缺盆高按平均直径×0.85 估算。
 * @param {{potTopDiameterCm:number, potBottomDiameterCm:number, potHeightCm:number}} dims
 * @returns {number} 体积 ml
 */
export function estimatePotVolumeMl({ potTopDiameterCm, potBottomDiameterCm, potHeightCm } = {}) {
  const top = toFiniteNumber(potTopDiameterCm)
  const bottom = toFiniteNumber(potBottomDiameterCm)
  const resolvedTop = top ?? bottom
  const resolvedBottom = bottom ?? top
  if (resolvedTop === null || resolvedTop === undefined || resolvedBottom === null || resolvedBottom === undefined) {
    return 0
  }
  const avgDiameter = (resolvedTop + resolvedBottom) / 2
  let height = toFiniteNumber(potHeightCm)
  if (height === null) {
    height = avgDiameter * 0.85
  }
  const R = resolvedTop / 2
  const r = resolvedBottom / 2
  return (Math.PI * height / 3) * (R * R + R * r + r * r)
}

/**
 * 判定盆体积是否异常偏大（需保存前二次确认）。
 * @param {object} dims 盆型尺寸
 * @returns {boolean}
 */
export function isOversizedPot(dims) {
  return estimatePotVolumeMl(dims) > OVERSIZED_POT_VOLUME_ML
}
