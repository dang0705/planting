'use strict'

const { checkAIQuota, deductQuota } = require('/opt/utils/quota')
const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  normalizeHeaders,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo,
  isSkipAuthEnabled
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('./db/schema-resolver')
const {
  adaptObservedSymptoms,
  adaptLegacyFollowUpAnswers,
  normalizeOptionKey
} = require('./mappers/legacy-rule-adapter')
const {
  fromQuestionId,
  fromOptionId
} = require('./mappers/public-id-mapper')
const { runDiagnosisRound } = require('./domain/diagnosis-engine')
const { buildPublicRoundResponse: presentDiagnosisRoundResponse } = require('./presenters/diagnosis-round-presenter')
const { getQuestionOptionMappings } = require('./repositories/question-repository')
const {
  buildSessionId,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  getSessionState,
  getObservedSymptomsBySession,
  listDiagnosisHistory,
  getResultById,
  saveDiagnosisFeedback
} = require('./services/session-service')
const { getRefactorArtifacts } = require('./services/bootstrap-report')
const { analyzeAndPersistVisualBatch } = require('./services/visual-diagnosis-service')
const { persistRoundRuntime } = require('./services/round-runtime-persistence-service')
const {
  markQueueItemsAnswered,
  invalidateQueueForRound
} = require('./services/question-queue-runtime-service')
const {
  hasConsumedFollowUpRetakeQuota,
  diagnosisRoundPresenterHelpers
} = require('./presenters/diagnosis-round-presenter-helpers')
const { resolveLatestVisualCallBatchId } = require('./utils/visual-batch-id')

function resolveVisualImageInputs(payload = {}) {
  const imageEntries = []

  const structuredImages = Array.isArray(payload.images)
    ? payload.images
    : Array.isArray(payload.imageInputs)
      ? payload.imageInputs
      : []

  for (const [index, item] of structuredImages.entries()) {
    const imageRef = String(
      item?.imageRef || item?.imageUrl || item?.image || item?.url || item?.imageId || ''
    ).trim()
    if (!imageRef) continue

    const normalizedOrderIndex = Number(item?.orderIndex ?? index)
    const normalizedInputSlotOrder = Number(item?.inputSlotOrder ?? item?.orderIndex ?? index)
    const normalizedDeclaredOrganConfidence =
      item?.userDeclaredOrganConfidence ?? item?.declaredOrganConfidence ?? null

    imageEntries.push({
      imageRef,
      inputSlotType:
        item?.inputSlotType || item?.slotType || item?.organHint || item?.organ || 'unknown',
      orderIndex: Number.isFinite(normalizedOrderIndex) ? normalizedOrderIndex : index,
      inputSlotOrder: Number.isFinite(normalizedInputSlotOrder)
        ? normalizedInputSlotOrder
        : index,
      inputSlotLabel: item?.inputSlotLabel || item?.slotLabel || '',
      userDeclaredOrganType:
        item?.userDeclaredOrganType || item?.declaredOrganType || item?.userDeclaredOrgan || '',
      userDeclaredOrganConfidence:
        normalizedDeclaredOrganConfidence === null ||
        normalizedDeclaredOrganConfidence === undefined ||
        normalizedDeclaredOrganConfidence === ''
          ? null
          : Number.isFinite(Number(normalizedDeclaredOrganConfidence))
            ? Number(normalizedDeclaredOrganConfidence)
            : null
    })
  }

  if (imageEntries.length) {
    return imageEntries
  }

  const imageIds = Array.isArray(payload.imageIds)
    ? payload.imageIds.map(item => String(item || '').trim()).filter(Boolean)
    : []

  if (imageIds.length) {
    return imageIds.map((imageRef, index) => ({
      imageRef,
      inputSlotType: 'unknown',
      orderIndex: index,
      inputSlotOrder: index,
      inputSlotLabel: '',
      userDeclaredOrganType: '',
      userDeclaredOrganConfidence: null
    }))
  }

  if (payload.image) {
    return [
      {
        imageRef: String(payload.image).trim(),
        inputSlotType: 'unknown',
        orderIndex: 0,
        inputSlotOrder: 0,
        inputSlotLabel: '',
        userDeclaredOrganType: '',
        userDeclaredOrganConfidence: null
      }
    ].filter(item => item.imageRef)
  }

  return []
}

