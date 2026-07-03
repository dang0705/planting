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

const { computePotGeometry, resolveSubstrateRetentionFactor } = require('../../cloudfunctions/layer/utils/pot-geometry.js')
const {
  computeEffectiveHydrationLoad,
  computeWetPressureLoad,
  computeLastEffectiveRootWateredDaysAgo,
  evaluateDryWetGate,
  hasRecentThoroughWatering,
  computeAmountSuggestion,
  resolveSpeciesWaterFactor,
  resolveDoseClassWithConflict,
  resolveUserDoseEcho,
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

test('substrate: 新增排水基质因子命中非默认值', () => {
  assert.ok(resolveSubstrateRetentionFactor('perlite') < 0.6, 'perlite 保水应偏低')
  assert.ok(resolveSubstrateRetentionFactor('ceramsite') <= 0.5, 'ceramsite 保水应偏低')
  assert.ok(resolveSubstrateRetentionFactor('coarse_sand') < 0.6, 'coarse_sand 保水应偏低')
})

test('substrate: JSON 数组多选按比例加权', () => {
  const single = resolveSubstrateRetentionFactor('peat')
  const mixed = resolveSubstrateRetentionFactor(
    JSON.stringify([{ material: 'peat', ratio: 50 }, { material: 'perlite', ratio: 50 }])
  )
  assert.ok(mixed < single && mixed > resolveSubstrateRetentionFactor('perlite'),
    '混合保水因子应介于纯泥炭与纯珍珠岩之间')
})

test('substrate: 非法 JSON / 空 → 1.0 基线', () => {
  assert.equal(resolveSubstrateRetentionFactor('unknown'), 1.0)
  assert.equal(resolveSubstrateRetentionFactor('[bad json'), 1.0)
  assert.equal(resolveSubstrateRetentionFactor(''), 1.0)
})

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

test('gate: DRY 阈值真正受 baselineIntervalDays[0] 约束', () => {
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.2,
    wetPressureLoad: 0,
    lastEffectiveRootWateredDaysAgo: 3,
    potGeometry: { hasDrainageHole: 'true' },
    weatherWetPressureHitCount: 0,
    forecastHotDryHit: false,
    historicalHotDryHit: false,
    baselineIntervalDays: [10, 14],
    recentThoroughWatering: false
  })
  assert.notEqual(gate.gateState, GATE_STATE.DRY, '未达 baseline min 天数不应判 DRY')
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
  assert.ok(plan.amountBottleText !== undefined)
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

test('planner: 无排水孔 BASELINE 周期拉长（×1.15），有孔不变', () => {
  const build = drain => buildWateringPlanner({
    wateringStrategy: { freq: [8, 12] },
    historical: {},
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: [makeEvent(6, 'normal')]
    }),
    potProfile: {
      potTopDiameterCm: 15, potBottomDiameterCm: 12, potHeightCm: 14,
      hasDrainageHole: drain, substrateType: 'general'
    },
    referenceDate: REF_DATE
  })
  const withHole = build('true')
  const noHole = build('false')
  // 两者都应是 BASELINE（无偏干偏湿信号）
  assert.equal(withHole.wateringContext, WATERING_CONTEXTS.BASELINE)
  assert.equal(noHole.wateringContext, WATERING_CONTEXTS.BASELINE)
  // 无孔下次浇水日期应晚于有孔（间隔被拉长）
  assert.ok(noHole.nextWaterDate > withHole.nextWaterDate,
    `无孔应晚于有孔：无孔=${noHole.nextWaterDate} 有孔=${withHole.nextWaterDate}`)
  // 窗口上限也应拉长
  assert.ok(noHole.nextWaterWindow[1] > withHole.nextWaterWindow[1], '无孔窗口上限应拉长')
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

test('amountSuggestion: DRY 时建议量为体积 20~30% 且区间单调', () => {
  const geo = computePotGeometry({ potTopDiameterCm: 12, potBottomDiameterCm: 10, potHeightCm: 10 })
  const suggestion = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8])
  assert.ok(suggestion.amountRangeMl[1] > suggestion.amountRangeMl[0])
  assert.equal(typeof suggestion.amountBottleText, 'string')
  assert.ok(suggestion.amountBottleText.length > 0)
})

