import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  canShowRetakeStartButton,
  formatRetakeCountdownText,
  getRetakeRemainingSeconds,
  isRetakeSkippedUnknown
} from '../../../../../src/components/diagnose-flow/retake-clock.js'
import { buildRetakeConfirmationContent } from '../../../../../src/components/diagnose-flow/retake-copy.js'
import { isRetakeWindowExpiredError } from '../../../../../src/components/diagnose-flow/retake-expiry.js'
import { resolveRiskSkipAction } from '../../../../../src/components/diagnose-flow/question-skip.js'
import {
  buildDirectionChoicePayload,
  shouldAutoSelectDirectionChoice
} from '../../../../../src/components/diagnose-flow/direction-choice-payload.js'
import {
  shouldNavigateDiagnosisResult,
  shouldNavigateQuestionPackage
} from '../../../../../src/components/diagnose-flow/question-package-navigation.js'
import {
  buildAuthorizedRetakeResult,
  buildRetakeImageAnswerPayload,
  preserveDiagnosisContinuationContext,
  resolveRetakeUploadSlotType
} from '../../../../../src/components/diagnose-flow/retake-continuation.js'
import { useDiagnoseQuestionText } from '../../../../../src/components/diagnose-flow/question-text.js'
import { normalizeDiagnosisResult } from '../../../../../src/utils/diagnose-result-normalizer.js'

assert.equal(
  getRetakeRemainingSeconds({
    retakeExpiresAt: 181000,
    serverNow: 1000,
    receivedClientAt: 5000,
    currentNow: 5000
  }),
  180
)
assert.equal(
  getRetakeRemainingSeconds({
    retakeExpiresAt: 181000,
    serverNow: 1000,
    receivedClientAt: 5000,
    currentNow: 6000
  }),
  179
)
assert.equal(
  getRetakeRemainingSeconds({
    retakeExpiresAt: 181000,
    serverNow: 1000,
    receivedClientAt: 5000,
    currentNow: 185000
  }),
  0
)
assert.equal(
  getRetakeRemainingSeconds({
    retakeExpiresAt: 500000,
    serverNow: 200000,
    receivedClientAt: 9000,
    currentNow: 9000
  }),
  300
)
assert.equal(
  formatRetakeCountdownText({ authorization: { status: 'active' }, total: 179 }),
  '剩余 2:59'
)
assert.equal(
  formatRetakeCountdownText({ authorization: { status: 'active' }, expired: true }),
  '补拍时间已结束'
)

assert.deepEqual(resolveRiskSkipAction({ activeQuestionIndex: 0, questionStackLength: 2 }), {
  answerValue: 'unknown',
  shouldAdvance: true,
  shouldSubmit: false
})
assert.deepEqual(resolveRiskSkipAction({ activeQuestionIndex: 1, questionStackLength: 2 }), {
  answerValue: 'unknown',
  shouldAdvance: false,
  shouldSubmit: true
})

assert.equal(isRetakeSkippedUnknown({ status: 'skipped_unknown' }, null), true)
assert.equal(
  canShowRetakeStartButton({
    hasActiveRetakeAuthorization: false,
    retakeExpired: false,
    retakeSkippedUnknown: true
  }),
  false
)

const confirmationCopy = buildRetakeConfirmationContent({
  riskNotice: '需要靠近可疑位置补拍。',
  safetyInstructions: ['动作放轻，避免折断叶片。']
})
assert.match(confirmationCopy, /需要靠近可疑位置补拍/)
assert.match(confirmationCopy, /动作放轻/)
assert.match(confirmationCopy, /3 分钟内完成拍摄并提交/)

const normalizedSkippedRetake = normalizeDiagnosisResult({
  diagnosisSessionId: 'diag_skip',
  stage: 'final',
  status: 'closed',
  sessionStatus: 'completed',
  stopReason: 'retake_skipped_unknown',
  outcomeType: 'uncertain',
  retakeRequest: { status: 'skipped_unknown', answerValue: 'unknown' },
  retakeAuthorizationState: { status: 'skipped_unknown', answerValue: 'unknown' },
  finalResult: { resultId: 'diag_skip_retake_skipped_unknown', outcomeType: 'uncertain' }
})
assert.equal(normalizedSkippedRetake.status, 'closed')
assert.equal(normalizedSkippedRetake.stopReason, 'retake_skipped_unknown')
assert.equal(normalizedSkippedRetake.retakeRequest.status, 'skipped_unknown')
assert.equal(normalizedSkippedRetake.retakeAuthorizationState.answerValue, 'unknown')

const retakeRequestHelperSource = readFileSync('src/http-functions/diagnose/retake.js', 'utf8')
assert.equal(retakeRequestHelperSource.includes('diagnose-http/diagnosis/retake/skip'), true)
assert.equal(retakeRequestHelperSource.includes('requestDiagnosisRetakeSkip'), true)
assert.equal(isRetakeWindowExpiredError({ businessCode: 'RETAKE_WINDOW_EXPIRED' }), true)
assert.equal(isRetakeWindowExpiredError(new Error('补拍失败（RETAKE_WINDOW_EXPIRED）')), true)
assert.equal(isRetakeWindowExpiredError(new Error('补图失败')), false)

