#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const AUTH_CACHE_PATH = path.resolve(process.cwd(), '.cache/cloudbase-terminal-anon-auth.json')
const PUBLIC_ID_PREFIXES = {
  problem: 'p',
  option: 'opt'
}
const IMAGE_MIME_BY_SUFFIX = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic'
}
const PRIMARY_SLOT_SEQUENCE = ['leaf', 'stem', 'root_crown', 'whole_plant', 'other']
const SLOT_LABEL_MAP = {
  leaf: '叶片图',
  stem: '茎部图',
  root: '根部图',
  root_crown: '根 / 根颈图',
  whole_plant: '全株图',
  flower: '花部图',
  fruit: '果部图',
  other: '其他局部图',
  unknown: '未指定'
}
const DEFAULT_REQUEST_TIMEOUT_MS = 45000
const DEFAULT_SMOKE_IMAGE_MAX_EDGE = 1024
const DEFAULT_SMOKE_IMAGE_QUALITY = 72
const USE_CURL_FALLBACK = /^(1|true|yes|on)$/i.test(
  String(process.env.TERMINAL_E2E_USE_CURL_FALLBACK || '').trim()
)
const CURL_RESOLVE_IP = String(process.env.TERMINAL_E2E_CURL_RESOLVE_IP || '').trim()
const FUNCTION_BASE_URL = String(process.env.TERMINAL_E2E_FUNCTION_BASE_URL || '').trim()

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}

    const [rawKey, ...rest] = arg.slice(2).split('=')
    const key = rawKey.trim()
    const value = rest.length ? rest.join('=').trim() : 'true'
    result[key] = value
    return result
  }, {})
}

async function readCachedAuthResult() {
  try {
    const raw = await fs.readFile(AUTH_CACHE_PATH, 'utf8')
    const parsed = safeJsonParse(raw, null)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const accessToken = String(parsed.access_token || '').trim()
    const expiresAt = Number(parsed.expires_at || 0)
    if (!accessToken || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      return null
    }
    return {
      access_token: accessToken,
      token_type: String(parsed.token_type || 'Bearer').trim() || 'Bearer',
      scope: String(parsed.scope || 'anonymous').trim() || 'anonymous',
      expires_in: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
      sub: String(parsed.sub || '').trim()
    }
  } catch {
    return null
  }
}

async function writeCachedAuthResult(authResult = null) {
  const accessToken = String(authResult?.access_token || '').trim()
  if (!accessToken) {
    return
  }
  const expiresInSeconds = Number(authResult?.expires_in || 0)
  const expiresAt = Date.now() + Math.max(60, expiresInSeconds) * 1000
  await fs.mkdir(path.dirname(AUTH_CACHE_PATH), { recursive: true })
  await fs.writeFile(
    AUTH_CACHE_PATH,
    JSON.stringify({
      access_token: accessToken,
      token_type: String(authResult?.token_type || 'Bearer').trim() || 'Bearer',
      scope: String(authResult?.scope || 'anonymous').trim() || 'anonymous',
      expires_at: expiresAt,
      sub: String(authResult?.sub || '').trim()
    }, null, 2),
    'utf8'
  )
}

function resolveInjectedAuthResult(args = {}) {
  const accessToken = String(
    args['access-token'] ||
      process.env.CLOUDBASE_TEST_ACCESS_TOKEN ||
      ''
  ).trim()
  if (!accessToken) {
    return null
  }

  return {
    access_token: accessToken,
    token_type: String(
      args['access-token-type'] ||
        process.env.CLOUDBASE_TEST_ACCESS_TOKEN_TYPE ||
        'Bearer'
    ).trim() || 'Bearer',
    scope: String(
      args['access-token-scope'] ||
        process.env.CLOUDBASE_TEST_ACCESS_TOKEN_SCOPE ||
        'anonymous'
    ).trim() || 'anonymous',
    expires_in: Number(
      args['access-token-expires-in'] ||
        process.env.CLOUDBASE_TEST_ACCESS_TOKEN_EXPIRES_IN ||
        0
    ) || 0,
    sub: String(
      args['access-token-sub'] ||
        process.env.CLOUDBASE_TEST_ACCESS_TOKEN_SUB ||
        args.openid ||
        ''
    ).trim()
  }
}

function safeJsonParse(value, fallback) {
  if (!value) {return fallback}
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`无法解析 JSON 参数: ${error.message}`)
  }
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Number(ms || 0)))
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeObservedSymptomsInput(observedSymptoms = []) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : [])
    .map(item => ({
      symptomKey: String(item?.symptomKey || item?.symptom_key || '').trim(),
      symptomCn: String(
        item?.symptomCn || item?.symptom_cn || item?.displayTextCn || item?.display_text_cn || ''
      ).trim(),
      confidence: Number(item?.confidence || 0),
      source: String(item?.source || item?.sourceType || item?.source_type || 'user_answer').trim()
    }))
    .filter(item => item.symptomKey)
}

function buildObservedEvidenceSetFromSymptoms(observedSymptoms = [], { idPrefix = 'terminal_input' } = {}) {
  return normalizeObservedSymptomsInput(observedSymptoms).map((item, index) => ({
    observedEvidenceSetId: `${idPrefix}::${item.symptomKey || `evidence_${index + 1}`}`,
    evidenceKey: item.symptomKey,
    evidenceType: 'symptom',
    symptomKey: item.symptomKey,
    symptomCn: item.symptomCn || item.symptomKey,
    confidence: Number(item.confidence || 0),
    sourceType: item.source || 'user_answer',
    currentStatus: 'active',
    targetLayer: 'observed_evidence_set'
  }))
}

