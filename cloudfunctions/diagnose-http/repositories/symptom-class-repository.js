'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const { resolveSchema } = require('../db/schema-resolver')

const CACHE_TTL_MS = 5 * 60 * 1000
const cacheBySchema = new Map()
const pendingQueryCache = {
  classesBySchemaAndKeys: new Map(),
  mappingsBySchemaAndKeys: new Map()
}

function getSchemaCache(schema) {
  const safeSchema = String(schema || '').trim() || 'default'
  if (!cacheBySchema.has(safeSchema)) {
    cacheBySchema.set(safeSchema, {
      expiresAt: 0,
      rowsByClassKey: new Map(),
      mappingsExpiresAt: 0,
      mappingsBySymptomKey: new Map()
    })
  }
  return cacheBySchema.get(safeSchema)
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function normalizeCacheSignature(items = []) {
  return Array.from(new Set((items || []).map(item => normalizeText(item)).filter(Boolean)))
    .sort()
    .join('|')
}

function withPending(cache, key = '', queryFn) {
  const normalizedKey = String(key || '').trim()
  const pending = cache.get(normalizedKey)
  if (pending) {return pending}

  const promise = Promise.resolve()
    .then(queryFn)
    .finally(() => {
      cache.delete(normalizedKey)
    })
  cache.set(normalizedKey, promise)
  return promise
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

function mapClassRow(row = {}) {
  return {
    classKey: normalizeText(row.class_key),
    classNameCn: normalizeText(row.class_name_cn),
    description: normalizeText(row.description),
    questionMode: normalizeText(row.question_mode),
    classLevel: normalizeText(row.class_level, 'mode'),
    parentClassKey: normalizeText(row.parent_class_key),
    followupEnabledV1: normalizeBoolean(row.followup_enabled_v1),
    dataStatus: normalizeText(row.data_status, 'unknown'),
    dataSource: normalizeText(row.data_source),
    auditNote: normalizeText(row.audit_note),
    followupModeV1: normalizeFollowupMode(row.followup_mode_v1),
    runtimeGateRule: normalizeText(row.runtime_gate_rule, 'soft'),
    runtimeNotes: normalizeText(row.runtime_notes)
  }
}

function mapMappingRow(row = {}) {
  return {
    symptomKey: normalizeText(row.symptom_key),
    symptomCn: normalizeText(row.symptom_cn),
    classKey: normalizeText(row.class_key),
    classNameCn: normalizeText(row.class_name_cn),
    mappingStrength: clamp01(row.mapping_strength),
    isPrimary: normalizeBoolean(row.is_primary),
    mappingType: normalizeText(row.mapping_type),
    visualScoringAllowed: normalizeBoolean(row.visual_scoring_allowed),
    questionActivationAllowed: normalizeBoolean(row.question_activation_allowed),
    explanationOnlyAllowed: normalizeBoolean(row.explanation_only_allowed),
    followupEnabledV1: normalizeBoolean(row.followup_enabled_v1),
    dataStatus: normalizeText(row.data_status, 'unknown'),
    dataSource: normalizeText(row.data_source),
    auditNote: normalizeText(row.audit_note),
    followupModeV1: normalizeFollowupMode(row.followup_mode_v1),
    explanationOnlySemantic: normalizeText(row.explanation_only_semantic),
    effectiveQuestionActivationV1: normalizeBoolean(row.effective_question_activation_v1),
    runtimePolicy: normalizeText(row.runtime_policy),
    partialWeightFactorV1: clamp01(
      row.partial_weight_factor_v1 === null || row.partial_weight_factor_v1 === undefined || row.partial_weight_factor_v1 === ''
        ? 1
        : row.partial_weight_factor_v1
    ),
    visualScoringEffectiveV1: normalizeBoolean(row.visual_scoring_effective_v1),
    primaryClassLockAllowedV1: normalizeBoolean(row.primary_class_lock_allowed_v1)
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

async function querySymptomClasses(classKeys = []) {
  const safeKeys = Array.from(new Set((classKeys || []).map(item => normalizeText(item)).filter(Boolean)))
  if (!safeKeys.length) {return []}

  try {
    const result = await models.$runSQL(
      `
        SELECT
          class_key,
          class_name_cn,
          description,
          question_mode,
          class_level,
          parent_class_key,
          followup_enabled_v1,
          data_status,
          data_source,
          audit_note,
          followup_mode_v1,
          runtime_gate_rule,
          runtime_notes
        FROM ${table('symptom_classes')}
        WHERE class_key IN ${sqlInList(safeKeys)}
          AND data_status IN ('audited', 'partial')
      `,
      {}
    )

    return (result?.data?.executeResultList || []).map(mapClassRow)
  } catch (error) {
    if (isMissingRuntimeTableError(error)) {
      console.warn('symptom class runtime tables not ready, fallback to legacy flow:', error.message)
      return []
    }
    throw error
  }
}

async function querySymptomClassMappings(symptomKeys = []) {
  const safeKeys = Array.from(new Set((symptomKeys || []).map(item => normalizeText(item)).filter(Boolean)))
  if (!safeKeys.length) {return []}

  try {
    const result = await models.$runSQL(
      `
        SELECT
          symptom_key,
          symptom_cn,
          class_key,
          class_name_cn,
          mapping_strength,
          is_primary,
          mapping_type,
          visual_scoring_allowed,
          question_activation_allowed,
          explanation_only_allowed,
          followup_enabled_v1,
          data_status,
          data_source,
          audit_note,
          followup_mode_v1,
          explanation_only_semantic,
          effective_question_activation_v1,
          runtime_policy,
          partial_weight_factor_v1,
          visual_scoring_effective_v1,
          primary_class_lock_allowed_v1
        FROM ${table('symptom_class_mapping')}
        WHERE symptom_key IN ${sqlInList(safeKeys)}
          AND data_status IN ('audited', 'partial')
      `,
      {}
    )

    return (result?.data?.executeResultList || []).map(mapMappingRow)
  } catch (error) {
    if (isMissingRuntimeTableError(error)) {
      console.warn('symptom class mapping table not ready, fallback to legacy flow:', error.message)
      return []
    }
    throw error
  }
}

async function getSymptomClassesByKeys(classKeys = []) {
  const safeKeys = Array.from(new Set((classKeys || []).map(item => normalizeText(item)).filter(Boolean)))
  if (!safeKeys.length) {return []}

  const schema = resolveSchema()
  const cache = getSchemaCache(schema)
  const now = Date.now()
  const missingKeys = safeKeys.filter(key => !cache.rowsByClassKey.has(key) || cache.expiresAt <= now)

  if (missingKeys.length) {
    const pendingKey = `${schema}:${normalizeCacheSignature(missingKeys)}`
    const rows = await withPending(pendingQueryCache.classesBySchemaAndKeys, pendingKey, () =>
      querySymptomClasses(missingKeys)
    )
    if (cache.expiresAt <= now) {
      cache.rowsByClassKey.clear()
    }
    for (const row of rows) {
      cache.rowsByClassKey.set(row.classKey, row)
    }
    cache.expiresAt = now + CACHE_TTL_MS
  }

  return safeKeys
    .map(key => cache.rowsByClassKey.get(key))
    .filter(Boolean)
}

async function getSymptomClassMappingsBySymptomKeys(symptomKeys = []) {
  const safeKeys = Array.from(new Set((symptomKeys || []).map(item => normalizeText(item)).filter(Boolean)))
  if (!safeKeys.length) {return []}

  const schema = resolveSchema()
  const cache = getSchemaCache(schema)
  const now = Date.now()
  const shouldRefresh = cache.mappingsExpiresAt <= now
  const missingKeys = safeKeys.filter(key => !cache.mappingsBySymptomKey.has(key) || shouldRefresh)

  if (missingKeys.length) {
    const pendingKey = `${schema}:${normalizeCacheSignature(missingKeys)}`
    const rows = await withPending(pendingQueryCache.mappingsBySchemaAndKeys, pendingKey, () =>
      querySymptomClassMappings(missingKeys)
    )
    if (shouldRefresh) {
      cache.mappingsBySymptomKey.clear()
    }
    for (const symptomKey of missingKeys) {
      cache.mappingsBySymptomKey.set(symptomKey, [])
    }
    for (const row of rows) {
      const list = cache.mappingsBySymptomKey.get(row.symptomKey) || []
      list.push(row)
      cache.mappingsBySymptomKey.set(row.symptomKey, list)
    }
    cache.mappingsExpiresAt = now + CACHE_TTL_MS
  }

  return safeKeys.flatMap(key => cache.mappingsBySymptomKey.get(key) || [])
}

module.exports = {
  getSymptomClassesByKeys,
  getSymptomClassMappingsBySymptomKeys
}
