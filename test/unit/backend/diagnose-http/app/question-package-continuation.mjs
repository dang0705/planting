/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const continuation = require('../../../../../cloudfunctions/diagnose-http/app/question-package-continuation.js')
const secretEnvKey = 'DIAGNOSIS_CONTINUATION_SECRET'
const previousSecret = process.env[secretEnvKey]
process.env[secretEnvKey] = 'unit-test-question-package-continuation-secret-32'

try {
  const response = {
    diagnosisSessionId: 'diag_unit_1',
    roundId: 'round_1',
    questionPackage: {
      mode: 'yellow_leaf',
      route: 'yellow_leaf',
      sourceMode: 'manual_yellowing_care_environment_frontloaded',
      packageVersion: 2,
      answerSubmitMode: 'package',
      fixedQuestionPackage: true
    },
    questions: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        options: [{ optionKey: 'weaker_light', text: '最近更暗' }]
      }
    ],
    observedSymptoms: [{ symptomKey: 'leaf_yellowing' }],
    observedEvidenceSet: [{ evidenceKey: 'leaf_yellowing' }]
  }
  const token = continuation.createQuestionPackageContinuationToken({
    openid: 'openid_unit_1',
    sessionId: 'diag_unit_1',
    response,
    plantContext: { plantId: 'plant_1', userPlantId: 7 },
    runtimeData: {
      answerEffects: [{ questionKey: 'q_1', optionKey: 'a' }],
      diagnosisOutcomes: [],
      actionProfiles: []
    },
    now: 1_700_000_000_000
  })

  assert.ok(token)
  const verified = continuation.verifyQuestionPackageContinuationToken({
    token,
    openid: 'openid_unit_1',
    sessionId: 'diag_unit_1',
    now: 1_700_000_001_000
  })
  assert.equal(verified.openid, 'openid_unit_1')
  assert.equal(verified.questionPackageSnapshot.packageQuestions.length, 1)
  assert.equal(
    verified.questionPackageSnapshot.questionPackageRuntimeData.answerEffects[0].optionKey,
    'a'
  )
  assert.equal(
    continuation.verifyQuestionPackageContinuationToken({
      token: `${token.slice(0, -1)}x`,
      openid: 'openid_unit_1',
      sessionId: 'diag_unit_1',
      now: 1_700_000_001_000
    }),
    null
  )
  assert.equal(
    continuation.verifyQuestionPackageContinuationToken({
      token,
      openid: 'openid_other',
      sessionId: 'diag_unit_1',
      now: 1_700_000_001_000
    }),
    null
  )

  const state = continuation.buildQuestionPackageContinuationSessionState(verified)
  assert.equal(state.sessionId, 'diag_unit_1')
  assert.equal(state.runtimeSnapshot.questionPackageSnapshot.packageVersion, 2)
  assert.equal(state.nextRound, 2)
  assert.deepEqual(state.observedEvidenceSet, [{ evidenceKey: 'leaf_yellowing' }])
} finally {
  if (previousSecret === undefined) {
    delete process.env[secretEnvKey]
  } else {
    process.env[secretEnvKey] = previousSecret
  }
}

console.log('question package continuation: passed')
