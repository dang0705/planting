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
 * 输入：
 *   lightEnvironment  - 结构化光照输入 { facing, windowType, position, hasDirectSun, distance }
 *                       保留现有结构，不得改成简单 low/medium/high。
 *   weatherSummary    - 复用 plant-user-http 的 buildWeatherSummary 输出，
 *                       至少包含 highHumidityDays / hotDryDays / coldHumidDays / rainyDays
 *                       及对应 maxConsecutive* 字段。
 *   plantStrategy     - 属级策略（可选）：wateringQuantization.dryTolerance / wetTolerance
 *                       用于在喜干植物上对蒸腾修正做保守收敛。
 *   options.shadow    - 默认 true。true=影子运行，仅计算不应用；false=应用 intervalFactor。
 *
 * 输出：
 *   {
 *     intervalFactor: number,     // 实际生效系数（shadow=true 时恒为 1.0）
 *     computedFactor: number,     // 算法计算出的原始系数（观察/审计用）
 *     shadow: boolean,            // 是否影子运行
 *     evidence: { light, weather } // 证据来源标记，便于调试
 *   }
 *
 * 系数语义：
 *   - intervalFactor < 1.0：蒸腾偏快 → 土壤干得更快 → 间隔缩短
 *   - intervalFactor > 1.0：蒸腾偏慢 → 土壤干得更慢 → 间隔拉长
 *   - 限定范围 [0.8, 1.2]，避免极端修正
 *
 * 纯函数，无 DB、无外部 IO。
 */

const SHADOW_MODE_DEFAULT = true
const FACTOR_MIN = 0.8
const FACTOR_MAX = 1.2
const FACTOR_NEUTRAL = 1.0

const MEANINGFUL_FACING_KEYS = new Set([
  'north',
  'north_east',
  'east',
  'south_east',
  'south',
  'south_west',
  'west',
  'north_west'
])

const MEANINGFUL_WINDOW_KEYS = new Set(['standard', 'no_window', 'grow_light'])
const MEANINGFUL_POSITION_KEYS = new Set(['window_side', 'middle', 'deep'])

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

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

/**
 * 判断光照环境对象是否包含有效信号（朝向/窗型/摆放/距离/直射光）。
 * 与前端 src/utils/light-environment.js hasMeaningfulLightEnvironment 保持口径一致。
 */
function hasMeaningfulLightEnvironment(env = null) {
  if (!env || typeof env !== 'object') {
    return false
  }
  const facing = normalizeText(env.facing).toLowerCase()
  if (MEANINGFUL_FACING_KEYS.has(facing)) {
    return true
  }
  const windowType = normalizeText(env.windowType).toLowerCase()
  if (MEANINGFUL_WINDOW_KEYS.has(windowType)) {
    return true
  }
  const position = normalizeText(env.position).toLowerCase()
  if (MEANINGFUL_POSITION_KEYS.has(position)) {
    return true
  }
  if (env.hasDirectSun === true) {
    return true
  }
  const distance = Number(env.distance)
  if (Number.isFinite(distance)) {
    return true
  }
  return false
}

/**
 * 光照分量系数。
 *
 * 保留结构化光照输入，按 facing/windowType/position/hasDirectSun/distance 综合判定：
 *   - 强直射 + 西/南/阳台朝向：蒸腾加快（factor < 1.0）
 *   - 无窗 / grow_light：蒸腾放慢（factor > 1.0）
 *   - 北向无直射：轻微放慢
 *   - 摆放深度（deep）：放慢
 *   - 距窗 >2m：放慢
 *   - 缺失关键证据：返回 1.0（中性）
 *
 * 任何无法识别的组合都返回 1.0，不擅自放大耗水。
 */
