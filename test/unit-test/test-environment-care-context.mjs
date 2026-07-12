import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  buildHistoricalEnvironmentSummary10d,
  buildForecastEnvironmentSummary15d,
  normalizeCareBehaviorTimeline,
  buildEnvironmentCareContextV7,
  buildWateringPlanner,
  buildFertilizingPlanner,
  buildLightPlanner,
  WATERING_CONTEXTS,
  WATERING_ACTIONS,
  FERTILIZING_ACTIONS,
  LIGHT_CONTEXTS
} = require('../../cloudfunctions/diagnose-http/utils/environment-context-v7.js')

function test(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('historical summary keeps UV empty when the source has no UV values', () => {
  const summary = buildHistoricalEnvironmentSummary10d({
    dailyRecords: [
      {
        date: '2026-05-18',
        tempMin: 20,
        tempMax: 31,
        humidity: 35,
        precipitation: 0,
        weatherText: '晴'
      },
      {
        date: '2026-05-19',
        tempMin: 21,
        tempMax: 30,
        humidity: 40,
        precipitation: 0,
        weatherText: '多云'
      }
    ],
    temperatureMin: 18,
    temperatureMax: 28,
    humidityMin: 45,
    humidityMax: 70
  })

  assert.equal(summary.windowDays, 10)
  assert.equal(summary.maxUvIndex, undefined)
  assert.equal(summary.aboveGenusUvMaxDays, undefined)
})

test('forecast summary computes UV risk counts from daily records', () => {
  const dailyRecords = [
    {
      date: '2026-05-20',
      tempMin: 25,
      tempMax: 35,
      humidity: 28,
      precipitation: 0,
      uvIndex: 8,
      weatherText: '晴'
    },
    {
      date: '2026-05-21',
      tempMin: 26,
      tempMax: 36,
      humidity: 30,
      precipitation: 0,
      uvIndex: 9,
      weatherText: '晴'
    },
    {
      date: '2026-05-22',
      tempMin: 27,
      tempMax: 34,
      humidity: 32,
      precipitation: 0,
      uvIndex: 8,
      weatherText: '晴'
    }
  ]
  const withoutExposure = buildForecastEnvironmentSummary15d({
    dailyRecords,
    temperatureMin: 18,
    temperatureMax: 29,
    humidityMin: 40,
    humidityMax: 75,
    uvIndexMax: 7,
    userHasDirectSunExposure: false
  })
  const summary = buildForecastEnvironmentSummary15d({
    dailyRecords,
    temperatureMin: 18,
    temperatureMax: 29,
    humidityMin: 40,
    humidityMax: 75,
    uvIndexMax: 7,
    userHasDirectSunExposure: true
  })

  assert.equal(withoutExposure.aboveGenusUvMaxDays, 0)
  assert.equal(summary.windowDays, 15)
  assert.equal(summary.hotDryDays, 3)
  assert.equal(summary.maxConsecutiveHotDryDays, 3)
  assert.equal(summary.thresholds.humidityMinPercent, 40)
  assert.equal(summary.thresholds.temperatureMaxC, 29)
  assert.equal(summary.maxUvIndex, 9)
  assert.equal(summary.aboveGenusUvMaxDays, 3)
})

test('care behavior timeline normalizes events and last fertilized bucket', () => {
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate: '2026-05-27',
    wateringEvents10d: [
      { date: '2026-05-26', watered: true, amount: 'thorough' },
      { date: '2026-05-24', watered: true, amount: 'normal' },
      { date: '2026-05-20', watered: true, amount: 'small' }
    ],
    fertilizingEvents10d: [{ date: '2026-05-21', fertilized: true, strength: 'thin' }],
    lightChangeEvents10d: [{ date: '2026-05-25', event: 'moved_to_stronger_light' }],
    lastFertilizedBucket: '11-30d'
  })

  assert.equal(timeline.lastFertilizedBucket, 'within_10d')
  assert.equal(
    timeline.wateringEvents10d.find(event => event.date === '2026-05-26')?.amount,
    'thorough'
  )
  assert.equal(timeline.fertilizingEvents10d[0].strength, 'thin')
  assert.equal(timeline.lightChangeEvents10d[0].event, 'moved_to_stronger_light')
  assert.equal(timeline.summary.effectiveHydrationLoad !== undefined, true)
  assert.equal(timeline.summary.fertilizingCount10d, 1)
  assert.equal(timeline.summary.movedToStrongerLightWithin10d, true)
})

