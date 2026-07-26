'use strict'

const crypto = require('crypto')
const {
  DIAGNOSIS_MODE_REGISTRY,
  GENERIC_EVIDENCE_GROUP_KEYS,
  PEST_EVIDENCE_RULES,
  PEST_MODE_KEYS
} = require('./diagnosis-mode-registry')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

// 置信度分档阈值
const CANDIDATE_ADMIT_CONFIDENCE = 0.6
const STRONG_CANDIDATE_CONFIDENCE = 0.8
const VERY_LIKELY_CANDIDATE_CONFIDENCE = 0.9
const DIRECT_CONCLUSION_CONFIDENCE = 0.95

// 候选模式对应的最大问诊题数（按候选最高置信度档位决定）
const TIER_MAX_QUESTIONS = Object.freeze({
  low: 3,
  medium: 2,
  high: 1,
  very_likely: 1,
  direct: 0
})

const HIGH_BAND = 'high'
const STRONG_LEVEL = 'strong'
const MEDIUM_BAND = 'medium'
const MEDIUM_LEVEL = 'medium'

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeKey(value = '') {
  return normalizeText(value, '').toLowerCase()
}

function unique(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map(normalizeKey).filter(Boolean)))
}

function rankBand(value = '') {
  return { low: 1, medium: 2, high: 3 }[normalizeKey(value)] || 0
}

function rankStrength(value = '') {
  return { weak: 1, medium: 2, strong: 3 }[normalizeKey(value)] || 0
}

function isStrongHighEvidence(item = {}) {
  return (
    rankBand(item.confidenceBand) >= rankBand(HIGH_BAND) &&
    rankStrength(item.strengthLevel) >= rankStrength(STRONG_LEVEL)
  )
}

function isAtLeastMediumEvidence(item = {}) {
  return (
    rankBand(item.confidenceBand) >= rankBand(MEDIUM_BAND) &&
    rankStrength(item.strengthLevel) >= rankStrength(MEDIUM_LEVEL)
  )
}

function evidenceGroupForKey(evidenceKey = '') {
  const key = normalizeKey(evidenceKey)
  if (GENERIC_EVIDENCE_GROUP_KEYS.has(key)) {
    return key
  }
  for (const rule of Object.values(PEST_EVIDENCE_RULES)) {
    for (const group of [...rule.directGroups, ...rule.indirectGroups]) {
      if (group.includes(key)) {
        return group[0]
      }
    }
  }
  return key
}

function stableHash(value = '') {
  return crypto
    .createHash('sha1')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 16)
}

function normalizeVisualEvidence(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      const evidenceKey = normalizeKey(
        item?.evidenceKey || item?.evidence_key || item?.symptomKey || item?.symptom_key
      )
      const symptomKey = normalizeKey(item?.symptomKey || item?.symptom_key || evidenceKey)
      if (!evidenceKey && !symptomKey) {
        return null
      }
      const group = evidenceGroupForKey(
        item?.evidenceGroup || item?.evidence_group || evidenceKey || symptomKey
      )
      return {
        evidenceKey: evidenceKey || symptomKey,
        symptomKey: symptomKey || evidenceKey,
        evidenceGroup: group,
        confidenceBand: normalizeKey(item?.confidenceBand || item?.confidence_band || 'low'),
        strengthLevel: normalizeKey(item?.strengthLevel || item?.strength_level || 'weak'),
        imageId: normalizeText(item?.imageId || item?.image_id || item?.supportImageId || ''),
        regionRef: normalizeCaptureRegion(
          item?.regionRef || item?.region_ref || item?.captureRegion || item?.capture_region
        ),
        sourceRecordId: normalizeText(item?.sourceRecordId || item?.source_record_id || ''),
        currentStatus: normalizeKey(item?.currentStatus || item?.current_status || 'active')
      }
    })
    .filter(item => item && item.currentStatus === 'active')
}

function normalizeModeKey(value = '') {
  const key = normalizeKey(value)
  const aliases = {
    spider_mites: 'spider_mite',
    scale_insects: 'scale_insect',
    whiteflies: 'whitefly',
    aphids: 'aphid',
    mealybugs: 'mealybug',
    leafminer: 'leaf_miner',
    leaf_miner_mode: 'leaf_miner',
    fungus_gnats: 'fungus_gnat'
  }
  return aliases[key] || key
}

