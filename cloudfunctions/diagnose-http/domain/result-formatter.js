'use strict'

const { ranking: rankingConfig } = require('../constants/scoring')
const { buildRuntimeArtifacts } = require('./runtime-artifacts')
const { buildCareGuidance } = require('../utils/care-baseline-guidance')
const {
  toProblemId,
  toQuestionId,
  toOptionId,
  toResultId
} = require('../mappers/public-id-mapper')
const {
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('../utils/question-target-dimension')

function roundValue(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits))
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function uniqList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function resolvePrimarySymptomClass(symptomClassRuntime = null) {
  if (!symptomClassRuntime || typeof symptomClassRuntime !== 'object') {return null}

  const primaryClass = symptomClassRuntime?.primaryClass
  if (primaryClass && typeof primaryClass === 'object') {
    const classKey = normalizeText(primaryClass.classKey)
    const classNameCn = normalizeText(primaryClass.classNameCn)
    const runtimeNotes = normalizeText(primaryClass.runtimeNotes)
    if (classKey || classNameCn || runtimeNotes) {
      return {
        classKey,
        classNameCn,
        runtimeNotes
      }
    }
  }

  const currentClassKey = normalizeText(symptomClassRuntime?.currentClassKey)
  if (!currentClassKey) {return null}

  return {
    classKey: currentClassKey,
    classNameCn: '',
    runtimeNotes: ''
  }
}

function buildSymptomClassUncertainPrefix(symptomClassRuntime = null) {
  const primaryClass = resolvePrimarySymptomClass(symptomClassRuntime)
  if (!primaryClass) {return ''}

  const classLabel = normalizeText(primaryClass.classNameCn || primaryClass.classKey)
  if (!classLabel) {return ''}

  return `当前已收敛到“${classLabel}”，但还缺少足够的补充事实，暂时不能安全定位到具体原因。`
}

function pickPrimaryRanking(rankings = [], problemMap = new Map()) {
  const allowedRoles = new Set(rankingConfig.supportRolesAsTop1)
  for (const item of rankings || []) {
    const problem = problemMap.get(item.problemKey)
    const role = problem?.problemRole || ''
    if (allowedRoles.has(role)) {return item}
  }
  return null
}

function buildExplanation(problem, explanationRow) {
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
      problem?.defaultPrevention || '',
    reassurance: explanationRow?.reassuranceCn || ''
  }
}

function mapSeverity(problem) {
  return (problem?.severityHintCn || '中').includes('高') ? 'high' : 'medium'
}

function mapUrgency(problem) {
  return (problem?.urgencyHintCn || '中').includes('高') ? 'high' : 'medium'
}

function buildLowConfidenceSummary(displayName, baseSummary, lowConfidence = {}) {
  if (!displayName) {
    return lowConfidence?.isLowConfidence ? '当前证据不足，暂时无法稳定判断。' : baseSummary
  }

  if (!lowConfidence?.isLowConfidence) {
    return baseSummary
  }

  return `当前更像 ${displayName}，但还不够确定。${baseSummary ? ` ${baseSummary}` : ''}`.trim()
}

function buildHighSpecificityFastConvergenceSummary(displayName = '', baseSummary = '') {
  if (!displayName) {
    return baseSummary || '当前证据非常支持问题性方向，可优先按该问题处理。'
  }

  return `当前证据非常支持 ${displayName} 方向，可优先按该问题处理；若后续出现反向证据，再复查。${
    baseSummary ? ` ${baseSummary}` : ''
  }`.trim()
}

function isOutOfPoolNoMappingLowConfidence(lowConfidence = {}) {
  return normalizeText(lowConfidence?.uncertainLegalityReason || '') === 'out_of_pool_no_mapping' ||
    (Array.isArray(lowConfidence?.reasons) &&
      lowConfidence.reasons.some(item => normalizeText(item) === 'out_of_pool_no_mapping'))
}