test('care behavior timeline keeps today when limiting recent events', () => {
  const referenceDate = '2026-05-27'
  const wateringEvents = Array.from({ length: 11 }, (_, index) => {
    const date = new Date(`${referenceDate}T12:00:00Z`)
    date.setDate(date.getDate() - (10 - index))
    const normalized = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { date: normalized, watered: true, amount: 'normal' }
  })
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate,
    wateringEvents10d: wateringEvents
  })

  assert.equal(timeline.wateringEvents10d.length, 10)
  assert.equal(
    timeline.wateringEvents10d.some(event => event.date === referenceDate),
    true
  )
  assert.equal(timeline.summary.lastEffectiveRootWateredDaysAgo, 0)
})

test('watering planner returns wet, dry and baseline contexts', () => {
  const wetTimeline = normalizeCareBehaviorTimeline({
    referenceDate: '2026-05-27',
    wateringEvents10d: [
      { date: '2026-05-26', watered: true, amount: 'thorough' },
      { date: '2026-05-25', watered: true, amount: 'normal' },
      { date: '2026-05-24', watered: true, amount: 'small' }
    ]
  })
  const wetPlan = buildWateringPlanner({
    wateringStrategy: {
      freq: [4, 8],
      tempMin: 18,
      tempMax: 28,
      humidityMin: 45,
      humidityMax: 70
    },
    historical: {
      highHumidityDays: 4,
      coldHumidDays: 0,
      hotDryDays: 0
    },
    forecast: {
      hotDryDays: 0
    },
    behaviorTimeline: wetTimeline
  })

  assert.deepEqual(wetPlan.baseline.intervalDays, [4, 8])
  assert.equal(wetPlan.wateringContext, WATERING_CONTEXTS.WET)
  assert.equal(wetPlan.action, WATERING_ACTIONS.WET)
  assert.equal(wetPlan.thresholds.wetHighHumidityDaysMin, 4)
  assert.equal(
    wetPlan.calculation.formulas.find(item => item.key === 'too_wet_condition').passed,
    true
  )

  const dryTimeline = normalizeCareBehaviorTimeline({
    referenceDate: '2026-05-27',
    wateringEvents10d: [{ date: '2026-05-19', watered: true, amount: 'normal' }]
  })
  const dryPlan = buildWateringPlanner({
    historical: {
      highHumidityDays: 0,
      coldHumidDays: 0,
      hotDryDays: 0
    },
    forecast: {
      hotDryDays: 3
    },
    behaviorTimeline: dryTimeline
  })

  assert.equal(dryPlan.wateringContext, WATERING_CONTEXTS.DRY)
  assert.equal(dryPlan.action, WATERING_ACTIONS.DRY)

  // v2.1: 无浇水记录时 rootZoneMoistureIndex=0 会触发 DRY，需有近期浇水记录才为 BASELINE
  const baselinePlan = buildWateringPlanner({
    historical: {
      highHumidityDays: 1,
      coldHumidDays: 0,
      hotDryDays: 1
    },
    forecast: {
      hotDryDays: 1
    },
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: '2026-05-27',
      wateringEvents10d: [{ date: '2026-05-25', watered: true, amount: 'normal' }]
    })
  })

  assert.equal(baselinePlan.wateringContext, WATERING_CONTEXTS.BASELINE)
  assert.equal(baselinePlan.action, WATERING_ACTIONS.BASELINE)
})

