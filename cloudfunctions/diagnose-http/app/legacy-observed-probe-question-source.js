'use strict'

const { buildSyntheticObservedProbeQuestions } = require('../utils/synthetic-follow-up')

function buildObservedProbeQuestionsFromLegacySource(...args) {
  return buildSyntheticObservedProbeQuestions(...args)
}

module.exports = {
  buildObservedProbeQuestionsFromLegacySource
}
