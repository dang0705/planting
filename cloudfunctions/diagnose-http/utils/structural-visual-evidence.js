'use strict'

const STRUCTURAL_DAMAGE_SYMPTOM_KEYS = new Set([
  'holes_in_leaf',
  'chewed_edges',
  'skeletonized_leaves',
  'tunnels_in_leaf'
])

const BROAD_ORGAN_KEYS = new Set(['whole_plant', 'unknown', 'other'])

const HIGH_SPECIFICITY_STRUCTURAL_CUES = {
  holes_in_leaf: [
    '背景',
    '透过',
    '后方',
    '被咬穿',
    '贯穿',
    '穿孔边缘',
    '孔洞边界',
    '清晰洞口'
  ],
  chewed_edges: ['叶缘', '边缘缺口', '一口一口', '啃掉', '啃食边缘'],
  skeletonized_leaves: ['只剩叶脉', '叶脉骨架', '骨架化', '网状残留', '半透明网状'],
  tunnels_in_leaf: ['潜道', '蛇形', '蜿蜒', '叶内隧道']
}

const GENERIC_STRUCTURAL_PHRASES = [
  '洞或缺损',
  '真洞口或缺损',
  '洞口或缺损',
  '缺损情况',
  '存在洞',
  '有洞叶片'
]

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

function isStructuralDamageSymptomKey(symptomKey = '') {
  return STRUCTURAL_DAMAGE_SYMPTOM_KEYS.has(normalizeText(symptomKey, ''))
}

function collectStructuralEvidenceText(candidate = {}) {
  return [
    candidate?.supporting_region_note,
    ...(Array.isArray(candidate?.support_view_groups)
      ? candidate.support_view_groups.map(item => item?.supporting_region_note)
      : []),
    ...(Array.isArray(candidate?.normalization_notes) ? candidate.normalization_notes : [])
  ]
    .map(item => normalizeText(item, ''))
    .filter(Boolean)
    .join(' ')
}

function hasGenericOnlyStructuralWording(text = '') {
  const normalized = normalizeText(text, '')
  if (!normalized) {return true}

  const hasGenericPhrase = GENERIC_STRUCTURAL_PHRASES.some(phrase => normalized.includes(phrase))
  if (!hasGenericPhrase) {return false}

  return ![
    '背景',
    '透过',
    '被咬穿',
    '边缘',
    '叶缘',
    '叶脉',
    '潜道',
    '蛇形'
  ].some(keyword => normalized.includes(keyword))
}

function hasHighSpecificityStructuralCue(candidate = {}) {
  const symptomKey = normalizeText(candidate?.symptom_key || candidate?.symptomKey || '', '')
  if (!isStructuralDamageSymptomKey(symptomKey)) {
    return true
  }

  const evidenceText = collectStructuralEvidenceText(candidate)
  if (!evidenceText || hasGenericOnlyStructuralWording(evidenceText)) {
    return false
  }

  const cues = HIGH_SPECIFICITY_STRUCTURAL_CUES[symptomKey] || []
  return cues.some(keyword => evidenceText.includes(keyword))
}

function isBroadOnlySupport(candidate = {}) {
  const supportOrgans = normalizeStringList(candidate?.support_organs || candidate?.supportOrgans || [])
  if (!supportOrgans.length) {return true}
  return supportOrgans.every(item => BROAD_ORGAN_KEYS.has(item))
}

function isWeakBroadStructuralCandidate(candidate = {}) {
  const symptomKey = normalizeText(candidate?.symptom_key || candidate?.symptomKey || '', '')
  if (!isStructuralDamageSymptomKey(symptomKey)) {
    return false
  }

  const supportCount = Number(candidate?.support_count ?? candidate?.supportCount ?? 0)
  return supportCount <= 1 && isBroadOnlySupport(candidate) && !hasHighSpecificityStructuralCue(candidate)
}

function resolveStructuralVisualEvidenceStatus(candidate = {}) {
  const symptomKey = normalizeText(candidate?.symptom_key || candidate?.symptomKey || '', '')
  if (!isStructuralDamageSymptomKey(symptomKey)) {
    return 'not_structural_damage'
  }

  if (isWeakBroadStructuralCandidate(candidate)) {
    return 'broad_structural_candidate_needs_user_confirmation'
  }

  return hasHighSpecificityStructuralCue(candidate)
    ? 'high_specificity_structural_visual'
    : 'structural_visual_accepted'
}

function isWeakBroadStructuralObservedEvidence(evidence = {}) {
  const symptomKey = normalizeText(evidence?.symptomKey || evidence?.symptom_key || '', '')
  if (!isStructuralDamageSymptomKey(symptomKey)) {
    return false
  }

  const sourceType = normalizeText(evidence?.sourceType || evidence?.source_type || '', '')
  const isVisualSource =
    sourceType === 'visual_admitted' ||
    sourceType === 'visual_admission' ||
    String(evidence?.parentEvidenceKey || evidence?.parent_evidence_key || '').startsWith('visual_admission:')
  if (!isVisualSource) {
    return false
  }

  return (
    normalizeText(
      evidence?.visualStructuralEvidenceStatus || evidence?.visual_structural_evidence_status || '',
      ''
    ) === 'broad_structural_candidate_needs_user_confirmation'
  )
}

module.exports = {
  STRUCTURAL_DAMAGE_SYMPTOM_KEYS,
  isStructuralDamageSymptomKey,
  hasHighSpecificityStructuralCue,
  isWeakBroadStructuralCandidate,
  isWeakBroadStructuralObservedEvidence,
  resolveStructuralVisualEvidenceStatus
}
