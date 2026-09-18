const WET_OUTCOMES = new Set(['manual_wet_hold', 'wet_hold', 'wet_forced'])

function text(value = '') {
  return String(value || '').trim()
}

function removeScheduleHint(value = '') {
  return text(value)
    .replace(/；如需设置日历提醒，保存前会再次确认。?/u, '。')
    .replace(/如需设置日历提醒，保存前会再次确认。?/u, '')
    .trim()
}

/**
 * 将视觉盆土结果、人工摸土结果和规划器动作合并成一张用户可读的结果卡。
 * 视觉结果只提供表层线索；最终文案优先表达盆土整体风险，避免同一提醒重复出现。
 */
export function buildWateringSoilDecision({
  visualSoilEvidence = null,
  soilCheck = null,
  wateringContext = '',
  wateringAction = ''
} = {}) {
  const visual =
    visualSoilEvidence && typeof visualSoilEvidence === 'object' ? visualSoilEvidence : {}
  const check = soilCheck && typeof soilCheck === 'object' ? soilCheck : {}
  const outcome = text(visual.outcome)
  const context = text(wateringContext)
  const action = text(wateringAction)
  const surfaceMoist =
    visual.surfaceMoist === true || visual.surfaceState === 'moist' || outcome === 'moist_visible'
  const surfaceDry = visual.surfaceState === 'dry'
  const isDryAlgorithm = context === 'likely_too_dry'
  const isBaselineAlgorithm =
    context === 'baseline' ||
    context === 'keep_baseline_or_check_soil' ||
    action === 'follow_baseline_or_check_soil' ||
    action === 'keep_baseline_or_check_soil'
  const hasWetContext =
    context === 'likely_too_wet' || visual.wetHold === true || WET_OUTCOMES.has(outcome)

  let resultText = '盆土状态需要进一步确认。'
  if (outcome === 'manual_wet_hold' && surfaceMoist) {
    resultText = '视觉初判土表有湿度，手摸确认内部仍有水分，盆土整体偏湿。'
  } else if (outcome === 'manual_wet_hold') {
    resultText = '盆土整体偏湿，内部仍有水分。'
  } else if (surfaceMoist && hasWetContext) {
    resultText = '视觉初判土表尚可但有湿度，结合近期浇水和当前环境，盆土整体偏湿。'
  } else if (surfaceMoist && isDryAlgorithm) {
    resultText = '视觉初判土表有湿度，但结合浇水记录和当前环境，当前判断偏干。'
  } else if (surfaceMoist && isBaselineAlgorithm) {
    resultText = '视觉初判土表尚可但有湿度，结合近期浇水和当前环境，盆内可能较湿。'
  } else if (
    hasWetContext &&
    (outcome === 'algorithm_wet_protected' || (surfaceDry && context === 'likely_too_wet'))
  ) {
    resultText = '视觉初判土表偏干，但结合近期浇水和当前环境，盆土可能偏湿。'
  } else if (hasWetContext && (outcome === 'wet_hold' || outcome === 'wet_forced')) {
    resultText = '土表仍湿，结合近期浇水和当前环境，盆内可能尚未干透。'
  } else if (hasWetContext) {
    resultText = '结合近期浇水和当前环境，盆土可能偏湿。'
  } else if (outcome === 'dry_trusted') {
    resultText = '视觉初判土表偏干，结合浇水记录和当前环境，当前判断偏干。'
  } else if (outcome === 'dry_manual_check') {
    resultText = '土表偏干，盆内状态仍需确认。'
  } else if (isDryAlgorithm) {
    resultText = '结合浇水记录和当前环境，当前判断偏干。'
  } else if (isBaselineAlgorithm) {
    resultText = '视觉初判未明确，结合近期浇水和当前环境，当前按常规节奏判断。'
  }

  let actionText = removeScheduleHint(check.message)
  if (hasWetContext) {
    actionText = '本次先不要浇水，等盆土进一步变干后再判断。'
  } else if (outcome === 'dry_trusted') {
    actionText = '建议尽快浇水。'
  }

  return {
    resultText,
    actionText: actionText || '请结合盆土实际状态再决定是否浇水。'
  }
}
