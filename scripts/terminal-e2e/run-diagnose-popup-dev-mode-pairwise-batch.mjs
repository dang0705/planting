#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  writeSplitCanonicalBatchArtifacts
} from './lib/canonical-batch-artifacts.mjs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveLocalLayerPath(request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('/opt/utils/')) {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/utils', `${request.slice('/opt/utils/'.length)}.js`),
      parent,
      isMain,
      options
    )
  }
  if (request === '/opt/configs') {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/configs/index.js'),
      parent,
      isMain,
      options
    )
  }
  if (typeof request === 'string' && request.startsWith('/opt/configs/')) {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/configs', `${request.slice('/opt/configs/'.length)}.js`),
      parent,
      isMain,
      options
    )
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const app = require('../../cloudfunctions/diagnose-http/app')
const { runDiagnosisRound } = require('../../cloudfunctions/diagnose-http/domain/diagnosis-engine')
const { preloadQuestionRepositoryCache } = require('../../cloudfunctions/diagnose-http/repositories/question-repository')
const { models } = require('/opt/utils/cloudbase')

const SCRIPT_NAME = 'run-diagnose-popup-dev-mode-pairwise-batch.mjs'
const BATCH_SOURCE = 'diagnose-popup-dev-mode-pairwise'
const SOURCE_SCHEMA = 'diagnose_popup_dev_mode_pairwise_v1'
const BATCH_OPENID = 'anon_dev_diag_pairwise_batch'
const IMPORT_OPENID = 'dev_terminal_diag_pairwise_import'
const DEFAULT_USER_PLANT_ID = 5
const DEFAULT_PLANT_ID = '21'
const DEFAULT_REPORT_FILE = 'scripts/terminal-e2e/manifests/diagnose-popup-dev-mode-pairwise.report.json'
const DEFAULT_BATCH_ARTIFACTS_DIR = 'scripts/terminal-e2e/batch'
const DEFAULT_CONCLUSION_ARTIFACTS_DIR = 'scripts/terminal-e2e/conclusion'
const ENGINE_RUN_PATH_CACHE = new Map()
const ENGINE_RUN_PATH_PENDING = new Map()

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

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {return fallback}
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {return true}
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {return false}
  return fallback
}

function normalizeSqlForCache(sql = '') {
  return String(sql || '').replace(/\s+/g, ' ').trim()
}

function installSelectSqlCache({ enabled = false, slowSqlMs = 0 } = {}) {
  if (!enabled || models.__diagnosePairwiseSelectCacheInstalled) {return}
  const originalRunSQL = models.$runSQL.bind(models)
  const cache = new Map()
  const pending = new Map()
  models.$runSQL = async function cachedRunSQL(sql, params = {}) {
    const normalizedSql = normalizeSqlForCache(sql)
    const isReadOnlySelect = /^select\s/i.test(normalizedSql)
    if (!isReadOnlySelect) {
      return originalRunSQL(sql, params)
    }
    const key = JSON.stringify([normalizedSql, params || {}])
    if (cache.has(key)) {
      return cache.get(key)
    }
    if (pending.has(key)) {
      return pending.get(key)
    }
    const startedAt = Date.now()
    const promise = originalRunSQL(sql, params)
      .then(result => {
        const elapsedMs = Date.now() - startedAt
        if (Number(slowSqlMs || 0) > 0 && elapsedMs >= Number(slowSqlMs)) {
          process.stderr.write(
            `[pairwise-batch] slow SELECT ${elapsedMs}ms: ${normalizedSql.slice(0, 260)} params=${JSON.stringify(params || {}).slice(0, 260)}\n`
          )
        }
        cache.set(key, result)
        pending.delete(key)
        return result
      })
      .catch(error => {
        pending.delete(key)
        throw error
      })
    pending.set(key, promise)
    return promise
  }
  models.__diagnosePairwiseSelectCacheInstalled = true
  models.__diagnosePairwiseSelectCache = cache
  models.__diagnosePairwiseSelectPending = pending
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))))
}

