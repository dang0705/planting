// weather-light-factor 单元测试
// 覆盖契约验收点 a-f：cloud 优先级、icon/text 兜底、证据不足不误判低光、算法消费 recent10d 因子
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  computeSampleLightFactor,
  buildDayLightFeatures,
  aggregateRecentLightFeatures,
  readDayLightFeatures
} = require('../../cloudfunctions/weather-http/services/weather-light-factor.js')
const { estimateLightHealth } = require('../../cloudfunctions/diagnose-http/utils/light-health-estimator.js')
const {
  buildEnvironmentCareContextV7
} = require('../../cloudfunctions/diagnose-http/utils/environment-context-v7.js')

function approxEqual(a, b, eps = 0.01) {
  return Math.abs(a - b) < eps
}

// a. cloud 优先于 icon/text，且不重复扣分
{
  // cloud=80 + icon='104'：cloud 存在时只走 cloud 公式，icon 不再二次扣分
  const cloudAndIcon = computeSampleLightFactor({ cloud: 80, icon: '104' })
  assert.equal(cloudAndIcon.source, 'cloud')
  assert.ok(approxEqual(cloudAndIcon.factor, 0.52), `cloud factor expected 0.52 got ${cloudAndIcon.factor}`)
  // 对照：仅 icon='104' -> 0.55，证明 0.52 来自 cloud 而非 icon 重复扣分
  const iconOnly = computeSampleLightFactor({ icon: '104' })
  assert.equal(iconOnly.source, 'icon')
  assert.ok(approxEqual(iconOnly.factor, 0.55), `icon-only 104 expected 0.55 got ${iconOnly.factor}`)
  // cloud=50 + text='中雨'：仍走 cloud，text 不再拉低（text 单独会到 0.133）
  const cloudAndText = computeSampleLightFactor({ cloud: 50, text: '中雨' })
  assert.equal(cloudAndText.source, 'cloud')
  assert.ok(approxEqual(cloudAndText.factor, 0.7), `cloud+text expected 0.7 got ${cloudAndText.factor}`)
}

// b. cloud 缺失时 icon 优先
{
  const sunny = computeSampleLightFactor({ icon: '100' })
  assert.equal(sunny.source, 'icon')
  assert.ok(approxEqual(sunny.factor, 1.0), `icon 100 expected 1.0 got ${sunny.factor}`)
}

// c. cloud+icon 缺失时 text 兜底
{
  const cloudy = computeSampleLightFactor({ text: '多云' })
  assert.equal(cloudy.source, 'text')
  assert.ok(approxEqual(cloudy.factor, 0.75), `text 多云 expected 0.75 got ${cloudy.factor}`)
}

// d. 缺失样本 / weatherEvidenceInsufficient 不导致低光误判
{
  // 仅 slotName+sourceKind、无 cloud/icon/text：因子保持中性，不产生负扣分
  const sparse = buildDayLightFeatures({
    samples: [{ slotName: 'morning', sourceKind: 'weather_now_sample' }],
    sunWindow: {},
    date: '2026-06-18'
  })
  assert.ok(
    sparse.weatherLightFactor === null ||
      sparse.weatherLightFactor === undefined ||
      sparse.weatherLightFactor >= 0.8,
    `missing-evidence day must not be low light, got ${sparse.weatherLightFactor}`
  )
  assert.equal(sparse.confidence, 'none')

  // weatherEvidenceInsufficient：因子退回中性 1.0，仅降低 confidence
  const insufficient = aggregateRecentLightFeatures(
    [{ dailyRollup: { lightFeatures: { weatherLightFactor: 0.4 } } }],
    { weatherEvidenceInsufficient: true }
  )
  assert.ok(
    approxEqual(insufficient.weatherLightFactor10d, 1.0),
    `evidence-insufficient factor must stay neutral 1.0, got ${insufficient.weatherLightFactor10d}`
  )
  assert.equal(insufficient.lightConfidence, 'low')
}