function resolveLightFactor(lightEnvironment = null) {
  if (!hasMeaningfulLightEnvironment(lightEnvironment)) {
    return FACTOR_NEUTRAL
  }
  const facing = normalizeText(lightEnvironment.facing).toLowerCase()
  const windowType = normalizeText(lightEnvironment.windowType).toLowerCase()
  const position = normalizeText(lightEnvironment.position).toLowerCase()
  const hasDirectSun = lightEnvironment.hasDirectSun === true
  const distance = toFiniteNumber(lightEnvironment.distance, Number.NaN)

  // 无窗或人工补光：环境几乎无自然蒸腾驱动
  if (windowType === 'no_window') {
    return 1.1
  }
  if (windowType === 'grow_light') {
    return 1.05
  }

  let factor = FACTOR_NEUTRAL

  // 直射 + 强光朝向：蒸腾显著加快
  if (hasDirectSun && ['west', 'south', 'south_west', 'south_east'].includes(facing)) {
    factor -= 0.12
  } else if (hasDirectSun && ['east', 'north_east', 'south_east'].includes(facing)) {
    // 东向直射：温和加快
    factor -= 0.06
  } else if (facing === 'north' || facing === 'north_east' || facing === 'north_west') {
    // 北向无强直射：轻微放慢
    factor += 0.04
  }

  // 摆放位置：越深入房间蒸腾越慢
  if (position === 'deep') {
    factor += 0.05
  } else if (position === 'window_side') {
    factor -= 0.02
  }

  // 距窗距离（米）：>2m 视为远离光源
  if (Number.isFinite(distance)) {
    if (distance >= 3) {
      factor += 0.06
    } else if (distance >= 2) {
      factor += 0.03
    } else if (distance <= 1) {
      factor -= 0.02
    }
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

  // 无任何天气证据时返回中性
  if (highHumidityDays === 0 && hotDryDays === 0 && rainyDays === 0 && coldHumidDays === 0) {
    return FACTOR_NEUTRAL
  }

  let factor = FACTOR_NEUTRAL
  // 热干加快蒸腾（每 2 天 -0.02，最多 -0.08）
  if (hotDryDays > 0) {
    factor -= Math.min(0.08, Math.floor(hotDryDays / 2) * 0.02)
  }
  // 高湿抑制蒸腾（每 2 天 +0.02，最多 +0.08）
  if (highHumidityDays > 0) {
    factor += Math.min(0.08, Math.floor(highHumidityDays / 2) * 0.02)
  }
  // 冷湿抑制蒸腾（每 2 天 +0.02，最多 +0.06）
  if (coldHumidDays > 0) {
    factor += Math.min(0.06, Math.floor(coldHumidDays / 2) * 0.02)
  }
  // 雨天抑制蒸腾（每 3 天 +0.01，最多 +0.04）
  if (rainyDays > 0) {
    factor += Math.min(0.04, Math.floor(rainyDays / 3) * 0.01)
  }
  return clampFactor(factor)
}

/**
 * 属级植物策略对蒸腾系数的保守收敛。
 *
 * 喜干植物（dryTolerance='high'）：本身偏好干燥，蒸腾加快不应让间隔过短，
 * 收敛幅度向 1.0 靠近 50%。
 * 喜湿植物（wetTolerance='high'）：本身偏好湿润，蒸腾放慢不应让间隔过长，
 * 收敛幅度向 1.0 靠近 50%。
 *
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
 * @param {object} [params.weatherSummary]  - buildWeatherSummary 输出
 * @param {object} [params.plantStrategy]   - 属级策略，含 wateringQuantization
 * @param {boolean} [params.shadow]         - 是否影子运行（默认 true）
 * @returns {{ intervalFactor: number, computedFactor: number, shadow: boolean, evidence: object }}
 */
function computeTranspirationIntervalFactor({
  lightEnvironment = null,
  weatherSummary = null,
  plantStrategy = null,
  shadow = SHADOW_MODE_DEFAULT
} = {}) {
  const lightFactor = resolveLightFactor(lightEnvironment)
  const weatherFactor = resolveWeatherFactor(weatherSummary)
  // 光照与天气的合成：加权平均（光照权重 0.6，天气权重 0.4）
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
 * 使用现有配置方式：环境变量 WATERING_TRANSPIRATION_ENABLED。
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
  hasMeaningfulLightEnvironment,
  resolveShadowModeFromEnv,
  SHADOW_MODE_DEFAULT,
  FACTOR_MIN,
  FACTOR_MAX,
  FACTOR_NEUTRAL
}