function resolveImagesFromPayload(payload = {}) {
  return resolveVisualImageInputs(payload).map(item => item.imageRef).filter(Boolean)
}

function normalizeEvidenceSourceType(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isVisualEvidenceItem(item = {}) {
  const sourceType = normalizeEvidenceSourceType(item?.sourceType || item?.source_type || '')
  if (!sourceType) return false
  if (sourceType === 'legacy_observed_symptom') return true
  return sourceType.includes('visual')
}

function stripVisualEvidenceItems(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).filter(
    item => !isVisualEvidenceItem(item)
  )
}

function normalizeRoundFromRoundId(roundId) {
  const match = String(roundId || '').match(/round_(\d+)/i)
  if (!match) return null
  return Number(match[1] || 0) || null
}

function shouldSkipPersistence(request = null) {
  const headers = normalizeHeaders(request?.headers || {})
  return String(headers['x-terminal-e2e'] || '').trim().toLowerCase() !== 'true'
}

function shouldBypassQuota(request = null, openid = '', { skipAuth = false } = {}) {
  if (skipAuth) {
    return true
  }

  const headers = normalizeHeaders(request?.headers || {})
  const appEnv = resolveRequestAppEnv(headers, request?.query || {}, request?.body || {})
  const isTerminalE2E = String(headers['x-terminal-e2e'] || '').trim().toLowerCase() === 'true'
  if (!isTerminalE2E || appEnv !== 'development') {
    return false
  }

  const normalizedOpenid = String(openid || '').trim()
  return normalizedOpenid.startsWith('anon_dev_') || normalizedOpenid.startsWith('dev_terminal_')
}

