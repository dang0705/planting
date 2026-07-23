import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildAuthorizedRetakeResult,
  buildRetakeImageAnswerPayload,
  preserveDiagnosisContinuationContext,
  resolveRetakeUploadSlotType
} from '../../../../../../src/components/diagnose-flow/retake-continuation.js'
import {
  formatRetakeCountdownText,
  getRetakeRemainingSeconds,
  isRetakeSkippedUnknown
} from '../../../../../../src/components/diagnose-flow/retake-clock.js'

const initialResult = {
  diagnosisSessionId: 'session_dynamic_pest',
  roundId: 'round_3',
  plantId: 'plant_9',
  latestVisualCallBatchId: 'visual_batch_1',
  visualBatchTrace: { currentVisualCallBatchId: 'visual_batch_1' },
  retakeRequest: {
    status: 'needs_confirmation',
    requestedCaptureRegion: 'leaf_lower_surface'
  }
}
const authorization = {
  status: 'active',
  retakeAuthorizationId: 'retake_auth_1',
  requestedCaptureRegion: 'leaf_lower_surface',
  originVisualCallBatchId: 'visual_batch_1',
  serverNow: 1000,
  retakeExpiresAt: 181000
}
const authorizedResult = buildAuthorizedRetakeResult(initialResult, authorization)

assert.equal(authorizedResult.diagnosisSessionId, 'session_dynamic_pest')
assert.equal(authorizedResult.retakeRequest.status, 'authorized')
assert.equal(authorizedResult.retakeRequest.requestedCaptureRegion, 'leaf_lower_surface')
assert.equal(resolveRetakeUploadSlotType('leaf_lower_surface'), 'leaf')
assert.equal(resolveRetakeUploadSlotType('whole_plant_overview'), 'whole_plant')
assert.equal(
  preserveDiagnosisContinuationContext(
    { diagnosisSessionId: 'session_dynamic_pest', plantId: '' },
    authorizedResult,
    { plantId: 'plant_from_page_payload' }
  ).plantId,
  'plant_9'
)

const remaining = getRetakeRemainingSeconds({
  retakeExpiresAt: authorization.retakeExpiresAt,
  serverNow: authorization.serverNow,
  receivedClientAt: 5000,
  currentNow: 6000
})
assert.equal(remaining, 179)
assert.equal(formatRetakeCountdownText({ authorization, total: remaining }), '剩余 2:59')
assert.equal(
  formatRetakeCountdownText({ authorization, expired: true, total: 0 }),
  '补拍时间已结束'
)
assert.equal(
  isRetakeSkippedUnknown({ status: 'skipped_unknown' }, { status: 'skipped_unknown' }),
  true
)

const answerPayload = buildRetakeImageAnswerPayload({
  result: authorizedResult,
  structuredImages: [
    {
      imageRef: 'cloud://retake-leaf.jpg',
      inputSlotType: 'leaf',
      inputSlotLabel: '图1 叶片图'
    }
  ]
})
assert.equal(answerPayload.diagnosisSessionId, 'session_dynamic_pest')
assert.equal(answerPayload.roundId, 'round_3')
assert.equal(answerPayload.image, 'cloud://retake-leaf.jpg')
assert.deepEqual(answerPayload.imageIds, ['cloud://retake-leaf.jpg'])
assert.equal(answerPayload.images[0].captureRegion, 'leaf_lower_surface')
assert.equal(answerPayload.latestVisualCallBatchId, 'visual_batch_1')
assert.deepEqual(answerPayload.visualBatchTrace, { currentVisualCallBatchId: 'visual_batch_1' })
assert.equal(answerPayload.retakeAuthorizationId, 'retake_auth_1')
assert.equal(answerPayload.requestedCaptureRegion, 'leaf_lower_surface')
assert.equal(answerPayload.originVisualCallBatchId, 'visual_batch_1')

const pageSource = readFileSync('src/pages/diagnose/question-package.vue', 'utf8')
const componentSource = readFileSync(
  'src/pages/diagnose/question-package/QuestionPackageRetake.vue',
  'utf8'
)
const flowSource = readFileSync('src/pages/diagnose/question-package/retake-flow.js', 'utf8')
const contextSource = readFileSync('src/pages/diagnose/question-package/page-context.js', 'utf8')

assert.ok(
  pageSource.indexOf('v-else-if="result?.retakeRequest"') <
    pageSource.indexOf('v-else-if="result && !result.hasActiveQuestions')
)
assert.match(pageSource, /useQuestionPackageRetake/)
assert.match(componentSource, /<RetakeCard/)
assert.match(componentSource, /diagnose-question-package-image-submit-button/)
assert.match(componentSource, /diagnose-retake-expired-reset-button/)
assert.match(flowSource, /requestDiagnosisRetakeAuthorize/)
assert.match(flowSource, /requestDiagnosisRetakeSkip/)
assert.match(flowSource, /buildRetakeImageAnswerPayload/)
assert.match(flowSource, /isRetakeWindowExpiredError/)
assert.match(flowSource, /refreshActiveSessionFromService/)
assert.match(contextSource, /specific_pest_visual/)
assert.match(contextSource, /wilting_droop/)
assert.match(contextSource, /叶子发黄问诊/)

console.log('question package retake flow tests passed')
