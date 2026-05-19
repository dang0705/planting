'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const { resolveSchema } = require('../db/schema-resolver')
const { OUTCOME_EFFECT_TYPE } = require('../constants/outcome-route')

const STATIC_REPOSITORY_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.DIAGNOSE_STATIC_CACHE_TTL_MS || 60000)
)
const staticCache = {
  allRouteGroupsBySchema: new Map(),
  preloadExpiresAt: 0,
  routeGroupsBySignature: new Map(),
  routesByOutcomeSignature: new Map(),
  gatesByRouteSignature: new Map(),
  questionsByRouteSignature: new Map(),
  answerEffectsByQuestionSignature: new Map(),
  actionProfilesBySignature: new Map(),
  outcomesBySignature: new Map()
}
const pendingStaticCache = new Map()

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function normalizeKeys(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map(item => normalizeKey(item)).filter(Boolean))
  )
}

function normalizeCacheSignature(values = []) {
  return normalizeKeys(values).sort().join('|')
}

function buildSchemaCacheKey(parts = []) {
  return [
    resolveSchema(),
    ...parts.map(item => String(item || '').trim())
  ].join('::')
}

function getCached(cache, key = '') {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return undefined}
  const normalizedKey = String(key || '').trim()
  const entry = cache.get(normalizedKey)
  if (!entry) {return undefined}
  if (Date.now() - Number(entry.cachedAt || 0) > STATIC_REPOSITORY_CACHE_TTL_MS) {
    cache.delete(normalizedKey)
    return undefined
  }
  return entry.value
}

function setCached(cache, key = '', value) {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return}
  cache.set(String(key || '').trim(), {
    cachedAt: Date.now(),
    value
  })
}

function withPendingStaticQuery(key = '', loader) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) {
    return loader()
  }
  if (pendingStaticCache.has(normalizedKey)) {
    return pendingStaticCache.get(normalizedKey)
  }
  const promise = Promise.resolve()
    .then(loader)
    .finally(() => {
      pendingStaticCache.delete(normalizedKey)
    })
  pendingStaticCache.set(normalizedKey, promise)
  return promise
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === '') {return fallback}
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value
  }
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function normalizeStringArray(value) {
  const parsed = safeJsonParse(value, value)
  if (Array.isArray(parsed)) {
    return parsed.map(item => normalizeKey(item)).filter(Boolean)
  }
  if (typeof parsed === 'string') {
    return parsed
      .split(',')
      .map(item => normalizeKey(item))
      .filter(Boolean)
  }
  return []
}

function normalizeEffectType(value = '') {
  const normalized = normalizeKey(value).toLowerCase()
  if (!normalized) {return OUTCOME_EFFECT_TYPE.NEUTRAL}
  const allowed = new Set(Object.values(OUTCOME_EFFECT_TYPE))
  return allowed.has(normalized) ? normalized : OUTCOME_EFFECT_TYPE.NEUTRAL
}

function mapRouteGroupRow(row = {}) {
  return {
    routeGroupKey: row.route_group_key || '',
    routeGroupNameCn: row.route_group_name_cn || '',
    entrySceneCn: row.entry_scene_cn || '',
    entrySymptomKeys: normalizeStringArray(row.entry_symptom_keys_json),
    candidateOutcomeKeys: normalizeStringArray(row.candidate_outcome_keys_json),
    defaultSplitQuestionKey: row.default_split_question_key || '',
    maxVisibleOutcomes: Number(row.max_visible_outcomes || 3),
    visibleQuestionPurposeCn: row.visible_question_purpose_cn || '',
    enabled: Number(row.enabled || 0) === 1,
    reviewStatus: row.review_status || '',
    dataStatus: row.data_status || ''
  }
}

function mapRouteRow(row = {}) {
  return {
    routeKey: row.route_key || '',
    routeGroupKey: row.route_group_key || '',
    outcomeKey: row.outcome_key || '',
    routeNameCn: row.route_name_cn || '',
    routeEntryType: row.route_entry_type || '',
    entrySymptomKeys: normalizeStringArray(row.entry_symptom_keys_json),
    entryDirectionKeys: normalizeStringArray(row.entry_direction_keys_json),
    entrySymptomClassKeys: normalizeStringArray(row.entry_symptom_class_keys_json),
    hostProfileCondition: safeJsonParse(row.host_profile_condition_json, {}),
    entryPriority: Number(row.entry_priority || 0),
    maxQuestions: Number(row.max_questions || 1),
    fallbackPolicy: row.fallback_policy || '',
    actionProfileKey: row.action_profile_key || '',
    actionConflictGroup: row.action_conflict_group || '',
    enabled: Number(row.enabled || 0) === 1,
    reviewStatus: row.review_status || '',
    dataStatus: row.data_status || ''
  }
}

