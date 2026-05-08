'use strict'

const {
  toOptionId,
  toProblemId,
  toQuestionId,
  toResultId
} = require('../mappers/public-id-mapper')
const whitelist = require('../constants/non-problematic-whitelist')
const { projectObservedSymptomsFromEvidence } = require('./observed-evidence')
const { buildRuntimeArtifacts } = require('./runtime-artifacts')
const { buildCareGuidance } = require('../utils/care-baseline-guidance')

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function buildObservedSymptomSet(observedSymptoms = []) {
  return new Set(
    (Array.isArray(observedSymptoms) ? observedSymptoms : [])
      .map(item => normalizeKey(item?.symptomKey || item?.symptom_key || item))
      .filter(Boolean)
  )
}

function normalizeKeyList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeKey)
        .filter(Boolean)
    )
  )
}

function hasAllKeys(observedSymptomSet, requiredKeys = []) {
  const safeRequiredKeys = normalizeKeyList(requiredKeys)
  return safeRequiredKeys.length > 0 && safeRequiredKeys.every(symptomKey => observedSymptomSet.has(symptomKey))
}

function isRuleContextCompatible(item = {}, observedSymptomSet = new Set()) {
  if (!item?.requiresIsolatedSeed) {return true}

  const allowedContextKeys = normalizeKeyList(
    Array.isArray(item?.requiredSymptomKeys) && item.requiredSymptomKeys.length
      ? item.requiredSymptomKeys
      : item?.seedSymptomKeys || []
  )

  if (!allowedContextKeys.length) {return true}
  const allowedSet = new Set(allowedContextKeys)

  for (const symptomKey of observedSymptomSet) {
    if (!allowedSet.has(symptomKey)) {
      return false
    }
  }

  return true
}

function buildDirectionMap(diagnosisDirections = []) {
  return new Map(
    (Array.isArray(diagnosisDirections) ? diagnosisDirections : [])
      .map(item => [normalizeKey(item?.directionKey || ''), item])
      .filter(item => item[0])
  )
}

function hasRequiredDirections(item = {}, directionMap = new Map()) {
  const requiredDirectionKeys = normalizeKeyList(item?.requiredDirectionKeys || [])
  if (!requiredDirectionKeys.length) {return true}

  const minimumDirectionConfidence = Number(item?.minimumDirectionConfidence || 0)

  return requiredDirectionKeys.every(directionKey => {
    const direction = directionMap.get(directionKey)
    return direction && Number(direction?.confidence || 0) >= minimumDirectionConfidence
  })
}

function hasBlockingProblemDirection(item = {}, directionMap = new Map()) {
  const requiredDirectionKeys = new Set(normalizeKeyList(item?.requiredDirectionKeys || []))
  const maxCompetingProblemDirectionConfidence = Number(
    item?.maxCompetingProblemDirectionConfidence ?? 1
  )

  for (const [directionKey, direction] of directionMap.entries()) {
    if (requiredDirectionKeys.has(directionKey)) {continue}
    if (!String(direction?.categoryKey || '').trim()) {continue}
    if (Number(direction?.confidence || 0) > maxCompetingProblemDirectionConfidence) {
      return true
    }
  }

  return false
}

function isDirectionDrivenRuleSatisfied(
  item = {},
  {
    observedSymptoms = [],
    observedEvidenceSet = [],
    derivedEvidenceSet = [],
    diagnosisDirections = []
  } = {}
) {
  const directionMap = buildDirectionMap(diagnosisDirections)
  if (!hasRequiredDirections(item, directionMap)) {return false}
  if (hasBlockingProblemDirection(item, directionMap)) {return false}
  if (item?.requiresNoObservedSymptoms && Array.isArray(observedSymptoms) && observedSymptoms.length) {
    return false
  }
  if (
    item?.requiresNoObservedEvidence &&
    Array.isArray(observedEvidenceSet) &&
    observedEvidenceSet.length
  ) {
    return false
  }
  if (item?.requiresNoDerivedEvidence && Array.isArray(derivedEvidenceSet) && derivedEvidenceSet.length) {
    return false
  }

  return true
}

function resolveNonProblematicRule({
  observedSymptoms = [],
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = []
} = {}) {
  const effectiveObservedSymptoms =
    Array.isArray(observedEvidenceSet) && observedEvidenceSet.length
      ? projectObservedSymptomsFromEvidence(observedEvidenceSet)
      : observedSymptoms
  const observedSymptomSet = buildObservedSymptomSet(effectiveObservedSymptoms)

  for (const item of whitelist) {
    const requiredSymptomKeys = normalizeKeyList(item?.requiredSymptomKeys || [])
    if (!requiredSymptomKeys.length) {
      if (
        isDirectionDrivenRuleSatisfied(item, {
          observedSymptoms: effectiveObservedSymptoms,
          observedEvidenceSet,
          derivedEvidenceSet,
          diagnosisDirections
        })
      ) {
        return item
      }
      continue
    }

    if (
      hasAllKeys(observedSymptomSet, requiredSymptomKeys) &&
      isRuleContextCompatible(item, observedSymptomSet)
    ) {
      return item
    }
  }

  return null
}