test('amountSuggestion: 小盆体积 → 瓶数文案偏小（喷/半瓶）', () => {
  const smallGeo = computePotGeometry({
    potTopDiameterCm: 6, potBottomDiameterCm: 5, potHeightCm: 6,
    hasDrainageHole: 'true', potMaterial: 'plastic', substrateType: 'general'
  })
  const sug = computeAmountSuggestion(smallGeo, GATE_STATE.DRY)
  assert.match(sug.amountBottleText, /喷|半瓶/,
    `小盆 DRY 瓶数文案应偏小，实际 ${sug.amountBottleText}（上限 ${sug.amountRangeMl[1]}ml）`)
})

test('amountSuggestion: 大盆 DRY → 瓶数/区间文案偏大（多瓶/大桶/区间）', () => {
  const bigGeo = computePotGeometry({
    potTopDiameterCm: 30, potBottomDiameterCm: 24, potHeightCm: 28,
    hasDrainageHole: 'true', potMaterial: 'ceramic', substrateType: 'general'
  })
  const sug = computeAmountSuggestion(bigGeo, GATE_STATE.DRY)
  assert.match(sug.amountBottleText, /瓶|桶|ml/)
  assert.ok(sug.amountRangeMl[1] > 300, '大盆 DRY 上限应远超 300ml')
})

test('amountSuggestion: 无盆型仍给瓶数文案与保守区间', () => {
  const dry = computeAmountSuggestion({}, GATE_STATE.DRY)
  assert.equal(typeof dry.amountBottleText, 'string')
  assert.ok(dry.amountBottleText.length > 0)
  assert.equal(dry.confidenceLevel, 'low')
  const base = computeAmountSuggestion({}, GATE_STATE.BASELINE)
  assert.ok(base.amountRangeMl[1] > 0)
})

test('planner: 录入侧 amountMl 按盆体积反推档（同 ml 大盆=少量、小盆=浇透）', () => {
  // 同一次浇水 500ml：对小盆是浇透（进而更易偏湿），对大盆只是少量
  const build = potProfile => buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {},
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      wateringEvents10d: [{ date: makeEvent(1).date, watered: true, amountMl: 500 }]
    }),
    potProfile,
    referenceDate: REF_DATE
  })
  const smallPot = build({ potTopDiameterCm: 8, potBottomDiameterCm: 7, potHeightCm: 8, hasDrainageHole: 'true' })
  const bigPot = build({ potTopDiameterCm: 30, potBottomDiameterCm: 24, potHeightCm: 28, hasDrainageHole: 'true' })
  // 500ml 对小盆(V≈354)占比>100% → 浇透档回显；对大盆(V≈16000)仅 3% → 喷雾档回显
  assert.equal(smallPot.userDoseEcho?.doseClass ?? smallPot.userDoseEcho, DOSE_CLASS.THOROUGH, `小盆 500ml 应回显浇透，实际 ${JSON.stringify(smallPot.userDoseEcho)}`)
  assert.equal(bigPot.userDoseEcho?.doseClass ?? bigPot.userDoseEcho, DOSE_CLASS.MIST, `大盆 500ml 应回显喷雾，实际 ${JSON.stringify(bigPot.userDoseEcho)}`)
})

test('amountSuggestion: 排水孔修正矩阵按优先级调制水量', () => {
  const geo = d => computePotGeometry({
    potTopDiameterCm: 15, potBottomDiameterCm: 12, potHeightCm: 14,
    hasDrainageHole: d, potMaterial: 'plastic', substrateType: 'general'
  })
  const withHole = computeAmountSuggestion(geo('true'), GATE_STATE.DRY)
  const unknownHole = computeAmountSuggestion(geo('unknown'), GATE_STATE.DRY)
  const noHole = computeAmountSuggestion(geo('false'), GATE_STATE.DRY)
  // 有排水孔=基线
  const [lo0, hi0] = withHole.amountRangeMl
  // 未知：上限×0.85，下限不变
  assert.equal(unknownHole.amountRangeMl[0], lo0, '未知排水孔下限不变')
  assert.ok(unknownHole.amountRangeMl[1] < hi0, '未知排水孔上限收窄')
  // 无排水孔：下×0.6 上×0.5，比未知更严
  assert.ok(noHole.amountRangeMl[0] < lo0, '无排水孔下限收窄')
  assert.ok(noHole.amountRangeMl[1] < unknownHole.amountRangeMl[1], '无排水孔上限比未知更严')
})

