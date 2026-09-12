'use strict'

/**
 * 浇水算法跑批测试脚本
 *
 * 对 10 个喜水差异植物 × 6 种盆型 × 4 种天气 × 3 种浇水间隔 = 720 组合，
 * 直接调 buildWateringPlanner 纯函数（绕过 HTTP），生成审计 JSON。
 *
 * 用法：
 *   node scripts/dev/run-watering-batch-test.mjs
 *
 * 输出：
 *   public/test/batch-results/watering-batch-results.json
 *
 * 说明：输出到 public/ 下，vite 开发服务器可直接 serve，供 H5 审计页 fetch 加载。
 */

import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { formatMlRangeToBottleText } from '../../src/utils/water-volume-format.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..')
const require = createRequire(join(projectRoot, 'package.json'))

const { buildWateringPlanner } = require(
  join(projectRoot, 'cloudfunctions/layer/utils/watering-planner.js')
)

// ============================================================================
// 1. 10 个喜水差异植物（genus 级别）
// ============================================================================

const PLANTS = [
  {
    genus: 'Nelumbo',
    genusCn: '荷花',
    wateringStrategy: { way: '保持稳定水位/湿泥', freq: [1, 3], unit: '天' },
    quantization: { targetMoistureMid: 0.85, dryTolerance: 'very_low', wetTolerance: 'high' },
    tempMin: 15,
    tempMax: 35,
    humidityMin: 60,
    humidityMax: 90
  },
  {
    genus: 'Nephrolepis',
    genusCn: '肾蕨',
    wateringStrategy: { way: '保持微湿，忌积水', freq: [3, 6], unit: '天' },
    quantization: { targetMoistureMid: 0.65, dryTolerance: 'low', wetTolerance: 'medium_high' },
    tempMin: 12,
    tempMax: 28,
    humidityMin: 50,
    humidityMax: 85
  },
  {
    genus: 'Maranta',
    genusCn: '竹芋',
    wateringStrategy: { way: '保持微湿，表层微干即浇', freq: [4, 7], unit: '天' },
    quantization: { targetMoistureMid: 0.65, dryTolerance: 'low', wetTolerance: 'medium_high' },
    tempMin: 15,
    tempMax: 28,
    humidityMin: 50,
    humidityMax: 80
  },
  {
    genus: 'Monstera',
    genusCn: '龟背竹',
    wateringStrategy: { way: '表层2-3cm微干后浇透', freq: [5, 10], unit: '天' },
    quantization: { targetMoistureMid: 0.45, dryTolerance: 'normal', wetTolerance: 'normal' },
    tempMin: 12,
    tempMax: 30,
    humidityMin: 40,
    humidityMax: 80
  },
  {
    genus: 'Pilea',
    genusCn: '镜面草',
    wateringStrategy: { way: '表层2-3cm微干后浇透', freq: [5, 10], unit: '天' },
    quantization: { targetMoistureMid: 0.45, dryTolerance: 'normal', wetTolerance: 'normal' },
    tempMin: 10,
    tempMax: 28,
    humidityMin: 40,
    humidityMax: 75
  },
  {
    genus: 'Dracaena',
    genusCn: '龙血树',
    wateringStrategy: { way: '盆土大半干后浇透', freq: [10, 20], unit: '天' },
    quantization: { targetMoistureMid: 0.28, dryTolerance: 'high', wetTolerance: 'low' },
    tempMin: 15,
    tempMax: 32,
    humidityMin: 35,
    humidityMax: 70
  },
  {
    genus: 'Zamioculcas',
    genusCn: '金钱树',
    wateringStrategy: { way: '完全干透后浇透', freq: [14, 30], unit: '天' },
    quantization: { targetMoistureMid: 0.28, dryTolerance: 'high', wetTolerance: 'low' },
    tempMin: 15,
    tempMax: 30,
    humidityMin: 30,
    humidityMax: 70
  },
  {
    genus: 'Haworthiopsis',
    genusCn: '十二卷',
    wateringStrategy: { way: '完全干透再浇', freq: [14, 30], unit: '天' },
    quantization: { targetMoistureMid: 0.28, dryTolerance: 'high', wetTolerance: 'low' },
    tempMin: 10,
    tempMax: 30,
    humidityMin: 30,
    humidityMax: 65
  },
  {
    genus: 'Echinocactus',
    genusCn: '金琥',
    wateringStrategy: { way: '完全干透再浇；休眠期控水', freq: [20, 35], unit: '天' },
    quantization: { targetMoistureMid: 0.28, dryTolerance: 'high', wetTolerance: 'low' },
    tempMin: 5,
    tempMax: 35,
    humidityMin: 20,
    humidityMax: 60
  },
  {
    genus: 'Lithops',
    genusCn: '生石花',
    wateringStrategy: { way: '蜕皮期停水，生长期干透后极少量浇', freq: [30, 60], unit: '天' },
    quantization: { targetMoistureMid: 0.28, dryTolerance: 'high', wetTolerance: 'low' },
    tempMin: 10,
    tempMax: 30,
    humidityMin: 20,
    humidityMax: 50
  }
]

