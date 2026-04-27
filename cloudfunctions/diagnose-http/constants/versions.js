'use strict'

const {
  llm: { model = '' } = {}
} = require('../configs')

module.exports = {
  diagnosisEngineVersion: 'diagnose-engine-v1',
  dataBundleVersion: 'diagnosis-data-v5-real',
  questionSystemVersion: 'question-system-v5-real',
  resultExplanationVersion: 'result-explanation-v1',
  legacyAdapterVersion: 'legacy-adapter-v1',
  symptomClassRuntimeVersion: 'symptom-class-runtime-v1',
  visionModelVersion: model || ''
}
