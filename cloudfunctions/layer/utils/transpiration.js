'use strict'

/**
 * 蒸腾因素共享 Layer —— 浇水算法 v3。
 *
 * 设计目标：
 *   - 抽象"蒸腾速率"为一个可复用的纯计算模块，与 UI、日期文案、独立浇水结果解耦。
 *   - 仅产出"间隔修正系数" intervalFactor（用于缩短/拉长下次浇水间隔），
 *     不影响单次浇水毫升数（amountRangeMl 由 hydration-load / pot-geometry 计算）。
 *   - 默认影子运行（shadow=true）：返回 intervalFactor=1.0，仅返回 computedFactor 用于观察。
 *   - 缺失光照/天气证据按现有中性规则处理（factor=1.0），不擅自放大耗水。
 *
 * 光照复用：
 *   光照暴露计算由 layer/utils/light-exposure.js 提供（诊断与蒸腾共同消费同一模块）。
 *   蒸腾光照分量基于 indoorEqHours（含天气/UV 证据的最终暴露量）推导，
 *   而非 indoorFactor（仅室内衰减率），使晴天/阴天得到不同的蒸腾系数。
 *
 * 输入：
 *   lightEnvironment  - 结构化光照输入 { facing, windowType, position, hasDirectSun, distance }
 *   weatherDays       - 逐日天气记录（传给 computeLightExposure 计算 outdoorEqHours/uvFactor）
 *   weatherSummary    - 复用 plant-user-http 的 buildWeatherSummary 输出（天气分量）
 *   plantStrategy     - 属级策略（可选）：wateringQuantization.dryTolerance / wetTolerance
 *   options.shadow    - 默认 true。true=影子运行，仅计算不应用；false=应用 intervalFactor。
 *
 * 输出：
 *   {
 *     intervalFactor: number,     // 实际生效系数（shadow=true 时恒为 1.0）
 *     computedFactor: number,     // 算法计算出的原始系数（观察/审计用）
 *     shadow: boolean,            // 是否影子运行
 *     evidence: { light, weather } // 证据来源标记
 *   }
 *
 * 系数语义：
 *   - intervalFactor < 1.0：蒸腾偏快 → 土壤干得更快 → 间隔缩短
 *   - intervalFactor > 1.0：蒸腾偏慢 → 土壤干得更慢 → 间隔拉长
 *   - 限定范围 [0.8, 1.2]，避免极端修正
 *
 * 纯函数，无 DB、无外部 IO。
 */

const { computeLightExposure } = require('./light-exposure')

const SHADOW_MODE_DEFAULT = true
const FACTOR_MIN = 0.8
const FACTOR_MAX = 1.2
const FACTOR_NEUTRAL = 1.0

/**
 * indoorEqHours 与蒸腾系数的映射基准。
 *
 * indoorEqHours 是包含天气/UV 证据的最终光照暴露量（小时/天）：
 *   - 典型室内植物需求 4-6 小时/天（DEFAULT_PROFILE.freq）
 *   - indoorEqHours > 6：强光 → 蒸腾加快（factor < 1.0）
 *   - indoorEqHours < 3：弱光 → 蒸腾放慢（factor > 1.0）
 *   - 缺失天气证据时 indoorEqHours 基于中性 weatherLightFactor=1.0 计算
 */
const INDOOR_EQ_HOURS_STRONG_THRESHOLD = 6
const INDOOR_EQ_HOURS_WEAK_THRESHOLD = 3
const LIGHT_FACTOR_MAX_ADJUST = 0.12

function toFiniteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function clampFactor(value) {
  if (!Number.isFinite(value)) {
    return FACTOR_NEUTRAL
  }
  return Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, Math.round(value * 100) / 100))
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

/**
 * 光照分量系数——基于共享 light-exposure 的 indoorEqHours 推导。
 *
 * 复用 layer/utils/light-exposure.js 的 computeLightExposure，
 * 消费包含天气/UV 证据的最终暴露量 indoorEqHours。
 * indoorEqHours 高（强光）→ 蒸腾加快（factor < 1.0）；
 * indoorEqHours 低（弱光）→ 蒸腾放慢（factor > 1.0）。
 * 缺失光照证据：返回 1.0（中性）。
 *
 * @param {object} lightEnvironment - 结构化光照输入
 * @param {Array} [weatherDays] - 逐日天气记录（传给 computeLightExposure）
 */
function resolveLightFactor(lightEnvironment = null, weatherDays = []) {
  const exposure = computeLightExposure({
    userLightContext: lightEnvironment || {},
    weatherDays
  })
  if (!exposure) {
    return FACTOR_NEUTRAL
  }
  const indoorEqHours = exposure.indoorEqHours

  let factor = FACTOR_NEUTRAL
  if (indoorEqHours >= INDOOR_EQ_HOURS_STRONG_THRESHOLD) {
    const lightIntensity = Math.min(1, (indoorEqHours - INDOOR_EQ_HOURS_STRONG_THRESHOLD) / 4)
    factor -= LIGHT_FACTOR_MAX_ADJUST * lightIntensity
  } else if (indoorEqHours < INDOOR_EQ_HOURS_WEAK_THRESHOLD) {
    const weakness = Math.min(
      1,
      (INDOOR_EQ_HOURS_WEAK_THRESHOLD - indoorEqHours) / INDOOR_EQ_HOURS_WEAK_THRESHOLD
    )
    factor += LIGHT_FACTOR_MAX_ADJUST * weakness
  }

  return clampFactor(factor)
}

