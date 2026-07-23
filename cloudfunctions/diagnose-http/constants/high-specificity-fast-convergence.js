'use strict'

const HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES = {
  ZERO_QUESTION: 'zero_follow_up',
  SINGLE_CONFIRMATION: 'single_confirmation'
}

const HIGH_SPECIFICITY_FAST_CONVERGENCE_RULES = [
  {
    directionKey: 'powdery_mildew_direction',
    problemKey: 'powdery_mildew',
    policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_QUESTION,
    requiredAllSymptomKeys: ['powder_white'],
    minConfidenceBand: 'medium',
    minStrengthLevel: 'medium',
    allowedOrgans: ['leaf', 'stem', 'flower', 'whole_plant', 'other']
  }
]

function getHighSpecificityQuestionBlockedSymptomKeys({
  policy = HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_QUESTION
} = {}) {
  return Array.from(
    new Set(
      HIGH_SPECIFICITY_FAST_CONVERGENCE_RULES.filter(
        rule => String(rule?.policy || '').trim() === String(policy || '').trim()
      )
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