function normalizeModeCandidates(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      modeKey: normalizeModeKey(
        item?.modeKey || item?.mode || item?.diagnosisMode || item?.diagnosis_mode
      ),
      confidence: Number(item?.confidence || 0),
      imageId: normalizeText(item?.imageId || item?.image_id || ''),
      regionRef: normalizeCaptureRegion(item?.regionRef || item?.region_ref || item?.captureRegion)
    }))
    // 过滤掉 registry 中不存在或 enabled=false 的模式（如 root_rot 骨架）
    .filter(item => DIAGNOSIS_MODE_REGISTRY[item.modeKey]?.enabled === true)
}

function hasSupportingEvidenceForMode(modeKey = '', evidenceItems = []) {
  return supportingEvidenceForMode(modeKey, evidenceItems).length > 0
}

function supportingEvidenceForMode(modeKey = '', evidenceItems = []) {
  const candidateGroups = PEST_EVIDENCE_RULES[modeKey]?.candidateGroups || []
  const classified = classifyModeEvidence(modeKey, evidenceItems)
  return [...classified.direct, ...classified.indirect]
    .filter(isAtLeastMediumEvidence)
    .filter(item => candidateGroups.some(group => groupIncludesEvidence(group, item)))
}

function classifyModeEvidence(modeKey = '', evidenceItems = []) {
  const rule = PEST_EVIDENCE_RULES[modeKey]
  if (!rule) {
    return {
      direct: [],
      indirect: []
    }
  }
  const classifyGroups = (groups, kind) =>
    groups.flatMap(group => {
      const matchedByGroup = new Map()
      for (const item of evidenceItems) {
        if (!group.includes(item.evidenceKey) && !group.includes(item.symptomKey)) {
          continue
        }
        const current = matchedByGroup.get(item.evidenceGroup)
        if (!current || rankBand(item.confidenceBand) > rankBand(current.confidenceBand)) {
          matchedByGroup.set(item.evidenceGroup, {
            ...item,
            evidenceKind: kind
          })
        }
      }
      return Array.from(matchedByGroup.values())
    })

  return {
    direct: classifyGroups(rule.directGroups, 'direct'),
    indirect: classifyGroups(rule.indirectGroups, 'indirect')
  }
}

function groupIncludesEvidence(group = [], item = {}) {
  return group.includes(item.evidenceKey) || group.includes(item.symptomKey)
}

function resolveIndirectDirectCombination(rule = {}, indirect = []) {
  if (!rule.allowIndirectDirect || !Array.isArray(rule.directCombinationGroups)) {
    return null
  }
  const eligible = indirect.filter(isAtLeastMediumEvidence)
  for (const combination of rule.directCombinationGroups) {
    if (!Array.isArray(combination) || !combination.length) {
      continue
    }
    const matchesByGroup = combination.map(group =>
      eligible.filter(item => Array.isArray(group) && groupIncludesEvidence(group, item))
    )
    if (matchesByGroup.some(matches => !matches.length)) {
      continue
    }
    const evidenceByPair = new Map()
    for (const matches of matchesByGroup) {
      for (const item of matches) {
        const imageId = normalizeText(item.imageId || '')
        const regionRef = normalizeKey(item.regionRef || '')
        if (!imageId || !regionRef || regionRef === 'unknown') {
          continue
        }
        const pairKey = `${imageId}::${regionRef}`
        const list = evidenceByPair.get(pairKey) || []
        list.push(item)
        evidenceByPair.set(pairKey, list)
      }
    }
    for (const pairEvidence of evidenceByPair.values()) {
      const coversAllGroups = matchesByGroup.every(matches =>
        matches.some(match =>
          pairEvidence.some(
            item =>
              item.evidenceKey === match.evidenceKey && item.evidenceGroup === match.evidenceGroup
          )
        )
      )
      if (coversAllGroups && pairEvidence.some(isStrongHighEvidence)) {
        return Array.from(
          new Map(
            pairEvidence.map(item => [`${item.evidenceKey}::${item.evidenceGroup}`, item])
          ).values()
        )
      }
    }
  }
  return null
}

