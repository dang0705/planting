'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList } = require('./sql')
const { table } = require('../db/table-helper')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {return value}
  if (typeof value === 'number') {return value !== 0}
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function normalizeFollowupMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'full' || normalized === 'limited' || normalized === 'explanation_only') {
    return normalized
  }
  return 'disabled'
}

function mapGroupStrategyRow(row = {}) {
  return {
    classKey: normalizeText(row.class_key),
    classNameCn: normalizeText(row.class_name_cn),
    groupKey: normalizeText(row.group_key),
    groupRole: normalizeText(row.group_role),
    basePriority: Number(row.base_priority || 0),
    allowWhenAiLocked: normalizeBoolean(row.allow_when_ai_locked),
    maxQuestionsPerRound: Math.max(1, Number(row.max_questions_per_round || 1)),
    activationCondition: normalizeText(row.activation_condition),
    classGateType: normalizeText(row.class_gate_type, 'soft'),
    classSwitchAllowed: normalizeBoolean(row.class_switch_allowed),
    unknownSwitchPolicy: normalizeText(row.unknown_switch_policy),
    aiLockedConfirmPenalty: Number(row.ai_locked_confirm_penalty || 0),
    pseudoSymptomAllowed: normalizeBoolean(row.pseudo_symptom_allowed),
    dataStatus: normalizeText(row.data_status, 'unknown'),
    dataSource: normalizeText(row.data_source),
    auditNote: normalizeText(row.audit_note),
    followupModeV1: normalizeFollowupMode(row.followup_mode_v1),
    classLevelAllowsRuntimeV1: normalizeBoolean(row.class_level_allows_runtime_v1),
    groupRuntimeEligibilityRule: normalizeText(row.group_runtime_eligibility_rule),
    assetValidationRequired: normalizeBoolean(row.asset_validation_required),
    assetValidationMinimum: normalizeText(row.asset_validation_minimum),
    semanticAdmissionRequired: normalizeText(row.semantic_admission_required),
    partialRuntimePenaltyRule: normalizeText(row.partial_runtime_penalty_rule),
    effectiveRuntimeV1: normalizeBoolean(row.effective_runtime_v1),
    runtimeBlockReason: normalizeText(row.runtime_block_reason),
    assetStatus: normalizeText(row.asset_status),
    codexActionRequired: normalizeText(row.codex_action_required)
  }
}

function isMissingRuntimeTableError(error) {
  const message = String(error?.message || error || '')
  return (
    message.includes("doesn't exist") ||
    message.includes('ER_NO_SUCH_TABLE') ||
    message.includes('Unknown table')
  )
}

const CACHE_TTL_MS = Math.max(0, Number(process.env.DIAGNOSE_STATIC_CACHE_TTL_MS || 60000))
const classGroupStrategyCache = new Map()
const pendingClassGroupStrategyCache = new Map()

function getCachedStrategies(key = '') {
  if (!CACHE_TTL_MS) {return null}
  const entry = classGroupStrategyCache.get(key)
  if (!entry) {return null}
  if (Date.now() - Number(entry.cachedAt || 0) > CACHE_TTL_MS) {
    classGroupStrategyCache.delete(key)
    return null
  }
  return entry.value
}

function setCachedStrategies(key = '', value = []) {
  if (!CACHE_TTL_MS) {return}
  classGroupStrategyCache.set(key, {
    cachedAt: Date.now(),
    value
  })
}

function withPendingStrategies(key = '', loader) {
  if (pendingClassGroupStrategyCache.has(key)) {
    return pendingClassGroupStrategyCache.get(key)
  }
  const promise = Promise.resolve()
    .then(loader)
    .finally(() => {
      pendingClassGroupStrategyCache.delete(key)
    })
  pendingClassGroupStrategyCache.set(key, promise)
  return promise
}

async function getClassQuestionGroupStrategies(classKeys = []) {
  const safeKeys = Array.from(new Set((classKeys || []).map(item => normalizeText(item)).filter(Boolean)))
  if (!safeKeys.length) {return []}
  const cacheKey = safeKeys.slice().sort().join('|')
  const cached = getCachedStrategies(cacheKey)
  if (cached) {return cached}

  try {
    const result = await withPendingStrategies(
      cacheKey,
      () => models.$runSQL(
        `
          SELECT
            class_key,
            class_name_cn,
            group_key,
            group_role,
            base_priority,
            allow_when_ai_locked,
            max_questions_per_round,
            activation_condition,
            class_gate_type,
            class_switch_allowed,
            unknown_switch_policy,
            ai_locked_confirm_penalty,
            pseudo_symptom_allowed,
            data_status,
            data_source,
            audit_note,
            followup_mode_v1,
            class_level_allows_runtime_v1,
            group_runtime_eligibility_rule,
            asset_validation_required,
            asset_validation_minimum,
            semantic_admission_required,
            partial_runtime_penalty_rule,
            effective_runtime_v1,
            runtime_block_reason,
            asset_status,
            codex_action_required
          FROM ${table('class_question_group_strategy')}
          WHERE class_key IN ${sqlInList(safeKeys)}
            AND data_status IN ('audited', 'partial')
        `,
        {}
      )
    )

    const rows = (result?.data?.executeResultList || [])
      .map(mapGroupStrategyRow)
      .filter(item => item.groupKey)
    setCachedStrategies(cacheKey, rows)
    return rows
  } catch (error) {
    if (isMissingRuntimeTableError(error)) {
      console.warn('class question group strategy table not ready, fallback to legacy flow:', error.message)
      return []
    }
    throw error
  }
}

module.exports = {
  getClassQuestionGroupStrategies
}
