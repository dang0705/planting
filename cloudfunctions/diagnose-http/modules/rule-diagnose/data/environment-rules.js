'use strict'

const { diagnosisRules } = require('./rules')

function toEnvironmentFactor(weight) {
  if (weight > 0) {
    return Math.min(1.8, 1 + weight / 10)
  }
  if (weight < 0) {
    return Math.max(0.35, 1 + weight / 10)
  }
  return 1
}

function buildEnvironmentRules() {
  return diagnosisRules.reduce((result, rule) => {
    result[rule.id] = Object.entries(rule.conditions || {}).reduce((conditionMap, [conditionId, valueMap]) => {
      conditionMap[conditionId] = Object.entries(valueMap || {}).reduce((optionMap, [optionValue, weight]) => {
        optionMap[optionValue] = toEnvironmentFactor(weight)
        return optionMap
      }, {})
      return conditionMap
    }, {})
    return result
  }, {})
}

const environmentRules = buildEnvironmentRules()

module.exports = { environmentRules }
