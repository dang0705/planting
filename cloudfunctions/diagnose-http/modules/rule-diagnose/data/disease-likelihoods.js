'use strict'

const { diagnosisRules } = require('./rules')
const { getEvidenceMeta } = require('./evidence-catalog')
const { diseaseCategories } = require('./disease-categories')
const {
  legacySymptomAliases,
  externalSymptomDiseaseLikelihoods
} = require('./external-symptom-likelihoods')

function toLikelihood(weight, maxPositive, maxNegative, evidenceType) {
  if (weight > 0) {
    const normalized = maxPositive > 0 ? weight / maxPositive : 0.2
    const base = evidenceType === 'pest' ? 0.55 : evidenceType === 'sign' ? 0.48 : 0.34
    return Math.min(0.98, base + normalized * 0.35)
  }

  if (weight < 0) {
    const normalized = maxNegative > 0 ? Math.abs(weight) / maxNegative : 0.2
    return Math.max(0.02, 0.28 - normalized * 0.18)
  }

  return 0.08
}

function buildDiseaseLikelihoods() {
  const baseLikelihoods = diagnosisRules.reduce((result, rule) => {
    const symptomEntries = Object.entries(rule.symptoms || {})
    const maxPositive = symptomEntries
      .filter(([, weight]) => weight > 0)
      .reduce((sum, [, weight]) => sum + weight, 0)
    const maxNegative = symptomEntries
      .filter(([, weight]) => weight < 0)
      .reduce((sum, [, weight]) => sum + Math.abs(weight), 0)

    result[rule.id] = {
      disease: rule.id,
      category: diseaseCategories[rule.id] || 'physiological',
      evidence: symptomEntries.reduce((map, [name, weight]) => {
        const evidenceType = getEvidenceMeta(name).type
        map[name] = toLikelihood(weight, maxPositive, maxNegative, evidenceType)
        return map
      }, {})
    }

    return result
  }, {})

  for (const [rawEvidenceName, diseaseMap] of Object.entries(externalSymptomDiseaseLikelihoods)) {
    const normalizedEvidenceName = legacySymptomAliases[rawEvidenceName] || rawEvidenceName

    for (const [diseaseId, probability] of Object.entries(diseaseMap || {})) {
      if (!baseLikelihoods[diseaseId]) {
        baseLikelihoods[diseaseId] = {
          disease: diseaseId,
          category: diseaseCategories[diseaseId] || 'physiological',
          evidence: {}
        }
      }

      const currentProbability = baseLikelihoods[diseaseId].evidence[normalizedEvidenceName]
      baseLikelihoods[diseaseId].evidence[normalizedEvidenceName] =
        currentProbability === undefined
          ? probability
          : Math.max(currentProbability, probability)
    }
  }

  return baseLikelihoods
}

const diseaseLikelihoods = buildDiseaseLikelihoods()

module.exports = { diseaseLikelihoods }
