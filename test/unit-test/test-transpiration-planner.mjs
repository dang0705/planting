'use strict'

/**
 * 蒸腾 × 浇水规划器集成测试 —— 浇水算法 v3。
 *
 * 覆盖：
 *   - buildWateringPlanner 集成：transpirationIntervalFactor 仅影响 BASELINE 间隔，
 *     不影响 amountRangeMl（单次毫升数），也不绕过 WET/DRY Gate
 *   - 真实天气字段输入测试（tempMaxC/tempMinC/humidityPercent/precipMm/textDay）
 *   - 独立接口 computeAdhocPlanner 输出 keys 精确为 amountRangeMl（真实 await 调用）
 *   - 500 行硬规则验证
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire(import.meta.url)

const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline,
  WATERING_CONTEXTS
} = require('../../cloudfunctions/layer/utils/watering-planner.js')

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
  console.log('transpiration planner integration tests passed')
}

/* ============================================================
 * 1. buildWateringPlanner 集成：蒸腾仅影响间隔，不影响毫升数
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
  const planNeutral = buildWateringPlanner({
    ...buildBaselinePlan(),
    transpirationIntervalFactor: 1.0
  })
  const planFaster = buildWateringPlanner({
    ...buildBaselinePlan(),
    transpirationIntervalFactor: 0.8
  })

  assert.deepEqual(
    planNeutral.amountRangeMl,
    planFaster.amountRangeMl,
    'amountRangeMl 不应因 transpirationIntervalFactor 改变'
  )
})

test('transpirationIntervalFactor 影响 BASELINE 间隔（nextWaterDate）', () => {
  const planNeutral = buildWateringPlanner({
    ...buildBaselinePlan(),
    transpirationIntervalFactor: 1.0
  })
  const planFaster = buildWateringPlanner({
    ...buildBaselinePlan(),
    transpirationIntervalFactor: 0.8
  })

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
  assert.equal(
    plan.nextWaterDate,
    null,
    'WET 状态下蒸腾不应绕过湿润保护，nextWaterDate 必须为 null'
  )
})

/* ============================================================
 * 2. 真实天气字段输入测试（buildWeatherSummary 真实字段形状）
 * ============================================================ */

test('buildWeatherSummary 支持真实天气字段 tempMaxC/tempMinC/humidityPercent/precipMm/textDay', () => {
  // 用真实字段形状构造天气记录
  // 通过 Module._load 拦截 /opt/utils/plant-knowledge 依赖
  const Module = require('module')
  const originalLoad = Module._load
  const servicePath =
    require.resolve('../../cloudfunctions/plant-user-http/watering-planner-service.js')
  delete require.cache[servicePath]
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
    const {
      buildWeatherSummary
    } = require('../../cloudfunctions/plant-user-http/watering-planner-service.js')
    const strategy = { temperatureMax: 30, temperatureMin: 12, humidityMax: 75, humidityMin: 35 }

    const weatherDays = [
      {
        date: '2026-07-01',
        tempMaxC: 35,
        tempMinC: 22,
        humidityPercent: 25,
        precipMm: 0,
        textDay: '晴'
      },
      {
        date: '2026-07-02',
        tempMaxC: 34,
        tempMinC: 20,
        humidityPercent: 28,
        precipMm: 0,
        textDay: '晴'
      },
      {
        date: '2026-07-03',
        tempMaxC: 18,
        tempMinC: 10,
        humidityPercent: 85,
        precipMm: 5,
        textDay: '小雨'
      },
      {
        date: '2026-07-04',
        tempMaxC: 20,
        tempMinC: 12,
        humidityPercent: 80,
        precipMm: 2,
        textDay: '阵雨'
      }
    ]

    const summary = buildWeatherSummary(weatherDays, strategy)

    // 7/1 和 7/2 是热干天（tempMaxC>30 且 humidity<35）
    assert.equal(summary.hotDryDays, 2, `hotDryDays 应为 2，got ${summary.hotDryDays}`)
    // 7/3 和 7/4 是雨天（precipMm>0 或 textDay 含雨）
    assert.equal(summary.rainyDays, 2, `rainyDays 应为 2，got ${summary.rainyDays}`)
    // 7/3 和 7/4 是高湿天（humidity>75）
    assert.equal(
      summary.highHumidityDays,
      2,
      `highHumidityDays 应为 2，got ${summary.highHumidityDays}`
    )
    // 7/3 是冷湿天（tempMin<12 且 humidity>75）
    assert.equal(summary.coldHumidDays, 1, `coldHumidDays 应为 1，got ${summary.coldHumidDays}`)
  } finally {
    Module._load = originalLoad
    delete require.cache[servicePath]
  }
})

/* ============================================================
 * 3. 独立接口输出 keys 精确为 amountRangeMl（真实 await 调用）
 * ============================================================ */

test('computeAdhocPlanner 输出 data keys 精确为 ["amountRangeMl"]', async () => {
  const Module = require('module')
  const originalLoad = Module._load
  // 清除 service 缓存，确保使用本测试的 mock 重新加载
  const servicePath =
    require.resolve('../../cloudfunctions/plant-user-http/watering-planner-service.js')
  delete require.cache[servicePath]
  Module._load = function (request, parent, isMain) {
    if (request === '/opt/utils/plant-knowledge') {
      return {
        getPlantCatalogById: () => ({
          primaryDisplayName: '测试植物',
          canonicalName: 'Test plant',
          watering: { freq: [5, 8], way: '见干浇透' },
          wateringQuantization: { dryTolerance: 'normal', wetTolerance: 'normal' }
        })
      }
    }
    if (request === '/opt/utils/watering-planner') {
      return {
        buildWateringPlanner: () => ({ amountRangeMl: [100, 200] }),
        normalizeCareBehaviorTimeline: v => v
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const {
      computeAdhocPlanner
    } = require('../../cloudfunctions/plant-user-http/watering-planner-service.js')
    const result = await computeAdhocPlanner({
      catalogPlantId: 'test-1',
      potProfile: { potTopDiameterCm: 12, potHeightCm: 10, hasDrainageHole: 'true' },
      weatherDays: [],
      forecastDays: []
    })
    assert.equal(
      result.statusCode,
      200,
      `statusCode 应为 200，got ${result.statusCode}, error: ${result.error}`
    )
    assert.deepEqual(
      Object.keys(result.data).sort(),
      ['amountRangeMl'],
      `data keys 应精确为 ["amountRangeMl"]，got ${JSON.stringify(Object.keys(result.data))}`
    )
  } finally {
    Module._load = originalLoad
    delete require.cache[servicePath]
  }
})

/* ============================================================
 * 4. 500 行硬规则验证
 * ============================================================ */

test('watering-advisor.vue 行数不超过 500', () => {
  const vue = fs.readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')
  const lineCount = vue.split('\n').length
  assert.ok(lineCount <= 500, `watering-advisor.vue 应 <= 500 行，got ${lineCount}`)
})

test('watering-planner.js 行数不超过 500', () => {
  const src = fs.readFileSync('cloudfunctions/layer/utils/watering-planner.js', 'utf8')
  const lineCount = src.split('\n').length
  assert.ok(lineCount <= 500, `watering-planner.js 应 <= 500 行，got ${lineCount}`)
})

await runAll()
