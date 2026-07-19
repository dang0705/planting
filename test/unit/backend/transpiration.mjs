'use strict'

/**
 * 蒸腾因素 + 光照暴露共享 Layer 纯函数测试 —— 浇水算法 v3。
 *
 * 覆盖：
 *   - 默认影子运行：intervalFactor 恒为 1.0，computedFactor 仅供审计
 *   - 缺失光照/天气证据时返回中性 1.0（不擅自放大耗水）
 *   - 光照分量：复用 light-exposure 的 indoorEqHours，强光 → 蒸腾加快，弱光 → 蒸腾放慢
 *   - 天气分量：热干天数多 → 蒸腾加快；高湿/冷湿/雨天 → 蒸腾放慢
 *   - 属级策略收敛：喜干植物 dryTolerance=high → 蒸腾加快幅度减半
 *   - 系数范围限定 [0.8, 1.2]
 *   - resolveShadowModeFromEnv：环境变量 WATERING_TRANSPIRATION_ENABLED 控制
 *   - 行为断言：diagnose-http estimator 实际消费 computeLightExposure 结果
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  computeTranspirationIntervalFactor,
  resolveLightFactor,
  resolveWeatherFactor,
  applySpeciesConvergence,
  resolveShadowModeFromEnv,
  SHADOW_MODE_DEFAULT,
  FACTOR_MIN,
  FACTOR_MAX,
  FACTOR_NEUTRAL
} = require('../../../cloudfunctions/layer/utils/transpiration.js')

const { computeLightExposure } = require('../../../cloudfunctions/layer/utils/light-exposure.js')

const {
  estimateLightHealth,
  normalizeLightProfile
} = require('../../../cloudfunctions/diagnose-http/utils/light-health-estimator.js')

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`✓ ${name}`)
    } catch (error) {
      console.error(`✗ ${name}`)
      throw error
    }
  }
  console.log('transpiration layer tests passed')
}

/* ============================================================
 * 1. 默认影子运行
 * ============================================================ */

test('shadow mode default: intervalFactor 恒为 1.0，computedFactor 仅供审计', () => {
  const result = computeTranspirationIntervalFactor({
    lightEnvironment: {
      facing: 'south',
      windowType: 'standard',
      hasDirectSun: true,
      position: 'window_side',
      distance: 1
    },
    weatherSummary: { hotDryDays: 6, highHumidityDays: 0, coldHumidDays: 0, rainyDays: 0 },
    plantStrategy: null,
    shadow: true
  })
  assert.equal(result.intervalFactor, 1.0, '影子运行时 intervalFactor 必须为 1.0')
  assert.equal(result.shadow, true)
  assert.ok(result.computedFactor < 1.0, 'computedFactor 应反映蒸腾加快（< 1.0），仅供审计')
})

test('shadow mode default constant is true', () => {
  assert.equal(SHADOW_MODE_DEFAULT, true)
})

/* ============================================================
 * 2. 缺失证据返回中性
 * ============================================================ */

test('缺失光照和天气证据时返回中性 1.0', () => {
  const result = computeTranspirationIntervalFactor({
    lightEnvironment: null,
    weatherSummary: null,
    plantStrategy: null,
    shadow: false
  })
  assert.equal(result.intervalFactor, 1.0)
  assert.equal(result.computedFactor, 1.0)
  assert.equal(result.evidence.light, false)
  assert.equal(result.evidence.weather, false)
})

test('天气摘要为空对象时返回中性', () => {
  assert.equal(resolveWeatherFactor({}), 1.0)
  assert.equal(resolveWeatherFactor(null), 1.0)
})

test('光照环境无有效字段时返回中性', () => {
  assert.equal(resolveLightFactor({}), 1.0)
  assert.equal(resolveLightFactor(null), 1.0)
  assert.equal(resolveLightFactor({ facing: '', windowType: '' }), 1.0)
})

/* ============================================================
 * 3. 光照分量（复用 light-exposure）
 * ============================================================ */

test('强直射 + 南向：蒸腾加快（factor < 1.0）', () => {
  const factor = resolveLightFactor({
    facing: 'south',
    windowType: 'standard',
    hasDirectSun: true,
    position: 'window_side',
    distance: 0.5
  })
  assert.ok(factor < 1.0, `南向直射蒸腾应加快，got ${factor}`)
})

test('无窗环境：蒸腾放慢（factor > 1.0）', () => {
  const factor = resolveLightFactor({ windowType: 'no_window' })
  assert.ok(factor > 1.0, `无窗蒸腾应放慢，got ${factor}`)
})

test('摆放深度 deep：蒸腾放慢', () => {
  const factorDeep = resolveLightFactor({ facing: 'east', position: 'deep' })
  const factorWindow = resolveLightFactor({ facing: 'east', position: 'window_side' })
  assert.ok(factorDeep > factorWindow, 'deep 位置蒸腾应比 window_side 慢')
})