function normalizeObservedEvidenceSetInput(
  observedEvidenceSet = [],
  { fallbackSymptoms = [], idPrefix = 'terminal_input' } = {}
) {
  const explicitEvidenceItems = (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
    .map((item, index) => {
      const symptomKey = String(item?.symptomKey || item?.symptom_key || '').trim()
      const evidenceKey = String(
        item?.evidenceKey || item?.evidence_key || symptomKey || ''
      ).trim()
      const observedEvidenceSetId = String(
        item?.observedEvidenceSetId ||
          item?.observed_evidence_set_id ||
          `${idPrefix}::${evidenceKey || `evidence_${index + 1}`}`
      ).trim()

      return {
        observedEvidenceSetId,
        evidenceKey,
        evidenceType: String(item?.evidenceType || item?.evidence_type || '').trim() || (symptomKey ? 'symptom' : ''),
        symptomKey,
        symptomCn: String(
          item?.symptomCn ||
            item?.symptom_cn ||
            item?.displayTextCn ||
            item?.display_text_cn ||
            symptomKey ||
            evidenceKey ||
            ''
        ).trim(),
        confidence: Number(item?.confidence || 0),
        sourceType: String(item?.sourceType || item?.source_type || 'user_answer').trim(),
        currentStatus: String(item?.currentStatus || item?.current_status || 'active').trim(),
        targetLayer: String(item?.targetLayer || item?.target_layer || 'observed_evidence_set').trim(),
        parentEvidenceKey: String(item?.parentEvidenceKey || item?.parent_evidence_key || '').trim(),
        sourceRecordId: String(item?.sourceRecordId || item?.source_record_id || '').trim()
      }
    })
    .filter(item => item.observedEvidenceSetId && (item.evidenceKey || item.symptomKey))

  if (explicitEvidenceItems.length) {
    return explicitEvidenceItems
  }

  return buildObservedEvidenceSetFromSymptoms(fallbackSymptoms, { idPrefix })
}

function projectObservedSymptomsFromEvidenceSet(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
    .map(item => ({
      symptomKey: String(item?.symptomKey || '').trim(),
      symptomCn: String(item?.symptomCn || item?.displayTextCn || item?.evidenceKey || '').trim(),
      confidence: Number(item?.confidence || 0),
      source: String(item?.sourceType || item?.source || 'mixed').trim()
    }))
    .filter(item => item.symptomKey)
}

function isSuccessEnvelope(body = null) {
  return body && typeof body === 'object' && Number(body.code ?? 200) === 200
}

function extractEnvelopeData(body = null) {
  if (!isSuccessEnvelope(body)) {
    const message =
      body && typeof body === 'object'
        ? body.message || body.error || JSON.stringify(body)
        : '接口返回异常'
    throw new Error(message)
  }
  return body.data ?? null
}

function parseSseTranscript(rawText = '') {
  const normalizedText = String(rawText || '').replace(/\r\n/g, '\n')
  const blocks = normalizedText
    .split('\n\n')
    .map(item => String(item || '').trim())
    .filter(Boolean)

  return blocks
    .map(block => {
      let eventName = 'message'
      const dataLines = []

      block.split('\n').forEach(line => {
        const normalizedLine = String(line || '').trimEnd()
        if (!normalizedLine || normalizedLine.startsWith(':')) {
          return
        }

        if (normalizedLine.startsWith('event:')) {
          eventName = normalizedLine.slice(6).trim() || eventName
          return
        }

        if (normalizedLine.startsWith('data:')) {
          dataLines.push(normalizedLine.slice(5).trimStart())
        }
      })

      if (!dataLines.length) {
        return null
      }

      const dataText = dataLines.join('\n')
      let payload = { raw: dataText }

      try {
        payload = JSON.parse(dataText)
      } catch {
        payload = { raw: dataText }
      }

      return {
        event: String(payload?.event || eventName || payload?.type || 'message').trim(),
        payload
      }
    })
    .filter(Boolean)
}

function toBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${pad}`, 'base64').toString('utf8')
}

function parsePublicId(prefix, publicId) {
  const full = String(publicId || '')
  const marker = `${prefix}_`
  if (!full.startsWith(marker)) {return ''}
  const encoded = full.slice(marker.length)
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {return ''}

  const decoded = fromBase64Url(encoded)
  if (!decoded || toBase64Url(decoded) !== encoded) {return ''}
  return decoded
}

function decodeProblemKey(publicId) {
  return parsePublicId(PUBLIC_ID_PREFIXES.problem, publicId)
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function normalizeBooleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const normalized = normalizeText(value)
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false
  }

  return fallback
}

function normalizeInlineImageMode(args = {}) {
  return normalizeBooleanArg(args['use-inline-image'], false)
}

function parseCsvArg(value = '') {
  return String(value || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function normalizeTextList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => normalizeText(item))
    .filter(Boolean)
}

function pickFirstArgValue(args = {}, keys = []) {
  for (const key of Array.isArray(keys) ? keys : []) {
    const value = String(args?.[key] || '').trim()
    if (value) {
      return value
    }
  }
  return ''
}

function readGovernanceExpectations(args = {}) {
  return {
    routePrimaryAction: normalizeText(
      pickFirstArgValue(args, ['expect-route-primary-action', 'expect-route'])
    ),
    identityResolutionStatus: normalizeText(
      pickFirstArgValue(args, ['expect-identity-resolution-status', 'expect-identity'])
    ),
    taxonomyMatchStatus: normalizeText(
      pickFirstArgValue(args, ['expect-taxonomy-match-status', 'expect-taxonomy'])
    )
  }
}

function resolveOptionalBooleanExpectation(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return null
  }
  return normalizeBooleanArg(normalized, false)
}

function assertExpectedGovernanceFields(scope, payload = {}, expectations = {}) {
  const fieldSpecs = [
    ['routePrimaryAction', 'routePrimaryAction'],
    ['identityResolutionStatus', 'identityResolutionStatus'],
    ['taxonomyMatchStatus', 'taxonomyMatchStatus']
  ]

  for (const [fieldKey, fieldLabel] of fieldSpecs) {
    const expectedValue = normalizeText(expectations?.[fieldKey] || '')
    if (!expectedValue) {continue}

    const actualValue = String(payload?.[fieldKey] || '').trim()
    assertCondition(actualValue, `${scope} ${fieldLabel} 缺失`)
    assertCondition(
      normalizeText(actualValue) === expectedValue,
      `${scope} ${fieldLabel} 异常: ${actualValue}`
    )
  }
}

function isCompactRuntimePayload(scope = '', payload = {}) {
  return (
    payload &&
    typeof payload === 'object' &&
    !payload.questionQueue &&
    !payload.coreProcess &&
    normalizeText(payload.diagnosisSessionId || '') &&
    normalizeText(payload.roundId || '') &&
    normalizeText(payload.stage || '')
  )
}

function assertCompactRuntimeArtifacts(scope, payload = {}) {
  const stage = normalizeText(payload?.stage || '')
  const status = normalizeText(payload?.status || '')

  assertCondition(normalizeText(payload?.diagnosisSessionId || ''), `${scope} diagnosisSessionId 缺失`)
  assertCondition(normalizeText(payload?.roundId || ''), `${scope} roundId 缺失`)
  assertCondition(['followup', 'final'].includes(stage), `${scope} stage 异常: ${stage}`)
  assertCondition(status, `${scope} status 缺失`)
  assertCondition(
    payload?.uiHints && typeof payload.uiHints === 'object',
    `${scope} uiHints 缺失`
  )

  if (stage === 'followup') {
    assertCondition(Array.isArray(payload?.questions), `${scope} questions 缺失`)
    return
  }

  assertCondition(
    payload?.finalResult && typeof payload.finalResult === 'object',
    `${scope} finalResult 缺失`
  )
}

function assertFormalRuntimeArtifacts(scope, payload = {}) {
  if (isCompactRuntimePayload(scope, payload)) {
    assertCompactRuntimeArtifacts(scope, payload)
    return
  }

  const questionQueue = payload?.questionQueue
  const stopState = payload?.stopState
  const outputEligibility = payload?.outputEligibility
  const diagnosticTrace = payload?.diagnosticTrace
  const coreProcess = payload?.coreProcess
  const stage = normalizeText(payload?.stage || '')
  const routePrimaryAction = normalizeText(payload?.routePrimaryAction || '')

  assertCondition(questionQueue && typeof questionQueue === 'object', `${scope} questionQueue 缺失`)
  assertCondition(stopState && typeof stopState === 'object', `${scope} stopState 缺失`)
  assertCondition(outputEligibility && typeof outputEligibility === 'object', `${scope} outputEligibility 缺失`)
  assertCondition(Array.isArray(diagnosticTrace), `${scope} diagnosticTrace 缺失`)
  assertCondition(coreProcess && typeof coreProcess === 'object', `${scope} coreProcess 缺失`)
  assertCondition(coreProcess?.visual && typeof coreProcess.visual === 'object', `${scope} coreProcess.visual 缺失`)
  assertCondition(coreProcess?.evidence && typeof coreProcess.evidence === 'object', `${scope} coreProcess.evidence 缺失`)
  assertCondition(coreProcess?.followUp && typeof coreProcess.followUp === 'object', `${scope} coreProcess.followUp 缺失`)
  assertCondition(coreProcess?.decision && typeof coreProcess.decision === 'object', `${scope} coreProcess.decision 缺失`)
  assertCondition(Array.isArray(questionQueue?.questionItems), `${scope} questionQueue.questionItems 不是数组`)
  assertCondition(
    coreProcess?.followUp?.questionQueue && typeof coreProcess.followUp.questionQueue === 'object',
    `${scope} coreProcess.followUp.questionQueue 缺失`
  )
  assertCondition(
    coreProcess?.decision?.stopState && typeof coreProcess.decision.stopState === 'object',
    `${scope} coreProcess.decision.stopState 缺失`
  )
  assertCondition(
    coreProcess?.decision?.outputEligibility && typeof coreProcess.decision.outputEligibility === 'object',
    `${scope} coreProcess.decision.outputEligibility 缺失`
  )
  assertCondition(
    Array.isArray(coreProcess?.decision?.diagnosticTrace),
    `${scope} coreProcess.decision.diagnosticTrace 缺失`
  )
  assertCondition(
    Number(coreProcess?.followUp?.questionCountSummary?.totalItems ?? 0) ===
      Number(questionQueue?.questionItems?.length || 0),
    `${scope} coreProcess questionCountSummary.totalItems 不一致`
  )
  assertCondition(
    normalizeText(coreProcess?.followUp?.routePrimaryAction || '') === routePrimaryAction,
    `${scope} coreProcess routePrimaryAction 不一致`
  )
  assertCondition(
    normalizeText(coreProcess?.decision?.stopReason || '') === normalizeText(payload?.stopReason || ''),
    `${scope} coreProcess stopReason 不一致`
  )
  assertCondition(
    diagnosticTrace.some(item => normalizeText(item?.eventType || '') === 'question_queue_evaluated'),
    `${scope} diagnosticTrace 缺少 question_queue_evaluated`
  )
  assertCondition(
    diagnosticTrace.some(item => normalizeText(item?.eventType || '') === 'stop_state_formed'),
    `${scope} diagnosticTrace 缺少 stop_state_formed`
  )
  assertCondition(
    diagnosticTrace.some(item => normalizeText(item?.eventType || '') === 'output_eligibility_evaluated'),
    `${scope} diagnosticTrace 缺少 output_eligibility_evaluated`
  )

  if (stage === 'followup') {
    assertCondition(Number(outputEligibility?.eligible || 0) === 0, `${scope} followup outputEligibility 不应可输出`)
    assertCondition(Number(stopState?.isStopped || 0) === 0, `${scope} followup stopState 不应已停止`)
    assertCondition(Number(stopState?.allowMoreQuestions || 0) === 1, `${scope} followup 应允许继续追问`)
    assertCondition(
      Number(questionQueue?.activeItemCount || 0) > 0,
      `${scope} followup questionQueue.activeItemCount 应大于 0`
    )
  }

  if (stage === 'final') {
    assertCondition(Number(stopState?.isStopped || 0) === 1, `${scope} final stopState 应已停止`)
    assertCondition(Number(outputEligibility?.eligible || 0) === 1, `${scope} final outputEligibility 应可输出`)
    assertCondition(Number(questionQueue?.activeItemCount || 0) === 0, `${scope} final questionQueue.activeItemCount 应为 0`)
    assertCondition(Array.isArray(payload?.derivedEvidenceSet), `${scope} final derivedEvidenceSet 缺失`)
    assertCondition(
      payload?.careBaselineSummary && typeof payload.careBaselineSummary === 'object',
      `${scope} final careBaselineSummary 缺失`
    )
    assertCondition(
      Array.isArray(payload?.environmentDeviationHints),
      `${scope} final environmentDeviationHints 缺失`
    )
  }

  if (stage === 'followup' && routePrimaryAction === 'retake_first') {
    const hasRetakeItem = (Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : []).some(
      item => normalizeText(item?.questionGroupKey || '') === 'retake_capture'
    )
    assertCondition(hasRetakeItem, `${scope} retake_first 缺少 retake_capture questionQueue 项`)
  }
}

function resolveImageSuffix(imagePath = '') {
  const suffix = path.extname(String(imagePath || ''))
    .trim()
    .toLowerCase()
    .replace(/^\./, '')

  if (!IMAGE_MIME_BY_SUFFIX[suffix]) {
    throw new Error(`视觉 smoke 暂不支持该图片格式: ${suffix || 'unknown'}`)
  }

  return suffix
}

function normalizePositiveIntegerArg(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback
}

function buildSmokeUploadCompressionTrace(imageFile = {}) {
  const compression = imageFile?.compression || null
  if (!compression || typeof compression !== 'object') {return null}
  const originalSizeBytes = Number(compression.originalSizeBytes || imageFile.originalSize || 0)
  const uploadedSizeBytes = Number(compression.uploadedSizeBytes || imageFile.size || 0)
  return {
    source: 'terminal_smoke_before_cloud_storage',
    compressed: Boolean(compression.compressed),
    originalSizeBytes,
    uploadedSizeBytes,
    compressionRatio:
      originalSizeBytes > 0 && uploadedSizeBytes > 0
        ? Math.round((uploadedSizeBytes / originalSizeBytes) * 1000) / 1000
        : null,
    quality: Number(compression.quality || 0) || null,
    maxEdge: Number(compression.maxEdge || 0) || null,
    width: null,
    height: null,
    targetSizeBytes: null,
    minimumQuality: null,
    preserveImageDetails: false,
    doubleConfirmedForHunyuan: true
  }
}

async function maybeCompressSmokeImage(resolvedPath, suffix, originalBuffer, args = {}) {
  const enabled = normalizeBooleanArg(args['smoke-image-compress'], true)
  const maxEdge = normalizePositiveIntegerArg(
    args['smoke-image-max-edge'],
    DEFAULT_SMOKE_IMAGE_MAX_EDGE
  )
  const quality = Math.max(
    1,
    Math.min(
      100,
      normalizePositiveIntegerArg(args['smoke-image-quality'], DEFAULT_SMOKE_IMAGE_QUALITY)
    )
  )

  if (!enabled || process.platform !== 'darwin' || suffix === 'gif' || suffix === 'heic') {
    return {
      buffer: originalBuffer,
      suffix,
      compression: {
        compressed: false,
        originalSizeBytes: originalBuffer.length,
        uploadedSizeBytes: originalBuffer.length,
        quality: 100,
        maxEdge: null
      }
    }
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diagnose-smoke-image-'))
  const outPath = path.join(tmpDir, `${path.basename(resolvedPath, path.extname(resolvedPath))}.jpg`)

  try {
    await execFileAsync(
      'sips',
      [
        '--resampleHeightWidthMax',
        String(maxEdge),
        '--setProperty',
        'format',
        'jpeg',
        '--setProperty',
        'formatOptions',
        String(quality),
        resolvedPath,
        '--out',
        outPath
      ],
      { timeout: 15000 }
    )
    const compressedBuffer = await fs.readFile(outPath)
    if (!compressedBuffer.length || compressedBuffer.length >= originalBuffer.length) {
      return {
        buffer: originalBuffer,
        suffix,
        compression: {
          compressed: false,
          originalSizeBytes: originalBuffer.length,
          uploadedSizeBytes: originalBuffer.length,
          quality: 100,
          maxEdge
        }
      }
    }
    return {
      buffer: compressedBuffer,
      suffix: 'jpg',
      compression: {
        compressed: true,
        originalSizeBytes: originalBuffer.length,
        uploadedSizeBytes: compressedBuffer.length,
        quality,
        maxEdge
      }
    }
  } catch {
    return {
      buffer: originalBuffer,
      suffix,
      compression: {
        compressed: false,
        originalSizeBytes: originalBuffer.length,
        uploadedSizeBytes: originalBuffer.length,
        quality: 100,
        maxEdge
      }
    }
  }
}

async function readImageAsDataUrl(imagePath = '', args = {}) {
  const resolvedPath = path.resolve(String(imagePath || '').trim())
  assertCondition(resolvedPath, '缺少 --image-path')

  const suffix = resolveImageSuffix(resolvedPath)
  const originalBuffer = await fs.readFile(resolvedPath)
  assertCondition(originalBuffer.length > 0, `视觉 smoke 图片为空: ${resolvedPath}`)
  const imageForUpload = await maybeCompressSmokeImage(resolvedPath, suffix, originalBuffer, args)
  const uploadSuffix = imageForUpload.suffix || suffix
  const buffer = imageForUpload.buffer || originalBuffer

  return {
    resolvedPath,
    suffix: uploadSuffix,
    size: buffer.length,
    originalSize: originalBuffer.length,
    compression: imageForUpload.compression || null,
    dataUrl: `data:${IMAGE_MIME_BY_SUFFIX[uploadSuffix]};base64,${buffer.toString('base64')}`
  }
}

async function readImageFiles(args = {}) {
  const imagePaths = parseCsvArg(args['image-paths'])
  const fallbackPath = String(args['image-path'] || '').trim()
  const resolvedPaths = imagePaths.length ? imagePaths : (fallbackPath ? [fallbackPath] : [])

  assertCondition(resolvedPaths.length > 0, '缺少 --image-path 或 --image-paths')
  assertCondition(resolvedPaths.length <= 5, `视觉 smoke 最多支持 5 张图，当前 ${resolvedPaths.length} 张`)

  const files = []
  for (const imagePath of resolvedPaths) {
    files.push(await readImageAsDataUrl(imagePath, args))
  }

  return files
}

function resolveSlotTypeList(args = {}, imageCount = 0) {
  const explicitSlotTypes = parseCsvArg(args['input-slot-types']).map(item => normalizeText(item))

  return Array.from({ length: imageCount }, (_, index) => {
    const slotType = explicitSlotTypes[index] || PRIMARY_SLOT_SEQUENCE[index] || PRIMARY_SLOT_SEQUENCE[PRIMARY_SLOT_SEQUENCE.length - 1]
    return SLOT_LABEL_MAP[slotType] ? slotType : 'unknown'
  })
}

function buildStructuredImageList(imageRefs = [], uploadedImages = [], args = {}) {
  const slotTypes = resolveSlotTypeList(args, imageRefs.length)

  return imageRefs.map((imageRef, index) => {
    const slotType = slotTypes[index] || 'unknown'
    const slotLabel = SLOT_LABEL_MAP[slotType] || '未指定'
    const uploaded = uploadedImages[index] || null

    return {
      imageRef,
      inputSlotType: slotType,
      orderIndex: index,
      inputSlotOrder: index,
      inputSlotLabel: `图片${index + 1} ${slotLabel}`,
      userDeclaredOrganType: slotType === 'unknown' ? '' : slotType,
      userDeclaredOrganConfidence: slotType === 'unknown' ? null : 0.95,
      ...(uploaded?.uploadCompression ? { uploadCompression: uploaded.uploadCompression } : {}),
      ...(uploaded?.fileId ? { fileId: uploaded.fileId } : {})
    }
  })
}

function buildFunctionUrl(envId, path, query = {}) {
  const normalizedPath = String(path || '').replace(/^\/+/, '')
  const baseUrl = FUNCTION_BASE_URL
    ? `${FUNCTION_BASE_URL.replace(/\/+$/, '')}/`
    : `https://${envId}.api.tcloudbasegateway.com/v1/functions/`
  const url = new URL(normalizedPath, baseUrl)

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {return}
    url.searchParams.set(key, String(value))
  })
  if (!FUNCTION_BASE_URL) {
    url.searchParams.set('webfn', 'true')
  }
  return url
}

