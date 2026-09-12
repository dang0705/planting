'use strict'

/**
 * 蒸腾因素共享 Layer —— 浇水算法 v3。
 *
 * 设计目标：
 *   - 抽象"蒸腾速率"为一个可复用的纯计算模块，与 UI、日期文案、独立浇水结果解耦。
 *   - 仅产出"间隔修正系数" intervalFactor（用于缩短/拉长下次浇水间隔），
 *     不影响单次浇水毫升数（amountRangeMl 由 hydration-load / pot-geometry 计算）。
 *   - 默认实际运行：返回 bounded intervalFactor；可通过环境变量显式切回影子运行。
 *   - 缺失光照/天气证据按现有中性规则处理（factor=1.0），不擅自放大耗水。
 *
 * 光照复用：
 *   光照暴露计算由 layer/utils/light-exposure.js 提供（诊断与蒸腾共同消费同一模块）。
 *   蒸腾光照分量只消费 light-exposure 的分类指数，不自行读取 UI 字段计算。
 *
 * 输入：
 *   lightEnvironment  - V2 结构化光照输入
 *   weatherDays       - 仅用于读取天气模块已生成的 lightFeatures
 *   weatherSummary    - 复用 plant-user-http 的 buildWeatherSummary 输出（天气分量）
 *   plantStrategy     - 属级策略（可选）：wateringQuantization.dryTolerance / wetTolerance
 *   airEnvironmentEvidence - 空气交换、局部气流和停滞风险的结构化证据
 *   options.shadow    - 默认 false。true=影子运行，仅计算不应用；false=应用 intervalFactor。
 *
 * 输出：
 *   {
 *     intervalFactor: number,     // 实际生效系数（shadow=true 时恒为 1.0）
 *     airFactor: number,          // 空气证据分量，仅用于间隔修正
 *     computedFactor: number,     // 算法计算出的原始系数（观察/审计用）
 *     shadow: boolean,            // 是否影子运行
 *     evidence: { light, weather, air } // 证据来源标记
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
const {
  STRONG_LIGHT_THRESHOLD,
  WEAK_LIGHT_THRESHOLD,
  LIGHT_FACTOR_MAX_ADJUST
} = require('./light-exposure-factors')

const SHADOW_MODE_DEFAULT = false
const FACTOR_MIN = 0.8
const FACTOR_MAX = 1.2
const FACTOR_NEUTRAL = 1.0

const AIR_FACTOR_MIN = 0.94
const AIR_FACTOR_MAX = 1.06

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
 * 光照分量系数——基于共享分类指数。
 * 迁移记录或低置信度记录保持中性，不主动改变浇水间隔。
 */
