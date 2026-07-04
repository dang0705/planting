'use strict'

/**
 * 矿泉水瓶度量 + 落档动态化 —— 浇水提醒算法 v2.1（Task 5）。
 *
 * 职责：
 *   1. 把绝对水量 ml 换算成用户易懂的「约 X 瓶矿泉水」文案（550ml/瓶，0.5 瓶粒度）。
 *   2. 按「水量占盆体积百分比」动态落档（解决固定 30/80/300ml 阈值对大小盆偏差的问题）。
 *   3. 录入侧用户填写的绝对 ml 反推相对档（喂给算法权重表）。
 *
 * 纯函数，无 DB、无外部 IO；前端有镜像实现 src/utils/water-volume-format.js。
 */

const BOTTLE_ML = 550

/** 5 升油桶（大水量计量单位）。 */
const BUCKET_ML = 5000

/**
 * 浇水量分级（与 hydration-load.DOSE_CLASS 保持一致）。
 */
const DOSE_CLASS = Object.freeze({
  UNKNOWN: 'unknown',
  MIST: 'mist',
  SMALL: 'small',
  NORMAL: 'normal',
  THOROUGH: 'thorough'
})

/**
 * 按盆体积百分比落档的分界线（占盆体积比例）。
 */
const VOLUME_RATIO_THRESHOLDS = Object.freeze({
  MIST_MAX: 0.05,
  SMALL_MAX: 0.15,
  NORMAL_MAX: 0.4
})

/**
 * 无盆体积时的固定 ml 兜底阈值（沿用旧逻辑，保证向后兼容）。
 */
const FIXED_ML_THRESHOLDS = Object.freeze({
  MIST_MAX: 30,
  SMALL_MAX: 80,
  NORMAL_MAX: 300
})

/** 低于此 ml 视为"喷一喷"，不换算瓶数。 */
const MIST_TEXT_MAX_ML = 50
/** ≥ 5000ml（5 升）改用「约 N 桶」油桶计量。 */
const BUCKET_TEXT_MIN_ML = BUCKET_ML

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * 把绝对水量 ml 换算成用户可读文案。
 *
 * - ≤0：无需浇水
 * - ≤50ml：喷一喷
 * - 50 ~ 5000ml：就近 0.5 瓶粒度矿泉水瓶，如「约半瓶(275ml)」「约1瓶(550ml)」
 * - ≥5000ml：改用 5 升油桶计量，四舍五入「约 N 桶（5升油桶，约 X ml）」
 *
 * @param {number} ml
 * @returns {string}
 */
function formatMlToBottleText(ml) {
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
  // 就近 0.5 瓶粒度
  const bottles = Math.round((value / BOTTLE_ML) * 2) / 2
  const roundedMl = Math.round(value)
  if (bottles <= 0.5) {
    return `约半瓶（${roundedMl}ml）`
  }
  // 去掉整数末尾 .0，如 1.0 → 1
  const bottleLabel = Number.isInteger(bottles) ? String(bottles) : String(bottles)
  return `约${bottleLabel}瓶（${roundedMl}ml）`
}

/**
 * 按「水量占盆体积百分比」落档；无盆体积时 fallback 到固定 ml 阈值。
 *
 * @param {number} ml - 单次水量
 * @param {number} potVolumeMl - 盆体积（≤0 或非法视为无体积）
 * @returns {string} DOSE_CLASS
 */
function classifyDoseByVolumeRatio(ml, potVolumeMl) {
  const amount = toFiniteNumber(ml)
  if (amount === null || amount <= 0) {
    return DOSE_CLASS.MIST
  }
  const volume = toFiniteNumber(potVolumeMl)
  if (volume === null || volume <= 0) {
    // 无盆体积：固定 ml 阈值兜底
    if (amount <= FIXED_ML_THRESHOLDS.MIST_MAX) {
      return DOSE_CLASS.MIST
    }
    if (amount <= FIXED_ML_THRESHOLDS.SMALL_MAX) {
      return DOSE_CLASS.SMALL
    }
    if (amount <= FIXED_ML_THRESHOLDS.NORMAL_MAX) {
      return DOSE_CLASS.NORMAL
    }
    return DOSE_CLASS.THOROUGH
  }
  const ratio = amount / volume
  if (ratio <= VOLUME_RATIO_THRESHOLDS.MIST_MAX) {
    return DOSE_CLASS.MIST
  }
  if (ratio <= VOLUME_RATIO_THRESHOLDS.SMALL_MAX) {
    return DOSE_CLASS.SMALL
  }
  if (ratio <= VOLUME_RATIO_THRESHOLDS.NORMAL_MAX) {
    return DOSE_CLASS.NORMAL
  }
  return DOSE_CLASS.THOROUGH
}

