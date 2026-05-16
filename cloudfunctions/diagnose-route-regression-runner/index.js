'use strict'

const crypto = require('node:crypto')

const DEFAULT_TIMEOUT_MS = 45000
const DEFAULT_APP_ENV = 'development'

const DEFAULT_CASES = [
  {
    label: 'non_problematic_normal_leaf_aging',
    caseKey: 'normal_leaf_aging_from_observed_evidence',
    plantCatalogId: '1',
    observedEvidenceSet: [
      {
        observedEvidenceSetId: 'normal_leaf_aging_from_observed_evidence::normal_leaf_aging_stable',
        evidenceKey: 'normal_leaf_aging_stable',
        evidenceType: 'symptom',
        symptomKey: 'normal_leaf_aging_stable',
        symptomCn: '底部老叶稳定黄化',
        confidence: 0.99,
        sourceType: 'user_answer',
        currentStatus: 'active',
        targetLayer: 'observed_evidence_set'
      }
    ],
    expected: {
      outcome: 'non_problematic',
      nonProblematicType: 'normal_leaf_aging',
      routePrimaryAction: 'standard_flow'
    }
  },
  {
    label: 'uncertain_unknown_answers',
    caseKey: 'uncertain_from_unknown_answers',
    plantCatalogId: '1',
    observedEvidenceSet: [],
    answerPattern: 'unknown,unknown,unknown',
    expected: {
      outcome: 'uncertain',
      routePrimaryAction: 'uncertain_prepare'
    }
  },
  {
    label: 'problematic_leaf_yellowing_followup_overwatering',
    caseKey: 'overwatering_leaf_yellowing_followup',
    plantCatalogId: '1',
    observedEvidenceSet: [
      {
        observedEvidenceSetId: 'overwatering_leaf_yellowing_followup::leaf_yellowing',
        evidenceKey: 'leaf_yellowing',
        evidenceType: 'symptom',
        symptomKey: 'leaf_yellowing',
        symptomCn: '叶片黄化',
        confidence: 0.9,
        sourceType: 'user_answer',
        currentStatus: 'active',
        targetLayer: 'observed_evidence_set'
      }
    ],
    answerPattern: 'watering_area,often_wet',
    expected: {
      outcome: 'problematic',
      problemKey: 'overwatering_root_pressure',
      routePrimaryAction: 'standard_flow',
      startStage: 'followup',
      minStartQuestionCount: 1
    }
  }
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLowerText(value = '') {
  return normalizeText(value).toLowerCase()
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function parseAnswerPattern(value = '') {
  return String(value || '')
    .split(',')
    .map(item => normalizeLowerText(item))
    .filter(Boolean)
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${pad}`, 'base64').toString('utf8')
}

function parsePublicId(prefix, publicId) {
  const marker = `${prefix}_`
  const rawValue = String(publicId || '')
  if (!rawValue.startsWith(marker)) {
    return ''
  }
  try {
    return fromBase64Url(rawValue.slice(marker.length))
  } catch {
    return ''
  }
}

function summarizeFinalData(finalData = {}) {
  return JSON.stringify({
    outcomeType: finalData?.outcomeType || '',
    routePrimaryAction: finalData?.routePrimaryAction || '',
    problemKey: parsePublicId('p', finalData?.finalResult?.problemId || ''),
    displayName: finalData?.finalResult?.displayName || '',
    nonProblematicType: finalData?.finalResult?.nonProblematicType || finalData?.nonProblematicType || '',
    routeDecision: {
      primaryOutcomeKey: finalData?.routeDecision?.primaryOutcomeKey || '',
      visibleOutcomeKeys: finalData?.routeDecision?.visibleOutcomeKeys || [],
      decisionCauseKey: finalData?.routeDecision?.decisionCause?.decisionCauseKey || ''
    }
  })
}

function pickOptionIdByPattern(question = {}, answerToken = 'yes') {
  const normalizedToken = normalizeLowerText(answerToken || 'yes')
  const options = Array.isArray(question?.options) ? question.options : []

  for (const option of options) {
    const decoded = parsePublicId('opt', option?.optionId || '')
    if (decoded === normalizedToken) {
      return String(option?.optionId || '')
    }
  }

  for (const option of options) {
    const text = normalizeLowerText(option?.text || '')
    if (normalizedToken === 'yes' && (text.includes('是') || text.includes('有') || text.includes('会'))) {
      return String(option?.optionId || '')
    }
    if (
      normalizedToken === 'no' &&
      (text.includes('否') || text.includes('没有') || text.includes('无') || text.includes('不是'))
    ) {
      return String(option?.optionId || '')
    }
    if (
      normalizedToken === 'unknown' &&
      (text.includes('不确定') || text.includes('不清楚') || text.includes('未知') || text.includes('看不出'))
    ) {
      return String(option?.optionId || '')
    }
  }

  if (normalizedToken === 'yes') {
    const firstNonUnknown = options.find(option => parsePublicId('opt', option?.optionId || '') !== 'unknown')
    if (firstNonUnknown?.optionId) {
      return String(firstNonUnknown.optionId)
    }
  }

  return ''
}

function buildOpenId(prefix = 'route_regression_runner', caseKey = 'case') {
  const safeCaseKey = normalizeLowerText(caseKey)
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 24)
  const caseHash = crypto
    .createHash('sha1')
    .update(String(caseKey || 'case'))
    .digest('hex')
    .slice(0, 8)
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const raw = `${prefix}_${safeCaseKey}_${caseHash}_${nonce}`
  return raw.slice(0, 64)
}

function buildFunctionUrl(baseUrl, path, query = {}) {
  const normalizedPath = String(path || '').replace(/^\/+/, '')
  const url = new URL(`${String(baseUrl || '').replace(/\/+$/, '')}/${normalizedPath}`)

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    url.searchParams.set(key, String(value))
  })
  return url
}

function isGatewayFunctionBaseUrl(baseUrl = '') {
  return String(baseUrl || '').includes('.api.tcloudbasegateway.com/')
}

async function signInAnonymously(envId, deviceId) {
  const response = await requestJson(`https://${envId}.api.tcloudbasegateway.com/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: {
      'x-device-id': String(deviceId || ''),
      'Content-Type': 'application/json'
    },
    body: '{}'
  })

  assertCondition(response?.ok, `anonymous signin failed: HTTP ${response?.status || 0} ${response?.rawText || ''}`)
  const payload = response?.body
  assertCondition(payload && typeof payload === 'object' && payload.access_token, 'anonymous signin missing access_token')
  return payload
}