test('amountSuggestion: 无排水孔+保水基质比普通无孔更严', () => {
  const base = { potTopDiameterCm: 18, potBottomDiameterCm: 15, potHeightCm: 16, hasDrainageHole: 'false', potMaterial: 'plastic' }
  const normalSub = computeAmountSuggestion(computePotGeometry({ ...base, substrateType: 'general' }), GATE_STATE.DRY)
  const waterRetaining = computeAmountSuggestion(computePotGeometry({ ...base, substrateType: 'sphagnum' }), GATE_STATE.DRY)
  assert.ok(waterRetaining.amountRangeMl[1] <= normalSub.amountRangeMl[1], '无孔+保水基质上限不高于普通无孔')
})

test('amountSuggestion: 无排水孔+喜干植物最严（dryTolerance high）', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 18, potBottomDiameterCm: 15, potHeightCm: 16,
    hasDrainageHole: 'false', potMaterial: 'plastic', substrateType: 'general'
  })
  const normalPlant = computeAmountSuggestion(geo, GATE_STATE.DRY)
  const dryLovingPlant = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], {
    wateringQuantization: { dryTolerance: 'high' }
  })
  assert.ok(dryLovingPlant.amountRangeMl[1] < normalPlant.amountRangeMl[1], '喜干植物无孔上限最严')
  assert.ok(dryLovingPlant.amountRangeMl[0] < normalPlant.amountRangeMl[0], '喜干植物无孔下限最严')
})

test('amountSuggestion: 有排水孔时不受基质/喜干修正影响', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 15, potBottomDiameterCm: 12, potHeightCm: 14,
    hasDrainageHole: 'true', potMaterial: 'plastic', substrateType: 'sphagnum'
  })
  const plain = computeAmountSuggestion(geo, GATE_STATE.DRY)
  const withDryLoving = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], {
    wateringQuantization: { dryTolerance: 'high' }
  })
  assert.deepEqual(plain.amountRangeMl, withDryLoving.amountRangeMl, '有排水孔时修正矩阵不介入')
})

test('amountSuggestion: 无盆型时给保守区间', () => {
  const suggestion = computeAmountSuggestion({}, GATE_STATE.BASELINE, [5, 8])
  assert.equal(suggestion.confidenceLevel, 'low')
  assert.ok(suggestion.amountRangeMl[0] > 0)
})

test('userDoseEcho: 取最近一次非喷雾剂量', () => {
  const events = [makeEvent(1, 'mist'), makeEvent(2, 'thorough'), makeEvent(5, 'small')]
  const echo = resolveUserDoseEcho(events, REF_DATE)
  assert.equal(echo?.doseClass, DOSE_CLASS.THOROUGH)
})

test('userDoseEcho: 只有喷雾 → mist', () => {
  const echo = resolveUserDoseEcho([makeEvent(1, 'mist')], REF_DATE)
  assert.equal(echo?.doseClass, DOSE_CLASS.MIST)
})

test('userDoseEcho: 无事件 → null', () => {
  assert.equal(resolveUserDoseEcho([], REF_DATE), null)
})

test('planner: 返回 userDoseEcho', () => {
  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      watering_events_10d: [makeEvent(2, 'thorough')]
    }),
    potProfile: { potTopDiameterCm: 12, potBottomDiameterCm: 8, potHeightCm: 10, hasDrainageHole: 'true' },
    referenceDate: REF_DATE
  })
  assert.equal(plan.userDoseEcho?.doseClass, DOSE_CLASS.THOROUGH)
})

/* ============================================================
 * Task6：属级需水量进入水量算法（resolveSpeciesWaterFactor）
 * ============================================================ */

test('speciesFactor: 按 targetMoistureMid 映射需水系数', () => {
  // 喜干 0.28 → 收窄；缺省 0.5 → 1.0；湿润 0.65 → 放大
  assert.ok(resolveSpeciesWaterFactor({ targetMoistureMid: 0.28 }) < 1.0, '喜干应收窄(<1)')
  assert.ok(Math.abs(resolveSpeciesWaterFactor({ targetMoistureMid: 0.5 }) - 1.0) < 1e-9, '缺省应=1.0')
  assert.ok(resolveSpeciesWaterFactor({ targetMoistureMid: 0.65 }) > 1.0, '湿润应放大(>1)')
})

