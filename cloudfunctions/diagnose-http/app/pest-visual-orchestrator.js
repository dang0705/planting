'use strict'

const {
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet,
  PEST_MODE_LABELS
} = require('./pest-question-package')
const { resolveSpecificPestAnswerResult } = require('./specific-pest-answer-resolver')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

const STATIC_ROUTE_MODE_OPTIONS = Object.freeze({
  yellow_leaf: Object.freeze({
    classKey: 'yellowing_mode',
    modeKey: 'yellow_leaf',
    classNameCn: '黄叶模式',
    symptomKey: 'uniform_yellowing',
    symptomCn: '整叶黄化'
  }),
  wilting_droop: Object.freeze({
    classKey: 'wilting_droop_mode',
    modeKey: 'wilting_droop',
    classNameCn: '枯萎 / 发蔫模式',
    symptomKey: 'wilting_droop',
    symptomCn: '枯萎 / 发蔫'
  })
})

function routeFromAggregate(aggregateResult = null) {
  return (
    aggregateResult?.diagnosis_mode_route_result ||
    aggregateResult?.diagnosisModeRouteResult ||
    null
  )
}

function getBuildStaticQuestionPackageStartRoundResult() {
  return require('./static-question-package-start').buildStaticQuestionPackageStartRoundResult
}

function routeModes(routeResult = {}) {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []).map(
          item => item.modeKey
        ),
        ...(Array.isArray(routeResult.provisionalMatches)
          ? routeResult.provisionalMatches
          : []
        ).map(item => item.modeKey),
        ...(Array.isArray(routeResult.confirmationCandidates)
          ? routeResult.confirmationCandidates
          : []
        ).map(item => item.modeKey),
        ...(Array.isArray(routeResult.associatedModes) ? routeResult.associatedModes : [])
      ].filter(Boolean)
    )
  ).filter(mode => Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, mode))
}

function directEvidence(routeResult = {}) {
  return routeEvidenceLedger({
    directMatches: Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []
  })
}

function routeFixedQuestionPackageMode(routeResult = {}) {
  const modeKeys = Array.from(
    new Set([
      ...(Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []).map(
        item => item.modeKey
      ),
      ...(Array.isArray(routeResult.associatedModes) ? routeResult.associatedModes : [])
    ])
  ).filter(modeKey => Object.prototype.hasOwnProperty.call(STATIC_ROUTE_MODE_OPTIONS, modeKey))

  return modeKeys.length === 1 ? modeKeys[0] : ''
}

function routeEvidenceLedger(routeResult = {}) {
  const sources = [
    ...(Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []).map(item => ({
      ...item,
      routeEvidenceRole: 'direct_match'
    })),
    ...(Array.isArray(routeResult.confirmationCandidates)
      ? routeResult.confirmationCandidates
      : []
    ).map(item => ({ ...item, routeEvidenceRole: 'confirmation_support' })),
    ...(Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []).map(
      item => ({ ...item, routeEvidenceRole: 'candidate_match' })
    )
  ]
  const seen = new Set()
  return sources.flatMap(item =>
    (Array.isArray(item.matchedEvidence) ? item.matchedEvidence : []).flatMap(evidence => {
      const key = `${item.modeKey}::${evidence.evidenceKey || evidence.symptomKey || ''}::${evidence.evidenceGroup || ''}`
      if (seen.has(key)) {
        return []
      }
      seen.add(key)
      return {
        ...evidence,
        diagnosisMode: item.modeKey,
        modeKey: item.modeKey,
        routeEvidenceRole: item.routeEvidenceRole,
        sourceType: 'visual_mode_router'
      }
    })
  )
}

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

function buildBaseResponse({
  sessionId = '',
  round = 1,
  plantContext = {},
  routeResult = {},
  aggregateResult = null
}) {
  return {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    plantContext,
    visualAggregateResult: aggregateResult,
    routePrimaryAction: routeResult.nextAction || routeResult.routePrimaryAction || '',
    diagnosisModeRouteResult: routeResult,
    observedSymptoms: [],
    confidenceLevel: 'normal'
  }
}

