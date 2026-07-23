import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { getRetakeRemainingSeconds } from '../../../../../src/components/diagnose-flow/retake-clock.js'

const require = createRequire(import.meta.url)
const servicePath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/services/session-service.js')
const retakePath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/app/retake-authorization.js')
const originalServiceModule = require.cache[servicePath]

let fakeSession = null
const writes = []
require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: {
    getSessionState: async () => fakeSession,
    upsertDiagnosisSession: async payload => {
      writes.push(payload)
    }
  }
}
delete require.cache[retakePath]

const {
  authorizeRetakeForSession,
  skipRetakeForSession,
  assertRetakeUploadAuthorized,
  consumeRetakeAuthorization,
  _test
} = require(retakePath)

function buildSession(overrides = {}) {
  return {
    sessionId: 'diag_1',
    sessionStatus: 'awaiting_retake',
    currentRoundIndex: 1,
    latestVisualCallBatchId: 'visbatch_origin',
    plantContext: { plantId: 'plant_1' },
    runtimeSnapshot: {
      retakeRequest: {
        requestedCaptureRegion: 'leaf_back',
        originVisualCallBatchId: 'visbatch_origin'
      },
      clientContext: { entrySource: 'diagnose_tab' }
    },
    ...overrides
  }
}

fakeSession = buildSession()
const authorization = await authorizeRetakeForSession({
  diagnosisSessionId: 'diag_1',
  openid: 'openid_1',
  requestedCaptureRegion: 'leaf_back',
  now: 1000
})
assert.equal(authorization.diagnosisSessionId, 'diag_1')
assert.equal(authorization.requestedCaptureRegion, 'leaf_lower_surface')
assert.equal(authorization.originVisualCallBatchId, 'visbatch_origin')
assert.equal(authorization.retakeExpiresAt, 181000)
assert.equal(writes.length, 1)

fakeSession = buildSession()
const writeCountBeforeConcurrentAuthorize = writes.length
const [concurrentAuthorizationA, concurrentAuthorizationB] = await Promise.all([
  authorizeRetakeForSession({
    diagnosisSessionId: 'diag_1',
    openid: 'openid_1',
    requestedCaptureRegion: 'leaf_back',
    now: 1200
  }),
  authorizeRetakeForSession({
    diagnosisSessionId: 'diag_1',
    openid: 'openid_1',
    requestedCaptureRegion: 'leaf_back',
    now: 1205
  })
])
assert.equal(
  concurrentAuthorizationA.retakeAuthorizationId,
  concurrentAuthorizationB.retakeAuthorizationId
)
assert.equal(writes.length, writeCountBeforeConcurrentAuthorize + 1)

fakeSession = buildSession()
const skipped = await skipRetakeForSession({
  diagnosisSessionId: 'diag_1',
  openid: 'openid_1',
  requestedCaptureRegion: 'leaf_back',
  now: 1500
})
assert.equal(skipped.sessionStatus, 'completed')
assert.equal(skipped.outcomeType, 'uncertain')
assert.equal(skipped.stopReason, 'retake_skipped_unknown')
assert.equal(skipped.retakeAuthorizationState.status, 'skipped_unknown')
assert.equal(skipped.retakeAuthorizationState.answerValue, 'unknown')
assert.equal(skipped.retakeRequest.status, 'skipped_unknown')
assert.equal(writes.at(-1).response.retakeAuthorizationState.status, 'skipped_unknown')
const writeCountAfterSkip = writes.length

