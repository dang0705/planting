'use strict'

const crypto = require('node:crypto')
const { ANSWER_EFFECTS, OUTCOMES, ACTION_PROFILES } = require('./yellow-leaf-package-runtime-data')
const { parseDiagnosisAirEnvironmentSidecar } = require('./diagnosis-air-environment-fast')
const { getStartQuestionPackage } = require('./start-question-package-runtime-data')
const { dispatchDeferredPersistence } = require('./deferred-persistence-dispatcher')

const YELLOW_LEAF_MODES = new Set([
  'yellow_leaf',
  'manual_yellowing_care_environment_frontloaded',
  'yellowing_mode',
  'leaf_yellowing'
])
const BLOCKED_OUTCOME_KEYS = new Set([
  'leaf_spot_problem',
  'stable_natural_marking',
  'spider_mites',
  'thrips',
  'whiteflies',
  'aphids',
  'scale_insects',
  'mealybugs',
  'sooty_mold_associated_pests',
  'chewing_insects',
  'fungal_leaf_spot',
  'bacterial_leaf_spot',
  'powdery_mildew',
  'rust',
  'virus_mosaic',
  'root_rot'
])
const BLOCKED_OUTCOME_PATTERN =
  /(leaf_?spot|spot_|_spot|lesion|halo|water_?soaked|variegation|marking|mosaic|blotch|mottle|speckl|stippl|pest|mite|thrips|whitefl|aphid|scale|mealy|honeydew|sooty|mold|mildew|powder|rust|disease)/i

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-transform'
    },
    body: JSON.stringify(payload)
  }
}

function text(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return text(value).toLowerCase()
}

function fromPublicId(prefix, value = '') {
  const raw = text(value)
  const marker = `${prefix}_`
  if (!raw.startsWith(marker)) {
    return ''
  }
  const encoded = raw.slice(marker.length)
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return ''
  }
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const decoded = Buffer.from(padded, 'base64').toString('utf8')
  const roundTrip = Buffer.from(decoded, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return decoded && roundTrip === encoded ? decoded : ''
}

function parsePayload(request = {}) {
  const body = request?.body
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body
  }
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function verifyContinuationToken(token, openid, sessionId) {
  const secret = ['DIAGNOSIS_CONTINUATION_SECRET', 'HTTP_IDENTITY_TICKET_SECRET', 'SESSION_TOKEN_SECRET']
    .map(key => text(process.env[key]))
    .find(value => value.length >= 32)
  const raw = text(token)
  if (!secret || !raw) {
    return null
  }
  const [encoded, receivedSignature, extra] = raw.split('.')
  if (extra || !encoded || !receivedSignature) {
    return null
  }
  const expectedSignature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  const expectedBuffer = Buffer.from(expectedSignature)
  const receivedBuffer = Buffer.from(receivedSignature)
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return null
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const snapshot = payload?.questionPackageSnapshot
  const snapshotMode = text(snapshot?.mode || snapshot?.sourceMode || snapshot?.route)
  const packageQuestions = Array.isArray(snapshot?.packageQuestions)
    ? snapshot.packageQuestions
    : getStartQuestionPackage(snapshotMode)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (
    !payload ||
    payload.version !== 1 ||
    payload.kind !== 'diagnosis-question-package' ||
    text(payload.openid) !== text(openid) ||
    text(payload.sessionId) !== text(sessionId) ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > nowSeconds + 60 ||
    payload.expiresAt < nowSeconds ||
    payload.expiresAt - payload.issuedAt > 15 * 60 ||
    text(payload.questionPackage?.answerSubmitMode) !== 'package' ||
    text(snapshot?.answerSubmitMode) !== 'package' ||
    packageQuestions.length === 0
  ) {
    return null
  }
  if (!Array.isArray(snapshot?.packageQuestions)) {
    payload.questionPackageSnapshot = {
      ...snapshot,
      packageQuestions
    }
  }
  return payload
}

function normalizeAnswers(answers = []) {
  return (Array.isArray(answers) ? answers : [])
    .map(item => ({
      questionKey:
        fromPublicId('q', item?.questionId) ||
        text(item?.questionKey || item?.question_key || item?.questionId),
      optionKey:
        fromPublicId('opt', item?.optionId) ||
        normalizeKey(item?.optionKey || item?.option_key || item?.optionId)
    }))
    .filter(item => item.questionKey && item.optionKey)
}

