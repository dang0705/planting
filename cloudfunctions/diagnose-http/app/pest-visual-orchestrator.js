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
  if (action === 'uncertain' && diagnosisProfile !== 'pest') {
    return null
  }
  const base = buildBaseResponse({ sessionId, round, plantContext, routeResult, aggregateResult })
  if (action === 'direct_result') {
    const modes = routeModes(routeResult)
    const probableModes = (
      Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []
    )
      .map(item => item.modeKey)
      .filter(mode => Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, mode))
    if (!modes.length) {
      return null
    }
    return resolveSpecificPestAnswerResult({
      sessionId,
      round,
      answers: [],
      questionPackage: {
        candidateModes: modes,
        hiddenPrefilledEvidence: routeEvidenceLedger(routeResult),
        packageQuestions: []
      },
      probableModes,
      plantContext,
      visualAggregateResult: aggregateResult
    })
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
      candidateModes: routeModes(routeResult),
      hiddenPrefilledEvidence: routeEvidenceLedger(routeResult)
    })
    if (!questionPackage || questionPackage.questionCount === 0) {
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
        subtitle: '根据图片线索补充 1 到 2 个问题。',
        severity: 'medium',
        statusText: '待确认'
      },
      observedEvidenceSet: buildSpecificPestObservedEvidenceSet({
        candidateModes: routeModes(routeResult)
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
  directEvidence,
  routeEvidenceLedger,
  routeFixedQuestionPackageMode
}
