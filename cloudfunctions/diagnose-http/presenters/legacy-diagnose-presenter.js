'use strict'

const { buildPublicRoundResponse } = require('./diagnosis-round-presenter')

function buildLegacyHttpSuccess({ sessionId, plantId, roundResult, diagnosisText = '' }) {
  const publicRound = buildPublicRoundResponse(roundResult || {})

  return {
    code: 200,
    message: '诊断完成',
    fullText:
      diagnosisText ||
      roundResult?.finalResult?.summary ||
      roundResult?.topProblem?.summary ||
      '',
    data: {
      recordId: sessionId,
      plantId: publicRound?.plantId || plantId || '',
      userPlantId: publicRound?.userPlantId || null,
      plantCatalogId: publicRound?.plantCatalogId || null,
      plantIdentityId: publicRound?.plantIdentityId || '',
      latestVisualCallBatchId: publicRound?.latestVisualCallBatchId || null,
      diagnosisSessionId: publicRound?.diagnosisSessionId || sessionId,
      roundId: publicRound?.roundId || roundResult?.roundId || 'round_1',
      stage: publicRound?.stage || '',
      status: publicRound?.status || '',
      routePrimaryAction: publicRound?.routePrimaryAction || '',
      outcomeType: publicRound?.outcomeType || '',
      identityResolutionStatus: publicRound?.identityResolutionStatus || '',
      observedSymptoms: Array.isArray(publicRound?.observedSymptoms)
        ? publicRound.observedSymptoms
        : [],
      observedEvidenceSet: Array.isArray(publicRound?.observedEvidenceSet)
        ? publicRound.observedEvidenceSet
        : [],
      visualBatchTrace: roundResult?.visualBatchTrace || null,
      visualAggregateSummary: publicRound?.visualAggregateSummary || null,
      shadowCompareSummary: publicRound?.shadowCompareSummary || null,
      summaryCard: publicRound?.summaryCard || null,
      questions: Array.isArray(publicRound?.questions) ? publicRound.questions : [],
      finalResult: publicRound?.finalResult || null,
      contributingFactors: Array.isArray(publicRound?.contributingFactors) ? publicRound.contributingFactors : [],
      intermediateStates: Array.isArray(publicRound?.intermediateStates) ? publicRound.intermediateStates : [],
      nextSteps: Array.isArray(publicRound?.nextSteps) ? publicRound.nextSteps : [],
      whatToAvoid: Array.isArray(publicRound?.whatToAvoid) ? publicRound.whatToAvoid : [],
      confidenceLevel: publicRound?.confidenceLevel || 'normal',
      needHumanReview: Boolean(publicRound?.needHumanReview),
      timestamp: Date.now()
    }
  }
}

module.exports = {
  buildLegacyHttpSuccess
}