function isOutOfPoolLowConfidence(lowConfidence = {}) {
  const reasonSet = new Set(
    (Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : [])
      .map(item => normalizeText(item))
      .filter(Boolean)
  )
  const legalityReason = normalizeText(lowConfidence?.uncertainLegalityReason || '')
  return (
    isOutOfPoolNoMappingLowConfidence(lowConfidence) ||
    legalityReason === 'out_of_pool_review_required' ||
    legalityReason === 'out_of_pool_hint_unconfirmed' ||
    reasonSet.has('weak_out_of_pool_proxy_only') ||
    reasonSet.has('out_of_pool_hint_unconfirmed_after_followup')
  )
}

function resolveOutOfPoolObservation(lowConfidence = {}) {
  const observation = lowConfidence?.outOfPoolObservation &&
    typeof lowConfidence.outOfPoolObservation === 'object'
    ? lowConfidence.outOfPoolObservation
    : null
  const observationText = normalizeText(observation?.observationText || '')
  const observationNames = Array.isArray(observation?.observationNames)
    ? observation.observationNames.map(item => normalizeText(item)).filter(Boolean)
    : []
  if (!observationText && !observationNames.length) {return null}
  return {
    observationNames,
    observationText: observationText || observationNames.join('；')
  }
}

function buildUncertainSummary(lowConfidence = {}, symptomClassRuntime = null) {
  if (isOutOfPoolLowConfidence(lowConfidence)) {
    const observation = resolveOutOfPoolObservation(lowConfidence)
    return observation?.observationText
      ? `图片中存在当前自动诊断范围外的可见异常。模型原始观察为：${observation.observationText}。这不是正式诊断结论，系统暂不能给出针对性处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。`
      : '图片中存在当前自动诊断范围外的可见异常。系统无法把它稳定归入现有诊断路径，因此本次不继续常规诊断，也不判断为“暂无明显问题”。由于该异常尚未纳入当前诊断池，系统暂不能给出针对性的处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。'
  }

  const advice = Array.isArray(lowConfidence?.advice)
    ? lowConfidence.advice.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const classPrefix = buildSymptomClassUncertainPrefix(symptomClassRuntime)

  if (classPrefix) {
    return advice.length ? `${classPrefix} ${advice[0]}`.trim() : classPrefix
  }

  if (advice.length) {
    return advice[0]
  }

  return '当前证据不足，暂不能安全判断，建议补充更稳定的图片或观察信息。'
}

function buildUncertainExplanation(lowConfidence = {}, symptomClassRuntime = null) {
  if (isOutOfPoolLowConfidence(lowConfidence)) {
    const observation = resolveOutOfPoolObservation(lowConfidence)
    return {
      whyItHappens: observation?.observationText
        ? `当前图片中有可见异常，但该异常未形成可确认的正式诊断证据。模型原始观察为：${observation.observationText}。`
        : '当前图片中有可见异常，但该异常超出当前自动诊断支持的症状范围，或尚未形成可确认的正式诊断证据。',
      whatToCheckNext: '可继续观察该异常是否扩大、重复出现或影响整体状态；如变化明显，建议由人工或更完整资料进一步确认。',
      firstAid: '在没有稳定归类前，先保持养护条件相对稳定，不建议仅凭本次结果进行针对性处理。',
      avoid: '避免把该异常直接等同于某个具体问题，也避免在缺少确认时大幅调整养护或使用处理措施。',
      reassurance: '跳过常规诊断是为了避免把诊断池外的异常硬套进现有问题。'
    }
  }

  const advice = Array.isArray(lowConfidence?.advice)
    ? lowConfidence.advice.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const primaryClass = resolvePrimarySymptomClass(symptomClassRuntime)
  const classLabel = normalizeText(primaryClass?.classNameCn || primaryClass?.classKey)
  const runtimeNotes = normalizeText(primaryClass?.runtimeNotes)
  const whyItHappens = classLabel
    ? `当前视觉和追问更支持“${classLabel}”这一症状模式，但具体 root cause 仍缺少关键上下文，继续硬判风险较高。`
    : '当前证据不足或仍有冲突，继续硬判具体问题风险较高。'
  const whatToCheckNext = uniqList([
    advice[0],
    runtimeNotes
  ]).join(' ')

  return {
    whyItHappens,
    whatToCheckNext:
      whatToCheckNext ||
      '建议补拍整株、受损部位特写、叶背和盆土状态后重新判断。',
    firstAid:
      advice[1] ||
      '先保持当前养护稳定，避免一次性大幅调整浇水、施肥或用药。',
    avoid: '不要在证据不足时立即大幅调整养护或连续使用药剂。',
    reassurance: '暂不硬判是当前更安全的输出。'
  }
}

