'use strict'

/**
 * 浇水提醒算法 v2.1 单元测试。
 *
 * 覆盖：
 *   - 盆型几何计算（pot-geometry）
 *   - 水合负载与 Dry/Wet Gate（hydration-load）
 *   - 共享规划器 v2.1 主入口（watering-planner）
 *   - 关键不变量：喷雾不抵消干燥、浇透+近期+偏湿→过浇、无排水孔+窄底→提权
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const { computePotGeometry } = require('../../cloudfunctions/layer/utils/pot-geometry.js')
const {
  computeEffectiveHydrationLoad,
  computeWetPressureLoad,
  computeLastEffectiveRootWateredDaysAgo,
  evaluateDryWetGate,
  hasRecentThoroughWatering,
  computeAmountSuggestion,
  DOSE_CLASS,
  GATE_STATE,
  REASON_CODE
} = require('../../cloudfunctions/layer/utils/hydration-load.js')
const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline,
  resolveBaselineInterval,
  WATERING_CONTEXTS,
  WATERING_ACTIONS,
  FORMULA_VERSION
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

const REF_DATE = '2026-07-01'

function makeEvent(daysAgo, amount = 'normal') {
  const d = new Date(`${REF_DATE}T12:00:00Z`)
  d.setDate(d.getDate() - daysAgo)
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date: dateStr, watered: true, amount }
}

/* ============================================================
 * 1. 盆型几何计算
 * ============================================================ */

test('pot-geometry: 完整盆型计算正确', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 12,
    potBottomDiameterCm: 8,
    potHeightCm: 10,
    hasDrainageHole: 'true',
    potMaterial: 'ceramic',
    substrateType: 'general'
  })
  assert.ok(geo.potVolumeMl > 0, '体积应大于 0')
  assert.ok(geo.topSurfaceAreaCm2 > 0)
  assert.ok(geo.bottomSurfaceAreaCm2 > 0)
  assert.ok(geo.effectiveDepthCm > 0)
  assert.ok(geo.surfaceToVolumeRatio > 0)
  assert.equal(geo.taperRatio, 1.5, '锥度比 = 12/8 = 1.5')
  assert.equal(geo.hasDrainageHole, 'true')
  assert.equal(geo.potMaterial, 'ceramic')
  assert.equal(geo.volumeConfidence, 'high', '完整输入应高置信度')
  assert.equal(geo.heightEstimated, false)
})

test('pot-geometry: 盆高缺失时按平均直径×0.85估算并降低置信度', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 10,
    potBottomDiameterCm: 10,
    hasDrainageHole: 'true'
  })
  assert.equal(geo.heightEstimated, true, '应标记为估算')
  assert.equal(geo.volumeConfidence, 'low', '估算盆高应降低置信度')
  assert.ok(geo.potHeightCm > 0)
  // 平均直径 = 10，估算高度 = 10 * 0.85 = 8.5
  assert.ok(Math.abs(geo.potHeightCm - 8.5) < 0.1, '估算高度应接近 8.5')
})

test('pot-geometry: 无排水孔+窄底盆排水风险因子高', () => {
  const noDrainageNarrow = computePotGeometry({
    potTopDiameterCm: 14,
    potBottomDiameterCm: 8,
    potHeightCm: 10,
    hasDrainageHole: 'false'
  })
  const withDrainage = computePotGeometry({
    potTopDiameterCm: 14,
    potBottomDiameterCm: 8,
    potHeightCm: 10,
    hasDrainageHole: 'true'
  })
  assert.ok(
    noDrainageNarrow.drainageRiskFactor > withDrainage.drainageRiskFactor,
    '无排水孔排水风险应高于有排水孔'
  )
  assert.ok(noDrainageNarrow.drainageRiskFactor >= 0.8, '无排水孔风险至少 0.8')
})

test('pot-geometry: 缺少直径返回空几何', () => {
  const geo = computePotGeometry({})
  assert.equal(geo.potVolumeMl, 0)
  assert.equal(geo.volumeConfidence, 'low')
})

/* ============================================================
 * 2. 水合负载与 Dry/Wet Gate
 * ============================================================ */

test('hydration: 喷雾不能抵消干燥风险', () => {
  // 只有喷雾事件
  const mistEvents = [makeEvent(1, 'mist'), makeEvent(2, 'mist')]
  const lastRoot = computeLastEffectiveRootWateredDaysAgo(mistEvents, REF_DATE)
  assert.equal(lastRoot, null, '喷雾不应计入有效根区浇水')

  const hydration = computeEffectiveHydrationLoad(mistEvents, REF_DATE, 10)
  assert.ok(hydration < 0.2, '喷雾的水合负载应很低')
})

test('hydration: unknown 浇水历史不能当成 0 次', () => {
  const unknownEvents = [makeEvent(1, 'unknown')]
  const hydration = computeEffectiveHydrationLoad(unknownEvents, REF_DATE, 10)
  assert.ok(hydration > 0, 'unknown 事件应计入水合负载')
})