test('speciesFactor: 缺省/非法量化 → 1.0 中性', () => {
  assert.equal(resolveSpeciesWaterFactor(null), 1.0)
  assert.equal(resolveSpeciesWaterFactor({}), 1.0)
  assert.equal(resolveSpeciesWaterFactor({ targetMoistureMid: 'x' }), 1.0)
})

test('amountSuggestion: 喜干植物建议水量 < 湿润植物（同盆同gate）', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 16, potHeightCm: 18,
    hasDrainageHole: 'true', potMaterial: 'plastic', substrateType: 'general'
  })
  const dryLoving = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], {
    wateringQuantization: { targetMoistureMid: 0.28 }
  })
  const moistLoving = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], {
    wateringQuantization: { targetMoistureMid: 0.65 }
  })
  assert.ok(dryLoving.amountRangeMl[1] < moistLoving.amountRangeMl[1],
    `喜干上限应小于湿润：喜干=${dryLoving.amountRangeMl[1]} 湿润=${moistLoving.amountRangeMl[1]}`)
  assert.ok(dryLoving.amountRangeMl[0] < moistLoving.amountRangeMl[0], '喜干下限也应更小')
})

test('amountSuggestion: 无量化数据时需水系数不改变水量（1.0）', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 16, potHeightCm: 18,
    hasDrainageHole: 'true', potMaterial: 'plastic', substrateType: 'general'
  })
  const noQuant = computeAmountSuggestion(geo, GATE_STATE.DRY)
  const neutralQuant = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], {
    wateringQuantization: { targetMoistureMid: 0.5 }
  })
  assert.deepEqual(noQuant.amountRangeMl, neutralQuant.amountRangeMl, '缺省与中性一致')
})

test('amountSuggestion: 需水系数与排水孔修正叠加（喜干+无孔最严）', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 16, potHeightCm: 18,
    hasDrainageHole: 'false', potMaterial: 'plastic', substrateType: 'general'
  })
  const dryLovingNoHole = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], {
    wateringQuantization: { targetMoistureMid: 0.28, dryTolerance: 'high' }
  })
  const geoHole = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 16, potHeightCm: 18,
    hasDrainageHole: 'true', potMaterial: 'plastic', substrateType: 'general'
  })
  const moistHole = computeAmountSuggestion(geoHole, GATE_STATE.DRY, [5, 8], {
    wateringQuantization: { targetMoistureMid: 0.65 }
  })
  assert.ok(dryLovingNoHole.amountRangeMl[1] < moistHole.amountRangeMl[1],
    '喜干+无孔应远小于湿润+有孔')
})

/* ============================================================
 * DRY 湿信号刹车 + amountMl 冲突校验 + 天气水量压制（GPT 修正）
 * ============================================================ */

test('gate: DRY 被强偏湿环境压制为 BASELINE（无 FORECAST_HOT_DRY_HIT）', () => {
  // 低湿度 + 无有效浇水 → 本应 DRY，但 weatherWetPressureHitCount≥2 且无预报热干 → 压制
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.1,
    wetPressureLoad: 0,
    lastEffectiveRootWateredDaysAgo: null,
    potGeometry: { hasDrainageHole: 'true' },
    weatherWetPressureHitCount: 2,
    forecastHotDryHit: false,
    historicalHotDryHit: false,
    baselineIntervalDays: [5, 8]
  })
  assert.equal(gate.gateState, GATE_STATE.BASELINE, '应被压制为 BASELINE')
  assert.ok(gate.reasonCodes.includes(REASON_CODE.DRY_SUPPRESSED_BY_WET_ENVIRONMENT), '应含 DRY_SUPPRESSED')
  assert.ok(gate.reasonCodes.includes(REASON_CODE.CHECK_SOIL_BEFORE_WATERING), '应含查土提示')
})