function buildUncertainFinalResult({ resultId, lowConfidence = {} } = {}) {
  if (isOutOfPoolLowConfidence(lowConfidence)) {
    return {
      resultId,
      problemId: '',
      displayName: '发现诊断范围外的可见异常',
      summary: buildUncertainSummary(lowConfidence),
      severity: 'low',
      urgency: 'low',
      outOfPoolObservation: resolveOutOfPoolObservation(lowConfidence)
    }
  }

  return {
    resultId,
    problemId: '',
    displayName: '暂不能稳定判断',
    summary: buildUncertainSummary(lowConfidence),
    severity: 'low',
    urgency: 'medium'
  }
}

function resolveOutcomeType({
  followUpRequired = false,
  lowConfidence = {},
  stopDecision = null
} = {}) {
  if (followUpRequired) {return null}

  const lockedOutcomeType = normalizeText(stopDecision?.outcomeLocked || '', '')
  if (lockedOutcomeType === 'uncertain' && lowConfidence?.uncertainLegalityReason) {
    return 'uncertain'
  }
  if (lockedOutcomeType === 'problematic' || lockedOutcomeType === 'non_problematic') {
    return lockedOutcomeType
  }

  return lowConfidence?.uncertainLegalityReason ? 'uncertain' : 'problematic'
}

function resolveRoutePrimaryAction({
  followUpRequired = false,
  outcomeType = null,
  preferredRoutePrimaryAction = ''
} = {}) {
  if (preferredRoutePrimaryAction === 'retake_first') {return 'retake_first'}
  if (followUpRequired) {return 'ask_first'}
  if (outcomeType === 'uncertain') {return 'uncertain_prepare'}
  return 'standard_flow'
}

function resolveStopReason({ followUpRequired = false, stopDecision = null } = {}) {
  if (followUpRequired) {return 'await_follow_up'}
  return normalizeText(stopDecision?.stopReason || '', '')
}

