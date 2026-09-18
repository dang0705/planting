function finiteValues(samples) {
  return samples
    .map(sample => Number(sample?.elapsed_ms))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
}

export function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) {
    return null
  }
  const boundedRatio = Math.min(1, Math.max(0, Number(ratio)))
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * boundedRatio) - 1)
  return sorted[Math.max(0, index)]
}

export function latencyStats(samples = []) {
  const values = finiteValues(Array.isArray(samples) ? samples : [])
  if (!values.length) {
    return {
      sample_count: 0,
      min_ms: null,
      p50_ms: null,
      p95_ms: null,
      max_ms: null,
      stddev_ms: null
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return {
    sample_count: values.length,
    min_ms: values[0],
    p50_ms: percentile(values, 0.5),
    p95_ms: percentile(values, 0.95),
    max_ms: values[values.length - 1],
    stddev_ms: Number(Math.sqrt(variance).toFixed(3))
  }
}

export function endpointLatencyStats(requests = []) {
  const safeRequests = Array.isArray(requests) ? requests : []
  return Object.fromEntries(
    ['auth-user', 'user-plants'].map(endpoint => {
      const endpointRequests = safeRequests.filter(request => request?.endpoint === endpoint)
      return [
        endpoint,
        {
          all: latencyStats(endpointRequests),
          cold: latencyStats(endpointRequests.filter(request => request?.temperature === 'cold')),
          hot: latencyStats(endpointRequests.filter(request => request?.temperature === 'hot'))
        }
      ]
    })
  )
}

function endpointTemperatureStats(report, endpoint, temperature) {
  const stats = report?.performance_stats?.endpoints?.[endpoint]?.[temperature]
  return stats && typeof stats === 'object' ? stats : null
}

function hasRequiredSamples(stats, sampleCount) {
  return Number(stats?.sample_count) >= sampleCount && Number.isFinite(stats?.p95_ms)
}

export function evaluateAbsolutePerformance({
  report,
  coldSamples = 20,
  hotSamples = 30,
  coldThresholdMs = 1000,
  hotThresholdMs = 300
} = {}) {
  const endpoints = ['auth-user', 'user-plants']
  const checks = []
  for (const endpoint of endpoints) {
    const cold = endpointTemperatureStats(report, endpoint, 'cold')
    const hot = endpointTemperatureStats(report, endpoint, 'hot')
    const sampleCountsPassed =
      hasRequiredSamples(cold, coldSamples) && hasRequiredSamples(hot, hotSamples)
    const coldPassed = sampleCountsPassed && Number(cold.p95_ms) <= coldThresholdMs
    const hotPassed = sampleCountsPassed && Number(hot.p95_ms) <= hotThresholdMs
    checks.push({
      endpoint,
      sample_counts: {
        passed: sampleCountsPassed,
        cold: Number(cold?.sample_count || 0),
        hot: Number(hot?.sample_count || 0)
      },
      cold: {
        p95_ms: cold?.p95_ms ?? null,
        threshold_ms: coldThresholdMs,
        passed: coldPassed
      },
      hot: {
        p95_ms: hot?.p95_ms ?? null,
        threshold_ms: hotThresholdMs,
        passed: hotPassed
      }
    })
  }
  const passed = checks.every(
    check => check.sample_counts.passed && check.cold.passed && check.hot.passed
  )
  return {
    status: passed ? 'PASS' : 'FAIL',
    thresholds: {
      cold_samples_per_endpoint: coldSamples,
      hot_samples_per_endpoint: hotSamples,
      cold_p95_max_ms: coldThresholdMs,
      hot_p95_max_ms: hotThresholdMs
    },
    checks
  }
}
