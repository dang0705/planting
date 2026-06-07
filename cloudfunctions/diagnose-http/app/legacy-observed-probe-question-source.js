'use strict'

const { buildSyntheticObservedProbeQuestions } = require('../utils/synthetic-question-package')

function buildObservedProbeQuestionsFromLegacySource(...args) {
  return buildSyntheticObservedProbeQuestions(...args)
}

module.exports = {
  buildObservedProbeQuestionsFromLegacySource
}