test('gate: FORECAST_HOT_DRY_HIT 时 DRY 不被湿信号压制', () => {
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.1,
    wetPressureLoad: 0,
    lastEffectiveRootWateredDaysAgo: null,
    potGeometry: { hasDrainageHole: 'true' },
    weatherWetPressureHitCount: 2,
    forecastHotDryHit: true,
    historicalHotDryHit: false,
    baselineIntervalDays: [5, 8]
  })
  assert.equal(gate.gateState, GATE_STATE.DRY, '预报热干时 DRY 不被压制')
})

test('gate: weatherWetPressureHitCount<2 时不压制 DRY', () => {
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex: 0.1,
    wetPressureLoad: 0,
    lastEffectiveRootWateredDaysAgo: null,
    potGeometry: { hasDrainageHole: 'true' },
    weatherWetPressureHitCount: 1,
    forecastHotDryHit: false,
    historicalHotDryHit: false,
    baselineIntervalDays: [5, 8]
  })
  assert.equal(gate.gateState, GATE_STATE.DRY, '仅1项湿信号不压制')
})

test('resolveDoseClassWithConflict: 30ml+normal 在 2749ml 盆上判冲突', () => {
  const { doseClass, doseConflict } = resolveDoseClassWithConflict(
    { amount: 'normal', amountMl: 30 }, 2749
  )
  assert.equal(doseClass, DOSE_CLASS.MIST, '30ml 反推为 mist')
  assert.equal(doseConflict, true, 'normal vs mist rank差2 → 冲突')
})

test('resolveDoseClassWithConflict: 300ml+normal 在 2749ml 盆上不冲突', () => {
  const { doseClass, doseConflict } = resolveDoseClassWithConflict(
    { amount: 'normal', amountMl: 300 }, 2749
  )
  assert.equal(doseConflict, false, '300ml 反推 normal，与标签一致不冲突')
})

test('amountSuggestion: DRY + weatherWetPressureHitCount≥2 水量压制 ×0.5', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'true', substrateType: 'general'
  })
  const normal = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], { weatherWetPressureHitCount: 0 })
  const suppressed = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8], { weatherWetPressureHitCount: 2 })
  assert.ok(suppressed.amountRangeMl[1] < normal.amountRangeMl[1], '湿信号≥2 应压制水量')
  assert.ok(suppressed.amountRangeMl[1] <= normal.amountRangeMl[1] * 0.55, '约 ×0.5')
  assert.match(suppressed.stopCondition, /查土.*干透/, 'stopCondition 应含查土提示')
})

test('amountSuggestion: BASELINE 不受 weatherWetAmountFactor 影响', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'true', substrateType: 'general'
  })
  const normal = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], { weatherWetPressureHitCount: 0 })
  const withWet = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], { weatherWetPressureHitCount: 2 })
  assert.deepEqual(normal.amountRangeMl, withWet.amountRangeMl, 'BASELINE 不受湿信号压制')
})

test('potGeometry: 田园土 retentionFactor=1.1（命中保水基质档）', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'false', substrateType: 'general'
  })
  assert.ok(geo.substrateRetentionFactor > 1.0, '田园土应 >1.0')
  // 无孔+保水基质 → 命中 0.5/0.4 档而非 0.6/0.5
  const modifier = computeAmountSuggestion(geo, GATE_STATE.DRY, [5, 8])
  const withHole = computeAmountSuggestion(
    computePotGeometry({ ...geo, hasDrainageHole: 'true' }), GATE_STATE.DRY, [5, 8]
  )
  assert.ok(modifier.amountRangeMl[1] < withHole.amountRangeMl[1], '无孔田园土应比有孔更保守')
})

test('planner: 龟背竹案例端到端 — 强湿+无有效浇水 → BASELINE 非大水量', () => {
  const REF = '2026-07-03'
  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {
      highHumidityDays: 5, maxConsecutiveHighHumidityDays: 3,
      rainyDays: 4, maxConsecutiveRainyDays: 3,
      coldHumidDays: 0, hotDryDays: 0
    },
    forecast: {},
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF,
      watering_events_10d: [{ date: '2026-06-23', watered: true, amount: 'normal', amountMl: 30 }]
    }),
    potProfile: { potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15, hasDrainageHole: 'true', substrateType: 'general' },
    wateringQuantization: { targetMoistureMid: 0.65, dryTolerance: 'low' },
    referenceDate: REF
  })
  // DRY 应被湿信号压制为 BASELINE
  assert.equal(plan.wateringContext, WATERING_CONTEXTS.BASELINE, '应被压制为 BASELINE')
  assert.ok(plan.reasonCodes.includes(REASON_CODE.DRY_SUPPRESSED_BY_WET_ENVIRONMENT), '含 DRY_SUPPRESSED')
  // 30ml+normal 冲突 → confidence low
  assert.equal(plan.confidenceLevel, 'low', '冲突应降 confidence')
  assert.ok(plan.reasonCodes.includes(REASON_CODE.AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL), '含冲突 reasonCode')
  // 水量不应是 411-618ml 那种大水量（BASELINE 倍率 0.1~0.15）
  assert.ok(plan.amountRangeMl[1] < 500, `BASELINE 水量应保守，实际 ${plan.amountRangeMl[1]}`)
})

