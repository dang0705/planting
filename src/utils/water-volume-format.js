/**
 * 矿泉水瓶度量 -- 前端实现（后端 cloudfunctions/layer/utils/water-volume-format.js 已移除文案换算，
 * 只保留剂量落档算法 classifyDoseByVolumeRatio / resolveMlToDoseClass）。
 *
 * 用途：
 *   1. 录入侧：把「瓶档选项」映射为绝对 ml（amountMl），提交给后端。
 *   2. 输出侧：把后端建议水量 amountRangeMl（ml 数组）换算成「约 X 瓶」文案。
 *      后端不再产出 amountBottleText，文案全部由前端自算。
 *
 * 换算口径：BOTTLE_ML=550，0.5 瓶粒度。
 */

export const BOTTLE_ML = 550

/** 5 升油桶（大水量计量单位）。 */
export const BUCKET_ML = 5000

/**
 * 进入油桶计量的下限阈值：2500ml（约半桶）。
 * ≥ 此值即用「约 N 桶（5L油桶）」展示，桶数统一 Math.round。
 */
const BUCKET_TEXT_MIN_ML = 2500

/**
 * 录入侧「用户上次浇了多少」瓶档选项。
 * value 为该档的代表 ml（提交给后端 amountMl）。
 * label 拆为 amount（量级行）和 unit（单位行），组件分行渲染。
 * icon: 'bottle' | 'bucket' | null — 档位对应的参照物图标，组件渲染为「数量 × icon」。
 * count: 图标重复次数（0.5 瓶渲染为半透明单图标）。
 * 注意：此为无盆体积时的固定兜底选项，有盆体积时用 resolveWateringDoseOptions 动态生成。
 */
export const WATERING_BOTTLE_OPTIONS = [
  {
    label: '不知道',
    amount: '不知道',
    unit: '',
    icon: null,
    count: 0,
    value: null,
    amountMl: null
  },
  {
    label: '约 0.5 × 矿泉水瓶',
    amount: '约 0.5 ×',
    unit: '矿泉水瓶',
    icon: 'bottle',
    count: 0.5,
    value: 'quarter',
    amountMl: 150
  },
  {
    label: '约 1 × 矿泉水瓶',
    amount: '约 1 ×',
    unit: '矿泉水瓶',
    icon: 'bottle',
    count: 1,
    value: 'half',
    amountMl: 550
  },
  {
    label: '约 2 × 矿泉水瓶',
    amount: '约 2 ×',
    unit: '矿泉水瓶',
    icon: 'bottle',
    count: 2,
    value: 'one',
    amountMl: 1100
  },
  {
    label: '约 5 × 矿泉水瓶',
    amount: '约 5 ×',
    unit: '矿泉水瓶',
    icon: 'bottle',
    count: 5,
    value: 'two',
    amountMl: 2600
  },
  {
    label: '约 1 × 5L油桶',
    amount: '约 1 ×',
    unit: '5L油桶',
    icon: 'bucket',
    count: 1,
    value: 'five',
    amountMl: 5000
  }
]

/** 落档体积百分比阈值（与后端 classifyDoseByVolumeRatio 一致）。 */
const VOLUME_RATIO_THRESHOLDS = { MIST_MAX: 0.05, SMALL_MAX: 0.15, NORMAL_MAX: 0.4 }

/**
 * 单值 ml -> 录入侧档位 { amount, unit, icon, count }。
 * ≥2500ml 用桶，<2500ml 用瓶。
 * 瓶和桶统一 0.5 粒度（2500ml=0.5桶，5000ml=1桶，7500ml=1.5桶）。
 * 文案格式：约 N × 单位（如「约 1 × 5L油桶」「约 2 × 矿泉水瓶」）。
 * @param {number} ml
 * @returns {{amount:string, unit:string, icon:string|null, count:number}}
 */
export function formatMlToDoseLabel(ml) {
  const value = toFiniteNumber(ml)
  if (value === null || value <= 0) {
    return { amount: '不知道', unit: '', icon: null, count: 0 }
  }
  if (value >= BUCKET_TEXT_MIN_ML) {
    const buckets = Math.max(0.5, Math.round((value / BUCKET_ML) * 2) / 2)
    return { amount: `约 ${buckets} ×`, unit: '5L油桶', icon: 'bucket', count: buckets }
  }
  const bottles = Math.max(0.5, Math.round((value / BOTTLE_ML) * 2) / 2)
  return { amount: `约 ${bottles} ×`, unit: '矿泉水瓶', icon: 'bottle', count: bottles }
}

/**
 * 按盆体积动态生成录入侧瓶档选项。
 * 大盆（如 100cm 直径）的"浇透"可能是几十升，固定档位上限不合理。
 *
 * 档位按盆体积百分比生成（与 resolveMlToDoseClass 阈值一致）：
 *   - 少量：≈10% 体积（small 档代表值）
 *   - 常规：≈25% 体积（normal 档代表值）
 *   - 浇透：≈50% 体积（thorough 档代表值）
 *   - 大量：≈80% 体积（超浇透档代表值）
 *
 * 每个档位独立判断单位：≥2500ml 用桶，<2500ml 用瓶，瓶桶可混排。
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
  const smallMl = Math.round(v * 0.1)
  const normalMl = Math.round(v * 0.25)
  const thoroughMl = Math.round(v * 0.5)
  const heavyMl = Math.round(v * 0.8)

  const label0 = { amount: '不知道', unit: '', icon: null, count: 0 }
  const s = formatMlToDoseLabel(smallMl)
  const n = formatMlToDoseLabel(normalMl)
  const t = formatMlToDoseLabel(thoroughMl)
  const h = formatMlToDoseLabel(heavyMl)
  const raw = [
    { label: '不知道', ...label0, value: null, amountMl: null },
    { label: `${s.amount} ${s.unit}`, ...s, value: 'quarter', amountMl: smallMl },
    { label: `${n.amount} ${n.unit}`, ...n, value: 'half', amountMl: normalMl },
    { label: `${t.amount} ${t.unit}`, ...t, value: 'one', amountMl: thoroughMl },
    { label: `${h.amount} ${h.unit}`, ...h, value: 'two', amountMl: heavyMl }
  ]
  // 去重：相邻档位如果 label 相同（同 icon + 同 count），将后者的 count 递增 0.5 直至不同
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1]
    const cur = raw[i]
    if (cur.icon && cur.icon === prev.icon && cur.count === prev.count) {
      cur.count = prev.count + 0.5
      cur.amount = `约 ${cur.count} ×`
      cur.label = `${cur.amount} ${cur.unit}`
    }
  }
  return raw
}

/**
 * 判断动态瓶档是否包含油桶单位（供说明文案切换）。
 * @param {number} potVolumeMl
 * @returns {boolean}
 */
