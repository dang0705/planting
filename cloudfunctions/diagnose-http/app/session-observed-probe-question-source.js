'use strict'

const { buildSyntheticObservedProbeQuestions } = require('../utils/synthetic-question-package')

function buildObservedProbeQuestionsFromSessionSource(...args) {
  return buildSyntheticObservedProbeQuestions(...args)
}

module.exports = {
  buildObservedProbeQuestionsFromSessionSource
}
