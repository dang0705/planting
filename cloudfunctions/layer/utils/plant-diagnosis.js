'use strict'

const { models } = require('/opt/utils/cloudbase')
const { diagnosis: DIAGNOSIS_RULES } = require('/opt/configs')
const { buildDiagnosisDecision } = require('./plant-knowledge')

const SYMPTOM_CACHE_TTL = DIAGNOSIS_RULES.symptomCacheTtlMs
const symptomCache = {
  expiresAt: 0,
  list: []
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits))
}

function uniqueBy(list, key) {
  const seen = new Set()
  return list.filter(item => {
    const currentKey = key(item)
    if (seen.has(currentKey)) {
      return false
    }
    seen.add(currentKey)
    return true
  })
}

function buildSymptomAliases(row) {
  const symptomCn = String(row.symptom_cn || '').trim()
  const aliases = new Set()

  if (symptomCn) {
    aliases.add(symptomCn)
    const simplified = symptomCn.replace(/^(叶片|叶面|叶背|叶缘|叶尖|新叶|老叶|根部|根系|茎部|茎基部|花朵|花瓣|花苞|枝条|盆土|土表|果实)/, '')
    if (simplified && simplified.length >= 2) {
      aliases.add(simplified)
    }
    if (symptomCn.length >= 4) {
      aliases.add(symptomCn.slice(-2))
      aliases.add(symptomCn.slice(-3))
    }
  }

  const note = String(row.note || '')
  for (const part of note.split(/[，、/,；;]/)) {
    const token = part.trim()
    if (token.length >= 2 && token.length <= 8 && /[\u4e00-\u9fa5]/.test(token)) {
      aliases.add(token)
    }
  }

  return Array.from(aliases)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && /[\u4e00-\u9fa5]/.test(item))
    .sort((a, b) => b.length - a.length)
}

async function getSymptomDictionary() {
  const now = Date.now()
  if (symptomCache.expiresAt > now && symptomCache.list.length) {
    return symptomCache.list
  }

  const result = await models.$runSQL(
    `
      SELECT
        symptom_key,
        symptom_cn,
        location_key,
        symptom_type,
        COALESCE(signal_reliability, 0) AS base_evidence_weight,
        COALESCE(signal_reliability, 0) AS symptom_reliability,
        note
      FROM symptoms
      WHERE data_status = 'audited'
      ORDER BY COALESCE(signal_reliability, 0) DESC, symptom_key ASC
    `,
    {}
  )

  symptomCache.list = (result?.data?.executeResultList || []).map(row => ({
    symptomKey: row.symptom_key,
    symptomCn: row.symptom_cn,
    locationKey: row.location_key || '',
    symptomType: row.symptom_type || '',
    baseEvidenceWeight: Number(row.base_evidence_weight || 0),
    symptomReliability: Number(row.symptom_reliability || 0),
    note: row.note || '',
    aliases: buildSymptomAliases(row)
  }))
  symptomCache.expiresAt = now + SYMPTOM_CACHE_TTL
  return symptomCache.list
}

function mergeObservedSymptoms(...groups) {
  const merged = new Map()
  for (const group of groups) {
    for (const item of group || []) {
      if (!item?.symptomKey) {continue}
      const current = merged.get(item.symptomKey)
      if (!current || Number(item.confidence || 0) > Number(current.confidence || 0)) {
        merged.set(item.symptomKey, {
          symptomKey: item.symptomKey,
          symptomCn: item.symptomCn,
          locationKey: item.locationKey || '',
          confidence: round(item.confidence || 0),
          evidenceSource: item.evidenceSource || current?.evidenceSource || 'llm'
        })
      }
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => b.confidence - a.confidence || a.symptomKey.localeCompare(b.symptomKey)
  )
}

function normalizeAnswerValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no'
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['yes', 'y', 'true', '1', 'confirmed', 'present'].includes(normalized)) {return 'yes'}
  if (['no', 'n', 'false', '0', 'absent', 'missing'].includes(normalized)) {return 'no'}
  return 'unknown'
}