function resolveLightFactor(
  lightEnvironment = null,
  weatherDays = [],
  { weatherLightFactor, weatherEvidenceInsufficient = false, weatherLightConfidence = '' } = {}
) {
  const exposure = computeLightExposure({
    userLightContext: lightEnvironment || {},
    weatherDays,
    weatherLightFactor,
    weatherEvidenceInsufficient,
    weatherLightConfidence
  })
  if (!exposure || exposure.confidence === 'low') {
    return FACTOR_NEUTRAL
  }
  const index = exposure.estimatedExposureIndex

  let factor = FACTOR_NEUTRAL
  if (index >= STRONG_LIGHT_THRESHOLD) {
    const strength = Math.min(
      1,
      (index - STRONG_LIGHT_THRESHOLD) / Math.max(1 - STRONG_LIGHT_THRESHOLD, 0.01)
    )
    factor -= LIGHT_FACTOR_MAX_ADJUST * strength
  } else if (index < WEAK_LIGHT_THRESHOLD) {
    const weakness = Math.min(1, (WEAK_LIGHT_THRESHOLD - index) / WEAK_LIGHT_THRESHOLD)
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
 * 空气环境只修正 BASELINE 的检查间隔，不改变水量和 WET/DRY Gate。
 * 交换频率、局部气流和停滞风险是不同证据；没有证据时保持中性。
 */
function resolveAirFactor(airEnvironmentEvidence = null) {
  if (!airEnvironmentEvidence || typeof airEnvironmentEvidence !== 'object') {
    return FACTOR_NEUTRAL
  }
  let factor = FACTOR_NEUTRAL
  const exchangeLevel = normalizeText(airEnvironmentEvidence.air_exchange_level).toLowerCase()
  if (exchangeLevel === 'high') {
    factor -= 0.03
  }
  if (exchangeLevel === 'medium') {
    factor -= 0.01
  }
  if (exchangeLevel === 'low') {
    factor += 0.04
  }
  if (airEnvironmentEvidence.stagnation_risk === true) {
    factor += 0.02
  }
  if (airEnvironmentEvidence.local_airflow_present === true) {
    factor -= 0.01
  }
  if (airEnvironmentEvidence.direct_airflow === true) {
    factor -= 0.01
  }
  return Math.max(AIR_FACTOR_MIN, Math.min(AIR_FACTOR_MAX, Math.round(factor * 100) / 100))
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
 * @param {Array} [params.weatherDays] - 逐日天气记录（只读取天气模块预计算的光照特征）
 * @param {number} [params.weatherLightFactor] - weatherLightFactor10d
 * @param {boolean} [params.weatherEvidenceInsufficient] - 天气光照证据是否不足
 * @param {string} [params.weatherLightConfidence] - 天气光照证据置信度
 * @param {object} [params.weatherSummary]  - buildWeatherSummary 输出
 * @param {object} [params.plantStrategy]   - 属级策略，含 wateringQuantization
 * @param {object} [params.airEnvironmentEvidence] - 空气环境证据
 * @param {boolean} [params.shadow]         - 是否影子运行（默认 false）
 * @returns {{ intervalFactor: number, computedFactor: number, airFactor: number, shadow: boolean, evidence: object }}
 */
function computeTranspirationIntervalFactor({
  lightEnvironment = null,
  weatherDays = [],
  weatherLightFactor,
  weatherEvidenceInsufficient = false,
  weatherLightConfidence = '',
  weatherSummary = null,
  plantStrategy = null,
  airEnvironmentEvidence = null,
  shadow = SHADOW_MODE_DEFAULT
} = {}) {
  const lightFactor = resolveLightFactor(lightEnvironment, weatherDays, {
    weatherLightFactor,
    weatherEvidenceInsufficient,
    weatherLightConfidence
  })
  const weatherFactor = resolveWeatherFactor(weatherSummary)
  const airFactor = resolveAirFactor(airEnvironmentEvidence)
  let computed = FACTOR_NEUTRAL
  if (
    lightFactor !== FACTOR_NEUTRAL ||
    weatherFactor !== FACTOR_NEUTRAL ||
    airFactor !== FACTOR_NEUTRAL
  ) {
    computed = clampFactor(lightFactor * 0.5 + weatherFactor * 0.3 + airFactor * 0.2)
  }
  computed = applySpeciesConvergence(computed, plantStrategy)

  const shadowMode = shadow !== false
  return {
    intervalFactor: shadowMode ? FACTOR_NEUTRAL : computed,
    computedFactor: computed,
    airFactor,
    shadow: shadowMode,
    evidence: {
      light: lightFactor !== FACTOR_NEUTRAL,
      weather: weatherFactor !== FACTOR_NEUTRAL,
      air: airFactor !== FACTOR_NEUTRAL
    }
  }
}

/**
 * 读取 shadow 模式开关。
 *
 * 环境变量 WATERING_TRANSPIRATION_ENABLED。
 * 未设置 → shadow=false（默认实际应用）
 * 设置为 false / 0 / off → shadow=true（显式影子运行）
 * 设置为 true / 1 / on → shadow=false（实际应用）
 */
function resolveShadowModeFromEnv(env = process.env) {
  const raw = normalizeText(env && env.WATERING_TRANSPIRATION_ENABLED).toLowerCase()
  if (!raw) {
    return false
  }
  return ['0', 'false', 'off', 'no', 'disabled'].includes(raw)
}

module.exports = {
  computeTranspirationIntervalFactor,
  resolveLightFactor,
  resolveWeatherFactor,
  resolveAirFactor,
  applySpeciesConvergence,
  resolveShadowModeFromEnv,
  SHADOW_MODE_DEFAULT,
  FACTOR_MIN,
  FACTOR_MAX,
  FACTOR_NEUTRAL
}