/**
 * 录入侧：把用户填写的绝对 ml 反推相对档（喂给算法权重表）。
 * 与落档同一套百分比规则；非法 ml 返回 unknown。
 *
 * @param {number} ml
 * @param {number} potVolumeMl
 * @returns {string} DOSE_CLASS
 */
function resolveMlToDoseClass(ml, potVolumeMl) {
  const amount = toFiniteNumber(ml)
  if (amount === null || amount < 0) {
    return DOSE_CLASS.UNKNOWN
  }
  if (amount === 0) {
    return DOSE_CLASS.UNKNOWN
  }
  return classifyDoseByVolumeRatio(amount, potVolumeMl)
}

/**
 * 把水量区间 [minMl, maxMl] 换算成瓶数文案。
 *
 * - [0,0] → 暂停提示
 * - 下限 ≤ 50ml（喷雾级）或上下限差 ≤ 50ml → 退回单值（取上限）
 * - 区间都在油桶级（≥5000ml）→ 「约{min}~{max}桶」
 * - 区间都在瓶级（50~5000ml）→ 「约{min}~{max}瓶」
 * - 区间跨瓶/桶级 → 「约{min}ml~{max}ml」（不跨单位换算，保留原始 ml）
 *
 * @param {number[]} rangeMl
 * @returns {string}
 */
function formatMlRangeToBottleText(rangeMl) {
  if (!Array.isArray(rangeMl) || rangeMl.length < 2) {
    return '暂无建议水量'
  }
  const lower = toFiniteNumber(rangeMl[0])
  const upper = toFiniteNumber(rangeMl[1])
  if (upper === null || upper <= 0) {
    return '暂停浇水'
  }
  // 区间跨度足够大且下限非喷雾级时，输出区间文案
  if (lower !== null && lower > MIST_TEXT_MAX_ML && (upper - lower) > MIST_TEXT_MAX_ML) {
    // 都在油桶级（≥5000ml）→ 换算桶数
    if (lower >= BUCKET_TEXT_MIN_ML) {
      const loBuckets = Math.max(1, Math.round(lower / BUCKET_ML))
      const hiBuckets = Math.max(loBuckets, Math.round(upper / BUCKET_ML))
      return `约${loBuckets}~${hiBuckets}桶（5升油桶）`
    }
    // 都在瓶级（50~5000ml）→ 换算瓶数（0.5瓶粒度）
    if (upper < BUCKET_TEXT_MIN_ML) {
      const loBottles = Math.max(0.5, Math.round((lower / BOTTLE_ML) * 2) / 2)
      const hiBottles = Math.max(loBottles, Math.round((upper / BOTTLE_ML) * 2) / 2)
      // 瓶数相同时退回单值
      if (loBottles === hiBottles) {
        return formatMlToBottleText(upper)
      }
      return `约${loBottles}~${hiBottles}瓶（${Math.round(lower)}~${Math.round(upper)}ml）`
    }
    // 跨瓶/桶级 → 保留原始 ml
    return `约${Math.round(lower)}~${Math.round(upper)}ml`
  }
  return formatMlToBottleText(upper)
}

module.exports = {
  BOTTLE_ML,
  DOSE_CLASS,
  VOLUME_RATIO_THRESHOLDS,
  FIXED_ML_THRESHOLDS,
  formatMlToBottleText,
  formatMlRangeToBottleText,
  classifyDoseByVolumeRatio,
  resolveMlToDoseClass
}
