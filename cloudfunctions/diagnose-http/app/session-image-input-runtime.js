'use strict'

const {
  hasConsumedQuestionRetakeQuota
} = require('../presenters/diagnosis-round-presenter-helpers')

async function prepareSessionImageInputRuntime({
  visualBatchTrace
} = {}) {
  if (hasConsumedQuestionRetakeQuota(visualBatchTrace || null)) {
    throw Object.assign(new Error('补图次数已达上限'), { statusCode: 400 })
  }
}

module.exports = {
  prepareSessionImageInputRuntime
}
