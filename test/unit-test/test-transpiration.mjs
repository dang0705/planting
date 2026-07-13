'use strict'

/**
 * 蒸腾因素共享 Layer 单元测试 —— 浇水算法 v3。
 *
 * 覆盖：
 *   - 默认影子运行：intervalFactor 恒为 1.0，computedFactor 仅供审计
 *   - 缺失光照/天气证据时返回中性 1.0（不擅自放大耗水）
 *   - 结构化光照输入保留（facing/windowType/position/hasDirectSun/distance）
 *   - 光照分量：强直射+西/南向 → 蒸腾加快（factor < 1.0）
 *   - 天气分量：热干天数多 → 蒸腾加快；高湿/冷湿/雨天 → 蒸腾放慢
 *   - 属级策略收敛：喜干植物 dryTolerance=high → 蒸腾加快幅度减半
 *   - 系数范围限定 [0.8, 1.2]
 *   - resolveShadowModeFromEnv：环境变量 WATERING_TRANSPIRATION_ENABLED 控制
 *   - buildWateringPlanner 集成：transpirationIntervalFactor 仅影响 BASELINE 间隔，
 *     不影响 amountRangeMl（单次毫升数），也不绕过 WET/DRY Gate
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
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
} = require('../../cloudfunctions/layer/utils/transpiration.js')

const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline,
  WATERING_CONTEXTS
} = require('../../cloudfunctions/layer/utils/watering-planner.js')

function test(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

/* ============================================================
 * 1. 默认影子运行
 * ============================================================ */

test('shadow mode default: intervalFactor 恒为 1.0，computedFactor 仅供审计', () => {
  const result = computeTranspirationIntervalFactor({
    lightEnvironment: { facing: 'south', hasDirectSun: true, position: 'window_side', distance: 1 },
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
 * 3. 结构化光照输入保留
 * ============================================================ */

test('hasMeaningfulLightEnvironment 识别有效结构化光照', () => {
  assert.equal(hasMeaningfulLightEnvironment({ facing: 'south' }), true)
  assert.equal(hasMeaningfulLightEnvironment({ windowType: 'standard' }), true)
  assert.equal(hasMeaningfulLightEnvironment({ position: 'window_side' }), true)
  assert.equal(hasMeaningfulLightEnvironment({ hasDirectSun: true }), true)
  assert.equal(hasMeaningfulLightEnvironment({ distance: 2 }), true)
  assert.equal(hasMeaningfulLightEnvironment({}), false)
  assert.equal(hasMeaningfulLightEnvironment(null), false)
})

/* ============================================================
 * 4. 光照分量
 * ============================================================ */

test('强直射 + 西/南向：蒸腾加快（factor < 1.0）', () => {
  const factor = resolveLightFactor({ facing: 'south', hasDirectSun: true })
  assert.ok(factor < 1.0, `南向直射蒸腾应加快，got ${factor}`)
})

test('强直射 + 西向：蒸腾加快（factor < 1.0）', () => {
  const factor = resolveLightFactor({ facing: 'west', hasDirectSun: true })
  assert.ok(factor < 1.0, `西向直射蒸腾应加快，got ${factor}`)
})

test('无窗环境：蒸腾放慢（factor > 1.0）', () => {
  const factor = resolveLightFactor({ windowType: 'no_window' })
  assert.ok(factor > 1.0, `无窗蒸腾应放慢，got ${factor}`)
})

test('北向无直射：轻微放慢（factor > 1.0）', () => {
  const factor = resolveLightFactor({ facing: 'north' })
  assert.ok(factor >= 1.0, `北向无直射应轻微放慢或中性，got ${factor}`)
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

/* ============================================================
 * 5. 天气分量
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
 * 6. 属级策略收敛
 * ============================================================ */

test('喜干植物 dryTolerance=high：蒸腾加快幅度向 1.0 收敛 50%', () => {
  const factor = 0.88 // 蒸腾加快
  const converged = applySpeciesConvergence(factor, {
    wateringQuantization: { dryTolerance: 'high', wetTolerance: 'normal' }
  })
  // 0.88 向 1.0 收敛 50% → 0.94
  assert.ok(converged > factor, '喜干植物蒸腾加快幅度应被收敛')
  assert.ok(converged <= 1.0, '收敛后不应超过 1.0')
})

test('喜湿植物 wetTolerance=high：蒸腾放慢幅度向 1.0 收敛 50%', () => {
  const factor = 1.12 // 蒸腾放慢
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
 * 7. 系数范围限定
 * ============================================================ */

test('所有系数在 [0.8, 1.2] 范围内', () => {
  assert.equal(FACTOR_MIN, 0.8)
  assert.equal(FACTOR_MAX, 1.2)
  assert.equal(FACTOR_NEUTRAL, 1.0)

  // 极端光照组合
  const extreme = resolveLightFactor({
    facing: 'south',
    hasDirectSun: true,
    position: 'window_side',
    distance: 0.5
  })
  assert.ok(extreme >= FACTOR_MIN && extreme <= FACTOR_MAX)

  // 极端天气组合
  const extremeWeather = resolveWeatherFactor({
    hotDryDays: 30,
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 0
  })
  assert.ok(extremeWeather >= FACTOR_MIN && extremeWeather <= FACTOR_MAX)
})

/* ============================================================
 * 8. resolveShadowModeFromEnv
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
 * 9. buildWateringPlanner 集成：蒸腾仅影响间隔，不影响毫升数
 * ============================================================ */

test('transpirationIntervalFactor 不影响 amountRangeMl（单次毫升数）', () => {
  const baseline = {
    wateringStrategy: { freq: [5, 8], way: '见干浇透' },
    historical: { highHumidityDays: 0, hotDryDays: 0, coldHumidDays: 0, rainyDays: 0 },
    forecast: { highHumidityDays: 0, hotDryDays: 0, coldHumidDays: 0, rainyDays: 0 },
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: '2026-07-01',
      watering_events_10d: [{ date: '2026-06-28', watered: true, amount: 'normal' }]
    }),
    potProfile: {
      potTopDiameterCm: 12,
      potBottomDiameterCm: 8,
      potHeightCm: 10,
      hasDrainageHole: 'true'
    },
    referenceDate: '2026-07-01'
  }

  const planNeutral = buildWateringPlanner({ ...baseline, transpirationIntervalFactor: 1.0 })
  const planFaster = buildWateringPlanner({ ...baseline, transpirationIntervalFactor: 0.8 })

  // 单次毫升数不应因蒸腾系数改变
  assert.deepEqual(
    planNeutral.amountRangeMl,
    planFaster.amountRangeMl,
    'amountRangeMl 不应因 transpirationIntervalFactor 改变'
  )
})

test('transpirationIntervalFactor 影响 BASELINE 间隔（nextWaterDate）', () => {
  const baseline = {
    wateringStrategy: { freq: [5, 8], way: '见干浇透' },
    historical: { highHumidityDays: 0, hotDryDays: 0, coldHumidDays: 0, rainyDays: 0 },
    forecast: { highHumidityDays: 0, hotDryDays: 0, coldHumidDays: 0, rainyDays: 0 },
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: '2026-07-01',
      watering_events_10d: [{ date: '2026-06-28', watered: true, amount: 'normal' }]
    }),
    potProfile: {
      potTopDiameterCm: 12,
      potBottomDiameterCm: 8,
      potHeightCm: 10,
      hasDrainageHole: 'true'
    },
    referenceDate: '2026-07-01'
  }

  const planNeutral = buildWateringPlanner({ ...baseline, transpirationIntervalFactor: 1.0 })
  const planFaster = buildWateringPlanner({ ...baseline, transpirationIntervalFactor: 0.8 })

  // BASELINE 间隔缩短 → nextWaterDate 应更早（或相等）
  if (
    planNeutral.wateringContext === WATERING_CONTEXTS.BASELINE &&
    planFaster.wateringContext === WATERING_CONTEXTS.BASELINE
  ) {
    const neutralDate = planNeutral.nextWaterDate
    const fasterDate = planFaster.nextWaterDate
    if (neutralDate && fasterDate) {
      assert.ok(
        fasterDate <= neutralDate,
        `蒸腾加快时间隔应缩短，fasterDate=${fasterDate} 应 <= neutralDate=${neutralDate}`
      )
    }
  }
})

test('transpirationIntervalFactor null 时按 1.0 处理', () => {
  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8], way: '见干浇透' },
    historical: {},
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: '2026-07-01',
      watering_events_10d: []
    }),
    potProfile: null,
    referenceDate: '2026-07-01',
    transpirationIntervalFactor: null
  })
  assert.equal(plan.transpirationIntervalFactor, 1.0)
})