function buildAllowedOptionPairs(packageQuestions = []) {
  const pairs = new Set()
  for (const question of packageQuestions) {
    const questionKey = text(question?.questionKey)
    if (!questionKey) {
      continue
    }
    if (text(question?.uiVariant) === 'care_behavior_timeline') {
      pairs.add(`${questionKey}::care_behavior_timeline`)
    }
    for (const option of Array.isArray(question?.options) ? question.options : []) {
      const optionKey =
        normalizeKey(option?.optionKey) || fromPublicId('opt', option?.optionId) || normalizeKey(option?.optionId)
      if (optionKey) {
        pairs.add(`${questionKey}::${optionKey}`)
      }
    }
  }
  return pairs
}

function buildSessionState(ticket) {
  const plantContext = ticket?.plantContext && typeof ticket.plantContext === 'object' ? ticket.plantContext : {}
  const snapshot = ticket?.questionPackageSnapshot || {}
  return {
    sessionId: text(ticket?.sessionId),
    userPlantId: plantContext.userPlantId || null,
    plantId: plantContext.plantId || null,
    plantContext,
    runtimeSnapshot: {
      questionPackageSnapshot: snapshot,
      observedSymptoms: Array.isArray(ticket?.observedSymptoms) ? ticket.observedSymptoms : [],
      observedEvidenceSet: Array.isArray(ticket?.observedEvidenceSet) ? ticket.observedEvidenceSet : []
    },
    currentRoundId: text(ticket?.roundId) || 'round_1',
    currentRoundIndex: 1
  }
}

function buildLightHealthEffects(environmentCareContext) {
  const evidence = environmentCareContext?.outputs?.lightHealthEvidence
  const score = Number(environmentCareContext?.outputs?.lightHealthScore)
  const direction = text(evidence?.direction)
  if (!evidence || !Number.isFinite(score) || !['low', 'strong'].includes(direction)) {
    return []
  }
  const outcomeKey = direction === 'low' ? 'low_light_growth_weakness' : 'sunburn'
  return [{ questionKey: 'light_health_evidence', optionKey: direction, outcomeKey, routeKey: direction === 'low' ? 'yellowing_low_light_route' : 'yellowing_sunburn_route', effectType: 'support', effectStrength: score < 40 ? 2.4 : score < 65 ? 2 : 1.55 }]
}

function buildHydrationEffects(environmentCareContext) {
  const summary = environmentCareContext?.behaviorSummary10d
  const wetPressureLoad = Number(summary?.wetPressureLoad)
  const thoroughCount = Number(summary?.thoroughWateringCount10d)
  const lastEffectiveDaysAgo = Number(summary?.lastEffectiveRootWateredDaysAgo)
  if (!summary || !Number.isFinite(wetPressureLoad)) {
    return []
  }
  if (wetPressureLoad >= 0.7 && thoroughCount >= 2) {
    return [{ questionKey: 'hydration_evidence', optionKey: 'thorough_wet_pressure', outcomeKey: 'overwatering_root_pressure', routeKey: 'watering_root_pressure_route', effectType: 'support', effectStrength: 2 }]
  }
  if (wetPressureLoad >= 0.5 && thoroughCount >= 1) {
    return [{ questionKey: 'hydration_evidence', optionKey: 'moderate_wet_pressure', outcomeKey: 'overwatering_root_pressure', routeKey: 'watering_root_pressure_route', effectType: 'support', effectStrength: 1.5 }]
  }
  if (wetPressureLoad <= 0.2 && lastEffectiveDaysAgo >= 7) {
    return [{ questionKey: 'hydration_evidence', optionKey: 'dry_low_pressure', outcomeKey: 'overwatering_root_pressure', routeKey: 'watering_root_pressure_route', effectType: 'weaken', effectStrength: 0.5 }]
  }
  return []
}

