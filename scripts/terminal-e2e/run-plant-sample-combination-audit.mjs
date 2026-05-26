#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

const DEFAULT_BASE_URL = 'http://localhost:5173/__tcb_functions__'
const DEFAULT_SAMPLES_DIR = path.resolve('plant-sample/symptoms')
const DEFAULT_REPORT_FILE = path.resolve(
  'scripts/terminal-e2e/manifests/plant-sample-combination-audit.report.json'
)
const DEFAULT_MARKDOWN_FILE = path.resolve('docs/diagnose_plant_sample_health_report_v2.md')
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'])
const INLINE_IMAGE_SOFT_LIMIT_BYTES = 280 * 1024
const INLINE_IMAGE_TARGET_BYTES = 220 * 1024
const INLINE_IMAGE_PROFILES = [
  { width: 1600, quality: 72 },
  { width: 1280, quality: 60 },
  { width: 1080, quality: 55 },
  { width: 960, quality: 50 }
]

const BROWN_SPOT_PROBLEMS = new Set([
  'bacterial_leaf_spot',
  'fungal_leaf_spot',
  'anthracnose',
  'edema',
  'sunburn'
])

const CHEWING_PROBLEMS = new Set([
  'p_c25haWxzX3NsdWdz',
  'snails_slugs',
  'caterpillars',
  'leaf_chewing_insects',
  'chewing_damage'
])

const YELLOWING_PROBLEMS = new Set([
  'iron_deficiency',
  'nitrogen_deficiency',
  'low_light',
  'overwatering',
  'underwatering',
  'root_stress',
  'root_rot',
  'chlorosis'
])

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseCsvArg(value = '') {
  return String(value || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function _slugify(value = '') {
  return String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function safeJsonParse(value, fallback = null) {
  if (value === undefined || value === null || value === '') {return fallback}
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function collectCases(samplesDir, { includeLabels = [], includeFiles = [] } = {}) {
  const resolvedDir = path.resolve(samplesDir)
  const labels = await fs.readdir(resolvedDir, { withFileTypes: true })
  const cases = []
  const includeLabelSet = new Set(
    (Array.isArray(includeLabels) ? includeLabels : []).map(item => normalizeText(item))
  )
  const includeFileSet = new Set(
    (Array.isArray(includeFiles) ? includeFiles : []).map(item => normalizeText(item))
  )

  for (const labelEntry of labels) {
    if (!labelEntry.isDirectory()) {continue}
    if (includeLabelSet.size && !includeLabelSet.has(normalizeText(labelEntry.name))) {continue}
    const labelDir = path.join(resolvedDir, labelEntry.name)
    const files = await fs.readdir(labelDir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile()) {continue}
      if (includeFileSet.size && !includeFileSet.has(normalizeText(file.name))) {continue}
      const extension = path.extname(file.name).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(extension)) {continue}
      cases.push({
        label: labelEntry.name,
        fileName: file.name,
        absolutePath: path.join(labelDir, file.name),
        inputSlotType: 'leaf',
        plantCatalogId: '1'
      })
    }
  }

  return cases.sort((left, right) => left.absolutePath.localeCompare(right.absolutePath, 'zh-Hans-CN'))
}

async function buildInlineBuffer(absolutePath) {
  const stat = await fs.stat(absolutePath)
  if (stat.size <= INLINE_IMAGE_SOFT_LIMIT_BYTES) {
    return {
      buffer: await fs.readFile(absolutePath),
      mimeTypeOverride: '',
      cleanup: async () => {}
    }
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diagnose-inline-'))

  try {
    let bestResult = null
    for (const [index, profile] of INLINE_IMAGE_PROFILES.entries()) {
      const targetPath = path.join(
        tempDir,
        `${path.basename(absolutePath, path.extname(absolutePath))}.${index}.jpg`
      )
      await execFile('/usr/bin/sips', [
        '-s',
        'format',
        'jpeg',
        '--setProperty',
        'formatOptions',
        String(profile.quality),
        '--resampleWidth',
        String(profile.width),
        absolutePath,
        '--out',
        targetPath
      ])
      const buffer = await fs.readFile(targetPath)
      bestResult = { buffer, mimeTypeOverride: 'image/jpeg' }
      if (buffer.length <= INLINE_IMAGE_TARGET_BYTES) {
        break
      }
    }

    return {
      buffer: bestResult?.buffer || (await fs.readFile(absolutePath)),
      mimeTypeOverride: bestResult?.mimeTypeOverride || '',
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    }
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

async function toDataUrl(absolutePath) {
  const { buffer, cleanup, mimeTypeOverride } = await buildInlineBuffer(absolutePath)
  const extension = path.extname(absolutePath).toLowerCase()
  const mimeType = mimeTypeOverride
    ? mimeTypeOverride
    : extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : extension === '.gif'
          ? 'image/gif'
          : 'image/jpeg'

  try {
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } finally {
    await cleanup()
  }
}

function buildDiagnosisStartPayload(caseItem, dataUrl, openid) {
  const clientContext = {
    source: 'plant-sample-combination-audit',
    platform: 'web',
    reviewSourceType: 'batch',
    visualInputVersion: 'multi_image_contract_v1',
    structuredImageCount: 1,
    auditLabel: caseItem.label,
    auditFileName: caseItem.fileName,
    auditCaseKey: `${caseItem.label}/${caseItem.fileName}`
  }

  return {
    skipAuth: true,
    openid,
    appEnv: 'development',
    plantCatalogId: caseItem.plantCatalogId,
    source: clientContext.source,
    platform: clientContext.platform,
    reviewSourceType: clientContext.reviewSourceType,
    visualInputVersion: clientContext.visualInputVersion,
    structuredImageCount: clientContext.structuredImageCount,
    auditLabel: clientContext.auditLabel,
    auditFileName: clientContext.auditFileName,
    auditCaseKey: clientContext.auditCaseKey,
    image: dataUrl,
    images: [
      {
        inputSlotType: caseItem.inputSlotType,
        inputSlotLabel: '图片1 叶片图',
        userDeclaredOrganType: caseItem.inputSlotType,
        imageRef: dataUrl
      }
    ],
    observedSymptoms: [],
    clientContext
  }
}

function buildHeaders({ openid = '', appEnv = 'development' } = {}) {
  return {
    'content-type': 'application/json',
    'x-terminal-e2e': 'true',
    ...(openid
      ? {
          'x-openid': openid,
          'x-wx-openid': openid
        }
      : {}),
    ...(appEnv
      ? {
          'x-app-env': appEnv,
          'x-env': appEnv
        }
      : {})
  }
}

async function requestJson(url, { method = 'GET', body = undefined, retries = 2, headers = {} } = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...buildHeaders(),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(90000)
      })

      const text = await response.text()
      const parsed = safeJsonParse(text, null)
      if (!response.ok) {
        const requestId = normalizeText(parsed?.requestId || '')
        throw new Error(
          `HTTP ${response.status}: ${parsed?.message || text.slice(0, 300) || 'request failed'}${
            requestId ? ` [requestId=${requestId}]` : ''
          }`
        )
      }
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`响应不是合法 JSON: ${text.slice(0, 300)}`)
      }
      if (Number(parsed.code ?? 200) !== 200) {
        throw new Error(parsed.message || '接口返回失败')
      }
      return parsed.data ?? null
    } catch (error) {
      lastError = error
      if (attempt >= retries) {
        error.requestUrl = url
        error.requestMethod = method
        error.requestBody = body
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 320 * attempt))
    }
  }

  throw lastError || new Error('request failed')
}