function formatSqlText(value = '') {
  return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

function _formatSqlNullableText(value = '') {
  const normalized = normalizeText(value)
  return normalized ? formatSqlText(normalized) : 'NULL'
}

function sqlRows(result) {
  return result?.data?.executeResultList || result?.data?.rows || result?.rows || []
}

async function ensureBatchUserPlant({ openid = BATCH_OPENID, userPlantId = DEFAULT_USER_PLANT_ID } = {}) {
  const existing = await models.$runSQL(
    `
      SELECT id
      FROM user_plant_instances
      WHERE id = {{userPlantId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { userPlantId: Number(userPlantId), openid }
  )
  if (sqlRows(existing).length) {
    return Number(userPlantId)
  }

  const anyExisting = await models.$runSQL(
    `
      SELECT id
      FROM user_plant_instances
      WHERE _openid = {{openid}} AND plant_id = {{plantId}}
      ORDER BY id ASC
      LIMIT 1
    `,
    { openid, plantId: DEFAULT_PLANT_ID }
  )
  const found = sqlRows(anyExisting)[0]?.id
  if (found) {
    return Number(found)
  }

  await models.$runSQL(
    `
      INSERT INTO user_plant_instances (
        _openid, plant_id, canonical_name, recognized_name, source_type,
        recognition_type, recognition_confidence, identity_resolution_status,
        nickname, location, plant_genus, plant_family_en, plant_latin_name,
        created_at, updated_at
      ) VALUES (
        {{openid}}, {{plantId}}, '吊兰', '吊兰', 'catalog',
        'terminal_batch_seed', 1.0000, 'matched',
        '零模型批跑测试植株', 'terminal-e2e', 'Chlorophytum', 'Asparagaceae',
        'Chlorophytum comosum', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
    { openid, plantId: DEFAULT_PLANT_ID }
  )

  const inserted = await models.$runSQL(
    `
      SELECT id
      FROM user_plant_instances
      WHERE _openid = {{openid}} AND plant_id = {{plantId}}
      ORDER BY id DESC
      LIMIT 1
    `,
    { openid, plantId: DEFAULT_PLANT_ID }
  )
  const insertedId = Number(sqlRows(inserted)[0]?.id || 0)
  if (!insertedId) {
    throw new Error('无法准备零模型批跑测试植株')
  }
  return insertedId
}

function parseDevModesFromDiagnosePopup(source = '') {
  const objectMatches = Array.from(
    source.matchAll(/\{[\s\S]*?classKey:\s*['"]([^'"]+)['"][\s\S]*?classNameCn:\s*['"]([^'"]*)['"][\s\S]*?symptomKey:\s*['"]([^'"]+)['"][\s\S]*?symptomCn:\s*['"]([^'"]+)['"][\s\S]*?\}/g)
  )
  return objectMatches
    .map(match => ({
      modeKey: normalizeText(match[1]),
      classKey: normalizeText(match[1]),
      classNameCn: normalizeText(match[2]),
      symptomKey: normalizeText(match[3]),
      label: normalizeText(match[4])
    }))
    .filter(item => item.modeKey && item.classKey && item.symptomKey)
}

async function loadDevModes() {
  const filePath = path.join(projectRoot, 'src/components/DiagnosePopup.vue')
  const source = await fs.readFile(filePath, 'utf8')
  const modes = parseDevModesFromDiagnosePopup(source)
  if (!modes.length) {
    throw new Error('未能从 DiagnosePopup.vue 解析开发态视觉模式下拉列表')
  }
  return modes
}

function buildDevPayload(mode, { userPlantId = DEFAULT_USER_PLANT_ID, openid = BATCH_OPENID } = {}) {
  const evidenceId = `dev_visual::${mode.classKey}::${mode.symptomKey}`
  return {
    skipAuth: true,
    openid,
    source: 'terminal_dev_dropdown_pairwise_batch',
    userPlantId: Number(userPlantId),
    plantId: DEFAULT_PLANT_ID,
    developmentVisualMode: mode.modeKey,
    plantProfile: {
      plantId: DEFAULT_PLANT_ID,
      userPlantId: Number(userPlantId),
      plantName: '吊兰',
      genusKey: 'chlorophytum',
      genusName: 'Chlorophytum',
      organ: 'leaf'
    },
    images: [
      {
        cloudFileId: `cloud://dev-batch/${mode.modeKey}.jpg`,
        slot: 'leaf',
        organ: 'leaf'
      }
    ],
    observedSymptoms: [
      {
        symptomKey: mode.symptomKey,
        symptomCn: mode.label,
        classKey: mode.classKey,
        classNameCn: mode.label,
        source: 'visual_admitted',
        evidenceSource: 'visual_admitted',
        confidence: 0.92,
        observed: true
      }
    ],
    observedEvidenceSet: [
      {
        observedEvidenceSetId: evidenceId,
        evidenceKey: evidenceId,
        symptomKey: mode.symptomKey,
        symptomCn: mode.label,
        classKey: mode.classKey,
        classNameCn: mode.label,
        sourceType: 'visual_admitted',
        evidenceSource: 'visual_admitted',
        targetLayer: 'observed_evidence_set',
        sourceRecordId: mode.classKey,
        visualAdmissionReason: 'development-only symptom class simulator',
        confidence: 0.92
      }
    ],
    skipVisualModel: true,
    useDevelopmentVisualEvidence: true
  }
}

function buildEngineLockedPlantContext({ userPlantId = DEFAULT_USER_PLANT_ID } = {}) {
  return {
    userPlantId: Number(userPlantId),
    plantId: DEFAULT_PLANT_ID,
    plantDisplayName: '吊兰',
    plantIdentityId: 'terminal_engine_pairwise_chlorophytum',
    identityResolutionStatus: 'matched',
    latestVisualCallBatchId: '',
    genus: 'Chlorophytum',
    family: 'Asparagaceae',
    category: 'houseplant',
    watering: {
      minDays: 3,
      maxDays: 7,
      text: '通常 3-7 天观察盆土干湿后浇水'
    },
    fertilization: {
      minDays: 21,
      maxDays: 45,
      text: '生长期约 3-6 周少量施肥'
    },
    sunning: {
      text: '明亮散射光，避免长时间强直晒'
    },
    ventilation: {
      text: '保持通风，避免长期闷湿'
    },
    temperatureMin: 15,
    temperatureMax: 28,
    humidityMin: 40,
    humidityMax: 70,
    careAuditStatus: 'terminal_e2e',
    varianceLevel: 'medium'
  }
}

function buildEngineInitialEvidence(mode) {
  const evidenceId = `dev_visual::${mode.classKey}::${mode.symptomKey}`
  return {
    observedSymptoms: [],
    observedEvidenceSet: [
      {
        observedEvidenceSetId: evidenceId,
        evidenceKey: evidenceId,
        symptomKey: mode.symptomKey,
        symptomCn: mode.label,
        classKey: mode.classKey,
        classNameCn: mode.label,
        sourceType: 'visual_admitted',
        evidenceSource: 'visual_admitted',
        targetLayer: 'observed_evidence_set',
        sourceRecordId: mode.classKey,
        visualAdmissionReason: 'development-only symptom class simulator',
        confidence: 0.92,
        currentStatus: 'active'
      }
    ]
  }
}

function normalizeAppResponse(res) {
  if (!res) {return { statusCode: 0, body: null }}
  if (typeof res.body !== 'string') {return { statusCode: res.statusCode || 0, body: res.body || res }}
  try {
    return { statusCode: res.statusCode || 0, body: JSON.parse(res.body) }
  } catch {
    return { statusCode: res.statusCode || 0, body: res.body }
  }
}

async function callApp(pathname, payload = {}, { method = 'POST', openid = BATCH_OPENID } = {}) {
  const event = {
    path: pathname,
    httpMethod: method,
    method,
    headers: {
      'content-type': 'application/json',
      'x-openid': openid,
      'x-terminal-e2e': 'true',
      'x-app-env': 'development'
    },
    queryStringParameters: {},
    body: method === 'GET' ? '' : JSON.stringify(payload),
    requestContext: { http: { method, path: pathname } },
    httpContext: { method, path: pathname }
  }
  const result = normalizeAppResponse(
    await app.main(event, {
      OPENID: openid,
      ENV: process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || 'cloud1_dev'
    })
  )
  const code = Number(result.body?.code || result.statusCode || 0)
  if (result.statusCode >= 400 || code >= 400) {
    throw new Error(`${pathname} failed: ${result.statusCode}/${code} ${result.body?.message || ''}`.trim())
  }
  return result.body?.data || result.body || {}
}

function getPrimaryQuestion(data = {}) {
  const questions = Array.isArray(data?.questions)
    ? data.questions
    : Array.isArray(data?.followUps)
      ? data.followUps
      : []
  return questions.find(item => item?.questionId && Array.isArray(item?.options) && item.options.length) || null
}

function findOption(question = {}, optionKey = '') {
  const normalized = normalizeText(optionKey)
  return (Array.isArray(question?.options) ? question.options : []).find(
    item => normalizeText(item?.optionKey || item?.optionId) === normalized
  )
}

function buildPairKey(mode, question, option) {
  return [
    mode.modeKey,
    normalizeText(question?.questionKey || question?.questionId),
    normalizeText(option?.optionKey || option?.optionId)
  ].join('::')
}

function buildPathSignature(mode, answerPath = []) {
  const answerText = answerPath
    .map(item => `${item.questionKey || item.questionId}=${item.optionKey || item.optionId}`)
    .join(' > ')
  return `${mode.modeKey}/${mode.symptomKey}${answerText ? ` > ${answerText}` : ' > direct'}`
}

const PENDING_STOP_REASONS = new Set([
  'await_follow_up',
  'followup',
  'follow_up_required'
])

function isFinalDiagnosisData(data = {}) {
  const outcomeType = normalizeText(data?.outcomeType)
  const stopReason = normalizeText(data?.stopReason)
  return Boolean(outcomeType) && !PENDING_STOP_REASONS.has(stopReason)
}

function isRetryableRuntimeError(error) {
  const message = normalizeText(error?.message || String(error))
  return /单 case 超时|预热路径超时|request timeout|models\.\$runSQL|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|socket hang up/i.test(message)
}

async function runAnswerPath(mode, answerPath = [], { userPlantId = DEFAULT_USER_PLANT_ID } = {}) {
  let data = await callApp('/diagnosis/start', buildDevPayload(mode, { userPlantId }), {
    openid: BATCH_OPENID
  })
  const sessionId = normalizeText(data?.diagnosisSessionId)
  const executedAnswers = []
  const encounteredQuestions = []

  for (const expected of answerPath) {
    const question = getPrimaryQuestion(data)
    if (!question) {
      throw new Error(`路径提前结束: ${buildPathSignature(mode, answerPath)}`)
    }
    const questionKey = normalizeText(question.questionKey || question.questionId)
    if (expected.questionKey && expected.questionKey !== questionKey) {
      throw new Error(
        `路径问题不匹配: expected=${expected.questionKey}, actual=${questionKey}, path=${buildPathSignature(mode, answerPath)}`
      )
    }
    const option = findOption(question, expected.optionKey)
    if (!option) {
      throw new Error(
        `路径选项不存在: question=${questionKey}, option=${expected.optionKey}, path=${buildPathSignature(mode, answerPath)}`
      )
    }
    encounteredQuestions.push({
      questionKey,
      questionText: normalizeText(question.text || question.questionText),
      optionKey: normalizeText(option.optionKey || option.optionId),
      optionText: normalizeText(option.text || option.optionText)
    })
    data = await callApp(
      '/diagnosis/answer',
      {
        skipAuth: true,
        openid: BATCH_OPENID,
        diagnosisSessionId: sessionId,
        roundId: data.roundId || 'round_1',
        requestMode: 'answer_submit',
        answers: [
          {
            questionId: question.questionId,
            optionId: option.optionId
          }
        ]
      },
      { openid: BATCH_OPENID }
    )
    executedAnswers.push({
      questionId: question.questionId,
      questionKey,
      optionId: option.optionId,
      optionKey: normalizeText(option.optionKey || option.optionId)
    })
  }

  return {
    mode,
    sessionId,
    data,
    currentQuestion: getPrimaryQuestion(data),
    executedAnswers,
    encounteredQuestions
  }
}

async function runEngineAnswerPath(mode, answerPath = [], { userPlantId = DEFAULT_USER_PLANT_ID } = {}) {
  const sessionId = `engine_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const normalizedAnswerPath = (Array.isArray(answerPath) ? answerPath : [])
    .map(item => ({
      questionKey: normalizeText(item.questionKey),
      optionKey: normalizeText(item.optionKey)
    }))
    .filter(item => item.questionKey && item.optionKey)
  const cacheKeyForLength = length =>
    JSON.stringify([
      Number(userPlantId),
      mode.modeKey,
      normalizedAnswerPath.slice(0, length)
    ])
  const exactCacheKey = cacheKeyForLength(normalizedAnswerPath.length)
  if (ENGINE_RUN_PATH_CACHE.has(exactCacheKey)) {
    return ENGINE_RUN_PATH_CACHE.get(exactCacheKey)
  }
  if (ENGINE_RUN_PATH_PENDING.has(exactCacheKey)) {
    return ENGINE_RUN_PATH_PENDING.get(exactCacheKey)
  }

  const runPromise = (async () => {
  const lockedPlantContext = buildEngineLockedPlantContext({ userPlantId })
  const initialEvidence = buildEngineInitialEvidence(mode)
  const executedAnswers = []
  const encounteredQuestions = []
  let data
  let startIndex = 0

  for (let index = normalizedAnswerPath.length; index >= 0; index -= 1) {
    const prefixKey = cacheKeyForLength(index)
    if (!ENGINE_RUN_PATH_CACHE.has(prefixKey)) {continue}
    const cached = ENGINE_RUN_PATH_CACHE.get(prefixKey)
    data = cached.data
    executedAnswers.push(...cached.executedAnswers)
    encounteredQuestions.push(...cached.encounteredQuestions)
    startIndex = index
    break
  }

  if (!data) {
    data = await runDiagnosisRound({
      openid: BATCH_OPENID,
      plantId: DEFAULT_PLANT_ID,
      userPlantId: Number(userPlantId),
      lockedPlantContext,
      observedSymptoms: initialEvidence.observedSymptoms,
      observedEvidenceSet: initialEvidence.observedEvidenceSet,
      visualAggregateResult: null,
      answers: [],
      askedQuestionKeys: [],
      answeredQuestionGroupKeys: [],
      unknownCountByGroup: {},
      symptomClassState: null,
      storedFollowUpRows: [],
      round: 1,
      stage: 'preliminary',
      sessionId
    })
    ENGINE_RUN_PATH_CACHE.set(cacheKeyForLength(0), {
      mode,
      sessionId,
      data,
      currentQuestion: getPrimaryQuestion(data),
      executedAnswers: [],
      encounteredQuestions: []
    })
  }

  for (const expected of normalizedAnswerPath.slice(startIndex)) {
    const question = getPrimaryQuestion(data)
    if (!question) {
      throw new Error(`路径提前结束: ${buildPathSignature(mode, answerPath)}`)
    }
    const questionKey = normalizeText(question.questionKey || question.questionId)
    if (expected.questionKey && expected.questionKey !== questionKey) {
      throw new Error(
        `路径问题不匹配: expected=${expected.questionKey}, actual=${questionKey}, path=${buildPathSignature(mode, answerPath)}`
      )
    }
    const option = findOption(question, expected.optionKey)
    if (!option) {
      throw new Error(
        `路径选项不存在: question=${questionKey}, option=${expected.optionKey}, path=${buildPathSignature(mode, answerPath)}`
      )
    }
    const optionKey = normalizeText(option.optionKey || option.optionId)
    encounteredQuestions.push({
      questionKey,
      questionText: normalizeText(question.text || question.questionText),
      optionKey,
      optionText: normalizeText(option.text || option.optionText)
    })
    executedAnswers.push({
      questionId: question.questionId,
      questionKey,
      optionId: option.optionId,
      optionKey
    })
    data = await runDiagnosisRound({
      openid: BATCH_OPENID,
      plantId: DEFAULT_PLANT_ID,
      userPlantId: Number(userPlantId),
      lockedPlantContext,
      observedSymptoms: [],
      observedEvidenceSet: data.observedEvidenceSet || initialEvidence.observedEvidenceSet,
      visualAggregateResult: null,
      answers: executedAnswers.map(item => ({
        questionKey: item.questionKey,
        optionKey: item.optionKey
      })),
      askedQuestionKeys: executedAnswers.map(item => item.questionKey),
      answeredQuestionGroupKeys: [],
      unknownCountByGroup: {},
      symptomClassState: data.symptomClassRuntime || null,
      storedFollowUpRows: [],
      round: executedAnswers.length + 1,
      stage: 'followup',
      sessionId
    })
    ENGINE_RUN_PATH_CACHE.set(cacheKeyForLength(executedAnswers.length), {
      mode,
      sessionId,
      data,
      currentQuestion: getPrimaryQuestion(data),
      executedAnswers: executedAnswers.slice(),
      encounteredQuestions: encounteredQuestions.slice()
    })
  }

  const result = {
    mode,
    sessionId,
    data,
    currentQuestion: getPrimaryQuestion(data),
    executedAnswers,
    encounteredQuestions
  }
  ENGINE_RUN_PATH_CACHE.set(exactCacheKey, result)
  return result
  })()
    .finally(() => {
      ENGINE_RUN_PATH_PENDING.delete(exactCacheKey)
    })
  ENGINE_RUN_PATH_PENDING.set(exactCacheKey, runPromise)
  return runPromise
}

async function prewarmEngineRootPaths({
  modes = [],
  userPlantId = DEFAULT_USER_PLANT_ID,
  timeoutMs = 0,
  depth = 0
} = {}) {
  async function runPrewarmPathWithRetry(mode, answerPath = []) {
    const maxAttempts = 3
    let lastError = null
    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
      try {
        const runPromise = runEngineAnswerPath(mode, answerPath, { userPlantId })
        if (Number(timeoutMs || 0) > 0) {
          let timeoutId
          return await Promise.race([
            runPromise,
            new Promise((resolve, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error(`预热路径超时 ${timeoutMs}ms: ${buildPathSignature(mode, answerPath)}`))
              }, Number(timeoutMs))
            })
          ]).finally(() => {
            if (timeoutId) {clearTimeout(timeoutId)}
          })
        }
        return await runPromise
      } catch (error) {
        lastError = error
        if (attemptIndex >= maxAttempts - 1 || !isRetryableRuntimeError(error)) {
          throw error
        }
        process.stderr.write(
          `[pairwise-batch] prewarm retry ${attemptIndex + 2}/${maxAttempts}: ${buildPathSignature(mode, answerPath)} error=${error?.message || String(error)}\n`
        )
        await sleep(500 * (attemptIndex + 1))
      }
    }
    throw lastError
  }

  const startedAt = Date.now()
  let warmedCount = 0
  const queuedPaths = []
  for (const mode of modes) {
    const modeStartedAt = Date.now()
    process.stderr.write(
      `[pairwise-batch] prewarm start: ${mode.modeKey}/${mode.symptomKey}\n`
    )
    await runPrewarmPathWithRetry(mode, [])
    warmedCount += 1
    process.stderr.write(
      `[pairwise-batch] prewarm done: ${mode.modeKey}/${mode.symptomKey}, elapsedMs=${Date.now() - modeStartedAt}\n`
    )
    if (Number(depth || 0) > 0) {
      const rootResult = ENGINE_RUN_PATH_CACHE.get(JSON.stringify([Number(userPlantId), mode.modeKey, []]))
      const question = rootResult ? getPrimaryQuestion(rootResult.data) : null
      const questionKey = normalizeText(question?.questionKey || question?.questionId)
      for (const option of Array.isArray(question?.options) ? question.options : []) {
        const optionKey = normalizeText(option?.optionKey || option?.optionId)
        if (!questionKey || !optionKey) {continue}
        queuedPaths.push({ mode, answerPath: [{ questionKey, optionKey }], depth: 1 })
      }
    }
  }
  for (const task of queuedPaths) {
    const pathStartedAt = Date.now()
    process.stderr.write(
      `[pairwise-batch] prewarm path start: ${buildPathSignature(task.mode, task.answerPath)}\n`
    )
    await runPrewarmPathWithRetry(task.mode, task.answerPath)
    process.stderr.write(
      `[pairwise-batch] prewarm path done: ${buildPathSignature(task.mode, task.answerPath)}, elapsedMs=${Date.now() - pathStartedAt}\n`
    )
  }
  const elapsedMs = Date.now() - startedAt
  process.stderr.write(
    `[pairwise-batch] prewarmed engine paths: roots=${warmedCount}/${modes.length}, extraPaths=${queuedPaths.length}, elapsedMs=${elapsedMs}\n`
  )
  return { warmedCount, elapsedMs }
}

async function submitFollowUpAnswer({
  sessionId,
  data,
  question,
  option,
  requestMode = 'answer_submit',
  openid = BATCH_OPENID
} = {}) {
  const payload = {
    skipAuth: true,
    openid,
    diagnosisSessionId: sessionId,
    roundId: data?.roundId || 'round_1',
    requestMode,
    answers: [
      {
        questionId: question.questionId,
        optionId: option.optionId
      }
    ]
  }
  if (requestMode === 'answer_revision') {
    payload.dirtyFromQuestionId = question.questionId
    payload.baseAnswerRevision = Number(data?.answerRevision || 0)
  }
  return callApp('/diagnosis/answer', payload, { openid })
}

function buildRunResultFromSweep({
  mode,
  sessionId,
  answerPath = [],
  data = {}
} = {}) {
  return {
    mode,
    sessionId,
    data,
    currentQuestion: getPrimaryQuestion(data),
    executedAnswers: answerPath.map(item => ({
      questionId: item.questionId,
      questionKey: item.questionKey,
      optionId: item.optionId,
      optionKey: item.optionKey
    })),
    encounteredQuestions: answerPath.map(item => ({
      questionKey: item.questionKey,
      questionText: item.questionText,
      optionKey: item.optionKey,
      optionText: item.optionText
    }))
  }
}

function buildBatchRecord(runResult, { batchGeneratedAt = new Date().toISOString() } = {}) {
  const { mode, sessionId, executedAnswers, encounteredQuestions, data } = runResult
  const answerPath = encounteredQuestions.map(item => ({
    modeKey: mode.modeKey,
    symptomKey: mode.symptomKey,
    classKey: mode.classKey,
    questionKey: item.questionKey,
    questionText: item.questionText,
    optionKey: item.optionKey,
    optionText: item.optionText
  }))
  const currentTopLabel =
    normalizeText(data?.summaryCard?.title) ||
    normalizeText(data?.finalResult?.title) ||
    normalizeText(data?.finalResult?.displayName) ||
    normalizeText(data?.topProblem?.displayName) ||
    normalizeText(data?.outcomeType) ||
    normalizeText(data?.stopReason)
  const isFinal = isFinalDiagnosisData(data)
  const outcomeType = normalizeText(data?.outcomeType)
  const shouldSuppressProblemLikePresentation = outcomeType === 'uncertain'
  const finalLabel = isFinal ? currentTopLabel : ''
  const pendingTopLabel = isFinal ? '' : currentTopLabel
  const topRanking = Array.isArray(data?.rankings) ? data.rankings[0] : null
  const secondRanking = Array.isArray(data?.rankings) ? data.rankings[1] : null
  const topProblemKey = shouldSuppressProblemLikePresentation
    ? ''
    : normalizeText(data?.topProblem?.problemKey) ||
      normalizeText(data?.finalResult?.problemKey) ||
      normalizeText(topRanking?.problemKey)
  const topProblemDisplayName = shouldSuppressProblemLikePresentation
    ? ''
    : normalizeText(data?.topProblem?.displayName) ||
      normalizeText(data?.finalResult?.displayName) ||
      normalizeText(topRanking?.problemCn) ||
      topProblemKey
  const topProblemScore = Number(topRanking?.finalScore || 0)
  const secondProblemScore = Number(secondRanking?.finalScore || 0)

  return {
    diagnosisSessionId: sessionId,
    modeKey: mode.modeKey,
    classKey: mode.classKey,
    symptomKey: mode.symptomKey,
    symptomCn: mode.label,
    outcomeType,
    stopReason: normalizeText(data?.stopReason),
    finalTitle: finalLabel,
    currentTopTitle: currentTopLabel,
    pendingTopTitle: pendingTopLabel,
    sourceSchema: SOURCE_SCHEMA,
    batchGeneratedAt,
    sampleLabel: `${mode.label || mode.modeKey}`.slice(0, 64),
    sampleFileName: SCRIPT_NAME,
    sampleAbsolutePath: path.join(projectRoot, 'scripts/terminal-e2e', SCRIPT_NAME),
    answerPathSignature: buildPathSignature(mode, executedAnswers),
    answerPath,
    roundsUsed: executedAnswers.length,
    questionCount: executedAnswers.length,
    topProblemKey,
    topProblemDisplayName,
    topProblemScore,
    topScoreGap: Number.isFinite(topProblemScore - secondProblemScore)
      ? topProblemScore - secondProblemScore
      : Number(data?.metrics?.topScoreGap || 0),
    stopReasonDetail: normalizeText(data?.stopReasonDetail),
    followUpStopPolicy: data?.followUpStopPolicy || null,
    observedEvidenceCount: 1,
    diagnosisDirectionLabels: [
      mode.modeKey,
      mode.classKey,
      mode.symptomKey,
      finalLabel || pendingTopLabel
    ].filter(Boolean)
  }
}

function mapRecordToCanonicalResult(record = {}) {
  const answerPath = Array.isArray(record.answerPath) ? record.answerPath : []
  const firstAnswer = answerPath[0] || null
  const remainingAnswers = answerPath.slice(1)
  const diagnosisDirectionLabels = Array.isArray(record.diagnosisDirectionLabels)
    ? record.diagnosisDirectionLabels
    : []

  return {
    sessionId: normalizeText(record.diagnosisSessionId),
    visualFinalEvidence: [
      {
        symptomKey: normalizeText(record.symptomKey || diagnosisDirectionLabels[2]),
        symptomCn: normalizeText(record.symptomCn || record.sampleLabel),
        confidence: 0.92,
        source: 'development_visual_dropdown'
      }
    ].filter(item => item.symptomKey || item.symptomCn),
    symptomClassReplay: {
      modeKey: normalizeText(record.modeKey || diagnosisDirectionLabels[0]),
      classKey: normalizeText(record.classKey || diagnosisDirectionLabels[1]),
      symptomKey: normalizeText(record.symptomKey || diagnosisDirectionLabels[2])
    },
    round1: firstAnswer
      ? {
          questionKey: normalizeText(firstAnswer.questionKey),
          optionKey: normalizeText(firstAnswer.optionKey),
          questionText: normalizeText(firstAnswer.questionText),
          optionText: normalizeText(firstAnswer.optionText)
        }
      : null,
    round2: remainingAnswers.map(item => ({
      questionKey: normalizeText(item.questionKey),
      optionKey: normalizeText(item.optionKey),
      questionText: normalizeText(item.questionText),
      optionText: normalizeText(item.optionText)
    })),
    outcome: {
      outcomeType: normalizeText(record.outcomeType),
      stopReason: normalizeText(record.stopReason),
      title: normalizeText(record.finalTitle),
      pendingTopTitle: normalizeText(record.pendingTopTitle),
      currentTopTitle: normalizeText(record.currentTopTitle || record.finalTitle || record.pendingTopTitle),
      topProblemKey: normalizeText(record.topProblemKey),
      topProblemDisplayName: normalizeText(record.topProblemDisplayName),
      topProblemScore: Number(record.topProblemScore || 0),
      topScoreGap: Number(record.topScoreGap || 0),
      stopReasonDetail: normalizeText(record.stopReasonDetail)
    },
    calculationProcess: {
      batchSource: BATCH_SOURCE,
      sourceSchema: SOURCE_SCHEMA,
      answerPathSignature: normalizeText(record.answerPathSignature),
      roundsUsed: Number(record.roundsUsed || 0),
      questionCount: Number(record.questionCount || 0),
      isFinal: Boolean(normalizeText(record.finalTitle)),
      followUpStopPolicy: record.followUpStopPolicy || null
    }
  }
}

async function runSessionSweepForMode(mode, {
  userPlantId = DEFAULT_USER_PLANT_ID,
  maxDepth = 10,
  maxCases = 600,
  batchGeneratedAt = new Date().toISOString()
} = {}) {
  let data = await callApp('/diagnosis/start', buildDevPayload(mode, { userPlantId }), {
    openid: BATCH_OPENID
  })
  const sessionId = normalizeText(data?.diagnosisSessionId)
  const records = []
  const failures = []
  const coveredPairs = new Set()
  const scheduledPairs = new Set()
  const discoveredQuestions = new Map()

  function shouldStop() {
    return records.length + failures.length >= maxCases
  }

  async function sweepCurrentQuestion(currentData, answerPath = [], depth = 0) {
    if (shouldStop()) {return}
    const question = getPrimaryQuestion(currentData)
    if (!question || depth >= maxDepth) {
      records.push(buildBatchRecord(buildRunResultFromSweep({
        mode,
        sessionId,
        answerPath,
        data: currentData
      }), { batchGeneratedAt }))
      return
    }

    const questionKey = normalizeText(question.questionKey || question.questionId)
    const questionMapKey = `${mode.modeKey}::${questionKey}`
    if (!discoveredQuestions.has(questionMapKey)) {
      discoveredQuestions.set(questionMapKey, {
        modeKey: mode.modeKey,
        symptomKey: mode.symptomKey,
        questionKey,
        questionRole: normalizeText(question.questionRole || question.questionCategory),
        optionKeys: []
      })
    }
    const questionInfo = discoveredQuestions.get(questionMapKey)
    const options = Array.isArray(question.options) ? question.options : []
    let hasSubmittedThisQuestion = false

    for (const option of options) {
      if (shouldStop()) {break}
      const optionKey = normalizeText(option.optionKey || option.optionId)
      if (!optionKey) {continue}
      questionInfo.optionKeys.push(optionKey)
      const pairKey = buildPairKey(mode, question, option)
      scheduledPairs.add(pairKey)
      const nextAnswerPath = [
        ...answerPath,
        {
          questionId: question.questionId,
          questionKey,
          questionText: normalizeText(question.text || question.questionText),
          optionId: option.optionId,
          optionKey,
          optionText: normalizeText(option.text || option.optionText)
        }
      ]
      try {
        data = await submitFollowUpAnswer({
          sessionId,
          data,
          question,
          option,
          requestMode: hasSubmittedThisQuestion ? 'answer_revision' : 'answer_submit',
          openid: BATCH_OPENID
        })
        hasSubmittedThisQuestion = true
        coveredPairs.add(pairKey)
        const nextQuestion = getPrimaryQuestion(data)
        if (!nextQuestion || isFinalDiagnosisData(data) || depth + 1 >= maxDepth) {
          records.push(buildBatchRecord(buildRunResultFromSweep({
            mode,
            sessionId,
            answerPath: nextAnswerPath,
            data
          }), { batchGeneratedAt }))
        } else {
          await sweepCurrentQuestion(data, nextAnswerPath, depth + 1)
        }
      } catch (error) {
        failures.push({
          modeKey: mode?.modeKey || '',
          symptomKey: mode?.symptomKey || '',
          answerPathSignature: buildPathSignature(mode || {}, nextAnswerPath || []),
          error: error?.message || String(error)
        })
        hasSubmittedThisQuestion = false
      }
    }
  }

  await sweepCurrentQuestion(data, [], 0)

  return {
    records,
    failures,
    directFinals: getPrimaryQuestion(data)
      ? []
      : [
          {
            modeKey: mode.modeKey,
            symptomKey: mode.symptomKey,
            sessionId,
            outcomeType: normalizeText(data?.outcomeType),
            stopReason: normalizeText(data?.stopReason),
            title: normalizeText(
              data?.summaryCard?.title ||
              data?.finalResult?.title ||
              data?.finalResult?.displayName ||
              data?.topProblem?.displayName
            ),
            topProblemKey: normalizeText(
              data?.topProblem?.problemKey ||
              data?.finalResult?.problemKey ||
              data?.rankings?.[0]?.problemKey
            )
          }
        ],
    discoveredQuestions,
    scheduledPairs,
    coveredPairs
  }
}

async function writeCanonicalArtifacts({
  records = [],
  report = {},
  batchGeneratedAt = new Date().toISOString(),
  batchArtifactsDir = DEFAULT_BATCH_ARTIFACTS_DIR,
  conclusionArtifactsDir = DEFAULT_CONCLUSION_ARTIFACTS_DIR
} = {}) {
  const completedAt = new Date(batchGeneratedAt)
  const safeCompletedAt = Number.isNaN(completedAt.getTime()) ? new Date() : completedAt
  const results = records.map(mapRecordToCanonicalResult)
  if (!results.length) {
    return {
      rootBaseName: '',
      partCount: 0,
      files: []
    }
  }

  const artifactResult = await writeSplitCanonicalBatchArtifacts({
    results,
    batchArtifactsDir: path.resolve(projectRoot, batchArtifactsDir),
    conclusionArtifactsDir: path.resolve(projectRoot, conclusionArtifactsDir),
    completedAt: safeCompletedAt,
    baseName: `${BATCH_SOURCE}-${safeCompletedAt.getFullYear()}${String(safeCompletedAt.getMonth() + 1).padStart(2, '0')}${String(safeCompletedAt.getDate()).padStart(2, '0')}-${String(safeCompletedAt.getHours()).padStart(2, '0')}${String(safeCompletedAt.getMinutes()).padStart(2, '0')}${String(safeCompletedAt.getSeconds()).padStart(2, '0')}`,
    buildBatchReport: async (chunkResults, { splitMeta }) => ({
      batchSource: BATCH_SOURCE,
      sourceSchema: SOURCE_SCHEMA,
      generatedAt: batchGeneratedAt,
      summary: {
        modeCount: Number(report.modeCount || 0),
        directFinalCount: Number(report.directFinalCount || 0),
        discoveredQuestionCount: Number(report.discoveredQuestionCount || 0),
        scheduledPairCount: Number(report.scheduledPairCount || 0),
        coveredPairCount: Number(report.coveredPairCount || 0),
        reviewRecordCount: Number(report.reviewRecordCount || records.length),
        failureCount: Number(report.failureCount || 0)
      },
      splitMeta,
      results: chunkResults
    }),
    buildBatchConclusion: async (batchReport, batchReportFile, { splitMeta }) => ({
      ok: Number(batchReport.summary?.failureCount || 0) === 0,
      batchSource: BATCH_SOURCE,
      sourceSchema: SOURCE_SCHEMA,
      batchReportFile,
      generatedAt: batchGeneratedAt,
      splitMeta,
      summary: batchReport.summary,
      conclusion: `零模型 DiagnosePopup 开发态下拉模式批跑完成：本分片 ${batchReport.results.length} 条，覆盖 question-option 对 ${batchReport.summary.coveredPairCount} 个。`
    })
  })

  return {
    rootBaseName: artifactResult.rootBaseName,
    partCount: artifactResult.partCount,
    files: artifactResult.artifacts.flatMap(item => [item.batchReportFile, item.conclusionFile])
  }
}

async function runSessionSweepBatch({
  modes,
  userPlantId,
  maxCases,
  maxDepth,
  concurrency,
  reportFile
} = {}) {
  const batchGeneratedAt = new Date().toISOString()
  const queue = modes.slice()
  const records = []
  const failures = []
  const directFinals = []
  const discoveredQuestions = new Map()
  const scheduledPairs = new Set()
  const coveredPairs = new Set()
  let activeCount = 0
  let completedModeCount = 0

  function mergeQuestionMap(sourceMap = new Map()) {
    for (const [key, value] of sourceMap.entries()) {
      if (!discoveredQuestions.has(key)) {
        discoveredQuestions.set(key, { ...value, optionKeys: [] })
      }
      const target = discoveredQuestions.get(key)
      target.optionKeys = Array.from(new Set([
        ...(Array.isArray(target.optionKeys) ? target.optionKeys : []),
        ...(Array.isArray(value.optionKeys) ? value.optionKeys : [])
      ]))
    }
  }

  function shouldStop() {
    return records.length + failures.length >= maxCases
  }

  function printProgress(force = false) {
    if (!force && completedModeCount % 2 !== 0) {return}
    process.stderr.write(
      `[pairwise-session-sweep] modes=${completedModeCount}/${modes.length}, active=${activeCount}, queued=${queue.length}, records=${records.length}, coveredPairs=${coveredPairs.size}, scheduledPairs=${scheduledPairs.size}, failures=${failures.length}\n`
    )
  }

  await new Promise(resolve => {
    const pump = () => {
      while (activeCount < concurrency && queue.length && !shouldStop()) {
        const mode = queue.shift()
        activeCount += 1
        runSessionSweepForMode(mode, {
          userPlantId,
          maxDepth,
          maxCases: Math.max(1, maxCases - records.length - failures.length),
          batchGeneratedAt
        })
          .then(result => {
            records.push(...result.records)
            failures.push(...result.failures)
            directFinals.push(...result.directFinals)
            mergeQuestionMap(result.discoveredQuestions)
            for (const item of result.scheduledPairs) {scheduledPairs.add(item)}
            for (const item of result.coveredPairs) {coveredPairs.add(item)}
          })
          .catch(error => {
            failures.push({
              modeKey: mode?.modeKey || '',
              symptomKey: mode?.symptomKey || '',
              answerPathSignature: buildPathSignature(mode || {}, []),
              error: error?.message || String(error)
            })
          })
          .finally(() => {
            activeCount -= 1
            completedModeCount += 1
            printProgress()
            pump()
          })
      }
      if ((shouldStop() || queue.length === 0) && activeCount === 0) {
        printProgress(true)
        resolve()
      }
    }
    pump()
  })

  if (shouldStop() && queue.length) {
    failures.push({
      modeKey: '',
      symptomKey: '',
      answerPathSignature: '',
      error: `达到 maxCases=${maxCases}，剩余模式 ${queue.length} 个未执行`
    })
  }

  const canonicalArtifacts = await writeCanonicalArtifacts({
    records,
    batchGeneratedAt,
    report: {
      modeCount: modes.length,
      directFinalCount: directFinals.length,
      discoveredQuestionCount: discoveredQuestions.size,
      scheduledPairCount: scheduledPairs.size,
      coveredPairCount: coveredPairs.size,
      reviewRecordCount: records.length,
      failureCount: failures.length
    },
    batchArtifactsDir: DEFAULT_BATCH_ARTIFACTS_DIR,
    conclusionArtifactsDir: DEFAULT_CONCLUSION_ARTIFACTS_DIR
  })
  const report = {
    ok: failures.length === 0,
    batchSource: BATCH_SOURCE,
    sourceSchema: `${SOURCE_SCHEMA}_session_sweep`,
    strategy: 'session-sweep',
    batchGeneratedAt,
    modeCount: modes.length,
    directFinalCount: directFinals.length,
    discoveredQuestionCount: discoveredQuestions.size,
    scheduledPairCount: scheduledPairs.size,
    coveredPairCount: coveredPairs.size,
    reviewRecordCount: records.length,
    reviewUpsertedCount: 0,
    canonicalArtifacts,
    failureCount: failures.length,
    maxCases,
    maxDepth,
    concurrency,
    directFinals,
    discoveredQuestions: Array.from(discoveredQuestions.values()),
    records: records.map(item => ({
      diagnosisSessionId: item.diagnosisSessionId,
      modeKey: item.modeKey,
      classKey: item.classKey,
      symptomKey: item.symptomKey,
      symptomCn: item.symptomCn,
      outcomeType: item.outcomeType,
      stopReason: item.stopReason,
      finalTitle: item.finalTitle,
      topProblemKey: item.topProblemKey,
      topProblemDisplayName: item.topProblemDisplayName,
      topProblemScore: item.topProblemScore,
      topScoreGap: item.topScoreGap,
      stopReasonDetail: item.stopReasonDetail,
      sampleLabel: item.sampleLabel,
      answerPathSignature: item.answerPathSignature,
      answerPath: item.answerPath,
      roundsUsed: item.roundsUsed,
      questionCount: item.questionCount,
      diagnosisDirectionLabels: item.diagnosisDirectionLabels
    })),
    failures
  }

  const absoluteReportFile = path.resolve(projectRoot, reportFile || DEFAULT_REPORT_FILE)
  await fs.mkdir(path.dirname(absoluteReportFile), { recursive: true })
  await fs.writeFile(absoluteReportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  return {
    report,
    reportFile: path.relative(projectRoot, absoluteReportFile)
  }
}

async function runEngineExhaustiveCountBatch({
  modes,
  userPlantId,
  maxCases,
  maxDepth,
  concurrency,
  reportFile,
  progressIntervalMs
} = {}) {
  const batchGeneratedAt = new Date().toISOString()
  const queue = modes.map(mode => ({ mode, answerPath: [] }))
  const terminalCases = []
  const failures = []
  const discoveredQuestions = new Map()
  const scheduledPathSignatures = new Set(queue.map(item => buildPathSignature(item.mode, item.answerPath)))
  const coveredPairs = new Set()
  let activeCount = 0
  let completedTaskCount = 0
  let maxObservedDepth = 0
  let lastProgressCount = 0

  function shouldStop() {
    return terminalCases.length + failures.length >= maxCases
  }

  function printProgress(force = false) {
    const currentCount = terminalCases.length + failures.length
    if (!force && currentCount - lastProgressCount < 25) {return}
    lastProgressCount = currentCount
    process.stderr.write(
      `[engine-exhaustive-count] tasks=${completedTaskCount}, active=${activeCount}, queued=${queue.length}, terminalCases=${terminalCases.length}, failures=${failures.length}, discoveredQuestions=${discoveredQuestions.size}, maxDepth=${maxObservedDepth}\n`
    )
  }

  function mergeDiscoveredQuestion(mode, question) {
    const questionKey = normalizeText(question?.questionKey || question?.questionId)
    if (!questionKey) {return}
    const questionMapKey = `${mode.modeKey}::${questionKey}`
    if (!discoveredQuestions.has(questionMapKey)) {
      discoveredQuestions.set(questionMapKey, {
        modeKey: mode.modeKey,
        symptomKey: mode.symptomKey,
        questionKey,
        questionRole: normalizeText(question.questionRole || question.questionCategory),
        optionKeys: []
      })
    }
    const item = discoveredQuestions.get(questionMapKey)
    item.optionKeys = Array.from(new Set([
      ...item.optionKeys,
      ...(Array.isArray(question.options) ? question.options : [])
        .map(option => normalizeText(option.optionKey || option.optionId))
        .filter(Boolean)
    ]))
  }

  function isRetryableTaskError(error) {
    return isRetryableRuntimeError(error)
  }

  async function runTaskWithRetry(task) {
    const maxAttempts = 3
    let lastError = null
    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
      try {
        return await runEngineAnswerPath(task.mode, task.answerPath, { userPlantId })
      } catch (error) {
        lastError = error
        if (attemptIndex >= maxAttempts - 1 || !isRetryableTaskError(error)) {
          throw error
        }
        await sleep(200 * (attemptIndex + 1))
      }
    }
    throw lastError
  }

  async function processTask(task) {
    try {
      const runResult = await runTaskWithRetry(task)
      const question = runResult.currentQuestion
      const currentDepth = task.answerPath.length
      maxObservedDepth = Math.max(maxObservedDepth, currentDepth)
      const currentQuestionKey = normalizeText(question?.questionKey || question?.questionId)
      const repeatsAnsweredQuestion = Boolean(
        currentQuestionKey &&
        task.answerPath.some(item => normalizeText(item.questionKey) === currentQuestionKey)
      )

      if (
        !question ||
        repeatsAnsweredQuestion ||
        currentDepth >= maxDepth ||
        isFinalDiagnosisData(runResult.data)
      ) {
        terminalCases.push({
          modeKey: task.mode.modeKey,
          symptomKey: task.mode.symptomKey,
          answerPathSignature: buildPathSignature(task.mode, task.answerPath),
          questionCount: currentDepth,
          outcomeType: normalizeText(runResult.data?.outcomeType),
          stopReason: normalizeText(runResult.data?.stopReason),
          truncatedByRepeatedQuestion: repeatsAnsweredQuestion,
          repeatedQuestionKey: repeatsAnsweredQuestion ? currentQuestionKey : '',
          finalTitle: normalizeText(
            runResult.data?.summaryCard?.title ||
            runResult.data?.finalResult?.title ||
            runResult.data?.finalResult?.displayName ||
            runResult.data?.topProblem?.displayName
          )
        })
        return
      }

      mergeDiscoveredQuestion(task.mode, question)
      const questionKey = normalizeText(question.questionKey || question.questionId)
      for (const option of Array.isArray(question.options) ? question.options : []) {
        if (shouldStop()) {break}
        const optionKey = normalizeText(option.optionKey || option.optionId)
        if (!questionKey || !optionKey) {continue}
        coveredPairs.add(buildPairKey(task.mode, question, option))
        const nextAnswerPath = [...task.answerPath, { questionKey, optionKey }]
        const signature = buildPathSignature(task.mode, nextAnswerPath)
        if (scheduledPathSignatures.has(signature)) {continue}
        scheduledPathSignatures.add(signature)
        queue.push({ mode: task.mode, answerPath: nextAnswerPath })
      }
    } catch (error) {
      failures.push({
        modeKey: task.mode?.modeKey || '',
        symptomKey: task.mode?.symptomKey || '',
        answerPathSignature: buildPathSignature(task.mode || {}, task.answerPath || []),
        error: error?.message || String(error)
      })
    }
  }

  const progressTimer = Number(progressIntervalMs || 0) > 0
    ? setInterval(() => printProgress(true), Number(progressIntervalMs))
    : null
  if (progressTimer?.unref) {progressTimer.unref()}

  await new Promise(resolve => {
    const pump = () => {
      while (activeCount < concurrency && queue.length && !shouldStop()) {
        const task = queue.shift()
        activeCount += 1
        processTask(task)
          .finally(() => {
            activeCount -= 1
            completedTaskCount += 1
            printProgress()
            pump()
          })
      }
      if ((shouldStop() || queue.length === 0) && activeCount === 0) {
        printProgress(true)
        resolve()
      }
    }
    pump()
  })

  if (progressTimer) {clearInterval(progressTimer)}

  if (shouldStop() && queue.length) {
    failures.push({
      modeKey: '',
      symptomKey: '',
      answerPathSignature: '',
      error: `达到 maxCases=${maxCases}，剩余路径 ${queue.length} 条未执行`
    })
  }

  const caseCountByMode = terminalCases.reduce((acc, item) => {
    acc[item.modeKey] = (acc[item.modeKey] || 0) + 1
    return acc
  }, {})
  const questionCountDistribution = terminalCases.reduce((acc, item) => {
    const key = String(item.questionCount || 0)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const report = {
    ok: failures.length === 0,
    batchSource: BATCH_SOURCE,
    sourceSchema: `${SOURCE_SCHEMA}_engine_exhaustive_count`,
    strategy: 'engine-exhaustive-count',
    batchGeneratedAt,
    modeCount: modes.length,
    terminalCaseCount: terminalCases.length,
    scheduledPathCount: scheduledPathSignatures.size,
    discoveredQuestionCount: discoveredQuestions.size,
    coveredPairCount: coveredPairs.size,
    maxObservedDepth,
    questionCountDistribution,
    caseCountByMode,
    failureCount: failures.length,
    maxCases,
    maxDepth,
    concurrency,
    discoveredQuestions: Array.from(discoveredQuestions.values()),
    terminalCases,
    failures
  }

  const absoluteReportFile = path.resolve(projectRoot, reportFile || DEFAULT_REPORT_FILE)
  await fs.mkdir(path.dirname(absoluteReportFile), { recursive: true })
  await fs.writeFile(absoluteReportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  return {
    report,
    reportFile: path.relative(projectRoot, absoluteReportFile)
  }
}

async function importBatchRecords(records = [], { chunkSize = 80 } = {}) {
  let upsertedCount = 0
  for (let index = 0; index < records.length; index += chunkSize) {
    const chunk = records.slice(index, index + chunkSize)
    const data = await callApp(
      '/diagnosis/review/detail',
      {
        action: 'importBatch',
        skipAuth: true,
        openid: IMPORT_OPENID,
        batchSource: BATCH_SOURCE,
        records: chunk
      },
      { openid: IMPORT_OPENID }
    )
    upsertedCount += Number(data?.upsertedCount || 0)
  }
  return upsertedCount
}

async function runCoverageBatch({
  modes,
  userPlantId,
  maxCases,
  maxDepth,
  concurrency,
  pauseMs,
  importToReview,
  taskTimeoutMs,
  progressIntervalMs,
  reportFile,
  runPath = runAnswerPath
} = {}) {
  const batchGeneratedAt = new Date().toISOString()
  const queue = modes.map(mode => ({ mode, answerPath: [] }))
  const scheduledPairs = new Set()
  const coveredPairs = new Set()
  const records = []
  const failures = []
  const directFinals = []
  const discoveredQuestions = new Map()
  let activeCount = 0
  let completedTaskCount = 0
  let lastProgressRecordCount = 0

  function shouldStopScheduling() {
    return records.length + failures.length >= maxCases
  }

  function printProgress(force = false) {
    const currentRecordCount = records.length + failures.length
    if (!force && currentRecordCount - lastProgressRecordCount < 25) {return}
    lastProgressRecordCount = currentRecordCount
    process.stderr.write(
      `[pairwise-batch] tasks=${completedTaskCount}, active=${activeCount}, queued=${queue.length}, records=${records.length}, coveredPairs=${coveredPairs.size}, scheduledPairs=${scheduledPairs.size}, failures=${failures.length}\n`
    )
  }

  function withTaskTimeout(promise, task) {
    const timeoutMs = Number(taskTimeoutMs || 0)
    if (!timeoutMs || timeoutMs < 1) {return promise}
    const label = buildPathSignature(task.mode || {}, task.answerPath || [])
    let timeoutId
    const timeoutPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`单 case 超时 ${timeoutMs}ms: ${label}`))
      }, timeoutMs)
    })
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) {clearTimeout(timeoutId)}
    })
  }

  function isRetryableTaskError(error) {
    return isRetryableRuntimeError(error)
  }

  async function runTaskWithRetry(task) {
    const maxAttempts = 3
    let lastError = null
    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
      try {
        return await withTaskTimeout(
          runPath(task.mode, task.answerPath, { userPlantId }),
          task
        )
      } catch (error) {
        lastError = error
        if (attemptIndex >= maxAttempts - 1 || !isRetryableTaskError(error)) {
          throw error
        }
        await sleep(200 * (attemptIndex + 1))
      }
    }
    throw lastError
  }

  async function processTask(task) {
    const isRoot = task.answerPath.length === 0
    try {
      const runResult = await runTaskWithRetry(task)

      if (!isRoot || !runResult.currentQuestion) {
        records.push(buildBatchRecord(runResult, { batchGeneratedAt }))
      }

      if (isRoot && !runResult.currentQuestion) {
        const outcomeType = normalizeText(runResult.data?.outcomeType)
        const shouldSuppressProblemLikePresentation = outcomeType === 'uncertain'
        directFinals.push({
          modeKey: task.mode.modeKey,
          symptomKey: task.mode.symptomKey,
          sessionId: runResult.sessionId,
          outcomeType,
          stopReason: normalizeText(runResult.data?.stopReason),
          title: normalizeText(
            runResult.data?.summaryCard?.title ||
            runResult.data?.finalResult?.title ||
            runResult.data?.finalResult?.displayName ||
            runResult.data?.topProblem?.displayName
          ),
          topProblemKey: shouldSuppressProblemLikePresentation
            ? ''
            : normalizeText(
                runResult.data?.topProblem?.problemKey ||
                runResult.data?.finalResult?.problemKey ||
                runResult.data?.rankings?.[0]?.problemKey
              )
        })
      }

      for (const answer of runResult.executedAnswers) {
        coveredPairs.add(`${task.mode.modeKey}::${answer.questionKey}::${answer.optionKey}`)
      }

      const question = runResult.currentQuestion
      if (question && task.answerPath.length < maxDepth) {
        const questionKey = normalizeText(question.questionKey || question.questionId)
        const questionMapKey = `${task.mode.modeKey}::${questionKey}`
        if (!discoveredQuestions.has(questionMapKey)) {
          discoveredQuestions.set(questionMapKey, {
            modeKey: task.mode.modeKey,
            symptomKey: task.mode.symptomKey,
            questionKey,
            questionRole: normalizeText(question.questionRole || question.questionCategory),
            optionKeys: []
          })
        }
        const questionInfo = discoveredQuestions.get(questionMapKey)
        for (const option of Array.isArray(question.options) ? question.options : []) {
          const optionKey = normalizeText(option.optionKey || option.optionId)
          if (!optionKey) {continue}
          questionInfo.optionKeys.push(optionKey)
          const pairKey = buildPairKey(task.mode, question, option)
          if (scheduledPairs.has(pairKey)) {continue}
          if (shouldStopScheduling()) {continue}
          scheduledPairs.add(pairKey)
          queue.push({
            mode: task.mode,
            answerPath: [
              ...task.answerPath,
              {
                questionKey,
                optionKey
              }
            ]
          })
        }
      }
    } catch (error) {
      failures.push({
        modeKey: task.mode?.modeKey || '',
        symptomKey: task.mode?.symptomKey || '',
        answerPathSignature: buildPathSignature(task.mode || {}, task.answerPath || []),
        error: error?.message || String(error)
      })
    }

    if (pauseMs > 0) {
      await sleep(pauseMs)
    }
  }

  const progressTimer = Number(progressIntervalMs || 0) > 0
    ? setInterval(() => printProgress(true), Number(progressIntervalMs))
    : null
  if (progressTimer?.unref) {progressTimer.unref()}

  await new Promise(resolve => {
    const pump = () => {
      while (activeCount < concurrency && queue.length && !shouldStopScheduling()) {
        const task = queue.shift()
        activeCount += 1
        processTask(task)
          .finally(() => {
            activeCount -= 1
            completedTaskCount += 1
            printProgress()
            pump()
          })
      }
      if ((shouldStopScheduling() || queue.length === 0) && activeCount === 0) {
        printProgress(true)
        resolve()
      }
    }
    pump()
  })

  if (progressTimer) {
    clearInterval(progressTimer)
  }

  if (shouldStopScheduling() && queue.length) {
    failures.push({
      modeKey: '',
      symptomKey: '',
      answerPathSignature: '',
      error: `达到 maxCases=${maxCases}，剩余队列 ${queue.length} 条未执行`
    })
  }

  const upsertedCount = importToReview ? await importBatchRecords(records) : 0
  const canonicalArtifacts = await writeCanonicalArtifacts({
    records,
    batchGeneratedAt,
    report: {
      modeCount: modes.length,
      directFinalCount: directFinals.length,
      discoveredQuestionCount: discoveredQuestions.size,
      scheduledPairCount: scheduledPairs.size,
      coveredPairCount: coveredPairs.size,
      reviewRecordCount: records.length,
      failureCount: failures.length
    },
    batchArtifactsDir: DEFAULT_BATCH_ARTIFACTS_DIR,
    conclusionArtifactsDir: DEFAULT_CONCLUSION_ARTIFACTS_DIR
  })
  const report = {
    ok: failures.length === 0,
    batchSource: BATCH_SOURCE,
    sourceSchema: SOURCE_SCHEMA,
    batchGeneratedAt,
    modeCount: modes.length,
    directFinalCount: directFinals.length,
    discoveredQuestionCount: discoveredQuestions.size,
    scheduledPairCount: scheduledPairs.size,
    coveredPairCount: coveredPairs.size,
    reviewRecordCount: records.length,
    reviewUpsertedCount: upsertedCount,
    canonicalArtifacts,
    failureCount: failures.length,
    maxCases,
    maxDepth,
    concurrency,
    importToReview,
    taskTimeoutMs: Number(taskTimeoutMs || 0),
    progressIntervalMs: Number(progressIntervalMs || 0),
    directFinals,
    discoveredQuestions: Array.from(discoveredQuestions.values()).map(item => ({
      ...item,
      optionKeys: Array.from(new Set(item.optionKeys))
    })),
    records: records.map(item => ({
      diagnosisSessionId: item.diagnosisSessionId,
      modeKey: item.modeKey,
      classKey: item.classKey,
      symptomKey: item.symptomKey,
      symptomCn: item.symptomCn,
      outcomeType: item.outcomeType,
      stopReason: item.stopReason,
      finalTitle: item.finalTitle,
      topProblemKey: item.topProblemKey,
      topProblemDisplayName: item.topProblemDisplayName,
      topProblemScore: item.topProblemScore,
      topScoreGap: item.topScoreGap,
      stopReasonDetail: item.stopReasonDetail,
      sampleLabel: item.sampleLabel,
      answerPathSignature: item.answerPathSignature,
      answerPath: item.answerPath,
      roundsUsed: item.roundsUsed,
      questionCount: item.questionCount,
      diagnosisDirectionLabels: item.diagnosisDirectionLabels
    })),
    failures
  }

  const absoluteReportFile = path.resolve(projectRoot, reportFile || DEFAULT_REPORT_FILE)
  await fs.mkdir(path.dirname(absoluteReportFile), { recursive: true })
  await fs.writeFile(absoluteReportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  return {
    report,
    reportFile: path.relative(projectRoot, absoluteReportFile)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const originalLog = console.log
  const appDebug = args['app-debug'] === 'true'
  if (!appDebug) {
    console.log = () => {}
  }

  let modes = await loadDevModes()
  const modeKeyFilter = new Set(
    String(args['mode-keys'] || '')
      .split(',')
      .map(item => normalizeText(item))
      .filter(Boolean)
  )
  if (modeKeyFilter.size) {
    modes = modes.filter(mode => modeKeyFilter.has(mode.modeKey))
    if (!modes.length) {
      throw new Error(`--mode-keys 未匹配到任何开发态视觉模式: ${Array.from(modeKeyFilter).join(',')}`)
    }
  }
  const strategy = normalizeText(args.strategy || 'pairwise')
  installSelectSqlCache({
    enabled: ['engine-pairwise', 'engine-exhaustive-count'].includes(strategy) ||
      normalizeBoolean(args['sql-select-cache'], false),
    slowSqlMs: normalizeInteger(args['slow-sql-ms'], 0)
  })
  const userPlantId = ['engine-pairwise', 'engine-exhaustive-count'].includes(strategy)
    ? normalizeInteger(args['user-plant-id'], DEFAULT_USER_PLANT_ID)
    : await ensureBatchUserPlant({
        openid: BATCH_OPENID,
        userPlantId: normalizeInteger(args['user-plant-id'], DEFAULT_USER_PLANT_ID)
      })
  const commonOptions = {
    modes,
    userPlantId,
    maxCases: normalizeInteger(args['max-cases'], 600),
    maxDepth: normalizeInteger(args['max-depth'], 10),
    concurrency: normalizeInteger(args.concurrency, 6),
    reportFile: args['report-file'] || DEFAULT_REPORT_FILE
  }
  if (
    strategy === 'engine-pairwise' &&
    normalizeBoolean(args['prewarm-engine-roots'], true)
  ) {
    await preloadQuestionRepositoryCache()
    await prewarmEngineRootPaths({
      modes,
      userPlantId,
      timeoutMs: normalizeInteger(args['prewarm-timeout-ms'], 20000),
      depth: normalizeInteger(args['prewarm-engine-depth'], 1)
    })
  }
  const result = strategy === 'session-sweep'
    ? await runSessionSweepBatch(commonOptions)
    : strategy === 'engine-pairwise'
      ? await runCoverageBatch({
          ...commonOptions,
          pauseMs: normalizeInteger(args['pause-ms'], 0),
          importToReview: false,
          taskTimeoutMs: normalizeInteger(args['task-timeout-ms'], 0),
          progressIntervalMs: normalizeInteger(args['progress-interval-ms'], 10000),
          runPath: runEngineAnswerPath
        })
      : strategy === 'engine-exhaustive-count'
        ? await runEngineExhaustiveCountBatch({
            ...commonOptions,
            progressIntervalMs: normalizeInteger(args['progress-interval-ms'], 10000)
          })
    : await runCoverageBatch({
        ...commonOptions,
        pauseMs: normalizeInteger(args['pause-ms'], 0),
        importToReview: normalizeBoolean(args['import-review'], false),
        taskTimeoutMs: normalizeInteger(args['task-timeout-ms'], 0),
        progressIntervalMs: normalizeInteger(args['progress-interval-ms'], 10000)
      })

  console.log = originalLog
  originalLog(
    JSON.stringify(
      {
        ...result.report,
        records: undefined,
        discoveredQuestions: undefined,
        failures: result.report.failures,
        canonicalArtifacts: result.report.canonicalArtifacts,
        reportFile: result.reportFile
      },
      null,
      2
    )
  )

  if (!result.report.ok) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.log = process.stdout.write.bind(process.stdout)
  console.error(error)
  process.exit(1)
})
