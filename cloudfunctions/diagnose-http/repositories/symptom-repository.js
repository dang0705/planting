'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const { resolveSchema } = require('../db/schema-resolver')
const {
  filterPromptSymptomsByLocation
} = require('../utils/prompt-symptom-pool')

const cacheBySchema = new Map()

const DICTIONARY_TTL_MS = 5 * 60 * 1000

function safeJsonParse(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value

  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function normalizeAiVisualPool(value) {
  const parsedValue = safeJsonParse(value)
  const source = parsedValue === null ? value : parsedValue

  if (Array.isArray(source)) {
    return source
      .map(item => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  }

  if (source && typeof source === 'object') {
    return Object.entries(source)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => String(key || '').trim().toLowerCase())
      .filter(Boolean)
  }

  const normalized = String(source || '').trim().toLowerCase()
  return normalized ? [normalized] : []
}

function isAiVisualPoolEnabled(value) {
  return normalizeAiVisualPool(value).includes('yes')
}

function getSchemaCache(schema) {
  const safeSchema = String(schema || '').trim() || 'default'
  if (!cacheBySchema.has(safeSchema)) {
    cacheBySchema.set(safeSchema, {
      expiresAt: 0,
      rows: [],
      promptExpiresAt: 0,
      promptRows: []
    })
  }
  return cacheBySchema.get(safeSchema)
}

function mapSymptomRow(row = {}) {
  return {
    symptomKey: row.symptom_key,
    symptomCn: row.symptom_cn || row.symptom_key,
    locationKey: row.location_key || '',
    patternKey: row.pattern_key || '',
    distributionKey: row.distribution_key || '',
    symptomType: row.symptom_type || 'visual',
    signalReliability: clamp01(row.signal_reliability),
    aiVisualPool: normalizeAiVisualPool(row.ai_visual_pool),
    aiVisualPoolEnabled: isAiVisualPoolEnabled(row.ai_visual_pool),
    displayTextCn: row.display_text_cn || row.symptom_cn || row.symptom_key,
    userObservationTipCn: row.user_observation_tip_cn || '',
    confusionNoteCn: row.confusion_note_cn || '',
    dataStatus: row.data_status || 'unknown'
  }
}

function mapEvidenceRow(row = {}) {
  return {
    symptomKey: row.symptom_key,
    problemKey: row.problem_key,
    associationStrength: clamp01(row.association_strength),
    edgeReliability: clamp01(row.edge_reliability),
    evidenceType: row.evidence_type || 'visual',
    dataStatus: row.data_status || 'unknown'
  }
}

async function getSymptomDictionary() {
  const schema = resolveSchema()
  const cache = getSchemaCache(schema)
  const now = Date.now()
  if (cache.expiresAt > now && cache.rows.length) {
    return cache.rows
  }

  const result = await models.$runSQL(
    `
      SELECT
        symptom_key,
        symptom_cn,
        location_key,
        pattern_key,
        distribution_key,
        symptom_type,
        signal_reliability,
        ai_visual_pool,
        display_text_cn,
        user_observation_tip_cn,
        confusion_note_cn,
        data_status
      FROM ${table('symptoms')}
      WHERE data_status = 'audited'
      ORDER BY signal_reliability DESC, symptom_key ASC
    `,
    {}
  )

  cache.rows = (result?.data?.executeResultList || []).map(mapSymptomRow)
  cache.expiresAt = now + DICTIONARY_TTL_MS
  return cache.rows
}

async function getPromptSymptomDictionary() {
  const schema = resolveSchema()
  const cache = getSchemaCache(schema)
  const now = Date.now()
  if (cache.promptExpiresAt > now && cache.promptRows.length) {
    return cache.promptRows
  }

  const result = await models.$runSQL(
    `
      SELECT
        symptom_key,
        symptom_cn,
        location_key,
        pattern_key,
        distribution_key,
        symptom_type,
        signal_reliability,
        ai_visual_pool,
        display_text_cn,
        user_observation_tip_cn,
        confusion_note_cn,
        data_status
      FROM ${table('symptoms')}
      WHERE data_status = 'audited'
        AND symptom_type IN ('visual', 'hybrid')
        AND JSON_UNQUOTE(ai_visual_pool) = 'yes'
      ORDER BY signal_reliability DESC, symptom_key ASC
    `,
    {}
  )

  cache.promptRows = (result?.data?.executeResultList || []).map(mapSymptomRow)
  cache.promptExpiresAt = now + DICTIONARY_TTL_MS
  return cache.promptRows
}

async function getSymptomsByKeys(symptomKeys = []) {
  const keys = Array.from(new Set((symptomKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!keys.length) return []

  const result = await models.$runSQL(
    `
      SELECT
        symptom_key,
        symptom_cn,
        location_key,
        pattern_key,
        distribution_key,
        symptom_type,
        signal_reliability,
        ai_visual_pool,
        display_text_cn,
        user_observation_tip_cn,
        confusion_note_cn,
        data_status
      FROM ${table('symptoms')}
      WHERE symptom_key IN ${sqlInList(keys)}
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapSymptomRow)
}

async function getEvidenceEdges({ symptomKeys = [], problemKeys = [] } = {}) {
  const safeSymptomKeys = Array.from(new Set((symptomKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeSymptomKeys.length) return []

  const whereProblem = problemKeys.length
    ? `AND problem_key IN ${sqlInList(problemKeys)}`
    : ''

  const result = await models.$runSQL(
    `
      SELECT
        symptom_key,
        problem_key,
        association_strength,
        edge_reliability,
        evidence_type,
        data_status
      FROM ${table('symptom_problem_evidence')}
      WHERE symptom_key IN ${sqlInList(safeSymptomKeys)}
      ${whereProblem}
        AND data_status IN ('audited', 'partial')
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapEvidenceRow)
}

module.exports = {
  getSymptomDictionary,
  getPromptSymptomDictionary,
  filterPromptSymptomsByLocation,
  getSymptomsByKeys,
  getEvidenceEdges
}