function buildOpenid(caseItem, pathTokens = []) {
  const raw = `${caseItem.label}:${caseItem.fileName}:${JSON.stringify(pathTokens)}`
  return `dev_terminal_combo_${crypto.createHash('md5').update(raw).digest('hex').slice(0, 20)}`
}

function buildStartUrl(baseUrl, openid = '') {
  const query = new URLSearchParams({
    webfn: 'true',
    skipAuth: 'true'
  })
  if (openid) {
    query.set('openid', openid)
  }
  return `${baseUrl}/diagnose-http/diagnosis/start?${query.toString()}`
}

function buildAnswerUrl(baseUrl, openid = '') {
  const query = new URLSearchParams({
    webfn: 'true',
    skipAuth: 'true'
  })
  if (openid) {
    query.set('openid', openid)
  }
  return `${baseUrl}/diagnose-http/diagnosis/answer?${query.toString()}`
}

function normalizeOptionId(option = {}) {
  return (
    normalizeText(option?.optionId) ||
    normalizeText(option?.optionKey) ||
    normalizeText(option?.answerValue)
  )
}

function fromBase64Url(value = '') {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${pad}`, 'base64').toString('utf8')
}

function decodePublicId(prefix = '', publicId = '') {
  const marker = `${prefix}_`
  const full = String(publicId || '')
  if (!full.startsWith(marker)) {return ''}
  const encoded = full.slice(marker.length)
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {return ''}

  try {
    return fromBase64Url(encoded)
  } catch {
    return ''
  }
}

function buildQuestionSignature(questions = []) {
  return (Array.isArray(questions) ? questions : [])
    .map(question => normalizeText(question?.questionId || question?.questionKey))
    .filter(Boolean)
    .join('|')
}

function buildRoundChoiceSets(questions = []) {
  const normalizedQuestions = (Array.isArray(questions) ? questions : [])
    .map(question => {
      const options = (Array.isArray(question?.options) ? question.options : [])
        .map(option => ({
          optionId: normalizeOptionId(option)
        }))
        .filter(option => option.optionId)

      if (!options.length) {
        return null
      }

      return { options }
    })
    .filter(Boolean)

  if (!normalizedQuestions.length) {
    return []
  }

  const questionSignature = buildQuestionSignature(questions)
  const combinations = []
  const walk = (index, current) => {
    if (index >= normalizedQuestions.length) {
      combinations.push({
        questionSignature,
        optionIds: current.slice()
      })
      return
    }

    const question = normalizedQuestions[index]
    for (const option of question.options) {
      current.push(option.optionId)
      walk(index + 1, current)
      current.pop()
    }
  }

  walk(0, [])
  return combinations
}

function buildCanonicalQuestions(data = {}) {
  const publicQuestions = Array.isArray(data?.questions) ? data.questions : []
  const queueItems = Array.isArray(data?.questionQueue?.questionItems)
    ? data.questionQueue.questionItems
    : []

  if (!queueItems.length) {
    return {
      questions: publicQuestions,
      queueQuestionKeys: [],
      publicQuestionKeys: publicQuestions
        .map(question => normalizeText(question?.questionKey || question?.questionId))
        .filter(Boolean),
      contractMismatch: false
    }
  }

  const allowedQuestionIds = new Set(
    queueItems.map(item => normalizeText(item?.questionId)).filter(Boolean)
  )
  const allowedQuestionKeys = new Set(
    queueItems.map(item => normalizeText(item?.questionKey)).filter(Boolean)
  )

  const filtered = publicQuestions.filter(question => {
    const questionId = normalizeText(question?.questionId)
    const questionKey = normalizeText(question?.questionKey)
    return (
      (questionId && allowedQuestionIds.has(questionId)) ||
      (questionKey && allowedQuestionKeys.has(questionKey))
    )
  })

  const queueQuestionKeys = queueItems
    .map(item => normalizeText(item?.questionKey || item?.questionId))
    .filter(Boolean)
  const publicQuestionKeys = publicQuestions
    .map(question => normalizeText(question?.questionKey || question?.questionId))
    .filter(Boolean)

  return {
    questions: filtered,
    queueQuestionKeys,
    publicQuestionKeys,
    contractMismatch: filtered.length === 0
  }
}

function extractProblemKey(data = {}) {
  const directProblemKey = normalizeText(data?.problemKey || data?.finalResult?.problemKey || '')
  if (directProblemKey) {return directProblemKey}

  return normalizeText(
    decodePublicId('p', data?.problemId || data?.finalResult?.problemId || ''),
    ''
  )
}

function extractDisplayName(data = {}) {
  return normalizeText(data?.displayName || data?.finalResult?.displayName || '')
}

function extractObservedEvidenceCount(data = {}) {
  const coreProcessCount = Number(data?.coreProcess?.evidence?.observedEvidenceCount || 0)
  if (coreProcessCount) {return coreProcessCount}
  const observedEvidenceSet = Array.isArray(data?.coreProcess?.evidence?.observedEvidenceSet)
    ? data.coreProcess.evidence.observedEvidenceSet
    : Array.isArray(data?.observedEvidenceSet)
      ? data.observedEvidenceSet
      : []
  return observedEvidenceSet.length
}

function extractDiagnosisDirectionLabels(data = {}) {
  const directions = Array.isArray(data?.coreProcess?.evidence?.diagnosisDirections)
    ? data.coreProcess.evidence.diagnosisDirections
    : Array.isArray(data?.diagnosisDirections)
      ? data.diagnosisDirections
      : []
  return directions
    .map(item => normalizeText(item?.label || item?.directionKey))
    .filter(Boolean)
}

function answerPathSignature(answerPath = []) {
  return answerPath
    .map(round =>
      round
        .map(item => `${item.questionId}:${item.optionId}`)
        .join('|')
    )
    .join(' -> ')
}

function choicePathSignature(choicePath = []) {
  return (Array.isArray(choicePath) ? choicePath : [])
    .map(round => {
      if (!round || typeof round !== 'object') {return ''}
      const questionSignature = normalizeText(round?.questionSignature)
      const optionIds = Array.isArray(round?.optionIds) ? round.optionIds.join('|') : ''
      return `${questionSignature}=>${optionIds}`
    })
    .join(' -> ')
}

function materializeAnswersForRound(questions = [], optionIds = [], expectedSignature = '') {
  const normalizedQuestions = Array.isArray(questions) ? questions : []
  const normalizedOptionIds = Array.isArray(optionIds) ? optionIds : []
  const actualSignature = buildQuestionSignature(normalizedQuestions)

  if (!normalizedQuestions.length) {
    return {
      ok: false,
      reason: 'missing_questions',
      answers: [],
      actualSignature,
      expectedSignature: normalizeText(expectedSignature)
    }
  }

  if (normalizeText(expectedSignature) && actualSignature !== normalizeText(expectedSignature)) {
    return {
      ok: false,
      reason: 'question_signature_drift',
      answers: [],
      actualSignature,
      expectedSignature: normalizeText(expectedSignature)
    }
  }

  if (normalizedQuestions.length !== normalizedOptionIds.length) {
    return {
      ok: false,
      reason: 'question_shape_drift',
      answers: [],
      actualSignature,
      expectedSignature: normalizeText(expectedSignature),
      expectedQuestionCount: normalizedQuestions.length,
      receivedOptionCount: normalizedOptionIds.length
    }
  }

  const answers = []
  for (let index = 0; index < normalizedQuestions.length; index += 1) {
    const question = normalizedQuestions[index] || {}
    const optionId = normalizeText(normalizedOptionIds[index])
    const option = (Array.isArray(question?.options) ? question.options : []).find(
      item => normalizeOptionId(item) === optionId
    )

    if (!option) {
      return {
        ok: false,
        reason: 'question_option_drift',
        answers: [],
        actualSignature,
        expectedSignature: normalizeText(expectedSignature),
        failedQuestionId: normalizeText(question?.questionId),
        failedOptionId: optionId
      }
    }

    answers.push({
      questionId: normalizeText(question?.questionId),
      questionText: normalizeText(question?.text || question?.questionText || question?.questionId),
      targetDimension: normalizeText(question?.targetDimension),
      optionId,
      optionText: normalizeText(option?.text || option?.label || option?.optionId)
    })
  }

  return {
    ok: true,
    reason: '',
    answers,
    actualSignature,
    expectedSignature: normalizeText(expectedSignature)
  }
}

async function mapWithConcurrency(items = [], concurrency = 1, worker) {
  const normalizedItems = Array.isArray(items) ? items : []
  const limit = Math.max(1, Number(concurrency || 1))
  const results = new Array(normalizedItems.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < normalizedItems.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(normalizedItems[currentIndex], currentIndex)
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, normalizedItems.length || 0) },
    () => runWorker()
  )
  await Promise.all(workers)
  return results
}

async function replayPath(
  baseUrl,
  caseItem,
  dataUrl,
  choicePath = [],
  {
    maxAnswerRounds = 2,
    branchConcurrency = 1,
    replayAttempts = 6,
    exploredStateKeys = new Set()
  } = {}
) {
  let currentData = null
  let actualAnswerPath = []
  let actualChoicePath = []
  let openid = ''

  for (let replayAttempt = 1; replayAttempt <= Math.max(1, Number(replayAttempts || 1)); replayAttempt += 1) {
    openid = buildOpenid(caseItem, [...choicePath, [`attempt_${replayAttempt}`]])
    const requestHeaders = buildHeaders({ openid, appEnv: 'development' })
    currentData = await requestJson(buildStartUrl(baseUrl, openid), {
      method: 'POST',
      headers: requestHeaders,
      body: buildDiagnosisStartPayload(caseItem, dataUrl, openid)
    })
    actualAnswerPath = []
    actualChoicePath = []
    for (const roundChoice of choicePath) {
      if (!roundChoice || typeof roundChoice !== 'object' || !Array.isArray(roundChoice.optionIds) || !roundChoice.optionIds.length) {
        return {
          ok: false,
          label: caseItem.label,
          fileName: caseItem.fileName,
          absolutePath: caseItem.absolutePath,
          diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
          answerPath: actualAnswerPath,
          answerPathSignature: answerPathSignature(actualAnswerPath),
          roundsUsed: actualAnswerPath.length,
          error: 'empty_answer_round'
        }
      }

      if (normalizeText(currentData?.stage) !== 'followup') {
        return {
          ok: false,
          label: caseItem.label,
          fileName: caseItem.fileName,
          diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
          answerPath: actualAnswerPath,
          answerPathSignature: answerPathSignature(actualAnswerPath),
          error: 'path replay drift: session reached final earlier than expected'
        }
      }

      const canonicalQuestionState = buildCanonicalQuestions(currentData)
      const materialized = materializeAnswersForRound(
        canonicalQuestionState.questions,
        roundChoice.optionIds,
        roundChoice.questionSignature
      )
      if (!materialized.ok) {
        if (materialized.reason === 'question_signature_drift') {
          const driftQuestionState = buildCanonicalQuestions(currentData)
          const driftQuestionSignature = buildQuestionSignature(driftQuestionState.questions)
          const driftStateKey = `${choicePathSignature(actualChoicePath)}::${driftQuestionSignature}`
          if (driftQuestionSignature && exploredStateKeys.has(driftStateKey)) {
            return []
          }
          if (driftQuestionSignature) {
            exploredStateKeys.add(driftStateKey)
          }
          if (normalizeText(currentData?.stage) === 'final') {
            return {
              ok: true,
              label: caseItem.label,
              fileName: caseItem.fileName,
              absolutePath: caseItem.absolutePath,
              diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
              answerPath: actualAnswerPath,
              answerPathSignature: answerPathSignature(actualAnswerPath),
              roundsUsed: actualAnswerPath.length,
              outcomeType: normalizeText(currentData?.outcomeType),
              nonProblematicType: normalizeText(currentData?.nonProblematicType),
              problemKey: extractProblemKey(currentData),
              displayName: extractDisplayName(currentData),
              routePrimaryAction: normalizeText(currentData?.routePrimaryAction),
              stopReason: normalizeText(currentData?.stopReason),
              observedEvidenceCount: extractObservedEvidenceCount(currentData),
              diagnosisDirectionLabels: extractDiagnosisDirectionLabels(currentData),
              questionCount: Array.isArray(currentData?.questions) ? currentData.questions.length : 0
            }
          }
          if (actualAnswerPath.length >= maxAnswerRounds) {
            return {
              ok: false,
              label: caseItem.label,
              fileName: caseItem.fileName,
              absolutePath: caseItem.absolutePath,
              diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
              answerPath: actualAnswerPath,
              answerPathSignature: answerPathSignature(actualAnswerPath),
              roundsUsed: actualAnswerPath.length,
              error: 'max_answer_rounds_exceeded_after_signature_drift',
              expectedSignature: materialized.expectedSignature,
              actualSignature: materialized.actualSignature,
              queueQuestionKeys: driftQuestionState.queueQuestionKeys,
              publicQuestionKeys: driftQuestionState.publicQuestionKeys
            }
          }
          const driftAnswerSets = buildRoundChoiceSets(driftQuestionState.questions)
          if (!driftAnswerSets.length) {
            return {
              ok: false,
              label: caseItem.label,
              fileName: caseItem.fileName,
              absolutePath: caseItem.absolutePath,
              diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
              answerPath: actualAnswerPath,
              answerPathSignature: answerPathSignature(actualAnswerPath),
              roundsUsed: actualAnswerPath.length,
              error: driftQuestionState.contractMismatch
                ? 'question_contract_mismatch_after_signature_drift'
                : 'followup_without_question_options_after_signature_drift',
              expectedSignature: materialized.expectedSignature,
              actualSignature: materialized.actualSignature,
              queueQuestionKeys: driftQuestionState.queueQuestionKeys,
              publicQuestionKeys: driftQuestionState.publicQuestionKeys
            }
          }

          const driftLeaves = []
          const driftBranchResults = await mapWithConcurrency(
            driftAnswerSets,
            branchConcurrency,
            async answerSet => {
              try {
                const result = await replayPath(
                  baseUrl,
                  caseItem,
                  dataUrl,
                  [...actualChoicePath, answerSet],
                  { maxAnswerRounds, branchConcurrency, replayAttempts, exploredStateKeys }
                )
                return Array.isArray(result) ? result : [result]
              } catch (error) {
                return [{
                  ok: false,
                  label: caseItem.label,
                  fileName: caseItem.fileName,
                  absolutePath: caseItem.absolutePath,
                  answerPath: actualAnswerPath,
                  answerPathSignature: choicePathSignature([...actualChoicePath, answerSet]),
                  roundsUsed: actualAnswerPath.length + 1,
                  error: String(error?.message || error || 'branch_replay_failed'),
                  requestUrl: normalizeText(error?.requestUrl),
                  requestMethod: normalizeText(error?.requestMethod || 'POST')
                }]
              }
            }
          )
          driftBranchResults.forEach(resultGroup => driftLeaves.push(...resultGroup))
          return driftLeaves
        }

        return {
          ok: false,
          label: caseItem.label,
          fileName: caseItem.fileName,
          absolutePath: caseItem.absolutePath,
          diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
          answerPath: actualAnswerPath,
          answerPathSignature: answerPathSignature(actualAnswerPath),
          roundsUsed: actualAnswerPath.length,
          error: materialized.reason,
          queueQuestionKeys: canonicalQuestionState.queueQuestionKeys,
          publicQuestionKeys: canonicalQuestionState.publicQuestionKeys,
          expectedQuestionCount: materialized.expectedQuestionCount,
          receivedOptionCount: materialized.receivedOptionCount,
          failedQuestionId: materialized.failedQuestionId,
          failedOptionId: materialized.failedOptionId,
          expectedSignature: materialized.expectedSignature,
          actualSignature: materialized.actualSignature
        }
      }

      const answers = materialized.answers

      try {
        currentData = await requestJson(buildAnswerUrl(baseUrl, openid), {
          method: 'POST',
          headers: requestHeaders,
          body: {
            skipAuth: true,
            openid,
            appEnv: 'development',
            diagnosisSessionId: currentData.diagnosisSessionId,
            roundId: currentData.roundId,
            answers: answers.map(item => ({
              questionId: item.questionId,
              optionId: item.optionId
            }))
          }
        })
      } catch (error) {
        return {
          ok: false,
          label: caseItem.label,
          fileName: caseItem.fileName,
          absolutePath: caseItem.absolutePath,
          diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
          answerPath: [...actualAnswerPath, answers],
          answerPathSignature: answerPathSignature([...actualAnswerPath, answers]),
          roundsUsed: actualAnswerPath.length + 1,
          error: String(error?.message || error || 'answer_request_failed'),
          requestUrl: normalizeText(error?.requestUrl),
          requestMethod: normalizeText(error?.requestMethod || 'POST')
        }
      }

      actualAnswerPath.push(answers)
      actualChoicePath.push({
        questionSignature: materialized.actualSignature,
        optionIds: answers.map(item => item.optionId)
      })
    }
    break
  }

  const stage = normalizeText(currentData?.stage)
  if (stage === 'final') {
    return {
      ok: true,
      label: caseItem.label,
      fileName: caseItem.fileName,
      absolutePath: caseItem.absolutePath,
      diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
      answerPath: actualAnswerPath,
      answerPathSignature: answerPathSignature(actualAnswerPath),
      roundsUsed: actualAnswerPath.length,
      outcomeType: normalizeText(currentData?.outcomeType),
      nonProblematicType: normalizeText(currentData?.nonProblematicType),
      problemKey: extractProblemKey(currentData),
      displayName: extractDisplayName(currentData),
      routePrimaryAction: normalizeText(currentData?.routePrimaryAction),
      stopReason: normalizeText(currentData?.stopReason),
      observedEvidenceCount: extractObservedEvidenceCount(currentData),
      diagnosisDirectionLabels: extractDiagnosisDirectionLabels(currentData),
      questionCount: Array.isArray(currentData?.questions) ? currentData.questions.length : 0
    }
  }

  if (actualAnswerPath.length >= maxAnswerRounds) {
    return {
      ok: false,
      label: caseItem.label,
      fileName: caseItem.fileName,
      absolutePath: caseItem.absolutePath,
      diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
      answerPath: actualAnswerPath,
      answerPathSignature: answerPathSignature(actualAnswerPath),
      roundsUsed: actualAnswerPath.length,
      error: 'max_answer_rounds_exceeded'
    }
  }

  const canonicalQuestionState = buildCanonicalQuestions(currentData)
  const currentQuestionSignature = buildQuestionSignature(canonicalQuestionState.questions)
  const currentStateKey = `${choicePathSignature(actualChoicePath)}::${currentQuestionSignature}`
  if (currentQuestionSignature && exploredStateKeys.has(currentStateKey)) {
    return []
  }
  if (currentQuestionSignature) {
    exploredStateKeys.add(currentStateKey)
  }
  const answerSets = buildRoundChoiceSets(canonicalQuestionState.questions)
  if (!answerSets.length) {
    return {
      ok: false,
      label: caseItem.label,
      fileName: caseItem.fileName,
      absolutePath: caseItem.absolutePath,
      diagnosisSessionId: normalizeText(currentData?.diagnosisSessionId),
      answerPath: actualAnswerPath,
      answerPathSignature: answerPathSignature(actualAnswerPath),
      roundsUsed: actualAnswerPath.length,
      error: canonicalQuestionState.contractMismatch
        ? 'question_contract_mismatch'
        : 'followup_without_question_options',
      queueQuestionKeys: canonicalQuestionState.queueQuestionKeys,
      publicQuestionKeys: canonicalQuestionState.publicQuestionKeys
    }
  }

  const leaves = []
  const branchResults = await mapWithConcurrency(
    answerSets,
    branchConcurrency,
    async answerSet => {
      try {
        const result = await replayPath(
          baseUrl,
          caseItem,
          dataUrl,
          [...choicePath, answerSet],
          { maxAnswerRounds, branchConcurrency, replayAttempts, exploredStateKeys }
        )
        return Array.isArray(result) ? result : [result]
      } catch (error) {
        return [{
          ok: false,
          label: caseItem.label,
          fileName: caseItem.fileName,
          absolutePath: caseItem.absolutePath,
          answerPath: actualAnswerPath,
          answerPathSignature: choicePathSignature([...choicePath, answerSet]),
          roundsUsed: actualAnswerPath.length + 1,
          error: String(error?.message || error || 'branch_replay_failed'),
          requestUrl: normalizeText(error?.requestUrl),
          requestMethod: normalizeText(error?.requestMethod || 'POST')
        }]
      }
    }
  )
  branchResults.forEach(resultGroup => leaves.push(...resultGroup))
  return leaves
}

function scorePathAlignment(pathResult = {}) {
  const label = normalizeText(pathResult.label)
  const outcomeType = normalizeText(pathResult.outcomeType)
  const problemKey = normalizeText(pathResult.problemKey)

  if (label === 'healthy') {
    if (outcomeType === 'non_problematic') {return 1}
    if (outcomeType === 'uncertain') {return 0.75}
    return 0
  }

  if (label === 'chewing_damage') {
    if (outcomeType === 'uncertain') {return 0.4}
    if (outcomeType !== 'problematic') {return 0.2}
    return CHEWING_PROBLEMS.has(problemKey) ? 1 : 0
  }

  if (label === 'brown_spots') {
    if (outcomeType === 'uncertain') {return 0.45}
    if (outcomeType !== 'problematic') {return 0.2}
    return BROWN_SPOT_PROBLEMS.has(problemKey) ? 1 : 0.15
  }

  if (label === 'yellowing') {
    if (outcomeType === 'uncertain') {return 0.45}
    if (outcomeType === 'non_problematic') {return 0.2}
    return YELLOWING_PROBLEMS.has(problemKey) ? 1 : 0.15
  }

  return 0.5
}

function roundNumber(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function buildHealthReport(results = []) {
  const successful = results.filter(item => item.ok)
  const total = results.length || 1
  const followedUp = successful.filter(item => Number(item.roundsUsed || 0) > 0)
  const uncertainAfterFollowup = followedUp.filter(item => item.outcomeType === 'uncertain')
  const healthyPaths = successful.filter(item => item.label === 'healthy')
  const healthyProblematic = healthyPaths.filter(item => item.outcomeType === 'problematic')

  const alignmentByLabel = {}
  for (const item of successful) {
    const label = item.label || 'unknown'
    if (!alignmentByLabel[label]) {
      alignmentByLabel[label] = []
    }
    alignmentByLabel[label].push(scorePathAlignment(item))
  }

  const labelScores = Object.fromEntries(
    Object.entries(alignmentByLabel).map(([label, scores]) => [
      label,
      roundNumber(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length))
    ])
  )

  const pipelineScore = successful.length / total
  const healthySafetyScore = healthyPaths.length
    ? 1 - healthyProblematic.length / healthyPaths.length
    : 1
  const followupGovernanceScore = followedUp.length
    ? 1 - uncertainAfterFollowup.length / followedUp.length
    : 1
  const labelAlignmentScore = Object.values(labelScores).length
    ? Object.values(labelScores).reduce((sum, value) => sum + Number(value || 0), 0) /
      Object.values(labelScores).length
    : 0

  const healthScore = roundNumber(
    pipelineScore * 25 +
      healthySafetyScore * 25 +
      followupGovernanceScore * 25 +
      labelAlignmentScore * 25
  )

  return {
    score: healthScore,
    metrics: {
      pipelineSuccessRate: roundNumber(pipelineScore),
      healthyProblematicRate: roundNumber(healthyPaths.length ? healthyProblematic.length / healthyPaths.length : 0),
      followupUncertainRate: roundNumber(followedUp.length ? uncertainAfterFollowup.length / followedUp.length : 0),
      labelAlignmentScore: roundNumber(labelAlignmentScore)
    },
    labelScores
  }
}

function buildSummary(results = [], health = null) {
  const byLabel = {}
  const byOutcome = {}
  const byProblemKey = {}

  for (const item of results) {
    const label = item.label || 'unknown'
    if (!byLabel[label]) {
      byLabel[label] = {
        totalPaths: 0,
        successfulPaths: 0,
        errorPaths: 0,
        outcomes: {},
        problemKeys: {}
      }
    }

    byLabel[label].totalPaths += 1
    if (item.ok) {
      byLabel[label].successfulPaths += 1
      byOutcome[item.outcomeType || 'unknown'] = (byOutcome[item.outcomeType || 'unknown'] || 0) + 1
      if (item.problemKey) {
        byProblemKey[item.problemKey] = (byProblemKey[item.problemKey] || 0) + 1
        byLabel[label].problemKeys[item.problemKey] = (byLabel[label].problemKeys[item.problemKey] || 0) + 1
      }
      byLabel[label].outcomes[item.outcomeType || 'unknown'] =
        (byLabel[label].outcomes[item.outcomeType || 'unknown'] || 0) + 1
    } else {
      byLabel[label].errorPaths += 1
    }
  }

  return {
    totalPaths: results.length,
    successfulPaths: results.filter(item => item.ok).length,
    errorPaths: results.filter(item => !item.ok).length,
    byLabel,
    byOutcome,
    byProblemKey,
    health
  }
}

function toMarkdown({ generatedAt, baseUrl, schema, summary, results }) {
  const lines = []
  lines.push('# plant-sample 组合诊断健康报告 v2')
  lines.push('')
  lines.push(`- 生成时间: ${generatedAt}`)
  lines.push(`- 代理入口: \`${baseUrl}\``)
  lines.push(`- 调试 schema: \`${schema}\``)
  lines.push(`- 总路径数: ${summary.totalPaths}`)
  lines.push(`- 成功路径数: ${summary.successfulPaths}`)
  lines.push(`- 错误路径数: ${summary.errorPaths}`)
  lines.push(`- 健康评分: **${summary.health?.score ?? 0}/100**`)
  lines.push('')
  lines.push('## 核心指标')
  lines.push('')
  lines.push(`- pipelineSuccessRate: ${summary.health?.metrics?.pipelineSuccessRate ?? 0}`)
  lines.push(`- healthyProblematicRate: ${summary.health?.metrics?.healthyProblematicRate ?? 0}`)
  lines.push(`- followupUncertainRate: ${summary.health?.metrics?.followupUncertainRate ?? 0}`)
  lines.push(`- labelAlignmentScore: ${summary.health?.metrics?.labelAlignmentScore ?? 0}`)
  lines.push('')
  lines.push('## 标签评分')
  lines.push('')
  for (const [label, score] of Object.entries(summary.health?.labelScores || {})) {
    lines.push(`- ${label}: ${score}`)
  }
  lines.push('')
  lines.push('## 标签分布')
  lines.push('')
  for (const [label, item] of Object.entries(summary.byLabel || {})) {
    lines.push(`### ${label}`)
    lines.push(`- totalPaths: ${item.totalPaths}`)
    lines.push(`- successfulPaths: ${item.successfulPaths}`)
    lines.push(`- errorPaths: ${item.errorPaths}`)
    lines.push(`- outcomes: ${JSON.stringify(item.outcomes, null, 0)}`)
    lines.push(`- problemKeys: ${JSON.stringify(item.problemKeys, null, 0)}`)
    lines.push('')
  }

  const problematicExamples = results.filter(item => item.ok && item.outcomeType === 'problematic').slice(0, 12)
  lines.push('## 代表性路径样例')
  lines.push('')
  for (const item of problematicExamples) {
    lines.push(`- ${item.label}/${item.fileName}: ${item.displayName || item.problemKey || item.outcomeType}`)
    lines.push(`  - session: ${item.diagnosisSessionId}`)
    lines.push(`  - roundsUsed: ${item.roundsUsed}`)
    lines.push(`  - path: ${item.answerPathSignature || 'start_final'}`)
  }

  return `${lines.join('\n')}\n`
}