function buildLegacyHttpSuccess({ sessionId, plantId, roundResult, diagnosisText = '' }) {
  const publicRound = presentDiagnosisRoundResponse(roundResult || {}, diagnosisRoundPresenterHelpers)
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

function normalizePublicAnswers(answers = []) {
  const normalized = (Array.isArray(answers) ? answers : [])
    .map(item => {
      if (!item) return null

      const questionKey =
        fromQuestionId(item.questionId || '') ||
        String(item.questionKey || item.question_key || item.questionId || '').trim()
      const optionKey =
        fromOptionId(item.optionId || '') ||
        normalizeOptionKey(item.optionKey || item.option_key || item.answerValue || item.optionId || '')

      if (!questionKey || !optionKey) return null

      return {
        questionKey,
        optionKey
      }
    })
    .filter(Boolean)

  const deduped = new Map()
  for (const item of normalized) {
    deduped.set(item.questionKey, item)
  }
  return Array.from(deduped.values())
}

async function extractVisualSymptoms({
  sessionId,
  openid,
  imageInputs = [],
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  onText
} = {}) {
  if (!Array.isArray(imageInputs) || !imageInputs.length) {
    return {
      diagnosisText: '',
      observedSymptoms: [],
      visualCallBatchId: null,
      visualBatchTrace: null,
      aggregateResult: null
    }
  }

  return analyzeAndPersistVisualBatch({
    sessionId,
    openid,
    imageInputs,
    originVisualCallBatchId,
    supersedeSource,
    onText
  })
}

async function extractVisualSymptomsSafely({
  sessionId,
  openid,
  imageInputs = [],
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  onText
} = {}) {
  try {
    return await extractVisualSymptoms({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId,
      supersedeSource,
      onText
    })
  } catch (error) {
    console.error('diagnose-http visual extraction failed:', {
      code: String(error?.code || '').trim(),
      statusCode: Number(error?.statusCode || 0) || null,
      message: String(error?.message || error || ''),
      visualCallBatchId: String(error?.visualCallBatchId || '').trim(),
      failureSummary: Array.isArray(error?.failureSummary) ? error.failureSummary : []
    })
    throw error
  }
}

async function persistRoundResult({
  sessionId,
  openid,
  plantContext,
  response,
  round,
  image,
  description,
  skipPersistence = false
}) {
  if (skipPersistence) return

  await persistRoundRuntime({
    sessionId,
    openid,
    plantContext,
    response,
    round,
    image,
    description
  })
}

async function runStartDiagnosis({ payload, openid, skipPersistence = false, onText } = {}) {
  payload = payload || {}
  const legacyPlantId = payload.plantId || null
  const plantCatalogId = payload.plantCatalogId || payload.catalogPlantId || null
  const userPlantId = payload.userPlantId || null
  const plantId = plantCatalogId || legacyPlantId
  if (!userPlantId && !plantId) {
    throw Object.assign(new Error('缺少 userPlantId 或 plantCatalogId'), { statusCode: 400 })
  }

  const sessionId = buildSessionId()
  const imageInputs = resolveVisualImageInputs(payload)
  const images = imageInputs.map(item => item.imageRef)
  const originVisualCallBatchId =
    payload.latestVisualCallBatchId ||
    payload.visualBatchTrace?.current_visual_call_batch_id ||
    payload.visualBatchTrace?.currentVisualCallBatchId ||
    null
  let observedEvidenceSet = Array.isArray(payload.observedEvidenceSet)
    ? payload.observedEvidenceSet
    : []
  let observedSymptoms = observedEvidenceSet.length
    ? []
    : adaptObservedSymptoms(payload.observedSymptoms || [])
  let diagnosisText = ''
  let visualExtraction = null

  if (!observedSymptoms.length && imageInputs.length) {
    visualExtraction = await extractVisualSymptomsSafely({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId,
      supersedeSource: 'diagnosis_start',
      onText
    })
    diagnosisText = visualExtraction.diagnosisText
    observedSymptoms = visualExtraction?.aggregateResult
      ? []
      : adaptObservedSymptoms(visualExtraction.observedSymptoms || [])
  }

  const roundResult = await runDiagnosisRound({
    openid,
    plantId,
    userPlantId,
    observedSymptoms,
    observedEvidenceSet,
    visualAggregateResult: visualExtraction?.aggregateResult || null,
    answers: [],
    askedQuestionKeys: [],
    unknownCountByGroup: {},
    round: 1,
    stage: 'preliminary',
    sessionId
  })

  if (visualExtraction?.visualCallBatchId) {
    roundResult.latestVisualCallBatchId = visualExtraction.visualCallBatchId
  }
  if (visualExtraction?.aggregateResult) {
    roundResult.visualAggregateResult = visualExtraction.aggregateResult
  }
  if (visualExtraction?.visualBatchTrace) {
    roundResult.visualBatchTrace = visualExtraction.visualBatchTrace
  }

  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round: 1,
    image: images[0] || '',
    description: payload.description || '',
    skipPersistence
  })

  return {
    sessionId,
    userPlantId: roundResult?.plantContext?.userPlantId || userPlantId || null,
    plantId:
      roundResult?.plantContext?.userPlantId ||
      roundResult?.plantContext?.plantId ||
      plantId ||
      '',
    plantCatalogId: roundResult?.plantContext?.plantId || plantId || null,
    plantIdentityId: roundResult?.plantContext?.plantIdentityId || '',
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(
      roundResult,
      roundResult?.plantContext
    ),
    diagnosisText,
    response: roundResult
  }
}

