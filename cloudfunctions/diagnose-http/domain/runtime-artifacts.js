'use strict'

const { planQuestionQueue } = require('./question-queue/question-queue-planner')
const { evaluateStopState } = require('./stop-state/stop-state-evaluator')
const { evaluateOutputEligibility } = require('./stop-state/output-eligibility-evaluator')

function buildDiagnosticTrace({
  response = {},
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  questionQueue = null,
  stopState = null,
  outputEligibility = null
} = {}) {
  return [
    {
      eventType: 'derived_evidence_generated',
      roundId: response?.roundId || 'round_1',
      payload: {
        itemCount: Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet.length : 0
      }
    },
    {
      eventType: 'diagnosis_directions_formed',
      roundId: response?.roundId || 'round_1',
      payload: {
        itemCount: Array.isArray(diagnosisDirections) ? diagnosisDirections.length : 0,
        directionKeys: Array.isArray(diagnosisDirections)
          ? diagnosisDirections.map(item => item?.directionKey).filter(Boolean)
          : []
      }
    },
    {
      eventType: 'question_queue_evaluated',
      roundId: response?.roundId || 'round_1',
      payload: {
        questionQueueId: questionQueue?.questionQueueId || '',
        queueStatus: questionQueue?.queueStatus || '',
        itemCount: Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems.length : 0
      }
    },
    {
      eventType: 'stop_state_formed',
      roundId: response?.roundId || 'round_1',
      payload: {
        stopStateId: stopState?.stopStateId || '',
        isStopped: Number(stopState?.isStopped || 0) ? 1 : 0,
        stopReasonType: stopState?.stopReasonType || '',
        decisionCauseKey: stopState?.decisionCauseKey || ''
      }
    },
    {
      eventType: 'output_eligibility_evaluated',
      roundId: response?.roundId || 'round_1',
      payload: {
        eligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
        conclusionStatus: outputEligibility?.conclusionStatus || '',
        outputConservatism: outputEligibility?.outputConservatism || '',
        decisionCauseKey: outputEligibility?.decisionCauseKey || ''
      }
    }
  ]
}

function buildRuntimeArtifacts(
  response = {},
  {
    observedEvidenceSet = response?.observedEvidenceSet || [],
    derivedEvidenceSet = response?.derivedEvidenceSet || [],
    diagnosisDirections = response?.diagnosisDirections || []
  } = {}
) {
  const responseWithEvidence = {
    ...response,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections
  }
  const questionQueue = planQuestionQueue(responseWithEvidence)
  const stopState = evaluateStopState({ response: responseWithEvidence, questionQueue })
  const outputEligibility = evaluateOutputEligibility({
    response: responseWithEvidence,
    questionQueue,
    stopState
  })
  const diagnosticTrace = buildDiagnosticTrace({
    response: responseWithEvidence,
    derivedEvidenceSet,
    diagnosisDirections,
    questionQueue,
    stopState,
    outputEligibility
  })

  return {
    derivedEvidenceSet,
    diagnosisDirections,
    questionQueue,
    stopState,
    outputEligibility,
    diagnosticTrace
  }
}

function attachRuntimeArtifacts(response = {}) {
  const runtimeArtifacts = buildRuntimeArtifacts(response)
  return {
    ...response,
    ...runtimeArtifacts
  }
}

module.exports = {
  buildRuntimeArtifacts,
  attachRuntimeArtifacts
}
