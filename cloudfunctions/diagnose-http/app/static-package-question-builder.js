'use strict'

const {
  buildObservedProbeQuestionsFromLegacySource
} = require('./legacy-observed-probe-question-source')

function buildObservedProbePackageQuestions(...args) {
  return buildObservedProbeQuestionsFromLegacySource(...args)
}

module.exports = {
  buildObservedProbePackageQuestions
}
