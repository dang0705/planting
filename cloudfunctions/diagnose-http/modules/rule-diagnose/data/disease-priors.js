'use strict'

const { diagnosisRules } = require('./rules')

function buildDiseasePriors() {
  const totalPriority = diagnosisRules.reduce((sum, rule) => sum + (rule.priority || 1), 0) || 1

  return diagnosisRules.reduce((result, rule) => {
    result[rule.id] = (rule.priority || 1) / totalPriority
    return result
  }, {})
}

const diseasePriors = buildDiseasePriors()

module.exports = { diseasePriors }
