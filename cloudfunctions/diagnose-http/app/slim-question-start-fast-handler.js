'use strict'

const crypto = require('node:crypto')
const { buildRuntimeArtifacts } = require('../domain/runtime-artifacts')
const { getStartQuestionPackage } = require('./start-question-package-runtime-data')
const { dispatchDeferredPersistence } = require('./deferred-persistence-dispatcher')

const CONTINUATION_VERSION = 1
const CONTINUATION_KIND = 'diagnosis-question-package'
const CONTINUATION_TTL_SECONDS = 15 * 60
const CONTINUATION_SECRET_ENV_KEYS = [
  'DIAGNOSIS_CONTINUATION_SECRET',
  'HTTP_IDENTITY_TICKET_SECRET',
  'SESSION_TOKEN_SECRET'
]

const PACKAGE_CONFIG = Object.freeze({
  yellow_leaf: {
    route: 'yellow_leaf',
    sourceMode: 'manual_yellowing_care_environment_frontloaded',
    packageTopics: [
      'watering_frequency_context',
      'light_change_context',
      'fertilization_growth_context',
      'air_environment'
    ]
  },
  wilting_droop: {
    route: 'wilting_droop',
    sourceMode: 'manual_wilting_droop_route_package',
    packageTopics: [
      'watering_frequency_context',
      'wilting_shape',
      'wilting_rhythm_environment',
      'air_environment',
      'recent_stress',
      'wilting_high_risk'
    ]
  }
})

function text(value = '') {
  return String(value || '').trim()
}

function normalizeHeaders(value = {}) {
  return Object.fromEntries(
    Object.entries(value && typeof value === 'object' ? value : {}).map(([key, item]) => [
      String(key).toLowerCase(),
      Array.isArray(item) ? item[0] : item
    ])
  )
}

function parseBody(event = {}) {
  if (event?.body && typeof event.body === 'object' && !Array.isArray(event.body)) {
    return event.body
  }
  if (typeof event?.body === 'string') {
    try {
      const parsed = JSON.parse(event.body)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return event && typeof event === 'object' ? event : {}
}

function parseQuery(rawPath = '') {
  const queryIndex = String(rawPath || '').indexOf('?')
  if (queryIndex < 0) {
    return {}
  }
  return Object.fromEntries(
    String(rawPath)
      .slice(queryIndex + 1)
      .split('&')
      .filter(Boolean)
      .map(pair => {
        const separator = pair.indexOf('=')
        const rawKey = separator < 0 ? pair : pair.slice(0, separator)
        const rawValue = separator < 0 ? '' : pair.slice(separator + 1)
        try {
          return [decodeURIComponent(rawKey), decodeURIComponent(rawValue)]
        } catch {
          return [rawKey, rawValue]
        }
      })
      .filter(([key]) => text(key))
  )
}

function getRequest(event = {}, context = {}) {
  const httpContext = context?.httpContext || {}
  const rawPath =
    httpContext.path || httpContext.url || httpContext.rawPath || httpContext.reqUrl || event?.path || ''
  return {
    path: String(rawPath),
    method: String(
      httpContext.httpMethod || httpContext.method || event?.httpMethod || event?.requestContext?.http?.method || 'POST'
    ).toUpperCase(),
    headers: normalizeHeaders({
      ...(event?.headers && typeof event.headers === 'object' ? event.headers : {}),
      ...(httpContext.headers && typeof httpContext.headers === 'object' ? httpContext.headers : {})
    }),
    query: {
      ...parseQuery(rawPath),
      ...(httpContext.query && typeof httpContext.query === 'object' ? httpContext.query : {}),
      ...(event?.query && typeof event.query === 'object' ? event.query : {})
    },
    body: parseBody(event)
  }
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-transform'
    },
    body: JSON.stringify(payload)
  }
}