function buildScoreMap(effects, answers) {
  const pairs = new Set(answers.map(item => `${item.questionKey}::${item.optionKey}`))
  const scoreMap = new Map()
  for (const effect of effects) {
    if (!pairs.has(`${effect.questionKey}::${effect.optionKey}`) && effect.questionKey !== 'light_health_evidence' && effect.questionKey !== 'hydration_evidence') {
      continue
    }
    const outcomeKey = text(effect.outcomeKey)
    if (!outcomeKey || BLOCKED_OUTCOME_KEYS.has(outcomeKey) || BLOCKED_OUTCOME_PATTERN.test(outcomeKey)) {
      continue
    }
    const current = scoreMap.get(outcomeKey) || { outcomeKey, score: 0, excluded: false, routeKeys: new Set() }
    const strength = Number(effect.effectStrength) || 0
    if (effect.effectType === 'exclude') {
      current.excluded = true
    } else if (effect.effectType === 'weaken') {
      current.score -= strength > 0 ? strength : 0.1
    } else {
      current.score += strength > 0 ? strength : 1
    }
    if (effect.routeKey) {
      current.routeKeys.add(effect.routeKey)
    }
    scoreMap.set(outcomeKey, current)
  }
  return Array.from(scoreMap.values())
    .filter(item => !item.excluded && item.score > 0)
    .sort((left, right) => right.score - left.score || left.outcomeKey.localeCompare(right.outcomeKey))
}

function uniqueTexts(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map(text).filter(Boolean)))
}

function buildVisibleOutcome(outcome, profile) {
  return {
    outcomeKey: text(outcome?.outcomeKey),
    problemKey: text(outcome?.sourceProblemKey || outcome?.outcomeKey),
    outcomeType: text(outcome?.outcomeType || 'problematic') || 'problematic',
    outcomeCategory: text(outcome?.outcomeCategory || 'yellow_leaf_route'),
    displayNameCn: text(outcome?.displayNameCn || outcome?.outcomeKey),
    summary: text(outcome?.userDefinitionCn),
    severity: text(outcome?.riskLevel || 'medium'),
    urgency: '',
    actionProfileKey: text(
      outcome?.actionProfileKey ||
        outcome?.action_profile_key ||
        profile?.actionProfileKey ||
        profile?.action_profile_key ||
        ''
    ),
    actionAdviceItems: uniqueTexts(profile?.todayActions),
    avoidAdviceItems: uniqueTexts(profile?.avoidActions)
  }
}

function compactEnvironmentCareContext(value) {
  if (!value || typeof value !== 'object') {
    return null
  }
  return {
    version: value.version || 'v7',
    outputs: value.outputs || {},
    behaviorSummary10d: value.behaviorSummary10d || null,
    historicalSummary10d: value.historicalSummary10d || null,
    forecastSummary15d: value.forecastSummary15d || null,
    watering: value.watering
      ? { baseline: value.watering.baseline || null, wateringContext: value.watering.wateringContext || '', action: value.watering.action || '', reasons: value.watering.reasons || [] }
      : null,
    fertilizing: value.fertilizing
      ? { baseline: value.fertilizing.baseline || null, action: value.fertilizing.action || '', lastFertilizedBucket: value.fertilizing.lastFertilizedBucket || '', reasons: value.fertilizing.reasons || [] }
      : null,
    light: value.light
      ? { lightContext: value.light.lightContext || [], userLightContext: value.light.userLightContext || {}, lightHealthScore: value.light.lightHealthScore ?? null, lightHealthLevel: value.light.lightHealthLevel || '', lightHealthReason: value.light.lightHealthReason || '', lightHealthEvidence: value.light.lightHealthEvidence || null, realExposureScene: Boolean(value.light.realExposureScene) }
      : null
  }
}

function buildClientContext(payload = {}) {
  const source = payload?.clientContext && typeof payload.clientContext === 'object' ? payload.clientContext : payload
  const result = {}
  for (const key of ['source', 'platform', 'reviewSourceType', 'visualInputVersion', 'diagnosisProfile', 'entrySource']) {
    const value = text(source?.[key])
    if (value) result[key] = value
  }
  return Object.keys(result).length ? result : null
}

function hasSubmittedEnvironmentCareInput(payload = {}) {
  const values = [
    payload?.careBehaviorTimeline,
    payload?.care_behavior_timeline,
    payload?.userLightContext,
    payload?.user_light_context,
    payload?.airEnvironmentOverride,
    payload?.air_environment_override,
    payload?.airEnvironmentByQuestionId,
    payload?.air_environment_by_question_id
  ]
  return values.some(value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0)
}

function buildDeferredPersistenceTask({ sessionId, openid, plantContext, response, round, payload }) {
  return () => {
    dispatchDeferredPersistence({
      sessionId,
      openid,
      plantContext,
      response,
      round,
      image: '',
      description: '',
      clientContext: buildClientContext(payload),
      sessionQuestionRows: null
    })
  }
}

function attachAfterResponse(response, task) {
  Object.defineProperty(response, 'afterResponse', {
    value: task,
    enumerable: false,
    configurable: false,
    writable: false
  })
  return response
}