function mapGateRow(row = {}) {
  return {
    gateKey: row.gate_key || '',
    routeKey: row.route_key || '',
    gateRole: row.gate_role || '',
    requiredEvidence: safeJsonParse(row.required_evidence_json, {}),
    requiredAnswerEffects: safeJsonParse(row.required_answer_effects_json, {}),
    blockerEvidence: safeJsonParse(row.blocker_evidence_json, {}),
    conflictOutcomeKeys: normalizeStringArray(row.conflict_outcome_keys_json),
    closureLevel: row.closure_level || '',
    onPass: row.on_pass || '',
    onFail: row.on_fail || '',
    onUnknown: row.on_unknown || '',
    decisionCauseKey: row.decision_cause_key || '',
    decisionCauseTextCn: row.decision_cause_text_cn || '',
    gatePriority: Number(row.gate_priority || 0),
    enabled: Number(row.enabled || 0) === 1,
    reviewStatus: row.review_status || '',
    dataStatus: row.data_status || ''
  }
}

function mapRouteQuestionRow(row = {}) {
  return {
    routeKey: row.route_key || '',
    stepNo: Number(row.step_no || 0),
    questionKey: row.question_key || '',
    targetDimension: row.target_dimension || '',
    targetSymptomKey: row.target_symptom_key || '',
    questionTextUserCn: row.question_text_user_cn || '',
    gateKey: row.gate_key || '',
    questionRole: row.question_role || '',
    requiredForClosure: Number(row.required_for_closure || 0) === 1,
    askPriority: Number(row.ask_priority || 0),
    skipIfEvidence: safeJsonParse(row.skip_if_evidence_json, {}),
    repeatPolicy: row.repeat_policy || '',
    enabled: Number(row.enabled || 0) === 1,
    reviewStatus: row.review_status || '',
    dataStatus: row.data_status || ''
  }
}

function mapAnswerEffectRow(row = {}) {
  return {
    questionKey: row.question_key || '',
    optionKey: row.option_key || '',
    outcomeKey: row.outcome_key || '',
    routeKey: row.route_key || '',
    effectType: normalizeEffectType(row.effect_type),
    effectStrength: clamp01(row.effect_strength),
    redirectOutcomeKey: row.redirect_outcome_key || '',
    evidenceDimension: row.evidence_dimension || '',
    effectNoteCn: row.effect_note_cn || '',
    enabled: Number(row.enabled || 0) === 1,
    reviewStatus: row.review_status || '',
    dataStatus: row.data_status || ''
  }
}

function mapActionProfileRow(row = {}) {
  return {
    actionProfileKey: row.action_profile_key || '',
    titleCn: row.title_cn || '',
    todayActions: normalizeStringArray(row.today_actions_json),
    threeDayActions: normalizeStringArray(row.three_day_actions_json),
    sevenDayObserve: normalizeStringArray(row.seven_day_observe_json),
    avoidActions: normalizeStringArray(row.avoid_actions_json),
    retakeOrEscalate: normalizeStringArray(row.retake_or_escalate_json),
    plantBaselineMergePolicy: row.plant_baseline_merge_policy || '',
    reviewStatus: row.review_status || '',
    dataStatus: row.data_status || ''
  }
}

function mapDiagnosisOutcomeRow(row = {}) {
  return {
    outcomeKey: row.outcome_key || '',
    legacyProblemKey: row.legacy_problem_key || '',
    outcomeNameCn: row.outcome_name_cn || '',
    outcomeType: row.outcome_type || '',
    outcomeCategory: row.outcome_category || '',
    displayNameCn: row.display_name_cn || '',
    userDefinitionCn: row.user_definition_cn || '',
    actionProfileKey: row.action_profile_key || '',
    riskLevel: row.risk_level || '',
    isFinalOutput: Number(row.is_final_output || 0) === 1,
    isIntermediateNode: Number(row.is_intermediate_node || 0) === 1,
    allowDirectClose: Number(row.allow_direct_close || 0) === 1,
    allowUncertainClose: Number(row.allow_uncertain_close || 0) === 1,
    priority: Number(row.priority || 0),
    reviewStatus: row.review_status || '',
    dataStatus: row.data_status || ''
  }
}

