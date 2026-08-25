import { isPlainRecord } from './labels.js'
import { stringifyCompact } from './record-format.js'

export const formulaStepLabelMap = {
  max_reasonable_waterings_10d: '最近 10 天基线允许浇水次数',
  high_humidity_pressure_hit: '高湿命中',
  cold_humid_pressure_hit: '冷湿命中',
  rainy_pressure_hit: '多雨命中',
  wet_pressure_score: '偏湿环境扣减分',
  effective_wet_waterings_10d: '偏湿修正后的过浇阈值',
  too_wet_condition: '过浇判断',
  too_dry_condition: '缺水判断',
  condition_answers_required: '施肥条件待确认',
  monthly_interval_due: '月表周期已到',
  monthly_interval_not_due: '月表周期未到'
}

export const formulaTermLabelMap = {
  behaviorWindowDays: '行为窗口天数',
  minIntervalDays: '属级最小浇水间隔',
  lookbackWindowDays: '动态回看窗口天数',
  effectiveHydrationLoad: '有效水合负载',
  wetPressureLoad: '湿压负载',
  lastEffectiveRootWateredDaysAgo: '距上次有效根区浇水天数',
  rootZoneMoistureIndex: '根区湿度指数',
  potGeometryDryDownFactor: '盆型干透因子',
  drainageRiskFactor: '排水风险因子',
  maxReasonableWaterings10d: '最近 10 天基线允许浇水次数',
  wetPressureHitCount: '偏湿环境命中数',
  wetPressureDeductionPerHit: '每个偏湿命中的扣减值',
  wetPressureScore: '偏湿环境扣减分',
  effectiveWetWaterings10d: '偏湿修正后的过浇阈值',
  highHumidityDays: '历史高湿天数',
  maxConsecutiveHighHumidityDays: '连续高湿天数',
  wetHighHumidityDaysMin: '高湿天数阈值',
  wetHighHumidityConsecutiveDaysMin: '连续高湿天数阈值',
  coldHumidDays: '历史冷湿天数',
  maxConsecutiveColdHumidityDays: '连续冷湿天数',
  wetColdHumidDaysMin: '冷湿天数阈值',
  wetColdHumidConsecutiveDaysMin: '连续冷湿天数阈值',
  rainyDays: '历史下雨天数',
  maxConsecutiveRainyDays: '连续下雨天数',
  wetRainyDaysMin: '下雨天数阈值',
  wetRainyConsecutiveDaysMin: '连续下雨天数阈值',
  highHumidityPressureHit: '高湿命中',
  coldHumidPressureHit: '冷湿命中',
  rainyPressureHit: '多雨命中',
  forecastHotDryHit: '未来高温干燥命中',
  lastWateredTooLongAgo: '距上次浇水过久',
  historicalHotDryHit: '历史高温干燥命中',
  lastWateredDaysAgo: '距上次浇水天数',
  lastFertilizedBucket: '末次施肥时间桶',
  result: '结果'
}

export const formulaValueLabelMap = {
  within_10d: '10 天内',
  within_30d: '30 天内',
  d45_90: '45 至 90 天',
  over_90d: '超过 90 天',
  unknown: '未知',
  normal: '正常',
  pause: '暂停',
  monthly_no_reliable_rule: '暂无可靠月度规则',
  monthly_history_unavailable: '施肥记录暂不可用',
  monthly_history_not_available: '尚未关联用户植物记录',
  monthly_first_confirmation: '首次确认',
  monthly_conditions_pending: '施肥条件待确认',
  monthly_not_due: '尚未到周期',
  monthly_due_check: '可以检查是否施肥',
  monthly_pause: '本月暂停',
  likely_too_wet: '可能偏湿',
  likely_too_dry: '可能偏干',
  keep_baseline_or_check_soil: '维持基线或查土'
}

export function formatFormulaLabel(key = '') {
  const normalizedKey = String(key || '').trim()
  return (
    formulaStepLabelMap[normalizedKey] ||
    formulaTermLabelMap[normalizedKey] ||
    normalizedKey ||
    '未命名步骤'
  )
}

