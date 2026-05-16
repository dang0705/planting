'use strict'

const keys = require('./keys')
const templates = require('./templates')
const { buildOrthogonalProbeText } = require('./probe-text')
const { buildSyntheticObservedProbeQuestions } = require('./builders')
const { buildSyntheticFollowUpOptionMappings } = require('./option-mappings')

module.exports = {
  SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX: keys.SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX,
  SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX: keys.SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX,
  buildVisualCandidateQuestionGroupKey: keys.buildVisualCandidateQuestionGroupKey,
  buildSyntheticVisualCandidateQuestionKey: keys.buildSyntheticVisualCandidateQuestionKey,
  isSyntheticVisualCandidateQuestionKey: keys.isSyntheticVisualCandidateQuestionKey,
  buildObservedProbeQuestionGroupKey: keys.buildObservedProbeQuestionGroupKey,
  buildSyntheticObservedProbeQuestionKey: keys.buildSyntheticObservedProbeQuestionKey,
  isSyntheticObservedProbeQuestionKey: keys.isSyntheticObservedProbeQuestionKey,
  parseSyntheticObservedProbeQuestionKey: keys.parseSyntheticObservedProbeQuestionKey,
  buildSyntheticObservedProbeQuestions,
  buildSyntheticFollowUpOptionMappings,
  buildTemplateVariables: templates.buildTemplateVariables,
  renderQuestionTemplate: templates.renderQuestionTemplate,
  buildOrthogonalProbeText
}