function resolveDirectModeEvidence(modeKey = '', evidenceItems = []) {
  const rule = PEST_EVIDENCE_RULES[modeKey]
  const classified = classifyModeEvidence(modeKey, evidenceItems)
  const directMatch = classified.direct.find(isStrongHighEvidence)
  if (directMatch) {
    return {
      modeKey,
      matchType: 'direct',
      matchedEvidence: [directMatch]
    }
  }
  const combinationMatch = resolveIndirectDirectCombination(rule, classified.indirect)
  if (combinationMatch) {
    return {
      modeKey,
      matchType: 'indirect',
      matchedEvidence: combinationMatch
    }
  }
  return null
}

function isFixedQuestionPackageMode(modeKey = '') {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey]
  return ['fixed_yellow_leaf', 'fixed_wilting_droop', 'fixed_root_rot'].includes(
    entry?.questionPackageKind
  )
}

function isVisualDirectOnlyMode(modeKey = '') {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey]
  return entry?.questionPackageKind === 'visual_direct_only'
}

function isModeAllowedForProfile(modeKey = '', profile = 'full') {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey]
  if (!entry) {
    return false
  }
  return entry.allowedProfiles.includes(profile)
}

function candidateConfidenceTier(confidence = 0) {
  const value = Number(confidence) || 0
  if (value >= DIRECT_CONCLUSION_CONFIDENCE) {
    return 'direct'
  }
  if (value >= VERY_LIKELY_CANDIDATE_CONFIDENCE) {
    return 'very_likely'
  }
  if (value >= STRONG_CANDIDATE_CONFIDENCE) {
    return 'high'
  }
  if (value >= CANDIDATE_ADMIT_CONFIDENCE) {
    return 'medium'
  }
  return 'low'
}

function maxQuestionsForTier(tier = '') {
  return TIER_MAX_QUESTIONS[normalizeKey(tier)] ?? 0
}

// 判断候选模式是否可进入路由。
// pest profile 保持原严格逻辑：虫害候选需证据支撑或单候选 >=0.60。
// full profile 放宽：合法候选无论 confidence 高低均可进入，
// <0.60 走 low tier（最多 3 题）；证据只用于问题锁定和跳题，不凭空生成模式。
function isCandidateAdmissible(modeKey = '', profile = 'full', context = {}) {
  const { normalizedModeCandidates = [], candidateOnlyModeKeys = [], confirmationEvidenceItems = [] } = context
  if (!isModeAllowedForProfile(modeKey, profile)) {
    return false
  }
  const hasEvidence = hasSupportingEvidenceForMode(modeKey, confirmationEvidenceItems)
  if (PEST_MODE_KEYS.includes(modeKey)) {
    if (profile === 'full') {
      return normalizedModeCandidates.some(item => item.modeKey === modeKey) || hasEvidence
    }
    const hasStrongCandidate = normalizedModeCandidates.some(
      item => item.modeKey === modeKey && item.confidence >= CANDIDATE_ADMIT_CONFIDENCE
    )
    return hasEvidence || (hasStrongCandidate && candidateOnlyModeKeys.length === 1)
  }
  if (profile !== 'full') {
    return false
  }
  return normalizedModeCandidates.some(item => item.modeKey === modeKey) || hasEvidence
}

function topCandidateConfidence(modeKeys = [], normalizedModeCandidates = []) {
  const keySet = new Set(unique(modeKeys))
  let top = 0
  for (const item of normalizedModeCandidates) {
    if (keySet.has(item.modeKey) && item.confidence > top) {
      top = item.confidence
    }
  }
  return top
}

module.exports = {
  CANDIDATE_ADMIT_CONFIDENCE,
  STRONG_CANDIDATE_CONFIDENCE,
  VERY_LIKELY_CANDIDATE_CONFIDENCE,
  DIRECT_CONCLUSION_CONFIDENCE,
  TIER_MAX_QUESTIONS,
  normalizeText,
  normalizeKey,
  unique,
  rankBand,
  rankStrength,
  isStrongHighEvidence,
  isAtLeastMediumEvidence,
  evidenceGroupForKey,
  stableHash,
  normalizeVisualEvidence,
  normalizeModeKey,
  normalizeModeCandidates,
  hasSupportingEvidenceForMode,
  supportingEvidenceForMode,
  classifyModeEvidence,
  groupIncludesEvidence,
  resolveIndirectDirectCombination,
  resolveDirectModeEvidence,
  isFixedQuestionPackageMode,
  isVisualDirectOnlyMode,
  isModeAllowedForProfile,
  candidateConfidenceTier,
  maxQuestionsForTier,
  isCandidateAdmissible,
  topCandidateConfidence
}
