import assert from 'node:assert/strict'

const {
  isAirEnvironmentAnswerReady,
  isSameAirEnvironmentLocationBinding,
  resolveAirEnvironmentPreview,
  sanitizeAirEnvironmentInput
} = await import('../../../../src/utils/air-environment.js')

const freshAirInput = {
  airExchange: { source: 'fresh_air' },
  canopyOpenness: 'open',
  deviceAirflow: { mode: 'none', sources: [], directSources: [], sourceModes: {} }
}

assert.deepEqual(sanitizeAirEnvironmentInput(freshAirInput), {
  airExchange: { source: 'fresh_air', windowDirectionCount: null, windowOpenFrequency: null },
  canopyOpenness: 'open',
  deviceAirflow: {
    mode: 'circulating',
    sources: ['fresh_air'],
    directSources: [],
    sourceModes: { fresh_air: 'circulating' }
  }
})
assert.equal(isAirEnvironmentAnswerReady(freshAirInput), true)
assert.deepEqual(
  sanitizeAirEnvironmentInput({
    ...freshAirInput,
    deviceAirflow: { mode: 'none', sources: [], directSources: [], sourceModes: {} }
  }).deviceAirflow,
  {
    mode: 'circulating',
    sources: ['fresh_air'],
    directSources: [],
    sourceModes: { fresh_air: 'circulating' }
  }
)
assert.deepEqual(
  sanitizeAirEnvironmentInput({
    ...freshAirInput,
    deviceAirflow: { mode: 'unknown', sources: [], directSources: [], sourceModes: {} }
  }).deviceAirflow,
  {
    mode: 'circulating',
    sources: ['fresh_air'],
    directSources: [],
    sourceModes: { fresh_air: 'circulating' }
  }
)
assert.deepEqual(resolveAirEnvironmentPreview(freshAirInput), {
  airExchangeLevel: 'medium',
  directAirflow: false
})
assert.equal(
  isAirEnvironmentAnswerReady({
    airExchange: { source: 'window', windowDirectionCount: 'one' },
    canopyOpenness: 'open',
    deviceAirflow: { mode: 'none', sources: [], directSources: [], sourceModes: {} }
  }),
  false
)

// 已保存档案没有历史位置绑定时，不能被误判为位置变化；只有两边都有绑定且不一致时才需要确认。
assert.equal(isSameAirEnvironmentLocationBinding({}, {}), true)
assert.equal(
  isSameAirEnvironmentLocationBinding({}, { careLocationId: 'current', locationKey: 'room' }),
  true
)
assert.equal(
  isSameAirEnvironmentLocationBinding(
    { careLocationId: 'saved', locationKey: 'room' },
    { careLocationId: 'saved', locationKey: 'room' }
  ),
  true
)
assert.equal(
  isSameAirEnvironmentLocationBinding(
    { careLocationId: 'saved', locationKey: 'room' },
    { careLocationId: 'other', locationKey: 'room' }
  ),
  false
)
assert.deepEqual(
  sanitizeAirEnvironmentInput({
    airExchange: { source: 'window', windowDirectionCount: 'closed' },
    canopyOpenness: 'enclosed',
    deviceAirflow: { mode: 'direct', sources: ['fresh_air'], directSources: ['fresh_air'] }
  }).deviceAirflow,
  { mode: 'direct', sources: [], directSources: [], sourceModes: null }
)
assert.equal(
  isAirEnvironmentAnswerReady({
    airExchange: { source: 'window', windowDirectionCount: 'one', windowOpenFrequency: 'daily' },
    canopyOpenness: 'open',
    deviceAirflow: {
      mode: 'direct',
      sources: ['fan', 'air_conditioner'],
      directSources: ['air_conditioner'],
      sourceModes: { fan: 'circulating', air_conditioner: 'direct' }
    }
  }),
  true
)
assert.equal(
  isAirEnvironmentAnswerReady({
    airExchange: { source: 'window', windowDirectionCount: 'one', windowOpenFrequency: 'daily' },
    canopyOpenness: 'open',
    deviceAirflow: { mode: 'direct', sources: ['fan', 'air_conditioner'] }
  }),
  false
)

assert.deepEqual(
  sanitizeAirEnvironmentInput({
    airExchange: { source: 'window', windowDirectionCount: 'one', windowOpenFrequency: 'daily' },
    canopyOpenness: 'open',
    deviceAirflow: {
      mode: 'circulating',
      sourceModes: { fan: 'circulating', air_conditioner: 'none' }
    }
  }).deviceAirflow,
  {
    mode: 'circulating',
    sources: ['fan'],
    directSources: [],
    sourceModes: { fan: 'circulating' }
  }
)

console.log('air environment input tests passed')
