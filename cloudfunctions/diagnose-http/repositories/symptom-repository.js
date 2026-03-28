'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const { resolveSchema } = require('../db/schema-resolver')

const cacheBySchema = new Map()

const DICTIONARY_TTL_MS = 5 * 60 * 1000

function getSchemaCache(schema) {
  const safeSchema = String(schema || '').trim() || 'default'
  if (!cacheBySchema.has(safeSchema)) {
    cacheBySchema.set(safeSchema, {
      expiresAt: 0,
      rows: []
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
        display_text_cn,
        user_observation_tip_cn,
        confusion_note_cn,
        data_status
      FROM ${table('symptoms')}
      WHERE data_status IN ('audited', 'partial')
      ORDER BY signal_reliability DESC, symptom_key ASC
    `,
    {}
  )

  cache.rows = (result?.data?.executeResultList || []).map(mapSymptomRow)
  cache.expiresAt = now + DICTIONARY_TTL_MS
  return cache.rows
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
  getSymptomsByKeys,
  getEvidenceEdges
}
