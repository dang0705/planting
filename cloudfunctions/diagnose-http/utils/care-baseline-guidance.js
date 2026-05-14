'use strict'

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeStringList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => normalizeText(item, ''))
        .filter(Boolean)
    )
  )
}

function formatRange(range = [], unit = '') {
  const list = Array.isArray(range) ? range.map(item => Number(item || 0)).filter(item => item > 0) : []
  if (!list.length) {return ''}
  if (list.length === 1 || list[0] === list[list.length - 1]) {
    return `${list[0]}${unit}`
  }
  return `${list[0]}-${list[list.length - 1]}${unit}`
}

function summarizeWateringStrategy(strategy = null) {
  if (!strategy || typeof strategy !== 'object') {return ''}

  const way = normalizeText(strategy?.way)
  const verb = normalizeText(strategy?.verb, '浇')
  const unit = normalizeText(strategy?.unit)
  const freqText = formatRange(strategy?.freq, unit)
  const prefix = way || '按盆土状态调整浇水'
  if (freqText) {
    return `${prefix}，约每${freqText}${verb}一次`
  }
  return prefix
}

function summarizeFertilizationStrategy(strategy = null) {
  if (!strategy || typeof strategy !== 'object') {return ''}

  const type = normalizeText(strategy?.type, '薄肥')
  const unit = normalizeText(strategy?.unit)
  const freqText = formatRange(strategy?.freq, unit)
  const other = normalizeText(strategy?.other)
  const fragments = [type]
  if (freqText) {
    fragments.push(`约每${freqText}一次`)
  }
  if (other) {
    fragments.push(other)
  }
  return fragments.join('，')
}

function summarizeLightStrategy(strategy = null) {
  if (!strategy || typeof strategy !== 'object') {return ''}

  const way = normalizeText(strategy?.way, '按植株反应调整光照')
  const unit = normalizeText(strategy?.unit)
  const freqText = formatRange(strategy?.freq, unit)
  const other = normalizeText(strategy?.other)
  const fragments = [way]
  if (freqText) {
    fragments.push(`约${freqText}`)
  }
  if (other) {
    fragments.push(other)
  }
  return fragments.join('，')
}

function summarizeAirflowStrategy(strategy = null) {
  if (!strategy || typeof strategy !== 'object') {return ''}

  const levelText = {
    low: '通风要求偏低',
    medium: '通风要求中等',
    high: '通风要求较高'
  }[normalizeText(strategy?.level).toLowerCase()] || '需保持稳定通风'
  const sensitivityText = {
    low: '对闷湿不太敏感',
    medium: '对闷湿较敏感',
    high: '对闷湿非常敏感'
  }[normalizeText(strategy?.sensitivity).toLowerCase()] || ''
  return [levelText, sensitivityText].filter(Boolean).join('，')
}

function buildCareBaselineSummary(plantContext = {}) {
  const summary = {
    genus: normalizeText(plantContext?.genus, ''),
    watering: summarizeWateringStrategy(plantContext?.watering || null),
    fertilization: summarizeFertilizationStrategy(plantContext?.fertilization || null),
    light: summarizeLightStrategy(plantContext?.sunning || null),
    ventilation: summarizeAirflowStrategy(plantContext?.ventilation || null)
  }

  return Object.values(summary).some(Boolean) ? summary : null
}

