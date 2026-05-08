import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Resolver, lookup as systemLookup } from 'node:dns'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import uni from '@dcloudio/vite-plugin-uni'

import { defineConfig } from 'vite'
import { UnifiedViteWeappTailwindcssPlugin as uvwt } from 'weapp-tailwindcss/vite'

// https://vitejs.dev/config/
const isH5 = process.env.UNI_PLATFORM === 'h5'
const isApp = process.env.UNI_PLATFORM === 'app'
const WeappTailwindcssDisabled = isH5 || isApp
const cloudbaseEnvId = process.env.VITE_CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e'
const cloudbaseFunctionProxyPrefix = '/__tcb_functions__'
const cloudbaseFunctionProxyTarget = `https://${cloudbaseEnvId}.api.tcloudbasegateway.com`
const localDiagnosisReviewPrefix = '/__local_diagnosis_review__'
const localDiagnosisReviewStorePath = resolve(__dirname, 'tmp', 'diagnosis-review-dev-cache.json')
const miniProgramClientPlatforms = new Set(['wechat-mini-program', 'wechat_mp', 'mini-program'])
const publicDnsResolver = isH5 ? new Resolver() : null
if (publicDnsResolver) {
  publicDnsResolver.setServers(['1.1.1.1', '8.8.8.8'])
}
const cloudbaseDnsCache = new Map()
let diagnosisReviewAuditStore = null
let diagnosisReviewAuditPersistQueue = Promise.resolve()

function safeJsonParse(text = '', fallback = null) {
  if (text === null || text === undefined || text === '') {
    return fallback
  }

  if (typeof text === 'object') {
    return text
  }

  try {
    return JSON.parse(String(text))
  } catch {
    return fallback
  }
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeReviewSourceType(value = '', fallback = 'legacy') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'all') {return 'all'}
  if (normalized === 'batch') {return 'batch'}
  if (normalized === 'manual') {return 'manual'}
  if (normalized === 'legacy') {return 'legacy'}
  if (normalized === 'web') {return 'web'}
  if (fallback === 'all') {return 'all'}
  return fallback
}

function normalizeReviewSourceEvidence(value = '', reviewSourceType = 'legacy', clientPlatform = '') {
  const normalized = normalizeText(value)
  if (normalized) {return normalized}
  if (reviewSourceType === 'batch') {return 'batch_table'}
  if (reviewSourceType === 'web') {return 'web_tagged'}
  if (miniProgramClientPlatforms.has(normalizeText(clientPlatform).toLowerCase())) {
    return 'platform_tagged'
  }
  if (reviewSourceType === 'manual') {
    return 'openid_inferred_manual'
  }
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

function resolveNormalizedReviewSourceType({
  reviewSourceType = '',
  reviewSourceEvidence = '',
  clientPlatform = '',
  hasBatchReviewMeta = false,
  requestedSourceType = 'all'
} = {}) {
  const normalizedType = normalizeReviewSourceType(reviewSourceType, '')
  const normalizedEvidence = normalizeText(reviewSourceEvidence).toLowerCase()
  const normalizedPlatform = normalizeText(clientPlatform).toLowerCase()
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
      miniProgramClientPlatforms.has(normalizedPlatform)
    )
  ) {
    return 'manual'
  }

  if (
    normalizedEvidence === 'platform_tagged' ||
    normalizedEvidence === 'openid_inferred_manual' ||
    miniProgramClientPlatforms.has(normalizedPlatform)
  ) {
    return 'manual'
  }

  return 'legacy'
}

function normalizePreviewImageRef(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) {return ''}
  if (normalized === '[inline_data_url]') {return ''}
  return normalized
}

function guessImageContentType(filePath = '') {
  const extension = extname(String(filePath || '').trim()).toLowerCase()
  if (extension === '.png') {return 'image/png'}
  if (extension === '.webp') {return 'image/webp'}
  if (extension === '.gif') {return 'image/gif'}
  if (extension === '.heic') {return 'image/heic'}
  return 'image/jpeg'
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => normalizePreviewImageRef(item))
        .filter(Boolean)
    )
  )
}