async function runAnswerDiagnosis({ payload, openid, skipPersistence = false } = {}) {
  payload = payload || {}
  const sessionId = payload.diagnosisSessionId || payload.diagnosisId
  if (!sessionId) {
    throw Object.assign(new Error('缺少 diagnosisSessionId'), { statusCode: 400 })
  }

  const sessionState = await getSessionState(openid, sessionId)
  if (!sessionState) {
    throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
  }

  const answers = normalizePublicAnswers(payload.answers || payload.followUpAnswers || [])
  const imageInputs = resolveVisualImageInputs(payload)
  const hasAnswers = answers.length > 0
  const hasImageInputs = imageInputs.length > 0

  if (!hasAnswers && !hasImageInputs) {
    throw Object.assign(new Error('缺少 answers 或 images'), { statusCode: 400 })
  }

  if (hasAnswers && hasImageInputs) {
    throw Object.assign(new Error('follow-up 阶段答题与补图必须分开提交'), { statusCode: 400 })
  }

  const observedSymptoms = Array.isArray(sessionState.observedEvidenceSet) &&
    sessionState.observedEvidenceSet.length
    ? []
    : await getObservedSymptomsBySession(sessionId)
  const roundFromClient = normalizeRoundFromRoundId(payload.roundId)
  const expectedRound = Math.max(1, Number(sessionState.nextRound || 2) - 1)

  if (roundFromClient && roundFromClient !== expectedRound) {
    throw Object.assign(new Error('问诊轮次已失效，请使用当前轮题目重新提交'), { statusCode: 400 })
  }

  const answerRound = roundFromClient || expectedRound
  let refreshedSessionState = sessionState
  let visualExtraction = null
  let runtimeAnswers = answers
  let runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
  let runtimeAskedQuestionKeys = refreshedSessionState.askedQuestionKeys
  let runtimeUnknownCountByGroup = refreshedSessionState.unknownCountByGroup

  if (hasAnswers) {
    const ownership = await validateFollowUpAnswerOwnership(sessionId, answers, answerRound)
    if (!ownership.ok) {
      throw Object.assign(new Error('问诊题目不属于当前会话轮次'), { statusCode: 400 })
    }

    const questionKeys = Array.from(new Set(answers.map(item => item.questionKey).filter(Boolean)))
    const optionMappings = await getQuestionOptionMappings(questionKeys)
    const validPairs = new Set(
      optionMappings.map(item => `${item.questionKey}::${item.optionKey}`)
    )
    const invalidPairs = answers.filter(
      item => !validPairs.has(`${item.questionKey}::${item.optionKey}`)
    )

    if (invalidPairs.length) {
      throw Object.assign(new Error('问诊选项不属于当前问题'), { statusCode: 400 })
    }

    await markFollowUpAnswers(sessionId, answers)
    await markQueueItemsAnswered(sessionId, openid, answerRound, answers)
    refreshedSessionState = await getSessionState(openid, sessionId)
    if (!refreshedSessionState) {
      throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
    }

    runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
    runtimeAskedQuestionKeys = refreshedSessionState.askedQuestionKeys
    runtimeUnknownCountByGroup = refreshedSessionState.unknownCountByGroup
  }

  if (hasImageInputs) {
    await invalidateQueueForRound(sessionId, openid, answerRound, 'retake_branch')
    if (hasConsumedFollowUpRetakeQuota(refreshedSessionState.visualBatchTrace || null)) {
      throw Object.assign(new Error('follow-up 阶段补图次数已达上限'), { statusCode: 400 })
    }

    visualExtraction = await extractVisualSymptomsSafely({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId:
        refreshedSessionState.latestVisualCallBatchId ||
        refreshedSessionState?.plantContext?.latestVisualCallBatchId ||
        '',
      supersedeSource: 'diagnosis_followup_image'
    })

    runtimeAnswers = []
    runtimeObservedEvidenceSet = stripVisualEvidenceItems(
      refreshedSessionState.observedEvidenceSet || []
    )
    runtimeAskedQuestionKeys = []
    runtimeUnknownCountByGroup = {}
  }

  const round = answerRound + 1

  const roundResult = await runDiagnosisRound({
    openid,
    userPlantId: refreshedSessionState.userPlantId,
    plantId: refreshedSessionState.plantId,
    lockedPlantContext: refreshedSessionState.plantContext,
    observedSymptoms: hasImageInputs ? [] : observedSymptoms,
    observedEvidenceSet: runtimeObservedEvidenceSet,
    visualAggregateResult: visualExtraction?.aggregateResult || null,
    answers: runtimeAnswers,
    askedQuestionKeys: runtimeAskedQuestionKeys,
    unknownCountByGroup: runtimeUnknownCountByGroup,
    round,
    stage: 'followup',
    sessionId
  })

  if (visualExtraction?.visualCallBatchId) {
    roundResult.latestVisualCallBatchId = visualExtraction.visualCallBatchId
  }
  if (visualExtraction?.aggregateResult) {
    roundResult.visualAggregateResult = visualExtraction.aggregateResult
  }
  if (visualExtraction?.visualBatchTrace) {
    roundResult.visualBatchTrace = visualExtraction.visualBatchTrace
  }

  if (!roundResult.visualBatchTrace && refreshedSessionState.visualBatchTrace) {
    roundResult.visualBatchTrace = refreshedSessionState.visualBatchTrace
  }
  if (!roundResult.visualAggregateSummary && refreshedSessionState.visualAggregateSummary) {
    roundResult.visualAggregateSummary = refreshedSessionState.visualAggregateSummary
  }
  if (!roundResult.shadowCompareSummary && refreshedSessionState.shadowCompareSummary) {
    roundResult.shadowCompareSummary = refreshedSessionState.shadowCompareSummary
  }

  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round,
    image: '',
    description: '',
    skipPersistence
  })

  return {
    sessionId,
    userPlantId: refreshedSessionState.userPlantId || null,
    plantId: refreshedSessionState.userPlantId || refreshedSessionState.plantId,
    plantCatalogId: refreshedSessionState.plantId || null,
    plantIdentityId:
      refreshedSessionState?.plantContext?.plantIdentityId ||
      roundResult?.plantContext?.plantIdentityId ||
      '',
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(
      roundResult,
      refreshedSessionState
    ),
    diagnosisText: roundResult?.topProblem?.summary || '',
    response: roundResult
  }
}