// aggregateRecentLightFeatures：证据充足 vs 不足
{
  const validDay = factor => ({ dailyRollup: { lightFeatures: { weatherLightFactor: factor } } })
  // 3 个有效日，因子均为 0.6 -> 证据充足，weatherLightFactor10d = 0.6
  const sufficient = aggregateRecentLightFeatures([validDay(0.6), validDay(0.6), validDay(0.6)])
  assert.equal(sufficient.lightEvidenceInsufficient, false)
  assert.ok(approxEqual(sufficient.weatherLightFactor10d, 0.6))
  assert.equal(sufficient.validLightDayCount, 3)
  assert.equal(sufficient.lightConfidence, 'low')

  // < 3 个有效日 -> 证据不足，因子中性 1.0
  const tooFew = aggregateRecentLightFeatures([validDay(0.4), validDay(0.4)])
  assert.equal(tooFew.lightEvidenceInsufficient, true)
  assert.ok(approxEqual(tooFew.weatherLightFactor10d, 1.0))
  assert.equal(tooFew.lightConfidence, 'low')

  const unknownOnly = aggregateRecentLightFeatures([
    { dailyRollup: { lightFeatures: { confidence: 'none' } } },
    { dailyRollup: { lightFeatures: { confidence: 'none' } } },
    { dailyRollup: { lightFeatures: { confidence: 'none' } } }
  ])
  assert.equal(unknownOnly.validLightDayCount, 0)
  assert.equal(unknownOnly.lightEvidenceInsufficient, true)
  assert.equal(unknownOnly.lightConfidence, 'none')
}

// readDayLightFeatures：nested 优先，flat 兜底（不重构 schema）
{
  const nested = readDayLightFeatures({ dailyRollup: { lightFeatures: { weatherLightFactor: 0.55 } } })
  assert.ok(approxEqual(nested.weatherLightFactor, 0.55))

  const flat = readDayLightFeatures({ cloud: 80, iconDay: '104', textDay: '阴', visibilityKm: 1 })
  assert.ok(flat && Number.isFinite(flat.weatherLightFactor))
  assert.equal(flat.dominantWeatherIcon, '104')
  assert.equal(flat.dominantWeatherText, '阴')
}

// e. estimateLightHealth 消费 recent10d.weatherLightFactor10d
// f. lightEvidenceInsufficient / weatherEvidenceInsufficient 时天气因子退回 1.00
{
  const plantContext = { sunning: { way: '明亮散射光', freq: [4, 6] } }
  const userLightContext = {
    facing: 'south',
    windowType: 'standard',
    position: 'window_side',
    hasDirectSun: false
  }
  const weatherDays = [{ sunshineHours: 5, daylightHours: 12, uvIndex: 6, textDay: '晴' }]

  // legacy：无 plantFeatures -> weatherLightFactor=1.0
  const legacy = estimateLightHealth({ plantContext, userLightContext, weatherDays })
  assert.ok(legacy, 'legacy estimate should produce a result')
  assert.ok(approxEqual(legacy.lightHealthEvidence.weather.weatherLightFactor, 1.0))

  // e：recent10d 因子 0.6 -> outdoorEqHours / indoorEqHours 低于 legacy
  const recent = estimateLightHealth({
    plantContext,
    userLightContext,
    weatherDays,
    plantFeatures: { weatherLightFactor10d: 0.6, lightConfidence: 'high' }
  })
  assert.ok(approxEqual(recent.lightHealthEvidence.weather.weatherLightFactor, 0.6))
  assert.equal(recent.lightHealthEvidence.weather.weatherLightConfidence, 'high')
  assert.ok(
    recent.lightHealthEvidence.calculation.indoorEqHours < legacy.lightHealthEvidence.calculation.indoorEqHours,
    `recent indoorEqHours (${recent.lightHealthEvidence.calculation.indoorEqHours}) should be lower than legacy (${legacy.lightHealthEvidence.calculation.indoorEqHours})`
  )

  // f1：lightEvidenceInsufficient -> 因子退回 1.00，indoorEqHours 与 legacy 一致
  const lightInsufficient = estimateLightHealth({
    plantContext,
    userLightContext,
    weatherDays,
    plantFeatures: { weatherLightFactor10d: 0.4, lightEvidenceInsufficient: true }
  })
  assert.ok(approxEqual(lightInsufficient.lightHealthEvidence.weather.weatherLightFactor, 1.0))
  assert.ok(
    approxEqual(
      lightInsufficient.lightHealthEvidence.calculation.indoorEqHours,
      legacy.lightHealthEvidence.calculation.indoorEqHours
    )
  )
  assert.equal(lightInsufficient.lightHealthEvidence.weather.weatherLightConfidence, 'none')

  // f2：top-level weatherEvidenceInsufficient -> 同样退回 1.00
  const weatherInsufficient = buildEnvironmentCareContextV7({
    diagnosisDate: '2026-06-18',
    plantContext,
    userLightContext,
    environmentWeatherWindow: {
      weatherEvidenceInsufficient: true,
      historicalDays: weatherDays,
      plantFeatures: { weatherLightFactor10d: 0.4, lightConfidence: 'high' }
    }
  })
  assert.ok(
    approxEqual(
      weatherInsufficient.outputs.lightHealthEvidence.weather.weatherLightFactor,
      1.0
    )
  )
  assert.equal(weatherInsufficient.outputs.lightHealthEvidence.weather.weatherLightConfidence, 'none')
}