async function loadDiagnosisReviewAuditStore() {
  if (diagnosisReviewAuditStore) {
    return diagnosisReviewAuditStore
  }

  try {
    const raw = await readFile(localDiagnosisReviewStorePath, 'utf8')
    const parsed = safeJsonParse(raw, {}) || {}
    diagnosisReviewAuditStore = {
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {}
    }
  } catch {
    diagnosisReviewAuditStore = {
      sessions: {}
    }
  }

  return diagnosisReviewAuditStore
}

async function buildLocalDiagnosisReviewImageData({
  diagnosisSessionId = '',
  sampleAbsolutePath = ''
} = {}) {
  const normalizedSessionId = normalizeText(diagnosisSessionId)
  const normalizedSamplePath = normalizeText(sampleAbsolutePath)
  const store = await loadDiagnosisReviewAuditStore()
  const record = normalizedSessionId ? store.sessions?.[normalizedSessionId] : null
  const previewImageRefs = uniqueStrings(record?.previewImageRefs || [])

  if (previewImageRefs.length) {
    return {
      diagnosisSessionId: normalizedSessionId,
      coverImageRef: previewImageRefs[0] || '',
      previewImageRefs,
      imageCount: previewImageRefs.length
    }
  }

  if (!normalizedSamplePath) {
    return null
  }

  try {
    const buffer = await readFile(normalizedSamplePath)
    const dataUrl = `data:${guessImageContentType(normalizedSamplePath)};base64,${buffer.toString('base64')}`
    return {
      diagnosisSessionId: normalizedSessionId,
      coverImageRef: dataUrl,
      previewImageRefs: [dataUrl],
      imageCount: 1
    }
  } catch {
    return null
  }
}

