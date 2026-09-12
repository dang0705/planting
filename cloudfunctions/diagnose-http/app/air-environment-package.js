'use strict'

const {
  AIR_ENVIRONMENT_RECORDED_OPTION_KEY,
  AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY,
  isAirEnvironmentQuestion,
  getAirEnvironmentQuestionKeys,
  parseDiagnosisAirEnvironmentSidecar
} = require('/opt/utils/air-environment-evidence')

function text(value = '') {
  return String(value || '').trim()
}

function validateAirEnvironmentPackageSidecar({
  payload = {},
  answers = [],
  questionPackageSnapshot = null
} = {}) {
  const parsed = parseDiagnosisAirEnvironmentSidecar({
    payload,
    answers,
    questionPackageSnapshot
  })
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.error || '空气环境回答无效'), { statusCode: 400 })
  }
  return parsed
}

function ensurePackageVersionTwo(questionPackageSnapshot = null) {
  const mode = text(questionPackageSnapshot?.mode)
  if (!['yellow_leaf', 'wilting_droop'].includes(mode)) {
    return
  }
  if (Number(questionPackageSnapshot?.packageVersion || 1) < 2) {
    throw Object.assign(new Error('此问诊版本已更新，请重新开始问诊'), { statusCode: 409 })
  }
}

module.exports = {
  AIR_ENVIRONMENT_RECORDED_OPTION_KEY,
  AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY,
  isAirEnvironmentQuestion,
  getAirEnvironmentQuestionKeys,
  validateAirEnvironmentPackageSidecar,
  ensurePackageVersionTwo
}
