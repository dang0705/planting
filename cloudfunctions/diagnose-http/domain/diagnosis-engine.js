'use strict'

const { clamp01 } = require('../repositories/sql')
const { toResultId } = require('../mappers/public-id-mapper')
const {
  evidence: evidenceConfig,
  ranking: rankingConfig,
  lowConfidence: lowConfidenceConfig
} = require('../constants/scoring')
const {
  resolvePlantContext,
  getLinkedCandidatePriors,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
  getHostCandidatePriors,
  getGenusCompatibilityMap,
  getHostCompatibilityMap
} = require('../repositories/prior-repository')
const { getProblemsByKeys, getExplanationsByProblemKeys } = require('../repositories/problem-repository')
const {
  getSymptomDictionary,
  getSymptomsByKeys,
  getEvidenceEdges
} = require('../repositories/symptom-repository')
const {
  getQuestionStrategies,
  getQuestionsByKeys,
  getQuestionOptionMappings
} = require('../repositories/question-repository')
const { getCausalityEdges } = require('../repositories/causality-repository')
const {
  computeVisualEvidenceScores,
  computeQuestionEvidenceAndPenalty
} = require('./evidence-scoring')
const { computeGenusFactor, computeHostFactor } = require('./prior-scorers')
const { computeCausalityBoosts } = require('./causality-scorer')
const { selectFollowUpQuestions } = require('./question-selector')
const { formatDiagnosisResponse } = require('./result-formatter')
const { buildRuntimeArtifacts } = require('./runtime-artifacts')
const { resolveHighSpecificityConvergencePlan } = require('./high-specificity-fast-convergence')
const {
  resolveNonProblematicRule,
  resolveNonProblematicFollowUpCandidate,
  buildNonProblematicRoundResult,
  buildNonProblematicFollowUpRoundResult
} = require('./non-problematic-resolver')
const {
  buildObservedEvidenceSetFromSymptoms,
  buildObservedEvidenceSetFromVisualAggregateResult,
  buildObservedEvidenceSetFromAnswerEffects,
  mergeObservedEvidenceSet,
  normalizeObservedEvidenceSetItems,
  projectObservedSymptomsFromEvidence
} = require('./observed-evidence')

