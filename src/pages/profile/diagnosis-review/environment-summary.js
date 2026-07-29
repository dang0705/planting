import { formatDetailLines } from './basic-format.js'
import { stringifyCompact } from './record-format.js'
import { isPlainRecord } from './labels.js'

export function getEnvironmentCareCalculation(detail = null) {
  const calculation = detail?.environmentCareCalculation || null
  return isPlainRecord(calculation) ? calculation : null
}

export function formatEnvironmentCareResult(result = null) {
  if (!isPlainRecord(result)) {
    return '无'
  }
  const labels = [
    result.wateringContext ? `浇水=${result.wateringContext}` : '',
    result.fertilizingAction ? `施肥=${result.fertilizingAction}` : '',
    result.lightContext
      ? `光照=${Array.isArray(result.lightContext) ? result.lightContext.join(',') : result.lightContext}`
      : ''
  ].filter(Boolean)
  if (labels.length) {
    return labels.join(' / ')
  }
  return stringifyCompact(result)
}

export function formatEnvironmentCareHighHumidityMetric(calculation = null) {
  const keyMetrics = isPlainRecord(calculation?.keyMetrics) ? calculation.keyMetrics : {}
  const historicalSummary = isPlainRecord(calculation?.inputs?.historicalSummary10d)
    ? calculation.inputs.historicalSummary10d
    : {}
  const thresholds = isPlainRecord(historicalSummary.thresholds) ? historicalSummary.thresholds : {}
  const highHumidityDays = Number(
    keyMetrics.highHumidityDays ?? historicalSummary.highHumidityDays ?? 0
  )
  const maxConsecutiveHighHumidityDays = Number(
    keyMetrics.maxConsecutiveHighHumidityDays ??
      historicalSummary.maxConsecutiveHighHumidityDays ??
      0
  )
  const humidityMaxPercent = keyMetrics.humidityMaxPercent ?? thresholds.humidityMaxPercent ?? null
  const thresholdText =
    humidityMaxPercent === null || humidityMaxPercent === undefined
      ? '适湿上限未返回'
      : `属级适湿上限 ${humidityMaxPercent}%`
  return `历史高湿天数 ${highHumidityDays} 天 / 连续高湿 ${maxConsecutiveHighHumidityDays} 天 / ${thresholdText}`
}

export function formatEnvironmentCareThresholdFactors(calculation = null) {
  const factors = isPlainRecord(calculation?.thresholdFactors) ? calculation.thresholdFactors : {}
  const highHumidityDaysMin = Number(factors.wetHighHumidityDaysMin ?? 0)
  const highHumidityConsecutiveDaysMin = Number(factors.wetHighHumidityConsecutiveDaysMin ?? 0)
  const coldHumidDaysMin = Number(factors.wetColdHumidDaysMin ?? 0)
  const coldHumidConsecutiveDaysMin = Number(factors.wetColdHumidConsecutiveDaysMin ?? 0)
  const rainyDaysMin = Number(factors.wetRainyDaysMin ?? 0)
  const rainyConsecutiveDaysMin = Number(factors.wetRainyConsecutiveDaysMin ?? 0)
  const wetPressureDeductionPerHit = Number(factors.wetPressureDeductionPerHit ?? 0)
  return [
    `高湿命中：历史高湿天数 >= ${highHumidityDaysMin} 或连续高湿天数 >= ${highHumidityConsecutiveDaysMin}`,
    `冷湿命中：历史冷湿天数 >= ${coldHumidDaysMin} 或连续冷湿天数 >= ${coldHumidConsecutiveDaysMin}`,
    `多雨命中：历史下雨天数 >= ${rainyDaysMin} 或连续下雨天数 >= ${rainyConsecutiveDaysMin}`,
    `偏湿扣减：每命中 1 项扣 ${wetPressureDeductionPerHit}`
  ].join(' / ')
}

export function getEnvironmentCareCalculationSummaryRows(detail = null) {
  const calculation = getEnvironmentCareCalculation(detail)
  if (!calculation) {
    return []
  }
  return [
    {
      key: 'environmentCareCalculation.version',
      label: '算法版本',
      value: calculation.version || '未返回'
    },
    {
      key: 'environmentCareCalculation.inputs',
      label: '输入摘要',
      value:
        [
          calculation.inputs?.behaviorSummary10d ? '最近10天行为' : '',
          calculation.inputs?.historicalSummary10d ? '历史10天天气' : '',
          calculation.inputs?.forecastSummary15d ? '未来15天预报' : ''
        ]
          .filter(Boolean)
          .join(' / ') || '未返回'
    },
    {
      key: 'environmentCareCalculation.keyMetrics.highHumidityDays',
      label: '历史高湿天数',
      value: formatEnvironmentCareHighHumidityMetric(calculation)
    },
    {
      key: 'environmentCareCalculation.thresholds',
      label: '阈值因子',
      value: formatEnvironmentCareThresholdFactors(calculation)
    },
    {
      key: 'environmentCareCalculation.result',
      label: '输出结果',
      value: formatEnvironmentCareResult(calculation.result)
    }
  ]
}

export function formatEnvironmentCareBaseline(value = null) {
  if (!isPlainRecord(value)) {
    return 'baseline 未返回'
  }
  return (
    Object.entries(value)
      .map(([key, item]) => `${key}=${Array.isArray(item) ? item.join(',') : String(item ?? '')}`)
      .join(' / ') || 'baseline 未返回'
  )
}

export function formatEnvironmentCareReasons(reasons = []) {
  return formatDetailLines(Array.isArray(reasons) ? reasons : [], '无原因记录', { limit: 6 })
}
