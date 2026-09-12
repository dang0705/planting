'use strict'

const {
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet
} = require('./pest-question-package')
const { resolveSpecificPestAnswerResult } = require('./specific-pest-answer-resolver')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

// 给结论名加"很像"前缀，避免重复前缀（如已经是"可能是"/"很像"则不再加）。
function prefixLikelyLabel(label = '') {
  const text = String(label || '').trim()
  if (!text) {
    return text
  }
  if (text.startsWith('很像') || text.startsWith('可能是')) {
    return text
  }
  return `很像${text}`
}

// full profile 下候选存在但路由判 uncertain 时的兜底：尝试构造问诊包，
// 若问题被全部锁定则输出候选结果，避免低置信候选被丢弃到 uncertain。
async function buildFullCandidateFallbackResponse({
  sessionId = '',
  round = 1,
  plantContext = {},
  routeResult = {},
  aggregateResult = null,
  candidateModes = [],
  confidenceTier = '',
  questionBudget = 0,
  buildBaseResponse = () => {},
  routeEvidenceLedger = () => []
} = {}) {
  const hiddenPrefilledEvidence = routeEvidenceLedger(routeResult)
  const questionPackage = buildSpecificPestQuestionPackage({
    candidateModes,
    hiddenPrefilledEvidence,
    confidenceTier,
    maxQuestions: questionBudget
  })
  if (questionPackage && questionPackage.questionCount > 0) {
    const subtitle =
      questionPackage.questionCount === 1
        ? '根据图片线索补充 1 个问题。'
        : `根据图片线索补充 ${questionPackage.questionCount} 个问题。`
    return {
      ...buildBaseResponse({ sessionId, round, plantContext, routeResult, aggregateResult }),
      routePrimaryAction: 'question_package',
      sessionStatus: 'awaiting_follow_up',
      questionRequired: true,
      outcomeType: '',
      questions: questionPackage.packageQuestions,
      questionPackage,
      uiHints: {
        canUploadMoreImages: false,
        maxQuestionsThisRound: questionPackage.questionCount,
        questionDisplayMode: 'package',
        answerSubmitMode: 'package',
        optionLayout: 'vertical',
        transition: 'swiper'
      },
      summaryCard: {
        title: '需要再确认虫害线索',
        subtitle,
        severity: 'medium',
        statusText: '待确认'
      },
      observedEvidenceSet: buildSpecificPestObservedEvidenceSet({ candidateModes })
    }
  }
  // 候选存在但问题全部被视觉证据锁定：输出候选结果。
  const fallback = resolveSpecificPestAnswerResult({
    sessionId,
    round,
    answers: [],
    questionPackage: {
      candidateModes,
      hiddenPrefilledEvidence,
      packageQuestions: []
    },
    probableModes: [],
    plantContext,
    visualAggregateResult: aggregateResult
  })
  return {
    ...fallback,
    routePrimaryAction: 'finalize',
    diagnosisModeRouteResult: routeResult,
    visualAggregateResult: aggregateResult
  }
}

