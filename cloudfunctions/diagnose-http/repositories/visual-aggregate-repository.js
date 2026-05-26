'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  buildOutOfPoolSymptomHintsFromCandidates
} = require('../utils/out-of-pool-proxy')
const {
  listAuditedOutOfPoolProxyMappings
} = require('./out-of-pool-proxy-mapping-repository')

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  if (typeof value === 'object') {
    return value
  }

  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

async function getVisualAggregateResultByBatchId(visualCallBatchId = '') {
  const batchId = String(visualCallBatchId || '').trim()
  if (!batchId) {return null}

  const result = await models.$runSQL(
    `
      SELECT
        CAST(aggregate_summary_json AS CHAR) AS aggregate_summary_json_text
      FROM visual_call_aggregate_results
      WHERE visual_call_batch_id = {{visualCallBatchId}}
      ORDER BY created_at DESC
      LIMIT 1
    `,
    {
      visualCallBatchId: batchId
    }
  )

  const row = result?.data?.executeResultList?.[0] || null
  if (!row) {return null}

  const parsed = safeJsonParse(row.aggregate_summary_json_text, null)
  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  if (
    Array.isArray(parsed.out_of_pool_symptom_hints) &&
    parsed.out_of_pool_symptom_hints.length > 0
  ) {
    return parsed
  }

  const hydrateResult = await models.$runSQL(
    `
      SELECT
        primary_organ_type,
        CAST(pattern_candidates_json AS CHAR) AS pattern_candidates_json_text
      FROM visual_normalized_image_results
      WHERE visual_call_batch_id = {{visualCallBatchId}}
      ORDER BY input_slot_order ASC, created_at ASC
      LIMIT 12
    `,
    {
      visualCallBatchId: batchId
    }
  )
  const hintEntries = (hydrateResult?.data?.executeResultList || []).flatMap(item => {
    const patternCandidates = safeJsonParse(item?.pattern_candidates_json_text, {}) || {}
    const outOfPoolCandidates = Array.isArray(patternCandidates?.out_of_pool_symptom_candidates)
      ? patternCandidates.out_of_pool_symptom_candidates
      : []
    return outOfPoolCandidates.map(candidate => ({
      candidate,
      organKey: String(item?.primary_organ_type || '').trim() || 'unknown'
    }))
  })
  const proxyMappings = await listAuditedOutOfPoolProxyMappings()
  const hydratedHints = buildOutOfPoolSymptomHintsFromCandidates(hintEntries, { proxyMappings })

  return hydratedHints.length
    ? {
        ...parsed,
        out_of_pool_symptom_hints: hydratedHints
      }
    : parsed
}

module.exports = {
  getVisualAggregateResultByBatchId
}