async function buildPestRouteResponse({
  sessionId = '',
  round = 1,
  plantContext = {},
  aggregateResult = null,
  diagnosisProfile = 'full'
} = {}) {
  const routeResult = routeFromAggregate(aggregateResult)
  if (!routeResult) {
    return null
  }
  const action = routeResult.nextAction || ''
  const candidateModes = routeModes(routeResult)
  const confidenceTier = String(routeResult.confidenceTier || '').trim()
  const questionBudget = Number(routeResult.questionBudget || 0)
  const likelyResult = Boolean(routeResult.likelyResult)
  // full profile 下：有候选模式时不再因 uncertain 直接返回 null。
  // 只有真的没有候选模式且 action=uncertain 时，才允许上层走 uncertain 兜底。
  if (action === 'uncertain' && diagnosisProfile !== 'pest') {
    if (!candidateModes.length) {
      return null
    }
    // full profile 候选存在但被路由判 uncertain（理论上新逻辑下不会发生），
    // 兜底走 question_package，避免低置信候选被丢弃。
    return buildFullCandidateFallbackResponse({
      sessionId,
      round,
      plantContext,
      routeResult,
      aggregateResult,
      candidateModes,
      confidenceTier,
      questionBudget
    })
  }
  const base = buildBaseResponse({ sessionId, round, plantContext, routeResult, aggregateResult })
  if (action === 'direct_result') {
    const probableModes = (
      Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []
    )
      .map(item => item.modeKey)
      .filter(mode => Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, mode))
    if (!candidateModes.length) {
      return null
    }
    const resolved = resolveSpecificPestAnswerResult({
      sessionId,
      round,
      answers: [],
      questionPackage: {
        candidateModes,
        hiddenPrefilledEvidence: routeEvidenceLedger(routeResult),
        packageQuestions: []
      },
      probableModes,
      plantContext,
      visualAggregateResult: aggregateResult
    })
    // 0.90-<0.95 很像结果：保留 1 个可选排查问题供用户确认。
    if (likelyResult) {
      return attachLikelyOptionalQuestion(resolved, {
        candidateModes,
        hiddenPrefilledEvidence: routeEvidenceLedger(routeResult),
        confidenceTier,
        questionBudget
      })
    }
    return resolved
  }
  if (action === 'question_package') {
    const staticModeKey = routeFixedQuestionPackageMode(routeResult)
    if (diagnosisProfile === 'full' && staticModeKey) {
      const response = await getBuildStaticQuestionPackageStartRoundResult()({
        sessionId,
        option: STATIC_ROUTE_MODE_OPTIONS[staticModeKey],
        plantContext,
        round
      })
      return {
        ...response,
        selectedModeKey: staticModeKey,
        routePrimaryAction: 'question_package',
        visualAggregateResult: aggregateResult,
        diagnosisModeRouteResult: routeResult
      }
    }

    const questionPackage = buildSpecificPestQuestionPackage({
      candidateModes,
      hiddenPrefilledEvidence: routeEvidenceLedger(routeResult),
      confidenceTier,
      maxQuestions: questionBudget
    })
    if (!questionPackage || questionPackage.questionCount === 0) {
      // 候选存在但所有问题被视觉证据锁定：输出候选结果，不回退 uncertain。
      if (candidateModes.length) {
        const fallback = resolveSpecificPestAnswerResult({
          sessionId,
          round,
          answers: [],
          questionPackage: {
            candidateModes,
            hiddenPrefilledEvidence: routeEvidenceLedger(routeResult),
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
      return {
        ...base,
        routePrimaryAction: 'request_followup_capture',
        sessionStatus: 'awaiting_retake',
        outcomeType: 'uncertain',
        questionRequired: false,
        questions: [],
        retakeRequest: buildRetakeRequest({ sessionId, routeResult, aggregateResult }),
        summaryCard: {
          title: '还需要补拍确认',
          subtitle: '现有图片线索不足以直接判断具体虫害。',
          severity: 'low',
          statusText: '待补拍'
        },
        finalResult: null,
        visibleOutcomes: []
      }
    }
    const subtitle =
      questionPackage.questionCount === 1
        ? '根据图片线索补充 1 个问题。'
        : `根据图片线索补充 ${questionPackage.questionCount} 个问题。`
    return {
      ...base,
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
      observedEvidenceSet: buildSpecificPestObservedEvidenceSet({
        candidateModes
      })
    }
  }
  if (action === 'choose_direction') {
    return {
      ...base,
      sessionStatus: 'awaiting_follow_up',
      questionRequired: false,
      outcomeType: '',
      questions: [],
      directionChoices: routeResult.directionChoices || [],
      recommendedMode: routeResult.recommendedMode || '',
      recommendedDirection: routeResult.recommendedDirection || '',
      directMatches: routeResult.directMatches || [],
      evidenceLedger: routeEvidenceLedger(routeResult),
      pendingDirectPestSnapshot: routeResult.pendingDirectPestSnapshot || null,
      uiHints: { directionChoiceRequired: true, canUploadMoreImages: false },
      summaryCard: {
        title: '发现多个可能方向',
        subtitle: '请选择最接近当前照片的方向继续。',
        severity: 'medium',
        statusText: '待选择'
      }
    }
  }
  if (action === 'request_followup_capture' || action === 'uncertain') {
    return {
      ...base,
      routePrimaryAction: 'request_followup_capture',
      sessionStatus: 'awaiting_retake',
      outcomeType: 'uncertain',
      questionRequired: false,
      questions: [],
      retakeRequest: buildRetakeRequest({ sessionId, routeResult, aggregateResult }),
      summaryCard: {
        title: action === 'uncertain' ? '暂不能判断具体虫害' : '需要补拍确认',
        subtitle: '请确认后在 3 分钟内补拍更清晰的位置。',
        severity: 'low',
        statusText: '待补拍'
      },
      finalResult: null,
      visibleOutcomes: []
    }
  }
  return null
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
  questionBudget = 0
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
  // 0.90-<0.95 很像结果：给结论名加"很像"前缀，用户友好且不暴露 confidence。
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
    // 保留 finalize 作为主结论，同时挂载可选问题供前端展示。
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

module.exports = {
  buildPestRouteResponse,
  buildRetakeRequest,
  routeFromAggregate,
  routeModes,
  directEvidence,
  routeEvidenceLedger,
  routeFixedQuestionPackageMode,
  buildFullCandidateFallbackResponse,
  attachLikelyOptionalQuestion
}
