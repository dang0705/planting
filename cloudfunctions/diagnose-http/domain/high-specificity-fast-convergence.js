'use strict'

const {
  HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES,
  HIGH_SPECIFICITY_FAST_CONVERGENCE_RULES
} = require('../constants/high-specificity-fast-convergence')

function normalizeText(value, fallback = '') {
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

function normalizeOrgan(value = '', fallback = 'unknown') {
  const normalized = normalizeText(value, fallback).toLowerCase()
  return normalized || fallback
}

function normalizeBand(value = '', fallback = 'low') {
  const normalized = normalizeText(value, fallback).toLowerCase()
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : fallback
}

function normalizeStrength(value = '', fallback = 'weak') {
  const normalized = normalizeText(value, fallback).toLowerCase()
  return ['weak', 'medium', 'strong'].includes(normalized) ? normalized : fallback
}

function rankBand(value = '') {
  const rankMap = { low: 1, medium: 2, high: 3 }
  return rankMap[normalizeBand(value, 'low')] || 0
}

function rankStrength(value = '') {
  const rankMap = { weak: 1, medium: 2, strong: 3 }
  return rankMap[normalizeStrength(value, 'weak')] || 0
}

function buildProblemMap(problems = []) {
  const map = new Map()
  for (const item of Array.isArray(problems) ? problems : []) {
    const key = normalizeText(item?.problemKey || '', '')
    if (!key) {continue}
    map.set(key, item)
  }
  return map
}

function buildSymptomMetaMap(symptomDictionary = []) {
  const map = new Map()
  for (const item of Array.isArray(symptomDictionary) ? symptomDictionary : []) {
    const key = normalizeText(item?.symptomKey || '', '')
    if (!key) {continue}
    map.set(key, item)
  }
  return map
}

function buildCandidateIndex(visualAggregateResult = null) {
  const aggregatedCandidates = Array.isArray(visualAggregateResult?.aggregated_symptom_candidates)
    ? visualAggregateResult.aggregated_symptom_candidates
    : []
  const candidateMap = new Map()

  for (const item of aggregatedCandidates) {
    const symptomKey = normalizeText(item?.symptom_key || '', '')
    if (!symptomKey) {continue}
    candidateMap.set(symptomKey, item)
  }

  return candidateMap
}

function buildAdmissionIndex(visualAggregateResult = null) {
  const admissionRecords = Array.isArray(visualAggregateResult?.admission_records)
    ? visualAggregateResult.admission_records
    : []
  const admissionByRecordId = new Map()
  const admissionBySymptomKey = new Map()

  for (const item of admissionRecords) {
    if (normalizeText(item?.admission_result || '', '') !== 'formally_admitted') {
      continue
    }

    const recordId = normalizeText(item?.visual_admission_record_id || '', '')
    const symptomKey = normalizeText(item?.object_key || item?.candidate?.symptom_key || '', '')

    if (recordId) {
      admissionByRecordId.set(recordId, item)
    }
    if (symptomKey) {
      admissionBySymptomKey.set(symptomKey, item)
    }
  }

  return {
    admissionByRecordId,
    admissionBySymptomKey
  }
}

function buildVisualEvidenceIndex({
  observedEvidenceSet = [],
  visualAggregateResult = null,
  symptomDictionary = []
} = {}) {
  const symptomMetaMap = buildSymptomMetaMap(symptomDictionary)
  const candidateMap = buildCandidateIndex(visualAggregateResult)
  const { admissionByRecordId, admissionBySymptomKey } = buildAdmissionIndex(visualAggregateResult)
  const evidenceMap = new Map()

  for (const item of Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []) {
    const sourceType = normalizeText(item?.sourceType || item?.source_type || '', '')
    if (sourceType !== 'visual_admitted') {
      continue
    }

    const symptomKey = normalizeText(item?.symptomKey || item?.symptom_key || '', '')
    if (!symptomKey) {continue}

    const sourceRecordId = normalizeText(item?.sourceRecordId || item?.source_record_id || '', '')
    const admissionRecord =
      (sourceRecordId && admissionByRecordId.get(sourceRecordId)) ||
      admissionBySymptomKey.get(symptomKey) ||
      null
    const candidate = admissionRecord?.candidate || candidateMap.get(symptomKey) || {}
    const symptomMeta = symptomMetaMap.get(symptomKey) || {}
    const nextEntry = {
      symptomKey,
      confidence: Number(item?.confidence || 0),
      signalReliability: Number(symptomMeta?.signalReliability || 0),
      isKeyEvidence: Number(item?.isKeyEvidence ?? item?.is_key_evidence ?? 0) === 1,
      supportCount: Number(candidate?.support_count || 0),
      supportOrgans: normalizeStringList(candidate?.support_organs || []).map(entry =>
        normalizeOrgan(entry, 'unknown')
      ),
      supportingRegionNote: normalizeText(candidate?.supporting_region_note || '', ''),
      confidenceBand: normalizeBand(candidate?.confidence_band, 'low'),
      strengthLevel: normalizeStrength(candidate?.strength_level, 'weak'),
      admissionReadiness: normalizeText(candidate?.admission_readiness || '', ''),
      sourceRecordId
    }
    const current = evidenceMap.get(symptomKey)

    if (
      !current ||
      Number(nextEntry.confidence || 0) > Number(current.confidence || 0) ||
      Number(nextEntry.supportCount || 0) > Number(current.supportCount || 0)
    ) {
      evidenceMap.set(symptomKey, nextEntry)
    }
  }

  return evidenceMap
}

function matchesRuleEvidence(entry = {}, rule = {}) {
  if (!entry) {return false}
  if (rankBand(entry.confidenceBand) < rankBand(rule.minConfidenceBand || 'low')) {
    return false
  }
  if (rankStrength(entry.strengthLevel) < rankStrength(rule.minStrengthLevel || 'weak')) {
    return false
  }

  const allowedOrgans = normalizeStringList(rule.allowedOrgans || []).map(item =>
    normalizeOrgan(item, 'unknown')
  )
  if (allowedOrgans.length) {
    const matchedOrgan = normalizeStringList(entry.supportOrgans || []).some(organ =>
      allowedOrgans.includes(normalizeOrgan(organ, 'unknown'))
    )
    if (!matchedOrgan) {
      return false
    }
  }

  return true
}

function buildMatchedRule(rule = {}, evidenceMap = new Map()) {
  const requiredAllSymptomKeys = normalizeStringList(rule.requiredAllSymptomKeys || [])
  const requiredAnySymptomKeyGroups = (Array.isArray(rule.requiredAnySymptomKeyGroups)
    ? rule.requiredAnySymptomKeyGroups
    : []
  )
    .map(group => normalizeStringList(group || []))
    .filter(group => group.length > 0)

  if (!requiredAllSymptomKeys.length && !requiredAnySymptomKeyGroups.length) {
    return null
  }

  const matchedEvidence = new Map()
  for (const symptomKey of requiredAllSymptomKeys) {
    const entry = evidenceMap.get(symptomKey)
    if (!matchesRuleEvidence(entry, rule)) {
      return null
    }
    matchedEvidence.set(entry.symptomKey, entry)
  }

  for (const group of requiredAnySymptomKeyGroups) {
    const matchedEntry = group
      .map(symptomKey => evidenceMap.get(symptomKey))
      .find(entry => matchesRuleEvidence(entry, rule))
    if (!matchedEntry) {
      return null
    }
    matchedEvidence.set(matchedEntry.symptomKey, matchedEntry)
  }

  const matchedEvidenceList = Array.from(matchedEvidence.values())

  return {
    directionKey: rule.directionKey,
    problemKey: rule.problemKey,
    policy: rule.policy,
    matchedSymptomKeys: matchedEvidenceList.map(item => item.symptomKey),
    matchedEvidence: matchedEvidenceList
  }
}

function resolveHighSpecificityConvergencePlan({
  visualAggregateResult = null,
  visualRouteContext = {},
  observedEvidenceSet = [],
  symptomDictionary = [],
  rankings = [],
  problems = [],
  round = 1,
  stage = 'preliminary'
} = {}) {
  const routePrimaryAction = normalizeText(visualRouteContext?.routePrimaryAction || '', '')
  if (routePrimaryAction === 'retake_first') {
    return null
  }

  const aggregateAnalyzability = normalizeText(
    visualAggregateResult?.aggregate_analyzability || '',
    ''
  )
  if (aggregateAnalyzability === 'low') {
    return null
  }

  const topRanking = Array.isArray(rankings) && rankings.length ? rankings[0] : null
  if (!topRanking?.problemKey) {
    return null
  }

  const problemMap = buildProblemMap(problems)
  const targetProblem = problemMap.get(topRanking.problemKey)
  if (!targetProblem || normalizeText(targetProblem?.problemRole || '', '') !== 'root_cause') {
    return null
  }

  const evidenceMap = buildVisualEvidenceIndex({
    observedEvidenceSet,
    visualAggregateResult,
    symptomDictionary
  })
  if (!evidenceMap.size) {
    return null
  }

  const matchedRules = HIGH_SPECIFICITY_FAST_CONVERGENCE_RULES
    .map(rule => buildMatchedRule(rule, evidenceMap))
    .filter(Boolean)
    .filter(rule => normalizeText(rule.problemKey || '', '') === normalizeText(topRanking.problemKey || '', ''))

  if (matchedRules.length !== 1) {
    return null
  }

  const matchedRule = matchedRules[0]

  return {
    applied: true,
    directionKey: matchedRule.directionKey,
    problemKey: matchedRule.problemKey,
    policy: matchedRule.policy,
    shouldBypassFollowUp:
      matchedRule.policy === HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_FOLLOW_UP,
    maxQuestions:
      matchedRule.policy === HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.SINGLE_CONFIRMATION
        ? 1
        : 0,
    audit: {
      round: Number(round || 1) || 1,
      stage: normalizeText(stage, 'preliminary'),
      routePrimaryAction: routePrimaryAction || null,
      aggregateAnalyzability: aggregateAnalyzability || null,
      matchedSymptomKeys: matchedRule.matchedSymptomKeys,
      matchedEvidence: matchedRule.matchedEvidence.map(item => ({
        symptomKey: item.symptomKey,
        confidence: Number(item.confidence || 0),
        signalReliability: Number(item.signalReliability || 0),
        confidenceBand: item.confidenceBand,
        strengthLevel: item.strengthLevel,
        supportCount: Number(item.supportCount || 0),
        supportOrgans: normalizeStringList(item.supportOrgans || []),
        supportingRegionNote: item.supportingRegionNote || '',
        isKeyEvidence: Boolean(item.isKeyEvidence)
      }))
    }
  }
}

module.exports = {
  resolveHighSpecificityConvergencePlan
}