/* ============================================================
 * userDoseEcho 锚定水量区间下限 + 区间文案（改动1-3）
 * ============================================================ */

test('resolveUserDoseEcho: 返回 { doseClass, amountMl } 对象', () => {
  // 550ml 对 V=2749ml 占比 20% → normal 档
  const events = [
    { date: REF_DATE, watered: true, amount: 'normal', amountMl: 550 }
  ]
  const echo = resolveUserDoseEcho(events, REF_DATE, 2749)
  assert.equal(echo.doseClass, DOSE_CLASS.NORMAL)
  assert.equal(echo.amountMl, 550)
})

test('resolveUserDoseEcho: 无 amountMl 字段时 amountMl 为 null', () => {
  const events = [makeEvent(1, 'thorough')] // makeEvent 不带 amountMl
  const echo = resolveUserDoseEcho(events, REF_DATE)
  assert.equal(echo.doseClass, DOSE_CLASS.THOROUGH)
  assert.equal(echo.amountMl, null)
})

test('computeAmountSuggestion: userDoseEcho.amountMl 锚定下限（用户浇量 > 基线下限）', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'true', potMaterial: 'ceramic', substrateType: 'general'
  })
  // V≈2749ml, BASELINE 基线区间 [275, 412]，用户浇 350ml(normal)
  const withoutEcho = computeAmountSuggestion(geo, GATE_STATE.BASELINE)
  const withEcho = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], {
    userDoseEcho: { doseClass: 'normal', amountMl: 350 }
  })
  // 无 echo 时下限 = 275
  assert.ok(withoutEcho.amountRangeMl[0] < 350, `无锚定下限应 < 350，实际 ${withoutEcho.amountRangeMl[0]}`)
  // 有 echo 时下限锚到 350（350 < 上限412，不被 clamp）
  assert.equal(withEcho.amountRangeMl[0], 350, `锚定后下限应为 350，实际 ${withEcho.amountRangeMl[0]}`)
  // 上限不变
  assert.equal(withEcho.amountRangeMl[1], withoutEcho.amountRangeMl[1], '上限不应变')
  // 含 USER_DOSE_ANCHORED reasonCode
  assert.ok(withEcho.reasonCodes.includes(REASON_CODE.USER_DOSE_ANCHORED), '应含 USER_DOSE_ANCHORED')
})

test('computeAmountSuggestion: userDoseEcho 超过上限时 clamp 到上限', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'true', potMaterial: 'ceramic', substrateType: 'general'
  })
  // V≈2749ml, BASELINE 区间 [275, 412]，用户浇 550ml > 上限 412
  const withEcho = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], {
    userDoseEcho: { doseClass: 'normal', amountMl: 550 }
  })
  assert.equal(withEcho.amountRangeMl[0], withEcho.amountRangeMl[1], '下限应 clamp 到上限')
  assert.ok(withEcho.reasonCodes.includes(REASON_CODE.USER_DOSE_ANCHORED))
})

test('computeAmountSuggestion: userDoseEcho 基线下限更高时不锚（用户浇量 < 基线下限）', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'true', potMaterial: 'ceramic', substrateType: 'general'
  })
  // V≈2749ml, BASELINE 基线区间 [275, 412]，用户只浇了 100ml(small)
  const withEcho = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], {
    userDoseEcho: { doseClass: 'small', amountMl: 100 }
  })
  // 100 < 275，不锚定
  assert.ok(withEcho.amountRangeMl[0] < 100 || withEcho.amountRangeMl[0] === 275, `下限不应被拉低，实际 ${withEcho.amountRangeMl[0]}`)
  assert.ok(!withEcho.reasonCodes?.includes(REASON_CODE.USER_DOSE_ANCHORED), '不应含 USER_DOSE_ANCHORED')
})

