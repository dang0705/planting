'use strict'

const { unknownFlow } = require('../constants/scoring')
const classSwitchRules = require('../constants/class-switch-rules')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function clamp01(value) {
  const num = Number(value || 0)
  if (num <= 0) {return 0}
  if (num >= 1) {return 1}
  return num
}

function roundNum(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function dedupeStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => normalizeText(item))
        .filter(Boolean)
    )
  )
}

function normalizeClassGateMode(value = '') {
  const normalized = normalizeText(value, 'soft').toLowerCase()
  if (normalized === 'verified_hard') {
    return classSwitchRules.classGateTypes.hard
  }
  if (['soft', 'hard', 'disabled'].includes(normalized)) {
    return normalized
  }
  return 'soft'
}

function normalizeClassGateSourceMode(value = '') {
  const normalized = normalizeText(value, 'soft').toLowerCase()
  if (normalized === 'verified_hard') {return 'verified_hard'}
  if (['soft', 'hard', 'disabled'].includes(normalized)) {
    return normalized
  }
  return 'soft'
}

function isHardGateMode(value = '') {
  const normalized = normalizeClassGateMode(value)
  return normalized === classSwitchRules.classGateTypes.hard
}

function isHardGateCandidate(value = '') {
  const normalized = normalizeText(value, '').toLowerCase()
  return normalized === 'hard' || normalized === 'verified_hard'
}

function normalizeUnknownSwitchPolicy(value = '') {
  const normalized = normalizeText(value, 'soft').toLowerCase()
  if (['disallow', 'stop', 'block', 'forbid'].includes(normalized)) {
    return 'disallow'
  }
  return normalized
}

function parseUnknownSwitchPolicy(value = '') {
  const normalized = normalizeUnknownSwitchPolicy(value)
  if (!normalized || normalized === 'soft') {
    return {
      mode: 'soft',
      threshold: Infinity
    }
  }

  if (normalized === 'disallow') {
    return {
      mode: 'disallow',
      threshold: unknownFlow.groupUnknownThreshold
    }
  }

  const matched = normalized.match(/^(switch_group|deprioritize)_after_(\d+)_unknown$/)
  if (!matched) {
    return {
      mode: normalized,
      threshold: unknownFlow.groupUnknownThreshold
    }
  }

  return {
    mode: matched[1],
    threshold: Math.max(1, Number(matched[2] || unknownFlow.groupUnknownThreshold))
  }
}

function shouldBlockGroupByUnknownPolicy(unknownPolicyRuntime = {}, unknownCount = 0) {
  const mode = normalizeText(unknownPolicyRuntime?.mode)
  const threshold = Number(unknownPolicyRuntime?.threshold || unknownFlow.groupUnknownThreshold)
  if (Number(unknownCount || 0) < threshold) {return false}
  return mode === 'disallow' || mode === 'switch_group'
}

function getUnknownPolicyPriorityPenalty(unknownPolicyRuntime = {}, unknownCount = 0) {
  const mode = normalizeText(unknownPolicyRuntime?.mode)
  const threshold = Number(unknownPolicyRuntime?.threshold || unknownFlow.groupUnknownThreshold)
  if (Number(unknownCount || 0) < threshold) {return 0}
  if (mode === 'deprioritize') {
    return 40
  }
  return 0
}

function normalizeObservedSymptoms(observedSymptoms = []) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : [])
    .map(item => ({
      symptomKey: normalizeText(item?.symptomKey),
      symptomCn: normalizeText(item?.symptomCn),
      confidence: clamp01(item?.confidence),
      signalReliability:
        item?.signalReliability === null || item?.signalReliability === undefined || item?.signalReliability === ''
          ? 1
          : clamp01(item?.signalReliability)
    }))
    .filter(item => item.symptomKey)
}

function isRuntimeEligibleClassMode(followupModeV1 = '', round = 1) {
  const normalizedMode = normalizeText(followupModeV1).toLowerCase()
  if (classSwitchRules.activeFollowupModes.includes(normalizedMode)) {
    return true
  }
  if (
    classSwitchRules.restrictedFollowupModes.includes(normalizedMode) &&
    Number(round || 1) > 1
  ) {
    return true
  }
  return false
}

function buildGroupSortScore(group = {}) {
  const roleBoost = Number(classSwitchRules.groupRolePriorityBoost[group.groupRole] || 0)
  return Number(group.basePriority || 0) + roleBoost
}

module.exports = {
  normalizeText,
  clamp01,
  roundNum,
  dedupeStrings,
  normalizeClassGateMode,
  normalizeClassGateSourceMode,
  isHardGateMode,
  isHardGateCandidate,
  parseUnknownSwitchPolicy,
  shouldBlockGroupByUnknownPolicy,
  getUnknownPolicyPriorityPenalty,
  normalizeObservedSymptoms,
  isRuntimeEligibleClassMode,
  buildGroupSortScore
}
