function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

export function unavailable(value) {
  return asNonEmptyString(value) || 'unavailable'
}

function numericOrUnavailable(value) {
  if (value === undefined || value === null || value === '') {
    return 'unavailable'
  }
  return Number.isFinite(Number(value)) ? Number(value) : 'unavailable'
}

export function metadataFrom(value = {}) {
  const usage = value.usage ?? value.token_usage ?? value.tokens ?? {}
  return {
    requested_model: unavailable(value.requested_model ?? value.requestedModel),
    observed_model: unavailable(value.observed_model ?? value.observedModel ?? value.model),
    reasoning_effort: unavailable(value.reasoning_effort ?? value.reasoningEffort),
    service_tier: unavailable(value.service_tier ?? value.serviceTier),
    service_tier_available:
      typeof value.service_tier_available === 'boolean'
        ? value.service_tier_available
        : 'unavailable',
    input_tokens: numericOrUnavailable(usage.input_tokens ?? usage.input ?? value.input_tokens),
    cached_input_tokens: numericOrUnavailable(
      usage.cached_input_tokens ?? usage.cached_input ?? value.cached_input_tokens
    ),
    output_tokens: numericOrUnavailable(usage.output_tokens ?? usage.output ?? value.output_tokens),
    reasoning_tokens: numericOrUnavailable(
      usage.reasoning_tokens ?? usage.reasoning ?? value.reasoning_tokens
    ),
    total_tokens: numericOrUnavailable(usage.total_tokens ?? usage.total ?? value.total_tokens),
    compactions: numericOrUnavailable(value.compactions ?? usage.compactions)
  }
}

export function mergeRuntimeMetadata(current = {}, candidate = {}) {
  const merged = { ...current }
  for (const [key, value] of Object.entries(candidate)) {
    if (value !== 'unavailable' && value !== undefined && value !== null && value !== '') {
      merged[key] = value
    } else if (!(key in merged)) {
      merged[key] = 'unavailable'
    }
  }
  return merged
}