/**
 * 天气分量系数。复用 buildWeatherSummary 输出，不重新解析原始天气数据。
 *
 *   - 高湿天数多：蒸腾被抑制 → 间隔拉长（factor > 1.0）
 *   - 热干天数多：蒸腾加强 → 间隔缩短（factor < 1.0）
 *   - 雨天多：蒸腾被抑制
 *   - 缺失天气证据：返回 1.0（中性，按现有规则不擅自放大耗水）
 */
function resolveWeatherFactor(weatherSummary = null) {
  if (!weatherSummary || typeof weatherSummary !== 'object') {
    return FACTOR_NEUTRAL
  }
  const highHumidityDays = toFiniteNumber(weatherSummary.highHumidityDays, 0)
  const hotDryDays = toFiniteNumber(weatherSummary.hotDryDays, 0)
  const rainyDays = toFiniteNumber(weatherSummary.rainyDays, 0)
  const coldHumidDays = toFiniteNumber(weatherSummary.coldHumidDays, 0)

  if (highHumidityDays === 0 && hotDryDays === 0 && rainyDays === 0 && coldHumidDays === 0) {
    return FACTOR_NEUTRAL
  }

  let factor = FACTOR_NEUTRAL
  if (hotDryDays > 0) {
    factor -= Math.min(0.08, Math.floor(hotDryDays / 2) * 0.02)
  }
  if (highHumidityDays > 0) {
    factor += Math.min(0.08, Math.floor(highHumidityDays / 2) * 0.02)
  }
  if (coldHumidDays > 0) {
    factor += Math.min(0.06, Math.floor(coldHumidDays / 2) * 0.02)
  }
  if (rainyDays > 0) {
    factor += Math.min(0.04, Math.floor(rainyDays / 3) * 0.01)
  }
  return clampFactor(factor)
}

/**
 * 属级植物策略对蒸腾系数的保守收敛。
 *
 * 喜干植物（dryTolerance='high'）：蒸腾加快不应让间隔过短，收敛幅度向 1.0 靠近 50%。
 * 喜湿植物（wetTolerance='high'）：蒸腾放慢不应让间隔过长，收敛幅度向 1.0 靠近 50%。
 * 缺量化数据时返回原系数。
 */
function applySpeciesConvergence(factor, plantStrategy = null) {
  if (!Number.isFinite(factor) || factor === FACTOR_NEUTRAL) {
    return factor
  }
  const quantization =
    plantStrategy && typeof plantStrategy === 'object'
      ? plantStrategy.wateringQuantization || null
      : null
  if (!quantization || typeof quantization !== 'object') {
    return factor
  }
  const dryTolerance = normalizeText(quantization.dryTolerance).toLowerCase()
  const wetTolerance = normalizeText(quantization.wetTolerance).toLowerCase()
  if (dryTolerance === 'high' && factor < FACTOR_NEUTRAL) {
    return clampFactor(FACTOR_NEUTRAL + (factor - FACTOR_NEUTRAL) * 0.5)
  }
  if (wetTolerance === 'high' && factor > FACTOR_NEUTRAL) {
    return clampFactor(FACTOR_NEUTRAL + (factor - FACTOR_NEUTRAL) * 0.5)
  }
  return factor
}

/**
 * 计算蒸腾间隔修正系数（主入口）。
 *
 * @param {object} params
 * @param {object} [params.lightEnvironment] - 结构化光照输入
 * @param {Array} [params.weatherDays] - 逐日天气记录（传给 computeLightExposure 计算 indoorEqHours）
 * @param {object} [params.weatherSummary]  - buildWeatherSummary 输出
 * @param {object} [params.plantStrategy]   - 属级策略，含 wateringQuantization
 * @param {boolean} [params.shadow]         - 是否影子运行（默认 true）
 * @returns {{ intervalFactor: number, computedFactor: number, shadow: boolean, evidence: object }}
 */
function computeTranspirationIntervalFactor({
  lightEnvironment = null,
  weatherDays = [],
  weatherSummary = null,
  plantStrategy = null,
  shadow = SHADOW_MODE_DEFAULT
} = {}) {
  const lightFactor = resolveLightFactor(lightEnvironment, weatherDays)
  const weatherFactor = resolveWeatherFactor(weatherSummary)
  let computed = FACTOR_NEUTRAL
  if (lightFactor !== FACTOR_NEUTRAL || weatherFactor !== FACTOR_NEUTRAL) {
    computed = clampFactor(lightFactor * 0.6 + weatherFactor * 0.4)
  }
  computed = applySpeciesConvergence(computed, plantStrategy)

  const shadowMode = shadow !== false
  return {
    intervalFactor: shadowMode ? FACTOR_NEUTRAL : computed,
    computedFactor: computed,
    shadow: shadowMode,
    evidence: {
      light: lightFactor !== FACTOR_NEUTRAL,
      weather: weatherFactor !== FACTOR_NEUTRAL
    }
  }
}

/**
 * 读取 shadow 模式开关。
 *
 * 环境变量 WATERING_TRANSPIRATION_ENABLED。
 * 未设置 / 设置为 false / 0 / off → shadow=true（默认影子运行）
 * 设置为 true / 1 / on → shadow=false（实际应用）
 */
function resolveShadowModeFromEnv(env = process.env) {
  const raw = normalizeText(env && env.WATERING_TRANSPIRATION_ENABLED).toLowerCase()
  if (!raw) {
    return true
  }
  return !['1', 'true', 'on', 'yes', 'enabled'].includes(raw)
}

module.exports = {
  computeTranspirationIntervalFactor,
  resolveLightFactor,
  resolveWeatherFactor,
  applySpeciesConvergence,
  resolveShadowModeFromEnv,
  SHADOW_MODE_DEFAULT,
  FACTOR_MIN,
  FACTOR_MAX,
  FACTOR_NEUTRAL
}