function resolveHttpMethodTransport(method = 'GET', query = {}, headers = {}) {
  const requestedMethod = String(method || 'GET').toUpperCase()

  if (requestedMethod === 'GET' || requestedMethod === 'POST') {
    return {
      requestMethod: requestedMethod,
      requestQuery: query,
      requestHeaders: headers,
      logicalMethod: requestedMethod
    }
  }

  return {
    requestMethod: 'POST',
    requestQuery: {
      ...query,
      _method: requestedMethod
    },
    requestHeaders: {
      ...headers,
      'x-http-method-override': requestedMethod
    },
    logicalMethod: requestedMethod
  }
}

async function signInAnonymously(envId, deviceId) {
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await requestJson(`https://${envId}.api.tcloudbasegateway.com/auth/v1/signin/anonymously`, {
        method: 'POST',
        headers: {
          'x-device-id': deviceId,
          'Content-Type': 'application/json'
        },
        body: '{}'
      })

      if (!response.ok) {
        throw new Error(`匿名登录失败: HTTP ${response.status} ${response.text}`)
      }

      const payload = safeJsonParse(response.text, null)
      if (!payload?.access_token) {
        throw new Error(`匿名登录未返回 access_token: ${response.text}`)
      }

      return payload
    } catch (error) {
      lastError = error
      if (!isTransientRequestError(error) || attempt >= 3) {
        throw error
      }
      await sleep(1200)
    }
  }

  throw lastError || new Error('匿名登录失败')
}

async function requestJson(url, { method = 'GET', headers = {}, body = undefined, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS)))

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    })
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      text
    }
  } catch (error) {
    const message = String(error?.message || error || '').toLowerCase()
    if (!message.includes('fetch failed') && !message.includes('aborted') && !message.includes('timeout')) {
      throw error
    }
    if (!USE_CURL_FALLBACK) {
      throw error
    }
    return requestJsonViaCurl(url, { method, headers, body, timeoutMs })
  } finally {
    clearTimeout(timeout)
  }
}

