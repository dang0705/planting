'use strict'

const crypto = require('node:crypto')

const CONTINUATION_VERSION = 1
const CONTINUATION_KIND = 'diagnosis-question-package'
const CONTINUATION_TTL_SECONDS = 15 * 60
const CONTINUATION_SECRET_ENV_KEYS = [
  'DIAGNOSIS_CONTINUATION_SECRET',
  'HTTP_IDENTITY_TICKET_SECRET',
  'SESSION_TOKEN_SECRET'
]
const {
  buildQuestionPackageVisualEvidenceSnapshot
} = require('../utils/public-runtime-summary')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function getContinuationSecret() {
  for (const key of CONTINUATION_SECRET_ENV_KEYS) {
    const value = normalizeText(process.env[key])
    if (value.length >= 32) {
      return value
    }
  }
  return ''
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodePayload(encodedPayload = '') {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function signPayload(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function hasMatchingSignature(expected = '', received = '') {
  const expectedBuffer = Buffer.from(String(expected || ''))
  const receivedBuffer = Buffer.from(String(received || ''))
  return (
    expectedBuffer.length > 0 &&
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

function buildQuestionPackageSnapshot(response = {}, runtimeData = null) {
  const questionPackage = response?.questionPackage || {}
  const packageQuestions = Array.isArray(response?.questions)
    ? response.questions
    : Array.isArray(questionPackage?.packageQuestions)
      ? questionPackage.packageQuestions
      : []
  const visualAggregateSummary = buildQuestionPackageVisualEvidenceSnapshot(
    response?.visualAggregateSummary || response?.visualAggregateResult || null
  )
  return {
    mode: normalizeText(questionPackage.mode),
    route: normalizeText(questionPackage.route),
    sourceMode: normalizeText(questionPackage.sourceMode),
    packageVersion: Number(questionPackage.packageVersion || 1),
    answerSubmitMode: normalizeText(questionPackage.answerSubmitMode),
    questionDisplayMode: normalizeText(questionPackage.questionDisplayMode),
    fixedQuestionPackage: Boolean(questionPackage.fixedQuestionPackage),
    dynamicQuestionPackage: Boolean(questionPackage.dynamicQuestionPackage),
    candidateModes: Array.isArray(questionPackage.candidateModes)
      ? questionPackage.candidateModes
      : [],
    hiddenPrefilledEvidence: Array.isArray(questionPackage.hiddenPrefilledEvidence)
      ? questionPackage.hiddenPrefilledEvidence
      : [],
    outcomePolicy:
      questionPackage.outcomePolicy && typeof questionPackage.outcomePolicy === 'object'
        ? questionPackage.outcomePolicy
        : null,
    packageQuestions,
    ...(visualAggregateSummary ? { visualAggregateSummary } : {}),
    ...(runtimeData && typeof runtimeData === 'object'
      ? {
          questionPackageRuntimeData: {
            answerEffects: Array.isArray(runtimeData.answerEffects) ? runtimeData.answerEffects : [],
            diagnosisOutcomes: Array.isArray(runtimeData.diagnosisOutcomes)
              ? runtimeData.diagnosisOutcomes
              : [],
            actionProfiles: Array.isArray(runtimeData.actionProfiles)
              ? runtimeData.actionProfiles
              : []
          }
        }
      : {})
  }
}

function createQuestionPackageContinuationToken({
  openid = '',
  sessionId = '',
  response = {},
  plantContext = {},
  runtimeData = null,
  now = Date.now()
} = {}) {
  const secret = getContinuationSecret()
  const normalizedOpenid = normalizeText(openid)
  const normalizedSessionId = normalizeText(sessionId)
  const questionPackage = response?.questionPackage || {}
  if (
    !secret ||
    !normalizedOpenid ||
    !normalizedSessionId ||
    normalizeText(questionPackage.answerSubmitMode) !== 'package'
  ) {
    return ''
  }

  const issuedAt = Math.floor(Number(now || Date.now()) / 1000)
  const payload = {
    version: CONTINUATION_VERSION,
    kind: CONTINUATION_KIND,
    openid: normalizedOpenid,
    sessionId: normalizedSessionId,
    issuedAt,
    expiresAt: issuedAt + CONTINUATION_TTL_SECONDS,
    roundId: normalizeText(response.roundId) || 'round_1',
    questionPackage: {
      mode: normalizeText(questionPackage.mode),
      route: normalizeText(questionPackage.route),
      sourceMode: normalizeText(questionPackage.sourceMode),
      answerSubmitMode: normalizeText(questionPackage.answerSubmitMode),
      packageVersion: Number(questionPackage.packageVersion || 1),
      fixedQuestionPackage: Boolean(questionPackage.fixedQuestionPackage)
    },
    questionPackageSnapshot: buildQuestionPackageSnapshot(response, runtimeData),
    plantContext:
      plantContext && typeof plantContext === 'object'
        ? {
            plantId: plantContext.plantId || null,
            userPlantId: plantContext.userPlantId || null,
            plantIdentityId: normalizeText(plantContext.plantIdentityId),
            identityResolutionStatus: normalizeText(plantContext.identityResolutionStatus)
          }
        : {},
    observedSymptoms: Array.isArray(response.observedSymptoms) ? response.observedSymptoms : [],
    observedEvidenceSet: Array.isArray(response.observedEvidenceSet)
      ? response.observedEvidenceSet
      : []
  }
  const encodedPayload = encodePayload(payload)
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`
}

function verifyQuestionPackageContinuationToken({
  token = '',
  openid = '',
  sessionId = '',
  now = Date.now()
} = {}) {
  const secret = getContinuationSecret()
  const rawToken = normalizeText(token)
  if (!secret || !rawToken) {
    return null
  }
  const [encodedPayload, signature, extra] = rawToken.split('.')
  if (extra || !encodedPayload || !signature) {
    return null
  }
  if (!hasMatchingSignature(signPayload(encodedPayload, secret), signature)) {
    return null
  }

  const payload = decodePayload(encodedPayload)
  const nowSeconds = Math.floor(Number(now || Date.now()) / 1000)
  const packageSnapshot = payload?.questionPackageSnapshot
  const packageQuestions = Array.isArray(packageSnapshot?.packageQuestions)
    ? packageSnapshot.packageQuestions
    : []
  if (
    !payload ||
    payload.version !== CONTINUATION_VERSION ||
    payload.kind !== CONTINUATION_KIND ||
    normalizeText(payload.openid) !== normalizeText(openid) ||
    normalizeText(payload.sessionId) !== normalizeText(sessionId) ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > nowSeconds + 60 ||
    payload.expiresAt < nowSeconds ||
    payload.expiresAt - payload.issuedAt > CONTINUATION_TTL_SECONDS ||
    normalizeText(payload.questionPackage?.answerSubmitMode) !== 'package' ||
    normalizeText(packageSnapshot?.answerSubmitMode) !== 'package' ||
    packageQuestions.length === 0
  ) {
    return null
  }

  return payload
}

function buildQuestionPackageContinuationSessionState(ticket = {}) {
  const snapshot = ticket?.questionPackageSnapshot
  const plantContext = ticket?.plantContext && typeof ticket.plantContext === 'object'
    ? ticket.plantContext
    : {}
  return {
    sessionId: normalizeText(ticket.sessionId),
    userPlantId: plantContext.userPlantId || null,
    plantId: plantContext.plantId || null,
    plantContext,
    runtimeSnapshot: {
      questionPackageSnapshot: snapshot,
      visualAggregateSummary: snapshot?.visualAggregateSummary || null,
      observedSymptoms: Array.isArray(ticket.observedSymptoms) ? ticket.observedSymptoms : [],
      observedEvidenceSet: Array.isArray(ticket.observedEvidenceSet)
        ? ticket.observedEvidenceSet
        : []
    },
    visualBatchTrace: null,
    visualAggregateSummary: snapshot?.visualAggregateSummary || null,
    retakeRequest: null,
    retakeAuthorizationState: null,
    directionChoices: [],
    pendingDirectPestSnapshot: null,
    shadowCompareSummary: null,
    stopState: null,
    outputEligibility: null,
    diagnosticTrace: [],
    observedEvidenceSet: Array.isArray(ticket.observedEvidenceSet) ? ticket.observedEvidenceSet : [],
    derivedEvidenceSet: [],
    diagnosisDirections: [],
    symptomClassRuntime: null,
    careBaselineSummary: null,
    environmentDeviationHints: [],
    plantIdentityId: plantContext.plantIdentityId || '',
    identityResolutionStatus: plantContext.identityResolutionStatus || '',
    currentRoundId: normalizeText(ticket.roundId) || 'round_1',
    currentRoundIndex: 1,
    latestVisualCallBatchId: null,
    questionRows: [],
    outcomeType: '',
    sessionStatus: 'awaiting_package_answers',
    askedQuestionKeys: [],
    answeredAnswers: [],
    answeredQuestionGroupKeys: [],
    unknownCountByGroup: {},
    primaryClassKey: '',
    secondaryClassKeys: [],
    currentClassKey: '',
    currentGroupKey: '',
    classScores: [],
    classSwitchHistory: [],
    nextRound: 2,
    hasPendingQuestion: true
  }
}

module.exports = {
  buildQuestionPackageSnapshot,
  createQuestionPackageContinuationToken,
  verifyQuestionPackageContinuationToken,
  buildQuestionPackageContinuationSessionState,
  _test: {
    getContinuationSecret,
    encodePayload,
    decodePayload,
    signPayload
  }
}
