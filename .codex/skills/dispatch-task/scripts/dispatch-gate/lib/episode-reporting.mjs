import { unavailable } from './episode-metadata.mjs'

export function renderEpisodeStatusRecord(episode, { maxReworkBatches }) {
  const durationMs = Math.max(0, Date.now() - Date.parse(episode.created_at))
  return {
    status: episode.status,
    episode_id: episode.episode_id,
    dispatch_run_id: episode.dispatchRunId,
    objective_key: episode.objective_key,
    amendment_sequence: episode.amendmentSequence,
    amendments: episode.amendments ?? [],
    implementation_attempts: Number(episode.implementationAttempts ?? 1),
    rework_batch_count: episode.reworkBatches?.length ?? 0,
    rework_budget_remaining: Math.max(
      0,
      Number(episode.reworkPolicy?.max_batches ?? maxReworkBatches) -
        Number(episode.reworkBatches?.length ?? 0)
    ),
    circuit_breaker: episode.circuitBreaker ?? {
      tripped: false,
      reason: null,
      tripped_at: null
    },
    implementationStatus: episode.implementationStatus,
    reviewStatus: episode.reviewStatus,
    qaStatus: episode.qaStatus,
    docsImpact: episode.docsImpact,
    brvImpact: episode.brvImpact,
    requested_model: unavailable(episode.runtime?.requested_model),
    observed_model: unavailable(episode.runtime?.observed_model),
    reasoning_effort: unavailable(episode.runtime?.reasoning_effort),
    service_tier: unavailable(episode.runtime?.service_tier),
    service_tier_available: episode.runtime?.service_tier_available ?? 'unavailable',
    duration_ms: durationMs,
    last_activity_at: unavailable(episode.last_activity_at),
    tool_calls: Number(episode.metrics?.tool_calls ?? 0),
    tokens: episode.metrics?.tokens ?? 'unavailable',
    inputTokens: episode.metrics?.token_usage?.input_tokens ?? 'unavailable',
    cachedInputTokens: episode.metrics?.token_usage?.cached_input_tokens ?? 'unavailable',
    outputTokens: episode.metrics?.token_usage?.output_tokens ?? 'unavailable',
    reasoningTokens: episode.metrics?.token_usage?.reasoning_tokens ?? 'unavailable',
    totalTokens: episode.metrics?.token_usage?.total_tokens ?? 'unavailable',
    compactions: episode.metrics?.compactions ?? 'unavailable',
    nextCheckNotBefore: unavailable(episode.monitoring?.nextCheckNotBefore)
  }
}

export function auditEpisodeTraceRecord(episode, { maxReworkBatches, legalEarlyCheckReasons }) {
  const errors = []
  const reworkRequests = (episode.trace ?? []).filter(
    item => item.event === 'episode_rework_requested'
  )
  if (reworkRequests.length > maxReworkBatches) {
    errors.push(`rework request count exceeds ${maxReworkBatches}`)
  }
  let previousNextCheck = episode.monitoring?.firstCheckNotBefore ?? null
  for (const item of episode.trace ?? []) {
    if (item.event !== 'episode_watch') {
      continue
    }
    const watchedAt = Date.parse(item.at)
    const expectedAt = Date.parse(previousNextCheck)
    if (!Number.isNaN(watchedAt) && !Number.isNaN(expectedAt) && watchedAt < expectedAt) {
      if (
        !item.early ||
        !legalEarlyCheckReasons.has(item.reason) ||
        !String(item.reason_evidence ?? '').trim()
      ) {
        errors.push(`illegal early check at ${item.at}: ${item.reason ?? 'missing_reason'}`)
      }
    }
    previousNextCheck = item.nextCheckNotBefore ?? previousNextCheck
  }
  return {
    status: errors.length ? 'failed' : 'passed',
    gate: 'episode_trace_audit',
    episode_id: episode.episode_id,
    legal_early_reasons: [...legalEarlyCheckReasons],
    errors
  }
}
