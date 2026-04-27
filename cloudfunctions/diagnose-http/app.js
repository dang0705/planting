'use strict'

const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('./db/schema-resolver')
const {
  adaptObservedSymptoms,
  normalizeOptionKey
} = require('./mappers/legacy-rule-adapter')
const {
  isLegacyFollowUpPayload,
  buildLegacyFollowUpPayload,
  buildLegacyStartPayload
} = require('./mappers/legacy-diagnose-request-mapper')
const {
  fromQuestionId,
  fromOptionId
} = require('./mappers/public-id-mapper')
const { runDiagnosisRound } = require('./domain/diagnosis-engine')
const { buildPublicRoundResponse: presentDiagnosisRoundResponse } = require('./presenters/diagnosis-round-presenter')
const { getQuestionOptionMappings } = require('./repositories/question-repository')
const { buildSyntheticFollowUpOptionMappings } = require('./utils/synthetic-follow-up')
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
  hasConsumedFollowUpRetakeQuota
} = require('./presenters/diagnosis-round-presenter-helpers')
const { resolveLatestVisualCallBatchId } = require('./utils/visual-batch-id')
const { buildLegacyHttpSuccess } = require('./presenters/legacy-diagnose-presenter')
const {
  resolveRequestPrincipal,
  assertAuthenticatedUser,
  assertInternalReviewAccess,
  runWithQuotaGuard
} = require('./services/request-guard')
const {
  listOutOfPoolCandidates,
  getOutOfPoolCandidate,
  getOutOfPoolCandidateImage,
  upsertOutOfPoolCandidateReview
} = require('./repositories/out-of-pool-review-repository')
const {
  disableOutOfPoolProxyMapping,
  listOutOfPoolProxyMappings,
  upsertOutOfPoolProxyMapping
} = require('./repositories/out-of-pool-proxy-mapping-repository')
const {
  listDiagnosisReviewSessions,
  getDiagnosisReviewImages,
  getDiagnosisReviewDetail,
  upsertDiagnosisBatchReviews
} = require('./repositories/diagnosis-review-repository')

function normalizeUploadCompression(value = null) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const numberFields = [
    'originalSizeBytes',
    'uploadedSizeBytes',
    'compressionRatio',
    'quality',
    'width',
    'height',
    'targetSizeBytes',
    'minimumQuality'
  ]
  const normalized = {
    source: String(value.source || '').trim(),
    compressed: Boolean(value.compressed),
    preserveImageDetails: Boolean(value.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(value.doubleConfirmedForHunyuan)
  }

  for (const field of numberFields) {
    const num = Number(value[field])
    normalized[field] = Number.isFinite(num) && num > 0 ? num : null
  }

  return normalized
}

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
    const uploadCompression = normalizeUploadCompression(
      item?.uploadCompression || item?.compression || null
    )

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
            : null,
      ...(uploadCompression ? { uploadCompression } : {})
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

function mergeClientContextFields(primary = null, fallback = null) {
  const source = primary && typeof primary === 'object' ? primary : {}
  const base = fallback && typeof fallback === 'object' ? fallback : {}
  const pickText = key => {
    const first = String(source?.[key] || '').trim()
    if (first) return first
    const second = String(base?.[key] || '').trim()
    return second || ''
  }
  const structuredImageCountSource = Number(source?.structuredImageCount || 0)
  const structuredImageCountFallback = Number(base?.structuredImageCount || 0)

  const merged = {
    source: pickText('source'),
    platform: pickText('platform'),
    reviewSourceType: pickText('reviewSourceType'),
    visualInputVersion: pickText('visualInputVersion'),
    structuredImageCount:
      structuredImageCountSource > 0
        ? structuredImageCountSource
        : structuredImageCountFallback > 0
          ? structuredImageCountFallback
          : 0,
    auditLabel: pickText('auditLabel'),
    auditFileName: pickText('auditFileName'),
    auditCaseKey: pickText('auditCaseKey')
  }

  return Object.values(merged).some(value => (typeof value === 'number' ? value > 0 : Boolean(value)))
    ? merged
    : null
}