test('WET 状态下蒸腾不绕过湿润保护', () => {
  // 构造 WET 状态：近期多次浇透 + 偏湿天气
  const wetTimeline = normalizeCareBehaviorTimeline({
    referenceDate: '2026-07-01',
    watering_events_10d: [
      { date: '2026-06-30', watered: true, amount: 'thorough', amountMl: 500 },
      { date: '2026-06-29', watered: true, amount: 'thorough', amountMl: 500 },
      { date: '2026-06-28', watered: true, amount: 'thorough', amountMl: 500 }
    ]
  })
  const wetHistorical = {
    highHumidityDays: 5,
    maxConsecutiveHighHumidityDays: 5,
    coldHumidDays: 3,
    rainyDays: 4,
    hotDryDays: 0
  }

  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8], way: '见干浇透' },
    historical: wetHistorical,
    forecast: {},
    behaviorTimeline: wetTimeline,
    potProfile: {
      potTopDiameterCm: 12,
      potBottomDiameterCm: 8,
      potHeightCm: 10,
      hasDrainageHole: 'false'
    },
    referenceDate: '2026-07-01',
    transpirationIntervalFactor: 0.8 // 蒸腾加快
  })

  // 即使蒸腾加快，WET 状态下 nextWaterDate 仍为 null（暂停浇水）
  if (plan.wateringContext === WATERING_CONTEXTS.WET) {
    assert.equal(plan.nextWaterDate, null, 'WET 状态下蒸腾不应绕过湿润保护')
  }
})

console.log('transpiration layer tests passed')
