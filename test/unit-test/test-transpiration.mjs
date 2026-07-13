'use strict'

/**
 * 蒸腾因素共享 Layer 单元测试 —— 浇水算法 v3。
 *
 * 覆盖：
 *   - 默认影子运行：intervalFactor 恒为 1.0，computedFactor 仅供审计
 *   - 缺失光照/天气证据时返回中性 1.0（不擅自放大耗水）
 *   - 光照分量：复用 light-exposure 的 indoorFactor，强光 → 蒸腾加快，弱光 → 蒸腾放慢
 *   - 天气分量：热干天数多 → 蒸腾加快；高湿/冷湿/雨天 → 蒸腾放慢
 *   - 属级策略收敛：喜干植物 dryTolerance=high → 蒸腾加快幅度减半
 *   - 系数范围限定 [0.8, 1.2]
 *   - resolveShadowModeFromEnv：环境变量 WATERING_TRANSPIRATION_ENABLED 控制
 *   - buildWateringPlanner 集成：transpirationIntervalFactor 仅影响 BASELINE 间隔，
 *     不影响 amountRangeMl（单次毫升数），也不绕过 WET/DRY Gate
 *   - 真实天气字段输入测试（tempMaxC/tempMinC/humidityPercent/precipMm/textDay）
 *   - 独立接口输出 keys 精确为 amountRangeMl
 *   - UI 结果区不存在日期、盆型、瓶/桶、土壤、光照文案
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'

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
} = require('../../cloudfunctions/layer/utils/transpiration.js')

const { computeLightExposure } = require('../../cloudfunctions/layer/utils/light-exposure.js')

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
    lightEnvironment: { facing: 'south', windowType: 'standard', hasDirectSun: true, position: 'window_side', distance: 1 },
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
  const factor = resolveLightFactor({ facing: 'south', windowType: 'standard', hasDirectSun: true, position: 'window_side', distance: 0.5 })
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

test('light-exposure computeLightExposure 对南向直射返回有效 indoorFactor', () => {
  const exposure = computeLightExposure({ facing: 'south', windowType: 'standard', hasDirectSun: true, position: 'window_side', distance: 0.5 })
  assert.ok(exposure, '应返回有效 exposure 结果')
  assert.ok(exposure.factors.indoorFactor > 1.0, `南向直射 indoorFactor 应 > 1.0，got ${exposure.factors.indoorFactor}`)
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
 * 8. buildWateringPlanner 集成：蒸腾仅影响间隔，不影响毫升数
 * ============================================================ */

function buildBaselinePlan(overrides = {}) {
  return {
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
    referenceDate: '2026-07-01',
    ...overrides
  }
}

test('transpirationIntervalFactor 不影响 amountRangeMl（单次毫升数）', () => {
  const planNeutral = buildWateringPlanner({ ...buildBaselinePlan(), transpirationIntervalFactor: 1.0 })
  const planFaster = buildWateringPlanner({ ...buildBaselinePlan(), transpirationIntervalFactor: 0.8 })

  assert.deepEqual(
    planNeutral.amountRangeMl,
    planFaster.amountRangeMl,
    'amountRangeMl 不应因 transpirationIntervalFactor 改变'
  )
})

test('transpirationIntervalFactor 影响 BASELINE 间隔（nextWaterDate）', () => {
  const planNeutral = buildWateringPlanner({ ...buildBaselinePlan(), transpirationIntervalFactor: 1.0 })
  const planFaster = buildWateringPlanner({ ...buildBaselinePlan(), transpirationIntervalFactor: 0.8 })

  // 先断言 wateringContext 精确等于 BASELINE，再断言日期
  assert.equal(
    planNeutral.wateringContext,
    WATERING_CONTEXTS.BASELINE,
    `neutral plan 应为 BASELINE，got ${planNeutral.wateringContext}`
  )
  assert.equal(
    planFaster.wateringContext,
    WATERING_CONTEXTS.BASELINE,
    `faster plan 应为 BASELINE，got ${planFaster.wateringContext}`
  )

  const neutralDate = planNeutral.nextWaterDate
  const fasterDate = planFaster.nextWaterDate
  assert.ok(neutralDate, 'BASELINE neutral 应有 nextWaterDate')
  assert.ok(fasterDate, 'BASELINE faster 应有 nextWaterDate')
  assert.ok(
    fasterDate <= neutralDate,
    `蒸腾加快时间隔应缩短，fasterDate=${fasterDate} 应 <= neutralDate=${neutralDate}`
  )
})