async function runSql(sql = '') {
  const result = await models.$runSQL(sql, {})
  return result?.data?.executeResultList || []
}

function buildAuditedStatusClause(fieldName) {
  return `(${fieldName} = 'active' OR ${fieldName} = 'audited' OR ${fieldName} <=> NULL)`
}

function buildReviewedStatusClause(fieldName) {
  return `(${fieldName} = 'audited' OR ${fieldName} <=> NULL)`
}

async function getOutcomeRouteGroupsByKeys(routeGroupKeys = []) {
  const safeKeys = normalizeKeys(routeGroupKeys)
  if (!safeKeys.length) {return []}
  const cacheKey = buildSchemaCacheKey(['routeGroups', normalizeCacheSignature(safeKeys)])
  const cached = getCached(staticCache.routeGroupsBySignature, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.routeGroupsBySignature, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        route_group_key,
        route_group_name_cn,
        entry_scene_cn,
        entry_symptom_keys_json,
        candidate_outcome_keys_json,
        default_split_question_key,
        max_visible_outcomes,
        visible_question_purpose_cn,
        enabled,
        review_status,
        data_status
      FROM ${table('outcome_route_groups')}
      WHERE route_group_key IN ${sqlInList(safeKeys)}
        AND enabled = 1
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY route_group_key ASC
    `
    )
    const mappedRows = rows.map(mapRouteGroupRow)
    setCached(staticCache.routeGroupsBySignature, cacheKey, mappedRows)
    return mappedRows
  })
}

async function getAllActiveOutcomeRouteGroups() {
  const cacheKey = buildSchemaCacheKey(['allRouteGroups'])
  const cached = getCached(staticCache.allRouteGroupsBySchema, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.allRouteGroupsBySchema, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        route_group_key,
        route_group_name_cn,
        entry_scene_cn,
        entry_symptom_keys_json,
        candidate_outcome_keys_json,
        default_split_question_key,
        max_visible_outcomes,
        visible_question_purpose_cn,
        enabled,
        review_status,
        data_status
      FROM ${table('outcome_route_groups')}
      WHERE enabled = 1
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY route_group_key ASC
    `
    )
    const mappedRows = rows.map(mapRouteGroupRow)
    setCached(staticCache.allRouteGroupsBySchema, cacheKey, mappedRows)
    return mappedRows
  })
}