function resolveRequestClientContext(payload = {}, fallback = null) {
  const explicitContext = {
    source: payload?.source,
    platform: payload?.platform,
    reviewSourceType: payload?.reviewSourceType,
    visualInputVersion: payload?.visualInputVersion,
    structuredImageCount: payload?.structuredImageCount,
    auditLabel: payload?.auditLabel,
    auditFileName: payload?.auditFileName,
    auditCaseKey: payload?.auditCaseKey
  }

  return mergeClientContextFields(payload?.clientContext || null, mergeClientContextFields(explicitContext, fallback))
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
  skipPersistence = false,
  clientContext = null
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
    ,
    clientContext
  })
}

async function runStartDiagnosis({ payload, openid, skipPersistence = false, onText } = {}) {
  payload = payload || {}
  const clientContext = resolveRequestClientContext(payload, null)
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
    symptomClassState: null,
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
    skipPersistence,
    clientContext
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
  const clientContext = resolveRequestClientContext(
    payload,
    sessionState?.runtimeSnapshot?.clientContext || null
  )

  if (roundFromClient && roundFromClient !== expectedRound) {
    throw Object.assign(new Error('问诊轮次已失效，请使用当前轮题目重新提交'), { statusCode: 400 })
  }

  const answerRound = roundFromClient || expectedRound
  let refreshedSessionState = sessionState
  let visualExtraction = null
  let runtimeAnswers = answers
  let runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
  let runtimeAskedQuestionKeys = refreshedSessionState.askedQuestionKeys
  let runtimeAnsweredQuestionGroupKeys = refreshedSessionState.answeredQuestionGroupKeys || []
  let runtimeUnknownCountByGroup = refreshedSessionState.unknownCountByGroup

  if (hasAnswers) {
    const ownership = await validateFollowUpAnswerOwnership(sessionId, answers, answerRound)
    if (!ownership.ok) {
      throw Object.assign(new Error('问诊题目不属于当前会话轮次'), { statusCode: 400 })
    }

    const questionKeys = Array.from(new Set(answers.map(item => item.questionKey).filter(Boolean)))
    const optionMappings = [
      ...(await getQuestionOptionMappings(questionKeys)),
      ...buildSyntheticFollowUpOptionMappings(questionKeys)
    ]
    const validPairs = new Set(
      optionMappings.map(item => `${item.questionKey}::${item.optionKey}`)
    )
    const invalidPairs = answers.filter(
      item => !validPairs.has(`${item.questionKey}::${item.optionKey}`)
    )

    if (invalidPairs.length) {
      throw Object.assign(new Error('问诊选项不属于当前问题'), { statusCode: 400 })
    }

    await markFollowUpAnswers(sessionId, answers, {
      optionMappings,
      answerRound
    })
    await markQueueItemsAnswered(sessionId, openid, answerRound, answers)
    refreshedSessionState = await getSessionState(openid, sessionId)
    if (!refreshedSessionState) {
      throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
    }

    runtimeAnswers = Array.isArray(refreshedSessionState.answeredAnswers) &&
      refreshedSessionState.answeredAnswers.length
        ? refreshedSessionState.answeredAnswers
        : answers
    runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
    runtimeAskedQuestionKeys = refreshedSessionState.askedQuestionKeys
    runtimeAnsweredQuestionGroupKeys = refreshedSessionState.answeredQuestionGroupKeys || []
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
    runtimeAnsweredQuestionGroupKeys = []
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
    visualAggregateResult:
      visualExtraction?.aggregateResult ||
      refreshedSessionState.visualAggregateResult ||
      null,
    answers: runtimeAnswers,
    askedQuestionKeys: runtimeAskedQuestionKeys,
    answeredQuestionGroupKeys: runtimeAnsweredQuestionGroupKeys,
    unknownCountByGroup: runtimeUnknownCountByGroup,
    symptomClassState: refreshedSessionState.symptomClassRuntime || null,
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
    skipPersistence,
    clientContext
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
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await ensureRefactorReady()
    const executed = await runWithQuotaGuard({
      request,
      openid: principal.userInfo?.openid || '',
      skipAuth: principal.skipAuth,
      task: async () => runStartDiagnosis({
        payload,
        openid: principal.userInfo?.openid || '',
        skipPersistence: principal.skipPersistence
      })
    })

    return jsonResponse(200, {
      code: 200,
      message: '诊断开始成功',
      data: presentDiagnosisRoundResponse(executed.response)
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
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await ensureRefactorReady()
    const executed = await runAnswerDiagnosis({
      payload,
      openid: principal.userInfo?.openid || '',
      skipPersistence: principal.skipPersistence
    })

    return jsonResponse(200, {
      code: 200,
      message: '问诊提交成功',
      data: presentDiagnosisRoundResponse(executed.response)
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

async function handleDiagnosisReviewList(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })
  const outcomeType = String(
    query?.outcomeType || query?.status || query?.outcome || 'all'
  ).trim()

  const data = await listDiagnosisReviewSessions({
    page: Number(query?.page || 1),
    pageSize: Number(query?.pageSize || 20),
    outcomeType,
    keyword: query?.keyword || '',
    sourceType: query?.sourceType || 'all'
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisReviewImages(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await getDiagnosisReviewImages({
    diagnosisSessionId:
      query?.diagnosisSessionId || query?.sessionId || query?.id || query?.resultId || '',
    sourceType: query?.sourceType || 'all'
  })

  if (!data) {
    return jsonResponse(404, { code: 404, message: '诊断图片不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisReviewDetail(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await getDiagnosisReviewDetail({
    diagnosisSessionId:
      query?.diagnosisSessionId || query?.sessionId || query?.id || query?.resultId || '',
    sourceType: query?.sourceType || 'all'
  })

  if (!data) {
    return jsonResponse(404, { code: 404, message: '诊断记录不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisReviewImportBatch(request, context, payload) {
  const principal = await resolveRequestPrincipal({ request, context, payload: payload || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await upsertDiagnosisBatchReviews({
    records: Array.isArray(payload?.records) ? payload.records : [],
    batchSource: payload?.batchSource || 'plant-sample-combination-audit'
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisFeedback(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    const data = await saveDiagnosisFeedback(principal.userInfo?.openid || '', {
      resultId: payload.resultId || payload.diagnosisSessionId || '',
      feedback: payload.feedback || {}
    })

    return jsonResponse(200, { code: 200, data })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '提交反馈失败',
      data: null
    })
  }
}

async function handleOutOfPoolCandidateList(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await listOutOfPoolCandidates({
    page: Number(query?.page || 1),
    pageSize: Number(query?.pageSize || 20),
    status: query?.status || 'all',
    keyword: query?.keyword || ''
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolCandidateImage(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await getOutOfPoolCandidateImage({
    visualNormalizedImageResultId: query?.visualNormalizedImageResultId,
    candidateIndex: Number(query?.candidateIndex || 0)
  })

  if (!data) {
    return jsonResponse(404, { code: 404, message: '池外候选图片不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolCandidateReview(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })
  assertInternalReviewAccess({ request, ...principal })

  const visualNormalizedImageResultId = String(payload.visualNormalizedImageResultId || '').trim()
  const candidateIndex = Number(payload.candidateIndex || 0)
  const reviewAction = String(payload.reviewAction || '').trim().toLowerCase()

  if (!visualNormalizedImageResultId || !Number.isFinite(candidateIndex) || candidateIndex < 1) {
    return jsonResponse(400, { code: 400, message: '缺少候选项标识', data: null })
  }

  const candidate = await getOutOfPoolCandidate({
    visualNormalizedImageResultId,
    candidateIndex
  })

  if (!candidate) {
    return jsonResponse(404, { code: 404, message: '池外候选不存在', data: null })
  }

  await upsertOutOfPoolCandidateReview({
    candidate,
    reviewAction,
    reviewedByOpenid: principal.userInfo?.openid || ''
  })

  return jsonResponse(200, {
    code: 200,
    data: {
      visualNormalizedImageResultId,
      candidateIndex,
      reviewAction
    }
  })
}

async function handleOutOfPoolProxyMappingList(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await listOutOfPoolProxyMappings({
    page: Number(query?.page || 1),
    pageSize: Number(query?.pageSize || 20),
    keyword: query?.keyword || '',
    reviewStatus: query?.reviewStatus || 'all',
    enabled: query?.enabled || 'all'
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolProxyMappingUpsert(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })
  assertInternalReviewAccess({ request, ...principal })

  const data = await upsertOutOfPoolProxyMapping({
    mappingId: payload.mappingId || '',
    targetSymptomKey: payload.targetSymptomKey || '',
    matchTerms: payload.matchTerms || [],
    rationale: payload.rationale || '',
    reviewStatus: payload.reviewStatus || 'pending',
    enabled: payload.enabled !== false && payload.enabled !== 0,
    priority: Number(payload.priority || 0),
    operatorOpenid: principal.userInfo?.openid || ''
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolProxyMappingDisable(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })
  assertInternalReviewAccess({ request, ...principal })

  const data = await disableOutOfPoolProxyMapping({
    mappingId: payload.mappingId || '',
    operatorOpenid: principal.userInfo?.openid || ''
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleLegacyDiagnose(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  const isFollowUp = isLegacyFollowUpPayload(payload)

  try {
    assertAuthenticatedUser({ ...principal, message: '需要登录才能使用 AI 诊断功能' })
    await ensureRefactorReady()

    const executed = isFollowUp
      ? await runAnswerDiagnosis({
          payload: buildLegacyFollowUpPayload(payload),
          openid: principal.userInfo?.openid || '',
          skipPersistence: principal.skipPersistence
        })
      : await runWithQuotaGuard({
          request,
          openid: principal.userInfo?.openid || '',
          skipAuth: principal.skipAuth,
          enabled: true,
          task: async () => runStartDiagnosis({
            payload: buildLegacyStartPayload(payload),
            openid: principal.userInfo?.openid || '',
            skipPersistence: principal.skipPersistence
          })
        })

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

  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '需要登录才能使用 AI 诊断功能' })
    await ensureRefactorReady()
    const executed = await runWithQuotaGuard({
      request,
      openid: principal.userInfo?.openid || '',
      skipAuth: principal.skipAuth,
      task: async () => runStartDiagnosis({
        payload: buildLegacyStartPayload(payload),
        openid: principal.userInfo?.openid || '',
        skipPersistence: principal.skipPersistence,
        onText: (chunk, fullText) => {
          emitter.send('reply', {
            type: 'reply',
            role: 'assistant',
            content: chunk,
            fullText
          })
        }
      })
    })

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

function normalizeHttpPayload(payload) {
  if (!payload) {
    return {}
  }

  if (typeof payload === 'string') {
    const raw = payload.trim()
    if (!raw) {
      return {}
    }

    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      console.warn('diagnose-http payload json parse failed:', error.message)
      return {}
    }
  }

  if (typeof payload === 'object') {
    return payload
  }

  return {}
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'
  const payload = normalizeHttpPayload(method === 'GET' ? request.query : request.body)
  console.log('diagnose-http request routing:', {
    method,
    path
  })

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

    if (path.includes('/diagnosis/review/list')) {
      if (method !== 'GET') return methodNotAllowed(method)
      return handleDiagnosisReviewList(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/images')) {
      if (method !== 'GET') return methodNotAllowed(method)
      return handleDiagnosisReviewImages(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/detail')) {
      if (
        method === 'POST' &&
        String(payload?.action || request.query?.action || '').trim() === 'importBatch'
      ) {
        return handleDiagnosisReviewImportBatch(request, context, payload)
      }
      if (method !== 'GET') return methodNotAllowed(method)
      return handleDiagnosisReviewDetail(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/import')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleDiagnosisReviewImportBatch(request, context, payload)
    }

    if (path.includes('/diagnosis/feedback')) {
      if (method !== 'POST') return methodNotAllowed(method)
      if (
        String(payload?.action || request.query?.action || '').trim() === 'importBatch'
      ) {
        return handleDiagnosisReviewImportBatch(request, context, payload)
      }
      return handleDiagnosisFeedback(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/list')) {
      if (method !== 'GET') return methodNotAllowed(method)
      return handleOutOfPoolCandidateList(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/image')) {
      if (method !== 'GET') return methodNotAllowed(method)
      return handleOutOfPoolCandidateImage(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/review')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleOutOfPoolCandidateReview(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/list')) {
      if (method !== 'GET') return methodNotAllowed(method)
      return handleOutOfPoolProxyMappingList(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/upsert')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleOutOfPoolProxyMappingUpsert(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/disable')) {
      if (method !== 'POST') return methodNotAllowed(method)
      return handleOutOfPoolProxyMappingDisable(request, context, payload)
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