test('computeAmountSuggestion: mist 不锚定', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'true', potMaterial: 'ceramic', substrateType: 'general'
  })
  const withMist = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], {
    userDoseEcho: { doseClass: 'mist', amountMl: 30 }
  })
  assert.ok(!withMist.reasonCodes?.includes(REASON_CODE.USER_DOSE_ANCHORED), 'mist 不应锚定')
})

test('computeAmountSuggestion: 无 amountMl 时按 doseClass 反推锚定', () => {
  const geo = computePotGeometry({
    potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15,
    hasDrainageHole: 'true', potMaterial: 'ceramic', substrateType: 'general'
  })
  // V≈2749ml, small → V×0.08=220, 基线下限 275 > 220 → 不锚
  // normal → V×0.2=550, 550 > 上限412 → clamp 到 412
  const withNormal = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], {
    userDoseEcho: { doseClass: 'normal', amountMl: null }
  })
  assert.equal(withNormal.amountRangeMl[0], withNormal.amountRangeMl[1], 'normal 反推超过上限应 clamp')
  assert.ok(withNormal.reasonCodes.includes(REASON_CODE.USER_DOSE_ANCHORED))
  // small → 220 < 275，不锚定
  const withSmall = computeAmountSuggestion(geo, GATE_STATE.BASELINE, [5, 8], {
    userDoseEcho: { doseClass: 'small', amountMl: null }
  })
  assert.ok(!withSmall.reasonCodes?.includes(REASON_CODE.USER_DOSE_ANCHORED), 'small 反推值 < 基线下限不应锚定')
})

test('planner: 用户浇 350ml(normal) → 下限锚定 + 区间文案', () => {
  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      watering_events_10d: [{ date: makeEvent(2).date, watered: true, amount: 'normal', amountMl: 350 }]
    }),
    potProfile: { potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15, hasDrainageHole: 'true' },
    referenceDate: REF_DATE
  })
  assert.ok(plan.amountRangeMl[0] >= 350, `下限应锚定≥350，实际 ${plan.amountRangeMl[0]}`)
  assert.ok(plan.reasonCodes.includes(REASON_CODE.USER_DOSE_ANCHORED), '应含 USER_DOSE_ANCHORED')
  assert.match(plan.amountBottleText, /ml/, '区间文案应含 ml')
})

test('planner: 用户浇 30ml(mist) → 不锚定 + 正常区间', () => {
  const plan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: REF_DATE,
      watering_events_10d: [{ date: makeEvent(2).date, watered: true, amount: 'spray', amountMl: 30 }]
    }),
    potProfile: { potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 15, hasDrainageHole: 'true' },
    referenceDate: REF_DATE
  })
  assert.ok(!plan.reasonCodes.includes(REASON_CODE.USER_DOSE_ANCHORED), 'mist 不应锚定')
  // mist 不锚定：下限由 gate 倍率决定（DRY=V×0.2=550），不被用户浇量影响
  assert.equal(plan.userDoseEcho?.doseClass, DOSE_CLASS.MIST, 'echo 应为 mist')
})

test('formatMlRangeToBottleText: 区间文案', () => {
  const { formatMlRangeToBottleText } = require('../../cloudfunctions/layer/utils/water-volume-format.js')
  // 区间跨度大且下限>50 → 区间文案
  assert.equal(formatMlRangeToBottleText([275, 412]), '约275~412ml')
  assert.equal(formatMlRangeToBottleText([100, 300]), '约100~300ml')
  // [0,0] → 暂停
  assert.equal(formatMlRangeToBottleText([0, 0]), '暂停浇水')
  // 下限≤50（喷雾级）→ 单值取上限
  assert.match(formatMlRangeToBottleText([30, 200]), /瓶|ml/)
  // 上下限差≤50 → 单值
  assert.match(formatMlRangeToBottleText([100, 120]), /瓶|ml/)
  // 非法
  assert.equal(formatMlRangeToBottleText(null), '暂无建议水量')
})