test('watering planner thresholds are configurable and included in formula trace', () => {
  // v2.1: 使用 2 天前单次普通浇水，既不触发 DRY 也不触发 WET
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate: '2026-05-27',
    wateringEvents10d: [{ date: '2026-05-25', watered: true, amount: 'normal' }]
  })
  const defaultPlan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {
      highHumidityDays: 4,
      maxConsecutiveHighHumidityDays: 4,
      coldHumidDays: 0,
      rainyDays: 0
    },
    forecast: {},
    behaviorTimeline: timeline
  })
  // v2.1: 默认阈值下 highHumidityPressureHit 命中，但单次少量浇水不会触发 WET
  // defaultPlan 验证阈值追踪正确性即可
  const relaxedPlan = buildWateringPlanner({
    wateringStrategy: { freq: [5, 8] },
    historical: {
      highHumidityDays: 4,
      maxConsecutiveHighHumidityDays: 4,
      coldHumidDays: 0,
      rainyDays: 0
    },
    forecast: {},
    behaviorTimeline: timeline,
    thresholds: {
      watering: {
        wetHighHumidityDaysMin: 99,
        wetHighHumidityConsecutiveDaysMin: 99
      }
    }
  })

  // v2.1: relaxedPlan 放宽天气阈值后不应触发 WET
  assert.equal(relaxedPlan.wateringContext, WATERING_CONTEXTS.BASELINE)
  assert.equal(
    defaultPlan.calculation.formulas.find(item => item.key === 'high_humidity_pressure_hit')
      .thresholds.wetHighHumidityDaysMin,
    4
  )
  assert.equal(
    defaultPlan.calculation.formulas.find(item => item.key === 'high_humidity_pressure_hit')
      .thresholds.wetHighHumidityConsecutiveDaysMin,
    4
  )
  assert.equal(
    defaultPlan.calculation.formulas.find(item => item.key === 'high_humidity_pressure_hit').passed,
    true
  )
  assert.equal(relaxedPlan.wateringContext, WATERING_CONTEXTS.BASELINE)
  assert.equal(relaxedPlan.thresholds.wetHighHumidityDaysMin, 99)
  assert.equal(
    relaxedPlan.calculation.formulas.find(item => item.key === 'high_humidity_pressure_hit')
      .thresholds.wetHighHumidityDaysMin,
    99
  )
  assert.equal(
    relaxedPlan.calculation.formulas.find(item => item.key === 'high_humidity_pressure_hit').passed,
    false
  )
  assert.equal(relaxedPlan.calculation.formulaVersion, 'watering_planner_v21')
  assert.equal(
    relaxedPlan.calculation.formulas.find(item => item.key === 'wet_pressure_score').result,
    0
  )
})

test('fertilizing planner does not depend on weather inputs and keeps the fixed baseline', () => {
  assert.equal(buildFertilizingPlanner.length, 0)

  const plan = buildFertilizingPlanner({
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: '2026-05-27',
      lastFertilizedBucket: '31_60d'
    }),
    lastFertilizedBucket: '31_60d',
    recentFertilizerStrength: 'unknown',
    plantShowsWeakGrowth: false,
    justRepottedRecently: false,
    historical: {
      hotDryDays: 999,
      coldHumidDays: 999
    },
    forecast: {
      hotDryDays: 999,
      hotHumidDays: 999
    },
    weather: {
      uvIndex: 99,
      humidity: 0
    }
  })

  assert.deepEqual(plan.baseline.intervalDays, [30, 45])
  assert.equal(plan.baseline.fertilizerType, 'thin_liquid_fertilizer')
  assert.equal(plan.action, FERTILIZING_ACTIONS.THIN_AFTER_DUE)
  assert.equal(plan.lastFertilizedBucket, '31_60d')
  assert.equal(plan.calculation.formulaVersion, 'fertilizing_planner_v7_configurable')
  assert.equal(
    plan.calculation.formulas.find(item => item.key === 'thin_after_due_condition').passed,
    true
  )
})