function resolveNonProblematicFollowUpCandidate({
  observedSymptoms = [],
  observedEvidenceSet = []
} = {}) {
  const effectiveObservedSymptoms =
    Array.isArray(observedEvidenceSet) && observedEvidenceSet.length
      ? projectObservedSymptomsFromEvidence(observedEvidenceSet)
      : observedSymptoms
  const observedSymptomSet = buildObservedSymptomSet(effectiveObservedSymptoms)
  if (!observedSymptomSet.size) {return null}

  for (const item of whitelist) {
    const seedSymptomKeys = normalizeKeyList(item?.seedSymptomKeys || [])
    if (!seedSymptomKeys.length) {continue}
    if (!hasAllKeys(observedSymptomSet, seedSymptomKeys)) {continue}

    const requiredSymptomKeys = normalizeKeyList(item?.requiredSymptomKeys || [])
    if (hasAllKeys(observedSymptomSet, requiredSymptomKeys)) {continue}
    if (!isRuleContextCompatible(item, observedSymptomSet)) {continue}

    return item
  }

  return null
}

function toFollowUpPayload(question = {}) {
  const questionText = question.questionText || question.text || ''

  return {
    questionId: toQuestionId(question.questionKey),
    questionKey: question.questionKey,
    targetSymptomKey: question.targetSymptomKey || '',
    questionGroupKey: question.questionGroupKey || '',
    type: question.questionType || question.type || 'single_choice',
    text: questionText,
    questionText,
    helpText: question.helpText || '',
    options: (Array.isArray(question.options) ? question.options : []).map(option => ({
      optionId: toOptionId(option.optionKey),
      optionKey: option.optionKey,
      text: option.text || ''
    }))
  }
}

function buildNonProblematicRoundResult({
  sessionId,
  round = 1,
  stage = 'final',
  observedSymptoms = [],
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  plantContext = {},
  rule
} = {}) {
  const resultId = toResultId(sessionId, round)
  const formalProblemKey = String(rule?.problemKey || rule?.key || '').trim()
  const explanation = rule?.explanation || {}
  const nextSteps = Array.isArray(rule?.nextSteps)
    ? rule.nextSteps.map((text, index) => ({
        stepId: `np_${index + 1}`,
        text
      }))
    : []
  const careGuidance = buildCareGuidance({
    plantContext,
    observedEvidenceSet,
    primaryProblemKey: '',
    outcomeType: 'non_problematic'
  })

  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage,
    observedSymptoms,
    rankings: [],
    topProblem: null,
    finalResult: {
      resultId,
      problemId: formalProblemKey ? toProblemId(formalProblemKey) : '',
      displayName: rule?.finalDisplayName || '暂未见明显问题',
      summary: rule?.summary || '当前暂未见明显问题，建议继续观察。',
      severity: 'low',
      urgency: 'low'
    },
    followUpRequired: false,
    followUps: [],
    contributingFactors: [],
    intermediateStates: [],
    problemCausality: [],
    resultExplanation: explanation,
    explanation,
    nextSteps: [...nextSteps, ...careGuidance.nextSteps],
    whatToAvoid: Array.from(
      new Set([...(Array.isArray(rule?.whatToAvoid) ? rule.whatToAvoid : []), ...(careGuidance.whatToAvoid || [])].filter(Boolean))
    ),
    confidenceLevel: 'normal',
    confidenceReasons: [],
    needHumanReview: false,
    outcomeType: 'non_problematic',
    nonProblematicType: rule?.key || '',
    nonProblematicLabel: rule?.label || '',
    routePrimaryAction: 'standard_flow',
    stopReason: 'non_problematic_output_ready',
    sessionStatus: 'completed',
    plantId: plantContext.userPlantId || plantContext.plantId || '',
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: careGuidance.careBaselineSummary,
    environmentDeviationHints: careGuidance.environmentDeviationHints,
    resultId,
    timestamp: Date.now()
  }

  return {
    ...response,
    ...buildRuntimeArtifacts(response, {
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections
    })
  }
}

function buildNonProblematicFollowUpRoundResult({
  sessionId,
  round = 1,
  observedSymptoms = [],
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  plantContext = {},
  rule,
  followUps = []
} = {}) {
  const careGuidance = buildCareGuidance({
    plantContext,
    observedEvidenceSet,
    primaryProblemKey: '',
    outcomeType: ''
  })
  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage: 'followup',
    observedSymptoms,
    rankings: [],
    topProblem: null,
    finalResult: null,
    followUpRequired: true,
    followUps: (Array.isArray(followUps) ? followUps : []).map(toFollowUpPayload),
    contributingFactors: [],
    intermediateStates: [],
    problemCausality: [],
    resultExplanation: {},
    explanation: {},
    nextSteps: [],
    whatToAvoid: [],
    confidenceLevel: 'normal',
    confidenceReasons: [],
    needHumanReview: false,
    outcomeType: '',
    nonProblematicType: rule?.key || '',
    nonProblematicLabel: rule?.label || '',
    routePrimaryAction: 'ask_first',
    stopReason: 'await_follow_up',
    sessionStatus: 'awaiting_follow_up',
    plantId: plantContext.userPlantId || plantContext.plantId || '',
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: careGuidance.careBaselineSummary,
    environmentDeviationHints: careGuidance.environmentDeviationHints,
    timestamp: Date.now()
  }

  return {
    ...response,
    ...buildRuntimeArtifacts(response, {
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections
    })
  }
}

module.exports = {
  resolveNonProblematicRule,
  resolveNonProblematicFollowUpCandidate,
  buildNonProblematicRoundResult,
  buildNonProblematicFollowUpRoundResult
}
