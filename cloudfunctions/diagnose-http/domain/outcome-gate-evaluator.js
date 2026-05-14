'use strict'

const { GATE_RESULT } = require('../constants/outcome-route')

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeKey(item)).filter(Boolean)
  }
  if (!value && value !== 0) {
    return []
  }
  return String(value)
    .split(',')
    .map(item => normalizeKey(item))
    .filter(Boolean)
}

function setHasAll(set, expected = []) {
  if (!expected.length) {return true}
  for (const item of expected) {
    if (!set.has(item)) {return false}
  }
  return true
}

function setHasAny(set, expected = []) {
  if (!expected.length) {return false}
  for (const item of expected) {
    if (set.has(item)) {return true}
  }
  return false
}

function matchesRequiredEvidence(requiredEvidence = {}, routeEvidenceContext = {}) {
  const activeSymptomKeySet = routeEvidenceContext.activeSymptomKeySet || new Set()
  const derivedEvidenceKeySet = routeEvidenceContext.derivedEvidenceKeySet || new Set()
  const diagnosisDirectionKeySet = routeEvidenceContext.diagnosisDirectionKeySet || new Set()
  const symptomClassKeySet = routeEvidenceContext.symptomClassKeySet || new Set()

  const symptomKeys = normalizeStringArray(requiredEvidence.symptomKeys)
  const anySymptomKeys = normalizeStringArray(requiredEvidence.anySymptomKeys)
  const absentSymptomKeys = normalizeStringArray(requiredEvidence.absentSymptomKeys)
  const derivedEvidenceKeys = normalizeStringArray(requiredEvidence.derivedEvidenceKeys)
  const anyDerivedEvidenceKeys = normalizeStringArray(requiredEvidence.anyDerivedEvidenceKeys)
  const diagnosisDirectionKeys = normalizeStringArray(requiredEvidence.diagnosisDirectionKeys)
  const anyDiagnosisDirectionKeys = normalizeStringArray(requiredEvidence.anyDiagnosisDirectionKeys)
  const symptomClassKeys = normalizeStringArray(requiredEvidence.symptomClassKeys)

  if (!setHasAll(activeSymptomKeySet, symptomKeys)) {return false}
  if (anySymptomKeys.length && !setHasAny(activeSymptomKeySet, anySymptomKeys)) {return false}
  if (setHasAny(activeSymptomKeySet, absentSymptomKeys)) {return false}
  if (!setHasAll(derivedEvidenceKeySet, derivedEvidenceKeys)) {return false}
  if (anyDerivedEvidenceKeys.length && !setHasAny(derivedEvidenceKeySet, anyDerivedEvidenceKeys)) {
    return false
  }
  if (!setHasAll(diagnosisDirectionKeySet, diagnosisDirectionKeys)) {return false}
  if (
    anyDiagnosisDirectionKeys.length &&
    !setHasAny(diagnosisDirectionKeySet, anyDiagnosisDirectionKeys)
  ) {
    return false
  }
  if (!setHasAll(symptomClassKeySet, symptomClassKeys)) {return false}
  return true
}

function matchesRequiredAnswerEffects(requiredAnswerEffects = {}, routeEvidenceContext = {}) {
  const answeredQuestionKeySet = routeEvidenceContext.answeredQuestionKeySet || new Set()
  const answeredOptionKeySet = routeEvidenceContext.answeredOptionKeySet || new Set()
  const answeredQuestionOptionPairSet = routeEvidenceContext.answeredQuestionOptionPairSet || new Set()
  const answerEffectTypeSet = routeEvidenceContext.answerEffectTypeSet || new Set()
  const routeAnswerEffectOutcomeKeySet = routeEvidenceContext.routeAnswerEffectOutcomeKeySet || new Set()
  const routeAnswerEffectRouteKeySet = routeEvidenceContext.routeAnswerEffectRouteKeySet || new Set()

  const questionKeys = normalizeStringArray(requiredAnswerEffects.questionKeys)
  const anyQuestionKeys = normalizeStringArray(requiredAnswerEffects.anyQuestionKeys)
  const optionKeys = normalizeStringArray(requiredAnswerEffects.optionKeys)
  const anyOptionKeys = normalizeStringArray(requiredAnswerEffects.anyOptionKeys)
  const questionOptionPairs = normalizeStringArray(requiredAnswerEffects.questionOptionPairs)
  const anyQuestionOptionPairs = normalizeStringArray(requiredAnswerEffects.anyQuestionOptionPairs)
  const effectTypes = normalizeStringArray(requiredAnswerEffects.effectTypes).map(item =>
    item.toLowerCase()
  )
  const anyEffectTypes = normalizeStringArray(requiredAnswerEffects.anyEffectTypes).map(item =>
    item.toLowerCase()
  )
  const outcomeKeys = normalizeStringArray(requiredAnswerEffects.outcomeKeys)
  const anyOutcomeKeys = normalizeStringArray(requiredAnswerEffects.anyOutcomeKeys)
  const routeKeys = normalizeStringArray(requiredAnswerEffects.routeKeys)
  const anyRouteKeys = normalizeStringArray(requiredAnswerEffects.anyRouteKeys)

  if (!setHasAll(answeredQuestionKeySet, questionKeys)) {return false}
  if (anyQuestionKeys.length && !setHasAny(answeredQuestionKeySet, anyQuestionKeys)) {return false}
  if (!setHasAll(answeredOptionKeySet, optionKeys)) {return false}
  if (anyOptionKeys.length && !setHasAny(answeredOptionKeySet, anyOptionKeys)) {return false}
  const matchedQuestionOptionPairs = questionOptionPairs.filter(pair =>
    answeredQuestionOptionPairSet.has(pair)
  )
  const requiredQuestionOptionPairCount = questionOptionPairs.length
  const questionOptionPairSatisfied = (() => {
    if (!requiredQuestionOptionPairCount) {return true}
    if (setHasAll(answeredQuestionOptionPairSet, questionOptionPairs)) {return true}
    if (requiredQuestionOptionPairCount <= 2) {return false}
    return matchedQuestionOptionPairs.length >= 2
  })()
  if (!questionOptionPairSatisfied) {return false}
  if (
    anyQuestionOptionPairs.length &&
    !setHasAny(answeredQuestionOptionPairSet, anyQuestionOptionPairs)
  ) {
    return false
  }
  if (!setHasAll(answerEffectTypeSet, effectTypes)) {return false}
  if (anyEffectTypes.length && !setHasAny(answerEffectTypeSet, anyEffectTypes)) {
    return false
  }
  if (!setHasAll(routeAnswerEffectOutcomeKeySet, outcomeKeys)) {return false}
  if (anyOutcomeKeys.length && !setHasAny(routeAnswerEffectOutcomeKeySet, anyOutcomeKeys)) {
    return false
  }
  if (!setHasAll(routeAnswerEffectRouteKeySet, routeKeys)) {return false}
  if (anyRouteKeys.length && !setHasAny(routeAnswerEffectRouteKeySet, anyRouteKeys)) {
    return false
  }
  return true
}

