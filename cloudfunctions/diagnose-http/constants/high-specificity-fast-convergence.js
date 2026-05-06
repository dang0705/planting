'use strict'

const HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES = {
  ZERO_FOLLOW_UP: 'zero_follow_up',
  SINGLE_CONFIRMATION: 'single_confirmation'
}

const HIGH_SPECIFICITY_FAST_CONVERGENCE_RULES = [
  {
    directionKey: 'spider_mite_webbing_direction',
    problemKey: 'spider_mites',
    policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.SINGLE_CONFIRMATION,
    requiredAllSymptomKeys: ['fine_webbing'],
    minConfidenceBand: 'medium',
    minStrengthLevel: 'medium',
    allowedOrgans: ['leaf', 'stem']
  },
  {
    directionKey: 'scale_insect_direction',
    problemKey: 'scale_insects',
    policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_FOLLOW_UP,
    requiredAllSymptomKeys: ['scale_shells'],
    minConfidenceBand: 'medium',
    minStrengthLevel: 'medium',
    allowedOrgans: ['leaf', 'stem', 'whole_plant', 'other']
  },
  {
    directionKey: 'aphid_direction',
    problemKey: 'aphids',
    policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_FOLLOW_UP,
    requiredAllSymptomKeys: ['aphids_visible'],
    minConfidenceBand: 'medium',
    minStrengthLevel: 'medium',
    allowedOrgans: ['leaf', 'stem', 'flower', 'whole_plant', 'other']
  },
  {
    directionKey: 'powdery_mildew_direction',
    problemKey: 'powdery_mildew',
    policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_FOLLOW_UP,
    requiredAllSymptomKeys: ['powder_white'],
    minConfidenceBand: 'medium',
    minStrengthLevel: 'medium',
    allowedOrgans: ['leaf', 'stem', 'flower', 'whole_plant', 'other']
  },
  {
    directionKey: 'fungus_gnat_direction',
    problemKey: 'fungus_gnat',
    policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.SINGLE_CONFIRMATION,
    requiredAllSymptomKeys: ['small_flies_soil'],
    minConfidenceBand: 'high',
    minStrengthLevel: 'medium',
    allowedOrgans: ['whole_plant', 'other', 'root_crown']
  }
]

function getHighSpecificityQuestionBlockedSymptomKeys({
  policy = HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_FOLLOW_UP
} = {}) {
  return Array.from(
    new Set(
      HIGH_SPECIFICITY_FAST_CONVERGENCE_RULES
        .filter(rule => String(rule?.policy || '').trim() === String(policy || '').trim())
        .flatMap(rule => [
          ...(Array.isArray(rule?.requiredAllSymptomKeys) ? rule.requiredAllSymptomKeys : []),
          ...(Array.isArray(rule?.requiredAnySymptomKeyGroups)
            ? rule.requiredAnySymptomKeyGroups.flatMap(group => group || [])
            : [])
        ])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

module.exports = {
  HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES,
  HIGH_SPECIFICITY_FAST_CONVERGENCE_RULES,
  getHighSpecificityQuestionBlockedSymptomKeys
}
