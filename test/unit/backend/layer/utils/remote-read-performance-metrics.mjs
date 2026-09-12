import assert from 'node:assert/strict'
import {
  evaluateAbsolutePerformance,
  endpointLatencyStats,
  latencyStats,
  percentile
} from '../../../../../test/e2e/automator/user/_shared/remote-read-performance-metrics.mjs'

assert.equal(percentile([10, 20, 30, 40], 0.5), 20)
assert.equal(percentile([], 0.95), null)
assert.deepEqual(latencyStats([{ elapsed_ms: 10 }, { elapsed_ms: 20 }, { elapsed_ms: 40 }]), {
  sample_count: 3,
  min_ms: 10,
  p50_ms: 20,
  p95_ms: 40,
  max_ms: 40,
  stddev_ms: 12.472
})

const stats = endpointLatencyStats([
  { endpoint: 'auth-user', elapsed_ms: 100, temperature: 'cold' },
  { endpoint: 'auth-user', elapsed_ms: 50, temperature: 'hot' },
  { endpoint: 'user-plants', elapsed_ms: 300, temperature: 'cold' },
  { endpoint: 'user-plants', elapsed_ms: 200, temperature: 'hot' }
])
assert.equal(stats['auth-user'].cold.p95_ms, 100)
assert.equal(stats['auth-user'].hot.p95_ms, 50)
assert.equal(stats['user-plants'].cold.sample_count, 1)
assert.equal(stats['user-plants'].hot.max_ms, 200)

const makeReport = (cold, hot) => ({
  performance_stats: {
    endpoints: {
      'auth-user': { cold: latencyStats(cold), hot: latencyStats(hot) },
      'user-plants': { cold: latencyStats(cold), hot: latencyStats(hot) }
    }
  }
})
const assessment = evaluateAbsolutePerformance({
  report: makeReport(
    Array.from({ length: 20 }, () => ({ elapsed_ms: 1000 })),
    Array.from({ length: 30 }, () => ({ elapsed_ms: 300 }))
  )
})
assert.equal(assessment.status, 'PASS')
const thresholdFailure = evaluateAbsolutePerformance({
  report: makeReport(
    Array.from({ length: 20 }, () => ({ elapsed_ms: 1001 })),
    Array.from({ length: 30 }, () => ({ elapsed_ms: 301 }))
  )
})
assert.equal(thresholdFailure.status, 'FAIL')
assert.equal(thresholdFailure.checks[0].cold.passed, false)
assert.equal(thresholdFailure.checks[0].hot.passed, false)

console.log('remote read performance metrics tests passed')