function matchesBlockerEvidence(blockerEvidence = {}, routeEvidenceContext = {}) {
  if (!blockerEvidence || typeof blockerEvidence !== 'object') {return false}
  const hasEvidenceBlocker = matchesRequiredEvidence(blockerEvidence, routeEvidenceContext)
  const hasAnswerBlocker = matchesRequiredAnswerEffects(blockerEvidence, routeEvidenceContext)

  const hasAnyConstraint =
    normalizeStringArray(blockerEvidence.symptomKeys).length ||
    normalizeStringArray(blockerEvidence.anySymptomKeys).length ||
    normalizeStringArray(blockerEvidence.absentSymptomKeys).length ||
    normalizeStringArray(blockerEvidence.derivedEvidenceKeys).length ||
    normalizeStringArray(blockerEvidence.anyDerivedEvidenceKeys).length ||
    normalizeStringArray(blockerEvidence.diagnosisDirectionKeys).length ||
    normalizeStringArray(blockerEvidence.anyDiagnosisDirectionKeys).length ||
    normalizeStringArray(blockerEvidence.symptomClassKeys).length ||
    normalizeStringArray(blockerEvidence.questionKeys).length ||
    normalizeStringArray(blockerEvidence.anyQuestionKeys).length ||
    normalizeStringArray(blockerEvidence.optionKeys).length ||
    normalizeStringArray(blockerEvidence.anyOptionKeys).length ||
    normalizeStringArray(blockerEvidence.questionOptionPairs).length ||
    normalizeStringArray(blockerEvidence.anyQuestionOptionPairs).length ||
    normalizeStringArray(blockerEvidence.effectTypes).length ||
    normalizeStringArray(blockerEvidence.anyEffectTypes).length ||
    normalizeStringArray(blockerEvidence.outcomeKeys).length ||
    normalizeStringArray(blockerEvidence.anyOutcomeKeys).length ||
    normalizeStringArray(blockerEvidence.routeKeys).length ||
    normalizeStringArray(blockerEvidence.anyRouteKeys).length

  if (!hasAnyConstraint) {return false}
  return hasEvidenceBlocker && hasAnswerBlocker
}

function evaluateOutcomeRouteGate({
  gate = {},
  routeEvidenceContext = {},
  canAskAnotherFollowUpRound = false
} = {}) {
  const hasBlocker = matchesBlockerEvidence(gate.blockerEvidence, routeEvidenceContext)
  if (hasBlocker) {
    return {
      gateKey: gate.gateKey || '',
      routeKey: gate.routeKey || '',
      gateRole: gate.gateRole || '',
      result: GATE_RESULT.BLOCK,
      decisionCauseKey: gate.decisionCauseKey || '',
      decisionCauseText: gate.decisionCauseTextCn || '',
      requiredEvidenceMatched: false,
      requiredAnswerEffectsMatched: false,
      blockerMatched: true
    }
  }

  const requiredEvidenceMatched = matchesRequiredEvidence(
    gate.requiredEvidence,
    routeEvidenceContext
  )
  const requiredAnswerEffectsMatched = matchesRequiredAnswerEffects(
    gate.requiredAnswerEffects,
    routeEvidenceContext
  )

  if (requiredEvidenceMatched && requiredAnswerEffectsMatched) {
    return {
      gateKey: gate.gateKey || '',
      routeKey: gate.routeKey || '',
      gateRole: gate.gateRole || '',
      result: GATE_RESULT.PASS,
      decisionCauseKey: gate.decisionCauseKey || '',
      decisionCauseText: gate.decisionCauseTextCn || '',
      requiredEvidenceMatched: true,
      requiredAnswerEffectsMatched: true,
      blockerMatched: false
    }
  }

  const result = canAskAnotherFollowUpRound ? GATE_RESULT.NEED_MORE_INFO : GATE_RESULT.FAIL
  return {
    gateKey: gate.gateKey || '',
    routeKey: gate.routeKey || '',
    gateRole: gate.gateRole || '',
    result,
    decisionCauseKey: gate.decisionCauseKey || '',
    decisionCauseText: gate.decisionCauseTextCn || '',
    requiredEvidenceMatched,
    requiredAnswerEffectsMatched,
    blockerMatched: false
  }
}

module.exports = {
  matchesRequiredEvidence,
  matchesRequiredAnswerEffects,
  matchesBlockerEvidence,
  evaluateOutcomeRouteGate
}
