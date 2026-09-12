'use strict'

const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')

function buildAnswerRunnerResult({
  sessionId = '',
  refreshedSessionState = {},
  roundResult = {},
  answerRevision = null,
  uiPatch = null
} = {}) {
  return {
    sessionId,
    userPlantId: refreshedSessionState.userPlantId || null,
    plantId: refreshedSessionState.userPlantId || refreshedSessionState.plantId,
    plantCatalogId: refreshedSessionState.plantId || null,
    plantIdentityId:
      refreshedSessionState?.plantContext?.plantIdentityId ||
      roundResult?.plantContext?.plantIdentityId ||
      '',
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(roundResult, refreshedSessionState),
    diagnosisText: roundResult?.topProblem?.summary || '',
    response: roundResult,
    answerRevision,
    uiPatch
  }
}

module.exports = {
  buildAnswerRunnerResult
}