function normalizeObservedSymptomsInput(inputs = [], symptomDictionary = []) {
  if (!Array.isArray(inputs) || !inputs.length) {
    return []
  }

  const symptomMap = new Map(symptomDictionary.map(item => [item.symptomKey, item]))

  return uniqueBy(
    inputs
      .map(item => {
        const symptomKey =
          typeof item === 'string'
            ? String(item).trim()
            : String(item?.symptomKey || item?.symptom_key || '').trim()
        if (!symptomKey) {return null}

        const symptomMeta = symptomMap.get(symptomKey)
        if (!symptomMeta) {return null}
        const confidence = clamp(
          Number(
            typeof item === 'string'
              ? symptomMeta?.symptomReliability || symptomMeta?.baseEvidenceWeight || 0.95
              : item?.confidence
          ) ||
            symptomMeta?.symptomReliability ||
            symptomMeta?.baseEvidenceWeight ||
            0.95,
          DIAGNOSIS_RULES.confidenceMin,
          1
        )

        return {
          symptomKey,
          symptomCn:
            (typeof item === 'object' && (item?.symptomCn || item?.symptom_cn)) ||
            symptomMeta?.symptomCn ||
            symptomKey,
          locationKey:
            (typeof item === 'object' && (item?.locationKey || item?.location_key)) ||
            symptomMeta?.locationKey ||
            '',
          confidence: round(confidence),
          evidenceSource:
            (typeof item === 'object' && (item?.evidenceSource || item?.evidence_source)) ||
            'manual'
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.confidence - a.confidence || a.symptomKey.localeCompare(b.symptomKey)),
    item => item.symptomKey
  )
}

function normalizeFollowUpAnswers(answers = [], symptomDictionary = []) {
  if (!Array.isArray(answers) || !answers.length) {
    return []
  }

  const symptomMap = new Map(symptomDictionary.map(item => [item.symptomKey, item]))

  return uniqueBy(
    answers
      .map(item => {
        const symptomKey = String(item?.symptomKey || item?.symptom_key || '').trim()
        if (!symptomKey) {return null}

        const answerValue = normalizeAnswerValue(
          item?.answerValue ?? item?.answer_value ?? item?.observed ?? item?.value
        )
        const symptomMeta = symptomMap.get(symptomKey)
        const answerConfidence = clamp(
          Number(item?.answerConfidence ?? item?.answer_confidence ?? item?.confidence) || 1,
          DIAGNOSIS_RULES.confidenceMin,
          1
        )

        return {
          symptomKey,
          symptomCn: item?.symptomCn || item?.symptom_cn || symptomMeta?.symptomCn || symptomKey,
          locationKey: item?.locationKey || item?.location_key || symptomMeta?.locationKey || '',
          answerValue,
          answerConfidence: round(answerConfidence),
          observed: answerValue === 'yes'
        }
      })
      .filter(Boolean),
    item => item.symptomKey
  )
}

function mapHealthScore(topScore, reliabilityScore, needsFollowUp) {
  const certaintyPenalty =
    topScore * DIAGNOSIS_RULES.healthScoreTopWeight +
    reliabilityScore * DIAGNOSIS_RULES.healthScoreReliabilityWeight
  const followUpPenalty = needsFollowUp ? DIAGNOSIS_RULES.healthScoreFollowUpPenalty : 0
  return clamp(100 - Math.round(certaintyPenalty + followUpPenalty), 18, 92)
}

function mapHealthStatus(healthScore) {
  if (healthScore >= DIAGNOSIS_RULES.healthScoreHealthyThreshold) {return 'healthy'}
  if (healthScore >= DIAGNOSIS_RULES.healthScoreWarningThreshold) {return 'warning'}
  return 'sick'
}

function joinProblemActions(problem, baseResult) {
  const actions = [problem?.default_action, baseResult?.treatment]
    .map(item => String(item || '').trim())
    .filter(Boolean)
  return uniqueBy(actions, item => item).join('\n')
}

function joinProblemPreventions(problem, baseResult) {
  const items = [problem?.default_prevention, baseResult?.prevention]
    .map(item => String(item || '').trim())
    .filter(Boolean)
  return uniqueBy(items, item => item).join('\n')
}

function buildSummary({
  problemCn,
  reliabilityScore,
  needsFollowUp,
  observedSymptoms,
  followUps,
  baseSummary
}) {
  const symptomText = observedSymptoms.slice(0, DIAGNOSIS_RULES.followUpMaxQuestions).map(item => item.symptomCn).join('、')
  const reliabilityText = `可信度 ${Math.round((reliabilityScore || 0) * 100)}%`
  const parts = []

  if (problemCn) {
    parts.push(`当前最可能问题为${problemCn}`)
  }
  if (symptomText) {
    parts.push(`已识别症状：${symptomText}`)
  }
  parts.push(reliabilityText)

  if (needsFollowUp && followUps.length) {
    parts.push(`还需确认 ${followUps.length} 个关键症状后再收敛结论`)
  } else if (!needsFollowUp) {
    parts.push('当前证据已足够，无需继续问诊')
  }

  const summary = parts.join('。')
  if (summary.length >= 24) {
    return `${summary}。`
  }
  return baseSummary || summary
}

async function loadProblemProfile(problemKey) {
  if (!problemKey) {
    return null
  }

  const result = await models.$runSQL(
    `
      SELECT
        problem_key,
        problem_cn,
        problem_type,
        definition,
        default_action,
        default_prevention
      FROM problems
      WHERE problem_key = {{problemKey}}
      LIMIT 1
    `,
    { problemKey }
  )

  const row = result?.data?.executeResultList?.[0]
  if (!row) {
    return null
  }

  return {
    problemKey: row.problem_key,
    problemCn: row.problem_cn || row.problem_key,
    problemType: row.problem_type || '',
    definition: row.definition || '',
    defaultAction: row.default_action || '',
    defaultPrevention: row.default_prevention || ''
  }
}

async function buildStructuredDiagnosis({
  openid,
  plantId = null,
  userPlantId = null,
  diagnosisText = '',
  description = '',
  baseResult = {},
  mode = 'quick',
  observedSymptomsInput = [],
  followUpAnswers = [],
  skipAIExtraction = false
}) {
  const symptomDictionary = await getSymptomDictionary()
  const parsedObservedSymptoms = normalizeObservedSymptomsInput(baseResult?.observedSymptoms, symptomDictionary)
  const normalizedObservedSymptoms = normalizeObservedSymptomsInput(observedSymptomsInput, symptomDictionary)
  const normalizedFollowUpAnswers = normalizeFollowUpAnswers(followUpAnswers, symptomDictionary)
  const shouldSkipAIExtraction =
    Boolean(skipAIExtraction) ||
    parsedObservedSymptoms.length > 0 ||
    normalizedObservedSymptoms.length > 0 ||
    normalizedFollowUpAnswers.length > 0

  const confirmedFollowUpSymptoms = normalizeObservedSymptomsInput(
    normalizedFollowUpAnswers
      .filter(item => item.observed)
      .map(item => ({
        symptomKey: item.symptomKey,
        symptomCn: item.symptomCn,
        locationKey: item.locationKey,
        confidence: item.answerConfidence,
        evidenceSource: 'follow_up_yes'
      })),
    symptomDictionary
  )

  const observedSymptoms = mergeObservedSymptoms(
    parsedObservedSymptoms,
    normalizedObservedSymptoms,
    confirmedFollowUpSymptoms
  )

  if (!observedSymptoms.length) {
    return {
      ...baseResult,
      diagnosisMode: mode,
      roundType: normalizedFollowUpAnswers.length ? 'follow_up' : 'initial',
      observedSymptoms: [],
      followUpAnswers: normalizedFollowUpAnswers,
      rankings: [],
      followUps: [],
      topProblemKey: baseResult.topProblemKey || null,
      topProblemScore: baseResult.topProblemScore || null,
      reliabilityScore: baseResult.reliabilityScore || 0,
      needsFollowUp: false,
      finalProblemKey: baseResult.finalProblemKey || null,
      finalProblemCn: baseResult.finalProblemCn || baseResult.mainIssue || null
    }
  }

  const decision = await buildDiagnosisDecision({
    openid,
    plantId,
    userPlantId,
    observedSymptoms,
    excludedSymptomKeys: normalizedFollowUpAnswers.map(item => item.symptomKey)
  })
  const topRanking = decision.rankings[0]
  if (!topRanking) {
    return {
      ...baseResult,
      diagnosisMode: mode,
      roundType: normalizedFollowUpAnswers.length ? 'follow_up' : 'initial',
      observedSymptoms,
      followUpAnswers: normalizedFollowUpAnswers,
      rankings: [],
      followUps: [],
      reliabilityScore: 0,
      needsFollowUp: false
    }
  }

  const problem = await loadProblemProfile(topRanking.problemKey)
  const needsFollowUp = Boolean(decision.needsFollowUp && decision.followUps.length > 0)
  const healthScore = mapHealthScore(
    Number(topRanking.weightedScore || 0),
    Number(decision.reliabilityScore || 0),
    needsFollowUp
  )
  const healthStatus = mapHealthStatus(healthScore)

  return {
    ...baseResult,
    diagnosisMode: mode,
    roundType: normalizedFollowUpAnswers.length ? 'follow_up' : 'initial',
    mainIssue: needsFollowUp ? null : problem?.problemCn || topRanking.problemCn || baseResult.mainIssue,
    symptoms: observedSymptoms.map(item => item.symptomCn).join('、') || baseResult.symptoms || '',
    treatment: joinProblemActions(problem, baseResult),
    prevention: joinProblemPreventions(problem, baseResult),
    summary: buildSummary({
      problemCn: problem?.problemCn || topRanking.problemCn,
      reliabilityScore: decision.reliabilityScore,
      needsFollowUp,
      observedSymptoms,
      followUps: decision.followUps,
      baseSummary: baseResult.summary
    }),
    healthScore,
    healthStatus,
    problemType: problem?.problemType || topRanking.problemType || '',
    topProblemKey: topRanking.problemKey,
    topProblemScore: round(topRanking.weightedScore),
    reliabilityScore: round(decision.reliabilityScore),
    needsFollowUp,
    finalProblemKey: needsFollowUp ? null : topRanking.problemKey,
    finalProblemCn: needsFollowUp ? null : problem?.problemCn || topRanking.problemCn,
    observedSymptoms,
    followUpAnswers: normalizedFollowUpAnswers,
    rankings: decision.rankings,
    followUps: decision.followUps,
    supportingSymptomCount: decision.supportingSymptomCount,
    decisiveSymptomCount: decision.decisiveSymptomCount,
    problemCausality: decision.problemCausality || []
  }
}

module.exports = {
  buildStructuredDiagnosis,
  getSymptomDictionary
}