function collectActiveSymptomKeys(observedEvidenceSet = []) {
  return new Set(
    (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
      .filter(
        item =>
          normalizeText(item?.currentStatus || item?.current_status || 'active', 'active') ===
          'active'
      )
      .map(item => normalizeText(item?.symptomKey || item?.symptom_key || '', ''))
      .filter(Boolean)
  )
}

function buildCareGuidance({
  plantContext = {},
  observedEvidenceSet = [],
  primaryProblemKey = '',
  outcomeType = ''
} = {}) {
  const careBaselineSummary = buildCareBaselineSummary(plantContext)
  if (!careBaselineSummary) {
    return {
      careBaselineSummary: null,
      environmentDeviationHints: [],
      nextSteps: [],
      whatToAvoid: []
    }
  }

  const activeSymptomKeys = collectActiveSymptomKeys(observedEvidenceSet)
  const normalizedPrimaryProblemKey = normalizeText(primaryProblemKey, '')
  const normalizedOutcomeType = normalizeText(outcomeType, '')
  const environmentDeviationHints = []
  const nextSteps = []
  const whatToAvoid = []

  const wetContext =
    activeSymptomKeys.has('poor_drainage') ||
    activeSymptomKeys.has('watering_excess_background') ||
    activeSymptomKeys.has('wilting_wet_soil') ||
    activeSymptomKeys.has('bad_root_smell') ||
    activeSymptomKeys.has('roots_black') ||
    activeSymptomKeys.has('roots_mushy') ||
    ['root_rot', 'crown_rot', 'soft_rot', 'overwatering'].includes(normalizedPrimaryProblemKey)

  const dryContext =
    activeSymptomKeys.has('watering_deficit_background') ||
    activeSymptomKeys.has('wilting_dry_soil') ||
    normalizedPrimaryProblemKey === 'underwatering'

  const lightStressContext =
    activeSymptomKeys.has('sunburn_patch') ||
    activeSymptomKeys.has('recent_direct_sun_increase') ||
    activeSymptomKeys.has('leaf_bleaching') ||
    ['sunburn', 'heat_stress'].includes(normalizedPrimaryProblemKey)

  const lowLightContext =
    activeSymptomKeys.has('low_light_context') ||
    normalizedPrimaryProblemKey === 'low_light'

  const fertilizationContext =
    activeSymptomKeys.has('fertilization_gap') ||
    activeSymptomKeys.has('leaf_yellowing') ||
    activeSymptomKeys.has('yellow_new_leaves') ||
    activeSymptomKeys.has('yellow_lower_leaves') ||
    activeSymptomKeys.has('uniform_yellowing') ||
    ['iron_deficiency', 'nitrogen_deficiency', 'nutrient_deficiency'].includes(
      normalizedPrimaryProblemKey
    )

  if (wetContext && (careBaselineSummary.watering || careBaselineSummary.ventilation)) {
    environmentDeviationHints.push(
      `当前线索更像长期偏湿/排水慢。可对照属级基线“${careBaselineSummary.watering || '按盆土状态调水'}”回看最近是否久湿不干，${careBaselineSummary.ventilation ? `并注意${careBaselineSummary.ventilation}` : '并避免闷湿环境'}。`
    )
    nextSteps.push('先检查盆土是否久湿不干、排水孔是否堵塞，再决定是否继续浇水。')
    whatToAvoid.push('不要在盆土已久湿时继续加大浇水或长期套盆积水。')
  }

  if (dryContext && careBaselineSummary.watering) {
    environmentDeviationHints.push(
      `当前线索更像供水不足，可对照属级基线“${careBaselineSummary.watering}”回看是否长期等到过干才浇。`
    )
    nextSteps.push('先确认盆土是否已经长期干透，再决定是否分次补水。')
    whatToAvoid.push('不要在判断未明前忽干忽湿，避免一次性猛浇。')
  }

  if (lightStressContext && careBaselineSummary.light) {
    environmentDeviationHints.push(
      `当前线索更像光照偏强或突然增晒，可对照属级基线“${careBaselineSummary.light}”回看最近是否直晒增加。`
    )
    nextSteps.push('先把植株移回更稳定的光位，避免继续暴晒后再观察。')
    whatToAvoid.push('不要在叶面已受伤时继续暴晒或突然强补光。')
  }

  if (lowLightContext && careBaselineSummary.light) {
    environmentDeviationHints.push(
      `当前线索更像光照偏弱或近期光位变暗，可对照属级基线“${careBaselineSummary.light}”回看最近是否移到了更阴的位置或长期缺少明亮散射光。`
    )
    nextSteps.push('先回看最近 1-2 周的摆放位置，确认是否长期处在更阴、更远离窗边的位置。')
    whatToAvoid.push('不要在没确认方向前同时猛补肥和频繁加大浇水。')
  }

  if (fertilizationContext && careBaselineSummary.fertilization) {
    environmentDeviationHints.push(
      `若近期长期未施肥或换盆后恢复较慢，可结合属级基线“${careBaselineSummary.fertilization}”回看营养供给是否偏弱。`
    )
    nextSteps.push('回看最近 1-2 个生长周期的施肥与换盆记录，再决定是否需要温和补肥。')
    whatToAvoid.push('不要在证据不足时直接重肥猛补。')
  }

  if (
    normalizedOutcomeType === 'uncertain' &&
    !environmentDeviationHints.length &&
    careBaselineSummary.light
  ) {
    environmentDeviationHints.push(
      `当前还不能稳定定性，但可以先对照属级基线“${careBaselineSummary.light}”与“${careBaselineSummary.watering || '按盆土状态调水'}”排查最近是否有明显偏离。`
    )
  }

  return {
    careBaselineSummary,
    environmentDeviationHints: normalizeStringList(environmentDeviationHints),
    nextSteps: normalizeStringList(nextSteps).map((text, index) => ({
      stepId: `care_${index + 1}`,
      text
    })),
    whatToAvoid: normalizeStringList(whatToAvoid)
  }
}

module.exports = {
  buildCareBaselineSummary,
  buildCareGuidance
}
