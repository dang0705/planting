import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load

const captured = {
  upsertSessionCalls: [],
  writeQuestionRowsCalls: [],
  saveFinalSnapshotCalls: [],
  deferredJobs: []
}

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === './session-service' || request === '../services/session-service') {
    return {
      upsertDiagnosisSession: async args => {
        captured.upsertSessionCalls.push(args)
      },
      replaceObservedEvidenceSet: async (...args) => {
        captured.deferredJobs.push(['replaceObservedEvidenceSet', ...args])
      },
      replaceObservedSymptoms: async (...args) => {
        captured.deferredJobs.push(['replaceObservedSymptoms', ...args])
      },
      upsertVisualSupervisionRecords: async (...args) => {
        captured.deferredJobs.push(['upsertVisualSupervisionRecords', ...args])
      },
      saveFinalDiagnosisSnapshot: async args => {
        captured.saveFinalSnapshotCalls.push(args)
      }
    }
  }
  if (request === '../repositories/stop-state-repository') {
    return {
      upsertStopState: async (...args) => {
        captured.deferredJobs.push(['upsertStopState', ...args])
      }
    }
  }
  if (request === '../repositories/weather-repository') {
    return {
      saveDiagnosisWeatherEvidenceReference: async (...args) => {
        captured.deferredJobs.push(['saveDiagnosisWeatherEvidenceReference', ...args])
      }
    }
  }
  if (request === './round-question-row-adapter') {
    return {
      shouldWriteSessionQuestionRows: response => Boolean(response?.questionRequired),
      writeSessionRoundQuestionRows: async args => {
        captured.writeQuestionRowsCalls.push(args)
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  persistRoundRuntime
} = require('../../../../../cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js')

const dynamicPestQuestionPackage = {
  mode: 'specific_pest_visual',
  route: 'specific_pest_visual',
  sourceMode: 'visual_specific_pest',
  answerSubmitMode: 'package',
  questionDisplayMode: 'package',
  dynamicQuestionPackage: true,
  candidateModes: ['thrips'],
  hiddenPrefilledEvidence: [
    {
      evidenceKey: 'spider_mite',
      diagnosisMode: 'spider_mite',
      routeEvidenceRole: 'direct_match'
    }
  ],
  packageQuestions: [
    {
      questionKey: 'q_specific_pest__thrips_black_spots',
      questionText: '这些条斑附近有没有细小黑点，或能看到细长的小虫？',
      packageTopic: 'thrips_black_spots',
      packageSection: 'specific_pest_package',
      targetSymptomKey: 'thrips',
      options: [{ optionKey: 'unknown', text: '不方便确认 / 看不清' }]
    }
  ],
  questionCount: 1
}

await persistRoundRuntime({
  sessionId: 'diag_persist_dynamic_pest_package',
  openid: 'openid_persist_dynamic_pest_package',
  plantContext: { userPlantId: 14, plantId: '14' },
  response: {
    diagnosisSessionId: 'diag_persist_dynamic_pest_package',
    roundId: 'round_2',
    routePrimaryAction: 'question_package',
    sessionStatus: 'awaiting_follow_up',
    questionRequired: true,
    outcomeType: '',
    questions: dynamicPestQuestionPackage.packageQuestions,
    questionPackage: dynamicPestQuestionPackage
  },
  round: 2,
  image: '',
  description: '',
  clientContext: { diagnosisProfile: 'pest', entrySource: 'plant_card' }
})

assert.equal(captured.upsertSessionCalls.length, 1)
const persistedResponse = captured.upsertSessionCalls[0].response
assert.equal(persistedResponse.questionPackageSnapshot.mode, 'specific_pest_visual')
assert.deepEqual(persistedResponse.questionPackageSnapshot.candidateModes, ['thrips'])
assert.equal(persistedResponse.questionPackageSnapshot.packageQuestions.length, 1)
assert.equal(captured.writeQuestionRowsCalls.length, 1)
assert.equal(captured.writeQuestionRowsCalls[0].sessionId, 'diag_persist_dynamic_pest_package')
assert.equal(captured.writeQuestionRowsCalls[0].round, 2)
assert.equal(captured.writeQuestionRowsCalls[0].response.questionRequired, true)
assert.equal(captured.saveFinalSnapshotCalls.length, 0)

Module._load = originalLoad

console.log('round runtime persistence dynamic package tests passed')
