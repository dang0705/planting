'use strict'

const { diagnosisRules } = require('./data/rules')
const { diseaseCategories } = require('./data/disease-categories')
const { diseasePriors } = require('./data/disease-priors')
const { diseaseLikelihoods } = require('./data/disease-likelihoods')
const { environmentRules } = require('./data/environment-rules')
const { treatments } = require('./data/treatments')
const { evidenceTypeWeights, getEvidenceMeta } = require('./data/evidence-catalog')
const {
  diseaseHostProfiles,
  inferPlantHosts,
  inferPlantGroup,
  getDiseaseSetForPlantGroup
} = require('./data/disease-host-profiles')

const MIN_PROBABILITY = 1e-4

function diagnose(userSymptoms, userConditions, symptomMatches = {}, options = {}) {
  const evidenceList = buildEvidenceList(userSymptoms, symptomMatches)
  if (evidenceList.length === 0) return []

  const plantGroup = String(options.plantGroup || '').trim() || inferPlantGroup(options.plantName)
  const plantHosts = inferPlantHosts(options.plantName)
  const allowedDiseaseIds = getDiseaseSetForPlantGroup(plantGroup)
  const candidateRules = Array.isArray(allowedDiseaseIds)
    ? diagnosisRules.filter(rule => allowedDiseaseIds.includes(rule.id))
    : diagnosisRules

  const rawScores = {}
  for (const rule of candidateRules) {
    rawScores[rule.id] = computePosteriorScore(rule.id, evidenceList, userConditions, plantHosts)
  }

  const normalized = normalizePosteriorScores(rawScores)
  const ranked = normalized
    .filter(item => item.probability >= 0.01)
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 3)

  const topProbability = ranked[0]?.probability || 0

  return ranked.map((item, index) => {
    const treatment = treatments[item.disease] || {}
    return {
      id: item.disease,
      name: findRule(item.disease)?.name || item.disease,
      category: diseaseCategories[item.disease] || 'physiological',
      plantGroup,
      score: Math.round(item.probability * 100),
      confidence: scoreToConfidence(item.probability, topProbability, index),
      likelihood: scoreToLikelihood(item.probability, topProbability, index),
      solutions: treatment.solutions || [],
      prevention: treatment.prevention || []
    }
  })
}

function buildEvidenceList(userSymptoms, symptomMatches = {}) {
  const seen = new Set()
  const evidenceList = []

  for (const name of userSymptoms || []) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    const meta = getEvidenceMeta(name)
    evidenceList.push({
      name,
      type: meta.type,
      weight: evidenceTypeWeights[meta.type] || evidenceTypeWeights.symptom,
      score: normalizeMatchScore(symptomMatches[name])
    })
  }

  return evidenceList
}

function computePosteriorScore(diseaseId, evidenceList, userConditions, plantHosts = []) {
  const prior = Math.max(MIN_PROBABILITY, diseasePriors[diseaseId] || 0.01)
  const likelihoods = diseaseLikelihoods[diseaseId]?.evidence || {}

  let logProbability = Math.log(prior)

  for (const evidence of evidenceList) {
    const likelihood = clampProbability(
      likelihoods[evidence.name] !== undefined ? likelihoods[evidence.name] : 0.08
    )
    logProbability += evidence.weight * evidence.score * Math.log(likelihood)
  }

  const environmentFactor = computeEnvironmentFactor(diseaseId, userConditions)
  logProbability += Math.log(Math.max(MIN_PROBABILITY, environmentFactor))
  logProbability += Math.log(Math.max(MIN_PROBABILITY, computeHostFactor(diseaseId, plantHosts)))

  return logProbability
}

function computeEnvironmentFactor(diseaseId, userConditions = {}) {
  const rules = environmentRules[diseaseId] || {}
  let factor = 1

  for (const [conditionId, optionMap] of Object.entries(rules)) {
    const selectedValue = userConditions[conditionId]
    if (selectedValue === undefined) continue
    factor *= optionMap[selectedValue] || 1
  }

  return Math.max(0.2, Math.min(3.5, factor))
}

function computeHostFactor(diseaseId, plantHosts = []) {
  if (!Array.isArray(plantHosts) || plantHosts.length === 0) return 1

  const diseaseHosts = diseaseHostProfiles[diseaseId]
  if (!Array.isArray(diseaseHosts) || diseaseHosts.length === 0) return 1

  const normalizedPlantHosts = plantHosts.map(item => String(item || '').toLowerCase())
  const normalizedDiseaseHosts = diseaseHosts.map(item => String(item || '').toLowerCase())
  const matched = normalizedPlantHosts.some(host => normalizedDiseaseHosts.includes(host))

  if (matched) return 1.35
  if (normalizedDiseaseHosts.includes('houseplants') || normalizedDiseaseHosts.includes('many_plants')) {
    return 1
  }
  return 0.55
}

function normalizePosteriorScores(scoreMap) {
  const scoreEntries = Object.entries(scoreMap || {})
  if (scoreEntries.length === 0) return []

  const maxScore = Math.max(...scoreEntries.map(([, score]) => score))
  const expScores = scoreEntries.map(([disease, score]) => ({
    disease,
    expScore: Math.exp(score - maxScore)
  }))
  const sum = expScores.reduce((total, item) => total + item.expScore, 0) || 1

  return expScores.map(item => ({
    disease: item.disease,
    probability: item.expScore / sum
  }))
}

function findRule(ruleId) {
  return diagnosisRules.find(rule => rule.id === ruleId)
}

function scoreToConfidence(score, topScore, index = 0) {
  const gap = topScore - score
  if (index === 0 && score >= 0.5) return 'high'
  if (gap <= 0.12 || score >= 0.18) return 'medium'
  return 'low'
}

function scoreToLikelihood(score, topScore, index = 0) {
  const confidence = scoreToConfidence(score, topScore, index)
  if (confidence === 'high') return '最可能'
  if (confidence === 'medium') return '较可能'
  return '有可能'
}

function normalizeMatchScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.max(0.05, Math.min(1, number))
}

function clampProbability(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return MIN_PROBABILITY
  return Math.max(MIN_PROBABILITY, Math.min(0.999, number))
}

module.exports = { diagnose }