async function requestJsonViaCurl(url, { method = 'GET', headers = {}, body = undefined, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  const curlArgs = ['-sS', '--max-time', String(Math.max(1, Math.ceil(Number(timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS) / 1000))), '-X', method]
  if (CURL_RESOLVE_IP) {
    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.hostname) {
        curlArgs.push('--resolve', `${parsedUrl.hostname}:443:${CURL_RESOLVE_IP}`)
      }
    } catch {
      // ignore invalid URL here and let curl surface the actual request error
    }
  }

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {return}
    curlArgs.push('-H', `${key}: ${value}`)
  })

  if (body !== undefined) {
    curlArgs.push('--data-raw', body)
  }

  curlArgs.push(url)
  curlArgs.push('-w', '\n__CODE__:%{http_code}')

  const { stdout } = await execFileAsync('curl', curlArgs, {
    maxBuffer: 1024 * 1024 * 10
  })

  const marker = '\n__CODE__:'
  const markerIndex = stdout.lastIndexOf(marker)
  if (markerIndex === -1) {
    throw new Error('curl 回退未返回状态码标记')
  }

  const text = stdout.slice(0, markerIndex)
  const status = Number(stdout.slice(markerIndex + marker.length).trim() || 0)

  return {
    ok: status >= 200 && status < 300,
    status,
    text
  }
}

async function callFunction(envId, token, {
  path,
  method = 'GET',
  query = {},
  body = null,
  openid = '',
  appEnv = '',
  terminalE2E = false,
  skipAuth = false
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  const headers = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (openid) {
    headers['x-openid'] = openid
    headers['x-wx-openid'] = openid
  }

  if (appEnv) {
    headers['x-app-env'] = appEnv
    headers['x-env'] = appEnv
  }

  if (terminalE2E) {
    headers['x-terminal-e2e'] = 'true'
  }

  const normalizedQuery = { ...query }
  const normalizedBody =
    body && typeof body === 'object' && !Array.isArray(body)
      ? { ...body }
      : body

  if (skipAuth) {
    normalizedQuery.skipAuth = 'true'
    if (openid) {
      normalizedQuery.openid = openid
    }
    if (normalizedBody && typeof normalizedBody === 'object' && !Array.isArray(normalizedBody)) {
      normalizedBody.skipAuth = true
      if (openid) {
        normalizedBody.openid = openid
      }
    }
  }

  const {
    requestMethod,
    requestQuery,
    requestHeaders,
    logicalMethod
  } = resolveHttpMethodTransport(normalizedMethod, normalizedQuery, headers)
  const url = buildFunctionUrl(envId, path, requestQuery)

  const response = await requestJson(url.toString(), {
    method: requestMethod,
    headers: requestHeaders,
    body: requestMethod === 'GET' ? undefined : JSON.stringify(normalizedBody || {})
  })

  let parsed = null
  try {
    parsed = JSON.parse(response.text)
  } catch {
    parsed = response.text
  }

  return {
    status: response.status,
    ok: response.ok,
    url: url.toString(),
    requestMethod,
    logicalMethod,
    body: parsed
  }
}

async function callFunctionSse(envId, token, {
  path,
  method = 'POST',
  query = {},
  body = null,
  openid = '',
  appEnv = '',
  terminalE2E = false,
  skipAuth = false
}) {
  const normalizedMethod = String(method || 'POST').toUpperCase()
  const headers = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (openid) {
    headers['x-openid'] = openid
    headers['x-wx-openid'] = openid
  }

  if (appEnv) {
    headers['x-app-env'] = appEnv
    headers['x-env'] = appEnv
  }

  if (terminalE2E) {
    headers['x-terminal-e2e'] = 'true'
  }

  const normalizedQuery = { ...query }
  const normalizedBody =
    body && typeof body === 'object' && !Array.isArray(body)
      ? { ...body }
      : body

  if (skipAuth) {
    normalizedQuery.skipAuth = 'true'
    if (openid) {
      normalizedQuery.openid = openid
    }
    if (normalizedBody && typeof normalizedBody === 'object' && !Array.isArray(normalizedBody)) {
      normalizedBody.skipAuth = true
      if (openid) {
        normalizedBody.openid = openid
      }
    }
  }

  const {
    requestMethod,
    requestQuery,
    requestHeaders,
    logicalMethod
  } = resolveHttpMethodTransport(normalizedMethod, normalizedQuery, headers)
  const url = buildFunctionUrl(envId, path, requestQuery)

  const response = await requestJson(url.toString(), {
    method: requestMethod,
    headers: requestHeaders,
    body: requestMethod === 'GET' ? undefined : JSON.stringify(normalizedBody || {})
  })

  const events = parseSseTranscript(response.text)
  const doneEvent = events.find(item => item?.event === 'done') || null
  const errorEvent = events.find(item => item?.event === 'error') || null
  const replyEvents = events.filter(item => item?.event === 'reply')

  return {
    status: response.status,
    ok: response.ok && !errorEvent,
    url: url.toString(),
    requestMethod,
    logicalMethod,
    body: response.text,
    events,
    doneEvent,
    errorEvent,
    replyEvents
  }
}

function isTransientFunctionFailure(result = null) {
  const status = Number(result?.status || 0)
  const bodyCode = String(result?.body?.code || '')
  const bodyMessage = String(
    result?.body?.message ||
    result?.body?.error ||
    result?.body?.RetMsg ||
    ''
  ).toLowerCase()

  if (status >= 500) {return true}
  if (bodyCode === 'SYS_ERR') {return true}
  if (bodyMessage.includes('database connection failed')) {return true}
  if (bodyMessage.includes('please check the corresponding database connection configuration')) {return true}
  return false
}

function isTransientRequestError(error = null) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('aborted') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('socket hang up')
  )
}

async function callFunctionWithRetry(envId, token, options, {
  maxAttempts = 4,
  delayMs = 1200
} = {}) {
  let lastResult = null
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      lastResult = await callFunction(envId, token, options)
      if (!isTransientFunctionFailure(lastResult) || attempt === maxAttempts) {
        return {
          ...lastResult,
          attempt
        }
      }
    } catch (error) {
      lastError = error
      if (!isTransientRequestError(error) || attempt === maxAttempts) {
        throw error
      }
    }
    await sleep(delayMs)
  }

  if (lastError) {
    throw lastError
  }

  return {
    ...lastResult,
    attempt: maxAttempts
  }
}

function isTransientSseFailure(result = null) {
  if (!result) {return true}
  if (Number(result?.status || 0) >= 500) {return true}

  const errorMessage = String(
    result?.errorEvent?.payload?.message ||
    result?.errorEvent?.payload?.error ||
    ''
  ).toLowerCase()

  if (errorMessage.includes('database connection failed')) {return true}
  if (errorMessage.includes('please check the corresponding database connection configuration')) {return true}
  return false
}

async function callFunctionSseWithRetry(envId, token, options, {
  maxAttempts = 3,
  delayMs = 1200
} = {}) {
  let lastResult = null
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      lastResult = await callFunctionSse(envId, token, options)
      if (!isTransientSseFailure(lastResult) || attempt === maxAttempts) {
        return {
          ...lastResult,
          attempt
        }
      }
    } catch (error) {
      lastError = error
      if (!isTransientRequestError(error) || attempt === maxAttempts) {
        throw error
      }
    }
    await sleep(delayMs)
  }

  if (lastError) {
    throw lastError
  }

  return {
    ...lastResult,
    attempt: maxAttempts
  }
}

function pickYesOptionId(question = {}) {
  const options = Array.isArray(question?.options) ? question.options : []
  for (const option of options) {
    const optionId = String(option?.optionId || '')
    const decoded = parsePublicId(PUBLIC_ID_PREFIXES.option, optionId)
    if (decoded === 'yes') {
      return optionId
    }
  }

  for (const option of options) {
    const text = normalizeText(option?.text || '')
    if (
      text.includes('是') ||
      text.includes('有') ||
      text.includes('会') ||
      text.includes('明显') ||
      text.includes('比较确定')
    ) {
      return String(option?.optionId || '')
    }
  }

  return ''
}

function isUnknownOption(option = {}) {
  const optionId = String(option?.optionId || '')
  const decoded = normalizeText(parsePublicId(PUBLIC_ID_PREFIXES.option, optionId))
  if (decoded === 'unknown') {
    return true
  }

  const text = normalizeText(option?.text || '')
  return (
    text.includes('不确定') ||
    text.includes('不清楚') ||
    text.includes('未知') ||
    text.includes('看不出') ||
    text.includes('看不出来')
  )
}

function parseAnswerPattern(value = '') {
  return String(value || '')
    .split(',')
    .map(item => normalizeText(item))
    .filter(Boolean)
}

function pickOptionIdByPattern(question = {}, answerToken = 'yes') {
  const normalizedToken = normalizeText(answerToken || 'yes')
  if (normalizedToken === 'yes') {
    const yesOptionId = pickYesOptionId(question)
    if (yesOptionId) {
      return yesOptionId
    }
  }

  const options = Array.isArray(question?.options) ? question.options : []
  for (const option of options) {
    const optionId = String(option?.optionId || '')
    const decoded = parsePublicId(PUBLIC_ID_PREFIXES.option, optionId)
    if (decoded === normalizedToken) {
      return optionId
    }
  }

  for (const option of options) {
    const text = normalizeText(option?.text || '')
    if (
      normalizedToken === 'no' &&
      (text.includes('否') ||
        text.includes('没有') ||
        text.includes('无') ||
        text.includes('基本没有'))
    ) {
      return String(option?.optionId || '')
    }
    if (
      normalizedToken === 'unknown' &&
      (text.includes('不确定') ||
        text.includes('不清楚') ||
        text.includes('未知') ||
        text.includes('看不出') ||
        text.includes('看不出来'))
    ) {
      return String(option?.optionId || '')
    }
  }

  if (normalizedToken === 'yes') {
    const firstNonUnknownOption = options.find(option => !isUnknownOption(option))
    if (firstNonUnknownOption?.optionId) {
      return String(firstNonUnknownOption.optionId)
    }
  }

  return ''
}

