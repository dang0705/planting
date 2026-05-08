'use strict'

function normalizeNullableBatchId(value = null) {
  if (value === null || value === undefined) {return null}
  const normalized = String(value).trim()
  if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
    return null
  }
  return normalized
}

function resolveLatestVisualCallBatchIdFromSource(source = null) {
  if (source === null || source === undefined) {
    return null
  }

  if (typeof source === 'string') {
    return normalizeNullableBatchId(source)
  }

  if (typeof source !== 'object') {
    return null
  }

  const directCandidates = [
    source?.latestVisualCallBatchId,
    source?.latest_visual_call_batch_id,
    source?.draftVisualCallBatchId,
    source?.draft_visual_call_batch_id,
    source?.currentVisualCallBatchId,
    source?.current_visual_call_batch_id,
    source?.visualCallBatchId,
    source?.visual_call_batch_id
  ]

  for (const candidate of directCandidates) {
    const normalizedCandidate = normalizeNullableBatchId(candidate)
    if (normalizedCandidate) {
      return normalizedCandidate
    }
  }

  const nestedSources = [
    source?.plantContext,
    source?.plant_context,
    source?.visualBatchTrace,
    source?.visual_batch_trace,
    source?.visualAggregateSummary,
    source?.visual_aggregate_summary,
    source?.visualAggregateResult,
    source?.visual_aggregate_result
  ]

  for (const nestedSource of nestedSources) {
    const resolved = resolveLatestVisualCallBatchIdFromSource(nestedSource)
    if (resolved) {
      return resolved
    }
  }

  return null
}

function resolveLatestVisualCallBatchId(...sources) {
  for (const source of sources) {
    const resolved = resolveLatestVisualCallBatchIdFromSource(source)
    if (resolved) {
      return resolved
    }
  }

  return null
}

module.exports = {
  normalizeNullableBatchId,
  resolveLatestVisualCallBatchIdFromSource,
  resolveLatestVisualCallBatchId
}