function queuePersistDiagnosisReviewAuditStore() {
  diagnosisReviewAuditPersistQueue = diagnosisReviewAuditPersistQueue
    .catch(() => {})
    .then(async () => {
      if (!diagnosisReviewAuditStore) {return}
      await mkdir(resolve(__dirname, 'tmp'), { recursive: true })
      await writeFile(
        localDiagnosisReviewStorePath,
        JSON.stringify(diagnosisReviewAuditStore, null, 2),
        'utf8'
      )
    })

  return diagnosisReviewAuditPersistQueue
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

function extractPreviewImageRefsFromPayload(payload = {}) {
  const imageInputs = Array.isArray(payload?.images)
    ? payload.images
    : Array.isArray(payload?.imageInputs)
      ? payload.imageInputs
      : []

  const structuredRefs = imageInputs
    .map(item =>
      normalizePreviewImageRef(
        item?.imageRef || item?.imageUrl || item?.image || item?.url || item?.imageId || ''
      )
    )
    .filter(Boolean)

  const imageIds = Array.isArray(payload?.imageIds)
    ? payload.imageIds.map(item => normalizePreviewImageRef(item)).filter(Boolean)
    : []

  const singleImage = normalizePreviewImageRef(payload?.image || '')

  return uniqueStrings([
    ...structuredRefs,
    ...imageIds,
    ...(singleImage ? [singleImage] : [])
  ])
}

function normalizeQuestionCountSummary(summary = null) {
  return {
    totalItems: Number(summary?.totalItems || 0),
    activeItems: Number(summary?.activeItems || 0),
    askedItems: Number(summary?.askedItems || 0),
    answeredItems: Number(summary?.answeredItems || 0),
    invalidatedItems: Number(summary?.invalidatedItems || 0)
  }
}

function resolveDisplayName(detail = {}) {
  const outcomeType = normalizeText(detail?.outcomeType || '')
  if (outcomeType === 'non_problematic') {
    return (
      normalizeText(detail?.nonProblematicLabel || '') ||
      normalizeText(detail?.finalResult?.displayName || '') ||
      '暂未见明显问题'
    )
  }

  if (outcomeType === 'uncertain') {
    return '暂不能稳定判断'
  }

  return (
    normalizeText(detail?.displayName || '') ||
    normalizeText(detail?.finalResult?.displayName || '') ||
    normalizeText(detail?.problemKey || '') ||
    '诊断记录'
  )
}

function resolveSummary(detail = {}) {
  return (
    normalizeText(detail?.summary || '') ||
    normalizeText(detail?.finalResult?.summary || '') ||
    normalizeText(detail?.explanation?.whyItHappens || '')
  )
}

function resolveQuestionCountSummary(detail = {}) {
  return normalizeQuestionCountSummary(
    detail?.questionCountSummary ||
      detail?.coreSummary?.questionCountSummary ||
      detail?.coreProcess?.followUp?.questionCountSummary ||
      detail?.questionQueue?.questionCountSummary ||
      null
  )
}

function resolveDiagnosisDirectionLabels(detail = {}) {
  const directionItems = Array.isArray(detail?.diagnosisDirectionLabels)
    ? detail.diagnosisDirectionLabels
    : Array.isArray(detail?.coreProcess?.evidence?.diagnosisDirections)
      ? detail.coreProcess.evidence.diagnosisDirections.map(item => item?.label || item?.directionKey || '')
      : []

  return uniqueStrings(directionItems)
}

function mapAuditRecordToListItem(record = {}) {
  const detail = record.detail && typeof record.detail === 'object' ? record.detail : {}
  const clientPlatform = normalizeText(
    detail?.clientPlatform || detail?.clientContext?.platform || record.clientPlatform || ''
  )
  const reviewSourceType = resolveNormalizedReviewSourceType({
    reviewSourceType: detail?.reviewSourceType || record.reviewSourceType || (detail?.batchReviewMeta ? 'batch' : ''),
    reviewSourceEvidence: detail?.reviewSourceEvidence || record.reviewSourceEvidence || '',
    clientPlatform,
    hasBatchReviewMeta: Boolean(detail?.batchReviewMeta),
    requestedSourceType: 'all'
  })
  const reviewSourceEvidence = normalizeReviewSourceEvidence(
    detail?.reviewSourceEvidence || record.reviewSourceEvidence || '',
    reviewSourceType,
    clientPlatform
  )
  const questionCountSummary = resolveQuestionCountSummary(detail)
  const diagnosisDirectionLabels = resolveDiagnosisDirectionLabels(detail)
  const observedEvidenceCount = Number(
    detail?.observedEvidenceCount ||
      detail?.coreSummary?.observedEvidenceCount ||
      detail?.coreProcess?.evidence?.observedEvidenceCount ||
      0
  )
  const derivedEvidenceCount = Number(
    detail?.derivedEvidenceCount ||
      detail?.coreSummary?.derivedEvidenceCount ||
      detail?.coreProcess?.evidence?.derivedEvidenceCount ||
      0
  )

  return {
    diagnosisSessionId: record.diagnosisSessionId || '',
    resultId: normalizeText(detail?.resultId || ''),
    userPlantId: detail?.userPlantId || null,
    plantCatalogId: detail?.plantCatalogId || null,
    plantIdentityId: normalizeText(detail?.plantIdentityId || ''),
    latestVisualCallBatchId:
      normalizeText(detail?.latestVisualCallBatchId || '') || normalizeText(record.latestVisualCallBatchId || ''),
    createdAt: normalizeText(record.createdAt || detail?.createdAt || ''),
    updatedAt: normalizeText(record.updatedAt || detail?.updatedAt || ''),
    outcomeType: normalizeText(detail?.outcomeType || record.outcomeType || ''),
    nonProblematicType: normalizeText(detail?.nonProblematicType || ''),
    nonProblematicLabel: normalizeText(detail?.nonProblematicLabel || ''),
    problemId: normalizeText(detail?.problemId || ''),
    problemKey: normalizeText(detail?.problemKey || ''),
    displayName: resolveDisplayName(detail),
    summary: resolveSummary(detail),
    routePrimaryAction: normalizeText(
      detail?.routePrimaryAction || detail?.coreSummary?.routePrimaryAction || detail?.coreProcess?.decision?.routePrimaryAction || ''
    ),
    stopReason: normalizeText(
      detail?.stopReason || detail?.coreSummary?.stopReason || detail?.coreProcess?.decision?.stopReason || ''
    ),
    sessionStatus: normalizeText(detail?.status || detail?.sessionStatus || ''),
    identityResolutionStatus: normalizeText(detail?.identityResolutionStatus || ''),
    followUpRound: Number(detail?.followUpRound || 0),
    currentRoundIndex: Number(detail?.currentRoundIndex || 0),
    imageCount: Math.max(
      Number(detail?.imageCount || 0),
      Number(record.imageCount || 0),
      Array.isArray(record.previewImageRefs) ? record.previewImageRefs.length : 0
    ),
    previewVisualRawImageRecordId: '',
    previewImageRef: normalizePreviewImageRef(record.coverImageRef || record.previewImageRefs?.[0] || ''),
    hasReplayImage: Number((record.previewImageRefs || []).length > 0),
    imageState: Array.isArray(record.previewImageRefs) && record.previewImageRefs.length ? 'replay' : 'missing',
    observedEvidenceCount,
    derivedEvidenceCount,
    reviewSourceType,
    clientPlatform,
    reviewSourceEvidence,
    diagnosisDirectionCount: diagnosisDirectionLabels.length,
    diagnosisDirectionLabels,
    questionCountSummary,
    coreSummary: {
      routePrimaryAction: normalizeText(
        detail?.routePrimaryAction || detail?.coreSummary?.routePrimaryAction || detail?.coreProcess?.decision?.routePrimaryAction || ''
      ),
      stopReason: normalizeText(
        detail?.stopReason || detail?.coreSummary?.stopReason || detail?.coreProcess?.decision?.stopReason || ''
      ),
      observedEvidenceCount,
      derivedEvidenceCount,
      diagnosisDirectionLabels,
      questionCountSummary
    }
  }
}

function buildLocalDiagnosisReviewSummary(items = []) {
  const safeItems = Array.isArray(items) ? items : []
  const problematicCount = safeItems.filter(item => item?.outcomeType === 'problematic').length
  const nonProblematicCount = safeItems.filter(item => item?.outcomeType === 'non_problematic').length
  const uncertainCount = safeItems.filter(item => item?.outcomeType === 'uncertain').length
  const finalizedCount = problematicCount + nonProblematicCount + uncertainCount
  const otherOutcomeCount = safeItems.filter(item => {
    const outcomeType = normalizeText(item?.outcomeType || '').toLowerCase()
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

function normalizeReviewListEnvelopeData(data = {}, fallbackSourceType = 'all') {
  const normalizedItems = (Array.isArray(data?.items) ? data.items : []).map(item => {
    const batchReviewMeta =
      item?.batchReviewMeta && typeof item.batchReviewMeta === 'object' ? item.batchReviewMeta : null
    const clientPlatform = normalizeText(item?.clientPlatform || '')
    const reviewSourceType = resolveNormalizedReviewSourceType({
      reviewSourceType: item?.reviewSourceType || (batchReviewMeta ? 'batch' : ''),
      reviewSourceEvidence: item?.reviewSourceEvidence || '',
      clientPlatform,
      hasBatchReviewMeta: Boolean(batchReviewMeta),
      requestedSourceType: fallbackSourceType
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
  const requestedSourceType = normalizeReviewSourceType(fallbackSourceType, 'all')
  const items = normalizedItems.filter(item => {
    if (requestedSourceType === 'all') {return item.reviewSourceType !== 'legacy'}
    return item.reviewSourceType === requestedSourceType
  })

  const fallbackSummary = buildLocalDiagnosisReviewSummary(normalizedItems)
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
        const outcomeType = normalizeText(item?.outcomeType || '').toLowerCase()
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

async function recordDiagnosisAuditEvent({ relativePath = '', requestBody = undefined, responseBody = '' } = {}) {
  const routePath = String(relativePath || '').split('?')[0]
  if (
    !routePath.includes('/diagnosis/start') &&
    !routePath.includes('/diagnosis/answer') &&
    !routePath.includes('/diagnosis/result')
  ) {
    return
  }

  const envelope = safeJsonParse(responseBody, null)
  const detail = envelope?.code === 200 && envelope?.data && typeof envelope.data === 'object'
    ? envelope.data
    : null
  if (!detail) {return}

  const diagnosisSessionId = normalizeText(
    detail?.diagnosisSessionId || detail?.sessionId || detail?.resultId || ''
  )
  if (!diagnosisSessionId) {return}

  const requestPayload = requestBody
    ? safeJsonParse(Buffer.isBuffer(requestBody) ? requestBody.toString('utf8') : String(requestBody), {})
    : {}
  const requestPreviewImageRefs = extractPreviewImageRefsFromPayload(requestPayload)
  const detailPreviewImageRefs = uniqueStrings(
    Array.isArray(detail?.previewImageRefs) ? detail.previewImageRefs : []
  )

  const store = await loadDiagnosisReviewAuditStore()
  const currentRecord =
    store.sessions[diagnosisSessionId] && typeof store.sessions[diagnosisSessionId] === 'object'
      ? store.sessions[diagnosisSessionId]
      : { diagnosisSessionId }

  const mergedPreviewImageRefs = uniqueStrings([
    ...(Array.isArray(currentRecord.previewImageRefs) ? currentRecord.previewImageRefs : []),
    ...requestPreviewImageRefs,
    ...detailPreviewImageRefs
  ])

  store.sessions[diagnosisSessionId] = {
    ...currentRecord,
    diagnosisSessionId,
    createdAt:
      normalizeText(currentRecord.createdAt || '') ||
      normalizeText(detail?.createdAt || '') ||
      new Date().toISOString(),
    updatedAt: normalizeText(detail?.updatedAt || '') || new Date().toISOString(),
    latestVisualCallBatchId:
      normalizeText(detail?.latestVisualCallBatchId || '') ||
      normalizeText(currentRecord.latestVisualCallBatchId || ''),
    outcomeType: normalizeText(detail?.outcomeType || currentRecord.outcomeType || ''),
    previewImageRefs: mergedPreviewImageRefs,
    coverImageRef: mergedPreviewImageRefs[0] || '',
    imageCount: Math.max(
      Number(currentRecord.imageCount || 0),
      Number(detail?.imageCount || 0),
      mergedPreviewImageRefs.length
    ),
    detail
  }

  await queuePersistDiagnosisReviewAuditStore()
}

function writeJsonResponse(res, statusCode = 200, payload = {}) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function handleLocalDiagnosisReviewRequest(req, res) {
  const url = new URL(req.url || '', 'http://localhost')
  const pathname = String(url.pathname || '').trim()
  const store = await loadDiagnosisReviewAuditStore()
  const records = Object.values(store.sessions || {})
    .filter(item => item && typeof item === 'object')
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || '') || 0
      const rightTime = Date.parse(right.updatedAt || right.createdAt || '') || 0
      return rightTime - leftTime
    })

  if (pathname === `${localDiagnosisReviewPrefix}/list`) {
    const outcomeType = normalizeText(url.searchParams.get('outcomeType') || 'all').toLowerCase()
    const sourceType = normalizeReviewSourceType(
      url.searchParams.get('sourceType') || 'all',
      'all'
    )
    const keyword = normalizeText(url.searchParams.get('keyword') || '').toLowerCase()
    const page = Math.max(1, Number(url.searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 20)))

    const filtered = records.filter(record => {
      const item = mapAuditRecordToListItem(record)
      if (sourceType === 'all') {
        return item.reviewSourceType !== 'legacy'
      }
      if (item.reviewSourceType !== sourceType) {
        return false
      }
      if (outcomeType && outcomeType !== 'all' && item.outcomeType !== outcomeType) {
        return false
      }
      if (!keyword) {
        return true
      }

      return [
        item.diagnosisSessionId,
        item.latestVisualCallBatchId,
        item.displayName,
        item.problemKey,
        item.summary
      ]
        .join('\n')
        .toLowerCase()
        .includes(keyword)
    })

    const offset = (page - 1) * pageSize
    const items = filtered.slice(offset, offset + pageSize).map(mapAuditRecordToListItem)

    writeJsonResponse(res, 200, {
      code: 200,
      data: {
        items,
        page,
        pageSize,
        total: filtered.length,
        hasMore: offset + items.length < filtered.length,
        summary: buildLocalDiagnosisReviewSummary(filtered.map(mapAuditRecordToListItem))
      }
    })
    return
  }

  if (pathname === `${localDiagnosisReviewPrefix}/detail`) {
    const diagnosisSessionId = normalizeText(url.searchParams.get('diagnosisSessionId') || '')
    const record = diagnosisSessionId ? store.sessions?.[diagnosisSessionId] : null
    if (!record?.detail) {
      writeJsonResponse(res, 404, { code: 404, message: '本地审计缓存中不存在该诊断详情', data: null })
      return
    }

    writeJsonResponse(res, 200, {
      code: 200,
      data: record.detail
    })
    return
  }

  if (pathname === `${localDiagnosisReviewPrefix}/images`) {
    const diagnosisSessionId = normalizeText(url.searchParams.get('diagnosisSessionId') || '')
    const sampleAbsolutePath = normalizeText(url.searchParams.get('sampleAbsolutePath') || '')
    const imageData = await buildLocalDiagnosisReviewImageData({
      diagnosisSessionId,
      sampleAbsolutePath
    })
    if (!imageData) {
      writeJsonResponse(res, 404, { code: 404, message: '本地审计缓存中不存在该诊断图片', data: null })
      return
    }

    writeJsonResponse(res, 200, {
      code: 200,
      data: imageData
    })
    return
  }

  writeJsonResponse(res, 404, { code: 404, message: '本地诊断审计接口不存在', data: null })
}

async function resolveCloudbaseHostname(hostname = '') {
  const normalizedHostname = String(hostname || '').trim()
  if (!normalizedHostname) {
    throw new Error('cloudbase hostname is empty')
  }

  const cachedIp = cloudbaseDnsCache.get(normalizedHostname)
  if (cachedIp) {
    return cachedIp
  }

  if (publicDnsResolver) {
    try {
      const resolved = await new Promise((resolveAddresses, rejectAddresses) => {
        publicDnsResolver.resolve4(normalizedHostname, (error, addresses) => {
          if (error) {
            rejectAddresses(error)
            return
          }
          resolveAddresses(addresses)
        })
      })
      const ip = Array.isArray(resolved) ? String(resolved[0] || '').trim() : ''
      if (ip) {
        cloudbaseDnsCache.set(normalizedHostname, ip)
        return ip
      }
    } catch {
      // Fall through to system resolver when public DNS is unavailable.
    }
  }

  const systemIp = await new Promise(resolveAddress => {
    systemLookup(normalizedHostname, { family: 4 }, (error, address) => {
      if (error || !address) {
        resolveAddress('')
        return
      }
      resolveAddress(String(address || '').trim())
    })
  })

  if (!systemIp) {
    throw new Error(`dns resolve failed for ${normalizedHostname}`)
  }

  cloudbaseDnsCache.set(normalizedHostname, systemIp)
  return systemIp
}

function runCurlRequest(args = [], body = undefined) {
  return new Promise((resolveRequest, rejectRequest) => {
    const child = spawn('curl', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const stdoutChunks = []
    const stderrChunks = []

    child.stdout.on('data', chunk => stdoutChunks.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderrChunks.push(Buffer.from(chunk)))
    child.on('error', rejectRequest)
    child.on('close', code => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      if (code !== 0) {
        rejectRequest(new Error(stderr.trim() || `curl exited with code ${code}`))
        return
      }

      resolveRequest(stdout)
    })

    if (body !== undefined) {
      child.stdin.write(body)
    }
    child.stdin.end()
  })
}

function wait(ms = 0) {
  return new Promise(resolveWait => {
    setTimeout(resolveWait, Math.max(0, Number(ms || 0)))
  })
}

function parseCurlHttpResponse(rawOutput = '') {
  const text = String(rawOutput || '')
  const separatorIndex = text.indexOf('\r\n\r\n') >= 0 ? text.indexOf('\r\n\r\n') : text.indexOf('\n\n')
  if (separatorIndex < 0) {
    throw new Error('Local dev proxy received malformed curl response')
  }

  const separatorLength = text.includes('\r\n\r\n') ? 4 : 2
  const headerText = text.slice(0, separatorIndex)
  const bodyText = text.slice(separatorIndex + separatorLength)
  const headerLines = headerText
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean)

  const statusLine = headerLines.shift() || ''
  const statusMatch = statusLine.match(/^HTTP\/\d+(?:\.\d+)?\s+(\d{3})/)
  const status = Number(statusMatch?.[1] || 0)
  const headers = {}

  headerLines.forEach(line => {
    const separator = line.indexOf(':')
    if (separator <= 0) {return}
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (!key || !value) {return}
    headers[key] = value
  })

  return {
    status,
    headers,
    body: bodyText
  }
}

async function requestWithDnsFallback(targetUrl, { method = 'GET', headers = {}, body = undefined } = {}) {
  const url = new URL(targetUrl)
  const hostname = String(url.hostname || '').trim()
  const resolvedIp = await resolveCloudbaseHostname(hostname)
  const curlArgs = [
    '-sS',
    '--connect-timeout',
    '10',
    '--max-time',
    '30',
    '--resolve',
    `${hostname}:${Number(url.port || 443)}:${resolvedIp}`,
    '-X',
    String(method || 'GET').toUpperCase(),
    '-D',
    '-',
    '-o',
    '-'
  ]

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    curlArgs.push('-H', `${key}: ${value}`)
  })

  if (body !== undefined) {
    curlArgs.push('--data-binary', '@-')
  }

  curlArgs.push(targetUrl)

  const rawOutput = await runCurlRequest(curlArgs, body)
  return parseCurlHttpResponse(rawOutput)
}

function createCloudbaseDevProxyPlugin() {
  if (!isH5) {
    return null
  }

  const deviceId = `vite-h5-dev-proxy-${randomUUID()}`
  let cachedAccessToken = ''

  async function signInAnonymously() {
    const response = await requestWithDnsFallback(`${cloudbaseFunctionProxyTarget}/auth/v1/signin/anonymously`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId
      },
      body: '{}'
    })
    const payload = JSON.parse(String(response.body || '').trim() || 'null')
    if (response.status < 200 || response.status >= 300 || !payload?.access_token) {
      throw new Error(
        `H5 dev proxy anonymous sign-in failed: HTTP ${response.status} ${JSON.stringify(payload || {})}`
      )
    }

    cachedAccessToken = String(payload.access_token || '')
    return cachedAccessToken
  }

  async function getAnonymousAccessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && cachedAccessToken) {
      return cachedAccessToken
    }

    return signInAnonymously()
  }

  async function readRequestBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return undefined
    }

    return new Promise((resolveBody, rejectBody) => {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        if (!chunks.length) {
          resolveBody(undefined)
          return
        }

        resolveBody(Buffer.concat(chunks))
      })
      req.on('error', rejectBody)
    })
  }

  async function forwardCloudbaseFunctionRequest(
    req,
    res,
    { forceRefreshToken = false, requestBody = undefined } = {}
  ) {
    const relativePath = req.url.slice(cloudbaseFunctionProxyPrefix.length)
    const relativeUrl = new URL(`http://localhost${relativePath}`)
    const requestedSourceType = normalizeReviewSourceType(
      relativeUrl.searchParams.get('sourceType') || 'all',
      'all'
    )
    const forwardedRelativePath = `${relativeUrl.pathname}${relativeUrl.search}`
    const targetUrl = `${cloudbaseFunctionProxyTarget}/v1/functions${forwardedRelativePath}`
    const body = requestBody === undefined ? await readRequestBody(req) : requestBody
    const accessToken = await getAnonymousAccessToken({ forceRefresh: forceRefreshToken })
    const headers = {
      Authorization: `Bearer ${accessToken}`
    }

    Object.entries(req.headers || {}).forEach(([key, value]) => {
      if (!value) {return}
      if (['host', 'connection', 'content-length'].includes(String(key || '').toLowerCase())) {
        return
      }
      headers[key] = value
    })

    const response = await requestWithDnsFallback(targetUrl, {
      method: req.method || 'GET',
      headers,
      body
    })

    if (response.status === 401 && !forceRefreshToken) {
      return forwardCloudbaseFunctionRequest(req, res, {
        forceRefreshToken: true,
        requestBody: body
      })
    }

    let responseBody = String(response.body || '')
    if (relativePath.includes('/diagnosis/review/list')) {
      try {
        const parsed = safeJsonParse(responseBody, null)
        if (parsed?.code === 200 && parsed?.data && typeof parsed.data === 'object') {
          parsed.data = normalizeReviewListEnvelopeData(parsed.data, requestedSourceType)
          responseBody = JSON.stringify(parsed)
        }
      } catch (error) {
        console.warn('Failed to normalize diagnosis review list response:', error?.message || error)
      }
    }

    if (relativePath.includes('/diagnosis/review/images')) {
      try {
        const parsed = safeJsonParse(responseBody, null)
        const hasPreviewImageRefs = Array.isArray(parsed?.data?.previewImageRefs) && parsed.data.previewImageRefs.length
        if (parsed?.code === 200 && !hasPreviewImageRefs) {
          const fallbackImageData = await buildLocalDiagnosisReviewImageData({
            diagnosisSessionId: relativeUrl.searchParams.get('diagnosisSessionId') || '',
            sampleAbsolutePath: relativeUrl.searchParams.get('sampleAbsolutePath') || ''
          })
          if (fallbackImageData) {
            parsed.data = fallbackImageData
            responseBody = JSON.stringify(parsed)
          }
        }
      } catch (error) {
        console.warn('Failed to enrich diagnosis review image response:', error?.message || error)
      }
    }

    if (response.status >= 200 && response.status < 300) {
      try {
        await recordDiagnosisAuditEvent({
          relativePath,
          requestBody: body,
          responseBody
        })
      } catch (error) {
        console.warn('Failed to record local diagnosis audit event:', error?.message || error)
      }
    }

    res.statusCode = response.status
    Object.entries(response.headers || {}).forEach(([key, value]) => {
      if (key.toLowerCase() === 'transfer-encoding') {
        return
      }
      if (key.toLowerCase() === 'content-length') {
        return
      }
      if (value !== undefined) {
        res.setHeader(key, value)
      }
    })
    res.end(responseBody)
  }

  return {
    name: 'cloudbase-h5-dev-function-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith(localDiagnosisReviewPrefix)) {
          try {
            await handleLocalDiagnosisReviewRequest(req, res)
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                code: 'LOCAL_DIAGNOSIS_REVIEW_FAILED',
                message: String(error?.message || error || 'Local diagnosis review failed')
              })
            )
          }
          return
        }

        if (!req.url?.startsWith(cloudbaseFunctionProxyPrefix)) {
          next()
          return
        }

        const requestBody = await readRequestBody(req)

        try {
          await forwardCloudbaseFunctionRequest(req, res, { requestBody })
        } catch (error) {
          try {
            cachedAccessToken = ''
            await wait(180)
            await forwardCloudbaseFunctionRequest(req, res, {
              forceRefreshToken: true,
              requestBody
            })
          } catch (retryError) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                code: 'LOCAL_DEV_PROXY_FAILED',
                message: String(retryError?.message || retryError || error?.message || error || 'Local dev proxy failed')
              })
            )
          }
        }
      })
    }
  }
}

const cloudbaseDevProxyPlugin = createCloudbaseDevProxyPlugin()

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
  },
  css: {
    postcss: {
      plugins: [require('tailwindcss')]
    }
  },
  plugins: [
    uni(),
    ...(cloudbaseDevProxyPlugin ? [cloudbaseDevProxyPlugin] : []),
    uvwt({
      disabled: WeappTailwindcssDisabled
    })
  ],
  optimizeDeps: {
    exclude: ['@dcloudio/uni-h5']
  },
  server: {},
  build: {
    rollupOptions: {
      external: isH5 ? [] : ['@dcloudio/uni-h5']
    }
  }
})