async function ensureQuota(openid, { skipQuota = false } = {}) {
  if (skipQuota || !openid) return

  const quota = await checkAIQuota(openid, 'diagnose')
  if (!quota.allowed) {
    throw Object.assign(new Error(quota.message || '诊断配额不足'), { statusCode: quota.code || 403 })
  }
}

async function consumeQuota(openid, { skipQuota = false } = {}) {
  if (skipQuota || !openid) return

  try {
    await deductQuota(openid, 'diagnose')
  } catch (error) {
    console.warn('扣减诊断配额失败（忽略）:', error.message)
  }
}

async function ensureRefactorReady() {
  const artifacts = await getRefactorArtifacts()
  if (artifacts?.readiness?.ready) {
    return artifacts
  }

  const issues = Array.isArray(artifacts?.readiness?.blockingIssues)
    ? artifacts.readiness.blockingIssues.slice(0, 3)
    : []
  const issueText = issues.length ? ` (${issues.join('; ')})` : ''

  throw Object.assign(
    new Error(`诊断数据尚未完成 schema 对齐，请先执行 diff/backfill${issueText}`),
    { statusCode: 503 }
  )
}

async function handleDiagnosisStart(request, context, payload) {
  payload = payload || {}
  const skipAuth = isSkipAuthEnabled(payload.skipAuth)
  const userInfo = skipAuth
    ? { openid: payload.openid || '' }
    : await resolveHttpUserInfo(request.headers, payload, context)

  if (!skipAuth && !userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '请先登录', data: null })
  }

  try {
    await ensureRefactorReady()
    const skipQuota = shouldBypassQuota(request, userInfo?.openid, { skipAuth })
    await ensureQuota(userInfo?.openid, { skipQuota })

    const executed = await runStartDiagnosis({
      payload,
      openid: userInfo?.openid || '',
      skipPersistence: skipAuth && shouldSkipPersistence(request)
    })

    await consumeQuota(userInfo?.openid, { skipQuota })

    return jsonResponse(200, {
      code: 200,
      message: '诊断开始成功',
      data: presentDiagnosisRoundResponse(executed.response, diagnosisRoundPresenterHelpers)
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '诊断开始失败',
      data: null
    })
  }
}

async function handleDiagnosisAnswer(request, context, payload) {
  payload = payload || {}
  const skipAuth = isSkipAuthEnabled(payload.skipAuth)
  const userInfo = skipAuth
    ? { openid: payload.openid || '' }
    : await resolveHttpUserInfo(request.headers, payload, context)

  if (!skipAuth && !userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '请先登录', data: null })
  }

  try {
    await ensureRefactorReady()
    const executed = await runAnswerDiagnosis({
      payload,
      openid: userInfo?.openid || '',
      skipPersistence: skipAuth && shouldSkipPersistence(request)
    })

    return jsonResponse(200, {
      code: 200,
      message: '问诊提交成功',
      data: presentDiagnosisRoundResponse(executed.response, diagnosisRoundPresenterHelpers)
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '问诊提交失败',
      data: null
    })
  }
}