fakeSession = buildSession({
  sessionStatus: 'completed',
  runtimeSnapshot: {
    ...buildSession().runtimeSnapshot,
    retakeRequest: skipped.retakeRequest,
    retakeAuthorizationState: skipped.retakeAuthorizationState
  }
})
await assert.rejects(
  () =>
    authorizeRetakeForSession({
      diagnosisSessionId: 'diag_1',
      openid: 'openid_1',
      requestedCaptureRegion: 'leaf_back',
      now: 1600
    }),
  error => error?.code === 'RETAKE_ALREADY_SKIPPED'
)
const replayedSkip = await skipRetakeForSession({
  diagnosisSessionId: 'diag_1',
  openid: 'openid_1',
  requestedCaptureRegion: 'leaf_back',
  now: 1700
})
assert.equal(replayedSkip.stopReason, 'retake_skipped_unknown')
assert.equal(replayedSkip.retakeAuthorizationState.skippedAt, 1500)
assert.equal(writes.length, writeCountAfterSkip)

fakeSession = buildSession({
  runtimeSnapshot: {
    ...buildSession().runtimeSnapshot,
    retakeAuthorizationState: {
      ...authorization,
      openid: 'openid_1',
      status: 'active'
    }
  }
})
const replayedAuthorization = await authorizeRetakeForSession({
  diagnosisSessionId: 'diag_1',
  openid: 'openid_1',
  requestedCaptureRegion: 'leaf_back',
  now: 2000
})
assert.equal(replayedAuthorization.retakeAuthorizationId, authorization.retakeAuthorizationId)
assert.equal(replayedAuthorization.retakeExpiresAt, 181000)
assert.equal(replayedAuthorization.serverNow, 2000)
assert.equal(
  getRetakeRemainingSeconds({
    retakeExpiresAt: replayedAuthorization.retakeExpiresAt,
    serverNow: replayedAuthorization.serverNow,
    receivedClientAt: 5000,
    currentNow: 5000
  }),
  179
)
await assert.rejects(
  () =>
    skipRetakeForSession({
      diagnosisSessionId: 'diag_1',
      openid: 'openid_1',
      requestedCaptureRegion: 'leaf_back',
      now: 2100
    }),
  error => error?.code === 'RETAKE_ALREADY_USED'
)
await assert.rejects(
  () =>
    assertRetakeUploadAuthorized({
      diagnosisSessionId: 'diag_1',
      openid: 'openid_1',
      authorizationId: 'forged',
      requestedCaptureRegion: 'leaf_back',
      now: 2000
    }),
  /缺少有效补拍授权/
)
await assert.doesNotReject(() =>
  assertRetakeUploadAuthorized({
    diagnosisSessionId: 'diag_1',
    openid: 'openid_1',
    authorizationId: authorization.retakeAuthorizationId,
    requestedCaptureRegion: 'leaf_back',
    originVisualCallBatchId: 'visbatch_origin',
    now: 180000
  })
)
await assert.rejects(
  () =>
    assertRetakeUploadAuthorized({
      diagnosisSessionId: 'diag_1',
      openid: 'openid_1',
      authorizationId: authorization.retakeAuthorizationId,
      requestedCaptureRegion: 'leaf_front',
      now: 180000
    }),
  /补拍区域与授权不匹配/
)
await assert.rejects(
  () =>
    assertRetakeUploadAuthorized({
      diagnosisSessionId: 'diag_1',
      openid: 'openid_1',
      authorizationId: authorization.retakeAuthorizationId,
      requestedCaptureRegion: 'leaf_back',
      now: 181000
    }),
  /RETAKE_WINDOW_EXPIRED/
)
assert.equal(writes.at(-1).response.retakeAuthorizationState.status, 'ended_retake_timeout')

fakeSession = buildSession({ sessionStatus: 'completed' })
await assert.rejects(
  () =>
    authorizeRetakeForSession({
      diagnosisSessionId: 'diag_1',
      openid: 'openid_1',
      requestedCaptureRegion: 'leaf_back'
    }),
  /当前诊断不需要补拍/
)
assert.equal(_test.hasRetakeBeenUsed(consumeRetakeAuthorization(authorization)), true)
assert.equal(_test.hasRetakeBeenUsed(skipped.retakeAuthorizationState), true)

if (originalServiceModule) {
  require.cache[servicePath] = originalServiceModule
} else {
  delete require.cache[servicePath]
}