test('距窗 >2m：蒸腾放慢', () => {
  const factor = resolveLightFactor({ facing: 'east', distance: 3 })
  const factorClose = resolveLightFactor({ facing: 'east', distance: 1 })
  assert.ok(factor > factorClose, '距窗 3m 蒸腾应比 1m 慢')
})

test('light-exposure computeLightExposure 对南向直射返回有效 indoorEqHours', () => {
  const exposure = computeLightExposure({
    userLightContext: {
      facing: 'south',
      windowType: 'standard',
      hasDirectSun: true,
      position: 'window_side',
      distance: 0.5
    },
    weatherDays: [{ date: '2026-07-01', sunshineHours: 8, uvIndex: 8, weatherText: '晴' }]
  })
  assert.ok(exposure, '应返回有效 exposure 结果')
  assert.ok(
    exposure.indoorEqHours > 4,
    `南向直射 indoorEqHours 应 > 4，got ${exposure.indoorEqHours}`
  )
})

/* ============================================================
 * 4. 天气分量
 * ============================================================ */

test('热干天数多：蒸腾加快（factor < 1.0）', () => {
  const factor = resolveWeatherFactor({
    hotDryDays: 6,
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 0
  })
  assert.ok(factor < 1.0, `热干天数多蒸腾应加快，got ${factor}`)
})

test('高湿天数多：蒸腾放慢（factor > 1.0）', () => {
  const factor = resolveWeatherFactor({
    hotDryDays: 0,
    highHumidityDays: 6,
    coldHumidDays: 0,
    rainyDays: 0
  })
  assert.ok(factor > 1.0, `高湿天数多蒸腾应放慢，got ${factor}`)
})

test('冷湿天数多：蒸腾放慢（factor > 1.0）', () => {
  const factor = resolveWeatherFactor({
    hotDryDays: 0,
    highHumidityDays: 0,
    coldHumidDays: 4,
    rainyDays: 0
  })
  assert.ok(factor > 1.0, `冷湿天数多蒸腾应放慢，got ${factor}`)
})

test('雨天多：蒸腾放慢（factor > 1.0）', () => {
  const factor = resolveWeatherFactor({
    hotDryDays: 0,
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 6
  })
  assert.ok(factor > 1.0, `雨天多蒸腾应放慢，got ${factor}`)
})

/* ============================================================
 * 5. 属级策略收敛
 * ============================================================ */

test('喜干植物 dryTolerance=high：蒸腾加快幅度向 1.0 收敛 50%', () => {
  const factor = 0.88
  const converged = applySpeciesConvergence(factor, {
    wateringQuantization: { dryTolerance: 'high', wetTolerance: 'normal' }
  })
  assert.ok(converged > factor, '喜干植物蒸腾加快幅度应被收敛')
  assert.ok(converged <= 1.0, '收敛后不应超过 1.0')
})

test('喜湿植物 wetTolerance=high：蒸腾放慢幅度向 1.0 收敛 50%', () => {
  const factor = 1.12
  const converged = applySpeciesConvergence(factor, {
    wateringQuantization: { dryTolerance: 'normal', wetTolerance: 'high' }
  })
  assert.ok(converged < factor, '喜湿植物蒸腾放慢幅度应被收敛')
  assert.ok(converged >= 1.0, '收敛后不应低于 1.0')
})

test('无 wateringQuantization 时不收敛', () => {
  const factor = 0.88
  const converged = applySpeciesConvergence(factor, null)
  assert.equal(converged, factor)
})

/* ============================================================
 * 6. 系数范围限定
 * ============================================================ */

test('所有系数在 [0.8, 1.2] 范围内', () => {
  assert.equal(FACTOR_MIN, 0.8)
  assert.equal(FACTOR_MAX, 1.2)
  assert.equal(FACTOR_NEUTRAL, 1.0)

  const extreme = resolveLightFactor({
    facing: 'south',
    hasDirectSun: true,
    position: 'window_side',
    distance: 0.5
  })
  assert.ok(extreme >= FACTOR_MIN && extreme <= FACTOR_MAX)

  const extremeWeather = resolveWeatherFactor({
    hotDryDays: 30,
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 0
  })
  assert.ok(extremeWeather >= FACTOR_MIN && extremeWeather <= FACTOR_MAX)
})

/* ============================================================
 * 7. resolveShadowModeFromEnv
 * ============================================================ */

test('WATERING_TRANSPIRATION_ENABLED 未设置 → shadow=true', () => {
  assert.equal(resolveShadowModeFromEnv({}), true)
  assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: '' }), true)
})

test('WATERING_TRANSPIRATION_ENABLED=false/0/off → shadow=true', () => {
  assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: 'false' }), true)
  assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: '0' }), true)
  assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: 'off' }), true)
})

test('WATERING_TRANSPIRATION_ENABLED=true/1/on → shadow=false', () => {
  assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: 'true' }), false)
  assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: '1' }), false)
  assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: 'on' }), false)
})