async function preloadOutcomeRouteRepositoryCache() {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return}
  const now = Date.now()
  if (staticCache.preloadExpiresAt > now) {return}

  await withPendingStaticQuery('preloadOutcomeRouteRepositoryCache:all', async () => {
    const refreshedNow = Date.now()
    if (staticCache.preloadExpiresAt > refreshedNow) {return}

    const [
      allRouteGroupsRaw,
      allRoutesRaw,
      allQuestionsRaw,
      allGatesRaw,
      allAnswerEffectsRaw,
      allActionProfilesRaw,
      allOutcomesRaw
    ] = await Promise.all([
      runSql(
        `
          SELECT
            route_group_key,
            route_group_name_cn,
            entry_scene_cn,
            entry_symptom_keys_json,
            candidate_outcome_keys_json,
            default_split_question_key,
            max_visible_outcomes,
            visible_question_purpose_cn,
            enabled,
            review_status,
            data_status
          FROM ${table('outcome_route_groups')}
          WHERE enabled = 1
            AND ${buildAuditedStatusClause('data_status')}
            AND ${buildReviewedStatusClause('review_status')}
          ORDER BY route_group_key ASC
        `
      ),
      runSql(
        `
          SELECT
            route_key,
            route_group_key,
            outcome_key,
            route_name_cn,
            route_entry_type,
            entry_symptom_keys_json,
            entry_direction_keys_json,
            entry_symptom_class_keys_json,
            host_profile_condition_json,
            entry_priority,
            max_questions,
            fallback_policy,
            action_profile_key,
            action_conflict_group,
            enabled,
            review_status,
            data_status
          FROM ${table('outcome_routes')}
          WHERE enabled = 1
            AND ${buildAuditedStatusClause('data_status')}
            AND ${buildReviewedStatusClause('review_status')}
          ORDER BY entry_priority DESC, route_key ASC
        `
      ),
      runSql(
        `
          SELECT
            route_questions.route_key,
            route_questions.step_no,
            route_questions.question_key,
            questions.target_dimension,
            questions.target_symptom_key,
            questions.question_text_user_cn,
            route_questions.gate_key,
            route_questions.question_role,
            route_questions.required_for_closure,
            route_questions.ask_priority,
            route_questions.skip_if_evidence_json,
            route_questions.repeat_policy,
            route_questions.enabled,
            route_questions.review_status,
            route_questions.data_status
          FROM ${table('outcome_route_questions')} route_questions
          LEFT JOIN ${table('question_library_v5_real')} questions
            ON questions.question_key COLLATE utf8mb4_0900_ai_ci =
              route_questions.question_key COLLATE utf8mb4_0900_ai_ci
            AND questions.data_status IN ('audited', 'partial')
            AND questions.review_status IN ('audited', 'partial')
          WHERE route_questions.enabled = 1
            AND ${buildAuditedStatusClause('route_questions.data_status')}
            AND ${buildReviewedStatusClause('route_questions.review_status')}
          ORDER BY route_questions.ask_priority DESC, route_questions.step_no ASC, route_questions.question_key ASC
        `
      ),
      runSql(
        `
          SELECT
            gate_key,
            route_key,
            gate_role,
            required_evidence_json,
            required_answer_effects_json,
            blocker_evidence_json,
            conflict_outcome_keys_json,
            closure_level,
            on_pass,
            on_fail,
            on_unknown,
            decision_cause_key,
            decision_cause_text_cn,
            gate_priority,
            enabled,
            review_status,
            data_status
          FROM ${table('outcome_route_gates')}
          WHERE route_key IN (
            SELECT route_key FROM ${table('outcome_routes')}
            WHERE enabled = 1
              AND ${buildAuditedStatusClause('data_status')}
              AND ${buildReviewedStatusClause('review_status')}
          )
            AND enabled = 1
            AND ${buildAuditedStatusClause('data_status')}
            AND ${buildReviewedStatusClause('review_status')}
          ORDER BY gate_priority DESC, gate_key ASC
        `
      ),
      runSql(
        `
          SELECT
            question_key,
            option_key,
            outcome_key,
            route_key,
            effect_type,
            effect_strength,
            redirect_outcome_key,
            evidence_dimension,
            effect_note_cn,
            enabled,
            review_status,
            data_status
          FROM ${table('outcome_answer_effects')}
          WHERE enabled = 1
            AND ${buildAuditedStatusClause('data_status')}
            AND ${buildReviewedStatusClause('review_status')}
          ORDER BY question_key ASC, option_key ASC
        `
      ),
      runSql(
        `
          SELECT
            action_profile_key,
            title_cn,
            today_actions_json,
            three_day_actions_json,
            seven_day_observe_json,
            avoid_actions_json,
            retake_or_escalate_json,
            plant_baseline_merge_policy,
            review_status,
            data_status
          FROM ${table('outcome_action_profiles')}
          WHERE ${buildAuditedStatusClause('data_status')}
            AND ${buildReviewedStatusClause('review_status')}
          ORDER BY action_profile_key ASC
        `
      ),
      runSql(
        `
          SELECT
            outcome_key,
            legacy_problem_key,
            outcome_name_cn,
            outcome_type,
            outcome_category,
            display_name_cn,
            user_definition_cn,
            action_profile_key,
            risk_level,
            is_final_output,
            is_intermediate_node,
            allow_direct_close,
            allow_uncertain_close,
            priority,
            review_status,
            data_status
          FROM ${table('diagnosis_outcomes')}
          WHERE ${buildAuditedStatusClause('data_status')}
            AND ${buildReviewedStatusClause('review_status')}
          ORDER BY priority DESC, outcome_key ASC
        `
      )
    ])

    const mappedRouteGroups = allRouteGroupsRaw.map(mapRouteGroupRow)
    const mappedRoutes = allRoutesRaw.map(mapRouteRow)
    const mappedQuestions = allQuestionsRaw.map(mapRouteQuestionRow)
    const mappedGates = allGatesRaw.map(mapGateRow)
    const mappedAnswerEffects = allAnswerEffectsRaw.map(mapAnswerEffectRow)
    const mappedActionProfiles = allActionProfilesRaw.map(mapActionProfileRow)
    const mappedOutcomes = allOutcomesRaw.map(mapDiagnosisOutcomeRow)

    const allGroupsKey = buildSchemaCacheKey(['allRouteGroups'])
    setCached(staticCache.allRouteGroupsBySchema, allGroupsKey, mappedRouteGroups)

    const routeGroupsByKey = new Map()
    for (const row of mappedRouteGroups) {
      const key = normalizeKey(row.routeGroupKey)
      if (!key) {continue}
      routeGroupsByKey.set(key, row)
      const cacheKey = buildSchemaCacheKey(['routeGroups', normalizeCacheSignature([key])])
      setCached(staticCache.routeGroupsBySignature, cacheKey, [row])
    }

    const routesByOutcome = new Map()
    for (const row of mappedRoutes) {
      const key = normalizeKey(row.outcomeKey)
      if (!key) {continue}
      if (!routesByOutcome.has(key)) {routesByOutcome.set(key, [])}
      routesByOutcome.get(key).push(row)
    }
    for (const [outcomeKey, rows] of routesByOutcome.entries()) {
      const cacheKey = buildSchemaCacheKey([
        'routesByOutcome',
        normalizeCacheSignature([outcomeKey])
      ])
      setCached(staticCache.routesByOutcomeSignature, cacheKey, rows)
    }

    const routeKeys = new Set()
    for (const row of mappedRoutes) {
      const key = normalizeKey(row.routeKey)
      if (key) {routeKeys.add(key)}
    }
    const questionsByRoute = new Map()
    for (const row of mappedQuestions) {
      const key = normalizeKey(row.routeKey)
      if (!key) {continue}
      const list = questionsByRoute.get(key) || []
      list.push(row)
      questionsByRoute.set(key, list)
    }
    const gatesByRoute = new Map()
    for (const row of mappedGates) {
      const key = normalizeKey(row.routeKey)
      if (!key) {continue}
      const list = gatesByRoute.get(key) || []
      list.push(row)
      gatesByRoute.set(key, list)
    }
    const effectsByQuestion = new Map()
    for (const row of mappedAnswerEffects) {
      const key = normalizeKey(row.questionKey)
      if (!key) {continue}
      const list = effectsByQuestion.get(key) || []
      list.push(row)
      effectsByQuestion.set(key, list)
    }
    const outcomesByKey = new Map()
    for (const row of mappedOutcomes) {
      const key = normalizeKey(row.outcomeKey)
      if (!key) {continue}
      outcomesByKey.set(key, row)
    }
    const actionProfilesByKey = new Map()
    for (const row of mappedActionProfiles) {
      const key = normalizeKey(row.actionProfileKey)
      if (!key) {continue}
      actionProfilesByKey.set(key, row)
    }

    for (const routeKey of Array.from(routeKeys)) {
      const questionsCacheKey = buildSchemaCacheKey(['questionsByRoute', normalizeCacheSignature([routeKey])])
      const gatesCacheKey = buildSchemaCacheKey(['gatesByRoute', normalizeCacheSignature([routeKey])])
      setCached(staticCache.questionsByRouteSignature, questionsCacheKey, questionsByRoute.get(routeKey) || [])
      setCached(staticCache.gatesByRouteSignature, gatesCacheKey, gatesByRoute.get(routeKey) || [])
    }
    for (const [questionKey, rows] of effectsByQuestion.entries()) {
      const cacheKey = buildSchemaCacheKey([
        'answerEffectsByQuestion',
        normalizeCacheSignature([questionKey])
      ])
      setCached(staticCache.answerEffectsByQuestionSignature, cacheKey, rows)
    }
    for (const [outcomeKey, row] of outcomesByKey.entries()) {
      const cacheKey = buildSchemaCacheKey(['diagnosisOutcomes', normalizeCacheSignature([outcomeKey])])
      setCached(staticCache.outcomesBySignature, cacheKey, [row])
    }
    for (const [actionProfileKey, row] of actionProfilesByKey.entries()) {
      const cacheKey = buildSchemaCacheKey(['actionProfiles', normalizeCacheSignature([actionProfileKey])])
      setCached(staticCache.actionProfilesBySignature, cacheKey, [row])
    }

    staticCache.preloadExpiresAt = refreshedNow + STATIC_REPOSITORY_CACHE_TTL_MS
  })
}

