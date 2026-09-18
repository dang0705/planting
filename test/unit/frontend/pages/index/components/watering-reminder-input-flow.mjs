import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/pages/index/components/useWateringReminderInputFlow.js'),
  'utf8'
)
const transformed = source
  .replace(
    "import { computed, ref } from 'vue'",
    `const ref = value => ({ value })
const computed = getter => ({ get value() { return getter() } })`
  )
  .replace(
    "import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'",
    'const mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline = base => base'
  )
  .replace(
    "import { resolveComponentMethod } from '@/utils/component-ref.js'",
    `const resolveComponentMethod = (target, methodName) => {
  const value = target?.value
  const candidates = [target, value, target?.$vm, value?.$vm, target?.$?.exposed, value?.$?.exposed]
  for (const candidate of candidates) {
    if (typeof candidate?.[methodName] === 'function') {
      return (...args) => candidate[methodName](...args)
    }
  }
  return null
}`
  )
  .replace(
    "import { buildWateringReminderInputSignature, todayStr } from './watering-reminder-options.js'",
    `const buildWateringReminderInputSignature = ({ wateringEvents = [] } = {}) =>
  JSON.stringify(wateringEvents)
const todayStr = () => '2026-09-02'`
  )
const module = await import(`data:text/javascript,${encodeURIComponent(transformed)}`)

function createRefs() {
  return {
    selectedWateringEvents: { value: [] },
    wateringHistoryTouched: { value: false },
    selectedWateringEventsForPlanner: { value: [{ date: '2026-09-01', watered: true }] },
    pendingReminderSavePayload: { value: null },
    calendarSyncError: { value: '' },
    environmentWeatherWindow: { value: null },
    weatherLoading: { value: false },
    plannerError: { value: '' }
  }
}

const refs = createRefs()
const order = []
const payload = {
  potTopDiameterCm: '24',
  potBottomDiameterCm: '16',
  potHeightCm: '18',
  hasDrainageHole: 'false',
  substrateType: '[{"material":"coco","ratio":100}]',
  source: 'user',
  confidence: 'normal'
}
let savedArgs = null
const flow = module.useWateringReminderInputFlow({
  props: { plant: { id: '42' } },
  plantStore: {
    savePotProfile: async (...args) => {
      savedArgs = args
      order.push('save')
      return { success: true }
    }
  },
  ...refs,
  loadWeatherDays: async () => order.push('weather'),
  fetchPlanner: async () => order.push('planner')
})
flow.inputStepperRef.value = {
  $vm: {
    getPotProfileState: () => 'complete',
    validatePotProfile: () => true,
    confirmOversizedPot: async () => true,
    getWateringEvents: () => refs.selectedWateringEventsForPlanner.value,
    getPotProfilePayload: () => payload,
    commitPotProfile: () => order.push('commit')
  }
}

flow.openPotProfileEditor()
order.length = 0
await flow.handleInputNext()
assert.deepEqual(savedArgs, ['42', payload], '端上 $vm ref 也必须把盆型提交到当前植物')
assert.deepEqual(order, ['save', 'commit', 'weather', 'planner'])
assert.equal(flow.inputFlowOpen.value, false)
assert.equal(refs.wateringHistoryTouched.value, true)

const unchangedOrder = []
let unchangedSaveCalled = false
const unchangedFlow = module.useWateringReminderInputFlow({
  props: {
    plant: {
      id: '42',
      potProfile: {
        potTopDiameterCm: 24,
        potBottomDiameterCm: 16,
        potHeightCm: 18,
        hasDrainageHole: 'false',
        substrateType: '[{"material":"coco","ratio":100}]'
      }
    }
  },
  plantStore: {
    savePotProfile: async () => {
      unchangedSaveCalled = true
      return { success: true }
    }
  },
  ...refs,
  loadWeatherDays: async () => unchangedOrder.push('weather'),
  fetchPlanner: async () => unchangedOrder.push('planner')
})
unchangedFlow.inputStepperRef.value = {
  $vm: {
    getPotProfileState: () => 'complete',
    validatePotProfile: () => true,
    confirmOversizedPot: async () => true,
    getWateringEvents: () => refs.selectedWateringEventsForPlanner.value,
    getPotProfilePayload: () => payload,
    commitPotProfile: () => unchangedOrder.push('commit')
  }
}
unchangedFlow.openPotProfileEditor()
unchangedOrder.length = 0
await unchangedFlow.handleInputNext()
assert.equal(unchangedSaveCalled, false, '未修改的盆型不应重复 PATCH')
assert.deepEqual(unchangedOrder, ['weather', 'planner'])

flow.resetInputFlowState()
flow.inputStepperRef.value = {
  $vm: {
    getPotProfileState: () => 'basic',
    validatePotProfile: () => true,
    confirmOversizedPot: async () => true,
    getWateringEvents: () => refs.selectedWateringEventsForPlanner.value,
    getPotProfilePayload: () => null
  }
}
flow.openPotProfileEditor()
await flow.handleInputNext()
assert.equal(refs.plannerError.value, '盆型信息未读取，请返回重新拖动')
assert.equal(flow.inputFlowOpen.value, true, '盆型未读取时不能继续生成浇水建议')

console.log('watering reminder input flow behavior passed data_mode=unit_fake test_kind=logic')
