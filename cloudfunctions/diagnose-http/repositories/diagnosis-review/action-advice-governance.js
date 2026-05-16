'use strict'

function normalizeAdviceText(value = '') {
  return String(value || '').trim()
}

function normalizeReviewProblemKey(value = '') {
  const normalized = normalizeAdviceText(value)
  if (!normalized) {return ''}
  if (!normalized.startsWith('p_')) {return normalized}

  try {
    const { fromProblemId } = require('../../mappers/public-id-mapper')
    return fromProblemId(normalized) || normalized
  } catch {
    return normalized
  }
}

function pickAdviceTextFromItems(items = []) {
  for (const item of Array.isArray(items) ? items : []) {
    const text = typeof item === 'string'
      ? normalizeAdviceText(item)
      : normalizeAdviceText(item?.text || item?.title || item?.label || '')
    if (text) {return text}
  }
  return ''
}

function normalizeReviewAdviceItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const text = typeof item === 'string'
        ? normalizeAdviceText(item)
        : normalizeAdviceText(item?.text || item?.title || item?.label || '')
      if (!text) {return null}
      return {
        stepId: normalizeAdviceText(item?.stepId || item?.id || `raw_${index + 1}`),
        text,
        type: normalizeAdviceText(item?.type || '')
      }
    })
    .filter(Boolean)
}

function buildRawStoredAdviceForReview(row = {}, runtimeSnapshot = {}) {
  const rawExplanation = runtimeSnapshot?.explanation || runtimeSnapshot?.resultExplanation || {}
  const rawNextSteps = normalizeReviewAdviceItems(runtimeSnapshot?.nextSteps || [])
  const rawWhatToAvoid = (Array.isArray(runtimeSnapshot?.whatToAvoid) ? runtimeSnapshot.whatToAvoid : [])
    .map(item => typeof item === 'string' ? normalizeAdviceText(item) : normalizeAdviceText(item?.text || item?.title || item?.label || ''))
    .filter(Boolean)
  const treatment = normalizeAdviceText(
    row.treatment ||
      runtimeSnapshot?.treatmentText ||
      runtimeSnapshot?.treatment ||
      rawExplanation?.firstAid ||
      pickAdviceTextFromItems(rawNextSteps)
  )
  const prevention = normalizeAdviceText(
    row.prevention ||
      runtimeSnapshot?.preventionText ||
      runtimeSnapshot?.prevention ||
      rawExplanation?.avoid ||
      rawWhatToAvoid[0] ||
      ''
  )
  const explanation = {
    whyItHappens: normalizeAdviceText(rawExplanation?.whyItHappens || ''),
    whatToCheckNext: normalizeAdviceText(rawExplanation?.whatToCheckNext || ''),
    firstAid: normalizeAdviceText(rawExplanation?.firstAid || treatment),
    avoid: normalizeAdviceText(rawExplanation?.avoid || prevention),
    reassurance: normalizeAdviceText(rawExplanation?.reassurance || '')
  }
  const hasAny = Boolean(
    treatment ||
      prevention ||
      explanation.whyItHappens ||
      explanation.whatToCheckNext ||
      explanation.firstAid ||
      explanation.avoid ||
      rawNextSteps.length ||
      rawWhatToAvoid.length
  )

  return {
    source: 'raw_snapshot_or_session',
    hasAny,
    explanation,
    nextSteps: rawNextSteps,
    whatToAvoid: rawWhatToAvoid,
    treatment,
    prevention,
    trustLevel: 'audit_only',
    displayPolicy: 'do_not_show_as_governed_advice'
  }
}

function buildProblematicReviewAdviceFallback(problemKey = '') {
  const firstAid = '当前结果暂未匹配到已审核的处理建议。建议先保持养护条件稳定，观察问题是否扩大或重复出现，再结合人工复核结果决定具体处理。'
  const avoid = '不要在缺少已审核处理建议时直接大幅调整浇水、施肥、修剪或用药。'

  return {
    source: 'governance_fallback',
    hasAny: true,
    explanation: {
      whyItHappens: problemKey
        ? `当前问题 ${problemKey} 缺少可用于用户端展示的已审核解释。`
        : '当前问题缺少可用于用户端展示的已审核解释。',
      whatToCheckNext: '请优先核对该结果是否已有 audited explanation 或 audited problem action 字段。',
      firstAid,
      avoid,
      reassurance: '这是治理兜底文案，用于避免把未审核旧建议当作正式处理建议展示。'
    },
    nextSteps: [
      {
        stepId: 'advice_governance_fallback',
        text: firstAid,
        type: 'governance_fallback'
      }
    ],
    whatToAvoid: [avoid]
  }
}

