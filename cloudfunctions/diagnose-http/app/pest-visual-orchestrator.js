'use strict'

const {
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet,
  PEST_MODE_LABELS
} = require('./pest-question-package')
const { resolveSpecificPestAnswerResult } = require('./specific-pest-answer-resolver')
const { isVisualDirectOnlyMode } = require('../domain/diagnosis-mode-helpers')
const {
  buildFullCandidateFallbackResponse,
  attachLikelyOptionalQuestion,
  buildRetakeRequest
} = require('./pest-route-helpers')
// fix #77: 拆分证据 ledger 与非虫害直接结果到独立模块，主文件聚焦路由编排
const {
  STATIC_ROUTE_MODE_OPTIONS,
  directEvidenceLedgerForDirectResult,
  normalizeKey,
  routeEvidenceLedger,
  routeFixedQuestionPackageMode
} = require('./pest-route-evidence')
const {
  buildNonPestDirectResult,
  resolveNonPestCandidateTier
} = require('./non-pest-direct-result')

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

// 返回路由结果中的所有候选模式 key（不限虫害），用于 full profile direct_result 等
function allRouteModes(routeResult = {}) {
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
  )
}

// 仅返回虫害候选模式 key，用于 pest-specific 问诊逻辑
function routeModes(routeResult = {}) {
  return allRouteModes(routeResult).filter(mode =>
    Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, mode)
  )
}

function directEvidence(routeResult = {}) {
  return routeEvidenceLedger({
    directMatches: Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []
  })
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

// 生成 resultId（与 diagnosis-handlers 的 resolveResultId 口径一致）
function resolveResultId(routeResult = {}, sessionId = '') {
  const evidenceSnapshotId = routeResult.evidenceSnapshotId || ''
  return evidenceSnapshotId
    ? `result_${evidenceSnapshotId}`
    : `result_${sessionId}_${Date.now()}`
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
  const candidateModes = allRouteModes(routeResult)
  const pestCandidateModes = routeModes(routeResult)
  const confidenceTier = String(routeResult.confidenceTier || '').trim()
  const questionBudget = Number(routeResult.questionBudget || 0)
  const likelyResult = Boolean(routeResult.likelyResult)
  const resultId = resolveResultId(routeResult, sessionId)
  // full profile 下：有候选模式时不再因 uncertain 直接返回 null。
  if (action === 'uncertain' && diagnosisProfile !== 'pest') {
    if (!candidateModes.length) {
      return null
    }
    return buildFullCandidateFallbackResponse({
      sessionId,
      round,
      plantContext,
      routeResult,
      aggregateResult,
      candidateModes: pestCandidateModes,
      confidenceTier,
      questionBudget,
      buildBaseResponse,
      routeEvidenceLedger
    })
  }
  const base = buildBaseResponse({ sessionId, round, plantContext, routeResult, aggregateResult })
  if (action === 'direct_result') {
    const nonPestModes = candidateModes.filter(
      mode =>
        !Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, mode) &&
        isVisualDirectOnlyMode(mode)
    )
    // 仅 visual_direct_only 非虫害模式可直接结论；
    // 固定题包模式（yellow_leaf/wilting_droop）必须走问诊路径。
    if (nonPestModes.length && !pestCandidateModes.length) {
      // fix #73: <0.90 candidate 不应 high confidence 直接结论，需检查 tier
      const tierInfo = resolveNonPestCandidateTier(nonPestModes[0], routeResult)
      if (tierInfo.eligible) {
        return buildNonPestDirectResult({
          modeKey: nonPestModes[0],
          sessionId,
          round,
          plantContext,
          routeResult,
          aggregateResult,
          likelyResult: tierInfo.likelyResult,
          resultId
        })
      }
      // <0.90 保留 uncertainty，走 retake 路径
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
          subtitle: '现有图片线索不足以直接判断具体问题。',
          severity: 'low',
          statusText: '待补拍'
        },
        finalResult: null,
        visibleOutcomes: []
      }
    }
    const isDirectTier = normalizeKey(routeResult.confidenceTier) === 'direct'
    const directModeKeysForProbable = (
      Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []
    )
      .map(item => item.modeKey)
      .filter(Boolean)
    const directFromConfidence = isDirectTier && directModeKeysForProbable.length === 0
    const probableModes = directFromConfidence
      ? []
      : (
          Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []
        )
          .map(item => item.modeKey)
          .filter(mode => Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, mode))
    if (!pestCandidateModes.length) {
      return null
    }
    const resolved = resolveSpecificPestAnswerResult({
      sessionId,
      round,
      answers: [],
      questionPackage: {
        candidateModes: pestCandidateModes,
        // fix #72: directEvidenceLedgerForDirectResult 内部按 candidate confidence 过滤，
        // 只提升 >=0.95 的候选为 direct_match，避免低置信候选被错误展示为已确认
        hiddenPrefilledEvidence: directEvidenceLedgerForDirectResult(routeResult, pestCandidateModes, routeResult.confidenceTier),
        packageQuestions: []
      },
      probableModes,
      plantContext,
      visualAggregateResult: aggregateResult
    })
    // 0.90-<0.95 很像结果：保留 1 个可选排查问题供用户确认。
    if (likelyResult) {
      return attachLikelyOptionalQuestion(resolved, {
        candidateModes: pestCandidateModes,
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
      candidateModes: pestCandidateModes,
      hiddenPrefilledEvidence: routeEvidenceLedger(routeResult),
      confidenceTier,
      maxQuestions: questionBudget
    })
    if (!questionPackage || questionPackage.questionCount === 0) {
      // 候选存在但所有问题被视觉证据锁定：输出候选结果，不回退 uncertain。
      if (pestCandidateModes.length) {
        const fallback = resolveSpecificPestAnswerResult({
          sessionId,
          round,
          answers: [],
          questionPackage: {
            candidateModes: pestCandidateModes,
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
      // 非虫害 visual_direct_only candidate（如 powdery_mildew）走 question_package 但
      // pestCandidateModes 为空、buildSpecificPestQuestionPackage 返回 null：
      // fix #73: <0.90 不应直接结论，需检查 tier；>=0.90 可 fall through 到 buildNonPestDirectResult
      const nonPestModes = candidateModes.filter(
        mode =>
          !Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, mode) &&
          isVisualDirectOnlyMode(mode)
      )
      if (nonPestModes.length) {
        const tierInfo = resolveNonPestCandidateTier(nonPestModes[0], routeResult)
        if (tierInfo.eligible) {
          return buildNonPestDirectResult({
            modeKey: nonPestModes[0],
            sessionId,
            round,
            plantContext,
            routeResult,
            aggregateResult,
            likelyResult: tierInfo.likelyResult,
            resultId
          })
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
          subtitle: '现有图片线索不足以直接判断具体问题。',
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
        candidateModes: pestCandidateModes
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
        title: action === 'uncertain' ? '暂不能判断具体问题' : '需要补拍确认',
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

module.exports = {
  buildPestRouteResponse,
  buildRetakeRequest,
  routeFromAggregate,
  routeModes,
  allRouteModes,
  directEvidence,
  directEvidenceLedgerForDirectResult,
  routeEvidenceLedger,
  routeFixedQuestionPackageMode,
  buildFullCandidateFallbackResponse,
  attachLikelyOptionalQuestion
}