function formatDiagnosisResponse({
  sessionId,
  round = 1,
  stage,
  observedSymptoms = [],
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  rankings = [],
  followUps = [],
  problems = [],
  explanations = [],
  causality = [],
  plantContext = {},
  plantId,
  followUpRequired = false,
  lowConfidence = { isLowConfidence: false, reasons: [], advice: [] },
  symptomClassRuntime = null,
  highSpecificityFastConvergence = null,
  stopDecision = null,
  preferredRoutePrimaryAction = ''
}) {
  const problemMap = new Map((problems || []).map(item => [item.problemKey, item]))
  const explanationMap = new Map((explanations || []).map(item => [item.problemKey, item]))

  const primary = pickPrimaryRanking(rankings, problemMap)
  const primaryProblem = primary ? problemMap.get(primary.problemKey) : null
  const primaryExplanation = primary ? explanationMap.get(primary.problemKey) : null

  const contributingRoles = new Set(rankingConfig.contributingRoles)
  const intermediateRoles = new Set(rankingConfig.intermediateRoles)

  const rawContributingFactors = rankings
    .filter(item => {
      const role = problemMap.get(item.problemKey)?.problemRole || ''
      return contributingRoles.has(role)
    })
    .slice(0, 3)
    .map(item => ({
      factorId: `f_${item.problemKey}`,
      label: problemMap.get(item.problemKey)?.displayNameCn || item.problemCn || item.problemKey
    }))

  const rawIntermediateStates = rankings
    .filter(item => {
      const role = problemMap.get(item.problemKey)?.problemRole || ''
      return intermediateRoles.has(role)
    })
    .slice(0, 3)
    .map(item => ({
      stateId: `s_${item.problemKey}`,
      label: problemMap.get(item.problemKey)?.displayNameCn || item.problemCn || item.problemKey
    }))

  const resultId = toResultId(sessionId, round)

  const baseSummaryText =
    primaryExplanation?.resultSummaryCn ||
    primaryProblem?.userDefinitionCn ||
    primaryProblem?.definition ||
    (primary ? `当前更像是 ${primary.problemCn || primary.problemKey}` : '暂无结论')
  const summaryText = highSpecificityFastConvergence?.applied
    ? buildHighSpecificityFastConvergenceSummary(
        primaryProblem?.displayNameCn || primary?.problemCn || primary?.problemKey || '',
        baseSummaryText
      )
    : buildLowConfidenceSummary(
        primaryProblem?.displayNameCn || primary?.problemCn || primary?.problemKey || '',
        baseSummaryText,
        lowConfidence
      )
  const outcomeType = resolveOutcomeType({ followUpRequired, lowConfidence, stopDecision })
  const shouldSuppressProblemLikePresentation = outcomeType === 'uncertain'
  const routePrimaryAction = resolveRoutePrimaryAction({
    followUpRequired,
    outcomeType,
    preferredRoutePrimaryAction
  })
  const stopReason = resolveStopReason({ followUpRequired, stopDecision })
  const explanationPayload = outcomeType === 'uncertain'
    ? buildUncertainExplanation(lowConfidence, symptomClassRuntime)
    : buildExplanation(primaryProblem, primaryExplanation)
  const careGuidance = buildCareGuidance({
    plantContext,
    observedEvidenceSet,
    primaryProblemKey: primary?.problemKey || '',
    outcomeType
  })
  if (careGuidance.environmentDeviationHints.length) {
    explanationPayload.whatToCheckNext = uniqList([
      explanationPayload.whatToCheckNext,
      careGuidance.environmentDeviationHints[0]
    ]).join(' ')
  }
  const finalResultPayload = outcomeType === 'uncertain'
    ? buildUncertainFinalResult({
        resultId,
        lowConfidence: {
          ...lowConfidence,
          advice: uniqList([
            buildUncertainSummary(lowConfidence, symptomClassRuntime)
          ])
        }
      })
    : primary
      ? {
          resultId,
          problemId: toProblemId(primary.problemKey),
          displayName:
            primaryProblem?.displayNameCn ||
            primary.problemCn ||
            primary.problemKey,
          summary: summaryText,
          severity: mapSeverity(primaryProblem),
          urgency: mapUrgency(primaryProblem)
        }
      : null
  const nextSteps = outcomeType === 'uncertain'
    ? [
        ...(Array.isArray(lowConfidence?.advice)
          ? lowConfidence.advice.map((text, index) => ({
              stepId: `low_conf_${index + 1}`,
              text
            }))
          : []),
        ...careGuidance.nextSteps,
        {
          stepId: 'step_1',
          text:
            explanationPayload.firstAid ||
            '先保持当前养护稳定，避免在证据不足时做大幅调整。'
        }
      ]
    : [
        ...(Array.isArray(lowConfidence?.advice)
          ? lowConfidence.advice.map((text, index) => ({
              stepId: `low_conf_${index + 1}`,
              text
            }))
          : []),
        ...careGuidance.nextSteps,
        {
          stepId: 'step_1',
          text:
            explanationPayload.firstAid ||
            '先处理最明显的问题，再观察 3-7 天变化。'
        }
      ]
  const contributingFactors = shouldSuppressProblemLikePresentation ? [] : rawContributingFactors
  const intermediateStates = shouldSuppressProblemLikePresentation ? [] : rawIntermediateStates
  const topProblemPayload = shouldSuppressProblemLikePresentation || !primary
    ? null
    : {
        problemId: toProblemId(primary.problemKey),
        problemKey: primary.problemKey,
        displayName:
          primaryProblem?.displayNameCn ||
          primary.problemCn ||
          primary.problemKey,
        summary: summaryText,
        severity: mapSeverity(primaryProblem),
        urgency: mapUrgency(primaryProblem)
      }

  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage,
    observedSymptoms,
    rankings: rankings.map(item => ({
      problemId: toProblemId(item.problemKey),
      problemKey: item.problemKey,
      problemCn: item.problemCn,
      role: problemMap.get(item.problemKey)?.problemRole || '',
      visualEvidence: roundValue(item.visualEvidence),
      questionEvidence: roundValue(item.questionEvidence),
      totalEvidence: roundValue(item.totalEvidence),
      penalty: roundValue(item.penalty),
      hostCompatibility: roundValue(item.hostCompatibility),
      genusCompatibility: roundValue(item.genusCompatibility),
      evidenceCount: Number(item.evidenceCount || 0),
      finalScore: roundValue(item.finalScore),
      baseScore: roundValue(item.baseScore),
      rankNo: item.rankNo
    })),
    topProblem: topProblemPayload,
    finalResult: finalResultPayload,
    followUpRequired: Boolean(followUpRequired && followUps.length),
    followUps: followUps.map(question => {
      const questionRole = normalizeQuestionRole(
        question.questionRole || question.question_role || '',
        inferQuestionRole(question.targetDimension || question.target_dimension || '', question.routingScope || question.routing_scope || '')
      )
      const effectMode = normalizeQuestionEffectMode(
        question.effectMode || question.effect_mode || '',
        inferQuestionEffectMode(questionRole, question.targetDimension || question.target_dimension || '')
      )
      return {
        questionId: toQuestionId(question.questionKey),
        questionKey: question.questionKey,
        targetSymptomKey: question.targetSymptomKey || '',
        questionGroupKey: question.questionGroupKey,
        targetDimension: question.targetDimension || '',
        routingScope: question.routingScope || '',
        questionRole,
        questionCategory: questionRole,
        effectMode,
        type: 'single_choice',
        text: question.questionText,
        helpText: question.helpText,
        defaultOptionKey: question.defaultOptionKey || '',
        defaultOptionId: question.defaultOptionKey ? toOptionId(question.defaultOptionKey) : '',
        uiVariant: question.uiVariant || '',
        renderMode: question.renderMode || '',
        options: question.options.map(option => ({
          optionId: toOptionId(option.optionKey),
          optionKey: option.optionKey,
          text: option.text,
          description: option.description || option.desc || '',
          isDefault: Boolean(option.isDefault)
        }))
      }
    }),
    contributingFactors,
    intermediateStates,
    problemCausality: causality,
    resultExplanation: explanationPayload,
    explanation: explanationPayload,
    nextSteps,
    whatToAvoid: uniqList([
      ...(explanationPayload.avoid ? [explanationPayload.avoid] : []),
      ...(careGuidance.whatToAvoid || [])
    ]),
    confidenceLevel: outcomeType === 'uncertain' ? 'low' : 'normal',
    confidenceReasons: Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : [],
    needHumanReview: Boolean(outcomeType === 'uncertain'),
    highSpecificityFastConvergence: highSpecificityFastConvergence?.applied
      ? highSpecificityFastConvergence
      : null,
    outcomeType,
    outcomeLocked: normalizeText(stopDecision?.outcomeLocked || '', ''),
    uncertainLegalityReason: normalizeText(
      stopDecision?.uncertainLegalityReason || lowConfidence?.uncertainLegalityReason || '',
      ''
    ),
    decisionCause:
      stopDecision?.decisionCause && typeof stopDecision.decisionCause === 'object'
        ? stopDecision.decisionCause
        : null,
    stopDecision: stopDecision
      ? {
          outcomeLocked: normalizeText(stopDecision.outcomeLocked || '', ''),
          stopReason: normalizeText(stopDecision.stopReason || '', ''),
          stopReasonDetail: normalizeText(stopDecision.stopReasonDetail || '', ''),
          uncertainLegalityReason: normalizeText(
            stopDecision.uncertainLegalityReason || '',
            ''
          ),
          decisionCause:
            stopDecision?.decisionCause && typeof stopDecision.decisionCause === 'object'
              ? stopDecision.decisionCause
              : null
        }
      : null,
    routePrimaryAction,
    stopReason,
    stopReasonDetail: normalizeText(stopDecision?.stopReasonDetail || '', ''),
    sessionStatus: followUpRequired ? 'awaiting_follow_up' : 'completed',
    plantId,
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

module.exports = {
  formatDiagnosisResponse
}