// ============================================================================
// 2. 6 种盆型
// ============================================================================

const POTS = [
  {
    id: 'small_no_hole',
    label: '小盆无孔',
    potTopDiameterCm: 12,
    potBottomDiameterCm: 8,
    potHeightCm: 10,
    hasDrainageHole: 'false',
    potMaterial: 'plastic',
    substrateType: 'peat'
  },
  {
    id: 'small_hole',
    label: '小盆有孔',
    potTopDiameterCm: 15,
    potBottomDiameterCm: 10,
    potHeightCm: 12,
    hasDrainageHole: 'true',
    potMaterial: 'plastic',
    substrateType: 'general'
  },
  {
    id: 'mid_hole',
    label: '中盆有孔',
    potTopDiameterCm: 20,
    potBottomDiameterCm: 15,
    potHeightCm: 19,
    hasDrainageHole: 'true',
    potMaterial: 'ceramic',
    substrateType: 'mix'
  },
  {
    id: 'large_hole',
    label: '大盆有孔',
    potTopDiameterCm: 30,
    potBottomDiameterCm: 25,
    potHeightCm: 30,
    hasDrainageHole: 'true',
    potMaterial: 'ceramic',
    substrateType: 'gritty'
  },
  {
    id: 'huge_hole',
    label: '巨盆有孔',
    potTopDiameterCm: 50,
    potBottomDiameterCm: 40,
    potHeightCm: 50,
    hasDrainageHole: 'true',
    potMaterial: 'ceramic',
    substrateType: 'general'
  },
  {
    id: 'mega_no_hole',
    label: '超大盆无孔',
    potTopDiameterCm: 100,
    potBottomDiameterCm: 100,
    potHeightCm: 50,
    hasDrainageHole: 'false',
    potMaterial: 'unknown',
    substrateType: 'unknown'
  }
]

// ============================================================================
// 3. 4 种天气场景（10天历史 + 7天预报）
// ============================================================================

const REFERENCE_DATE = '2026-07-04'

function buildWeatherDays(scenario) {
  const days = []
  // 10 天历史 (D-10 到 D-1)
  for (let i = 10; i >= 1; i--) {
    const date = dateOffset(REFERENCE_DATE, -i)
    days.push(buildWeatherDay(date, scenario, i))
  }
  return days
}

function buildForecastDays(scenario) {
  const days = []
  for (let i = 1; i <= 7; i++) {
    const date = dateOffset(REFERENCE_DATE, i)
    days.push(buildWeatherDay(date, scenario, -i))
  }
  return days
}

function buildWeatherDay(date, scenario, daysAgo) {
  switch (scenario) {
    case 'rainy':
      // 连阴雨：5天降水≥10mm，湿度85-95%
      const isRainy = daysAgo <= 5
      return {
        date,
        tempMaxC: 24,
        tempMinC: 21,
        humidity: isRainy ? 89 : 75,
        precipMm: isRainy ? 15 : 0,
        textDay: isRainy ? '雨' : '阴'
      }
    case 'hot_dry':
      // 炎热干燥：连续 32-35°C，湿度40-50%
      return { date, tempMaxC: 34, tempMinC: 24, humidity: 45, precipMm: 0, textDay: '晴' }
    case 'mild':
      // 温和适宜：22-26°C，湿度60-70%
      return { date, tempMaxC: 25, tempMinC: 20, humidity: 65, precipMm: 0, textDay: '多云' }
    case 'rain_then_sunny':
      // 先雨后晴：前3天降水，后7天晴热
      const isRain = daysAgo >= 8
      const isHot = daysAgo <= 7
      return {
        date,
        tempMaxC: isHot ? 33 : 25,
        tempMinC: isHot ? 25 : 21,
        humidity: isRain ? 88 : 55,
        precipMm: isRain ? 12 : 0,
        textDay: isRain ? '雨' : '晴'
      }
    default:
      return { date, tempMaxC: 25, tempMinC: 20, humidity: 65, precipMm: 0, textDay: '多云' }
  }
}