async function getOutcomeRoutesByOutcomeKeys(outcomeKeys = []) {
  const safeKeys = normalizeKeys(outcomeKeys)
  if (!safeKeys.length) {return []}
  const cacheKey = buildSchemaCacheKey(['routesByOutcome', normalizeCacheSignature(safeKeys)])
  const cached = getCached(staticCache.routesByOutcomeSignature, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.routesByOutcomeSignature, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        route_key,
        route_group_key,
        outcome_key,
        route_name_cn,
        route_entry_type,
        entry_symptom_keys_json,
        entry_direction_keys_json,
        entry_symptom_class_keys_json,
        host_profile_condition_json,
        entry_priority,
        max_questions,
        fallback_policy,
        action_profile_key,
        action_conflict_group,
        enabled,
        review_status,
        data_status
      FROM ${table('outcome_routes')}
      WHERE outcome_key IN ${sqlInList(safeKeys)}
        AND enabled = 1
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY entry_priority DESC, route_key ASC
    `
    )
    const mappedRows = rows.map(mapRouteRow)
    setCached(staticCache.routesByOutcomeSignature, cacheKey, mappedRows)
    return mappedRows
  })
}

async function getOutcomeRouteGates(routeKeys = []) {
  const safeKeys = normalizeKeys(routeKeys)
  if (!safeKeys.length) {return []}
  const cacheKey = buildSchemaCacheKey(['gatesByRoute', normalizeCacheSignature(safeKeys)])
  const cached = getCached(staticCache.gatesByRouteSignature, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.gatesByRouteSignature, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        gate_key,
        route_key,
        gate_role,
        required_evidence_json,
        required_answer_effects_json,
        blocker_evidence_json,
        conflict_outcome_keys_json,
        closure_level,
        on_pass,
        on_fail,
        on_unknown,
        decision_cause_key,
        decision_cause_text_cn,
        gate_priority,
        enabled,
        review_status,
        data_status
      FROM ${table('outcome_route_gates')}
      WHERE route_key IN ${sqlInList(safeKeys)}
        AND enabled = 1
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY gate_priority DESC, gate_key ASC
    `
    )
    const mappedRows = rows.map(mapGateRow)
    setCached(staticCache.gatesByRouteSignature, cacheKey, mappedRows)
    return mappedRows
  })
}