async function handleDiagnosisResult(request, context, query) {
  const userInfo = await resolveHttpUserInfo(request.headers, query, context)
  if (!userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '请先登录', data: null })
  }

  const result = await getResultById(userInfo.openid, {
    resultId: query.id || query.resultId || '',
    sessionId: query.sessionId || ''
  })

  if (!result) {
    return jsonResponse(404, { code: 404, message: '结果不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data: result })
}

async function handleDiagnosisHistory(request, context, query) {
  const userInfo = await resolveHttpUserInfo(request.headers, query, context)
  if (!userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '请先登录', data: null })
  }

  const data = await listDiagnosisHistory(userInfo.openid, {
    userPlantId: query.userPlantId || query.plantId || null,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 20)
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisFeedback(request, context, payload) {
  payload = payload || {}
  const userInfo = await resolveHttpUserInfo(request.headers, payload, context)
  if (!userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '请先登录', data: null })
  }

  const data = await saveDiagnosisFeedback(userInfo.openid, {
    resultId: payload.resultId || payload.diagnosisSessionId || '',
    feedback: payload.feedback || {}
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleLegacyDiagnose(request, context, payload) {
  payload = payload || {}
  const skipAuth = isSkipAuthEnabled(payload.skipAuth)
  const userInfo = skipAuth
    ? { openid: payload.openid || '' }
    : await resolveHttpUserInfo(request.headers, payload, context)

  if (!skipAuth && !userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '需要登录才能使用 AI 诊断功能', data: null })
  }

  const isFollowUp = String(payload.mode || '').toLowerCase() === 'follow_up' ||
    Array.isArray(payload.followUpAnswers)

  try {
    await ensureRefactorReady()
    const skipQuota = shouldBypassQuota(request, userInfo?.openid, { skipAuth })
    if (!isFollowUp) {
      await ensureQuota(userInfo?.openid, { skipQuota })
    }

    const executed = isFollowUp
      ? await runAnswerDiagnosis({
          payload: {
            diagnosisSessionId: payload.diagnosisId,
            roundId: payload.roundId || '',
            followUpAnswers: adaptLegacyFollowUpAnswers(payload.followUpAnswers || [])
          },
          openid: userInfo?.openid || '',
          skipPersistence: skipAuth && shouldSkipPersistence(request)
        })
      : await runStartDiagnosis({
          payload: {
            plantId: payload.plantId,
            userPlantId: payload.userPlantId,
            plantCatalogId: payload.plantCatalogId || payload.catalogPlantId,
            image: payload.image,
            images: payload.images,
            imageInputs: payload.imageInputs,
            imageIds: payload.imageIds,
            observedSymptoms: payload.observedSymptoms,
            observedEvidenceSet: payload.observedEvidenceSet,
            latestVisualCallBatchId: payload.latestVisualCallBatchId,
            visualBatchTrace: payload.visualBatchTrace,
            description: payload.description || ''
          },
          openid: userInfo?.openid || '',
          skipPersistence: skipAuth && shouldSkipPersistence(request)
        })

    if (!isFollowUp) {
      await consumeQuota(userInfo?.openid, { skipQuota })
    }

    return jsonResponse(200, buildLegacyHttpSuccess({
      sessionId: executed.sessionId,
      plantId: executed.plantId,
      roundResult: executed.response,
      diagnosisText: executed.diagnosisText
    }))
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '诊断失败',
      data: null
    })
  }
}

function createSseEmitter(sse) {
  let closed = false
  let eventId = 0

  if (typeof sse.on === 'function') {
    sse.on('close', () => {
      closed = true
    })
  }

  return {
    send(eventName, payload) {
      if (closed || sse.closed) return
      eventId += 1
      sse.send({
        event: eventName,
        id: String(eventId),
        data: JSON.stringify({
          id: String(eventId),
          event: eventName,
          ...payload
        })
      })
    },
    end() {
      if (!closed && !sse.closed) {
        sse.end()
      }
    }
  }
}

