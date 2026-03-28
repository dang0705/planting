'use strict'

const { checkAIQuota, deductQuota } = require('/opt/utils/quota')
const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo,
  isSkipAuthEnabled
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('./db/schema-resolver')
const { callLLMDiagnose } = require('./utils/llm')
const { parseLLMDiagnosis } = require('./utils/diagnosis-parser')
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
const { getQuestionOptionMappings } = require('./repositories/question-repository')
const {
  buildSessionId,
  upsertDiagnosisSession,
  replaceObservedSymptoms,
  replaceProblemRankings,
  appendFollowUpQuestions,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  getSessionState,
  getObservedSymptomsBySession,
  listDiagnosisHistory,
  getResultById,
  saveDiagnosisFeedback
} = require('./services/session-service')
const { buildRefactorArtifacts } = require('./services/bootstrap-report')

const refactorArtifacts = buildRefactorArtifacts()

function resolveImageFromPayload(payload = {}) {
  if (payload.image) return String(payload.image)

  if (Array.isArray(payload.imageIds) && payload.imageIds.length > 0) {
    return String(payload.imageIds[0] || '')
  }

  return ''
}

function normalizeRoundFromRoundId(roundId) {
  const match = String(roundId || '').match(/round_(\d+)/i)
  if (!match) return null
  return Number(match[1] || 0) || null
}

function buildLegacyHttpSuccess({ sessionId, plantId, roundResult, diagnosisText = '' }) {
  return {
    code: 200,
    message: '诊断完成',
    fullText: diagnosisText || roundResult?.topProblem?.summary || '',
    data: {
      recordId: sessionId,
      plantId,
      diagnosis: roundResult?.legacyDiagnosis || {},
      problemCausality: Array.isArray(roundResult?.problemCausality)
        ? roundResult.problemCausality
        : [],
      timestamp: Date.now()
    }
  }
}

function buildSummaryCard(roundResult = {}) {
  const topProblem = roundResult?.topProblem || roundResult?.finalResult || null
  const followUpCount = Array.isArray(roundResult?.followUps) ? roundResult.followUps.length : 0

  return {
    resultId: roundResult?.resultId || roundResult?.finalResult?.resultId || '',
    title: topProblem?.displayName ? `更像是${topProblem.displayName}` : '正在进一步确认诊断方向',
    subtitle:
      followUpCount > 0
        ? `还需要再确认 ${followUpCount} 个关键信息`
        : '当前证据已基本收敛',
    severity: topProblem?.severity || 'medium'
  }
}

function toPublicQuestions(followUps = []) {
  return (Array.isArray(followUps) ? followUps : []).map(item => ({
    questionId: item.questionId,
    type: item.type || 'single_choice',
    text: item.text || '',
    helpText: item.helpText || '',
    options: (Array.isArray(item.options) ? item.options : []).map(option => ({
      optionId: option.optionId,
      text: option.text || ''
    }))
  }))
}

function buildPublicRoundResponse(roundResult = {}) {
  const diagnosisSessionId = roundResult?.diagnosisSessionId || ''
  const roundId = roundResult?.roundId || 'round_1'
  const isFollowUp = Boolean(roundResult?.followUpRequired)

  if (isFollowUp) {
    const questions = toPublicQuestions(roundResult.followUps)
    return {
      diagnosisSessionId,
      roundId,
      stage: 'followup',
      status: 'active',
      summaryCard: buildSummaryCard(roundResult),
      questions,
      uiHints: {
        canUploadMoreImages: true,
        maxQuestionsThisRound: questions.length || 3
      }
    }
  }

  const finalResult = roundResult?.finalResult || {}
  return {
    diagnosisSessionId,
    roundId,
    stage: 'final',
    status: 'closed',
    finalResult: {
      resultId: finalResult.resultId || roundResult?.resultId || '',
      problemId: finalResult.problemId || '',
      displayName: finalResult.displayName || roundResult?.topProblem?.displayName || '',
      summary: finalResult.summary || roundResult?.topProblem?.summary || '',
      severity: finalResult.severity || roundResult?.topProblem?.severity || 'medium',
      urgency: finalResult.urgency || roundResult?.topProblem?.urgency || 'medium'
    },
    contributingFactors: Array.isArray(roundResult?.contributingFactors)
      ? roundResult.contributingFactors
      : [],
    intermediateStates: Array.isArray(roundResult?.intermediateStates)
      ? roundResult.intermediateStates
      : [],
    nextSteps: Array.isArray(roundResult?.nextSteps) ? roundResult.nextSteps : [],
    whatToAvoid: Array.isArray(roundResult?.whatToAvoid) ? roundResult.whatToAvoid : [],
    needHumanReview: false
  }
}

function normalizePublicAnswers(answers = []) {
  return (Array.isArray(answers) ? answers : [])
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
}