async function handleYellowLeafAnswer({ payload = {}, identity = {} } = {}) {
  const sessionId = text(payload.diagnosisSessionId || payload.diagnosisId)
  const openid = text(identity?.openid)
  if (!sessionId || !openid) {
    throw Object.assign(new Error('缺少问诊会话或登录身份'), { statusCode: 400 })
  }
  const continuation = verifyContinuationToken(
    payload.questionPackageContinuationToken || payload.question_package_continuation_token,
    openid,
    sessionId
  )
  if (!continuation) {
    throw Object.assign(new Error('题包已失效，请重新开始问诊'), { statusCode: 409 })
  }
  const snapshot = continuation.questionPackageSnapshot
  if (!YELLOW_LEAF_MODES.has(normalizeKey(snapshot.mode || snapshot.sourceMode || snapshot.route))) {
    throw Object.assign(new Error('当前题包不适用此快路径'), { statusCode: 400 })
  }
  const answers = normalizeAnswers(payload.answers)
  const allowedQuestionKeys = new Set(snapshot.packageQuestions.map(item => text(item?.questionKey)).filter(Boolean))
  const allowedOptionPairs = buildAllowedOptionPairs(snapshot.packageQuestions)
  if (!answers.length || answers.some(item => !allowedQuestionKeys.has(item.questionKey) || !allowedOptionPairs.has(`${item.questionKey}::${item.optionKey}`))) {
    throw Object.assign(new Error('问诊题目或选项不属于当前会话题包'), { statusCode: 400 })
  }

  let airEnvironment
  try {
    airEnvironment = parseDiagnosisAirEnvironmentSidecar({ payload, answers, questionPackageSnapshot: snapshot })
  } catch (error) {
    throw Object.assign(new Error(error?.message || '空气环境答案无效'), { statusCode: 400 })
  }
  if (!airEnvironment?.ok) {
    throw Object.assign(new Error(airEnvironment?.error || '空气环境答案无效'), { statusCode: 400 })
  }

  const sessionState = buildSessionState(continuation)
  // 题包会在用户未填写养护时间线时一并提交天气窗口；它不能单独推导养护结论。
  // 不要仅因题目类型或天气预取加载完整环境运行时，避免冷请求把无效计算串到首包。
  const runtimeInputsExist = hasSubmittedEnvironmentCareInput(payload)
  let environmentCareContext = null
  if (runtimeInputsExist) {
    const dynamicRequire = eval('require')
    const { resolveRuntimeEnvironmentCarePayload } = dynamicRequire('./care-runtime.js')
    environmentCareContext = resolveRuntimeEnvironmentCarePayload({
      payload,
      sessionState,
      plantContext: sessionState.plantContext || {}
    }).environmentCareContext
  }

  const wateringContext = text(environmentCareContext?.outputs?.wateringContext)
  const effects = ANSWER_EFFECTS.map(effect => {
    if (effect.optionKey !== 'care_behavior_timeline' || !wateringContext) return effect
    const optionKey = wateringContext === 'likely_too_wet' ? 'often_wet' : wateringContext === 'likely_too_dry' ? 'often_dry' : 'normal_or_stable'
    return { ...effect, optionKey }
  })
  const scores = buildScoreMap([
    ...buildLightHealthEffects(environmentCareContext),
    ...buildHydrationEffects(environmentCareContext),
    ...effects
  ], answers)
  const visibleOutcomes = scores.map(item => buildVisibleOutcome(OUTCOMES[item.outcomeKey], ACTION_PROFILES[OUTCOMES[item.outcomeKey]?.actionProfileKey])).filter(item => item.outcomeKey)
  const primary = visibleOutcomes[0] || null
  const outcomeType = visibleOutcomes.length ? 'problematic' : 'uncertain'
  const round = (Number(text(continuation.roundId).replace('round_', '')) || 1) + 1
  const resultId = `res_${Buffer.from(`${sessionId}:${round}`).toString('base64url')}`
  const packageMode = text(snapshot.mode) || 'yellow_leaf'
  const roundResult = {
    diagnosisSessionId: sessionId,
    resultId,
    roundId: `round_${round}`,
    roundIndex: round,
    currentRoundIndex: round,
    currentRoundId: `round_${round}`,
    stage: 'final',
    status: 'closed',
    sessionStatus: 'closed',
    routePrimaryAction: 'finalize',
    stopReason: visibleOutcomes.length ? 'yellow_leaf_route_package_completed' : 'yellow_leaf_route_package_uncertain',
    outcomeType,
    outcomeMode: visibleOutcomes.length ? 'visible_outcomes' : 'uncertain',
    plantId: sessionState.plantContext?.userPlantId || sessionState.plantContext?.plantId || '',
    plantIdentityId: sessionState.plantContext?.plantIdentityId || '',
    identityResolutionStatus: sessionState.plantContext?.identityResolutionStatus || '',
    questions: [],
    finalResult: {
      resultId,
      problemKey: text(primary?.problemKey || 'yellow_leaf_action_list'),
      displayName: text(primary?.displayNameCn || '黄叶处理建议'),
      problemName: text(primary?.displayNameCn || '黄叶处理建议'),
      summary: text(primary?.summary || '当前证据仍不足以安全闭合到具体方向。'),
      outcomeType,
      visibleOutcomes,
      outcomeMode: visibleOutcomes.length ? 'visible_outcomes' : 'uncertain',
      actionAdvice: {
        todayActions: uniqueTexts(visibleOutcomes.flatMap(item => item.actionAdviceItems)),
        threeDayActions: [],
        sevenDayObserve: visibleOutcomes.length ? ['连续观察 3-5 天，记录黄叶是否继续扩大。'] : [],
        avoidActions: uniqueTexts(visibleOutcomes.flatMap(item => item.avoidAdviceItems)),
        retakeOrEscalate: [],
        conflictDetected: false
      }
    },
    visibleOutcomes,
    highRiskWarning: '',
    observationPeriod: visibleOutcomes.length ? '建议连续观察 3-5 天。' : '',
    questionPackage: { ...continuation.questionPackage, mode: packageMode },
    careBehaviorTimeline: environmentCareContext?.careBehaviorTimeline || null,
    environmentCareContext,
    plantContext: sessionState.plantContext || {},
    airEnvironmentByQuestionId: airEnvironment.byQuestionId || {},
    airEnvironmentSnapshotsByQuestionId: airEnvironment.snapshotsByQuestionId || {},
    airEnvironmentSnapshotSourceByQuestionId: airEnvironment.sourceByQuestionId || {},
    airEnvironmentEvidence: airEnvironment.evidence || null,
    uiHints: { canUploadMoreImages: false, maxQuestionsThisRound: 0, questionDisplayMode: 'package', answerSubmitMode: 'package', optionLayout: 'vertical', transition: 'swiper' }
  }
  return attachAfterResponse(jsonResponse(200, {
    code: 200,
    message: '问诊提交成功',
    data: {
      diagnosisSessionId: sessionId,
      resultId,
      roundId: `round_${round}`,
      plantId: roundResult.plantId,
      stage: 'final',
      status: 'closed',
      outcomeType,
      stopReason: roundResult.stopReason,
      finalResult: {
        resultId,
        problemId: '',
        problemKey: '',
        displayName: roundResult.finalResult.displayName,
        summary: roundResult.finalResult.summary,
        severity: text(primary?.severity || 'medium'),
        outcomeType,
        nonProblematicType: ''
      },
      visibleOutcomes,
      highRiskWarning: '',
      observationPeriod: roundResult.observationPeriod,
      outcomeMode: roundResult.outcomeMode,
      hasActiveQuestions: false,
      questions: [],
      environmentCareContext: compactEnvironmentCareContext(environmentCareContext),
      airEnvironmentByQuestionId: roundResult.airEnvironmentByQuestionId,
      airEnvironmentSnapshotsByQuestionId: roundResult.airEnvironmentSnapshotsByQuestionId,
      airEnvironmentSnapshotSourceByQuestionId: roundResult.airEnvironmentSnapshotSourceByQuestionId,
      airEnvironmentEvidence: roundResult.airEnvironmentEvidence,
      uiHints: { canUploadMoreImages: false, maxQuestionsThisRound: 0, questionDisplayMode: 'single', answerSubmitMode: 'per_question', optionLayout: 'vertical', transition: 'swiper' }
    }
  }), buildDeferredPersistenceTask({
    sessionId,
    openid,
    plantContext: sessionState.plantContext,
    response: roundResult,
    round: round - 1,
    payload
  }))
}

module.exports = {
  handleYellowLeafAnswer,
  _test: { hasSubmittedEnvironmentCareInput, buildVisibleOutcome }
}