test('light planner requires a real exposure scene and does not match UV-only input', () => {
  const forecast = buildForecastEnvironmentSummary15d({
    dailyRecords: [
      {
        date: '2026-05-20',
        tempMin: 25,
        tempMax: 35,
        humidity: 28,
        precipitation: 0,
        uvIndex: 8,
        weatherText: '晴'
      },
      {
        date: '2026-05-21',
        tempMin: 26,
        tempMax: 36,
        humidity: 30,
        precipitation: 0,
        uvIndex: 9,
        weatherText: '晴'
      },
      {
        date: '2026-05-22',
        tempMin: 27,
        tempMax: 34,
        humidity: 32,
        precipitation: 0,
        uvIndex: 8,
        weatherText: '晴'
      }
    ],
    temperatureMin: 18,
    temperatureMax: 29,
    humidityMin: 40,
    humidityMax: 75,
    uvIndexMax: 7,
    userHasDirectSunExposure: true
  })

  const uvOnlyPlan = buildLightPlanner({
    forecast,
    userLightCondition: '',
    userHasDirectSunExposure: false,
    plantRequiresBrightLight: true
  })

  assert.deepEqual(uvOnlyPlan.lightContext, [])

  const exposedPlan = buildLightPlanner({
    forecast,
    userLightCondition: 'direct_sun_exposure',
    userHasDirectSunExposure: false,
    plantRequiresBrightLight: true,
    behaviorTimeline: normalizeCareBehaviorTimeline({
      referenceDate: '2026-05-27',
      lightChangeEvents10d: [{ date: '2026-05-26', event: 'moved_to_stronger_light' }]
    })
  })

  assert.ok(exposedPlan.lightContext.includes(LIGHT_CONTEXTS.EXCESS_LIGHT_OR_SUNBURN_RISK))
  assert.ok(exposedPlan.lightContext.includes(LIGHT_CONTEXTS.RECENT_LIGHT_INCREASE_STRESS))
})

test('environment builder preserves behavior summary and combines direct sun with UV', () => {
  const context = buildEnvironmentCareContextV7({
    diagnosisDate: '2026-05-27',
    plantContext: {
      watering: { freq: [5, 8] },
      sunning: { way: '明亮散射光' },
      temperatureMin: 18,
      temperatureMax: 29,
      humidityMin: 40,
      humidityMax: 75,
      uvIndexMax: 6
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-27' },
      historicalDays: [
        { date: '2026-05-25', tempMin: 24, tempMax: 31, humidity: 42, precipMm: 0, uvIndex: 8 },
        { date: '2026-05-26', tempMin: 24, tempMax: 32, humidity: 40, precipMm: 0, uvIndex: 9 }
      ],
      forecastDays: [
        { date: '2026-05-27', tempMin: 24, tempMax: 31, humidity: 42, precipMm: 0, uvIndex: 8 },
        { date: '2026-05-28', tempMin: 24, tempMax: 32, humidity: 40, precipMm: 0, uvIndex: 9 }
      ]
    },
    careBehaviorTimeline: {
      referenceDate: '2026-05-27',
      dailyRecords: [{ date: '2026-05-26', lightEvent: 'direct_sun_exposure' }]
    }
  })

  assert.equal(context.behaviorSummary10d.userHasDirectSunExposure, true)
  assert.equal(context.historicalSummary10d.aboveGenusUvMaxDays, 2)
  assert.equal(context.thresholds.version, 'care_planner_thresholds_v1')
  assert.equal(context.calculationTrace.watering.formulaVersion, 'watering_planner_v21')
  assert.equal(
    context.calculationTrace.fertilizing.formulaVersion,
    'fertilizing_planner_v7_configurable'
  )
  assert.ok(context.outputs.lightContext.includes(LIGHT_CONTEXTS.EXCESS_LIGHT_OR_SUNBURN_RISK))
})

console.log('environment-care-context tests passed')