async function extractVisualSymptoms(image, { onText } = {}) {
  if (!image) {
    return {
      diagnosisText: '',
      observedSymptoms: []
    }
  }

  const diagnosisText = await callLLMDiagnose(image, { onText })
  const parsed = parseLLMDiagnosis(diagnosisText)

  return {
    diagnosisText,
    observedSymptoms: adaptObservedSymptoms(parsed?.observedSymptoms || [])
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

  await upsertDiagnosisSession({
    sessionId,
    openid,
    plantContext,
    response,
    reliabilityScore: response?.metrics?.reliabilityScore || 0,
    mode: 'new_v13',
    image,
    description
  })

  await Promise.all([
    replaceObservedSymptoms(sessionId, response?.observedSymptoms || []),
    replaceProblemRankings(sessionId, response?.rankings || [])
  ])

  if (response?.followUpRequired) {
    await appendFollowUpQuestions(sessionId, round, response?.followUps || [])
  }
}

async function runStartDiagnosis({ payload, openid, skipPersistence = false, onText } = {}) {
  payload = payload || {}
  const plantId = payload.plantId || payload.userPlantId
  if (!plantId) {
    throw Object.assign(new Error('缺少 plantId'), { statusCode: 400 })
  }

  const image = resolveImageFromPayload(payload)
  let observedSymptoms = adaptObservedSymptoms(payload.observedSymptoms || [])
  let diagnosisText = ''

  if (!observedSymptoms.length && image) {
    const extracted = await extractVisualSymptoms(image, { onText })
    diagnosisText = extracted.diagnosisText
    observedSymptoms = extracted.observedSymptoms
  }

  const sessionId = buildSessionId()
  const roundResult = await runDiagnosisRound({
    openid,
    plantId,
    userPlantId: payload.userPlantId,
    observedSymptoms,
    answers: [],
    askedQuestionKeys: [],
    unknownCountByGroup: {},
    round: 1,
    stage: 'preliminary',
    sessionId
  })

  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round: 1,
    image,
    description: payload.description || '',
    skipPersistence
  })

  return {
    sessionId,
    plantId,
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
  if (!answers.length) {
    throw Object.assign(new Error('缺少 answers'), { statusCode: 400 })
  }

  const observedSymptoms = await getObservedSymptomsBySession(sessionId)
  const roundFromClient = normalizeRoundFromRoundId(payload.roundId)
  const answerRound = roundFromClient || Math.max(1, Number(sessionState.nextRound || 2) - 1)

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

  const round = answerRound + 1

  const roundResult = await runDiagnosisRound({
    openid,
    userPlantId: sessionState.userPlantId,
    plantId: sessionState.plantId,
    observedSymptoms,
    answers,
    askedQuestionKeys: sessionState.askedQuestionKeys,
    unknownCountByGroup: sessionState.unknownCountByGroup,
    round,
    stage: 'followup',
    sessionId
  })

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
    plantId: sessionState.userPlantId || sessionState.plantId,
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
    await ensureQuota(userInfo?.openid, { skipQuota: skipAuth })

    const executed = await runStartDiagnosis({
      payload,
      openid: userInfo?.openid || '',
      skipPersistence: skipAuth
    })

    await consumeQuota(userInfo?.openid, { skipQuota: skipAuth })

    return jsonResponse(200, {
      code: 200,
      message: '诊断开始成功',
      data: buildPublicRoundResponse(executed.response)
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
    const executed = await runAnswerDiagnosis({
      payload,
      openid: userInfo?.openid || '',
      skipPersistence: skipAuth
    })

    return jsonResponse(200, {
      code: 200,
      message: '问诊提交成功',
      data: buildPublicRoundResponse(executed.response)
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
    plantId: query.plantId || null,
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
    if (!isFollowUp) {
      await ensureQuota(userInfo?.openid, { skipQuota: skipAuth })
    }

    const executed = isFollowUp
      ? await runAnswerDiagnosis({
          payload: {
            diagnosisSessionId: payload.diagnosisId,
            roundId: payload.roundId || '',
            followUpAnswers: adaptLegacyFollowUpAnswers(payload.followUpAnswers || [])
          },
          openid: userInfo?.openid || '',
          skipPersistence: skipAuth
        })
      : await runStartDiagnosis({
          payload: {
            plantId: payload.plantId,
            userPlantId: payload.userPlantId,
            image: payload.image,
            observedSymptoms: payload.observedSymptoms,
            description: payload.description || ''
          },
          openid: userInfo?.openid || '',
          skipPersistence: skipAuth
        })

    if (!isFollowUp) {
      await consumeQuota(userInfo?.openid, { skipQuota: skipAuth })
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
    await ensureQuota(userInfo?.openid, { skipQuota: skipAuth })

    const executed = await runStartDiagnosis({
      payload: {
        plantId: payload.plantId,
        userPlantId: payload.userPlantId,
        image: payload.image,
        observedSymptoms: payload.observedSymptoms,
        description: payload.description || ''
      },
      openid: userInfo?.openid || '',
      skipPersistence: skipAuth,
      onText: (chunk, fullText) => {
        emitter.send('reply', {
          type: 'reply',
          role: 'assistant',
          content: chunk,
          fullText
        })
      }
    })

    await consumeQuota(userInfo?.openid, { skipQuota: skipAuth })

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
      return jsonResponse(200, {
        code: 200,
        data: {
          status: 'ok',
          timestamp: Date.now(),
          refactor: {
            hasDataDiffReport: Boolean(refactorArtifacts?.dataDiffReport),
            hasKeyAliasMap: Boolean(refactorArtifacts?.keyAliasMap),
            hasBackfillPlan: Boolean(refactorArtifacts?.backfillPlan),
            hasRepositoryOutputShape: Boolean(refactorArtifacts?.repositoryOutputShape)
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