export function isDoseOptionsUsingBucket(potVolumeMl) {
  const v = toFiniteNumber(potVolumeMl)
  if (v === null || v <= 0) {
    return false
  }
  // 任意一档 ≥2500ml 即含桶
  return Math.round(v * 0.1) >= BUCKET_TEXT_MIN_ML
}

/** 区间最小跨度：上下限差 ≤ 此值时退回单值文案（约半瓶的量级）。 */
const RANGE_MIN_SPAN_ML = BOTTLE_ML / 2 // 275ml

/** ml -> L 文案，≥5000ml 转为 L 显示。 */
function formatMlDisplay(ml) {
  const value = toFiniteNumber(ml)
  if (value === null || value <= 0) {
    return '0ml'
  }
  if (value >= BUCKET_ML) {
    const liters = (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)
    return `${liters}L`
  }
  return `${Math.round(value)}ml`
}

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * ml -> 用户可读文案。格式：毫升数/L（N × 矿泉水瓶/5L油桶）。
 * ≤0 无需浇水；<2500ml 用瓶（0.5 粒度）；≥2500ml 用桶（0.5 粒度），≥5000ml 转L显示。
 * @param {number} ml
 * @returns {string}
 */
export function formatMlToBottleText(ml) {
  const value = toFiniteNumber(ml)
  if (value === null || value <= 0) {
    return '无需浇水'
  }
  if (value >= BUCKET_TEXT_MIN_ML) {
    const buckets = Math.max(0.5, Math.round((value / BUCKET_ML) * 2) / 2)
    return `${formatMlDisplay(value)}（${buckets} × 5L油桶）`
  }
  const bottles = Math.max(0.5, Math.round((value / BOTTLE_ML) * 2) / 2)
  return `${formatMlDisplay(value)}（${bottles} × 矿泉水瓶）`
}

/**
 * 水量区间 [min,max] -> 可读文案。
 * 格式：毫升数~毫升数（N~M × 矿泉水瓶/5L油桶），≥5000ml 转 L。
 * 单位切换阈值统一为 BUCKET_TEXT_MIN_ML(2500ml)：≥2500 用桶，<2500 用瓶。
 * - [0,0] / 上限≤0 -> 暂停
 * - 下限≤0 或 上下限差≤ RANGE_MIN_SPAN_ML -> 取上限单值
 * - 上限 ≥ 2500 -> 桶模式（含跨瓶/桶级，统一用桶）
 * - 上限 < 2500 -> 瓶模式
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
  // 区间跨度足够大且下限有效时，输出区间文案
  if (lower !== null && lower > 0 && upper - lower > RANGE_MIN_SPAN_ML) {
    // 上限 ≥ 2500 -> 桶模式（含跨瓶/桶级，统一用桶）
    if (upper >= BUCKET_TEXT_MIN_ML) {
      const loBuckets = Math.max(0.5, Math.round((lower / BUCKET_ML) * 2) / 2)
      const hiBuckets = Math.max(loBuckets, Math.round((upper / BUCKET_ML) * 2) / 2)
      if (loBuckets === hiBuckets) {
        return formatMlToBottleText(upper)
      }
      return `${formatMlDisplay(lower)}~${formatMlDisplay(upper)}（${loBuckets}~${hiBuckets} × 5L油桶）`
    }
    // 上限 < 2500 -> 瓶模式
    const loBottles = Math.max(0.5, Math.round((lower / BOTTLE_ML) * 2) / 2)
    const hiBottles = Math.max(loBottles, Math.round((upper / BOTTLE_ML) * 2) / 2)
    if (loBottles === hiBottles) {
      return formatMlToBottleText(upper)
    }
    return `${formatMlDisplay(lower)}~${formatMlDisplay(upper)}（${loBottles}~${hiBottles} × 矿泉水瓶）`
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
  if (
    resolvedTop === null ||
    resolvedTop === undefined ||
    resolvedBottom === null ||
    resolvedBottom === undefined
  ) {
    return 0
  }
  const avgDiameter = (resolvedTop + resolvedBottom) / 2
  let height = toFiniteNumber(potHeightCm)
  if (height === null) {
    height = avgDiameter * 0.85
  }
  const R = resolvedTop / 2
  const r = resolvedBottom / 2
  return ((Math.PI * height) / 3) * (R * R + R * r + r * r)
}

/**
 * 判定盆体积是否异常偏大（需保存前二次确认）。
 * @param {object} dims 盆型尺寸
 * @returns {boolean}
 */
export function isOversizedPot(dims) {
  return estimatePotVolumeMl(dims) > OVERSIZED_POT_VOLUME_ML
}
