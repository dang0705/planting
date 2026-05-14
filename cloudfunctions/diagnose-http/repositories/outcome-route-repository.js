'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const { OUTCOME_EFFECT_TYPE } = require('../constants/outcome-route')

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function normalizeKeys(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map(item => normalizeKey(item)).filter(Boolean))
  )
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
  return rows.map(mapRouteGroupRow)
}

async function getAllActiveOutcomeRouteGroups() {
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
  return rows.map(mapRouteGroupRow)
}

async function getOutcomeRoutesByOutcomeKeys(outcomeKeys = []) {
  const safeKeys = normalizeKeys(outcomeKeys)
  if (!safeKeys.length) {return []}
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
  return rows.map(mapRouteRow)
}

async function getOutcomeRouteGates(routeKeys = []) {
  const safeKeys = normalizeKeys(routeKeys)
  if (!safeKeys.length) {return []}
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
  return rows.map(mapGateRow)
}

async function getOutcomeRouteQuestions(routeKeys = []) {
  const safeKeys = normalizeKeys(routeKeys)
  if (!safeKeys.length) {return []}
  const rows = await runSql(
    `
      SELECT
        route_key,
        step_no,
        question_key,
        gate_key,
        question_role,
        required_for_closure,
        ask_priority,
        skip_if_evidence_json,
        repeat_policy,
        enabled,
        review_status,
        data_status
      FROM ${table('outcome_route_questions')}
      WHERE route_key IN ${sqlInList(safeKeys)}
        AND enabled = 1
        AND ${buildAuditedStatusClause('data_status')}
        AND ${buildReviewedStatusClause('review_status')}
      ORDER BY ask_priority DESC, step_no ASC, question_key ASC
    `
  )
  return rows.map(mapRouteQuestionRow)
}

async function getOutcomeAnswerEffects(questionKeys = []) {
  const safeKeys = normalizeKeys(questionKeys)
  if (!safeKeys.length) {return []}
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
  return rows.map(mapAnswerEffectRow)
}

async function getOutcomeActionProfiles(actionProfileKeys = []) {
  const safeKeys = normalizeKeys(actionProfileKeys)
  if (!safeKeys.length) {return []}
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
  return rows.map(mapActionProfileRow)
}

async function getDiagnosisOutcomesByKeys(outcomeKeys = []) {
  const safeKeys = normalizeKeys(outcomeKeys)
  if (!safeKeys.length) {return []}
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
  return rows.map(mapDiagnosisOutcomeRow)
}

module.exports = {
  getAllActiveOutcomeRouteGroups,
  getOutcomeRouteGroupsByKeys,
  getOutcomeRoutesByOutcomeKeys,
  getOutcomeRouteGates,
  getOutcomeRouteQuestions,
  getOutcomeAnswerEffects,
  getOutcomeActionProfiles,
  getDiagnosisOutcomesByKeys
}
