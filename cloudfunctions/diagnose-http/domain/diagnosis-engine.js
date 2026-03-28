'use strict'

const { clamp01 } = require('../repositories/sql')
const { evidence: evidenceConfig, ranking: rankingConfig } = require('../constants/scoring')
const {
  resolvePlantContext,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
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

async function buildCandidatePriors(plantContext) {
  let candidatePriors = await getCandidateProblemPriors(plantContext)
  if (!candidatePriors.length) {
    candidatePriors = await getGenusCandidatePriors(plantContext.genus)
  }
  return candidatePriors
}

async function buildFollowUps({
  rankings = [],
  askedQuestionKeys = [],
  unknownCountByGroup = {}
} = {}) {
  const topProblemKeys = rankings.slice(0, 3).map(item => item.problemKey)
  if (!topProblemKeys.length) return []

  const strategies = await getQuestionStrategies(topProblemKeys)
  if (!strategies.length) return []

  const questionKeys = Array.from(new Set(strategies.map(item => item.questionKey).filter(Boolean)))
  const [questions, optionMappings] = await Promise.all([
    getQuestionsByKeys(questionKeys),
    getQuestionOptionMappings(questionKeys)
  ])

  return selectFollowUpQuestions({
    rankings,
    strategies,
    questions,
    optionMappings,
    askedQuestionKeys,
    unknownCountByGroup,
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

function toLegacyCompatiblePayload(publicResponse = {}) {
  const topProblem = publicResponse.topProblem || null
  return {
    diagnosisId: publicResponse.diagnosisSessionId,
    healthScore: null,
    healthStatus: topProblem ? 'warning' : 'unknown',
    mainIssue: topProblem?.displayName || '',
    finalProblemKey: topProblem?.problemKey || null,
    finalProblemCn: topProblem?.displayName || '',
    summary: topProblem?.summary || '',
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
    resultExplanation: publicResponse.resultExplanation || {}
  }
}

async function runDiagnosisRound({
  openid,
  plantId = null,
  userPlantId = null,
  observedSymptoms = [],
  answers = [],
  askedQuestionKeys = [],
  unknownCountByGroup = {},
  round = 1,
  stage = 'preliminary',
  sessionId
}) {
  const plantContext = await resolvePlantContext({ openid, plantId, userPlantId })
  const candidatePriors = await buildCandidatePriors(plantContext)
  const candidateProblemKeys = candidatePriors.map(item => item.problemKey)

  if (!candidateProblemKeys.length) {
    return {
      diagnosisSessionId: sessionId,
      roundId: `round_${round}`,
      stage: 'failed',
      observedSymptoms,
      rankings: [],
      topProblem: null,
      finalResult: null,
      followUpRequired: false,
      followUps: [],
      contributingFactors: [],
      intermediateStates: [],
      resultExplanation: {
        whyItHappens: '当前植物缺少可用规则数据，建议补充更多图片后重试。',
        whatToCheckNext: '',
        firstAid: '',
        avoid: '',
        reassurance: ''
      },
      legacyDiagnosis: {
        diagnosisId: sessionId,
        needsFollowUp: false,
        rankings: [],
        observedSymptoms
      },
      metrics: {
        reliabilityScore: 0
      },
      plantContext
    }
  }

  const questionKeys = Array.from(new Set((answers || []).map(item => item.questionKey).filter(Boolean)))
  const optionMappings = questionKeys.length
    ? await getQuestionOptionMappings(questionKeys)
    : []

  const mappedSymptomKeys = collectMappedSymptomKeysFromAnswers(answers, optionMappings)
  const symptomKeys = Array.from(
    new Set([
      ...(observedSymptoms || []).map(item => item.symptomKey),
      ...mappedSymptomKeys
    ].filter(Boolean))
  )

  const [symptomRows, evidenceEdges, problems] = await Promise.all([
    symptomKeys.length ? getSymptomsByKeys(symptomKeys) : getSymptomDictionary(),
    symptomKeys.length
      ? getEvidenceEdges({ symptomKeys, problemKeys: candidateProblemKeys })
      : [],
    getProblemsByKeys(candidateProblemKeys)
  ])

  const symptomMap = mapByKey(symptomRows, 'symptomKey')
  const priorMap = mapByKey(candidatePriors, 'problemKey')

  const visualScores = computeVisualEvidenceScores({
    candidateProblemKeys,
    observedSymptoms,
    symptomDictionary: symptomRows,
    evidenceEdges
  })

  const { questionScores, penalties, answerEffects } = computeQuestionEvidenceAndPenalty({
    answers,
    optionMappings,
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

  const causalityEdges = await getCausalityEdges(rankings.slice(0, 3).map(item => item.problemKey))
  const causalityBoosts = computeCausalityBoosts(rankings, causalityEdges)

  rankings = rankings
    .map(item => ({
      ...item,
      causalityBoost: roundNum(causalityBoosts[item.problemKey] || 0),
      finalScore: roundNum(item.baseScore + Number(causalityBoosts[item.problemKey] || 0))
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((item, index) => ({ ...item, rankNo: index + 1 }))

  const reliabilityScore = resolveReliabilityScore(rankings)
  const scoreGap = rankings.length > 1 ? rankings[0].finalScore - rankings[1].finalScore : rankings[0]?.finalScore || 0

  const shouldAskFollowUp =
    round < rankingConfig.maxRounds &&
    (
      Number(rankings[0]?.finalScore || 0) < rankingConfig.followUpTopScoreThreshold ||
      Number(scoreGap || 0) < rankingConfig.followUpGapThreshold
    )

  const followUps = shouldAskFollowUp
    ? await buildFollowUps({
        rankings,
        askedQuestionKeys,
        unknownCountByGroup
      })
    : []

  const followUpRequired = Boolean(shouldAskFollowUp && followUps.length)
  const explanations = await getExplanationsByProblemKeys(rankings.slice(0, 5).map(item => item.problemKey))

  const mappedPositiveSymptoms = answerEffects
    .filter(item => item.effectType === 'positive' && item.mappedSymptomKey)
    .map(item => {
      const symptomMeta = symptomMap.get(item.mappedSymptomKey)
      return {
        symptomKey: item.mappedSymptomKey,
        symptomCn: symptomMeta?.displayTextCn || symptomMeta?.symptomCn || item.mappedSymptomKey,
        confidence: 1,
        source: 'follow_up_yes'
      }
    })

  const mergedObservedSymptoms = mergeObservedSymptoms(observedSymptoms, mappedPositiveSymptoms)

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
    followUpRequired
  })

  return {
    ...publicResponse,
    metrics: {
      reliabilityScore: roundNum(reliabilityScore),
      topScoreGap: roundNum(scoreGap)
    },
    answerEffects,
    plantContext,
    legacyDiagnosis: toLegacyCompatiblePayload(publicResponse)
  }
}

module.exports = {
  runDiagnosisRound
}