export function formatFormulaTechnicalLabel(key = '') {
  const normalizedKey = String(key || '').trim()
  const label = formatFormulaLabel(normalizedKey)
  return normalizedKey && label !== normalizedKey ? `${label}（${normalizedKey}）` : label
}

export function formatFormulaValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => formatFormulaValue(item)).join(', ')}]`
  }
  if (value === null || value === undefined) {
    return '未返回'
  }
  if (typeof value === 'boolean') {
    return value ? '命中' : '未命中'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NaN'
  }
  if (typeof value === 'string') {
    const valueLabel = formulaValueLabelMap[value]
    return valueLabel ? `${valueLabel}（${value}）` : `"${value}"`
  }
  if (isPlainRecord(value)) {
    return stringifyCompact(value).replace(/\s+/g, ' ')
  }
  return String(value)
}

export function translateFormulaOperators(expression = '') {
  return String(expression || '')
    .replaceAll('&&', '且')
    .replaceAll('||', '或')
    .replaceAll('===', '=')
    .replaceAll('.includes(', ' 包含(')
    .replaceAll('ceil(', '向上取整(')
    .replaceAll('max(', '取最大值(')
    .trim()
}

export function translateFormulaExpression(expression = '') {
  const keys = Object.keys(formulaTermLabelMap)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
  return keys.reduce((current, key) => {
    const pattern = new RegExp(`\\b${escapeRegexLiteral(key)}\\b`, 'g')
    return current.replace(pattern, formatFormulaTechnicalLabel(key))
  }, translateFormulaOperators(expression))
}

export function escapeRegexLiteral(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function substituteFormulaExpression(expression = '', scope = {}) {
  const keys = Object.keys(scope || {})
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
  return keys.reduce((current, key) => {
    const pattern = new RegExp(`\\b${escapeRegexLiteral(key)}\\b`, 'g')
    return current.replace(pattern, formatFormulaValue(scope[key]))
  }, translateFormulaOperators(expression))
}

export function formatFormulaResult(step = {}) {
  const result = Object.prototype.hasOwnProperty.call(step, 'result') ? step.result : ''
  const passedText = Object.prototype.hasOwnProperty.call(step, 'passed')
    ? `；判定=${step.passed ? '通过' : '未通过'}`
    : ''
  return `${formatFormulaValue(result)}${passedText}`
}

export function formatFormulaProcessResult(step = {}) {
  return Object.prototype.hasOwnProperty.call(step, 'result')
    ? formatFormulaValue(step.result)
    : '未返回'
}

export function formatFormulaBooleanCondition(label, value) {
  return `${label}=${formatFormulaValue(Boolean(value))}`
}

export function formatFormulaIncludesProcess(list = [], value = '') {
  const normalizedList = Array.isArray(list) ? list : []
  const hit = normalizedList.includes(value)
  return `${formatFormulaValue(normalizedList)} 包含 ${formatFormulaValue(value)} = ${formatFormulaValue(hit)}`
}

export function formatGenericFormulaProcessLine(step = {}, substitutedExpression = '') {
  return `计算过程：${substitutedExpression || '无公式'} => ${formatFormulaProcessResult(step)}`
}

export function formatFormulaComparisonProcess({
  leftLabel = '',
  leftValue,
  operator = '>=',
  rightLabel = '',
  rightValue
} = {}) {
  const hit = operator === '>=' ? Number(leftValue) >= Number(rightValue) : false
  return `${leftLabel} ${operator} ${rightLabel} = ${formatFormulaValue(leftValue)} ${operator} ${formatFormulaValue(rightValue)} = ${formatFormulaValue(hit)}`
}

export function formatPlannerFormulaProcessLines(step = {}, key = '', substitutedExpression = '') {
  const inputs = isPlainRecord(step?.inputs) ? step.inputs : {}
  const thresholds = isPlainRecord(step?.thresholds) ? step.thresholds : {}
  switch (key) {
    case 'max_reasonable_waterings_10d': {
      const divided = Number(inputs.behaviorWindowDays) / Number(inputs.minIntervalDays)
      return [
        `计算过程：行为窗口天数 / 属级最小浇水间隔 = ${formatFormulaValue(inputs.behaviorWindowDays)} / ${formatFormulaValue(inputs.minIntervalDays)} = ${formatFormulaValue(divided)}`,
        `计算过程：向上取整(${formatFormulaValue(divided)}) = ${formatFormulaProcessResult(step)}`
      ]
    }
    case 'high_humidity_pressure_hit': {
      const historicalHit =
        Number(inputs.highHumidityDays) >= Number(thresholds.wetHighHumidityDaysMin)
      const consecutiveHit =
        Number(inputs.maxConsecutiveHighHumidityDays) >=
        Number(thresholds.wetHighHumidityConsecutiveDaysMin)
      return [
        `计算过程：${formatFormulaComparisonProcess({ leftLabel: '历史高湿天数', leftValue: inputs.highHumidityDays, rightLabel: '高湿天数阈值', rightValue: thresholds.wetHighHumidityDaysMin })}`,
        `计算过程：${formatFormulaComparisonProcess({ leftLabel: '连续高湿天数', leftValue: inputs.maxConsecutiveHighHumidityDays, rightLabel: '连续高湿天数阈值', rightValue: thresholds.wetHighHumidityConsecutiveDaysMin })}`,
        `计算过程：高湿命中 = ${formatFormulaValue(historicalHit)} 或 ${formatFormulaValue(consecutiveHit)} = ${formatFormulaProcessResult(step)}`
      ]
    }
    case 'cold_humid_pressure_hit': {
      const historicalHit = Number(inputs.coldHumidDays) >= Number(thresholds.wetColdHumidDaysMin)
      const consecutiveHit =
        Number(inputs.maxConsecutiveColdHumidDays) >=
        Number(thresholds.wetColdHumidConsecutiveDaysMin)
      return [
        `计算过程：${formatFormulaComparisonProcess({ leftLabel: '历史冷湿天数', leftValue: inputs.coldHumidDays, rightLabel: '冷湿天数阈值', rightValue: thresholds.wetColdHumidDaysMin })}`,
        `计算过程：${formatFormulaComparisonProcess({ leftLabel: '连续冷湿天数', leftValue: inputs.maxConsecutiveColdHumidDays, rightLabel: '连续冷湿天数阈值', rightValue: thresholds.wetColdHumidConsecutiveDaysMin })}`,
        `计算过程：冷湿命中 = ${formatFormulaValue(historicalHit)} 或 ${formatFormulaValue(consecutiveHit)} = ${formatFormulaProcessResult(step)}`
      ]
    }
    case 'rainy_pressure_hit': {
      const historicalHit = Number(inputs.rainyDays) >= Number(thresholds.wetRainyDaysMin)
      const consecutiveHit =
        Number(inputs.maxConsecutiveRainyDays) >= Number(thresholds.wetRainyConsecutiveDaysMin)
      return [
        `计算过程：${formatFormulaComparisonProcess({ leftLabel: '历史下雨天数', leftValue: inputs.rainyDays, rightLabel: '下雨天数阈值', rightValue: thresholds.wetRainyDaysMin })}`,
        `计算过程：${formatFormulaComparisonProcess({ leftLabel: '连续下雨天数', leftValue: inputs.maxConsecutiveRainyDays, rightLabel: '连续下雨天数阈值', rightValue: thresholds.wetRainyConsecutiveDaysMin })}`,
        `计算过程：多雨命中 = ${formatFormulaValue(historicalHit)} 或 ${formatFormulaValue(consecutiveHit)} = ${formatFormulaProcessResult(step)}`
      ]
    }
    case 'wet_pressure_score': {
      const pressureParts = [
        Number(Boolean(inputs.highHumidityPressureHit)),
        Number(Boolean(inputs.coldHumidPressureHit)),
        Number(Boolean(inputs.rainyPressureHit))
      ]
      const hitExpression = pressureParts.join(' + ')
      return [
        `计算过程：偏湿环境命中 = 高湿(${formatFormulaValue(inputs.highHumidityPressureHit)}) + 冷湿(${formatFormulaValue(inputs.coldHumidPressureHit)}) + 多雨(${formatFormulaValue(inputs.rainyPressureHit)}) = ${hitExpression} = ${formatFormulaValue(inputs.wetPressureHitCount)}`,
        `计算过程：偏湿环境命中数 * 每个命中扣减值 = ${formatFormulaValue(inputs.wetPressureHitCount)} * ${formatFormulaValue(thresholds.wetPressureDeductionPerHit)} = ${formatFormulaProcessResult(step)}`
      ]
    }
    case 'effective_wet_waterings_10d': {
      const deducted = Number(inputs.maxReasonableWaterings10d) - Number(inputs.wetPressureScore)
      return [
        `计算过程：基线允许次数 - 偏湿扣减分 = ${formatFormulaValue(inputs.maxReasonableWaterings10d)} - ${formatFormulaValue(inputs.wetPressureScore)} = ${formatFormulaValue(deducted)}`,
        `计算过程：取最大值(1, ${formatFormulaValue(deducted)}) = ${formatFormulaProcessResult(step)}`
      ]
    }
    case 'too_wet_condition':
      return [
        `计算过程：根区湿度指数 > 0.6 且 湿压负载 > 0.4 = ${formatFormulaValue(inputs.rootZoneMoistureIndex)} > 0.6 且 ${formatFormulaValue(inputs.wetPressureLoad)} > 0.4 = ${formatFormulaProcessResult(step)}`
      ]
    case 'too_dry_condition': {
      const forecastBranch =
        Boolean(inputs.forecastHotDryHit) && Boolean(inputs.lastWateredTooLongAgo)
      const noEffectiveWatering =
        inputs.lastEffectiveRootWateredDaysAgo === null ||
        inputs.lastEffectiveRootWateredDaysAgo === undefined
      const historicalBranch = Boolean(inputs.historicalHotDryHit) && noEffectiveWatering
      return [
        `计算过程：未来干热分支 = ${formatFormulaBooleanCondition('未来高温干燥命中', inputs.forecastHotDryHit)} 且 ${formatFormulaBooleanCondition('距上次浇水过久', inputs.lastWateredTooLongAgo)} = ${formatFormulaValue(forecastBranch)}`,
        `计算过程：历史干热分支 = ${formatFormulaBooleanCondition('历史高温干燥命中', inputs.historicalHotDryHit)} 且 无有效根区浇水记录(${formatFormulaValue(noEffectiveWatering)}) = ${formatFormulaValue(historicalBranch)}`,
        `计算过程：未来干热分支 或 历史干热分支 = ${formatFormulaValue(forecastBranch)} 或 ${formatFormulaValue(historicalBranch)} = ${formatFormulaProcessResult(step)}`
      ]
    }
    default:
      return [formatGenericFormulaProcessLine(step, substitutedExpression)]
  }
}

export function formatPlannerFormulaLines(formula = null) {
  if (!isPlainRecord(formula)) {
    return []
  }
  const steps = Array.isArray(formula.formulas) ? formula.formulas : []
  if (!steps.length) {
    return isPlainRecord(formula.result)
      ? [
          {
            key: 'formula.result',
            title: '结果（result）',
            expression: '公式：结果',
            substitution: `代入：结果 = ${formatFormulaValue(formula.result)}`,
            processLines: [`计算过程：后端返回结果 = ${formatFormulaValue(formula.result)}`]
          }
        ]
      : []
  }
  return steps.map((step, index) => {
    const key = String(step?.key || `step_${index + 1}`).trim()
    const expression = translateFormulaExpression(step?.expression || '')
    const scope = {
      ...(isPlainRecord(step?.inputs) ? step.inputs : {}),
      ...(isPlainRecord(step?.thresholds) ? step.thresholds : {})
    }
    const substitutedExpression = substituteFormulaExpression(step?.expression || '', scope)
    return {
      key,
      title: formatFormulaTechnicalLabel(key),
      expression: `公式：${formatFormulaTechnicalLabel(key)} = ${expression || '无公式'}`,
      substitution: `代入：${formatFormulaTechnicalLabel(key)} = ${substitutedExpression || '无公式'}；结果=${formatFormulaResult(step)}`,
      processLines: formatPlannerFormulaProcessLines(step, key, substitutedExpression)
    }
  })
}
