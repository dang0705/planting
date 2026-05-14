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

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value || 0)))
}

const PATTERN_LABELS = {
  spots: '斑点模式',
  blotch: '斑块模式',
  blotches: '斑驳模式',
  rings: '环斑模式',
  powder: '粉层模式',
  mold: '霉层模式',
  speckling: '点状失绿模式',
  sticky: '蜜露/黏附模式',
  webbing: '蛛网模式',
  chew: '啃食缺口模式',
  holes: '虫咬穿孔模式',
  skeletonization: '骨架化取食模式',
  tunnels: '潜道模式',
  burn: '灼伤模式',
  tear: '撕裂/风伤模式',
  soft: '软腐模式',
  soaked: '水浸模式'
}

const LOCATION_LABELS = {
  leaf: '叶片',
  stem: '茎部',
  root: '根部',
  root_crown: '根颈/基部',
  whole_plant: '整株',
  flower: '花部',
  fruit: '果部',
  soil: '盆土'
}

function resolvePatternLabel(patternKey = '') {
  return PATTERN_LABELS[normalizeText(patternKey)] || '异常模式'
}

function resolveLocationLabel(locationKey = '') {
  return LOCATION_LABELS[normalizeText(locationKey)] || '局部'
}

function buildDerivedEvidenceId(patternKey = '', locationKey = '', distributionKey = '') {
  return [
    'derived_rule',
    'pattern',
    normalizeText(patternKey, 'unknown_pattern'),
    normalizeText(locationKey, 'unknown_location'),
    normalizeText(distributionKey, 'generic_scope')
  ].join('::')
}

function buildDerivedEvidenceSet({
  observedEvidenceSet = [],
  symptomDictionary = []
} = {}) {
  const symptomMetaMap = new Map(
    (Array.isArray(symptomDictionary) ? symptomDictionary : [])
      .map(item => [normalizeText(item?.symptomKey, ''), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )
  const grouped = new Map()

  for (const item of Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []) {
    const currentStatus = normalizeText(
      item?.currentStatus || item?.current_status || 'active',
      'active'
    ).toLowerCase()
    if (currentStatus !== 'active') {continue}

    const symptomKey = normalizeText(item?.symptomKey || item?.symptom_key || '', '')
    if (!symptomKey) {continue}

    const symptomMeta = symptomMetaMap.get(symptomKey) || {}
    const patternKey = normalizeText(item?.patternKey || symptomMeta?.patternKey || '', '')
    if (!patternKey) {continue}

    const locationKey = normalizeText(item?.locationKey || symptomMeta?.locationKey || '', '')
    const distributionKey = normalizeText(
      item?.distributionKey || symptomMeta?.distributionKey || '',
      ''
    )
    const derivedEvidenceId = buildDerivedEvidenceId(patternKey, locationKey, distributionKey)
    const current = grouped.get(derivedEvidenceId) || {
      derivedEvidenceId,
      derivedEvidenceKey: `pattern:${patternKey}`,
      derivedEvidenceType: 'pattern',
      patternKey,
      locationKey,
      distributionKey,
      label: `${resolveLocationLabel(locationKey)}${resolvePatternLabel(patternKey)}`,
      sourceType: 'derived_rule',
      evidenceState: 'present',
      confidence: 0,
      parentEvidenceKeys: [],
      parentSymptomKeys: [],
      independenceGroupIds: [],
      enteredRuntime: 1,
      enteredExplanation: 1
    }

    current.confidence = Math.max(current.confidence, clamp01(item?.confidence || 0))
    current.parentEvidenceKeys = normalizeStringList([
      ...current.parentEvidenceKeys,
      normalizeText(item?.observedEvidenceSetId || item?.observed_evidence_set_id || '', ''),
      normalizeText(item?.evidenceKey || item?.evidence_key || symptomKey, symptomKey)
    ])
    current.parentSymptomKeys = normalizeStringList([...current.parentSymptomKeys, symptomKey])
    current.independenceGroupIds = normalizeStringList([
      ...current.independenceGroupIds,
      ...(Array.isArray(item?.independenceGroupIds)
        ? item.independenceGroupIds
        : Array.isArray(item?.independence_group_ids)
          ? item.independence_group_ids
          : [])
    ])
    grouped.set(derivedEvidenceId, current)
  }

  return Array.from(grouped.values())
    .map(item => ({
      ...item,
      confidence: clamp01(
        item.confidence + Math.max(0, item.parentSymptomKeys.length - 1) * 0.05
      )
    }))
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
}

function normalizePublicDerivedEvidenceItem(item = {}) {
  const derivedEvidenceId = normalizeText(
    item?.derivedEvidenceId || item?.derived_evidence_id || '',
    ''
  )
  if (!derivedEvidenceId) {
    return null
  }

  return {
    derivedEvidenceId,
    derivedEvidenceKey: normalizeText(
      item?.derivedEvidenceKey || item?.derived_evidence_key || '',
      ''
    ),
    derivedEvidenceType: normalizeText(
      item?.derivedEvidenceType || item?.derived_evidence_type || '',
      ''
    ),
    patternKey: normalizeText(item?.patternKey || item?.pattern_key || '', ''),
    locationKey: normalizeText(item?.locationKey || item?.location_key || '', ''),
    distributionKey: normalizeText(
      item?.distributionKey || item?.distribution_key || '',
      ''
    ),
    label: normalizeText(item?.label || item?.labelCn || '', ''),
    sourceType: normalizeText(item?.sourceType || item?.source_type || 'derived_rule', 'derived_rule'),
    evidenceState: normalizeText(
      item?.evidenceState || item?.evidence_state || 'present',
      'present'
    ),
    confidence: Number(item?.confidence || 0),
    parentEvidenceKeys: normalizeStringList(
      item?.parentEvidenceKeys || item?.parent_evidence_keys || []
    ),
    parentSymptomKeys: normalizeStringList(
      item?.parentSymptomKeys || item?.parent_symptom_keys || []
    ),
    independenceGroupIds: normalizeStringList(
      item?.independenceGroupIds || item?.independence_group_ids || []
    ),
    enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
    enteredExplanation: Number(item?.enteredExplanation ?? item?.entered_explanation ?? 0) ? 1 : 0
  }
}

function normalizePublicDerivedEvidenceSet(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => normalizePublicDerivedEvidenceItem(item))
    .filter(Boolean)
}

module.exports = {
  buildDerivedEvidenceSet,
  normalizePublicDerivedEvidenceItem,
  normalizePublicDerivedEvidenceSet
}