const WEATHER_SCENARIOS = [
  { id: 'rainy', label: '连阴雨' },
  { id: 'hot_dry', label: '炎热干燥' },
  { id: 'mild', label: '温和适宜' },
  { id: 'rain_then_sunny', label: '先雨后晴' }
]

// ============================================================================
// 4. 3 种浇水间隔
// ============================================================================

const WATERING_INTERVALS = [
  {
    id: 'just_watered',
    label: '刚浇过(D-1)',
    event: { date: dateOffset(REFERENCE_DATE, -1), watered: true, amount: 'normal', amountMl: 550 }
  },
  {
    id: 'normal_7d',
    label: '正常间隔(D-7)',
    event: { date: dateOffset(REFERENCE_DATE, -7), watered: true, amount: 'normal', amountMl: 550 }
  },
  {
    id: 'overdue_20d',
    label: '超期未浇(D-20)',
    event: { date: dateOffset(REFERENCE_DATE, -20), watered: true, amount: 'mist', amountMl: 30 }
  }
]

// ============================================================================
// 5. 辅助函数
// ============================================================================

function dateOffset(baseDate, offsetDays) {
  const d = new Date(baseDate + 'T00:00:00')
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function buildWeatherSummary(dailyRecords, plantContext) {
  const humidityMax = Number(plantContext.humidityMax || 75)
  const humidityMin = Number(plantContext.humidityMin || 35)
  const tempMax = Number(plantContext.temperatureMax || 30)
  const tempMin = Number(plantContext.temperatureMin || 12)
  const summary = {
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 0,
    hotDryDays: 0,
    maxConsecutiveHighHumidityDays: 0,
    maxConsecutiveColdHumidDays: 0,
    maxConsecutiveRainyDays: 0,
    maxConsecutiveHotDryDays: 0
  }
  let streakHigh = 0,
    streakCold = 0,
    streakRain = 0,
    streakDry = 0
  for (const record of dailyRecords) {
    if (!record || typeof record !== 'object') {
      continue
    }
    const humidity = Number(record.humidity ?? record.humidityPercent)
    const tempMaxVal = Number(record.tempMaxC ?? record.tempMax ?? record.temperatureMax)
    const tempMinVal = Number(record.tempMinC ?? record.tempMin ?? record.temperatureMin)
    const precipitation = Number(record.precipMm ?? record.precipitation ?? 0)
    const weatherText = String(record.textDay ?? record.weatherText ?? '')
    const isHighHumidity = !isNaN(humidity) && humidity > humidityMax
    const isHot = !isNaN(tempMaxVal) && tempMaxVal > tempMax
    const isCold = !isNaN(tempMinVal) && tempMinVal < tempMin
    const isRainy = precipitation > 0 || /雨|rain|shower/i.test(weatherText)
    if (isHighHumidity) {
      summary.highHumidityDays++
      streakHigh++
      summary.maxConsecutiveHighHumidityDays = Math.max(
        summary.maxConsecutiveHighHumidityDays,
        streakHigh
      )
    } else {
      streakHigh = 0
    }
    if (isCold && isHighHumidity) {
      summary.coldHumidDays++
      streakCold++
      summary.maxConsecutiveColdHumidDays = Math.max(
        summary.maxConsecutiveColdHumidDays,
        streakCold
      )
    } else {
      streakCold = 0
    }
    if (isRainy) {
      summary.rainyDays++
      streakRain++
      summary.maxConsecutiveRainyDays = Math.max(summary.maxConsecutiveRainyDays, streakRain)
    } else {
      streakRain = 0
    }
    if (isHot && !isNaN(humidity) && humidity < humidityMin) {
      summary.hotDryDays++
      streakDry++
      summary.maxConsecutiveHotDryDays = Math.max(summary.maxConsecutiveHotDryDays, streakDry)
    } else {
      streakDry = 0
    }
  }
  return summary
}

// ============================================================================
// 6. 审计规则
// ============================================================================

function auditCase(testCase, plan, potVolumeMl) {
  const flags = []
  const { plant, pot, weatherScenario, wateringInterval, plannerResult } = testCase
  const [amountLo, amountHi] = plannerResult.amountRangeMl || [0, 0]
  const context = plannerResult.wateringContext
  const reasonCodes = plannerResult.reasonCodes || []

  // 1. 水量合理性：建议水量应在盆体积 5%-100% 范围内
  if (potVolumeMl > 0 && amountHi > 0) {
    const ratioHi = amountHi / potVolumeMl
    const ratioLo = amountLo / potVolumeMl
    if (ratioHi > 1.0) {
      flags.push({
        code: 'AMOUNT_EXCEEDS_POT_VOLUME',
        detail: `建议上限 ${amountHi}ml 超过盆体积 ${potVolumeMl}ml`
      })
    }
    if (ratioLo < 0.02 && amountLo > 0) {
      flags.push({
        code: 'AMOUNT_TOO_LOW',
        detail: `建议下限 ${amountLo}ml 仅占盆体积 ${(ratioLo * 100).toFixed(1)}%`
      })
    }
  }

  // 2. 天气压制：连阴雨场景（非严重超期）context 不应为 too_dry
  //    严重超期（>freq[0]×2）时判 too_dry 是合理的——天气湿信号不应掩盖严重缺水
  const freqMin0 = plant.wateringStrategy.freq[0]
  const isSevereOverdueCase = wateringInterval.id === 'overdue_20d' && freqMin0 * 2 <= 20
  if (weatherScenario.id === 'rainy' && context === 'likely_too_dry' && !isSevereOverdueCase) {
    flags.push({
      code: 'WEATHER_SUPPRESSION_MISSING',
      detail: '连阴雨场景（非严重超期）但判定为 too_dry'
    })
  }

  // 3. 耐旱植物间隔：freq>14 的植物，nextWaterDate 距离上次浇水不应小于 freq[0]
  const freqMin = plant.wateringStrategy.freq[0]
  if (freqMin > 14 && wateringInterval.id === 'just_watered') {
    // 刚浇过一天，下次浇水日期至少应在 freqMin 天后
    if (plannerResult.nextWaterDate) {
      const daysUntilNext = daysBetween(REFERENCE_DATE, plannerResult.nextWaterDate)
      if (daysUntilNext < freqMin - 2) {
        flags.push({
          code: 'INTERVAL_TOO_SHORT',
          detail: `耐旱植物 freq[0]=${freqMin}天，但下次浇水建议 ${daysUntilNext} 天后`
        })
      }
    }
  }

  // 4. 超期未浇：超期场景 context 应为 likely_too_dry
  if (wateringInterval.id === 'overdue_20d' && context === 'keep_baseline_or_check_soil') {
    // 超期20天仍是 baseline 可能漏检
    if (
      !reasonCodes.includes('NO_RECENT_WATERING') &&
      !reasonCodes.includes('INCREASE_WATERING_FREQUENCY')
    ) {
      flags.push({ code: 'OVERDUE_NOT_DETECTED', detail: '超期20天未浇但未触发 overdue 信号' })
    }
  }

  // 5. 油桶级水量文案检查（前端负责换算，用前端函数验证）
  if (amountHi >= 5000) {
    const bottleText = formatMlRangeToBottleText(plannerResult.amountRangeMl)
    if (!bottleText || !bottleText.includes('桶')) {
      flags.push({
        code: 'BUCKET_TEXT_MISSING',
        detail: `建议水量 ${amountHi}ml ≥5000 但文案无油桶: "${bottleText}"`
      })
    }
  }

  // 6. 停止浇水条件检查
  if (plannerResult.stopCondition && context !== 'likely_too_wet') {
    // stopCondition 出现在非 wet 场景可能是误判
  }

  // 7. 喜水植物干旱敏感性：喜湿植物(targetMoistureMid>0.6)超期未浇应有 dry 信号
  if (plant.quantization.targetMoistureMid > 0.6 && wateringInterval.id === 'overdue_20d') {
    if (context !== 'likely_too_dry') {
      flags.push({
        code: 'HYDRophilOUS_DRY_MISSED',
        detail: `喜湿植物超期20天但 context=${context}`
      })
    }
  }

  return flags
}

function daysBetween(date1, date2) {
  const d1 = new Date(date1 + 'T00:00:00')
  const d2 = new Date(date2 + 'T00:00:00')
  return Math.round((d2 - d1) / (24 * 60 * 60 * 1000))
}

// ============================================================================
// 7. 主跑批逻辑
// ============================================================================

async function main() {
  console.log('=== 浇水算法跑批测试 ===')
  console.log(
    `植物 ${PLANTS.length} × 盆型 ${POTS.length} × 天气 ${WEATHER_SCENARIOS.length} × 间隔 ${WATERING_INTERVALS.length} = ${PLANTS.length * POTS.length * WEATHER_SCENARIOS.length * WATERING_INTERVALS.length} 组\n`
  )

  const cases = []
  let count = 0

  for (const plant of PLANTS) {
    for (const pot of POTS) {
      for (const weather of WEATHER_SCENARIOS) {
        for (const interval of WATERING_INTERVALS) {
          count++
          const caseId = `${plant.genus.toLowerCase()}_${pot.id}_${weather.id}_${interval.id}`

          // 构建入参
          const weatherDays = buildWeatherDays(weather.id)
          const forecastDays = buildForecastDays(weather.id)
          const plantContext = {
            temperatureMax: plant.tempMax,
            temperatureMin: plant.tempMin,
            humidityMax: plant.humidityMax,
            humidityMin: plant.humidityMin
          }
          const historical = buildWeatherSummary(weatherDays, plantContext)
          const forecast = buildWeatherSummary(forecastDays, plantContext)

          const behaviorTimeline = {
            referenceDate: REFERENCE_DATE,
            watering_events_10d: [interval.event]
          }

          try {
            const plan = buildWateringPlanner({
              wateringStrategy: plant.wateringStrategy,
              historical,
              forecast,
              behaviorTimeline,
              potProfile: pot,
              wateringQuantization: plant.quantization,
              referenceDate: REFERENCE_DATE
            })

            const potVolumeMl = plan.potGeometry?.potVolumeMl ?? 0
            const plannerResult = {
              nextWaterDate: plan.nextWaterDate,
              wateringContext: plan.wateringContext,
              action: plan.action,
              amountRangeMl: plan.amountRangeMl,
              potVolumeMl,
              stopCondition: plan.stopCondition,
              confidenceLevel: plan.confidenceLevel,
              reasonCodes: plan.reasonCodes,
              effectiveHydrationLoad: plan.effectiveHydrationLoad,
              wetPressureLoad: plan.wetPressureLoad,
              lastEffectiveRootWateredDaysAgo: plan.lastEffectiveRootWateredDaysAgo,
              rootZoneMoistureIndex: plan.rootZoneMoistureIndex,
              userDoseEcho: plan.userDoseEcho
            }

            const testCase = {
              id: caseId,
              plant: {
                genus: plant.genus,
                genusCn: plant.genusCn,
                wateringStrategy: plant.wateringStrategy,
                quantization: plant.quantization
              },
              pot: { id: pot.id, label: pot.label, potProfile: pot, potVolumeMl },
              weatherScenario: { id: weather.id, label: weather.label },
              wateringInterval: { id: interval.id, label: interval.label, event: interval.event },
              plannerResult
            }

            const auditFlags = auditCase(testCase, plan, potVolumeMl)
            testCase.auditFlags = auditFlags

            cases.push(testCase)

            if (count % 50 === 0) {
              console.log(
                `  进度 ${count}/${PLANTS.length * POTS.length * WEATHER_SCENARIOS.length * WATERING_INTERVALS.length}`
              )
            }
          } catch (error) {
            console.error(`✗ 案例 ${caseId} 失败: ${error.message}`)
            cases.push({
              id: caseId,
              plant: { genus: plant.genus, genusCn: plant.genusCn },
              pot: { id: pot.id, label: pot.label },
              weatherScenario: { id: weather.id, label: weather.label },
              wateringInterval: { id: interval.id, label: interval.label },
              plannerResult: null,
              auditFlags: [{ code: 'EXECUTION_ERROR', detail: error.message }]
            })
          }
        }
      }
    }
  }

  // 统计
  const totalCases = cases.length
  const flaggedCases = cases.filter(c => c.auditFlags && c.auditFlags.length > 0)
  const flagCounts = {}
  for (const c of flaggedCases) {
    for (const f of c.auditFlags) {
      flagCounts[f.code] = (flagCounts[f.code] || 0) + 1
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    referenceDate: REFERENCE_DATE,
    totalCases,
    flaggedCount: flaggedCases.length,
    passCount: totalCases - flaggedCases.length,
    flagSummary: flagCounts,
    cases
  }

  // 写入 JSON（输出到 public/ 下，vite dev server 可直接 serve）
  const outputDir = join(__dirname, '../../public/test/batch-results')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'watering-batch-results.json')
  writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')

  console.log(`\n=== 跑批完成 ===`)
  console.log(`总案例: ${totalCases}`)
  console.log(`通过: ${result.passCount}`)
  console.log(`异常: ${flaggedCases.length}`)
  console.log(`异常分布:`)
  for (const [code, cnt] of Object.entries(flagCounts)) {
    console.log(`  ${code}: ${cnt}`)
  }
  console.log(`\n结果已写入: ${outputPath}`)
}

main().catch(err => {
  console.error('跑批失败:', err)
  process.exit(1)
})
