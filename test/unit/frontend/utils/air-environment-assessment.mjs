// data_mode=unit_fake; test_kind=unit_logic.
import assert from 'node:assert/strict'

const {
  buildAdvancedAirEnvironmentAssessment,
  buildQuickAirEnvironmentAssessment,
  getActiveAirEnvironmentAssessment
} = await import('../../../../src/utils/air-environment-assessment.js')

assert.deepEqual(buildQuickAirEnvironmentAssessment({ selectedOptionKey: 'frequent' }), {
  ok: true,
  value: {
    schemaVersion: 3,
    mode: 'quick',
    quickAnswer: {
      questionKey: 'air_exchange_frequency',
      optionKey: 'frequent'
    },
    advancedInput: null
  }
})
assert.deepEqual(buildQuickAirEnvironmentAssessment({ selectedOptionKey: 'unexpected' }), {
  ok: false,
  userMessage: '请选择植物所处空间的换气频率'
})

const advancedInput = {
  airExchange: {
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'daily'
  },
  canopyOpenness: 'enclosed',
  deviceAirflow: {
    mode: 'direct',
    sources: ['fan', 'fresh_air'],
    directSources: ['fan', 'fresh_air'],
    sourceModes: { fan: 'direct', fresh_air: 'direct' }
  }
}
const advanced = buildAdvancedAirEnvironmentAssessment(advancedInput)
assert.equal(advanced.ok, true)
assert.deepEqual(advanced.value.advancedInput.deviceAirflow, {
  mode: 'direct',
  sources: ['fan'],
  directSources: ['fan'],
  sourceModes: { fan: 'direct' }
})
assert.equal(advanced.value.quickAnswer, null)
assert.notEqual(advanced.value.advancedInput, advancedInput)

assert.deepEqual(
  getActiveAirEnvironmentAssessment({
    schemaVersion: 3,
    activeMode: 'quick',
    completedModes: {
      quick: { questionKey: 'air_exchange_frequency', optionKey: 'regular' },
      advanced: advanced.value.advancedInput
    }
  }),
  {
    schemaVersion: 3,
    mode: 'quick',
    quickAnswer: { questionKey: 'air_exchange_frequency', optionKey: 'regular' },
    advancedInput: null
  }
)

console.log('air environment v3 frontend converters passed')