function buildDiagnoseBaseOptions(args = {}) {
  const skipAuth = normalizeBooleanArg(args['skip-auth'], false)
  const terminalE2E =
    args['terminal-e2e'] === 'true' ||
    args['terminal-e2e'] === true ||
    args['anonymous-dev-identity'] === 'true' ||
    args['anonymous-dev-identity'] === true ||
    skipAuth
  const fallbackOpenid =
    !args.openid && (skipAuth || terminalE2E)
      ? `dev_terminal_${String(args['device-id'] || 'terminal').replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : ''
  return {
    openid: args.openid || fallbackOpenid,
    appEnv: args['app-env'] || '',
    skipAuth,
    terminalE2E
  }
}

function buildSmokeBatchAnswerPath(answerRounds = []) {
  return (Array.isArray(answerRounds) ? answerRounds : []).map(round => ({
    roundId: round?.roundId || '',
    answers: (Array.isArray(round?.answers) ? round.answers : []).map(answer => ({
      questionId: answer?.questionId || '',
      optionId: answer?.optionId || '',
      answerToken: answer?.answerToken || ''
    }))
  }))
}

function buildSmokeBatchAnswerPathSignature(answerPath = []) {
  return (Array.isArray(answerPath) ? answerPath : [])
    .flatMap(round => (Array.isArray(round?.answers) ? round.answers : []))
    .map(answer => `${answer?.questionId || ''}:${answer?.optionId || ''}:${answer?.answerToken || ''}`)
    .filter(item => item !== '::')
    .join('|')
}

function buildVisualSmokeBatchReviewRecord({
  args = {},
  answerRounds = [],
  imageFiles = [],
  resultData = {},
  startData = {}
}) {
  const answerPath = buildSmokeBatchAnswerPath(answerRounds)
  const firstImage = imageFiles[0] || {}
  const observedEvidenceSet = Array.isArray(resultData?.observedEvidenceSet)
    ? resultData.observedEvidenceSet
    : []
  const diagnosisDirectionLabels = Array.isArray(resultData?.diagnosisDirections)
    ? resultData.diagnosisDirections
        .map(item => item?.label || item?.displayName || item?.name || item?.problemKey || '')
        .filter(Boolean)
    : []

  return {
    diagnosisSessionId: startData?.diagnosisSessionId || resultData?.diagnosisSessionId || '',
    sourceSchema: args['source-schema'] || args['schema-env'] || 'cloud1_dev',
    batchGeneratedAt: new Date().toISOString(),
    sampleLabel: args['sample-label'] || args['batch-sample-label'] || 'terminal-visual-smoke',
    sampleFileName: firstImage?.name || firstImage?.fileName || String(firstImage?.resolvedPath || '').split('/').pop() || '',
    sampleAbsolutePath: firstImage?.resolvedPath || firstImage?.path || '',
    answerPathSignature: buildSmokeBatchAnswerPathSignature(answerPath),
    answerPath,
    roundsUsed: answerRounds.length,
    questionCount: answerRounds.reduce((sum, round) => sum + Number(round?.questionCount || 0), 0),
    observedEvidenceCount: observedEvidenceSet.length,
    diagnosisDirectionLabels
  }
}

async function importVisualSmokeBatchReview(envId, token, {
  args = {},
  baseOptions = {},
  record = {}
}) {
  const batchSource = args['review-batch-source'] || args['batch-source'] || 'terminal-visual-smoke'
  const response = await callFunctionWithRetry(envId, token, {
    ...baseOptions,
    path: 'diagnose-http/diagnosis/review/list',
    method: 'POST',
    body: {
      action: 'importBatch',
      batchSource,
      records: [record]
    }
  }, {
    maxAttempts: Number(args['review-import-retries'] || 3),
    delayMs: Number(args['retry-delay-ms'] || 1500)
  })
  assertCondition(response.ok, `review importBatch 请求失败: HTTP ${response.status} ${JSON.stringify(response.body)}`)

  const data = extractEnvelopeData(response.body)
  return {
    attempted: true,
    skipped: false,
    batchSource,
    diagnosisSessionId: record?.diagnosisSessionId || '',
    inserted: Number(data?.inserted || 0),
    updated: Number(data?.updated || 0),
    skippedCount: Number(data?.skipped || 0)
  }
}

async function runDiagnosisSessionFlow(envId, token, {
  baseOptions,
  startBody,
  args,
  defaultOutcomeIfMissing = '',
  startMode = 'sync'
}) {
  const normalizedStartMode = normalizeText(startMode || 'sync') === 'stream' ? 'stream' : 'sync'
  const start = normalizedStartMode === 'stream'
    ? await callFunctionSseWithRetry(envId, token, {
        ...baseOptions,
        path: 'diagnose-http/stream/diagnose',
        method: 'POST',
        body: startBody
      }, {
        maxAttempts: Number(args['start-retries'] || 4),
        delayMs: Number(args['retry-delay-ms'] || 1500)
      })
    : await callFunctionWithRetry(envId, token, {
        ...baseOptions,
        path: 'diagnose-http/diagnosis/start',
        method: 'POST',
        body: startBody
      }, {
        maxAttempts: Number(args['start-retries'] || 6),
        delayMs: Number(args['retry-delay-ms'] || 1500)
      })

  const startErrorText = normalizedStartMode === 'stream'
    ? start?.errorEvent?.payload?.message || start?.body || ''
    : JSON.stringify(start?.body)
  assertCondition(start.ok, `start 请求失败: HTTP ${start.status} ${startErrorText}`)
  const startData = normalizedStartMode === 'stream'
    ? start?.doneEvent?.payload?.data || null
    : extractEnvelopeData(start.body)
  if (normalizedStartMode === 'stream') {
    assertCondition(
      start?.doneEvent?.payload?.type === 'done' && startData && typeof startData === 'object',
      `stream start 未返回 done 结果: ${JSON.stringify({
        eventCount: Array.isArray(start?.events) ? start.events.length : 0,
        hasErrorEvent: Boolean(start?.errorEvent),
        errorMessage: start?.errorEvent?.payload?.message || ''
      })}`
    )
  }
  assertCondition(startData?.diagnosisSessionId, 'start 未返回 diagnosisSessionId')
  const governanceExpectations = readGovernanceExpectations(args)
  assertExpectedGovernanceFields('start', startData, {
    routePrimaryAction: '',
    identityResolutionStatus: governanceExpectations.identityResolutionStatus,
    taxonomyMatchStatus: governanceExpectations.taxonomyMatchStatus
  })
  assertFormalRuntimeArtifacts('start', startData)

  const answerPattern = parseAnswerPattern(args['answer-pattern'] || '')
  const answerPlan = answerPattern.length ? [...answerPattern] : ['yes']
  const buildAnswersForQuestions = (questions, roundOffset = 0) => (Array.isArray(questions) ? questions : []).map((question, index) => {
    const sequentialIndex = Number(roundOffset || 0) + index
    const answerToken = answerPlan[sequentialIndex] || answerPlan[answerPlan.length - 1] || 'yes'
    const optionId = pickOptionIdByPattern(question, answerToken)
    assertCondition(
      optionId,
      `问题 ${question?.questionId || ''} 未找到 ${answerToken} 选项: ${JSON.stringify(
        Array.isArray(question?.options)
          ? question.options.map(option => ({
              optionId: option?.optionId || '',
              text: option?.text || ''
            }))
          : []
      )}`
    )
    return {
      questionId: question.questionId,
      optionId,
      answerToken
    }
  })

  const answerRounds = []
  let currentRoundData = startData
  let finalAnswer = null
  let finalAnswerData = null
  const maxFollowUpLoops = Number(args['max-followup-loops'] || 4)

  if (startData?.stage === 'final') {
    finalAnswer = start
    finalAnswerData = startData
  } else {
    assertCondition(startData?.stage === 'followup', `start stage 异常: ${startData?.stage || ''}`)
    assertCondition(
      Array.isArray(startData?.questions) && startData.questions.length > 0,
      'start 未返回 follow-up questions'
    )
  }

  for (let loopIndex = 0; loopIndex < maxFollowUpLoops && !finalAnswerData; loopIndex += 1) {
    assertCondition(
      currentRoundData?.stage === 'followup' &&
        Array.isArray(currentRoundData?.questions) &&
        currentRoundData.questions.length > 0,
      `follow-up 数据异常: ${JSON.stringify({
        stage: currentRoundData?.stage || '',
        questionCount: currentRoundData?.questions?.length || 0
      })}`
    )

    const answers = buildAnswersForQuestions(currentRoundData.questions, loopIndex)
    const answer = await callFunctionWithRetry(envId, token, {
      ...baseOptions,
      path: 'diagnose-http/diagnosis/answer',
      method: 'POST',
      body: {
        diagnosisSessionId: startData.diagnosisSessionId,
        roundId: currentRoundData.roundId,
        answers
      }
    }, {
      maxAttempts: Number(args['answer-retries'] || 4),
      delayMs: Number(args['retry-delay-ms'] || 1500)
    })
    assertCondition(answer.ok, `answer 请求失败: HTTP ${answer.status} ${JSON.stringify(answer.body)}`)
    const answerData = extractEnvelopeData(answer.body)

    answerRounds.push({
      attempt: answer.attempt,
      roundId: currentRoundData.roundId || '',
      stage: answerData?.stage || '',
      status: answerData?.status || '',
      outcomeType: answerData?.outcomeType || '',
      routePrimaryAction: answerData?.routePrimaryAction || '',
      stopReason: answerData?.stopReason || '',
      answerPattern: answers.map(item => item.answerToken),
      answers: answers.map(item => ({
        questionId: item.questionId || '',
        optionId: item.optionId || '',
        answerToken: item.answerToken || ''
      })),
      questionCount: currentRoundData.questions.length
    })
    assertFormalRuntimeArtifacts(`answer_round_${loopIndex + 1}`, answerData)

    if (answerData?.stage === 'final') {
      finalAnswer = answer
      finalAnswerData = answerData
      break
    }

    currentRoundData = answerData
  }

  assertCondition(finalAnswer && finalAnswerData, '未在预期轮次内到达 final 结果')
  assertCondition(finalAnswerData?.stage === 'final', `answer stage 异常: ${finalAnswerData?.stage || ''}`)
  assertCondition(finalAnswerData?.status === 'closed', `answer status 异常: ${finalAnswerData?.status || ''}`)

  const expectedOutcome = normalizeText(args['expect-outcome'] || defaultOutcomeIfMissing)
  const expectedNonProblematicType = normalizeText(args['expect-non-problematic-type'] || '')
  const expectedProblemKey = normalizeText(args['expect-problem-key'] || '')
  if (expectedOutcome) {
    assertCondition(
      normalizeText(finalAnswerData?.outcomeType || '') === expectedOutcome,
      `answer outcomeType 异常: ${finalAnswerData?.outcomeType || ''}`
    )
  }
  assertExpectedGovernanceFields('answer', finalAnswerData, governanceExpectations)

  assertCondition(finalAnswerData?.finalResult?.resultId, 'answer 未返回 finalResult.resultId')
  if (expectedProblemKey) {
    assertCondition(
      parsePublicId(PUBLIC_ID_PREFIXES.problem, finalAnswerData?.finalResult?.problemId || '') === expectedProblemKey,
      `answer problemId 异常: ${finalAnswerData?.finalResult?.problemId || ''}`
    )
  }

  const result = await callFunctionWithRetry(envId, token, {
    ...baseOptions,
    path: 'diagnose-http/diagnosis/result',
    method: 'GET',
    query: {
      id: finalAnswerData.finalResult.resultId
    }
  })
  assertCondition(result.ok, `result 请求失败: HTTP ${result.status} ${JSON.stringify(result.body)}`)
  const resultData = extractEnvelopeData(result.body)
  assertCondition(resultData?.diagnosisSessionId === startData.diagnosisSessionId, 'result diagnosisSessionId 不匹配')
  if (expectedProblemKey) {
    assertCondition(
      parsePublicId(PUBLIC_ID_PREFIXES.problem, resultData?.finalResult?.problemId || '') === expectedProblemKey,
      `result problemId 异常: ${resultData?.finalResult?.problemId || ''}`
    )
  }
  assertExpectedGovernanceFields('result', resultData, governanceExpectations)
  assertFormalRuntimeArtifacts('result', resultData)

  const history = await callFunctionWithRetry(envId, token, {
    ...baseOptions,
    path: 'diagnose-http/diagnosis/history',
    method: 'GET',
    query: {
      page: 1,
      pageSize: Number(args['history-page-size'] || 10)
    }
  })
  assertCondition(history.ok, `history 请求失败: HTTP ${history.status} ${JSON.stringify(history.body)}`)
  const historyData = extractEnvelopeData(history.body)
  const historyItems = Array.isArray(historyData?.items) ? historyData.items : []
  const matchedHistory = historyItems.find(item => item?.historyId === startData.diagnosisSessionId)
  assertCondition(matchedHistory, 'history 未找到刚创建的会话')
  assertCondition(
    matchedHistory?.resultId === finalAnswerData?.finalResult?.resultId,
    'history resultId 与 finalResult 不一致'
  )
  if (expectedNonProblematicType) {
    assertCondition(
      normalizeText(finalAnswerData?.nonProblematicType || '') === expectedNonProblematicType,
      `answer nonProblematicType 异常: ${finalAnswerData?.nonProblematicType || ''}`
    )
    assertCondition(
      normalizeText(resultData?.nonProblematicType || '') === expectedNonProblematicType,
      `result nonProblematicType 异常: ${resultData?.nonProblematicType || ''}`
    )
    assertCondition(
      normalizeText(matchedHistory?.nonProblematicType || '') === expectedNonProblematicType,
      `history nonProblematicType 异常: ${matchedHistory?.nonProblematicType || ''}`
    )
  }

  return {
    start,
    startMode: normalizedStartMode,
    startData,
    answerRounds,
    finalAnswerData,
    result,
    resultData,
    history,
    matchedHistory
  }
}

async function runDiagnoseSmoke(envId, authResult, args) {
  const baseOptions = buildDiagnoseBaseOptions(args)
  const token = authResult.access_token
  const plantCatalogId = String(args['plant-catalog-id'] || '1')
  const parsedObservedSymptoms = safeJsonParse(args['observed-symptoms'], [])
  const observedSymptoms = normalizeObservedSymptomsInput(
    Array.isArray(parsedObservedSymptoms) ? parsedObservedSymptoms : []
  )
  const parsedObservedEvidenceSet = safeJsonParse(args['observed-evidence-set'], [])
  const observedEvidenceSet = normalizeObservedEvidenceSetInput(parsedObservedEvidenceSet, {
    fallbackSymptoms: observedSymptoms,
    idPrefix: 'terminal_diagnose'
  })
  const observedSymptomsForRequest = observedEvidenceSet.length
    ? projectObservedSymptomsFromEvidenceSet(observedEvidenceSet)
    : observedSymptoms

  const health = await callFunctionWithRetry(envId, token, {
    ...baseOptions,
    path: 'diagnose-http/health',
    method: 'GET'
  })
  assertCondition(health.ok, `health 请求失败: HTTP ${health.status}`)
  const healthData = extractEnvelopeData(health.body)

  const flow = await runDiagnosisSessionFlow(envId, token, {
    baseOptions,
    startBody: {
      plantCatalogId,
      observedSymptoms: observedSymptomsForRequest,
      observedEvidenceSet
    },
    args,
    defaultOutcomeIfMissing: 'problematic',
    startMode: 'sync'
  })
  const {
    start,
    startData,
    answerRounds,
    finalAnswerData,
    result,
    resultData,
    history,
    matchedHistory
  } = flow

  return {
    smoke: 'diagnose',
    envId,
    deviceId: args['device-id'],
    health: {
      attempt: health.attempt,
      ready: healthData?.refactor?.ready ?? null,
      runtimeSchema: healthData?.runtimeSchema?.schema || ''
    },
    start: {
      attempt: start.attempt,
      transport: flow.startMode,
      diagnosisSessionId: startData.diagnosisSessionId,
      roundId: startData.roundId,
      stage: startData.stage || '',
      outcomeType: startData.outcomeType || '',
      nonProblematicType: startData.nonProblematicType || '',
      routePrimaryAction: startData.routePrimaryAction || '',
      identityResolutionStatus: startData.identityResolutionStatus || '',
      taxonomyMatchStatus: startData.taxonomyMatchStatus || '',
      questionCount: Array.isArray(startData.questions) ? startData.questions.length : 0
    },
    answer: {
      attempts: answerRounds,
      outcomeType: finalAnswerData.outcomeType || '',
      routePrimaryAction: finalAnswerData.routePrimaryAction || '',
      identityResolutionStatus: finalAnswerData.identityResolutionStatus || '',
      taxonomyMatchStatus: finalAnswerData.taxonomyMatchStatus || '',
      stopReason: finalAnswerData.stopReason || '',
      nonProblematicType: finalAnswerData.nonProblematicType || '',
      resultId: finalAnswerData.finalResult.resultId,
      problemId: finalAnswerData.finalResult.problemId || '',
      problemKey: decodeProblemKey(finalAnswerData.finalResult.problemId || ''),
      displayName: finalAnswerData.finalResult.displayName,
      severity: finalAnswerData.finalResult.severity,
      confidenceLevel: finalAnswerData.confidenceLevel || '',
      needHumanReview: Boolean(finalAnswerData.needHumanReview)
    },
    result: {
      attempt: result.attempt,
      diagnosisSessionId: resultData.diagnosisSessionId || '',
      nonProblematicType: resultData.nonProblematicType || '',
      routePrimaryAction: resultData.routePrimaryAction || '',
      identityResolutionStatus: resultData.identityResolutionStatus || '',
      taxonomyMatchStatus: resultData.taxonomyMatchStatus || '',
      problemId: resultData.finalResult?.problemId || '',
      problemKey: decodeProblemKey(resultData.finalResult?.problemId || ''),
      displayName: resultData.finalResult?.displayName || '',
      severity: resultData.finalResult?.severity || ''
    },
    history: {
      attempt: history.attempt,
      historyId: matchedHistory.historyId,
      resultId: matchedHistory.resultId,
      nonProblematicType: matchedHistory.nonProblematicType || '',
      problemId: matchedHistory.summary?.problemId || '',
      problemKey: decodeProblemKey(matchedHistory.summary?.problemId || ''),
      displayName: matchedHistory.summary?.displayName || '',
      severity: matchedHistory.summary?.severity || ''
    }
  }
}

async function runDiagnoseVisualSmoke(envId, authResult, args) {
  const baseOptions = buildDiagnoseBaseOptions(args)
  const token = authResult.access_token
  const plantCatalogId = String(args['plant-catalog-id'] || '1')
  const requestedStartMode = normalizeText(args['start-mode'] || 'sync')
  const startMode = requestedStartMode === 'stream' ? 'stream' : 'sync'
  const keepUploadedImage = normalizeBooleanArg(args['keep-uploaded-image'], false)
  const minObservedSymptoms = Number(args['min-observed-symptoms'] || 0)
  const minObservedEvidenceCount = Number(args['min-observed-evidence-count'] || 0)
  const expectedObservedEvidenceSymptomKeys = normalizeTextList(
    parseCsvArg(args['expect-observed-evidence-symptom-keys'])
  )
  const expectedFollowUpRequired = resolveOptionalBooleanExpectation(args['expect-follow-up-required'])
  const expectedFastConvergenceApplied = resolveOptionalBooleanExpectation(
    args['expect-fast-convergence-applied']
  )
  const expectedFastConvergencePolicy = normalizeText(args['expect-fast-convergence-policy'] || '')
  const useInlineImage = normalizeInlineImageMode(args)
  const imageFiles = await readImageFiles(args)
  let uploadedImages = []
  let uploadAttempts = []
  const cleanupResult = {
    attempted: false,
    deleted: false,
    deletedCount: 0,
    skipped: false,
    error: ''
  }
  let batchReviewResult = {
    attempted: false,
    skipped: true,
    batchSource: '',
    diagnosisSessionId: '',
    inserted: 0,
    updated: 0,
    skippedCount: 0
  }

  try {
    const diagnoseHealth = await callFunctionWithRetry(envId, token, {
      ...baseOptions,
      path: 'diagnose-http/health',
      method: 'GET'
    })
    assertCondition(diagnoseHealth.ok, `diagnose health 请求失败: HTTP ${diagnoseHealth.status}`)
    const diagnoseHealthData = extractEnvelopeData(diagnoseHealth.body)

    let storageHealth = null
    let storageHealthData = null
    const imageRefs = imageFiles.map(item => item.dataUrl)

    if (!useInlineImage) {
      storageHealth = await callFunctionWithRetry(envId, token, {
        ...baseOptions,
        path: 'storage-http/storage/health',
        method: 'GET'
      })
      assertCondition(storageHealth.ok, `storage health 请求失败: HTTP ${storageHealth.status}`)
      storageHealthData = extractEnvelopeData(storageHealth.body)

      uploadedImages = []
      uploadAttempts = []

      for (const imageFile of imageFiles) {
        const upload = await callFunctionWithRetry(envId, token, {
          ...baseOptions,
          path: 'storage-http/storage/diagnose-images',
          method: 'POST',
          body: {
            dataUrl: imageFile.dataUrl,
            suffix: imageFile.suffix,
            plantId: plantCatalogId,
            maxAge: Number(args['image-max-age'] || 7200)
          }
        }, {
          maxAttempts: Number(args['upload-retries'] || 3),
          delayMs: Number(args['retry-delay-ms'] || 1500)
        })
        assertCondition(upload.ok, `upload 请求失败: HTTP ${upload.status} ${JSON.stringify(upload.body)}`)

        const uploadedImage = extractEnvelopeData(upload.body)
        assertCondition(uploadedImage?.fileId, 'upload 未返回 fileId')
        assertCondition(uploadedImage?.tempUrl || uploadedImage?.url, 'upload 未返回 tempUrl')

        uploadedImages.push({
          ...uploadedImage,
          uploadCompression: buildSmokeUploadCompressionTrace(imageFile)
        })
        uploadAttempts.push(upload.attempt || 0)
      }
    }

    const normalizedImageRefs = useInlineImage
      ? imageRefs
      : uploadedImages.map(item => String(item?.tempUrl || item?.url || '').trim())
    const structuredImages = buildStructuredImageList(normalizedImageRefs, uploadedImages, args)

    const flow = await runDiagnosisSessionFlow(envId, token, {
      baseOptions,
      startBody: {
        plantCatalogId,
        image: normalizedImageRefs[0] || '',
        images: structuredImages,
        observedSymptoms: []
      },
      args,
      defaultOutcomeIfMissing: '',
      startMode
    })
    const {
      start,
      startData,
      answerRounds,
      finalAnswerData,
      result,
      resultData,
      history,
      matchedHistory
    } = flow

    const observedSymptoms = Array.isArray(resultData?.observedSymptoms) ? resultData.observedSymptoms : []
    const observedEvidenceSet = Array.isArray(resultData?.observedEvidenceSet) ? resultData.observedEvidenceSet : []
    if (minObservedSymptoms > 0) {
      assertCondition(
        observedSymptoms.length >= minObservedSymptoms,
        `视觉抽取 observedSymptoms 数量不足: ${observedSymptoms.length} < ${minObservedSymptoms}`
      )
    }
    if (minObservedEvidenceCount > 0) {
      assertCondition(
        observedEvidenceSet.length >= minObservedEvidenceCount,
        `视觉抽取 observedEvidenceSet 数量不足: ${observedEvidenceSet.length} < ${minObservedEvidenceCount}`
      )
    }
    if (expectedObservedEvidenceSymptomKeys.length) {
      const observedEvidenceSymptomKeys = normalizeTextList(
        observedEvidenceSet.map(item => item?.symptomKey || '')
      )
      const missingSymptomKeys = expectedObservedEvidenceSymptomKeys.filter(
        symptomKey => !observedEvidenceSymptomKeys.includes(symptomKey)
      )
      assertCondition(
        missingSymptomKeys.length === 0,
        `视觉抽取 observedEvidenceSet 缺少预期 symptomKey: ${missingSymptomKeys.join(', ')}`
      )
    }
    if (expectedFollowUpRequired !== null) {
      assertCondition(
        Boolean(finalAnswerData?.followUpRequired) === expectedFollowUpRequired,
        `followUpRequired 异常: ${Boolean(finalAnswerData?.followUpRequired)}`
      )
      assertCondition(
        Boolean(resultData?.followUpRequired) === expectedFollowUpRequired,
        `result followUpRequired 异常: ${Boolean(resultData?.followUpRequired)}`
      )
    }

    const finalFastConvergence = finalAnswerData?.highSpecificityFastConvergence || null
    const resultFastConvergence = resultData?.highSpecificityFastConvergence || null
    if (expectedFastConvergenceApplied !== null) {
      assertCondition(
        Boolean(finalFastConvergence?.applied) === expectedFastConvergenceApplied,
        `highSpecificityFastConvergence.applied 异常: ${Boolean(finalFastConvergence?.applied)}`
      )
      assertCondition(
        Boolean(resultFastConvergence?.applied) === expectedFastConvergenceApplied,
        `result highSpecificityFastConvergence.applied 异常: ${Boolean(resultFastConvergence?.applied)}`
      )
    }
    if (expectedFastConvergencePolicy) {
      assertCondition(
        normalizeText(finalFastConvergence?.policy || '') === expectedFastConvergencePolicy,
        `highSpecificityFastConvergence.policy 异常: ${finalFastConvergence?.policy || ''}`
      )
      assertCondition(
        normalizeText(resultFastConvergence?.policy || '') === expectedFastConvergencePolicy,
        `result highSpecificityFastConvergence.policy 异常: ${resultFastConvergence?.policy || ''}`
      )
    }

    if (normalizeBooleanArg(args['import-batch-review'], true)) {
      const batchReviewRecord = buildVisualSmokeBatchReviewRecord({
        args,
        answerRounds,
        imageFiles,
        resultData,
        startData
      })
      assertCondition(batchReviewRecord.diagnosisSessionId, 'review importBatch 缺少 diagnosisSessionId')
      batchReviewResult = await importVisualSmokeBatchReview(envId, token, {
        args,
        baseOptions,
        record: batchReviewRecord
      })
    }

    if (!keepUploadedImage && uploadedImages.length) {
      cleanupResult.attempted = true
      let deletedCount = 0
      for (const uploadedImage of uploadedImages) {
        const cleanup = await callFunctionWithRetry(envId, token, {
          ...baseOptions,
          path: 'storage-http/storage/diagnose-images',
          method: 'DELETE',
          body: {
            fileId: uploadedImage.fileId
          }
        }, {
          maxAttempts: Number(args['cleanup-retries'] || 2),
          delayMs: Number(args['retry-delay-ms'] || 1500)
        })
        assertCondition(cleanup.ok, `cleanup 请求失败: HTTP ${cleanup.status} ${JSON.stringify(cleanup.body)}`)
        deletedCount += 1
      }
      cleanupResult.deleted = deletedCount === uploadedImages.length
      cleanupResult.deletedCount = deletedCount
    } else {
      cleanupResult.skipped = true
    }

    return {
      smoke: 'diagnose-visual',
      envId,
      deviceId: args['device-id'],
      image: {
        path: imageFiles[0]?.resolvedPath || '',
        paths: imageFiles.map(item => item.resolvedPath),
        suffix: imageFiles[0]?.suffix || '',
        suffixes: imageFiles.map(item => item.suffix),
        size: imageFiles.reduce((sum, item) => sum + Number(item.size || 0), 0),
        originalSize: imageFiles.reduce((sum, item) => sum + Number(item.originalSize || item.size || 0), 0),
        compression: imageFiles.map(item => item.compression || null),
        imageCount: imageFiles.length,
        sourceType: useInlineImage ? 'inline_data_url' : 'storage_temp_url'
      },
      storageHealth: {
        attempt: storageHealth?.attempt || 0,
        status: storageHealthData?.status || (useInlineImage ? 'skipped_inline_mode' : '')
      },
      diagnoseHealth: {
        attempt: diagnoseHealth.attempt,
        ready: diagnoseHealthData?.refactor?.ready ?? null,
        runtimeSchema: diagnoseHealthData?.runtimeSchema?.schema || ''
      },
      upload: {
        attempt: uploadAttempts[0] || 0,
        attempts: uploadAttempts,
        uploadedCount: uploadedImages.length,
        fileId: uploadedImages[0]?.fileId || '',
        fileIds: uploadedImages.map(item => item?.fileId || '').filter(Boolean),
        cloudPath: uploadedImages[0]?.cloudPath || '',
        cloudPaths: uploadedImages.map(item => item?.cloudPath || '').filter(Boolean),
        tempUrlHost: (() => {
          try {
            return new URL(String(uploadedImages[0]?.tempUrl || uploadedImages[0]?.url || '')).host
          } catch {
            return ''
          }
        })(),
        skipped: useInlineImage
      },
      start: {
        attempt: start.attempt,
        transport: flow.startMode,
        diagnosisSessionId: startData.diagnosisSessionId,
        roundId: startData.roundId,
        stage: startData.stage || '',
        outcomeType: startData.outcomeType || '',
        nonProblematicType: startData.nonProblematicType || '',
        routePrimaryAction: startData.routePrimaryAction || '',
        identityResolutionStatus: startData.identityResolutionStatus || '',
        taxonomyMatchStatus: startData.taxonomyMatchStatus || '',
        followUpRequired: Boolean(startData.followUpRequired),
        imageCount: structuredImages.length,
        inputSlotTypes: structuredImages.map(item => item.inputSlotType),
        questionCount: Array.isArray(startData.questions) ? startData.questions.length : 0,
        observedSymptomsCount: Array.isArray(startData.observedSymptoms)
          ? startData.observedSymptoms.length
          : 0,
        observedSymptomKeys: (Array.isArray(startData.observedSymptoms) ? startData.observedSymptoms : [])
          .map(item => String(item?.symptomKey || '').trim())
          .filter(Boolean),
        sseReplyCount: Array.isArray(start.replyEvents) ? start.replyEvents.length : 0,
        sseEventCount: Array.isArray(start.events) ? start.events.length : 0
      },
      answer: {
        attempts: answerRounds,
        outcomeType: finalAnswerData.outcomeType || '',
        routePrimaryAction: finalAnswerData.routePrimaryAction || '',
        identityResolutionStatus: finalAnswerData.identityResolutionStatus || '',
        taxonomyMatchStatus: finalAnswerData.taxonomyMatchStatus || '',
        stopReason: finalAnswerData.stopReason || '',
        nonProblematicType: finalAnswerData.nonProblematicType || '',
        resultId: finalAnswerData.finalResult.resultId,
        problemId: finalAnswerData.finalResult.problemId || '',
        problemKey: decodeProblemKey(finalAnswerData.finalResult.problemId || ''),
        followUpRequired: Boolean(finalAnswerData.followUpRequired),
        fastConvergenceApplied: Boolean(finalAnswerData.highSpecificityFastConvergence?.applied),
        fastConvergencePolicy: finalAnswerData.highSpecificityFastConvergence?.policy || '',
        displayName: finalAnswerData.finalResult.displayName,
        severity: finalAnswerData.finalResult.severity,
        confidenceLevel: finalAnswerData.confidenceLevel || '',
        needHumanReview: Boolean(finalAnswerData.needHumanReview)
      },
      result: {
        attempt: result.attempt,
        diagnosisSessionId: resultData.diagnosisSessionId || '',
        nonProblematicType: resultData.nonProblematicType || '',
        routePrimaryAction: resultData.routePrimaryAction || '',
        identityResolutionStatus: resultData.identityResolutionStatus || '',
        taxonomyMatchStatus: resultData.taxonomyMatchStatus || '',
        problemId: resultData.finalResult?.problemId || '',
        problemKey: decodeProblemKey(resultData.finalResult?.problemId || ''),
        followUpRequired: Boolean(resultData.followUpRequired),
        fastConvergenceApplied: Boolean(resultData.highSpecificityFastConvergence?.applied),
        fastConvergencePolicy: resultData.highSpecificityFastConvergence?.policy || '',
        displayName: resultData.finalResult?.displayName || '',
        severity: resultData.finalResult?.severity || '',
        observedSymptomsCount: observedSymptoms.length,
        observedSymptomKeys: observedSymptoms.map(item => String(item?.symptomKey || '').trim()).filter(Boolean),
        observedEvidenceSetCount: observedEvidenceSet.length,
        observedEvidenceSymptomKeys: observedEvidenceSet
          .map(item => String(item?.symptomKey || '').trim())
          .filter(Boolean)
      },
      history: {
        attempt: history.attempt,
        historyId: matchedHistory.historyId,
        resultId: matchedHistory.resultId,
        nonProblematicType: matchedHistory.nonProblematicType || '',
        problemId: matchedHistory.summary?.problemId || '',
        problemKey: decodeProblemKey(matchedHistory.summary?.problemId || ''),
        displayName: matchedHistory.summary?.displayName || '',
        severity: matchedHistory.summary?.severity || ''
      },
      batchReview: batchReviewResult,
      cleanup: cleanupResult
    }
  } catch (error) {
    if (!keepUploadedImage && uploadedImages.length && !cleanupResult.deleted) {
      cleanupResult.attempted = true
      try {
        let deletedCount = 0
        for (const uploadedImage of uploadedImages) {
          const cleanup = await callFunctionWithRetry(envId, token, {
            ...baseOptions,
            path: 'storage-http/storage/diagnose-images',
            method: 'DELETE',
            body: {
              fileId: uploadedImage.fileId
            }
          }, {
            maxAttempts: Number(args['cleanup-retries'] || 2),
            delayMs: Number(args['retry-delay-ms'] || 1500)
          })
          if (cleanup.ok) {
            deletedCount += 1
            continue
          }

          cleanupResult.error = `HTTP ${cleanup.status}`
        }
        cleanupResult.deletedCount = deletedCount
        cleanupResult.deleted = deletedCount === uploadedImages.length
      } catch (cleanupError) {
        cleanupResult.error = String(cleanupError?.message || cleanupError || '')
      }
    }

    throw error
  }
}

async function runWithParsedArgs(args = {}) {
  const envId = args.env || process.env.CLOUDBASE_ENV_ID || ''
  const skipAuth = normalizeBooleanArg(args['skip-auth'], false)
  const forceAnonymousAuth = normalizeBooleanArg(args['force-anonymous-auth'], false)
  const emitAuthToken = normalizeBooleanArg(args['emit-auth-token'], false)
  const injectedAuthResult = resolveInjectedAuthResult(args) || await readCachedAuthResult()

  if (!envId) {
    throw new Error('缺少 --env=cloudbase-env-id')
  }

  const deviceId =
    args['device-id'] ||
    `codex-terminal-${crypto.randomUUID()}`

  const shouldSignInAnonymously = !injectedAuthResult && (!skipAuth || forceAnonymousAuth)
  const authResult = injectedAuthResult ||
    (shouldSignInAnonymously
      ? await signInAnonymously(envId, deviceId)
      : {
          access_token: '',
          token_type: 'SkipAuth',
          scope: 'skip_auth',
          expires_in: 0,
          sub: args.openid || ''
        })
  if (!injectedAuthResult && String(authResult?.access_token || '').trim()) {
    await writeCachedAuthResult(authResult)
  }

  const summary = {
    envId,
    deviceId,
    auth: {
      tokenType: authResult.token_type || 'Bearer',
      scope: authResult.scope || '',
      expiresIn: Number(authResult.expires_in || 0),
      sub: authResult.sub || '',
      forcedAnonymousAuth: forceAnonymousAuth,
      accessToken: emitAuthToken ? String(authResult.access_token || '') : ''
    }
  }

  if (String(args.smoke || '') === 'diagnose') {
    const smokeSummary = await runDiagnoseSmoke(envId, authResult, args)
    return {
      ...summary,
      smoke: smokeSummary
    }
  }

  if (String(args.smoke || '') === 'diagnose-visual') {
    const smokeSummary = await runDiagnoseVisualSmoke(envId, authResult, args)
    return {
      ...summary,
      smoke: smokeSummary
    }
  }

  if (!args.path) {
    return summary
  }

  const query = safeJsonParse(args.query, {})
  const body = safeJsonParse(args.body, null)
  const baseOptions = buildDiagnoseBaseOptions(args)
  const result = await callFunction(envId, authResult.access_token, {
    path: args.path,
    method: args.method || 'GET',
    query,
    body,
    openid: args.openid || baseOptions.openid || '',
    appEnv: baseOptions.appEnv || '',
    terminalE2E: baseOptions.terminalE2E,
    skipAuth: baseOptions.skipAuth
  })

  return {
    ...summary,
    request: {
      path: args.path,
      method: String(args.method || 'GET').toUpperCase(),
      query,
      body,
      hasOpenIdHeader: Boolean(args.openid || baseOptions.openid),
      appEnv: baseOptions.appEnv || '',
      terminalE2E: baseOptions.terminalE2E
    },
    response: result
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const payload = await runWithParsedArgs(args)
  await writeJsonAndExit(payload)
}

function writeJsonAndExit(payload, exitCode = 0) {
  return new Promise(resolve => {
    const text = `${JSON.stringify(payload, null, 2)}\n`
    process.stdout.write(text, () => {
      process.exit(exitCode)
      resolve()
    })
  })
}

function writeErrorAndExit(error) {
  return new Promise(resolve => {
    const text = `${error && (error.stack || error.message || error)}\n`
    process.stderr.write(text, () => {
      process.exit(1)
      resolve()
    })
  })
}

export {
  parseArgs,
  runWithParsedArgs
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    writeErrorAndExit(error)
  })
}