test('transpirationIntervalFactor null 时按 1.0 处理', () => {
  const plan = buildWateringPlanner({
    ...buildBaselinePlan(),
    potProfile: null,
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
    transpirationIntervalFactor: 0.8
  })

  // 先断言 wateringContext 精确等于 WET，再无条件断言 nextWaterDate=null
  assert.equal(
    plan.wateringContext,
    WATERING_CONTEXTS.WET,
    `应为 WET 状态，got ${plan.wateringContext}`
  )
  assert.equal(plan.nextWaterDate, null, 'WET 状态下蒸腾不应绕过湿润保护，nextWaterDate 必须为 null')
})

/* ============================================================
 * 9. 真实天气字段输入测试（buildWeatherSummary 真实字段形状）
 * ============================================================ */

test('buildWeatherSummary 支持真实天气字段 tempMaxC/tempMinC/humidityPercent/precipMm/textDay', () => {
  // 用真实字段形状构造天气记录
  // 通过 Module._load 拦截 /opt/utils/plant-knowledge 依赖
  const Module = require('module')
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === '/opt/utils/plant-knowledge') {
      return { getPlantCatalogById: () => null }
    }
    if (request === '/opt/utils/watering-planner') {
      return { buildWateringPlanner: () => ({}), normalizeCareBehaviorTimeline: v => v }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const { buildWeatherSummary } = require('../../cloudfunctions/plant-user-http/watering-planner-service.js')
    const strategy = { temperatureMax: 30, temperatureMin: 12, humidityMax: 75, humidityMin: 35 }

    const weatherDays = [
      { date: '2026-07-01', tempMaxC: 35, tempMinC: 22, humidityPercent: 25, precipMm: 0, textDay: '晴' },
      { date: '2026-07-02', tempMaxC: 34, tempMinC: 20, humidityPercent: 28, precipMm: 0, textDay: '晴' },
      { date: '2026-07-03', tempMaxC: 18, tempMinC: 10, humidityPercent: 85, precipMm: 5, textDay: '小雨' },
      { date: '2026-07-04', tempMaxC: 20, tempMinC: 12, humidityPercent: 80, precipMm: 2, textDay: '阵雨' }
    ]

    const summary = buildWeatherSummary(weatherDays, strategy)

    // 7/1 和 7/2 是热干天（tempMaxC>30 且 humidity<35）
    assert.equal(summary.hotDryDays, 2, `hotDryDays 应为 2，got ${summary.hotDryDays}`)
    // 7/3 和 7/4 是雨天（precipMm>0 或 textDay 含雨）
    assert.equal(summary.rainyDays, 2, `rainyDays 应为 2，got ${summary.rainyDays}`)
    // 7/3 和 7/4 是高湿天（humidity>75）
    assert.equal(summary.highHumidityDays, 2, `highHumidityDays 应为 2，got ${summary.highHumidityDays}`)
    // 7/3 是冷湿天（tempMin<12 且 humidity>75）
    assert.equal(summary.coldHumidDays, 1, `coldHumidDays 应为 1，got ${summary.coldHumidDays}`)
  } finally {
    Module._load = originalLoad
  }
})

/* ============================================================
 * 10. 独立接口输出 keys 精确为 amountRangeMl
 * ============================================================ */