test('hydration: 浇透事件湿压负载高', () => {
  const thoroughEvents = [makeEvent(1, 'thorough')]
  const normalEvents = [makeEvent(1, 'normal')]
  const thoroughPressure = computeWetPressureLoad(thoroughEvents, REF_DATE, 10, { drainageRiskFactor: 0.5 })
  const normalPressure = computeWetPressureLoad(normalEvents, REF_DATE, 10, { drainageRiskFactor: 0.5 })
  assert.ok(thoroughPressure > normalPressure, '浇透湿压应高于普通')
})

test('gate: 浇透+近期+强偏湿→WET', () => {
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.7,
    effectiveHydrationLoad: 0.5,
    wetPressureLoad: 0.5,
    lastEffectiveRootWateredDaysAgo: 1,
    potGeometry: { hasDrainageHole: 'true', taperRatio: 1.0 },
    weatherWetPressureHitCount: 2,
    forecastHotDryHit: false,
    historicalHotDryHit: false,
    baselineIntervalDays: [5, 8],
    recentThoroughWatering: true
  })
  assert.equal(gate.gateState, GATE_STATE.WET)
  assert.ok(gate.reasonCodes.includes(REASON_CODE.OVERWATERING_RISK_WARNING))
  assert.ok(gate.reasonCodes.includes(REASON_CODE.RECENT_THOROUGH_WATERING))
  assert.ok(gate.reasonCodes.includes(REASON_CODE.STRONG_WET_ENVIRONMENT))
})

test('gate: 无排水孔+窄底盆+偏湿→WET + NO_DRAINAGE_NARROW_BOTTOM', () => {
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.55,
    effectiveHydrationLoad: 0.4,
    wetPressureLoad: 0.3,
    lastEffectiveRootWateredDaysAgo: 2,
    potGeometry: { hasDrainageHole: 'false', taperRatio: 1.5, drainageRiskFactor: 0.8 },
    weatherWetPressureHitCount: 1,
    forecastHotDryHit: false,
    historicalHotDryHit: false,
    baselineIntervalDays: [5, 8],
    recentThoroughWatering: false
  })
  assert.equal(gate.gateState, GATE_STATE.WET)
  assert.ok(gate.reasonCodes.includes(REASON_CODE.NO_DRAINAGE_NARROW_BOTTOM))
  assert.ok(gate.reasonCodes.includes(REASON_CODE.OVERWATERING_RISK_WARNING))
})

test('gate: 低湿度+距上次浇水较久→DRY', () => {
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.2,
    effectiveHydrationLoad: 0.1,
    wetPressureLoad: 0.05,
    lastEffectiveRootWateredDaysAgo: 8,
    potGeometry: { hasDrainageHole: 'true', taperRatio: 1.0 },
    weatherWetPressureHitCount: 0,
    forecastHotDryHit: false,
    historicalHotDryHit: false,
    baselineIntervalDays: [5, 8],
    recentThoroughWatering: false
  })
  assert.equal(gate.gateState, GATE_STATE.DRY)
  assert.ok(gate.reasonCodes.includes(REASON_CODE.INCREASE_WATERING_FREQUENCY))
})

test('gate: 正常→BASELINE', () => {
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.45,
    effectiveHydrationLoad: 0.3,
    wetPressureLoad: 0.2,
    lastEffectiveRootWateredDaysAgo: 3,
    potGeometry: { hasDrainageHole: 'true', taperRatio: 1.0 },
    weatherWetPressureHitCount: 0,
    forecastHotDryHit: false,
    historicalHotDryHit: false,
    baselineIntervalDays: [5, 8],
    recentThoroughWatering: false
  })
  assert.equal(gate.gateState, GATE_STATE.BASELINE)
})

/* ============================================================
 * 3. 共享规划器 v2.1 主入口
 * ============================================================ */

test('planner: 不再输出 wateringCount10d，输出 v2.1 字段', () => {
  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {},
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: [makeEvent(1, 'normal')]
    }),
    referenceDate: REF_DATE
  })
  assert.equal(plan.calculation.formulaVersion, FORMULA_VERSION)
  assert.ok(!('wateringCount10d' in plan.calculation.inputs), '不应再有 wateringCount10d')
  assert.ok(plan.effectiveHydrationLoad !== undefined)
  assert.ok(plan.wetPressureLoad !== undefined)
  assert.ok(plan.lastEffectiveRootWateredDaysAgo !== undefined)
  assert.ok(plan.rootZoneMoistureIndex !== undefined)
  assert.ok(plan.amountClass !== undefined)
  assert.ok(plan.amountRangeMl !== undefined)
  assert.ok(plan.stopCondition !== undefined)
  assert.ok(plan.confidenceLevel !== undefined)
  assert.ok(Array.isArray(plan.reasonCodes))
  assert.ok(plan.potGeometry !== undefined)
})

