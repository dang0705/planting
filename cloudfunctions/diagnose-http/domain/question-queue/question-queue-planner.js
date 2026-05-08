'use strict'

const crypto = require('crypto')
const {
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('../../utils/question-target-dimension')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeRoundIndex(roundId = '', fallback = 1) {
  const match = String(roundId || '').match(/round_(\d+)/i)
  if (!match) {return Number(fallback || 1) || 1}
  return Number(match[1] || fallback || 1) || 1
}

function buildQuestionQueueId(sessionId = '', roundId = '') {
  const hash = crypto
    .createHash('sha1')
    .update(`${normalizeText(sessionId)}::${normalizeText(roundId)}`)
    .digest('hex')
    .slice(0, 24)

  return `qq_${hash}`
}

function resolveServiceTarget({
  routePrimaryAction = '',
  outcomeType = '',
  nonProblematicType = ''
} = {}) {
  if (normalizeText(routePrimaryAction) === 'retake_first') {
    return 'uncertain_relief'
  }

  if (normalizeText(nonProblematicType)) {
    return 'non_problematic_confirmation'
  }

  if (normalizeText(outcomeType) === 'uncertain') {
    return 'uncertain_relief'
  }

  return 'problematic_branching'
}

function roundValue(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits))
}

function buildRetakeQuestionItems(response = {}, serviceTarget = '') {
  const suggestions = Array.isArray(response?.visualAggregateSummary?.suggestedFollowupCapture)
    ? response.visualAggregateSummary.suggestedFollowupCapture
    : []
  const captureTargets = suggestions.length
    ? suggestions
    : ['补拍更清晰的受损部位近照']

  return captureTargets.map((text, index) => ({
    questionKey: `retake_capture_${index + 1}`,
    questionId: '',
    targetSymptomKey: '',
    questionGroupKey: 'retake_capture',
    questionText: `请补图：${normalizeText(text) || '补拍更清晰的图片'}`,
    helpText: '当前轮次优先补图，补图完成后再继续重建视觉证据。',
    currentPriority: Math.max(captureTargets.length - index, 1),
    estimatedInformationGain: roundValue(1 - index * 0.1),
    serviceTarget,
    appliesWhen: {
      routePrimaryAction: 'retake_first',
      stage: normalizeText(response?.stage, 'followup'),
      followUpRequired: true,
      questionGroupKey: 'retake_capture',
      targetSymptomKey: ''
    },
    asked: true,
    answered: false,
    invalidated: false,
    invalidReason: '',
    status: 'asked'
  }))
}

function planQuestionQueue(response = {}) {
  const sessionId = normalizeText(response?.diagnosisSessionId)
  const roundId = normalizeText(response?.roundId, 'round_1')
  const roundIndex = normalizeRoundIndex(roundId, response?.currentRoundIndex || 1)
  const routePrimaryAction = normalizeText(response?.routePrimaryAction, 'standard_flow')
  const serviceTarget = resolveServiceTarget({
    routePrimaryAction,
    outcomeType: response?.outcomeType,
    nonProblematicType: response?.nonProblematicType
  })
  const followUpRequired = Boolean(response?.followUpRequired)
  const followUps = Array.isArray(response?.followUps) ? response.followUps.slice(0, 1) : []
  const total = followUps.length

  const followUpItems = followUps.map((item, index) => {
    const currentPriority = Math.max(total - index, 1)
    const estimatedInformationGain =
      total > 0 ? roundValue((total - index) / total) : 0
    const questionRole = normalizeQuestionRole(
      item?.questionRole || item?.questionCategory || '',
      inferQuestionRole(item?.targetDimension || '', item?.routingScope || '')
    )
    const effectMode = normalizeQuestionEffectMode(
      item?.effectMode || '',
      inferQuestionEffectMode(questionRole, item?.targetDimension || '')
    )

    return {
      questionKey: normalizeText(item?.questionKey),
      questionId: normalizeText(item?.questionId),
      targetSymptomKey: normalizeText(item?.targetSymptomKey),
      questionGroupKey: normalizeText(item?.questionGroupKey),
      targetDimension: normalizeText(item?.targetDimension),
      routingScope: normalizeText(item?.routingScope),
      questionRole,
      questionCategory: questionRole,
      effectMode,
      questionText: normalizeText(item?.text || item?.questionText),
      helpText: normalizeText(item?.helpText),
      currentPriority,
      estimatedInformationGain,
      serviceTarget,
      appliesWhen: {
        routePrimaryAction,
        stage: normalizeText(response?.stage, followUpRequired ? 'followup' : 'final'),
        followUpRequired,
        questionGroupKey: normalizeText(item?.questionGroupKey),
        targetSymptomKey: normalizeText(item?.targetSymptomKey),
        targetDimension: normalizeText(item?.targetDimension),
        routingScope: normalizeText(item?.routingScope),
        questionRole,
        effectMode
      },
      asked: true,
      answered: false,
      invalidated: false,
      invalidReason: '',
      status: 'asked'
    }
  })

  const questionItems = (normalizeText(routePrimaryAction) === 'retake_first'
    ? buildRetakeQuestionItems(response, serviceTarget)
    : followUpItems
  ).slice(0, 1)

  const activeItemCount = questionItems.length
  const queueStatus = activeItemCount
    ? 'active'
    : followUpRequired
      ? 'blocked'
      : 'exhausted'
  const exhaustedReason = activeItemCount
    ? ''
    : followUpRequired
      ? 'followup_required_but_no_actionable_question'
      : 'no_high_value_question'
  const decisionCause = response?.decisionCause && typeof response.decisionCause === 'object'
    ? response.decisionCause
    : null

  return {
    questionQueueId: buildQuestionQueueId(sessionId, roundId),
    sessionId,
    roundId,
    roundIndex,
    routePrimaryAction,
    queueStatus,
    queueDecision: {
      hasActionableItems: Number(activeItemCount > 0) ? 1 : 0,
      exhaustedReason,
      serviceTarget,
      decisionCauseKey: String(decisionCause?.decisionCauseKey || '').trim(),
      decisionCauseCategory: String(decisionCause?.decisionCauseCategory || '').trim(),
      decisionCauseText: String(decisionCause?.decisionCauseText || '').trim(),
      decisionCauseDetails:
        decisionCause?.decisionCauseDetails && typeof decisionCause.decisionCauseDetails === 'object'
          ? decisionCause.decisionCauseDetails
          : null
    },
    questionItems,
    activeItemCount,
    askedItemCount: 0,
    answeredItemCount: 0,
    invalidatedItemCount: 0,
    updatedAt: ''
  }
}

module.exports = {
  planQuestionQueue
}