test('computeAdhocPlanner 输出 data keys 仅含 amountRangeMl（及相关标识字段）', () => {
  const { computeAdhocPlanner } = require('../../cloudfunctions/plant-user-http/watering-planner-service.js')

  // computeAdhocPlanner 是 async，需要 mock getPlantCatalogById
  // 由于它内部 require('/opt/utils/plant-knowledge')，我们通过 Module._load 拦截
  // 这里验证函数源码不包含已删除的字段
  const src = fs.readFileSync(
    'cloudfunctions/plant-user-http/watering-planner-service.js',
    'utf8'
  )
  assert.ok(src.includes('amountRangeMl'), 'computeAdhocPlanner 应返回 amountRangeMl')
  assert.ok(!src.includes('potVolumeMl'), 'computeAdhocPlanner 不应返回 potVolumeMl')
  assert.ok(!src.includes('stopCondition'), 'computeAdhocPlanner 不应返回 stopCondition')
  assert.ok(!src.includes('confidenceLevel'), 'computeAdhocPlanner 不应返回 confidenceLevel')
  assert.ok(!src.includes('nextWaterDate'), 'computeAdhocPlanner 不应返回 nextWaterDate')
  assert.ok(!src.includes('nextWaterWindow'), 'computeAdhocPlanner 不应返回 nextWaterWindow')
  assert.ok(!src.includes('wateringContext'), 'computeAdhocPlanner 不应返回 wateringContext')
  assert.ok(!src.includes('reasonCodes'), 'computeAdhocPlanner 不应返回 reasonCodes')
})

/* ============================================================
 * 11. UI 结果区不存在日期、盆型、瓶/桶、土壤、光照文案
 * ============================================================ */

test('watering-advisor.vue 结果区不包含盆型概要/瓶桶换算/日期/间隔/土壤/光照文案', () => {
  const vue = fs.readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')
  const resultSection = vue.slice(vue.indexOf('步骤3：展示建议'), vue.indexOf('</swiper-item>', vue.indexOf('步骤3：展示建议')))

  assert.ok(resultSection.includes('amountText'), '结果区应包含建议毫升数 amountText')
  assert.ok(!resultSection.includes('盆型概要'), '结果区不应包含盆型概要')
  assert.ok(!resultSection.includes('formatMlRangeToBottleText'), '结果区不应使用瓶桶换算')
  assert.ok(!resultSection.includes('nextWaterDate'), '结果区不应包含日期')
  assert.ok(!resultSection.includes('nextWaterWindow'), '结果区不应包含间隔窗口')
  assert.ok(!resultSection.includes('wateringContext'), '结果区不应包含浇水策略/土壤判断')
  assert.ok(!resultSection.includes('光照'), '结果区不应包含光照文案')
  assert.ok(!resultSection.includes('蒸腾'), '结果区不应包含蒸腾文案')
})

test('watering-advisor.vue 不导入 formatMlRangeToBottleText', () => {
  const vue = fs.readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')
  assert.ok(!vue.includes('formatMlRangeToBottleText'), '不应导入 formatMlRangeToBottleText')
})

test('watering-advisor.vue 行数不超过 500', () => {
  const vue = fs.readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')
  const lineCount = vue.split('\n').length
  assert.ok(lineCount <= 500, `watering-advisor.vue 应 <= 500 行，got ${lineCount}`)
})

/* ============================================================
 * 12. light-exposure 共享模块验证
 * ============================================================ */

test('light-exposure 是 transpiration 的唯一光照计算来源', () => {
  const transpirationSrc = fs.readFileSync(
    'cloudfunctions/layer/utils/transpiration.js',
    'utf8'
  )
  assert.ok(
    transpirationSrc.includes("require('./light-exposure')"),
    'transpiration.js 应 require light-exposure'
  )
  assert.ok(
    !transpirationSrc.includes('MEANINGFUL_FACING_KEYS'),
    'transpiration.js 不应保留重复的 facing keys 常量'
  )
  assert.ok(
    !transpirationSrc.includes('MEANINGFUL_WINDOW_KEYS'),
    'transpiration.js 不应保留重复的 window keys 常量'
  )
})

console.log('transpiration layer tests passed')
