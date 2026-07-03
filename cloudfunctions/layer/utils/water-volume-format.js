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
/** 高于此 ml 视为"一大桶"，不再细数瓶。 */
const BUCKET_TEXT_MIN_ML = 2500

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * 把绝对水量 ml 换算成「约 X 瓶」文案（0.5 瓶粒度，附 ml）。
 *
 * - ≤0：无需浇水提示
 * - ≤50ml：喷一喷
 * - ≥2500ml：一大桶
 * - 其余：就近 0.5 瓶粒度，如「约半瓶(275ml)」「约1瓶(550ml)」「约1.5瓶(825ml)」
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
    return `一大桶（约${Math.round(value)}ml）`
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
 * 把水量区间 [minMl, maxMl] 换算成瓶数文案（以上限为准，反映"最多浇到"规模）。
 * [0,0] → 暂停提示；非法 → 安全兜底。
 *
 * @param {number[]} rangeMl
 * @returns {string}
 */
function formatMlRangeToBottleText(rangeMl) {
  if (!Array.isArray(rangeMl) || rangeMl.length < 2) {
    return '暂无建议水量'
  }
  const upper = toFiniteNumber(rangeMl[1])
  if (upper === null || upper <= 0) {
    return '暂停浇水'
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