const directionPayload = buildDirectionChoicePayload({
  result: { diagnosisSessionId: 'diag_1', roundId: 'round_1' },
  choice: {
    modeKey: 'pest',
    pestModeKeys: ['spider_mite', 'thrips'],
    directModeKeys: ['spider_mite'],
    confirmationModeKeys: ['thrips']
  }
})
assert.equal(directionPayload.requestMode, 'direction_choice')
assert.equal(directionPayload.selectedModeKey, 'pest')
assert.deepEqual(directionPayload.directionChoice.pestModeKeys, ['spider_mite', 'thrips'])
assert.deepEqual(directionPayload.directionChoice.directModeKeys, ['spider_mite'])
assert.equal(shouldAutoSelectDirectionChoice([{ modeKey: 'pest' }]), false)

assert.equal(
  shouldNavigateQuestionPackage({ mode: 'specific_pest_visual', dynamicQuestionPackage: true }),
  true
)
assert.equal(shouldNavigateQuestionPackage({ mode: 'yellow_leaf' }), true)
assert.equal(shouldNavigateQuestionPackage({ mode: 'wilting_droop' }), true)
assert.equal(shouldNavigateQuestionPackage(null), false)
assert.equal(
  shouldNavigateDiagnosisResult({
    hasActiveQuestions: true,
    questionPackage: { mode: 'specific_pest_visual' }
  }),
  true
)
assert.equal(
  shouldNavigateDiagnosisResult({ hasActiveQuestions: false, questionPackage: { mode: 'pest' } }),
  false
)
assert.equal(resolveRetakeUploadSlotType('leaf_lower_surface'), 'leaf')
assert.equal(resolveRetakeUploadSlotType('soil_surface'), 'root_crown')

const authorizedResult = buildAuthorizedRetakeResult(
  {
    diagnosisSessionId: 'diag_1',
    retakeRequest: { status: 'needs_confirmation', requestedCaptureRegion: 'leaf_lower_surface' }
  },
  { status: 'active', retakeAuthorizationId: 'retake_1' }
)
assert.equal(authorizedResult.retakeRequest.status, 'authorized')
assert.equal(authorizedResult.retakeAuthorizationState.retakeAuthorizationId, 'retake_1')
assert.deepEqual(
  preserveDiagnosisContinuationContext(
    { diagnosisSessionId: 'diag_1', plantId: '' },
    { plantId: 'plant_42', visualBatchTrace: { currentVisualCallBatchId: 'batch_1' } }
  ),
  {
    diagnosisSessionId: 'diag_1',
    plantId: 'plant_42',
    visualBatchTrace: { currentVisualCallBatchId: 'batch_1' }
  }
)

const retakeImagePayload = buildRetakeImageAnswerPayload({
  result: {
    diagnosisSessionId: 'diag_1',
    roundId: 'round_3',
    latestVisualCallBatchId: 'batch_1',
    visualBatchTrace: { currentVisualCallBatchId: 'batch_1' },
    retakeRequest: { requestedCaptureRegion: 'leaf_lower_surface' },
    retakeAuthorizationState: {
      retakeAuthorizationId: 'retake_1',
      requestedCaptureRegion: 'leaf_lower_surface',
      originVisualCallBatchId: 'batch_1'
    }
  },
  structuredImages: [{ imageRef: 'cloud://retake.jpg', inputSlotType: 'leaf' }]
})
assert.equal(retakeImagePayload.image, 'cloud://retake.jpg')
assert.equal(retakeImagePayload.images[0].captureRegion, 'leaf_lower_surface')
assert.equal(retakeImagePayload.retakeAuthorizationId, 'retake_1')
assert.equal(retakeImagePayload.originVisualCallBatchId, 'batch_1')
const dialogSubmitSource = readFileSync('src/components/diagnose-flow/dialog-submit.js', 'utf8')
const inlineQuestionFlowSource = readFileSync(
  'src/components/diagnose-flow/question-flow.js',
  'utf8'
)
assert.doesNotMatch(dialogSubmitSource, /shouldKeepQuestionPackageInline|dynamicPestPackage/)
assert.match(dialogSubmitSource, /shouldNavigateDiagnosisResult\(nextResult\)/)
assert.match(dialogSubmitSource, /navigateToDiagnosisQuestionPackagePage\(rerunResult\)/)
assert.match(
  inlineQuestionFlowSource,
  /const isRevisionSubmit = !isPackageSubmit && hasDirtyQuestionAnswers\.value/
)

const questionText = useDiagnoseQuestionText({
  sanitizeTemplateText: value => String(value || '').trim(),
  normalizeText: value => String(value || '').trim()
})
assert.equal(
  questionText.getQuestionSafetyInstructionsText({
    safetyInstructions: ['先确认手部安全', '', '只轻碰叶片边缘']
  }),
  '先确认手部安全；只轻碰叶片边缘'
)
assert.equal(
  questionText.getQuestionSafetyInstructionsText({ safetyInstructions: '不方便时跳过' }),
  '不方便时跳过'
)

console.log('diagnose flow helper tests passed')