async function getOutcomeRouteQuestions(routeKeys = []) {
  const safeKeys = normalizeKeys(routeKeys)
  if (!safeKeys.length) {return []}
  const cacheKey = buildSchemaCacheKey(['questionsByRoute', normalizeCacheSignature(safeKeys)])
  const cached = getCached(staticCache.questionsByRouteSignature, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.questionsByRouteSignature, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        route_questions.route_key,
        route_questions.step_no,
        route_questions.question_key,
        questions.target_dimension,
        questions.target_symptom_key,
        questions.question_text_user_cn,
        route_questions.gate_key,
        route_questions.question_role,
        route_questions.required_for_closure,
        route_questions.ask_priority,
        route_questions.skip_if_evidence_json,
        route_questions.repeat_policy,
        route_questions.enabled,
        route_questions.review_status,
        route_questions.data_status
      FROM ${table('outcome_route_questions')} route_questions
      LEFT JOIN ${table('question_library_v5_real')} questions
        ON questions.question_key COLLATE utf8mb4_0900_ai_ci =
          route_questions.question_key COLLATE utf8mb4_0900_ai_ci
        AND questions.data_status IN ('audited', 'partial')
        AND questions.review_status IN ('audited', 'partial')
      WHERE route_questions.route_key IN ${sqlInList(safeKeys)}
        AND route_questions.enabled = 1
        AND ${buildAuditedStatusClause('route_questions.data_status')}
        AND ${buildReviewedStatusClause('route_questions.review_status')}
      ORDER BY route_questions.ask_priority DESC, route_questions.step_no ASC, route_questions.question_key ASC
    `
    )
    const mappedRows = rows.map(mapRouteQuestionRow)
    setCached(staticCache.questionsByRouteSignature, cacheKey, mappedRows)
    return mappedRows
  })
}

async function getOutcomeAnswerEffects(questionKeys = []) {
  const safeKeys = normalizeKeys(questionKeys)
  if (!safeKeys.length) {return []}
  const cacheKey = buildSchemaCacheKey(['answerEffectsByQuestion', normalizeCacheSignature(safeKeys)])
  const cached = getCached(staticCache.answerEffectsByQuestionSignature, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.answerEffectsByQuestionSignature, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        question_key,
        option_key,
        outcome_key,
        route_key,
        effect_type,
        effect_strength,
        redirect_outcome_key,
        evidence_dimension,
        effect_note_cn,
        enabled,
        review_status,
        data_status
      FROM ${table('outcome_answer_effects')}
      WHERE question_key IN ${sqlInList(safeKeys)}
        AND enabled = 1
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY question_key ASC, option_key ASC
    `
    )
    const mappedRows = rows.map(mapAnswerEffectRow)
    setCached(staticCache.answerEffectsByQuestionSignature, cacheKey, mappedRows)
    return mappedRows
  })
}

