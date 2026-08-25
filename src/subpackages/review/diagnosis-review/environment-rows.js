import {
  formatEnvironmentCareBaseline,
  formatEnvironmentCareReasons,
  getEnvironmentCareCalculation
} from './environment-summary.js'
import { isPlainRecord } from './labels.js'
import { formatPlannerFormulaLines } from './formula.js'

export function getEnvironmentCareCalculationRows(detail = null) {
  const calculation = getEnvironmentCareCalculation(detail)
  if (!calculation) {
    return []
  }
  const watering = isPlainRecord(calculation.watering) ? calculation.watering : {}
  const fertilizing = isPlainRecord(calculation.fertilizing) ? calculation.fertilizing : {}
  const light = isPlainRecord(calculation.light) ? calculation.light : {}
  return [
    {
      key: 'watering.formula',
      title: '浇水公式与过程',
      meta: [
        watering.wateringContext ? `context=${watering.wateringContext}` : '',
        watering.action ? `action=${watering.action}` : '',
        formatEnvironmentCareBaseline(watering.baseline)
      ]
        .filter(Boolean)
        .join(' / '),
      value: formatEnvironmentCareReasons(watering.reasons),
      formula: watering.formula || null,
      formulaLines: formatPlannerFormulaLines(watering.formula)
    },
    {
      key: 'fertilizing.formula',
      title: '施肥公式与过程',
      meta: [
        fertilizing.action ? `action=${fertilizing.action}` : '',
        fertilizing.lastFertilizedBucket ? `last=${fertilizing.lastFertilizedBucket}` : '',
        formatEnvironmentCareBaseline(fertilizing.baseline)
      ]
        .filter(Boolean)
        .join(' / '),
      value: formatEnvironmentCareReasons(fertilizing.reasons),
      formula: fertilizing.formula || null,
      formulaLines: formatPlannerFormulaLines(fertilizing.formula)
    },
    {
      key: 'light.formula',
      title: '光照过程',
      meta: [
        light.realExposureScene ? '真实暴露场景=true' : '真实暴露场景=false',
        Array.isArray(light.lightContext) && light.lightContext.length
          ? `context=${light.lightContext.join(',')}`
          : ''
      ]
        .filter(Boolean)
        .join(' / '),
      value: light.formula ? '见下方过程 JSON' : '未返回光照计算过程',
      formula: light.formula || null,
      formulaLines: formatPlannerFormulaLines(light.formula)
    }
  ]
}