function buildGovernedReviewAdviceFromActionAdvice(runtimeSnapshot = {}) {
  const actionAdvice = runtimeSnapshot?.actionAdvice || runtimeSnapshot?.finalResult?.actionAdvice || null
  if (!actionAdvice || typeof actionAdvice !== 'object') {return null}

  const nextStepTexts = [
    ...(Array.isArray(actionAdvice.todayActions) ? actionAdvice.todayActions : []),
    ...(Array.isArray(actionAdvice.threeDayActions) ? actionAdvice.threeDayActions : []),
    ...(Array.isArray(actionAdvice.sevenDayObserve) ? actionAdvice.sevenDayObserve : [])
  ]
    .map(normalizeAdviceText)
    .filter(Boolean)
  const whatToAvoid = [
    ...(Array.isArray(actionAdvice.avoidActions) ? actionAdvice.avoidActions : []),
    ...(actionAdvice.conflictDetected && Array.isArray(actionAdvice.retakeOrEscalate)
      ? actionAdvice.retakeOrEscalate
      : [])
  ]
    .map(normalizeAdviceText)
    .filter(Boolean)

  if (!nextStepTexts.length && !whatToAvoid.length) {return null}

  return {
    source: 'route_action_advice',
    hasAny: true,
    explanation: {
      whyItHappens: normalizeAdviceText(runtimeSnapshot?.finalResult?.summary || ''),
      whatToCheckNext: '',
      firstAid: nextStepTexts[0] || '',
      avoid: whatToAvoid[0] || '',
      reassurance: ''
    },
    nextSteps: nextStepTexts.map((text, index) => ({
      stepId: `route_action_${index + 1}`,
      text,
      type: 'route_action_advice'
    })),
    whatToAvoid
  }
}

function buildGovernedReviewExplanation(problem = null, explanationRow = null) {
  if (!problem) {return null}

  return {
    whyItHappens:
      explanationRow?.whyItHappensCn ||
      problem?.userDefinitionCn ||
      problem?.definition ||
      '',
    whatToCheckNext: explanationRow?.whatToCheckNextCn || '',
    firstAid:
      explanationRow?.firstAidCn ||
      problem?.userActionCn ||
      problem?.defaultAction ||
      '',
    avoid:
      explanationRow?.avoidCn ||
      problem?.userPreventionCn ||
      problem?.defaultPrevention ||
      '',
    reassurance: explanationRow?.reassuranceCn || ''
  }
}

async function resolveDiagnosisReviewActionAdviceGovernance({ row = {}, runtimeSnapshot = {}, mapped = {} } = {}) {
  const rawStoredAdvice = buildRawStoredAdviceForReview(row, runtimeSnapshot)
  if (mapped?.outcomeType !== 'problematic') {
    return {
      applies: false,
      outcomeType: mapped?.outcomeType || '',
      problemKey: '',
      rawStoredAdvice,
      governedAdvice: null,
      displayRecommendation: 'not_applicable'
    }
  }

  const problemKey = normalizeReviewProblemKey(mapped?.problemKey || row.final_problem_key || row.top_problem_key || '')
  const routeActionAdvice = buildGovernedReviewAdviceFromActionAdvice(runtimeSnapshot)
  if (routeActionAdvice) {
    return {
      applies: true,
      outcomeType: 'problematic',
      problemKey,
      rawStoredAdvice,
      governedAdvice: routeActionAdvice,
      displayRecommendation: 'show_governed_advice_only'
    }
  }

  if (!problemKey) {
    return {
      applies: true,
      outcomeType: 'problematic',
      problemKey: '',
      rawStoredAdvice,
      governedAdvice: buildProblematicReviewAdviceFallback(''),
      displayRecommendation: 'show_governed_advice_only'
    }
  }

  const {
    getProblemsByKeys,
    getExplanationsByProblemKeys
  } = require('../problem-repository')
  const [problems, explanations] = await Promise.all([
    getProblemsByKeys([problemKey]),
    getExplanationsByProblemKeys([problemKey])
  ])
  const problem = problems.find(item => item.problemKey === problemKey) || null
  const explanationRow = explanations.find(item => item.problemKey === problemKey) || null
  const governedExplanation = buildGovernedReviewExplanation(problem, explanationRow)

  if (!governedExplanation) {
    return {
      applies: true,
      outcomeType: 'problematic',
      problemKey,
      rawStoredAdvice,
      governedAdvice: buildProblematicReviewAdviceFallback(problemKey),
      displayRecommendation: 'show_governed_advice_only'
    }
  }

  const nextSteps = governedExplanation.firstAid
    ? [
        {
          stepId: 'advice_1',
          text: governedExplanation.firstAid,
          type: explanationRow ? 'audited_explanation' : 'problem_fallback'
        }
      ]
    : []
  const whatToAvoid = governedExplanation.avoid ? [governedExplanation.avoid] : []

  return {
    applies: true,
    outcomeType: 'problematic',
    problemKey,
    rawStoredAdvice,
    governedAdvice: {
      source: explanationRow ? 'audited_explanation' : 'problem_fallback',
      hasAny: Boolean(governedExplanation.firstAid || governedExplanation.avoid || nextSteps.length || whatToAvoid.length),
      explanation: governedExplanation,
      nextSteps,
      whatToAvoid
    },
    displayRecommendation: 'show_governed_advice_only'
  }
}

module.exports = {
  normalizeAdviceText,
  normalizeReviewProblemKey,
  pickAdviceTextFromItems,
  normalizeReviewAdviceItems,
  buildRawStoredAdviceForReview,
  buildProblematicReviewAdviceFallback,
  buildGovernedReviewAdviceFromActionAdvice,
  buildGovernedReviewExplanation,
  resolveDiagnosisReviewActionAdviceGovernance
}
