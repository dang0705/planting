'use strict'

const {
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet,
  PEST_MODE_LABELS
} = require('./pest-question-package')
const { resolveSpecificPestAnswerResult } = require('./specific-pest-answer-resolver')
const { DIAGNOSIS_MODE_REGISTRY } = require('../domain/diagnosis-mode-registry')
const { isVisualDirectOnlyMode } = require('../domain/diagnosis-mode-helpers')
const {
  buildFullCandidateFallbackResponse,
  attachLikelyOptionalQuestion,
  buildRetakeRequest
} = require('./pest-route-helpers')

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

// >=0.95 direct tier（来自 confidence，无 evidence-based direct match）下，
// 候选模式即使没有视觉证据锁定也应被视为 direct_match，
// 确保 resolveSpecificPestAnswerResult 输出 direct 级置信度和不带"可能是"的文案。
// 注意：direct tier 来自 evidence-based direct match 时不在此合成，
// 否则会把低置信 confirmation 候选错误提升为 direct_match。
function directEvidenceLedgerForDirectResult(routeResult = {}, pestCandidateModes = [], tier = '') {
  const baseLedger = routeEvidenceLedger(routeResult)
  if (normalizeKey(tier) !== 'direct') {
    return baseLedger
  }
  const directModeKeys = (Array.isArray(routeResult.directMatches)
    ? routeResult.directMatches
    : []
  )
    .map(item => item.modeKey)
    .filter(Boolean)
  // direct tier 由 evidence-based direct match 触发时，候选应保留各自的
  // confirmation/candidate 角色，不在此处提升为 direct_match。
  if (directModeKeys.length > 0) {
    return baseLedger
  }
  const lockedSet = new Set(
    baseLedger
      .filter(item => normalizeKey(item.routeEvidenceRole) === 'direct_match')
      .map(item => normalizeKey(item.diagnosisMode || item.modeKey))
      .filter(Boolean)
  )
  const additional = pestCandidateModes
    .filter(mode => !lockedSet.has(normalizeKey(mode)))
    .map(mode => ({
      evidenceKey: mode,
      symptomKey: mode,
      diagnosisMode: mode,
      modeKey: mode,
      routeEvidenceRole: 'direct_match',
      sourceType: 'visual_mode_router',
      currentStatus: 'active',
      suppressEquivalentQuestion: true,
      lockedInQuestionnaire: true
    }))
  return [...baseLedger, ...additional]
}

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase()
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

  // 多固定题包模式时按优先级选取第一个（directMatches 优先于 associatedModes）。
  // 同时识别黄叶+枯萎的概率极低，选取一个走题包不阻塞用户。
  return modeKeys.length >= 1 ? modeKeys[0] : ''
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

// 为非虫害 visual_direct_only 模式（如白粉病）构建直接结果。
// 固定题包模式（yellow_leaf/wilting_droop）不在此列，它们必须走问诊路径。
function buildNonPestDirectResult({ modeKey, sessionId, round, plantContext, routeResult, aggregateResult }) {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey] || {}
  const displayName = entry.userDisplayName || modeKey
  return {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    plantContext,
    routePrimaryAction: 'finalize',
    diagnosisModeRouteResult: routeResult,
    visualAggregateResult: aggregateResult,
    stage: 'final',
    status: 'closed',
    finalResult: {
      problemKey: modeKey,
      problemName: displayName,
      displayName,
      outcomeType: 'problematic',
      confidenceLevel: 'high'
    },
    visibleOutcomes: [
      {
        modeKey,
        displayNameCn: displayName,
        displayName,
        outcomeType: 'problematic'
      }
    ],
    topProblem: {
      modeKey,
      displayName,
      problemKey: modeKey
    },
    candidateModes: [modeKey]
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
  const candidateModes = allRouteModes(routeResult)
  const pestCandidateModes = routeModes(routeResult)
  const confidenceTier = String(routeResult.confidenceTier || '').trim()
  const questionBudget = Number(routeResult.questionBudget || 0)
  const likelyResult = Boolean(routeResult.likelyResult)
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
      return buildNonPestDirectResult({
        modeKey: nonPestModes[0],
        sessionId,
        round,
        plantContext,
        routeResult,
        aggregateResult
      })
    }
    const isDirectTier = normalizeKey(routeResult.confidenceTier) === 'direct'
    const directModeKeysForProbable = (
      Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []
    )
      .map(item => item.modeKey)
      .filter(Boolean)
    // 仅当 direct tier 来自 >=0.95 confidence（无 evidence-based direct match）时，
    // 候选已由 directEvidenceLedgerForDirectResult 锁定为 direct_match，
    // 不应再作为 provisional 候选拉低置信度。
    // direct tier 来自 evidence-based direct match 时，confirmation 候选必须保留 probable 角色。
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