async function writeOutputArtifacts(output, { reportFile, markdownFile }) {
  await fs.mkdir(path.dirname(reportFile), { recursive: true })
  await fs.writeFile(reportFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  await fs.mkdir(path.dirname(markdownFile), { recursive: true })
  await fs.writeFile(markdownFile, toMarkdown(output), 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = normalizeText(args['base-url'] || DEFAULT_BASE_URL)
  const samplesDir = normalizeText(args['samples-dir'] || DEFAULT_SAMPLES_DIR)
  const reportFile = path.resolve(normalizeText(args['report-file'] || DEFAULT_REPORT_FILE))
  const markdownFile = path.resolve(normalizeText(args['markdown-file'] || DEFAULT_MARKDOWN_FILE))
  const maxAnswerRounds = Math.max(1, Number(args['max-answer-rounds'] || 2))
  const branchConcurrency = Math.max(1, Number(args['branch-concurrency'] || 1))
  const includeLabels = parseCsvArg(args.labels || args['include-labels'] || '')
  const includeFiles = parseCsvArg(args.files || args['include-files'] || '')

  const cases = await collectCases(samplesDir, { includeLabels, includeFiles })
  assertCondition(cases.length > 0, `未找到样本: ${samplesDir}`)

  const results = []
  for (const [index, caseItem] of cases.entries()) {
    process.stdout.write(`[${index + 1}/${cases.length}] ${caseItem.label}/${caseItem.fileName} start\n`)
    const dataUrl = await toDataUrl(caseItem.absolutePath)
    try {
      const leaves = await replayPath(baseUrl, caseItem, dataUrl, [], {
        maxAnswerRounds,
        branchConcurrency
      })
      const normalizedLeaves = Array.isArray(leaves) ? leaves : [leaves]
      results.push(...normalizedLeaves)
    } catch (error) {
      results.push({
        ok: false,
        label: caseItem.label,
        fileName: caseItem.fileName,
        absolutePath: caseItem.absolutePath,
        answerPath: [],
        answerPathSignature: 'start_failed',
        error: String(error?.message || error || 'unknown_error'),
        requestUrl: normalizeText(error?.requestUrl),
        requestMethod: normalizeText(error?.requestMethod || 'POST')
      })
    }

    const partialHealth = buildHealthReport(results)
    const partialOutput = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      schema: 'cloud1_dev',
      samplesDir: path.resolve(samplesDir),
      maxAnswerRounds,
      branchConcurrency,
      progress: {
        completedCases: index + 1,
        totalCases: cases.length,
        lastCase: {
          label: caseItem.label,
          fileName: caseItem.fileName
        }
      },
      summary: buildSummary(results, partialHealth),
      results
    }
    await writeOutputArtifacts(partialOutput, { reportFile, markdownFile })
    process.stdout.write(
      `[${index + 1}/${cases.length}] ${caseItem.label}/${caseItem.fileName} done paths=${partialOutput.summary.totalPaths}\n`
    )
  }

  const health = buildHealthReport(results)
  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    schema: 'cloud1_dev',
    samplesDir: path.resolve(samplesDir),
    maxAnswerRounds,
    branchConcurrency,
    summary: buildSummary(results, health),
    results
  }

  await writeOutputArtifacts(output, { reportFile, markdownFile })

  process.stdout.write(`${JSON.stringify({ reportFile, markdownFile, summary: output.summary }, null, 2)}\n`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
