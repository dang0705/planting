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
const {
  buildPublicRoundResponse: presentDiagnosisRoundResponse,
  buildCompactAnswerRoundResponse: presentDiagnosisAnswerResponse
} = require('./presenters/diagnosis-round-presenter')
const { getQuestionOptionMappings } = require('./repositories/question-repository')
const { buildSyntheticFollowUpOptionMappings } = require('./utils/synthetic-follow-up')
const {
  buildSessionId,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  prepareAnswerRevision,
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
  upsertOutOfPoolCandidateReview,
  upsertOutOfPoolCandidateGroupReview
} = require('./repositories/out-of-pool-review-repository')
const {
  readQuestionKeyFromRationale,
  readQuestionGroupKeyFromRationale,
  readRoundFromRationale
} = require('./services/session-follow-up-service')
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

function normalizeOutOfPoolReviewMatchTerm(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

function pickQuestionKeysFromQuestionQueue(questionQueue = null) {
  const queueItems = Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : []
  return new Set(
    queueItems
      .map(item => String(item?.questionKey || '').trim())
      .filter(Boolean)
  )
}

function normalizeAnswerQuestionKey(value = '') {
  return String(value || '').trim()
}

function parseFollowUpRationale(value = '') {
  if (value && typeof value === 'object') {
    return value
  }

  const raw = String(value || '').trim()
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

function safeFireAndForget(task, label = 'async-task') {
  if (!task || typeof task.catch !== 'function') {
    return
  }

  task.catch(error => {
    console.error(`diagnose-http ${label} failed:`, error)
  })
}

function buildAskedQuestionRowsFromFollowUpRows(rows = []) {
  const askRows = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const result = []

  for (const row of askRows) {
    if (Number(row?.asked || 0) !== 1) {
      continue
    }

    const normalizedQuestionKey = normalizeAnswerQuestionKey(
      readQuestionKeyFromRationale(row?.rationale || '') || String(row?.symptom_key || '').trim()
    )
    if (!normalizedQuestionKey || seen.has(normalizedQuestionKey)) {
      continue
    }
    seen.add(normalizedQuestionKey)

    const rationale = parseFollowUpRationale(row?.rationale)
    const groupKey = readQuestionGroupKeyFromRationale(row?.rationale)
    result.push({
      questionKey: normalizedQuestionKey,
      targetSymptomKey: normalizeAnswerQuestionKey(
        rationale?.tsk ||
          rationale?.targetSymptomKey ||
          row?.target_symptom_key ||
          ''
      ),
      targetDimension: normalizeAnswerQuestionKey(
        rationale?.td ||
          rationale?.targetDimension ||
          ''
      ),
      questionGroupKey: normalizeAnswerQuestionKey(
        groupKey ||
          rationale?.questionGroupKey ||
          row?.question_group_key ||
          '__default__'
      ) || '__default__',
      routingScope: normalizeAnswerQuestionKey(
        rationale?.rs ||
          rationale?.routingScope ||
          ''
      ),
      status: String(row?.status || '').trim().toLowerCase(),
      optionKey: String(row?.answer_value || row?.answerValue || '').trim().toLowerCase()
    })
  }

  return result
}

function buildRuntimeAnswersFromFollowUpUpdates(previousAnswers = [], updatedFollowUpAnswers = []) {
  const answerMap = new Map()

  for (const item of Array.isArray(previousAnswers) ? previousAnswers : []) {
    const key = normalizeAnswerQuestionKey(item?.questionKey || '')
    if (!key) continue
    answerMap.set(key, {
      questionKey: key,
      optionKey: String(item?.optionKey || '').trim()
    })
  }

  for (const item of Array.isArray(updatedFollowUpAnswers) ? updatedFollowUpAnswers : []) {
    const key = normalizeAnswerQuestionKey(item?.questionKey || '')
    const optionKey = String(item?.optionKey || '').trim()
    if (!key || !optionKey) continue
    answerMap.set(key, {
      questionKey: key,
      optionKey: optionKey.toLowerCase()
    })
  }

  return Array.from(answerMap.values())
}

function buildRuntimeUnknownCountByGroup(previousUnknownCountByGroup = {}, updatedFollowUpAnswers = []) {
  const nextUnknownCountByGroup = {
    ...(previousUnknownCountByGroup || {})
  }

  for (const item of Array.isArray(updatedFollowUpAnswers) ? updatedFollowUpAnswers : []) {
    const groupKey = String(item?.questionGroupKey || '__default__').trim() || '__default__'
    const status = String(item?.status || '').trim().toLowerCase()

    if (groupKey === '__default__') {
      continue
    }

    nextUnknownCountByGroup[groupKey] = status === 'skipped'
      ? Number(nextUnknownCountByGroup[groupKey] || 0) + 1
      : 0
  }

  return nextUnknownCountByGroup
}

function buildOutOfPoolReviewMatchTerms(candidate = {}) {
  const rawCn = normalizeOutOfPoolReviewMatchTerm(candidate.rawVisualNameCn || candidate.raw_visual_name_cn)
  const rawEn = normalizeOutOfPoolReviewMatchTerm(candidate.rawVisualNameEn || candidate.raw_visual_name_en)
  const reasonTerms = normalizeOutOfPoolReviewMatchTerm(candidate.reason)
  const closestHint = String(
    candidate.closestSymptomKeyHint || candidate.closest_symptom_key_hint || ''
  ).trim().toLowerCase()

  const normalized = new Set()

  rawCn.forEach(item => normalized.add(item))
  rawEn.forEach(item => normalized.add(item))
  reasonTerms.forEach(item => normalized.add(item))
  if (closestHint) {
    normalized.add(closestHint)
    normalized.add(closestHint.replace(/[_\-]+/g, ' '))
    normalized.add(closestHint.replace(/[_]/g, ''))
  }

  return Array.from(normalized).filter(item => item.length > 1)
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

function normalizeRequestMode(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveNextAnswerRevision(sessionState = {}, baseAnswerRevision = null) {
  const currentRevision = Number(sessionState?.runtimeSnapshot?.answerRevision || 0)
  const baseRevision = Number(baseAnswerRevision || 0)
  return Math.max(currentRevision, Number.isFinite(baseRevision) ? baseRevision : 0) + 1
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

function emitStartVisualEvent(onVisualEvent, eventName, payload = {}) {
  if (typeof onVisualEvent !== 'function') return
  try {
    onVisualEvent(eventName, payload)
  } catch (error) {
    console.warn('diagnose-http start visual stream event ignored:', error?.message || error)
  }
}

async function extractVisualSymptoms({
  sessionId,
  openid,
  imageInputs = [],
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  onText,
  onVisualEvent,
  llmOptions = {}
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
    onText,
    onVisualEvent,
    llmOptions
  })
}

async function extractVisualSymptomsSafely({
  sessionId,
  openid,
  imageInputs = [],
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  onText,
  onVisualEvent,
  llmOptions = {}
} = {}) {
  try {
    return await extractVisualSymptoms({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId,
      supersedeSource,
      onText,
      onVisualEvent,
      llmOptions
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
  awaitPersistence = true,
  clientContext = null
}) {
  if (skipPersistence) return

  const persistencePromise = persistRoundRuntime({
    sessionId,
    openid,
    plantContext,
    response,
    round,
    image,
    description,
    clientContext
  })
  if (!awaitPersistence) {
    void persistencePromise.catch(error => {
      console.error('diagnosis-http persist round result failed:', {
        sessionId,
        round,
        message: String(error?.message || error || '')
      })
    })
    return
  }

  await persistencePromise
}

async function runStartDiagnosis({
  payload,
  openid,
  skipPersistence = false,
  onText,
  onVisualEvent
} = {}) {
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
  emitStartVisualEvent(onVisualEvent, 'visual_session_created', {
    sessionId,
    imageCount: imageInputs.length
  })
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
      onText,
      onVisualEvent
    })
    diagnosisText = visualExtraction.diagnosisText
    observedSymptoms = visualExtraction?.aggregateResult
      ? []
      : adaptObservedSymptoms(visualExtraction.observedSymptoms || [])
    emitStartVisualEvent(onVisualEvent, 'visual_extraction_complete', {
      sessionId,
      visualCallBatchId: visualExtraction?.visualCallBatchId || null,
      observedSymptomCount: Array.isArray(visualExtraction?.observedSymptoms)
        ? visualExtraction.observedSymptoms.length
        : 0,
      hasAggregateResult: Boolean(visualExtraction?.aggregateResult)
    })
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
  const requestMode = normalizeRequestMode(payload.requestMode || payload.mode || '')
  const isAnswerRevision = requestMode === 'answer_revision'
  const dirtyQuestionKey = isAnswerRevision
    ? fromQuestionId(payload.dirtyFromQuestionId || '') ||
      String(payload.dirtyFromQuestionKey || payload.dirtyQuestionKey || payload.dirtyFromQuestionId || '').trim()
    : ''
  let answerRevision = null
  let uiPatch = null

  if (!hasAnswers && !hasImageInputs) {
    throw Object.assign(new Error('缺少 answers 或 images'), { statusCode: 400 })
  }

  if (isAnswerRevision && hasImageInputs) {
    throw Object.assign(new Error('answer_revision 不支持同时提交补图'), { statusCode: 400 })
  }

  if (isAnswerRevision && !dirtyQuestionKey) {
    throw Object.assign(new Error('缺少 dirtyFromQuestionId'), { statusCode: 400 })
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

  if (!isAnswerRevision && roundFromClient && roundFromClient !== expectedRound) {
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
  const runtimeSessionFollowUpRows = Array.isArray(refreshedSessionState.followUpRows)
    ? refreshedSessionState.followUpRows
    : []
  const currentQuestionQueue = refreshedSessionState.questionQueue || null
  let runtimeAnswerOptionMappings = []
  let runtimeFollowUpRowsForRound = runtimeSessionFollowUpRows
  let runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeSessionFollowUpRows)

  if (hasAnswers) {
    const questionKeys = Array.from(new Set(answers.map(item => item.questionKey).filter(Boolean)))
    const optionMappingPromise = questionKeys.length
      ? getQuestionOptionMappings(questionKeys)
      : Promise.resolve([])
    const questionQueueKeysForValidation = Number(answerRound || 1) === Number(sessionState?.questionQueue?.roundIndex || 0)
      ? pickQuestionKeysFromQuestionQueue(sessionState.questionQueue)
      : new Set(
        runtimeSessionFollowUpRows
          .filter(row => {
            const normalizedRound = Number(readRoundFromRationale(row?.rationale || '') || 1)
            const asked = Number(row?.asked || 0) === 0
            const questionKey = readQuestionKeyFromRationale(row?.rationale || '') || String(row?.symptom_key || '').trim()
            return normalizedRound === Number(answerRound || 1) && asked && questionKey
          })
          .map(row =>
            readQuestionKeyFromRationale(row?.rationale || '') ||
            String(row?.symptom_key || '').trim()
          )
      )
    const [ownership, questionOptionMappingsFromStore] = isAnswerRevision
      ? [null, await optionMappingPromise]
      : await Promise.all([
        validateFollowUpAnswerOwnership(sessionId, answers, answerRound, {
          followUpRows: runtimeSessionFollowUpRows,
          queuedQuestionKeys: questionQueueKeysForValidation
        }),
        optionMappingPromise
      ])
    if (!isAnswerRevision) {
      if (!ownership.ok) {
        throw Object.assign(new Error('问诊题目不属于当前会话轮次'), { statusCode: 400 })
      }
    }

    const optionMappings = [
      ...questionOptionMappingsFromStore,
      ...buildSyntheticFollowUpOptionMappings(questionKeys)
    ]
    runtimeAnswerOptionMappings = optionMappings
    runtimeFollowUpRowsForRound = ownership.followUpRows || runtimeSessionFollowUpRows
    runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeFollowUpRowsForRound)
    const validPairs = new Set(
      optionMappings.map(item => `${item.questionKey}::${item.optionKey}`)
    )
    const invalidPairs = answers.filter(
      item => !validPairs.has(`${item.questionKey}::${item.optionKey}`)
    )

    if (invalidPairs.length) {
      throw Object.assign(new Error('问诊选项不属于当前问题'), { statusCode: 400 })
    }

    if (isAnswerRevision) {
      const nextAnswerRevision = resolveNextAnswerRevision(sessionState, payload.baseAnswerRevision)
      const answerRevisionBefore = Math.max(
        Number(sessionState?.runtimeSnapshot?.answerRevision || 0),
        Number(payload.baseAnswerRevision || 0)
      )
      const revision = await prepareAnswerRevision({
        sessionId,
        openid,
        answers,
        dirtyQuestionKey,
        optionMappings,
        followUpRows: runtimeSessionFollowUpRows,
        answerRevisionBefore,
        answerRevisionAfter: nextAnswerRevision
      })
      if (!revision.ok) {
        throw Object.assign(new Error('改写题目不属于当前会话'), { statusCode: 400 })
      }

      const invalidationStartRound = Number(revision.dirtyRound || 1)
      const invalidationEndRound = Number(expectedRound || 1)
      const staleRoundCount = Math.max(invalidationEndRound - invalidationStartRound + 1, 0)
      await Promise.all(
        Array.from({ length: staleRoundCount }, (_, index) => {
          const staleRound = invalidationStartRound + index
          return invalidateQueueForRound(sessionId, openid, staleRound, 'answer_revision', {
            questionQueue:
              Number(staleRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
                ? currentQuestionQueue
                : null
          })
        })
      )
      await markQueueItemsAnswered(
        sessionId,
        openid,
        revision.dirtyRound,
        revision.effectiveAnswers,
        {
          questionQueue:
            Number(revision.dirtyRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
              ? currentQuestionQueue
              : null
        }
      )
      answerRevision = nextAnswerRevision
      uiPatch = {
        keepUntilQuestionId: revision.keepUntilQuestionId,
        invalidatedFromQuestionId: revision.invalidatedFromQuestionId
      }
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
      runtimeFollowUpRowsForRound = Array.isArray(refreshedSessionState.followUpRows)
        ? refreshedSessionState.followUpRows
        : runtimeFollowUpRowsForRound
      runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeFollowUpRowsForRound)
    } else {
      const markResult = await markFollowUpAnswers(sessionId, answers, {
        optionMappings,
        answerRound,
        followUpRows: runtimeFollowUpRowsForRound,
        awaitPersistence: false
      })
      if (Array.isArray(markResult?.pendingWrites) && markResult.pendingWrites.length) {
        safeFireAndForget(Promise.all(markResult.pendingWrites), 'markFollowUpAnswers')
      }
      safeFireAndForget(
        markQueueItemsAnswered(
          sessionId,
          openid,
          answerRound,
          answers,
          {
            questionQueue:
              Number(answerRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
                ? currentQuestionQueue
                : null
          }
        ),
        'markQueueItemsAnswered'
      )
      const updatedFollowUpAnswers = Array.isArray(markResult?.updatedAnswers)
        ? markResult.updatedAnswers
        : []
      runtimeAnswers = buildRuntimeAnswersFromFollowUpUpdates(
        refreshedSessionState.answeredAnswers || [],
        updatedFollowUpAnswers
      )
      runtimeAskedQuestionKeys = Array.from(new Set([
        ...(Array.isArray(refreshedSessionState.askedQuestionKeys)
          ? refreshedSessionState.askedQuestionKeys
          : []),
        ...updatedFollowUpAnswers.map(item => String(item?.questionKey || '').trim()).filter(Boolean)
      ]))
      runtimeAnsweredQuestionGroupKeys = Array.from(new Set([
        ...(Array.isArray(refreshedSessionState.answeredQuestionGroupKeys)
          ? refreshedSessionState.answeredQuestionGroupKeys
          : []),
        ...updatedFollowUpAnswers
          .map(item => String(item?.questionGroupKey || '').trim())
          .filter(item => item && item !== '__default__')
      ]))
      runtimeUnknownCountByGroup = buildRuntimeUnknownCountByGroup(
        refreshedSessionState.unknownCountByGroup,
        updatedFollowUpAnswers
      )
      runtimeFollowUpRowsForRound = markResult?.followUpRows || runtimeFollowUpRowsForRound
      runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeFollowUpRowsForRound)
    }
  }

  if (hasImageInputs) {
    await invalidateQueueForRound(sessionId, openid, answerRound, 'retake_branch', {
      questionQueue:
        Number(answerRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
          ? currentQuestionQueue
          : null
    })
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
    runtimeAskedQuestionRows = []
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
    sessionId,
    answerOptionMappings: runtimeAnswerOptionMappings,
    storedFollowUpRows: runtimeFollowUpRowsForRound,
    preloadedAskedQuestionRows: runtimeAskedQuestionRows
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

  if (answerRevision) {
    roundResult.answerRevision = answerRevision
  }
  if (uiPatch) {
    roundResult.uiPatch = uiPatch
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
    awaitPersistence: false,
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
    response: roundResult,
    answerRevision,
    uiPatch
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

function normalizeStringList(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function pickMinimalQuestions(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item?.questionId || item?.questionKey)
    .slice(0, 1)
    .map(item => ({
      questionId: String(item?.questionId || item?.questionKey || '').trim(),
      questionKey: String(item?.questionKey || item?.questionId || '').trim(),
      targetSymptomKey: String(item?.targetSymptomKey || '').trim(),
      targetDimension: String(item?.targetDimension || '').trim(),
      questionGroupKey: String(item?.questionGroupKey || '').trim(),
      routingScope: String(item?.routingScope || '').trim(),
      questionRole: String(item?.questionRole || item?.questionCategory || '').trim(),
      questionCategory: String(item?.questionCategory || item?.questionRole || '').trim(),
      effectMode: String(item?.effectMode || '').trim(),
      defaultOptionKey: String(item?.defaultOptionKey || '').trim(),
      defaultOptionId: String(item?.defaultOptionId || '').trim(),
      uiVariant: String(item?.uiVariant || '').trim(),
      renderMode: String(item?.renderMode || '').trim(),
      text: String(item?.text || item?.questionText || '').trim(),
      helpText: String(item?.helpText || '').trim(),
      options: (Array.isArray(item?.options) ? item.options : [])
        .filter(option => option?.optionId || option?.optionKey)
        .map(option => ({
          optionId: String(option?.optionId || option?.optionKey || '').trim(),
          optionKey: String(option?.optionKey || option?.optionId || '').trim(),
          text: String(option?.text || option?.label || '').trim(),
          description: String(option?.description || option?.desc || '').trim(),
          isDefault: Boolean(option?.isDefault)
        }))
    }))
}

function pickMinimalNextSteps(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      if (typeof item === 'string') {
        const text = item.trim()
        return text ? { text } : null
      }

      const text = String(item?.text || item?.title || item?.label || '').trim()
      return text
        ? {
            text,
            type: String(item?.type || '').trim(),
            priority: Number(item?.priority || 0) || undefined
          }
        : null
    })
    .filter(Boolean)
}

function pickMinimalTextItems(items = []) {
  return normalizeStringList(
    (Array.isArray(items) ? items : []).map(item =>
      typeof item === 'string'
        ? item
        : item?.text || item?.title || item?.label || ''
    )
  )
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function buildMinimalAdviceSteps(publicResponse = {}, explanation = null) {
  const directSteps = pickMinimalNextSteps(publicResponse.nextSteps)
  const fallbackTexts = normalizeStringList([
    publicResponse.treatmentText,
    publicResponse.treatment,
    explanation?.firstAid
  ])
  const mergedTexts = normalizeStringList([
    ...directSteps.map(item => item.text),
    ...fallbackTexts
  ])

  return mergedTexts.map((text, index) => ({
    text,
    type: directSteps[index]?.type || (index >= directSteps.length ? 'fallback' : ''),
    priority: directSteps[index]?.priority
  }))
}

function buildMinimalAvoidAdvice(publicResponse = {}, explanation = null) {
  return normalizeStringList([
    ...pickMinimalTextItems(publicResponse.whatToAvoid),
    publicResponse.preventionText,
    publicResponse.prevention,
    explanation?.avoid
  ])
}

function pickMinimalFinalResult(finalResult = null) {
  if (!finalResult || typeof finalResult !== 'object') return null
  return {
    resultId: String(finalResult?.resultId || '').trim(),
    problemId: String(finalResult?.problemId || '').trim(),
    problemKey: String(finalResult?.problemKey || '').trim(),
    displayName: String(finalResult?.displayName || finalResult?.problemName || '').trim(),
    problemName: String(finalResult?.problemName || finalResult?.displayName || '').trim(),
    summary: String(finalResult?.summary || '').trim(),
    severity: String(finalResult?.severity || '').trim(),
    confidenceLevel: String(finalResult?.confidenceLevel || '').trim(),
    outcomeType: String(finalResult?.outcomeType || '').trim(),
    nonProblematicType: String(finalResult?.nonProblematicType || '').trim()
  }
}

function pickMinimalSummaryCard(summaryCard = null) {
  if (!summaryCard || typeof summaryCard !== 'object') return null
  return {
    title: String(summaryCard?.title || '').trim(),
    subtitle: String(summaryCard?.subtitle || '').trim(),
    severity: String(summaryCard?.severity || '').trim(),
    statusText: String(summaryCard?.statusText || '').trim()
  }
}

function pickMinimalVisualBatchTrace(trace = null) {
  if (!trace || typeof trace !== 'object') return null
  return {
    currentVisualCallBatchId:
      trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || null,
    originVisualCallBatchId:
      trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || null,
    supersedeTargetBatchId:
      trace?.supersedeTargetBatchId || trace?.supersede_target_batch_id || null,
    supersededByBatchId:
      trace?.supersededByBatchId || trace?.superseded_by_batch_id || null,
    supersedeApplied: Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) ? 1 : 0,
    supersedeReason: String(trace?.supersedeReason || trace?.supersede_reason || '').trim()
  }
}

function pickMinimalVisualAggregateSummary(summary = null) {
  if (!summary || typeof summary !== 'object') return null
  return {
    visualCallBatchId: summary?.visualCallBatchId || summary?.visual_call_batch_id || null,
    effectiveImageCount: Number(summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0),
    aggregateQualityGrade:
      String(summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || '').trim(),
    aggregateAnalyzability:
      String(summary?.aggregateAnalyzability || summary?.aggregate_analyzability || '').trim(),
    suggestedFollowupCapture: normalizeStringList(
      summary?.suggestedFollowupCapture || summary?.suggested_followup_capture
    ),
    admissionReadyFlag: Number(summary?.admissionReadyFlag ?? summary?.admission_ready_flag ?? 0) ? 1 : 0,
    routePrimaryAction:
      String(summary?.routePrimaryAction || summary?.route_primary_action || '').trim()
  }
}

function pickMinimalOutputEligibility(outputEligibility = null) {
  if (!outputEligibility || typeof outputEligibility !== 'object') return null
  return {
    eligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
    judgment: String(outputEligibility?.judgment || '').trim(),
    conclusionType: String(outputEligibility?.conclusionType || '').trim(),
    conclusionStatus: String(outputEligibility?.conclusionStatus || '').trim()
  }
}

function buildFrontendDiagnosisResponse(publicResponse = {}) {
  const questions = pickMinimalQuestions(publicResponse.questions || publicResponse.followUps)
  const explanation = publicResponse.explanation || publicResponse.resultExplanation || null
  const nextSteps = buildMinimalAdviceSteps(publicResponse, explanation)
  const whatToAvoid = buildMinimalAvoidAdvice(publicResponse, explanation)
  const treatmentText = normalizeText(
    publicResponse.treatmentText ||
      publicResponse.treatment ||
      explanation?.firstAid ||
      nextSteps.map(item => item.text).filter(Boolean).join('\n')
  )
  const preventionText = normalizeText(
    publicResponse.preventionText ||
      publicResponse.prevention ||
      explanation?.avoid ||
      whatToAvoid.join('\n')
  )
  return {
    diagnosisSessionId: publicResponse.diagnosisSessionId || '',
    resultId: publicResponse.resultId || '',
    roundId: publicResponse.roundId || 'round_1',
    userPlantId: publicResponse.userPlantId || null,
    plantId: publicResponse.plantId || publicResponse.userPlantId || publicResponse.plantCatalogId || '',
    plantCatalogId: publicResponse.plantCatalogId || null,
    plantIdentityId: publicResponse.plantIdentityId || '',
    latestVisualCallBatchId: publicResponse.latestVisualCallBatchId || null,
    stage: publicResponse.stage || '',
    status: publicResponse.status || publicResponse.sessionStatus || '',
    routePrimaryAction: publicResponse.routePrimaryAction || '',
    outcomeType: publicResponse.outcomeType || '',
    nonProblematicType: publicResponse.nonProblematicType || '',
    nonProblematicLabel: publicResponse.nonProblematicLabel || '',
    identityResolutionStatus: publicResponse.identityResolutionStatus || '',
    stopReason: publicResponse.stopReason || '',
    followUpRequired: Boolean(publicResponse.followUpRequired),
    questions,
    finalResult: pickMinimalFinalResult(publicResponse.finalResult),
    summaryCard: pickMinimalSummaryCard(publicResponse.summaryCard),
    explanation,
    resultExplanation: explanation,
    nextSteps,
    whatToAvoid,
    treatmentText,
    preventionText,
    careBaselineSummary: publicResponse.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(publicResponse.environmentDeviationHints)
      ? publicResponse.environmentDeviationHints
      : [],
    visualBatchTrace: pickMinimalVisualBatchTrace(publicResponse.visualBatchTrace),
    visualAggregateSummary: pickMinimalVisualAggregateSummary(publicResponse.visualAggregateSummary),
    uiHints: {
      canUploadMoreImages: Boolean(publicResponse?.uiHints?.canUploadMoreImages),
      maxQuestionsThisRound: questions.length ? 1 : 0,
      questionDisplayMode: 'single',
      answerSubmitMode: 'per_question',
      optionLayout: 'vertical',
      transition: 'swiper'
    },
    outputEligibility: pickMinimalOutputEligibility(publicResponse.outputEligibility),
    confidenceLevel: publicResponse.confidenceLevel || '',
    confidenceReasons: normalizeStringList(publicResponse.confidenceReasons),
    needHumanReview: Boolean(publicResponse.needHumanReview)
  }
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
      data: buildFrontendDiagnosisResponse(presentDiagnosisRoundResponse(executed.response))
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
    const data = buildFrontendDiagnosisResponse(presentDiagnosisAnswerResponse(executed.response))
    if (executed.answerRevision) {
      data.answerRevision = executed.answerRevision
    }
    if (executed.uiPatch) {
      data.uiPatch = executed.uiPatch
    }

    return jsonResponse(200, {
      code: 200,
      message: '问诊提交成功',
      data
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
  const groupId = String(payload.groupId || '').trim()
  const reviewAction = String(payload.reviewAction || '').trim().toLowerCase()

  if (groupId) {
    const groupReview = await upsertOutOfPoolCandidateGroupReview({
      groupId,
      reviewAction,
      reviewedByOpenid: principal.userInfo?.openid || ''
    })

    return jsonResponse(200, {
      code: 200,
      data: {
        ...groupReview,
        proxyMapping: null
      }
    })
  }

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

  let proxyMapping = null
  const closestSymptomKeyHint = String(
    candidate.closestSymptomKeyHint || candidate.closest_symptom_key_hint || ''
  ).trim()
  const matchTerms = buildOutOfPoolReviewMatchTerms(candidate)

  if (reviewAction === 'approved' && closestSymptomKeyHint && matchTerms.length) {
    proxyMapping = await upsertOutOfPoolProxyMapping({
      targetSymptomKey: closestSymptomKeyHint,
      matchTerms,
      rationale: [
        'Auto-created from approved out-of-pool candidate.',
        candidate.visualOutOfPoolReviewId || candidate.visual_out_of_pool_review_id || '',
        candidate.reason || ''
      ].filter(Boolean).join(' '),
      reviewStatus: 'audited',
      enabled: true,
      priority: 100,
      operatorOpenid: principal.userInfo?.openid || ''
    })
  }

  return jsonResponse(200, {
    code: 200,
    data: {
      visualNormalizedImageResultId,
      candidateIndex,
      reviewAction,
      proxyMapping
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
    sourceGroupId: payload.sourceGroupId || payload.groupId || '',
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

function requestWantsDiagnosisStartSse(request = {}, payload = {}) {
  const headers = request.headers || {}
  const accept = String(headers.accept || headers.Accept || '').toLowerCase()
  return (
    accept.includes('text/event-stream') ||
    payload?.streamVisualDecision === true ||
    payload?.stream_visual_decision === true
  )
}

function buildVisualProgressContent(eventName, payload = {}) {
  const decision = payload?.decision || {}
  const counts = decision?.counts || {}
  const phase = String(eventName || '').trim()
  if (phase === 'visual_session_created') {
    return '已建立诊断会话，准备分析图片。'
  }
  if (phase === 'visual_input_ready') {
    const count = Number(payload?.imageCount || 0)
    return count > 1 ? `已接收 ${count} 张图片，开始逐张视觉分析。` : '已接收图片，开始视觉分析。'
  }
  if (phase === 'visual_model_started') {
    return '视觉模型正在读取图片证据。'
  }
  if (phase === 'visual_model_complete') {
    return '视觉模型已完成图片读取，正在结构化裁决证据。'
  }
  if (phase === 'visual_decision_ready') {
    const symptomCandidates = Array.isArray(decision?.symptomCandidates)
      ? decision.symptomCandidates
      : Array.isArray(decision?.aggregatedSymptomCandidates)
        ? decision.aggregatedSymptomCandidates
        : []
    const observedSymptoms = Array.isArray(decision?.observedSymptoms)
      ? decision.observedSymptoms
      : []
    const outOfPoolSymptomCandidates = Array.isArray(decision?.outOfPoolSymptomCandidates)
      ? decision.outOfPoolSymptomCandidates
      : []
    const symptomCount = Number(
      counts.symptomCandidates ||
        symptomCandidates.length ||
        counts.observedSymptoms ||
        observedSymptoms.length ||
        0
    )
    const outOfPoolCount = Number(
      counts.outOfPoolSymptomCandidates || outOfPoolSymptomCandidates.length || 0
    )
    const primaryCandidate =
      symptomCandidates[0] || observedSymptoms[0] || outOfPoolSymptomCandidates[0] || null
    const primaryLabel = String(
      primaryCandidate?.symptomCn ||
        primaryCandidate?.rawVisualNameCn ||
        primaryCandidate?.symptomKey ||
        primaryCandidate?.rawVisualNameEn ||
        ''
    ).trim()
    const suffix = primaryLabel ? `，主要证据：${primaryLabel}` : ''
    if (symptomCount > 0 && outOfPoolCount > 0) {
      return `视觉裁决完成：发现 ${symptomCount} 个池内候选，并记录 ${outOfPoolCount} 个池外可见异常${suffix}。`
    }
    if (symptomCount > 0) {
      return `视觉裁决完成：发现 ${symptomCount} 个池内候选证据${suffix}。`
    }
    if (outOfPoolCount > 0) {
      return `视觉裁决完成：记录 ${outOfPoolCount} 个池外可见异常${suffix}。`
    }
    return '视觉裁决完成：未形成稳定的池内候选证据。'
  }
  if (phase === 'visual_persisted') {
    return '视觉裁决已记录，正在进入问诊决策。'
  }
  if (phase === 'visual_extraction_complete') {
    return '视觉证据裁决完成，正在生成下一步问诊或结果。'
  }
  return ''
}

function createVisualStreamBridge(emitter, { emitRawReply = false } = {}) {
  let lastProgressContent = ''

  function sendProgress(eventName, payload = {}) {
    const content = buildVisualProgressContent(eventName, payload)
    if (!content || content === lastProgressContent) return
    lastProgressContent = content
    emitter.send('visual_progress', {
      type: 'visual_progress',
      phase: eventName,
      content
    })
  }

  return {
    onText: (chunk, fullText) => {
      if (!emitRawReply) return
      emitter.send('reply', {
        type: 'reply',
        role: 'assistant',
        content: chunk,
        fullText
      })
    },
    onVisualEvent: (eventName, visualPayload = {}) => {
      const payload = visualPayload && typeof visualPayload === 'object' ? visualPayload : {}
      emitter.send(eventName, {
        type: eventName,
        phase: eventName,
        ...payload
      })
      sendProgress(eventName, payload)
    }
  }
}

async function handleDiagnosisStartStream(
  event,
  context,
  request,
  payload,
  { legacyPayload = false, legacyDoneData = false, emitRawReply = false } = {}
) {
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
  const streamBridge = createVisualStreamBridge(emitter, { emitRawReply })

  try {
    assertAuthenticatedUser({ ...principal, message: '需要登录才能使用 AI 诊断功能' })
    await ensureRefactorReady()
    const executed = await runWithQuotaGuard({
      request,
      openid: principal.userInfo?.openid || '',
      skipAuth: principal.skipAuth,
      task: async () => runStartDiagnosis({
        payload: legacyPayload ? buildLegacyStartPayload(payload) : payload,
        openid: principal.userInfo?.openid || '',
        skipPersistence: principal.skipPersistence,
        onText: streamBridge.onText,
        onVisualEvent: streamBridge.onVisualEvent
      })
    })
    const finalData = legacyDoneData
      ? buildLegacyHttpSuccess({
          sessionId: executed.sessionId,
          plantId: executed.plantId,
          roundResult: executed.response,
          diagnosisText: executed.diagnosisText
        }).data
      : buildFrontendDiagnosisResponse(presentDiagnosisRoundResponse(executed.response))

    emitter.send('done', {
      type: 'done',
      code: 200,
      message: '诊断完成',
      fullText: executed.diagnosisText || executed.response?.topProblem?.summary || '',
      data: finalData
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

async function handleLegacyDiagnoseStream(event, context, request, payload) {
  return handleDiagnosisStartStream(event, context, request, payload, {
    legacyPayload: true,
    legacyDoneData: true,
    emitRawReply: true
  })
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
      if (requestWantsDiagnosisStartSse(request, payload)) {
        return handleDiagnosisStartStream(event, context, request, payload)
      }
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
