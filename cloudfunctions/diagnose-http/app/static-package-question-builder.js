'use strict'

const {
  buildObservedProbeQuestionsFromSessionSource
} = require('./session-observed-probe-question-source')

function buildObservedProbePackageQuestions(...args) {
  return buildObservedProbeQuestionsFromSessionSource(...args)
}

module.exports = {
  buildObservedProbePackageQuestions
}