async function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || DEFAULT_TIMEOUT_MS)))

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    })
    const text = await response.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {
      // keep raw text when the response body is not JSON
    }

    return {
      ok: response.ok,
      status: response.status,
      body: parsed,
      rawText: text
    }
  } finally {
    clearTimeout(timeout)
  }
}

function extractEnvelopeData(response = null, phaseLabel = 'request') {
  const body = response?.body
  assertCondition(response?.ok, `${phaseLabel} failed: HTTP ${response?.status || 0} ${JSON.stringify(body)}`)
  assertCondition(body && typeof body === 'object' && Number(body.code || 0) === 200, `${phaseLabel} returned invalid envelope`)
  return body.data || null
}

async function callDiagnoseHttp(baseUrl, {
  path,
  method = 'GET',
  query = {},
  body = null,
  openid = '',
  appEnv = DEFAULT_APP_ENV,
  authToken = ''
}) {
  const queryWithAuth = {
    ...query,
    skipAuth: 'true',
    openid
  }
  if (isGatewayFunctionBaseUrl(baseUrl)) {
    queryWithAuth.webfn = 'true'
  }
  const url = buildFunctionUrl(baseUrl, path, queryWithAuth)

  const headers = {
    'Content-Type': 'application/json',
    'x-openid': openid,
    'x-wx-openid': openid,
    'x-app-env': appEnv,
    'x-env': appEnv,
    'x-terminal-e2e': 'true'
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  const normalizedBody =
    body && typeof body === 'object' && !Array.isArray(body)
      ? {
          ...body,
          skipAuth: true,
          openid
        }
      : body

  return requestJson(url.toString(), {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(normalizedBody || {})
  })
}

function summarizeFinal(finalData = null) {
  return {
    stage: finalData?.stage || '',
    status: finalData?.status || '',
    outcomeType: finalData?.outcomeType || '',
    routePrimaryAction: finalData?.routePrimaryAction || '',
    resultId: finalData?.finalResult?.resultId || '',
    problemId: finalData?.finalResult?.problemId || '',
    nonProblematicType: finalData?.finalResult?.nonProblematicType || finalData?.nonProblematicType || '',
    primaryOutcome: finalData?.primaryOutcome || null,
    secondaryOutcomes: Array.isArray(finalData?.secondaryOutcomes) ? finalData.secondaryOutcomes : [],
    visibleOutcomes: Array.isArray(finalData?.visibleOutcomes) ? finalData.visibleOutcomes : [],
    routeDecisionCause: finalData?.routeDecisionCause || null,
    routeDecision: finalData?.routeDecision || finalData?.metrics?.routeDecision || null,
    actionAdvice: finalData?.actionAdvice || null
  }
}

function buildAnswerForQuestion(question = {}, answerToken = 'yes', label = 'case') {
  const optionId = pickOptionIdByPattern(question, answerToken)
  const optionSummary = (Array.isArray(question?.options) ? question.options : [])
    .map(option => ({
      optionId: String(option?.optionId || ''),
      decodedOptionKey: parsePublicId('opt', option?.optionId || ''),
      optionKey: String(option?.optionKey || ''),
      text: String(option?.text || '')
    }))
  assertCondition(
    optionId,
    `${label}: cannot map answer token ${answerToken} for question ${question?.questionKey || ''} options=${JSON.stringify(optionSummary)}`
  )
  return {
    questionId: question.questionId,
    optionId
  }
}

function getPrimaryQuestion(data = {}, label = 'case') {
  const questions = Array.isArray(data?.questions) ? data.questions : []
  assertCondition(data?.stage === 'followup', `${label}: follow-up stage missing`)
  assertCondition(questions.length > 0, `${label}: no follow-up questions`)
  return questions[0]
}

async function submitAnswerRound(baseUrl, {
  diagnosePathPrefix = 'diagnose-http',
  openid = '',
  appEnv = DEFAULT_APP_ENV,
  authToken = '',
  sessionId = '',
  roundData = {},
  answers = [],
  extraBody = {},
  label = 'case'
} = {}) {
  const answerResponse = await callDiagnoseHttp(baseUrl, {
    path: `${diagnosePathPrefix}/diagnosis/answer`,
    method: 'POST',
    openid,
    appEnv,
    authToken,
    body: {
      diagnosisSessionId: sessionId,
      roundId: roundData.roundId,
      answers,
      ...extraBody
    }
  })
  return extractEnvelopeData(answerResponse, `${label}:answer`)
}

async function runCase(baseUrl, caseItem, {
  appEnv = DEFAULT_APP_ENV,
  maxFollowupLoops = 4,
  authToken = '',
  diagnosePathPrefix = 'diagnose-http'
} = {}) {
  const openid = buildOpenId('route_regression_runner', caseItem.caseKey || caseItem.label || 'case')
  const startResponse = await callDiagnoseHttp(baseUrl, {
    path: `${diagnosePathPrefix}/diagnosis/start`,
    method: 'POST',
    openid,
    appEnv,
    authToken,
    body: {
      plantCatalogId: String(caseItem.plantCatalogId || '1'),
      observedEvidenceSet: Array.isArray(caseItem.observedEvidenceSet) ? caseItem.observedEvidenceSet : []
    }
  })
  const startData = extractEnvelopeData(startResponse, `${caseItem.label}:start`)

  if (caseItem.revisionFlow) {
    return runRevisionCase(baseUrl, caseItem, {
      appEnv,
      maxFollowupLoops,
      authToken,
      diagnosePathPrefix,
      openid,
      startData
    })
  }

  const expected = caseItem.expected || {}
  if (expected.startStage) {
    assertCondition(startData?.stage === expected.startStage, `${caseItem.label}: unexpected start stage ${startData?.stage || ''}`)
  }
  if (Number(expected.minStartQuestionCount || 0) > 0) {
    assertCondition(
      Array.isArray(startData?.questions) && startData.questions.length >= Number(expected.minStartQuestionCount || 0),
      `${caseItem.label}: insufficient start question count`
    )
  }

  let finalData = null
  let currentRound = startData
  const answerPattern = parseAnswerPattern(caseItem.answerPattern || '')

  if (startData?.stage === 'final') {
    finalData = startData
  }

  for (let loopIndex = 0; !finalData && loopIndex < Number(maxFollowupLoops || 0); loopIndex += 1) {
    assertCondition(currentRound?.stage === 'followup', `${caseItem.label}: follow-up stage missing`)
    const questions = Array.isArray(currentRound?.questions) ? currentRound.questions : []
    assertCondition(questions.length > 0, `${caseItem.label}: no follow-up questions`)

    const answers = questions.map((question, index) => {
      const answerToken = answerPattern[loopIndex + index] || answerPattern[answerPattern.length - 1] || 'yes'
      return buildAnswerForQuestion(question, answerToken, caseItem.label)
    })

    const answerData = await submitAnswerRound(baseUrl, {
      diagnosePathPrefix,
      openid,
      appEnv,
      authToken,
      sessionId: startData.diagnosisSessionId,
      roundData: currentRound,
      answers,
      label: caseItem.label
    })
    if (answerData?.stage === 'final') {
      finalData = answerData
      break
    }
    currentRound = answerData
  }

  assertCondition(finalData, `${caseItem.label}: final result not reached`)
  assertCondition(finalData?.stage === 'final', `${caseItem.label}: final stage invalid`)

  const outcomeType = normalizeLowerText(finalData?.outcomeType || '')
  if (expected.outcome) {
    assertCondition(
      outcomeType === normalizeLowerText(expected.outcome),
      `${caseItem.label}: unexpected outcome ${finalData?.outcomeType || ''} final=${summarizeFinalData(finalData)}`
    )
  }
  if (expected.routePrimaryAction) {
    assertCondition(
      normalizeLowerText(finalData?.routePrimaryAction || '') === normalizeLowerText(expected.routePrimaryAction),
      `${caseItem.label}: unexpected routePrimaryAction ${finalData?.routePrimaryAction || ''} final=${summarizeFinalData(finalData)}`
    )
  }
  if (expected.nonProblematicType) {
    const resolvedType = normalizeLowerText(
      finalData?.finalResult?.nonProblematicType ||
        finalData?.nonProblematicType ||
        ''
    )
    assertCondition(
      resolvedType === normalizeLowerText(expected.nonProblematicType),
      `${caseItem.label}: unexpected nonProblematicType ${resolvedType} final=${summarizeFinalData(finalData)}`
    )
  }
  if (expected.problemKey) {
    const decodedProblemKey = parsePublicId('p', finalData?.finalResult?.problemId || '')
    assertCondition(
      decodedProblemKey === expected.problemKey,
      `${caseItem.label}: unexpected problemKey ${decodedProblemKey} final=${summarizeFinalData(finalData)}`
    )
  }

  const resultResponse = await callDiagnoseHttp(baseUrl, {
    path: `${diagnosePathPrefix}/diagnosis/result`,
    method: 'GET',
    openid,
    appEnv,
    authToken,
    query: {
      id: finalData?.finalResult?.resultId || ''
    }
  })
  const resultData = extractEnvelopeData(resultResponse, `${caseItem.label}:result`)
  if (expected.outcome) {
    assertCondition(
      normalizeLowerText(resultData?.outcomeType || '') === normalizeLowerText(expected.outcome),
      `${caseItem.label}: result outcome mismatch ${resultData?.outcomeType || ''}`
    )
  }

  return {
    label: caseItem.label,
    caseKey: caseItem.caseKey,
    openid,
    start: {
      stage: startData?.stage || '',
      questionCount: Array.isArray(startData?.questions) ? startData.questions.length : 0
    },
    expected,
    final: summarizeFinal(finalData),
    result: summarizeFinal(resultData)
  }
}

async function runRevisionCase(baseUrl, caseItem, {
  appEnv = DEFAULT_APP_ENV,
  maxFollowupLoops = 4,
  authToken = '',
  diagnosePathPrefix = 'diagnose-http',
  openid = '',
  startData = {}
} = {}) {
  const sessionId = startData.diagnosisSessionId
  const initialQuestion = getPrimaryQuestion(startData, `${caseItem.label}:initial`)
  const initialToken = normalizeLowerText(caseItem.initialAnswerToken || 'watering_stable')
  const revisedToken = normalizeLowerText(caseItem.revisedAnswerToken || 'unknown')
  const continuePattern = parseAnswerPattern(caseItem.answerPattern || 'old_lower_leaves_first,no_clear_distribution')

  const firstAnswerData = await submitAnswerRound(baseUrl, {
    diagnosePathPrefix,
    openid,
    appEnv,
    authToken,
    sessionId,
    roundData: startData,
    answers: [buildAnswerForQuestion(initialQuestion, initialToken, `${caseItem.label}:initial`)],
    label: `${caseItem.label}:initial`
  })
  assertCondition(
    firstAnswerData?.stage === 'followup',
    `${caseItem.label}: expected follow-up after initial answer, got ${firstAnswerData?.stage || ''}`
  )

  const revisionData = await submitAnswerRound(baseUrl, {
    diagnosePathPrefix,
    openid,
    appEnv,
    authToken,
    sessionId,
    roundData: startData,
    answers: [buildAnswerForQuestion(initialQuestion, revisedToken, `${caseItem.label}:revision`)],
    extraBody: {
      requestMode: 'answer_revision',
      dirtyFromQuestionId: initialQuestion.questionId,
      baseAnswerRevision: Number(firstAnswerData?.answerRevision || 0)
    },
    label: `${caseItem.label}:revision`
  })
  assertCondition(
    Number(revisionData?.answerRevision || 0) > 0 || revisionData?.stage === 'final',
    `${caseItem.label}: revision response missing answerRevision`
  )

  let finalData = revisionData?.stage === 'final' ? revisionData : null
  let currentRound = revisionData
  for (let loopIndex = 0; !finalData && loopIndex < Number(maxFollowupLoops || 0); loopIndex += 1) {
    const question = getPrimaryQuestion(currentRound, `${caseItem.label}:continue`)
    const answerToken = continuePattern[loopIndex] || continuePattern[continuePattern.length - 1] || 'unknown'
    const answerData = await submitAnswerRound(baseUrl, {
      diagnosePathPrefix,
      openid,
      appEnv,
      authToken,
      sessionId,
      roundData: currentRound,
      answers: [buildAnswerForQuestion(question, answerToken, `${caseItem.label}:continue`)],
      label: `${caseItem.label}:continue`
    })
    if (answerData?.stage === 'final') {
      finalData = answerData
      break
    }
    currentRound = answerData
  }

  assertCondition(finalData, `${caseItem.label}: final result not reached after revision`)

  return {
    label: caseItem.label,
    caseKey: caseItem.caseKey,
    openid,
    start: {
      stage: startData?.stage || '',
      questionCount: Array.isArray(startData?.questions) ? startData.questions.length : 0
    },
    expected: caseItem.expected || {},
    revision: {
      initialQuestionKey: initialQuestion.questionKey || '',
      initialAnswerToken: initialToken,
      revisedAnswerToken: revisedToken,
      answerRevision: Number(revisionData?.answerRevision || 0),
      revisionStage: revisionData?.stage || ''
    },
    final: summarizeFinal(finalData),
    result: summarizeFinal(finalData)
  }
}

async function main(event = {}) {
  const envId = normalizeText(process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.SCF_NAMESPACE)
  assertCondition(envId, 'Missing envId in function environment')

  const appEnv = normalizeText(event?.appEnv || DEFAULT_APP_ENV) || DEFAULT_APP_ENV
  const maxFollowupLoops = Number(event?.maxFollowupLoops || 4)
  const baseUrl = normalizeText(event?.baseUrl || `https://${envId}.service.tcloudbase.com`)
  const diagnosePathPrefix = normalizeText(event?.diagnosePathPrefix || 'diagnose-http')
  const cases = Array.isArray(event?.cases) && event.cases.length ? event.cases : DEFAULT_CASES
  const allowFailures = Boolean(event?.allowFailures)
  const authToken = isGatewayFunctionBaseUrl(baseUrl)
    ? String((await signInAnonymously(envId, buildOpenId('route_regression_runner', 'device')))?.access_token || '')
    : ''
  const healthPath = `${diagnosePathPrefix}/health`

  const healthResponse = await callDiagnoseHttp(baseUrl, {
    path: healthPath,
    method: 'GET',
    openid: buildOpenId('route_regression_runner', 'health'),
    appEnv,
    authToken
  })
  const healthData = extractEnvelopeData(healthResponse, 'health')
  assertCondition(normalizeLowerText(healthData?.status || '') === 'ok', 'Health check did not return ok')

  const results = []
  for (const caseItem of cases) {
    if (!allowFailures) {
      results.push(await runCase(baseUrl, caseItem, { appEnv, maxFollowupLoops, authToken, diagnosePathPrefix }))
      continue
    }

    try {
      results.push({
        ok: true,
        ...(await runCase(baseUrl, caseItem, { appEnv, maxFollowupLoops, authToken, diagnosePathPrefix }))
      })
    } catch (error) {
      results.push({
        ok: false,
        label: caseItem.label,
        caseKey: caseItem.caseKey,
        expected: caseItem.expected || {},
        error: String(error?.message || error || '')
      })
    }
  }

  return {
    ok: true,
    envId,
    appEnv,
    baseUrl,
    checkedCaseCount: results.length,
    results
  }
}

module.exports.main = main
