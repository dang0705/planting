import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/store/plants.js'), 'utf8')
const transformed = source
  .replace("import { defineStore } from 'pinia'", 'const defineStore = (_name, options) => options')
  .replace(
    "import { queryClient } from '@/lib/query-client.js'",
    'const queryClient = { removeQueries: (...args) => { globalThis.__removed = (globalThis.__removed || []).concat(args) } }'
  )
  .replace(
    "import { USER_PLANTS_QUERY_KEY } from '@/vue-query/plants/queries/user-plants.js'",
    "const USER_PLANTS_QUERY_KEY = ['user-plants']"
  )
  .replace(
    /import \{\n  completeWateringReminder,\n  fetchUserPlants,\n  patchUserPlant,\n  removeUserPlant\n\} from '@\/api\/plants-http\.js'/u,
    'const completeWateringReminder = async () => ({}); const fetchUserPlants = (...args) => globalThis.__fetchUserPlants(...args); const patchUserPlant = async () => ({}); const removeUserPlant = async () => ({})'
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
const getUserPlants = module.usePlantStore.actions.getUserPlants
const state = { userPlants: [{ id: 99 }], currentPlant: { id: 99 }, userPlantsScope: 'old' }
globalThis.__userStore = { openid: 'user-a', userId: '' }
let resolveFetch
globalThis.__fetchUserPlants = () =>
  new Promise(resolve => {
    resolveFetch = resolve
  })

try {
  const pending = getUserPlants.call(state, 1, 50)
  assert.deepEqual(state.userPlants, [], '切换账号时应立即清空旧植物')
  globalThis.__userStore.openid = 'user-b'
  resolveFetch({ code: 200, data: { list: [{ id: 1 }], total: 1 } })
  const result = await pending
  assert.equal(result.stale, true, '旧账号响应不得覆盖新账号状态')
  assert.deepEqual(state.userPlants, [])
  assert.ok(globalThis.__removed.length >= 1)
  assert.match(source, /let userPlantsRequestVersion = 0/u)
  assert.match(source, /requestVersion !== userPlantsRequestVersion/u)
} finally {
  delete globalThis.__userStore
  delete globalThis.__fetchUserPlants
  delete globalThis.__removed
}

console.log(
  'plant store cache scope contracts passed data_mode=unit_fake test_kind=source_contract'
)