test('planner: WET 时 nextWaterDate 为 null', () => {
  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {
      highHumidityDays: 5,
      maxConsecutiveHighHumidityDays: 5,
      rainyDays: 4,
      maxConsecutiveRainyDays: 4
    },
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: [
        makeEvent(1, 'thorough'),
        makeEvent(2, 'thorough'),
        makeEvent(3, 'thorough')
      ]
    }),
    referenceDate: REF_DATE
  })
  assert.equal(plan.wateringContext, WATERING_CONTEXTS.WET)
  assert.equal(plan.nextWaterDate, null, 'WET 时 nextWaterDate 应为 null')
})

test('planner: DRY 时 nextWaterDate 为明天', () => {
  // 无浇水记录 + 无偏干天气 = BASELINE，nextWaterDate 也为 null
  // 需要偏干天气才触发 DRY
  const dryPlan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {
      hotDryDays: 4,
      maxConsecutiveHotDryDays: 4
    },
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: []
    }),
    referenceDate: REF_DATE
  })
  assert.equal(dryPlan.wateringContext, WATERING_CONTEXTS.DRY)
  assert.ok(dryPlan.nextWaterDate !== null, 'DRY 时应有 nextWaterDate')
})

test('planner: 盆型档案影响水量建议', () => {
  const planWithPot = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {},
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: [makeEvent(1, 'normal')]
    }),
    potProfile: {
      potTopDiameterCm: 12,
      potBottomDiameterCm: 10,
      potHeightCm: 10,
      hasDrainageHole: 'true',
      potMaterial: 'ceramic',
      substrateType: 'general'
    },
    referenceDate: REF_DATE
  })
  assert.ok(planWithPot.potGeometry.potVolumeMl > 0)
  assert.ok(planWithPot.amountRangeMl[1] > 0, '有盆型时水量区间应非 0')
  assert.ok(planWithPot.amountRangeMl[0] <= planWithPot.amountRangeMl[1], '区间下限不超上限')
})

test('planner: wateringStrategy.way/freq 影响回看窗口', () => {
  const planShortInterval = buildWateringPlanner({
    wateringStrategy: { freq: [3, 5] },
    historical: {},
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: [makeEvent(1, 'normal')]
    }),
    referenceDate: REF_DATE
  })
  const planLongInterval = buildWateringPlanner({
    wateringStrategy: { freq: [14, 30] },
    historical: {},
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: [makeEvent(1, 'normal')]
    }),
    referenceDate: REF_DATE
  })
  const shortWindow = planShortInterval.calculation.inputs.lookbackWindowDays
  const longWindow = planLongInterval.calculation.inputs.lookbackWindowDays
  assert.ok(longWindow > shortWindow, '长间隔属应有更长回看窗口')
})

test('planner: resolveBaselineInterval 正确解析 freq', () => {
  assert.deepEqual(resolveBaselineInterval({ freq: [5, 8] }), [5, 8])
  assert.deepEqual(resolveBaselineInterval({ freq: [14, 30] }), [14, 30])
  assert.deepEqual(resolveBaselineInterval({}), [5, 8], '缺失时返回默认')
})

test('planner: 保留导出常量向后兼容', () => {
  assert.ok(WATERING_CONTEXTS.WET)
  assert.ok(WATERING_CONTEXTS.DRY)
  assert.ok(WATERING_CONTEXTS.BASELINE)
  assert.ok(WATERING_ACTIONS.WET)
  assert.ok(WATERING_ACTIONS.DRY)
  assert.ok(WATERING_ACTIONS.BASELINE)
})

/* ============================================================
 * 4. hasRecentThoroughWatering
 * ============================================================ */

test('hasRecentThoroughWatering: 5天内有浇透返回 true', () => {
  assert.equal(hasRecentThoroughWatering([makeEvent(1, 'thorough')], REF_DATE), true)
  assert.equal(hasRecentThoroughWatering([makeEvent(1, 'normal')], REF_DATE), false)
  assert.equal(hasRecentThoroughWatering([makeEvent(7, 'thorough')], REF_DATE), false, '超过5天不算近期')
})

/* ============================================================
 * 5. computeAmountSuggestion
 * ============================================================ */

test('amountSuggestion: WET 时水量为 0', () => {
  const geo = computePotGeometry({ potTopDiameterCm: 12, potBottomDiameterCm: 10, potHeightCm: 10 })
  const suggestion = computeAmountSuggestion(geo, GATE_STATE.WET, [5, 8])
  assert.deepEqual(suggestion.amountRangeMl, [0, 0])
})

test('amountSuggestion: DRY 时建议浇透', () => {
  const geo = computePotGeometry({ potTopDiameterCm: 12, potBottomDiameterCm: 10, potHeightCm: 10 })
  const suggestion = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8])
  assert.equal(suggestion.amountClass, DOSE_CLASS.THOROUGH)
  assert.ok(suggestion.amountRangeMl[1] > suggestion.amountRangeMl[0])
})

test('amountSuggestion: 无盆型时给保守区间', () => {
  const suggestion = computeAmountSuggestion({}, GATE_STATE.BASELINE, [5, 8])
  assert.equal(suggestion.confidenceLevel, 'low')
  assert.ok(suggestion.amountRangeMl[0] > 0)
})
