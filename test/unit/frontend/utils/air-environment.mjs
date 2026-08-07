import assert from 'node:assert/strict'

const { isAirEnvironmentAnswerReady, resolveAirEnvironmentPreview, sanitizeAirEnvironmentInput } =
  await import('../../../../src/utils/air-environment.js')

const freshAirInput = {
  airExchange: { source: 'fresh_air' },
  canopyOpenness: 'open',
  deviceAirflow: { mode: 'none', sources: [] }
}

assert.deepEqual(sanitizeAirEnvironmentInput(freshAirInput), {
  airExchange: { source: 'fresh_air', windowDirectionCount: null, windowOpenFrequency: null },
  canopyOpenness: 'open',
  deviceAirflow: { mode: 'none', sources: [] }
})
assert.equal(isAirEnvironmentAnswerReady(freshAirInput), true)
assert.deepEqual(resolveAirEnvironmentPreview(freshAirInput), {
  airExchangeLevel: 'medium',
  directAirflow: false
})
assert.equal(
  isAirEnvironmentAnswerReady({
    airExchange: { source: 'window', windowDirectionCount: 'one' },
    canopyOpenness: 'open',
    deviceAirflow: { mode: 'none', sources: [] }
  }),
  false
)
assert.deepEqual(
  sanitizeAirEnvironmentInput({
    airExchange: { source: 'window', windowDirectionCount: 'closed' },
    canopyOpenness: 'enclosed',
    deviceAirflow: { mode: 'direct', sources: ['fresh_air'] }
  }).deviceAirflow,
  { mode: 'direct', sources: [] }
)

console.log('air environment input tests passed')
