import { httpRequest } from '@/http-functions/core/httpRequest'
import { isDevelopmentAppEnv } from '@/utils/runtime-env'

const DEV_H5_DIAGNOSIS_REVIEW_OPENID = 'dev_terminal_diagnosis_review_h5'
const LOCAL_DIAGNOSIS_REVIEW_PREFIX = '/__local_diagnosis_review__'
const MINI_PROGRAM_CLIENT_PLATFORMS = new Set(['wechat-mini-program', 'wechat_mp', 'mini-program'])

function isH5Runtime() {
  return typeof window !== 'undefined' && (typeof wx === 'undefined' || typeof wx?.cloud === 'undefined')
}

function shouldUseDevBypass() {
  return isH5Runtime() && (Boolean(import.meta.env.DEV) || isDevelopmentAppEnv())
}

function buildDevBypassPayload(payload = {}) {
  if (!shouldUseDevBypass()) {
    return payload
  }

  return {
    ...payload,
    skipAuth: true,
    openid: payload?.openid || DEV_H5_DIAGNOSIS_REVIEW_OPENID
  }
}

function buildQueryString(query = {}) {
  const entries = Object.entries(query).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  )
  if (!entries.length) {return ''}

  return `?${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')}`
}

function requestLocalDiagnosisReview(path, query = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${LOCAL_DIAGNOSIS_REVIEW_PREFIX}${path}${buildQueryString(query)}`,
      method: 'GET',
      success: response => resolve(response),
      fail: error => reject(error)
    })
  })
}

async function requestLocalDiagnosisReviewList(query = {}) {
  const response = await requestLocalDiagnosisReview('/list', query)
  const data = unwrapResponseEnvelope(response?.data, '读取本地诊断审计缓存失败')
  return {
    ...data,
    fallbackMode: 'local_audit_cache'
  }
}

async function requestLocalDiagnosisReviewDetail(query = {}) {
  const response = await requestLocalDiagnosisReview('/detail', query)
  const data = unwrapResponseEnvelope(response?.data, '读取本地诊断审计详情失败')
  return {
    ...data,
    fallbackMode: 'local_audit_cache'
  }
}

async function requestLocalDiagnosisReviewImages(query = {}) {
  const response = await requestLocalDiagnosisReview('/images', query)
  return unwrapResponseEnvelope(response?.data, '读取本地诊断审计图片失败')
}

function normalizeReviewSourceEvidence(value = '', reviewSourceType = 'legacy', clientPlatform = '') {
  const normalized = String(value || '').trim()
  if (normalized) {return normalized}
  if (reviewSourceType === 'batch') {return 'batch_table'}
  if (reviewSourceType === 'web') {return 'web_tagged'}
  if (MINI_PROGRAM_CLIENT_PLATFORMS.has(String(clientPlatform || '').trim().toLowerCase())) {
    return 'platform_tagged'
  }
  if (reviewSourceType === 'manual') {return 'openid_inferred_manual'}
  return 'openid_inferred_legacy'
}

function hasExplicitSummary(data = {}) {
  const rawSummary = data?.summary
  if (!rawSummary || typeof rawSummary !== 'object') {
    return false
  }
  return ['total', 'problematicCount', 'nonProblematicCount', 'uncertainCount'].some(key =>
    Object.prototype.hasOwnProperty.call(rawSummary, key)
  )
}

function hasExplicitSourceBreakdown(data = {}) {
  const rawSummary = data?.summary
  if (!rawSummary || typeof rawSummary !== 'object') {
    return false
  }
  return ['manualCount', 'batchCount', 'legacyCount'].some(key =>
    Object.prototype.hasOwnProperty.call(rawSummary, key)
  )
}

function buildNormalizedSummaryFromRaw(data = {}, fallbackSummary = {}) {
  const rawSummary = data?.summary && typeof data.summary === 'object' ? data.summary : {}
  const total = Number(
    Object.prototype.hasOwnProperty.call(rawSummary, 'total')
      ? rawSummary.total
      : data?.total || fallbackSummary.total || 0
  )
  const problematicCount = Number(rawSummary?.problematicCount || fallbackSummary.problematicCount || 0)
  const nonProblematicCount = Number(rawSummary?.nonProblematicCount || fallbackSummary.nonProblematicCount || 0)
  const uncertainCount = Number(rawSummary?.uncertainCount || fallbackSummary.uncertainCount || 0)
  const otherOutcomeCount = Number(rawSummary?.otherOutcomeCount || fallbackSummary.otherOutcomeCount || 0)
  const finalizedCount = Number(
    Object.prototype.hasOwnProperty.call(rawSummary, 'finalizedCount')
      ? rawSummary.finalizedCount
      : problematicCount + nonProblematicCount + uncertainCount
  )
  const pendingCount = Number(
    Object.prototype.hasOwnProperty.call(rawSummary, 'pendingCount')
      ? rawSummary.pendingCount
      : Math.max(0, total - finalizedCount - otherOutcomeCount)
  )

  return {
    total,
    finalizedCount,
    pendingCount,
    problematicCount,
    nonProblematicCount,
    uncertainCount,
    otherOutcomeCount,
    manualCount: Number(rawSummary?.manualCount || fallbackSummary.manualCount || 0),
    batchCount: Number(rawSummary?.batchCount || fallbackSummary.batchCount || 0),
    legacyCount: Number(rawSummary?.legacyCount || fallbackSummary.legacyCount || 0)
  }
}

function unwrapResponseEnvelope(raw, fallbackMessage = '请求失败') {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应为空')
  }

  const code = Number(raw.code ?? 200)
  if (code !== 200) {
    throw new Error(raw.message || fallbackMessage)
  }

  return raw.data ?? null
}

const listDiagnosisReviewRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/review/list',
  method: 'GET'
})

const imageDiagnosisReviewRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/review/images',
  method: 'GET'
})

const detailDiagnosisReviewRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/review/detail',
  method: 'GET'
})

export async function requestDiagnosisReviewList(query = {}) {
  try {
    const response = await listDiagnosisReviewRequester({ query: buildDevBypassPayload(query) })
    const data = unwrapResponseEnvelope(response?.data, '读取诊断记录失败')
    const normalizedData = normalizeReviewListResponse(data, query?.sourceType || 'all')
    if (shouldUseDevBypass()) {
      const localData = await requestLocalDiagnosisReviewList(query).catch(() => null)
      if (Array.isArray(localData?.items) && localData.items.length) {
        const localItemsBySessionId = new Map(
          localData.items
            .filter(item => item?.diagnosisSessionId)
            .map(item => [String(item.diagnosisSessionId).trim(), item])
        )
        return {
          ...normalizedData,
          items: normalizedData.items.map(item => {
            const sessionId = String(item?.diagnosisSessionId || '').trim()
            const localItem = localItemsBySessionId.get(sessionId)
            const previewImageRef = String(item?.previewImageRef || localItem?.previewImageRef || '').trim()
            const imageCount = Math.max(
              Number(item?.imageCount || 0),
              Number(localItem?.imageCount || 0)
            )
            return {
              ...item,
              previewImageRef,
              imageCount
            }
          }),
          fallbackMode: 'formal_review'
        }
      }
      if (!Array.isArray(data?.items) || data.items.length === 0) {
        return localData || normalizedData
      }
    }
    return {
      ...normalizedData,
      fallbackMode: 'formal_review'
    }
  } catch (error) {
    if (shouldUseDevBypass()) {
      try {
        const localData = await requestLocalDiagnosisReviewList(query)
        if (Array.isArray(localData?.items) && localData.items.length) {
          return localData
        }
      } catch {
        // Fall through to original error.
      }
    }
    throw error
  }
}

export async function requestDiagnosisReviewImages(query = {}) {
  try {
    const response = await imageDiagnosisReviewRequester({ query: buildDevBypassPayload(query) })
    const data = unwrapResponseEnvelope(response?.data, '读取诊断图片失败')
    const previewImageRefs = Array.isArray(data?.previewImageRefs) ? data.previewImageRefs : []
    if (shouldUseDevBypass() && !previewImageRefs.length) {
      try {
        const localData = await requestLocalDiagnosisReviewImages(query)
        const localPreviewImageRefs = Array.isArray(localData?.previewImageRefs)
          ? localData.previewImageRefs
          : []
        if (localPreviewImageRefs.length) {
          return localData
        }
      } catch {
        // Fall through to formal empty response.
      }
    }
    return data
  } catch (error) {
    if (shouldUseDevBypass()) {
      try {
        return await requestLocalDiagnosisReviewImages(query)
      } catch {
        // Fall through to original error.
      }
    }
    throw error
  }
}

export async function requestDiagnosisReviewDetail(query = {}) {
  try {
    const response = await detailDiagnosisReviewRequester({ query: buildDevBypassPayload(query) })
    const data = unwrapResponseEnvelope(response?.data, '读取诊断详情失败')
    return {
      ...mapHistoryDetailToReviewDetail(data, { requestedSourceType: query?.sourceType || 'all' }),
      fallbackMode: 'formal_review'
    }
  } catch (error) {
    if (shouldUseDevBypass()) {
      try {
        const data = await requestLocalDiagnosisReviewDetail(query)
        return mapHistoryDetailToReviewDetail(data, { requestedSourceType: query?.sourceType || 'all' })
      } catch {
        // Fall through to original error.
      }
    }
    throw error
  }
}

function normalizeQuestionCountSummary(questionCountSummary = null) {
  return {
    totalItems: Number(questionCountSummary?.totalItems || 0),
    activeItems: Number(questionCountSummary?.activeItems || 0),
    askedItems: Number(questionCountSummary?.askedItems || 0),
    answeredItems: Number(questionCountSummary?.answeredItems || 0),
    invalidatedItems: Number(questionCountSummary?.invalidatedItems || 0)
  }
}

function deriveQuestionCountSummaryFromFollowUps(followUpRecords = []) {
  const safeItems = Array.isArray(followUpRecords) ? followUpRecords : []

  const totalItems = safeItems.length
  const askedItems = safeItems.filter(item => Number(item?.asked || 0) === 1).length
  const answeredItems = safeItems.filter(item => {
    const status = String(item?.status || '').trim().toLowerCase()
    if (status === 'answered' || status === 'answered_or_confirmed') {return true}
    if (Number(item?.answered || 0) === 1) {return true}
    return String(item?.optionKey || '').trim() !== ''
  }).length
  const invalidatedItems = safeItems.filter(item => {
    const status = String(item?.status || '').trim().toLowerCase()
    return status === 'invalidated' || Number(item?.invalidated || 0) === 1
  }).length

  return {
    totalItems,
    activeItems: Math.max(0, askedItems - answeredItems - invalidatedItems),
    askedItems,
    answeredItems,
    invalidatedItems
  }
}

function normalizeFeedbackSummary(feedbackSummary = null) {
  const latestFeedback = feedbackSummary?.latestFeedback
  return {
    feedbackCount: Number(feedbackSummary?.feedbackCount || 0),
    hasFeedback: Number(feedbackSummary?.hasFeedback || 0) ? 1 : 0,
    latestFeedback: latestFeedback
      ? {
          isHelpful:
            latestFeedback?.isHelpful === null || latestFeedback?.isHelpful === undefined
              ? null
              : Number(latestFeedback.isHelpful) ? 1 : 0,
          isAccurate:
            latestFeedback?.isAccurate === null || latestFeedback?.isAccurate === undefined
              ? null
              : Number(latestFeedback.isAccurate) ? 1 : 0,
          note: String(latestFeedback?.note || '').trim(),
          createdAt: String(latestFeedback?.createdAt || '').trim()
        }
      : null
  }
}

function _mapHistoryItemToReviewRow(item = {}) {
  const symptomClass = item?.symptomClass && typeof item.symptomClass === 'object' ? item.symptomClass : null

  return {
    diagnosisSessionId: String(item?.diagnosisSessionId || item?.resultId || '').trim(),
    resultId: String(item?.resultId || item?.diagnosisSessionId || '').trim(),
    userPlantId: item?.userPlantId || null,
    plantCatalogId: item?.plantCatalogId || null,
    plantIdentityId: item?.plantIdentityId || '',
    latestVisualCallBatchId: item?.latestVisualCallBatchId || null,
    createdAt: item?.createdAt || '',
    updatedAt: item?.createdAt || '',
    outcomeType: item?.outcomeType || '',
    nonProblematicType: item?.nonProblematicType || '',
    nonProblematicLabel: item?.nonProblematicLabel || '',
    problemId: item?.summary?.problemId || '',
    problemKey: item?.summary?.problemId || '',
    displayName: item?.summary?.displayName || '诊断记录',
    summary: '',
    routePrimaryAction: '',
    stopReason: '',
    sessionStatus: '',
    identityResolutionStatus: '',
    followUpRound: 0,
    currentRoundIndex: 0,
    imageCount: 0,
    previewVisualRawImageRecordId: '',
    previewImageRef: '',
    hasReplayImage: 0,
    imageState: 'missing',
    reviewSourceType: 'legacy',
    clientPlatform: '',
    reviewSourceEvidence: 'openid_inferred_legacy',
    batchReviewMeta: null,
    feedbackSummary: normalizeFeedbackSummary(null),
    observedEvidenceCount: 0,
    derivedEvidenceCount: 0,
    diagnosisDirectionCount: 0,
    diagnosisDirectionLabels: [],
    symptomClass,
    questionCountSummary: normalizeQuestionCountSummary(null),
    coreSummary: {
      routePrimaryAction: '',
      stopReason: '',
      observedEvidenceCount: 0,
      derivedEvidenceCount: 0,
      diagnosisDirectionLabels: [],
      questionCountSummary: normalizeQuestionCountSummary(null)
    },
    fallbackMode: 'legacy_history'
  }
}

function buildFallbackSummary(items = []) {
  const safeItems = Array.isArray(items) ? items : []
  const problematicCount = safeItems.filter(item => item?.outcomeType === 'problematic').length
  const nonProblematicCount = safeItems.filter(item => item?.outcomeType === 'non_problematic').length
  const uncertainCount = safeItems.filter(item => item?.outcomeType === 'uncertain').length
  const finalizedCount = problematicCount + nonProblematicCount + uncertainCount
  const otherOutcomeCount = safeItems.filter(item => {
    const outcomeType = String(item?.outcomeType || '').trim().toLowerCase()
    return outcomeType && !['problematic', 'non_problematic', 'uncertain'].includes(outcomeType)
  }).length
  const pendingCount = Math.max(0, safeItems.length - finalizedCount - otherOutcomeCount)
  return {
    total: safeItems.length,
    finalizedCount,
    pendingCount,
    problematicCount,
    nonProblematicCount,
    uncertainCount,
    otherOutcomeCount,
    manualCount: safeItems.filter(item => item?.reviewSourceType === 'manual').length,
    batchCount: safeItems.filter(item => item?.reviewSourceType === 'batch').length,
    legacyCount: safeItems.filter(item => item?.reviewSourceType === 'legacy').length
  }
}

function normalizeReviewSourceType(value = '', fallback = 'legacy') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'all') {return 'all'}
  if (normalized === 'batch') {return 'batch'}
  if (normalized === 'manual') {return 'manual'}
  if (normalized === 'legacy') {return 'legacy'}
  if (normalized === 'web') {return 'web'}
  return fallback
}

function resolveNormalizedReviewSourceType({
  reviewSourceType = '',
  reviewSourceEvidence = '',
  clientPlatform = '',
  hasBatchReviewMeta = false,
  requestedSourceType = 'all'
} = {}) {
  const normalizedType = normalizeReviewSourceType(reviewSourceType, '')
  const normalizedEvidence = String(reviewSourceEvidence || '').trim().toLowerCase()
  const normalizedPlatform = String(clientPlatform || '').trim().toLowerCase()
  const requested = normalizeReviewSourceType(requestedSourceType, 'all')

  if (
    hasBatchReviewMeta ||
    normalizedType === 'batch' ||
    normalizedEvidence === 'batch_table' ||
    requested === 'batch'
  ) {
    return 'batch'
  }

  if (
    normalizedType === 'manual' &&
    (
      normalizedEvidence === 'platform_tagged' ||
      normalizedEvidence === 'openid_inferred_manual' ||
      MINI_PROGRAM_CLIENT_PLATFORMS.has(normalizedPlatform)
    )
  ) {
    return 'manual'
  }

  if (
    normalizedEvidence === 'platform_tagged' ||
    normalizedEvidence === 'openid_inferred_manual' ||
    MINI_PROGRAM_CLIENT_PLATFORMS.has(normalizedPlatform)
  ) {
    return 'manual'
  }

  return 'legacy'
}

function normalizeReviewListResponse(data = {}, sourceType = 'all') {
  const normalizedItems = (Array.isArray(data?.items) ? data.items : []).map(item => {
    const batchReviewMeta =
      item?.batchReviewMeta && typeof item.batchReviewMeta === 'object' ? item.batchReviewMeta : null
    const clientPlatform = String(item?.clientPlatform || '').trim()
    const reviewSourceType = resolveNormalizedReviewSourceType({
      reviewSourceType: item?.reviewSourceType || (batchReviewMeta ? 'batch' : ''),
      reviewSourceEvidence: item?.reviewSourceEvidence || '',
      clientPlatform,
      hasBatchReviewMeta: Boolean(batchReviewMeta),
      requestedSourceType: sourceType
    })
    const reviewSourceEvidence = normalizeReviewSourceEvidence(
      item?.reviewSourceEvidence || '',
      reviewSourceType,
      clientPlatform
    )
    return {
      ...item,
      reviewSourceType,
      clientPlatform,
      reviewSourceEvidence,
      batchReviewMeta: reviewSourceType === 'batch' ? batchReviewMeta : null
    }
  })
  const requestedSourceType = normalizeReviewSourceType(sourceType, 'all')
  const items = normalizedItems.filter(item => {
    if (requestedSourceType === 'all') {return item.reviewSourceType !== 'legacy'}
    return item.reviewSourceType === requestedSourceType
  })

  const fallbackSummary = buildFallbackSummary(normalizedItems)
  const rawSummary = buildNormalizedSummaryFromRaw(data, fallbackSummary)
  const useRawSummaryForSource =
    requestedSourceType === 'batch' ||
    requestedSourceType === 'legacy' ||
    (requestedSourceType === 'manual' && hasExplicitSourceBreakdown(data))
  const directSourceSummary = {
    total: hasExplicitSummary(data) && useRawSummaryForSource ? rawSummary.total : items.length,
    problematicCount: items.filter(item => item?.outcomeType === 'problematic').length,
    nonProblematicCount: items.filter(item => item?.outcomeType === 'non_problematic').length,
    uncertainCount: items.filter(item => item?.outcomeType === 'uncertain').length,
    otherOutcomeCount: items.filter(item => {
        const outcomeType = String(item?.outcomeType || '').trim().toLowerCase()
        return outcomeType && !['problematic', 'non_problematic', 'uncertain'].includes(outcomeType)
      }).length
  }
  directSourceSummary.finalizedCount =
    directSourceSummary.problematicCount +
    directSourceSummary.nonProblematicCount +
    directSourceSummary.uncertainCount
  directSourceSummary.pendingCount = Math.max(
    0,
    directSourceSummary.total - directSourceSummary.finalizedCount - directSourceSummary.otherOutcomeCount
  )
  const effectiveSummary =
    requestedSourceType === 'legacy'
      ? rawSummary
      : requestedSourceType === 'all'
        ? {
            ...rawSummary,
            manualCount: Number(rawSummary.manualCount || fallbackSummary.manualCount || 0),
            batchCount: Number(rawSummary.batchCount || fallbackSummary.batchCount || 0),
            legacyCount: Number(rawSummary.legacyCount || fallbackSummary.legacyCount || 0)
          }
        : {
            ...(hasExplicitSummary(data) && useRawSummaryForSource ? rawSummary : directSourceSummary)
          }
  const manualCount =
    requestedSourceType === 'manual'
      ? effectiveSummary.total
      : requestedSourceType === 'all'
        ? Number(effectiveSummary.manualCount || 0)
        : 0
  const batchCount =
    requestedSourceType === 'batch'
      ? effectiveSummary.total
      : requestedSourceType === 'all'
        ? Number(effectiveSummary.batchCount || 0)
        : 0
  const legacyCount =
    requestedSourceType === 'legacy'
      ? effectiveSummary.total
      : requestedSourceType === 'all'
        ? Number(effectiveSummary.legacyCount || 0)
        : 0

  return {
    ...data,
    items,
    total: effectiveSummary.total,
    summary: {
      total: effectiveSummary.total,
      finalizedCount: effectiveSummary.finalizedCount,
      pendingCount: effectiveSummary.pendingCount,
      problematicCount: effectiveSummary.problematicCount,
      nonProblematicCount: effectiveSummary.nonProblematicCount,
      uncertainCount: effectiveSummary.uncertainCount,
      otherOutcomeCount: effectiveSummary.otherOutcomeCount,
      manualCount,
      batchCount,
      legacyCount
    }
  }
}

function mapHistoryDetailToReviewDetail(detail = {}, options = {}) {
  const safeOptions = typeof options === 'object' && options !== null ? options : {}
  const requestedSourceType = normalizeReviewSourceType(safeOptions.requestedSourceType || 'all', 'all')
  const clientPlatform = String(detail?.clientPlatform || detail?.client_platform || '').trim()
  const followUpRecords = Array.isArray(detail?.followUpRecords)
    ? detail.followUpRecords
    : []
  const rawBatchReviewMeta =
    detail?.batchReviewMeta && typeof detail.batchReviewMeta === 'object' ? detail.batchReviewMeta : null
  const firstRoundQuestions = Array.isArray(detail?.firstRoundQuestions)
    ? detail.firstRoundQuestions
    : followUpRecords.filter(item => Number(item?.roundIndex || 1) <= 1)
  const routePrimaryAction = String(
    detail?.routePrimaryAction ||
      detail?.coreProcess?.followUp?.routePrimaryAction ||
      (detail?.finalResult?.displayName === '暂不能稳定判断' ? 'standard_flow' : '')
  ).trim()
  const stopReason = String(detail?.stopReason || detail?.coreProcess?.decision?.stopReason || '').trim()
  const questionCountSummary = normalizeQuestionCountSummary(
    detail?.questionCountSummary || detail?.coreProcess?.followUp?.questionCountSummary || null
  )
  const diagnosisDirectionLabels = (Array.isArray(detail?.coreProcess?.evidence?.diagnosisDirections)
    ? detail.coreProcess.evidence.diagnosisDirections
    : []
  )
    .map(item => String(item?.label || item?.directionKey || '').trim())
    .filter(Boolean)
  const reviewSourceType = resolveNormalizedReviewSourceType({
    reviewSourceType: String(detail?.reviewSourceType || '').trim().toLowerCase(),
    reviewSourceEvidence: String(detail?.reviewSourceEvidence || detail?.review_source_evidence || '').trim(),
    clientPlatform,
    hasBatchReviewMeta: Boolean(rawBatchReviewMeta),
    requestedSourceType
  })
  const reviewSourceEvidence = normalizeReviewSourceEvidence(
    detail?.reviewSourceEvidence || detail?.review_source_evidence || '',
    reviewSourceType,
    clientPlatform
  )
  const coreProcess = detail?.coreProcess && typeof detail.coreProcess === 'object' ? detail.coreProcess : null
  const fallbackQuestionCountSummary = deriveQuestionCountSummaryFromFollowUps
    ? deriveQuestionCountSummaryFromFollowUps(followUpRecords)
    : questionCountSummary
  const finalQuestionCountSummary =
    questionCountSummary.totalItems || questionCountSummary.askedItems || questionCountSummary.answeredItems
      ? questionCountSummary
      : fallbackQuestionCountSummary
  const symptomClass =
    coreProcess?.evidence?.symptomClass && typeof coreProcess.evidence.symptomClass === 'object'
      ? coreProcess.evidence.symptomClass
      : detail?.symptomClass && typeof detail.symptomClass === 'object'
        ? detail.symptomClass
        : null

  return {
    ...detail,
    diagnosisSessionId: String(detail?.diagnosisSessionId || detail?.resultId || '').trim(),
    resultId: String(detail?.resultId || detail?.diagnosisSessionId || '').trim(),
    displayName:
      detail?.finalResult?.displayName ||
      detail?.nonProblematicLabel ||
      (detail?.outcomeType === 'uncertain' ? '暂不能稳定判断' : '诊断记录'),
    summary:
      String(detail?.finalResult?.summary || '').trim() ||
      String(detail?.explanation?.whyItHappens || '').trim() ||
      String(detail?.aiSummary || detail?.ai_summary || '').trim(),
    sessionStatus: String(detail?.status || '').trim(),
    identityResolutionStatus: String(detail?.identityResolutionStatus || '').trim(),
    imageCount: Math.max(
      Number(detail?.imageCount || detail?.image_count || 0),
      Array.isArray(detail?.visualRawRecords) ? detail.visualRawRecords.length : 0
    ),
    previewVisualRawImageRecordId: String(
      detail?.previewVisualRawImageRecordId ||
        detail?.preview_visual_raw_image_record_id ||
        ''
    ).trim(),
    previewImageRef: String(detail?.previewImageRef || detail?.preview_image_ref || '').trim(),
    hasReplayImage: Number(detail?.hasReplayImage || detail?.has_replay_image || 0),
    imageState: String(detail?.imageState || detail?.image_state || 'missing').trim(),
    reviewSourceType,
    clientPlatform,
    reviewSourceEvidence,
    batchReviewMeta: rawBatchReviewMeta,
    feedbackSummary: normalizeFeedbackSummary(detail?.feedbackSummary),
    observedEvidenceCount: Number(
      detail?.observedEvidenceCount || detail?.coreProcess?.evidence?.observedEvidenceCount || 0
    ),
    derivedEvidenceCount: Number(
      detail?.derivedEvidenceCount || detail?.coreProcess?.evidence?.derivedEvidenceCount || 0
    ),
    diagnosisDirectionCount: Number(
      detail?.diagnosisDirectionCount || detail?.coreProcess?.evidence?.diagnosisDirectionCount || diagnosisDirectionLabels.length || 0
    ),
    diagnosisDirectionLabels,
    questionCountSummary: finalQuestionCountSummary,
    coreProcess,
    followUpRecords,
    firstRoundQuestions,
    coreSummary: {
      routePrimaryAction,
      stopReason,
      observedEvidenceCount: Number(detail?.coreSummary?.observedEvidenceCount || detail?.coreProcess?.evidence?.observedEvidenceCount || 0),
      derivedEvidenceCount: Number(detail?.coreSummary?.derivedEvidenceCount || detail?.coreProcess?.evidence?.derivedEvidenceCount || 0),
      diagnosisDirectionLabels,
      questionCountSummary: finalQuestionCountSummary
    },
    routePrimaryAction,
    stopReason,
    symptomClass,
    fallbackMode: 'legacy_result',
    imageFallbackReason: 'review_images_unavailable'
  }
}