function getContinuationSecret() {
  return CONTINUATION_SECRET_ENV_KEYS.map(key => text(process.env[key])).find(value => value.length >= 32) || ''
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function createContinuationToken({ openid, sessionId, response, plantContext }) {
  const secret = getContinuationSecret()
  const questionPackage = response?.questionPackage || {}
  if (!secret || !text(openid) || !text(sessionId) || questionPackage.answerSubmitMode !== 'package') {
    return ''
  }
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = {
    version: CONTINUATION_VERSION,
    kind: CONTINUATION_KIND,
    openid: text(openid),
    sessionId: text(sessionId),
    issuedAt,
    expiresAt: issuedAt + CONTINUATION_TTL_SECONDS,
    roundId: text(response.roundId) || 'round_1',
    questionPackage: {
      mode: text(questionPackage.mode),
      route: text(questionPackage.route),
      sourceMode: text(questionPackage.sourceMode),
      answerSubmitMode: 'package',
      packageVersion: Number(questionPackage.packageVersion || 1),
      fixedQuestionPackage: Boolean(questionPackage.fixedQuestionPackage)
    },
    questionPackageSnapshot: {
      mode: text(questionPackage.mode),
      route: text(questionPackage.route),
      sourceMode: text(questionPackage.sourceMode),
      packageVersion: Number(questionPackage.packageVersion || 1),
      answerSubmitMode: 'package',
      questionDisplayMode: 'package',
      fixedQuestionPackage: true,
      dynamicQuestionPackage: false,
      candidateModes: [],
      hiddenPrefilledEvidence: [],
      outcomePolicy: questionPackage.outcomePolicy
    },
    plantContext: {
      plantId: plantContext?.plantId || null,
      userPlantId: plantContext?.userPlantId || null,
      plantIdentityId: text(plantContext?.plantIdentityId),
      identityResolutionStatus: text(plantContext?.identityResolutionStatus)
    },
    observedSymptoms: response.observedSymptoms,
    observedEvidenceSet: response.observedEvidenceSet
  }
  const encodedPayload = encodePayload(payload)
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function compactQuestion(item = {}) {
  return {
    questionKey: text(item.questionKey),
    questionType: text(item.questionType || item.type),
    packageTopic: text(item.packageTopic),
    defaultOptionKey: text(item.defaultOptionKey),
    defaultOptionId: text(item.defaultOptionId),
    uiVariant: text(item.uiVariant),
    riskLevel: '',
    riskNotice: '',
    safetyInstructions: [],
    requiresExplicitConsent: false,
    skipOptionEnabled: false,
    skipAnswerValue: '',
    candidateModes: [],
    requiredEvidenceKeys: [],
    text: text(item.text || item.questionText),
    helpText: text(item.helpText),
    options: (Array.isArray(item.options) ? item.options : []).map(option => ({
      optionId: text(option.optionId || option.optionKey),
      optionKey: text(option.optionKey || option.optionId),
      text: text(option.text || option.label),
      description: text(option.description || option.desc),
      isDefault: Boolean(option.isDefault),
      answerValue: text(option.answerValue),
      mapsToModes: [],
      mapsToEvidenceKeys: [],
      value: Number(option.value || 0)
    }))
  }
}

function buildObservedSymptoms(mode) {
  const isWilting = mode === 'wilting_droop'
  return [{
    symptomKey: isWilting ? 'wilting_droop' : 'leaf_yellowing',
    symptomCn: isWilting ? '枯萎发蔫' : '叶片发黄',
    confidence: 0.82,
    source: 'manual_symptom_mode',
    evidenceSource: 'manual_symptom_mode',
    classKey: isWilting ? 'wilting_droop_mode' : 'yellowing_mode',
    classNameCn: isWilting ? '枯萎 / 发蔫模式' : '黄叶模式'
  }]
}

function buildObservedEvidenceSet(mode) {
  const isWilting = mode === 'wilting_droop'
  const symptomKey = isWilting ? 'wilting_droop' : 'leaf_yellowing'
  const classKey = isWilting ? 'wilting_droop_mode' : 'yellowing_mode'
  const classNameCn = isWilting ? '枯萎 / 发蔫模式' : '黄叶模式'
  const symptomCn = isWilting ? '枯萎发蔫' : '叶片发黄'
  return [{
    observedEvidenceSetId: `manual_symptom_mode::${classKey}::${symptomKey}`,
    evidenceKey: symptomKey,
    evidenceType: 'symptom',
    symptomKey,
    symptomCn,
    confidence: 0.82,
    sourceType: 'manual_symptom_mode',
    currentStatus: 'active',
    targetLayer: 'observed_evidence_set',
    sourceRecordId: classKey,
    firstSeenStage: 'manual_symptom_mode',
    enteredRuntime: 1,
    enteredExplanation: 1,
    isKeyEvidence: 1,
    symptomClassKey: classKey,
    symptomClassNameCn: classNameCn
  }]
}

function buildClientContext(payload = {}) {
  const source = payload?.clientContext && typeof payload.clientContext === 'object' ? payload.clientContext : payload
  const result = {}
  for (const key of ['source', 'platform', 'reviewSourceType', 'visualInputVersion', 'diagnosisProfile', 'entrySource']) {
    const value = text(source?.[key])
    if (value) result[key] = value
  }
  return Object.keys(result).length ? result : null
}

function buildDeferredPersistenceTask({ sessionId, openid, plantContext, response, payload }) {
  return () => {
    dispatchDeferredPersistence({
      sessionId,
      openid,
      plantContext,
      response,
      round: 1,
      image: '',
      description: '',
      clientContext: buildClientContext(payload),
      sessionQuestionRows: null
    })
  }
}

function attachAfterResponse(response, task) {
  Object.defineProperty(response, 'afterResponse', {
    value: task,
    enumerable: false,
    configurable: false,
    writable: false
  })
  return response
}

function resolveStartMode(payload = {}) {
  const classKey = text(payload.symptomClassKey || payload.symptom_class_key || payload.classKey || payload.class_key)
  if (classKey === 'yellowing_mode') return 'yellow_leaf'
  if (classKey === 'wilting_droop_mode') return 'wilting_droop'
  return ''
}

function buildPlantContext(payload = {}) {
  const requestedPlantId = text(payload.plantCatalogId || payload.catalogPlantId || payload.plantId)
  const plantId = requestedPlantId && requestedPlantId !== 'diagnose_tab_anonymous' ? requestedPlantId : null
  return {
    plantId,
    userPlantId: text(payload.userPlantId),
    plantIdentityId: '',
    identityResolutionStatus: 'question_start_static_package'
  }
}

async function handleFastQuestionStart({ request, payload, identity } = {}) {
  const mode = resolveStartMode(payload)
  const config = PACKAGE_CONFIG[mode]
  if (!config) return null

  const plantContext = buildPlantContext(payload)
  const allowsAnonymousPlantContext = text(payload.entrySource || payload.entry_source) === 'diagnose_tab'
  if (!plantContext.userPlantId && !plantContext.plantId && !allowsAnonymousPlantContext) {
    throw Object.assign(new Error('缺少 userPlantId 或 plantCatalogId'), { statusCode: 400 })
  }

  const sessionId = `diag_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const questions = getStartQuestionPackage(mode)
  const observedSymptoms = buildObservedSymptoms(mode)
  const observedEvidenceSet = buildObservedEvidenceSet(mode)
  const questionPackage = {
    mode,
    route: config.route,
    sourceMode: config.sourceMode,
    questionCount: questions.length,
    packageVersion: 2,
    packageTopics: config.packageTopics,
    answerSubmitMode: 'package',
    questionDisplayMode: 'package',
    fixedQuestionPackage: true,
    outcomePolicy: { allowMultipleOutcomes: true, preferSingleOutcome: false }
  }
  const response = {
    diagnosisSessionId: sessionId,
    roundId: 'round_1',
    roundIndex: 1,
    currentRoundIndex: 1,
    currentRoundId: 'round_1',
    stage: 'question_package',
    status: 'active',
    routePrimaryAction: 'ask_first',
    stopReason: 'await_package_answers',
    sessionStatus: 'awaiting_package_answers',
    questionRequired: true,
    outcomeType: '',
    plantId: plantContext.userPlantId || plantContext.plantId || '',
    plantIdentityId: '',
    identityResolutionStatus: plantContext.identityResolutionStatus,
    latestVisualCallBatchId: null,
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet: [],
    diagnosisDirections: [],
    questions,
    questionPackage,
    uiHints: {
      canUploadMoreImages: false,
      maxQuestionsThisRound: questions.length,
      questionDisplayMode: 'package',
      answerSubmitMode: 'package',
      optionLayout: 'vertical',
      transition: 'swiper'
    },
    metrics: {
      questionStartPath: 'static_question_package',
      routeDecision: {
        mode: config.sourceMode,
        candidateOutcomeKeys: [],
        visibleOutcomeKeys: [],
        requiresQuestionPackage: true,
        decisionCause: {
          decisionCauseKey: mode === 'wilting_droop'
            ? 'static_wilting_droop_question_package'
            : 'static_yellowing_question_package',
          decisionCauseText: mode === 'wilting_droop'
            ? '枯萎 / 发蔫手动入口使用模块级静态固定题包。'
            : '黄叶手动入口使用模块级静态固定题包。'
        }
      }
    },
    __runtimeRouteDecision: {
      mode: config.sourceMode,
      visibleOutcomeKeys: [],
      requiresQuestionPackage: true
    },
    plantContext
  }
  Object.assign(response, buildRuntimeArtifacts(response, {
    observedEvidenceSet,
    derivedEvidenceSet: [],
    diagnosisDirections: []
  }))

  const continuationToken = createContinuationToken({
    openid: identity.openid,
    sessionId,
    response,
    plantContext
  })
  if (!continuationToken) {
    throw Object.assign(new Error('题包续接凭据不可用'), { statusCode: 500 })
  }
  const publicQuestions = questions.map(compactQuestion)
  return attachAfterResponse(jsonResponse(200, {
    code: 200,
    message: '问诊初始化成功',
    data: {
      diagnosisSessionId: sessionId,
      roundId: 'round_1',
      ...(plantContext.userPlantId ? { userPlantId: plantContext.userPlantId } : {}),
      ...(response.plantId ? { plantId: response.plantId } : {}),
      ...(plantContext.plantId ? { plantCatalogId: plantContext.plantId } : {}),
      stage: 'question_package',
      status: 'active',
      stopReason: 'await_package_answers',
      questions: publicQuestions,
      questionPackage,
      summaryCard: {
        title: '诊断问题',
        subtitle: `需要回答 ${publicQuestions.length} 道问题`,
        severity: 'low',
        statusText: ''
      },
      airEnvironmentByQuestionId: {},
      airEnvironmentSnapshotsByQuestionId: {},
      airEnvironmentSnapshotSourceByQuestionId: {},
      airEnvironmentEvidence: null,
      uiHints: response.uiHints,
      questionPackageContinuationToken: continuationToken
    }
  }), buildDeferredPersistenceTask({ sessionId, openid: identity.openid, plantContext, response, payload }))
}

module.exports = { getRequest, jsonResponse, resolveStartMode, handleFastQuestionStart }