function roundNum(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function mapByKey(list = [], key = 'problemKey') {
  const map = new Map()
  for (const item of list || []) {
    const id = item?.[key]
    if (!id) continue
    map.set(id, item)
  }
  return map
}

function mergeObservedSymptoms(primary = [], extra = []) {
  const map = new Map()
  const merged = [...(primary || []), ...(extra || [])]
  for (const item of merged) {
    const key = String(item?.symptomKey || '').trim()
    if (!key) continue
    const current = map.get(key)
    if (!current || Number(item.confidence || 0) > Number(current.confidence || 0)) {
      map.set(key, {
        symptomKey: key,
        symptomCn: item.symptomCn || current?.symptomCn || key,
        confidence: clamp01(item.confidence ?? current?.confidence ?? 0.7),
        source: item.source || current?.source || 'visual_ai'
      })
    }
  }
  return Array.from(map.values())
}

function resolveReliabilityScore(rankings = []) {
  const top = rankings[0]
  const second = rankings[1] || { finalScore: 0 }
  if (!top) return 0

  const scoreGap = Math.max(Number(top.finalScore || 0) - Number(second.finalScore || 0), 0)
  const base = 1 - Math.exp(-Math.max(Number(top.finalScore || 0), 0))
  const gapBonus = Math.min(scoreGap, 1) * 0.35
  return clamp01(base * 0.7 + gapBonus)
}

function mergeCandidatePriors(...groups) {
  const merged = new Map()

  for (const group of groups) {
    for (const item of group || []) {
      if (!item?.problemKey) continue
      const existing = merged.get(item.problemKey) || {
        problemKey: item.problemKey,
        genusCompatibility: null,
        hostCompatibility: null,
        finalPriorScore: 0,
        matchedHostLevel: '',
        sourceLayer: '',
        dataStatus: item.dataStatus || 'partial'
      }

      merged.set(item.problemKey, {
        ...existing,
        genusCompatibility:
          item.genusCompatibility ?? existing.genusCompatibility,
        hostCompatibility:
          item.hostCompatibility ?? existing.hostCompatibility,
        finalPriorScore: Math.max(
          Number(existing.finalPriorScore || 0),
          Number(item.finalPriorScore || 0)
        ),
        matchedHostLevel: item.matchedHostLevel || existing.matchedHostLevel || '',
        sourceLayer: item.sourceLayer || existing.sourceLayer || '',
        dataStatus: item.dataStatus || existing.dataStatus || 'partial'
      })
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => Number(b.finalPriorScore || 0) - Number(a.finalPriorScore || 0)
  )
}

function buildLowConfidenceAdvice({ observedSymptoms = [], unknownCountByGroup = {}, noHighValueQuestion = false } = {}) {
  const advice = []

  if (noHighValueQuestion) {
    advice.push('当前缺少高价值问诊题，建议补拍整株、病斑特写、叶背和盆土照片后重新开始诊断。')
  }

  if ((observedSymptoms || []).length === 0) {
    advice.push('当前可用症状较少，建议在自然光下重新拍摄受损部位和整株照片。')
  }

  if (Object.values(unknownCountByGroup || {}).some(value => Number(value || 0) >= lowConfidenceConfig.unknownGroupThreshold)) {
    advice.push('已有多个关键问题无法确认，建议重点检查叶背、根部、盆土表面或虫体。')
  }

  if (!advice.length) {
    advice.push('当前证据仍不够稳定，建议补查叶背、根部、盆土状态，必要时重新开始诊断。')
  }

  return Array.from(new Set(advice))
}

function resolveLowConfidenceState({
  rankings = [],
  observedSymptoms = [],
  unknownCountByGroup = {},
  noHighValueQuestion = false
} = {}) {
  const topScore = Number(rankings[0]?.finalScore || 0)
  const secondScore = Number(rankings[1]?.finalScore || 0)
  const scoreGap = Math.max(topScore - secondScore, 0)
  const maxVisualConfidence = Math.max(
    0,
    ...(observedSymptoms || []).map(item => Number(item?.confidence || 0))
  )
  const unknownGroupCount = Object.values(unknownCountByGroup || {}).filter(
    value => Number(value || 0) >= lowConfidenceConfig.unknownGroupThreshold
  ).length

  const reasons = []
  if (topScore < lowConfidenceConfig.topScoreThreshold) reasons.push('top_score_low')
  if (scoreGap < lowConfidenceConfig.scoreGapThreshold) reasons.push('score_gap_small')
  if (unknownGroupCount > 0) reasons.push('too_many_unknowns')
  if ((observedSymptoms || []).length > 0 && maxVisualConfidence < lowConfidenceConfig.visualConfidenceThreshold) {
    reasons.push('visual_confidence_low')
  }
  if (noHighValueQuestion) reasons.push('no_high_value_questions')

  return {
    isLowConfidence: reasons.length > 0,
    reasons,
    advice: buildLowConfidenceAdvice({
      observedSymptoms,
      unknownCountByGroup,
      noHighValueQuestion
    })
  }
}

async function buildCandidatePriors(plantContext, observedSymptoms = [], { round = 1, stage = 'preliminary' } = {}) {
  const symptomKeys = Array.from(
    new Set((observedSymptoms || []).map(item => String(item?.symptomKey || '').trim()).filter(Boolean))
  )

  const linkedPriorBundle = await getLinkedCandidatePriors(plantContext)
  const linkedPriors = Array.isArray(linkedPriorBundle?.priors) ? linkedPriorBundle.priors : []
  const shouldUseLegacyFallback = !linkedPriorBundle?.hasAnyLinks
  const plantPriors = shouldUseLegacyFallback
    ? await getCandidateProblemPriors(plantContext)
    : []
  const genusPriors = shouldUseLegacyFallback
    ? await getGenusCandidatePriors(plantContext.genus)
    : []
  const hostPriors = shouldUseLegacyFallback
    ? await getHostCandidatePriors({
        genus: plantContext.genus,
        family: plantContext.family,
        category: plantContext.category
      })
    : []
  const evidenceEdges = symptomKeys.length
    ? await getEvidenceEdges({ symptomKeys })
    : []

  const evidenceOnlyPriors = Array.from(
    new Set((evidenceEdges || []).map(item => item.problemKey).filter(Boolean))
  ).map(problemKey => ({
    problemKey,
    genusCompatibility: null,
    hostCompatibility: null,
    finalPriorScore: 0.35,
    matchedHostLevel: '',
    sourceLayer: 'evidence_hit',
      dataStatus: 'partial'
    }))

  const prioritizedStaticPriors =
    linkedPriors.length || !shouldUseLegacyFallback
      ? linkedPriors
      : mergeCandidatePriors(plantPriors, genusPriors, hostPriors)
  const merged = mergeCandidatePriors(
    prioritizedStaticPriors,
    evidenceOnlyPriors
  )

  if (Number(round || 1) <= 1 && stage !== 'followup') {
    return merged
  }

  const baseProblemKeys = merged.map(item => item.problemKey)
  const causalityEdges = baseProblemKeys.length ? await getCausalityEdges(baseProblemKeys) : []
  const causalLinkedPriors = Array.from(
    new Set(
      (causalityEdges || [])
        .flatMap(item => [item.causeProblemKey, item.effectProblemKey])
        .filter(Boolean)
    )
  )
    .filter(problemKey => !baseProblemKeys.includes(problemKey))
    .map(problemKey => ({
      problemKey,
      genusCompatibility: null,
      hostCompatibility: null,
      finalPriorScore: 0.2,
      matchedHostLevel: '',
      sourceLayer: 'causal_linked',
      dataStatus: 'partial'
    }))

  return mergeCandidatePriors(merged, causalLinkedPriors)
}

async function buildFollowUps({
  rankings = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  symptomDictionary = [],
  askedQuestionKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = '',
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  const topProblemKeys = rankings.slice(0, 3).map(item => item.problemKey)
  if (!topProblemKeys.length) return []

  const strategies = await getQuestionStrategies(topProblemKeys)
  if (!strategies.length) return []

  const questionKeys = Array.from(new Set(strategies.map(item => item.questionKey).filter(Boolean)))
  const questions = await getQuestionsByKeys(questionKeys)
  const optionMappings = await getQuestionOptionMappings(questionKeys)

  return selectFollowUpQuestions({
    rankings,
    strategies,
    questions,
    optionMappings,
    observedSymptoms: (observedSymptoms || []).map(item => {
      const symptomMeta = (symptomDictionary || []).find(row => row.symptomKey === item?.symptomKey)
      return {
        ...item,
        signalReliability: Number(symptomMeta?.signalReliability || 0)
      }
    }),
    observedEvidenceSet,
    askedQuestionKeys,
    unknownCountByGroup,
    visualRouteHints,
    suggestedFollowupCapture,
    visualRoutePrimaryAction,
    maxQuestions
  })
}

async function buildProblemScopedFollowUps({
  problemKey = '',
  observedSymptoms = [],
  observedEvidenceSet = [],
  symptomDictionary = [],
  askedQuestionKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = ''
} = {}) {
  const safeProblemKey = String(problemKey || '').trim()
  if (!safeProblemKey) return []

  const strategies = await getQuestionStrategies([safeProblemKey])
  if (!strategies.length) return []

  const questionKeys = Array.from(new Set(strategies.map(item => item.questionKey).filter(Boolean)))
  const questions = await getQuestionsByKeys(questionKeys)
  const optionMappings = await getQuestionOptionMappings(questionKeys)
  const safeSymptomDictionary = Array.isArray(symptomDictionary) && symptomDictionary.length
    ? symptomDictionary
    : await getSymptomDictionary()

  return selectFollowUpQuestions({
    rankings: [{
      problemKey: safeProblemKey,
      finalScore: 1,
      baseScore: 1
    }],
    strategies,
    questions,
    optionMappings,
    observedSymptoms: (observedSymptoms || []).map(item => {
      const symptomMeta = safeSymptomDictionary.find(row => row.symptomKey === item?.symptomKey)
      return {
        ...item,
        signalReliability: Number(symptomMeta?.signalReliability || 0)
      }
    }),
    observedEvidenceSet,
    askedQuestionKeys,
    unknownCountByGroup,
    visualRouteHints,
    suggestedFollowupCapture,
    visualRoutePrimaryAction,
    maxQuestions: rankingConfig.maxQuestionsPerRound
  })
}

function collectMappedSymptomKeysFromAnswers(answers = [], optionMappings = []) {
  const answerKeySet = new Set(
    (answers || []).map(item => `${item.questionKey}::${item.optionKey}`)
  )
  return optionMappings
    .filter(item => answerKeySet.has(`${item.questionKey}::${item.optionKey}`))
    .map(item => item.mapsToSymptomKey)
    .filter(Boolean)
}

function collectPositiveMappedObservedSymptomsFromAnswers(answers = [], optionMappings = []) {
  const answerKeySet = new Set(
    (answers || []).map(item => `${item.questionKey}::${item.optionKey}`)
  )
  const observedMap = new Map()

  for (const item of optionMappings || []) {
    if (!answerKeySet.has(`${item.questionKey}::${item.optionKey}`)) continue

    const mappedSymptomKey = String(item.mapsToSymptomKey || '').trim()
    const answerValue = Number(item.value || 0)
    const associationStrength = clamp01(item.associationStrength)
    if (!mappedSymptomKey || answerValue <= 0 || associationStrength <= 0) continue

    const confidence = clamp01(Math.max(answerValue, associationStrength))
    const current = observedMap.get(mappedSymptomKey)
    if (!current || confidence > Number(current.confidence || 0)) {
      observedMap.set(mappedSymptomKey, {
        symptomKey: mappedSymptomKey,
        symptomCn: mappedSymptomKey,
        confidence,
        source: 'follow_up_yes'
      })
    }
  }

  return Array.from(observedMap.values())
}

function resolveIdentityResolutionStatus(plantContext = {}) {
  if (plantContext?.identityResolutionStatus) {
    return plantContext.identityResolutionStatus
  }
  return plantContext?.plantIdentityId ? 'matched' : 'unresolved'
}

function normalizeRoutePrimaryAction(value = '') {
  const normalized = String(value || '').trim()
  return ['retake_first', 'ask_first', 'uncertain_prepare', 'standard_flow'].includes(normalized)
    ? normalized
    : ''
}

function normalizeRouteHints(routeHints = []) {
  return (Array.isArray(routeHints) ? routeHints : [])
    .map(item => ({
      type: String(item?.type || '').trim(),
      reason: String(item?.reason || '').trim()
    }))
    .filter(item => item.type)
}

function resolveVisualRouteContext(visualAggregateResult = null) {
  return {
    routePrimaryAction: normalizeRoutePrimaryAction(visualAggregateResult?.route_primary_action),
    routeHints: normalizeRouteHints(visualAggregateResult?.aggregate_route_hints || []),
    suggestedFollowupCapture: (Array.isArray(visualAggregateResult?.suggested_followup_capture)
      ? visualAggregateResult.suggested_followup_capture
      : []
    )
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }
}

function buildRetakeAdviceFromVisualRouteContext(visualRouteContext = {}) {
  const followupCapture = Array.isArray(visualRouteContext?.suggestedFollowupCapture)
    ? visualRouteContext.suggestedFollowupCapture
    : []

  if (followupCapture.length) {
    return Array.from(
      new Set(
        followupCapture.map(item =>
          item.startsWith('请') ? item : `请优先补拍：${item}`
        )
      )
    )
  }

  return [
    '请优先补拍更清晰的受损部位近照。',
    '请补拍主体更完整的整株图，避免只拍局部。'
  ]
}

function buildUncertainRoundResult({
  sessionId,
  round = 1,
  stage = 'final',
  observedSymptoms = [],
  plantContext = {},
  confidenceReasons = [],
  advice = [],
  stopReason = 'uncertain_output_ready',
  routePrimaryAction = 'uncertain_prepare'
} = {}) {
  const resultId = toResultId(sessionId, round)
  const summary = advice[0] || '当前证据不足，暂不能安全判断。'
  const explanation = {
    whyItHappens: '当前植物缺少可用规则数据或正式证据，继续硬判风险较高。',
    whatToCheckNext: advice[0] || '建议补充更稳定的图片、宿主信息和症状观察后再判断。',
    firstAid: advice[1] || '先保持当前养护稳定，避免一次性大幅调整浇水、施肥或用药。',
    avoid: '不要在证据不足时立即大幅调整养护或连续使用药剂。',
    reassurance: '暂不硬判是当前更安全的输出。'
  }

  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage,
    observedSymptoms,
    rankings: [],
    topProblem: null,
    finalResult: {
      resultId,
      problemId: '',
      displayName: '暂不能稳定判断',
      summary,
      severity: 'low',
      urgency: 'medium'
    },
    followUpRequired: false,
    followUps: [],
    contributingFactors: [],
    intermediateStates: [],
    problemCausality: [],
    resultExplanation: explanation,
    explanation,
    nextSteps: [
      ...advice.map((text, index) => ({
        stepId: `uncertain_${index + 1}`,
        text
      })),
      {
        stepId: 'step_1',
        text: explanation.firstAid
      }
    ],
    whatToAvoid: [explanation.avoid],
    confidenceLevel: 'low',
    confidenceReasons,
    needHumanReview: true,
    outcomeType: 'uncertain',
    routePrimaryAction: normalizeRoutePrimaryAction(routePrimaryAction) || 'uncertain_prepare',
    stopReason,
    sessionStatus: 'completed',
    plantId: plantContext.userPlantId || plantContext.plantId || '',
    resultId,
    timestamp: Date.now()
  }

  return {
    ...response,
    ...buildRuntimeArtifacts(response)
  }
}

function toLegacyCompatiblePayload(publicResponse = {}) {
  const topProblem = publicResponse.topProblem || null
  const finalResult = publicResponse.finalResult || null
  const isProblematicOutcome = String(publicResponse.outcomeType || '') === 'problematic'
  return {
    diagnosisId: publicResponse.diagnosisSessionId,
    healthScore: null,
    healthStatus: isProblematicOutcome && topProblem ? 'warning' : 'unknown',
    mainIssue: finalResult?.displayName || topProblem?.displayName || '',
    finalProblemKey: isProblematicOutcome ? (topProblem?.problemKey || finalResult?.problemKey || null) : null,
    finalProblemCn: finalResult?.displayName || topProblem?.displayName || '',
    summary: finalResult?.summary || topProblem?.summary || '',
    observedSymptoms: publicResponse.observedSymptoms || [],
    rankings: (publicResponse.rankings || []).map((item, index) => ({
      problemKey: item.problemKey,
      problemCn: item.problemCn || item.problemKey,
      weightedScore: item.finalScore,
      rankNo: index + 1,
      finalScore: item.finalScore
    })),
    needsFollowUp: Boolean(publicResponse.followUpRequired),
    followUps: (publicResponse.followUps || []).map(item => ({
      questionKey: item.questionKey,
      questionText: item.text,
      questionGroupKey: item.questionGroupKey,
      options: item.options || []
    })),
    problemCausality: publicResponse.problemCausality || [],
    reliabilityScore: 0,
    resultExplanation: publicResponse.resultExplanation || {},
    outcomeType: publicResponse.outcomeType || '',
    routePrimaryAction: publicResponse.routePrimaryAction || ''
  }
}

async function runDiagnosisRound({
  openid,
  plantId = null,
  userPlantId = null,
  lockedPlantContext = null,
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualAggregateResult = null,
  answers = [],
  askedQuestionKeys = [],
  unknownCountByGroup = {},
  round = 1,
  stage = 'preliminary',
  sessionId
}) {
  const plantContext = lockedPlantContext
    ? {
        userPlantId: lockedPlantContext.userPlantId || userPlantId || null,
        plantId: lockedPlantContext.plantId || plantId || null,
        plantDisplayName: lockedPlantContext.plantDisplayName || '未知植物',
        plantIdentityId: lockedPlantContext.plantIdentityId || '',
        identityResolutionStatus: lockedPlantContext.identityResolutionStatus || '',
        latestVisualCallBatchId: lockedPlantContext.latestVisualCallBatchId || '',
        genus: lockedPlantContext.genus || '',
        family: lockedPlantContext.family || '',
        category: lockedPlantContext.category || ''
      }
    : await resolvePlantContext({ openid, plantId, userPlantId })
  const visualRouteContext = resolveVisualRouteContext(visualAggregateResult)
  const preferredVisualRouteAction = visualRouteContext.routePrimaryAction
  const runtimeOriginVisualCallBatchId =
    visualAggregateResult?.visual_batch_trace?.origin_visual_call_batch_id ||
    visualAggregateResult?.visual_call_batch_id ||
    plantContext.latestVisualCallBatchId ||
    ''

  const questionKeys = Array.from(new Set((answers || []).map(item => item.questionKey).filter(Boolean)))
  const answerOptionMappings = questionKeys.length
    ? await getQuestionOptionMappings(questionKeys)
    : []
  const answerDerivedSymptoms = collectPositiveMappedObservedSymptomsFromAnswers(
    answers,
    answerOptionMappings
  )
  const observedEvidenceForResolution = mergeObservedEvidenceSet(
    normalizeObservedEvidenceSetItems(observedEvidenceSet),
    buildObservedEvidenceSetFromSymptoms(observedSymptoms, {
      sourceType: 'legacy_observed_symptom',
      firstSeenStage: stage,
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      enteredRuntime: 1
    }),
    buildObservedEvidenceSetFromVisualAggregateResult(visualAggregateResult, {
      firstSeenStage: stage
    }),
    buildObservedEvidenceSetFromSymptoms(answerDerivedSymptoms, {
      sourceType: 'follow_up_seed',
      firstSeenStage: stage,
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      enteredRuntime: 1
    })
  )
  const observedSymptomsForResolution = projectObservedSymptomsFromEvidence(
    observedEvidenceForResolution
  )

  if (
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    observedSymptomsForResolution.length === 0
  ) {
    const publicResponse = buildUncertainRoundResult({
      sessionId,
      round,
      stage: 'final',
      observedSymptoms: [],
      plantContext,
      confidenceReasons: ['no_visual_symptoms_detected'],
      advice:
        preferredVisualRouteAction === 'retake_first'
          ? buildRetakeAdviceFromVisualRouteContext(visualRouteContext)
          : [
              '当前图片里没有识别到足够稳定的可见症状，暂时不适合直接推断具体问题。',
              '建议补拍整株、受损部位特写、叶背和盆土状态，再重新开始诊断。'
            ],
      routePrimaryAction:
        preferredVisualRouteAction === 'retake_first'
          ? 'retake_first'
          : 'uncertain_prepare',
      stopReason: 'no_visual_symptoms_detected'
    })
    const enrichedResponse = {
      ...publicResponse,
      observedEvidenceSet: observedEvidenceForResolution,
      plantIdentityId: plantContext.plantIdentityId || '',
      identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
      latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
      currentRoundIndex: round,
      currentRoundId: publicResponse.roundId
    }

    return {
      ...enrichedResponse,
      legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
      metrics: {
        reliabilityScore: 0
      },
      plantContext
    }
  }

  const nonProblematicRule = resolveNonProblematicRule({
    observedSymptoms: observedSymptomsForResolution,
    observedEvidenceSet: observedEvidenceForResolution
  })
  if (nonProblematicRule) {
    const publicResponse = buildNonProblematicRoundResult({
      sessionId,
      round,
      stage: 'final',
      observedSymptoms: observedSymptomsForResolution,
      plantContext,
      rule: nonProblematicRule
    })
    const enrichedResponse = {
      ...publicResponse,
      observedEvidenceSet: observedEvidenceForResolution,
      plantIdentityId: plantContext.plantIdentityId || '',
      identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
      latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
      currentRoundIndex: round,
      currentRoundId: publicResponse.roundId
    }

    return {
      ...enrichedResponse,
      legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
      metrics: {
        reliabilityScore: 1
      },
      plantContext
    }
  }

  const nonProblematicFollowUpCandidate = Number(round || 1) < rankingConfig.maxRounds
    ? resolveNonProblematicFollowUpCandidate({
        observedSymptoms: observedSymptomsForResolution,
        observedEvidenceSet: observedEvidenceForResolution
      })
    : null

  if (nonProblematicFollowUpCandidate) {
    const symptomDictionary = await getSymptomDictionary()
    const followUps = await buildProblemScopedFollowUps({
      problemKey:
        nonProblematicFollowUpCandidate.questionProblemKey ||
        nonProblematicFollowUpCandidate.problemKey ||
        nonProblematicFollowUpCandidate.key ||
        '',
      observedSymptoms: observedSymptomsForResolution,
      observedEvidenceSet: observedEvidenceForResolution,
      symptomDictionary,
      askedQuestionKeys,
      unknownCountByGroup,
      visualRouteHints: visualRouteContext.routeHints,
      suggestedFollowupCapture: visualRouteContext.suggestedFollowupCapture,
      visualRoutePrimaryAction: preferredVisualRouteAction
    })

    if (followUps.length) {
      const publicResponse = buildNonProblematicFollowUpRoundResult({
        sessionId,
        round,
        observedSymptoms: observedSymptomsForResolution,
        plantContext,
        rule: nonProblematicFollowUpCandidate,
        followUps
      })
      const enrichedResponse = {
        ...publicResponse,
        observedEvidenceSet: observedEvidenceForResolution,
        plantIdentityId: plantContext.plantIdentityId || '',
        identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
        latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
        currentRoundIndex: round,
        currentRoundId: publicResponse.roundId
      }

      return {
        ...enrichedResponse,
        legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
        metrics: {
          reliabilityScore: 0
        },
        plantContext
      }
    }
  }

  const candidatePriors = await buildCandidatePriors(
    plantContext,
    observedSymptomsForResolution,
    { round, stage }
  )
  const candidateProblemKeys = candidatePriors.map(item => item.problemKey)

  if (!candidateProblemKeys.length) {
    const publicResponse = buildUncertainRoundResult({
      sessionId,
      round,
      stage: 'final',
      observedSymptoms: observedSymptomsForResolution,
      plantContext,
      confidenceReasons: ['no_candidate_priors'],
      advice:
        preferredVisualRouteAction === 'retake_first'
          ? buildRetakeAdviceFromVisualRouteContext(visualRouteContext)
          : [
              '当前植物缺少可用问题规则，建议补充更稳定的宿主资料或重新上传清晰图片。',
              '先保持当前养护稳定，再观察 3-7 天是否继续扩展。'
            ],
      routePrimaryAction:
        preferredVisualRouteAction === 'retake_first'
          ? 'retake_first'
          : 'uncertain_prepare',
      stopReason: 'insufficient_candidate_priors'
    })
    const enrichedResponse = {
      ...publicResponse,
      observedEvidenceSet: observedEvidenceForResolution,
      plantIdentityId: plantContext.plantIdentityId || '',
      identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
      latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
      currentRoundIndex: round,
      currentRoundId: publicResponse.roundId
    }

    return {
      ...enrichedResponse,
      legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
      metrics: {
        reliabilityScore: 0
      },
      plantContext
    }
  }

  const mappedSymptomKeys = collectMappedSymptomKeysFromAnswers(
    answers,
    answerOptionMappings
  )
  const symptomKeys = Array.from(
    new Set([
      ...observedSymptomsForResolution.map(item => item.symptomKey),
      ...mappedSymptomKeys
    ].filter(Boolean))
  )

  const symptomRows = symptomKeys.length
    ? await getSymptomsByKeys(symptomKeys)
    : await getSymptomDictionary()
  const evidenceEdges = symptomKeys.length
    ? await getEvidenceEdges({ symptomKeys, problemKeys: candidateProblemKeys })
    : []
  const problems = await getProblemsByKeys(candidateProblemKeys)

  const symptomMap = mapByKey(symptomRows, 'symptomKey')
  const priorMap = mapByKey(candidatePriors, 'problemKey')

  const visualScores = computeVisualEvidenceScores({
    candidateProblemKeys,
    observedSymptoms: observedSymptomsForResolution,
    observedEvidenceSet: observedEvidenceForResolution,
    symptomDictionary: symptomRows,
    evidenceEdges
  })

  const { questionScores, penalties, answerEffects } = computeQuestionEvidenceAndPenalty({
    answers,
    optionMappings: answerOptionMappings,
    candidateProblemKeys,
    symptomDictionary: symptomRows,
    evidenceEdges
  })

  const fallbackGenusMap = await getGenusCompatibilityMap(
    plantContext.genus,
    candidateProblemKeys
  )
  const fallbackHostMap = await getHostCompatibilityMap(
    {
      genus: plantContext.genus,
      family: plantContext.family,
      category: plantContext.category
    },
    candidateProblemKeys
  )

  let rankings = candidateProblemKeys.map(problemKey => {
    const prior = priorMap.get(problemKey) || {}
    const genusCompatibility =
      Number(prior.genusCompatibility ?? fallbackGenusMap[problemKey] ?? 0.5)
    const hostCompatibility =
      Number(prior.hostCompatibility ?? fallbackHostMap[problemKey]?.hostCompatibility ?? 1)

    const visualEvidence = Number(visualScores[problemKey] || 0)
    const questionEvidence = Number(questionScores[problemKey] || 0)
    const penalty = Number(penalties[problemKey] || 0)

    const totalEvidence = visualEvidence + evidenceConfig.questionWeight * questionEvidence
    const baseScore =
      totalEvidence *
        computeGenusFactor(genusCompatibility) *
        computeHostFactor(hostCompatibility) -
      penalty

    const problem = problems.find(item => item.problemKey === problemKey)

    return {
      problemKey,
      problemCn: problem?.problemCn || problemKey,
      problemRole: problem?.problemRole || 'root_cause',
      visualEvidence: roundNum(visualEvidence),
      questionEvidence: roundNum(questionEvidence),
      penalty: roundNum(penalty),
      totalEvidence: roundNum(totalEvidence),
      genusCompatibility: roundNum(genusCompatibility),
      hostCompatibility: roundNum(hostCompatibility),
      baseScore: roundNum(baseScore),
      finalScore: roundNum(baseScore)
    }
  })

  rankings = rankings.sort((a, b) => b.baseScore - a.baseScore)

  const allowCausalityBoost = Number(round || 1) > 1 || stage === 'followup'
  const causalityEdges = allowCausalityBoost
    ? await getCausalityEdges(rankings.slice(0, 3).map(item => item.problemKey))
    : []
  const causalityBoosts = allowCausalityBoost
    ? computeCausalityBoosts(rankings, causalityEdges)
    : {}

  rankings = rankings
    .map(item => {
      const causalityBoost = roundNum(causalityBoosts[item.problemKey] || 0)
      return {
        ...item,
        causalityBoost,
        finalScore: roundNum(item.baseScore + causalityBoost)
      }
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((item, index) => ({ ...item, rankNo: index + 1 }))

  const reliabilityScore = resolveReliabilityScore(rankings)
  const scoreGap = rankings.length > 1 ? rankings[0].finalScore - rankings[1].finalScore : rankings[0]?.finalScore || 0
  const fastConvergencePlan = resolveHighSpecificityConvergencePlan({
    visualAggregateResult,
    visualRouteContext,
    observedEvidenceSet: observedEvidenceForResolution,
    symptomDictionary: symptomRows,
    rankings,
    problems,
    round,
    stage
  })

  const hasEligibleTop1 = rankings.some(item =>
    rankingConfig.supportRolesAsTop1.includes(String(item.problemRole || '').trim())
  )

  const shouldAskFollowUpByRanking =
    preferredVisualRouteAction !== 'retake_first' &&
    round < rankingConfig.maxRounds &&
    (
      preferredVisualRouteAction === 'ask_first' ||
      !hasEligibleTop1 ||
      Number(rankings[0]?.finalScore || 0) < rankingConfig.followUpTopScoreThreshold ||
      Number(scoreGap || 0) < rankingConfig.followUpGapThreshold
    )
  const shouldAskFollowUp =
    shouldAskFollowUpByRanking &&
    !Boolean(fastConvergencePlan?.shouldBypassFollowUp)

  const mergedObservedEvidence = mergeObservedEvidenceSet(
    observedEvidenceForResolution,
    buildObservedEvidenceSetFromAnswerEffects(answerEffects, symptomMap, {
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      firstSeenStage: stage === 'followup' ? 'followup' : stage
    })
  )
  const mergedObservedSymptoms = projectObservedSymptomsFromEvidence(mergedObservedEvidence)
  const followUps = shouldAskFollowUp
    ? await buildFollowUps({
        rankings,
        observedSymptoms: mergedObservedSymptoms,
        observedEvidenceSet: mergedObservedEvidence,
        symptomDictionary: symptomRows,
        askedQuestionKeys,
        unknownCountByGroup,
        visualRouteHints: visualRouteContext.routeHints,
        suggestedFollowupCapture: visualRouteContext.suggestedFollowupCapture,
        visualRoutePrimaryAction: preferredVisualRouteAction,
        maxQuestions:
          Number(fastConvergencePlan?.maxQuestions || 0) > 0
            ? Number(fastConvergencePlan.maxQuestions)
            : rankingConfig.maxQuestionsPerRound
      })
    : []

  const lowConfidenceBase = resolveLowConfidenceState({
    rankings,
    observedSymptoms: mergedObservedSymptoms,
    unknownCountByGroup,
    noHighValueQuestion: Boolean(shouldAskFollowUp && followUps.length === 0)
  })
  const lowConfidence = fastConvergencePlan?.applied
    ? {
        ...lowConfidenceBase,
        isLowConfidence: false,
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidenceBase?.reasons) ? lowConfidenceBase.reasons : []),
            'high_specificity_fast_convergence'
          ])
        )
      }
    : lowConfidenceBase
  const followUpRequired = Boolean(shouldAskFollowUp && followUps.length)
  const explanations = await getExplanationsByProblemKeys(rankings.slice(0, 5).map(item => item.problemKey))

  const stageFinal = followUpRequired ? 'followup' : 'final'

  const publicResponse = formatDiagnosisResponse({
    sessionId,
    round,
    stage: stageFinal,
    observedSymptoms: mergedObservedSymptoms,
    rankings,
    followUps,
    problems,
    explanations,
    causality: causalityEdges,
    plantId: plantContext.userPlantId || plantContext.plantId,
    followUpRequired,
    lowConfidence,
    highSpecificityFastConvergence: fastConvergencePlan,
    preferredRoutePrimaryAction:
      preferredVisualRouteAction === 'retake_first' ? 'retake_first' : ''
  })
  const enrichedResponse = {
    ...publicResponse,
    observedEvidenceSet: mergedObservedEvidence,
    plantIdentityId: plantContext.plantIdentityId || '',
    identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
    latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
    highSpecificityFastConvergence: fastConvergencePlan,
    currentRoundIndex: round,
    currentRoundId: publicResponse.roundId
  }

  return {
    ...enrichedResponse,
    metrics: {
      reliabilityScore: roundNum(reliabilityScore),
      topScoreGap: roundNum(scoreGap)
    },
    answerEffects,
    plantContext,
    legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse)
  }
}

module.exports = {
  runDiagnosisRound
}