async function handleLegacyDiagnoseStream(event, context, request, payload) {
  payload = payload || {}
  const sse = context.sse?.()
  if (!sse) {
    return jsonResponse(400, { code: 400, message: '当前请求不支持 SSE', data: null })
  }

  const emitter = createSseEmitter(sse)
  emitter.send('prompt', {
    type: 'prompt',
    role: 'user',
    content: '开始诊断'
  })

  const skipAuth = isSkipAuthEnabled(payload.skipAuth)
  const userInfo = skipAuth
    ? { openid: payload.openid || '' }
    : await resolveHttpUserInfo(request.headers, payload, context)

  if (!skipAuth && !userInfo?.openid) {
    emitter.send('error', { type: 'error', code: 401, message: '需要登录才能使用 AI 诊断功能' })
    emitter.end()
    return ''
  }

  try {
    await ensureRefactorReady()
    const skipQuota = shouldBypassQuota(request, userInfo?.openid, { skipAuth })
    await ensureQuota(userInfo?.openid, { skipQuota })

    const executed = await runStartDiagnosis({
      payload: {
        plantId: payload.plantId,
        userPlantId: payload.userPlantId,
        plantCatalogId: payload.plantCatalogId || payload.catalogPlantId,
        image: payload.image,
        images: payload.images,
        imageInputs: payload.imageInputs,
        imageIds: payload.imageIds,
        observedSymptoms: payload.observedSymptoms,
        observedEvidenceSet: payload.observedEvidenceSet,
        latestVisualCallBatchId: payload.latestVisualCallBatchId,
        visualBatchTrace: payload.visualBatchTrace,
        description: payload.description || ''
      },
      openid: userInfo?.openid || '',
      skipPersistence: skipAuth && shouldSkipPersistence(request),
      onText: (chunk, fullText) => {
        emitter.send('reply', {
          type: 'reply',
          role: 'assistant',
          content: chunk,
          fullText
        })
      }
    })

    await consumeQuota(userInfo?.openid, { skipQuota })

    emitter.send('done', {
      type: 'done',
      code: 200,
      message: '诊断完成',
      fullText: executed.diagnosisText || executed.response?.topProblem?.summary || '',
      data: buildLegacyHttpSuccess({
        sessionId: executed.sessionId,
        plantId: executed.plantId,
        roundResult: executed.response,
        diagnosisText: executed.diagnosisText
      }).data
    })
    emitter.end()
    return ''
  } catch (error) {
    emitter.send('error', {
      type: 'error',
      code: error.statusCode || 500,
      message: error.message || '诊断失败'
    })
    emitter.end()
    return ''
  }
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'
  const payload = (method === 'GET' ? request.query : request.body) || {}

  try {
    if (path.includes('/health')) {
      const refactorArtifacts = await getRefactorArtifacts()
      return jsonResponse(200, {
        code: 200,
        data: {
          status: 'ok',
          timestamp: Date.now(),
          refactor: {
            hasDataDiffReport: Boolean(refactorArtifacts?.dataDiffReport),
            hasKeyAliasMap: Boolean(refactorArtifacts?.keyAliasMap),
            hasBackfillPlan: Boolean(refactorArtifacts?.backfillPlan),
            hasRepositoryOutputShape: Boolean(refactorArtifacts?.repositoryOutputShape),
            ready: Boolean(refactorArtifacts?.readiness?.ready),
            blockingIssues: Array.isArray(refactorArtifacts?.readiness?.blockingIssues)
              ? refactorArtifacts.readiness.blockingIssues
              : [],
            runtimeSchema: refactorArtifacts?.runtimeSchema || {}
          }
        }
      })
    }

    if (path.includes('/diagnosis/start')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleDiagnosisStart(request, context, payload)
    }

    if (path.includes('/diagnosis/answer')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleDiagnosisAnswer(request, context, payload)
    }

    if (path.includes('/diagnosis/result')) {
      if (method !== 'GET') return methodNotAllowed(method)
      return handleDiagnosisResult(request, context, request.query)
    }

    if (path.includes('/diagnosis/history')) {
      if (method !== 'GET') return methodNotAllowed(method)
      return handleDiagnosisHistory(request, context, request.query)
    }

    if (path.includes('/diagnosis/feedback')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleDiagnosisFeedback(request, context, payload)
    }

    if (path.includes('/stream/diagnose')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleLegacyDiagnoseStream(event, context, request, payload)
    }

    if (path.includes('/diagnose')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleLegacyDiagnose(request, context, payload)
    }

    return notFound(path)
  } catch (error) {
    console.error('diagnose-http error:', error)
    return jsonResponse(500, {
      code: 500,
      message: error.message || '服务器错误',
      data: null
    })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  const schemaEnv = resolveSchemaEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () =>
    runWithSchemaEnv(schemaEnv, () => main(event, context))
  )
}