// 0.90-<0.95 很像结果：在已确认候选结果上挂载 1 个可选排查问题，
// 用户可选择回答或跳过。问题来自候选模式的 blueprint，跳过被证据锁定的。
function attachLikelyOptionalQuestion(resolvedResult = {}, options = {}) {
  const {
    candidateModes = [],
    hiddenPrefilledEvidence = [],
    confidenceTier = 'very_likely',
    questionBudget = 1
  } = options
  const optionalPackage = buildSpecificPestQuestionPackage({
    candidateModes,
    hiddenPrefilledEvidence,
    confidenceTier,
    maxQuestions: Math.max(1, questionBudget)
  })
  const optionalQuestions = optionalPackage?.packageQuestions?.slice(0, 1) || []
  if (!optionalQuestions.length) {
    return resolvedResult
  }
  const optionalQuestion = optionalQuestions[0]
  const baseVisibleOutcomes = Array.isArray(resolvedResult.visibleOutcomes)
    ? resolvedResult.visibleOutcomes
    : []
  const likelyVisibleOutcomes = baseVisibleOutcomes.map(outcome => ({
    ...outcome,
    displayNameCn: prefixLikelyLabel(outcome?.displayNameCn),
    displayName: prefixLikelyLabel(outcome?.displayName)
  }))
  const baseFinalResult = resolvedResult.finalResult || {}
  const likelyFinalResult = {
    ...baseFinalResult,
    displayName: prefixLikelyLabel(baseFinalResult.displayName),
    problemName: prefixLikelyLabel(baseFinalResult.problemName),
    visibleOutcomes: likelyVisibleOutcomes
  }
  const baseTopProblem = resolvedResult.topProblem || null
  const likelyTopProblem = baseTopProblem
    ? {
        ...baseTopProblem,
        displayName: prefixLikelyLabel(baseTopProblem.displayName)
      }
    : null
  return {
    ...resolvedResult,
    routePrimaryAction: 'finalize',
    questionRequired: false,
    hasActiveQuestions: true,
    questions: [optionalQuestion],
    questionPackage: {
      ...(optionalPackage || {}),
      questionCount: 1,
      packageQuestions: [optionalQuestion],
      packageTopics: [optionalQuestion.packageTopic],
      optionalFollowUp: true,
      likelyResult: true
    },
    visibleOutcomes: likelyVisibleOutcomes,
    finalResult: likelyFinalResult,
    topProblem: likelyTopProblem,
    uiHints: {
      ...(resolvedResult.uiHints || {}),
      optionalFollowUp: true,
      likelyResult: true,
      maxQuestionsThisRound: 1,
      questionDisplayMode: 'single',
      answerSubmitMode: 'per_question',
      optionLayout: 'vertical',
      transition: 'swiper'
    },
    summaryCard: {
      ...(resolvedResult.summaryCard || {}),
      title: '很像的虫害方向',
      subtitle: '当前图片很像某种虫害，可回答下方问题进一步确认，也可直接按建议处理。'
    }
  }
}

// 根据路由结果的 followupCapturePlan 构建补拍请求载荷。
// riskLevel 决定是否需要显式同意与跳过选项；safetyInstructions 透传给前端。
function buildRetakeRequest({ sessionId = '', routeResult = {}, aggregateResult = null } = {}) {
  const plan = routeResult.followupCapturePlan || {}
  const riskLevel = String(plan.riskLevel || '').trim() || 'low'
  const isRiskRetake = ['medium', 'high'].includes(riskLevel)
  const safetyInstructions = Array.isArray(plan.safetyInstructions)
    ? plan.safetyInstructions.map(item => String(item || '').trim()).filter(Boolean)
    : []
  return {
    diagnosisSessionId: sessionId,
    status: 'needs_confirmation',
    serverAuthorized: false,
    requestedCaptureRegion: normalizeCaptureRegion(
      plan.requestedCaptureRegion || '',
      'other_local'
    ),
    reason: plan.reason || 'visual_confirmation_needed',
    originVisualCallBatchId:
      aggregateResult?.visual_call_batch_id || aggregateResult?.visualCallBatchId || '',
    expiresInSeconds: 300,
    riskLevel,
    riskNotice:
      String(plan.riskNotice || '').trim() ||
      (isRiskRetake
        ? '需要靠近可疑位置补拍，不方便操作时可以跳过。'
        : '这次只需要补一张更清楚的照片。'),
    safetyInstructions,
    requiresExplicitConsent:
      plan.requiresExplicitConsent === undefined
        ? isRiskRetake
        : Boolean(plan.requiresExplicitConsent),
    skipOptionEnabled:
      plan.skipOptionEnabled === undefined ? isRiskRetake : Boolean(plan.skipOptionEnabled),
    skipAnswerValue: String(plan.skipAnswerValue || '').trim() || 'unknown',
    confirmText: plan.confirmText || '确认开始补拍',
    confirmButtonText: plan.confirmButtonText || '确认开始'
  }
}

module.exports = {
  prefixLikelyLabel,
  buildFullCandidateFallbackResponse,
  attachLikelyOptionalQuestion,
  buildRetakeRequest
}