/* ============================================================
 * 8. 行为断言：estimator 实际消费 computeLightExposure 结果
 *    固定输入下 diagnosis evidence 与 computeLightExposure 关键字段一致
 * ============================================================ */

test('estimator 消费 computeLightExposure：固定输入下 indoorEqHours/factors/uvFactor 一致', () => {
  const plantContext = { sunning: { way: '明亮散射光', freq: [2, 4], unit: '小时/天' } }
  const userLightContext = {
    facing: 'south',
    windowType: 'standard',
    hasDirectSun: true,
    position: 'window_side',
    distance: 0.5
  }
  const weatherDays = [
    { date: '2026-07-01', sunshineHours: 8, uvIndex: 8, weatherText: '晴' },
    { date: '2026-07-02', sunshineHours: 7, uvIndex: 7, weatherText: '晴' }
  ]

  // 直接调用共享 Layer
  const exposure = computeLightExposure({ userLightContext, weatherDays })

  // 调用 estimator（诊断侧）
  const diagnosis = estimateLightHealth({
    plantContext,
    userLightContext,
    weatherDays,
    plantFeatures: {},
    weatherEvidenceInsufficient: false
  })

  assert.ok(exposure, 'computeLightExposure 应返回有效结果')
  assert.ok(diagnosis, 'estimateLightHealth 应返回有效结果')

  // 关键字段一致：estimator 消费了共享 Layer 的结果
  assert.equal(
    diagnosis.lightHealthEvidence.calculation.indoorEqHours,
    exposure.indoorEqHours,
    'indoorEqHours 应与共享 Layer 结果一致'
  )
  assert.equal(
    diagnosis.lightHealthEvidence.factors.indoorFactor,
    exposure.factors.indoorFactor,
    'indoorFactor 应与共享 Layer 结果一致'
  )
  assert.equal(
    diagnosis.lightHealthEvidence.factors.directSunExposureHours,
    exposure.factors.directSunExposureHours,
    'directSunExposureHours 应与共享 Layer 结果一致'
  )
  assert.equal(
    diagnosis.lightHealthEvidence.weather.uvFactor,
    exposure.uvFactor,
    'uvFactor 应与共享 Layer 结果一致'
  )
  assert.equal(
    diagnosis.lightHealthEvidence.weather.outdoorEqHours,
    exposure.outdoorEqHours,
    'outdoorEqHours 应与共享 Layer 结果一致'
  )
  assert.equal(
    diagnosis.lightHealthEvidence.weather.baseOutdoorHours,
    exposure.baseOutdoorHours.value,
    'baseOutdoorHours 应与共享 Layer 结果一致'
  )
  assert.equal(
    diagnosis.lightHealthEvidence.weather.days,
    exposure.weatherDaysCount,
    'weather days count 应与共享 Layer 结果一致'
  )
})

test('estimator 消费 computeLightExposure：弱光场景 indoorEqHours 一致且 direction=low', () => {
  const plantContext = { sunning: { way: '明亮散射光', freq: [2, 4], unit: '小时/天' } }
  const userLightContext = {
    facing: '无窗',
    windowType: '无窗',
    position: '远离窗户',
    hasDirectSun: false,
    distance: 10
  }

  const exposure = computeLightExposure({ userLightContext, weatherDays: [] })
  const diagnosis = estimateLightHealth({
    plantContext,
    userLightContext,
    weatherDays: [],
    plantFeatures: {},
    weatherEvidenceInsufficient: false
  })

  assert.ok(exposure, 'computeLightExposure 应返回有效结果')
  assert.ok(diagnosis, 'estimateLightHealth 应返回有效结果')
  assert.equal(
    diagnosis.lightHealthEvidence.calculation.indoorEqHours,
    exposure.indoorEqHours,
    '弱光 indoorEqHours 应与共享 Layer 一致'
  )
  assert.equal(diagnosis.lightHealthEvidence.direction, 'low', '弱光场景 direction 应为 low')
})

test('estimator 不保留手工重算的 baseOutdoorHours/uvFactor/indoorFactor 公式', () => {
  const estimatorSrc = require('fs').readFileSync(
    'cloudfunctions/diagnose-http/utils/light-health-estimator.js',
    'utf8'
  )
  // estimator 不应手工组装 indoorEqHours 公式
  assert.ok(
    !estimatorSrc.includes('outdoorEqHours * indoorFactor'),
    'estimator 不应手工重算 indoorEqHours 公式，应消费 computeLightExposure 结果'
  )
  assert.ok(
    !estimatorSrc.includes('estimateBaseOutdoorHours(weatherDays)'),
    'estimator 不应直接调用 estimateBaseOutdoorHours，应通过 computeLightExposure 间接消费'
  )
  assert.ok(estimatorSrc.includes('computeLightExposure'), 'estimator 应调用 computeLightExposure')
})

await runAll()
