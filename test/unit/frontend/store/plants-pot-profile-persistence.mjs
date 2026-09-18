import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/store/plants.js'), 'utf8')
const transformed = source
  .replace("import { defineStore } from 'pinia'", 'const defineStore = (_name, options) => options')
  .replace(
    "import { queryClient } from '@/lib/query-client.js'",
    'const queryClient = { removeQueries() {} }'
  )
  .replace(
    "import { USER_PLANTS_QUERY_KEY } from '@/vue-query/plants/queries/user-plants.js'",
    "const USER_PLANTS_QUERY_KEY = ['user-plants']"
  )
  .replace(
    /import \{\n  completeWateringReminder,\n  fetchUserPlants,\n  patchUserPlant,\n  removeUserPlant\n\} from '@\/api\/plants-http\.js'/u,
    'const completeWateringReminder = async () => ({}); const fetchUserPlants = async () => ({}); const patchUserPlant = (...args) => globalThis.__patchUserPlant(...args); const removeUserPlant = async () => ({})'
  )
  .replace(
    "import { useUserStore } from '@/store/user.js'",
    'const useUserStore = () => globalThis.__userStore'
  )
  .replace(
    "import { parsePlantDateTime } from '@/utils/plant-datetime.js'",
    'const parsePlantDateTime = value => (value ? new Date(value) : null)'
  )

const module = await import(`data:text/javascript,${encodeURIComponent(transformed)}`)
const savePotProfile = module.usePlantStore.actions.savePotProfile
const state = {
  userPlants: [{ id: 99, potProfile: null }],
  currentPlant: { id: 99, potProfile: null },
  userPlantsScope: ''
}
state.updateUserPlantLocal = module.usePlantStore.actions.updateUserPlantLocal.bind(state)
globalThis.__userStore = { openid: 'user-a', userId: '' }
let patchPayload = null
globalThis.__patchUserPlant = async payload => {
  patchPayload = payload
  return {
    code: 200,
    data: {
      potProfile: {
        potTopDiameterCm: 20,
        potBottomDiameterCm: 10,
        potHeightCm: 15,
        hasDrainageHole: 'false',
        substrateType: 'unknown',
        substrateComposition: null,
        profileVersion: 3,
        source: 'user',
        confidence: 'normal'
      }
    }
  }
}

try {
  const result = await savePotProfile.call(state, '99', {
    potTopDiameterCm: '20',
    potBottomDiameterCm: '10',
    potHeightCm: '15',
    hasDrainageHole: 'false',
    substrateType: null,
    source: 'user',
    confidence: 'normal'
  })

  assert.equal(result.success, true)
  assert.equal(patchPayload.id, 99, '盆型保存应使用数值植物 ID')
  assert.equal(state.userPlants[0].potProfile.potTopDiameterCm, 20, '应以服务端回读盆型为准')
  assert.equal(state.userPlants[0].potProfile.hasDrainageHole, 'false')
  assert.equal(state.currentPlant.potProfile.potHeightCm, 15)

  const originalProfile = state.userPlants[0].potProfile
  globalThis.__patchUserPlant = async () => ({ code: 500 })
  const failed = await savePotProfile.call(state, 99, {
    potTopDiameterCm: '30',
    potBottomDiameterCm: '20',
    potHeightCm: '25',
    hasDrainageHole: 'true',
    substrateType: null,
    source: 'user',
    confidence: 'normal'
  })
  assert.equal(failed.success, false)
  assert.deepEqual(state.userPlants[0].potProfile, originalProfile, '保存失败应回滚本地盆型')
  assert.deepEqual(state.currentPlant.potProfile, originalProfile, '保存失败应回滚当前植物快照')
} finally {
  delete globalThis.__userStore
  delete globalThis.__patchUserPlant
}

console.log(
  'plant store pot profile persistence contracts passed data_mode=unit_fake test_kind=source_contract'
)
