import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCloudBaseTriggerClient } = require(
  '../../../../../cloudfunctions/weather-ingestion-scheduler/services/season-trigger-sync.js'
)

const baseNames = [
  'weather-ingestion-recent-10d',
  'weather-d0-now-sunrise-sweep',
  'weather-d0-now-morning-0720',
  'weather-d0-now-forenoon-1120',
  'weather-d0-now-noon-1420',
  'weather-d0-now-afternoon-1620',
  'weather-d0-now-sunset-sweep',
  'weather-d0-now-finalize-2130'
]

const baseCron = {
  'weather-ingestion-recent-10d': '0 20 0/6 * * * *',
  'weather-d0-now-sunrise-sweep': '0 */10 4-7 * * * *',
  'weather-d0-now-morning-0720': '0 20 7 * * * *',
  'weather-d0-now-forenoon-1120': '0 20 11 * * * *',
  'weather-d0-now-noon-1420': '0 20 14 * * * *',
  'weather-d0-now-afternoon-1620': '0 20 16 * * * *',
  'weather-d0-now-sunset-sweep': '0 */10 17-20 * * * *',
  'weather-d0-now-finalize-2130': '0 30 21 * * * *'
}

function existingTrigger(name, config = baseCron[name]) {
  return {
    TriggerName: name,
    Type: 'timer',
    TriggerDesc: JSON.stringify({ cron: config })
  }
}

function disabledTrigger(name, config = baseCron[name]) {
  return { ...existingTrigger(name, config), Enable: 0 }
}

function createFunctions({ triggers }) {
  const createdBatches = []
  const deletedNames = []
  return {
    createdBatches,
    deletedNames,
    async getFunctionDetail() {
      return { Triggers: triggers }
    },
    async createFunctionTriggers(_functionName, payload) {
      createdBatches.push(payload)
    },
    async deleteFunctionTrigger(_functionName, triggerName) {
      deletedNames.push(triggerName)
    }
  }
}

{
  const functions = createFunctions({
    triggers: [...baseNames.map(name => existingTrigger(name)), existingTrigger('manual-keep')]
  })
  const client = createCloudBaseTriggerClient({
    env: { WEATHER_INGESTION_SCHEDULER_FUNCTION_NAME: 'weather-ingestion-scheduler' },
    functions
  })

  const result = await client.ensureBaseTimerTriggers()
  assert.equal(result.count, 8)
  assert.deepEqual(result.created, [])
  assert.deepEqual(result.changed, [])
  assert.equal(result.unchanged.length, 8)
  assert.equal(result.existingCount, 9)
  assert.deepEqual(functions.createdBatches, [])
  assert.deepEqual(functions.deletedNames, [])
}

{
  const changedName = 'weather-d0-now-morning-0720'
  const functions = createFunctions({
    triggers: baseNames.map(name =>
      existingTrigger(name, name === changedName ? '0 0 0 * * * *' : baseCron[name])
    )
  })
  const client = createCloudBaseTriggerClient({
    env: {},
    functions
  })

  const result = await client.ensureBaseTimerTriggers()
  assert.deepEqual(result.created, [changedName])
  assert.deepEqual(result.changed, [changedName])
  assert.deepEqual(functions.deletedNames, [changedName])
  assert.deepEqual(functions.createdBatches, [
    [{ name: changedName, type: 'timer', config: baseCron[changedName] }]
  ])
}

{
  const missingName = 'weather-d0-now-finalize-2130'
  const functions = createFunctions({
    triggers: baseNames
      .filter(name => name !== missingName)
      .map(name => existingTrigger(name))
  })
  const client = createCloudBaseTriggerClient({ env: {}, functions })

  const result = await client.ensureBaseTimerTriggers()
  assert.deepEqual(result.created, [missingName])
  assert.deepEqual(result.changed, [])
  assert.deepEqual(functions.deletedNames, [])
  assert.deepEqual(functions.createdBatches, [
    [{ name: missingName, type: 'timer', config: baseCron[missingName] }]
  ])
}

{
  const disabledName = 'weather-d0-now-noon-1420'
  const functions = createFunctions({
    triggers: baseNames.map(name => (name === disabledName ? disabledTrigger(name) : existingTrigger(name)))
  })
  const client = createCloudBaseTriggerClient({ env: {}, functions })

  const result = await client.ensureBaseTimerTriggers()
  assert.deepEqual(result.created, [disabledName])
  assert.deepEqual(result.changed, [disabledName])
  assert.deepEqual(functions.deletedNames, [disabledName])
  assert.deepEqual(functions.createdBatches, [
    [{ name: disabledName, type: 'timer', config: baseCron[disabledName] }]
  ])
}

console.log('weather-ingestion-scheduler trigger reconciliation tests passed')
