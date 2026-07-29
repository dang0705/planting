'use strict'

/**
 * 浇水提醒算法 v2.1 -- 剂量落档（后端）。
 *
 * 职责：
 *   1. 按「水量占盆体积百分比」动态落档（解决固定 30/80/300ml 阈值对大小盆偏差的问题）。
 *   2. 录入侧用户填写的绝对 ml 反推相对档（喂给算法权重表）。
 *
 * 文案换算已移至前端 src/utils/water-volume-format.js，后端只返回 amountRangeMl（ml 数组）。
 *
 * 纯函数，无 DB、无外部 IO。
 */

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

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
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

module.exports = {
  DOSE_CLASS,
  VOLUME_RATIO_THRESHOLDS,
  FIXED_ML_THRESHOLDS,
  classifyDoseByVolumeRatio,
  resolveMlToDoseClass
}