async function getOutcomeActionProfiles(actionProfileKeys = []) {
  const safeKeys = normalizeKeys(actionProfileKeys)
  if (!safeKeys.length) {return []}
  const cacheKey = buildSchemaCacheKey(['actionProfiles', normalizeCacheSignature(safeKeys)])
  const cached = getCached(staticCache.actionProfilesBySignature, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.actionProfilesBySignature, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        action_profile_key,
        title_cn,
        today_actions_json,
        three_day_actions_json,
        seven_day_observe_json,
        avoid_actions_json,
        retake_or_escalate_json,
        plant_baseline_merge_policy,
        review_status,
        data_status
      FROM ${table('outcome_action_profiles')}
      WHERE action_profile_key IN ${sqlInList(safeKeys)}
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY action_profile_key ASC
    `
    )
    const mappedRows = rows.map(mapActionProfileRow)
    setCached(staticCache.actionProfilesBySignature, cacheKey, mappedRows)
    return mappedRows
  })
}

async function getDiagnosisOutcomesByKeys(outcomeKeys = []) {
  const safeKeys = normalizeKeys(outcomeKeys)
  if (!safeKeys.length) {return []}
  const cacheKey = buildSchemaCacheKey(['diagnosisOutcomes', normalizeCacheSignature(safeKeys)])
  const cached = getCached(staticCache.outcomesBySignature, cacheKey)
  if (cached !== undefined) {return cached}

  return withPendingStaticQuery(cacheKey, async () => {
    const cachedAfterWait = getCached(staticCache.outcomesBySignature, cacheKey)
    if (cachedAfterWait !== undefined) {return cachedAfterWait}

    const rows = await runSql(
    `
      SELECT
        outcome_key,
        legacy_problem_key,
        outcome_name_cn,
        outcome_type,
        outcome_category,
        display_name_cn,
        user_definition_cn,
        action_profile_key,
        risk_level,
        is_final_output,
        is_intermediate_node,
        allow_direct_close,
        allow_uncertain_close,
        priority,
        review_status,
        data_status
      FROM ${table('diagnosis_outcomes')}
      WHERE outcome_key IN ${sqlInList(safeKeys)}
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY priority DESC, outcome_key ASC
    `
    )
    const mappedRows = rows.map(mapDiagnosisOutcomeRow)
    setCached(staticCache.outcomesBySignature, cacheKey, mappedRows)
    return mappedRows
  })
}

module.exports = {
  getAllActiveOutcomeRouteGroups,
  getOutcomeRouteGroupsByKeys,
  getOutcomeRoutesByOutcomeKeys,
  getOutcomeRouteGates,
  getOutcomeRouteQuestions,
  getOutcomeAnswerEffects,
  getOutcomeActionProfiles,
  getDiagnosisOutcomesByKeys,
  preloadOutcomeRouteRepositoryCache
}
