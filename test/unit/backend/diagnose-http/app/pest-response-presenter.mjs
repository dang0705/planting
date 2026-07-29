import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildPublicRoundResponse,
  buildCompactAnswerRoundResponse
} = require('../../../../../cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js')
const {
  buildFrontendDiagnosisResponse,
  buildFrontendAnswerResponse
} = require('../../../../../cloudfunctions/diagnose-http/app/frontend-response.js')
const {
  buildSpecificPestQuestionPackage
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-question-package.js')
const {
  buildRetakeRequest
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-visual-orchestrator.js')
const startRunnerSource = await import('node:fs').then(fs =>
  fs.readFileSync('cloudfunctions/diagnose-http/app/diagnosis-start-runner.js', 'utf8')
)
const questionStartRunnerSource = await import('node:fs').then(fs =>
  fs.readFileSync('cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js', 'utf8')
)

const choosePublic = buildPublicRoundResponse({
  diagnosisSessionId: 'diag_choose',
  roundId: 'round_1',
  routePrimaryAction: 'choose_direction',
  sessionStatus: 'awaiting_follow_up',
  questionRequired: false,
  directionChoices: [{ modeKey: 'pest', pestModeKeys: ['spider_mite', 'thrips'] }],
  recommendedDirection: 'pest',
  directMatches: [{ modeKey: 'spider_mite' }]
})
assert.equal(choosePublic.stage, 'intermediate')
assert.equal(choosePublic.status, 'active')
assert.deepEqual(choosePublic.directionChoices[0].pestModeKeys, ['spider_mite', 'thrips'])
const chooseFrontend = buildFrontendDiagnosisResponse(choosePublic)
assert.equal(chooseFrontend.status, 'active')
assert.equal(chooseFrontend.recommendedDirection, 'pest')
assert.deepEqual(chooseFrontend.directionChoices[0].pestModeKeys, ['spider_mite', 'thrips'])

const retakePublic = buildPublicRoundResponse({
  diagnosisSessionId: 'diag_retake',
  roundId: 'round_1',
  routePrimaryAction: 'request_followup_capture',
  sessionStatus: 'awaiting_retake',
  questionRequired: false,
  retakeRequest: {
    status: 'needs_confirmation',
    requestedCaptureRegion: 'leaf_lower_surface'
  }
})
assert.equal(retakePublic.stage, 'intermediate')
assert.equal(retakePublic.status, 'active')
assert.equal(retakePublic.retakeRequest.requestedCaptureRegion, 'leaf_lower_surface')
assert.equal(
  buildFrontendDiagnosisResponse(retakePublic).retakeRequest.status,
  'needs_confirmation'
)

const riskRetakeRequest = buildRetakeRequest({
  sessionId: 'diag_retake',
  routeResult: {
    followupCapturePlan: {
      reason: 'specific_pest_confirmation_needed',
      requestedCaptureRegion: 'leaf_back',
      riskLevel: 'medium',
      riskNotice: '需要轻轻翻看叶背。',
      safetyInstructions: ['动作放轻，避免折断叶片。'],
      requiresExplicitConsent: true,
      skipOptionEnabled: true,
      skipAnswerValue: 'unknown'
    }
  },
  aggregateResult: { visual_call_batch_id: 'visbatch_1' }
})
assert.equal(riskRetakeRequest.requestedCaptureRegion, 'leaf_lower_surface')
assert.equal(riskRetakeRequest.serverAuthorized, false)
assert.equal(riskRetakeRequest.riskLevel, 'medium')
assert.equal(riskRetakeRequest.riskNotice, '需要轻轻翻看叶背。')
assert.deepEqual(riskRetakeRequest.safetyInstructions, ['动作放轻，避免折断叶片。'])
assert.equal(riskRetakeRequest.requiresExplicitConsent, true)
assert.equal(riskRetakeRequest.skipOptionEnabled, true)
assert.equal(riskRetakeRequest.skipAnswerValue, 'unknown')

const friendlyLowRiskRetakeRequest = buildRetakeRequest({
  routeResult: { followupCapturePlan: { reason: 'low_visual_quality' } }
})
assert.equal(friendlyLowRiskRetakeRequest.riskLevel, 'low')
assert.equal(friendlyLowRiskRetakeRequest.requiresExplicitConsent, false)
assert.equal(friendlyLowRiskRetakeRequest.skipOptionEnabled, false)
assert.match(friendlyLowRiskRetakeRequest.riskNotice, /更清楚/)

const expiredPublic = buildCompactAnswerRoundResponse({
  diagnosisSessionId: 'diag_retake',
  roundId: 'round_1',
  routePrimaryAction: 'request_followup_capture',
  sessionStatus: 'completed',
  stopReason: 'ended_retake_timeout',
  outcomeType: 'uncertain',
  questionRequired: false,
  retakeAuthorizationState: { status: 'ended_retake_timeout', serverNow: 301001 }
})
const expiredFrontend = buildFrontendAnswerResponse(expiredPublic)
assert.equal(expiredFrontend.status, 'closed')
assert.equal(expiredFrontend.stopReason, 'ended_retake_timeout')
assert.equal(expiredFrontend.retakeAuthorizationState.status, 'ended_retake_timeout')

const twoQuestionPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['whitefly'],
  hiddenPrefilledEvidence: []
})
const packagePublic = buildPublicRoundResponse({
  diagnosisSessionId: 'diag_package',
  roundId: 'round_1',
  routePrimaryAction: 'question_package',
  questionRequired: true,
  questions: twoQuestionPackage.packageQuestions,
  questionPackage: twoQuestionPackage,
  uiHints: { answerSubmitMode: 'package', questionDisplayMode: 'package' }
})
assert.equal(packagePublic.questions.length, 2)
assert.equal(packagePublic.uiHints.answerSubmitMode, 'package')
const packageFrontend = buildFrontendDiagnosisResponse(packagePublic)
assert.equal(packageFrontend.questions.length, 2)
assert.equal(packageFrontend.questionPackage.questionCount, 2)
assert.match(
  startRunnerSource,
  /allowsAnonymousPlantContext = clientContext\?\.entrySource === 'diagnose_tab'/
)
assert.match(
  questionStartRunnerSource,
  /allowsAnonymousPlantContext = clientContext\?\.entrySource === 'diagnose_tab'/
)
assert.match(startRunnerSource, /if \(!userPlantId && !plantId && !allowsAnonymousPlantContext\)/)
assert.match(
  questionStartRunnerSource,
  /if \(!userPlantId && !plantId && !allowsAnonymousPlantContext\)/
)

console.log('pest response presenter tests passed')
