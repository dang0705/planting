'use strict'

const { diagnosisRules } = require('./rules')

const treatments = diagnosisRules.reduce((result, rule) => {
  result[rule.id] = {
    solutions: rule.solutions || [],
    prevention: rule.prevention || []
  }
  return result
}, {})

module.exports = { treatments }
