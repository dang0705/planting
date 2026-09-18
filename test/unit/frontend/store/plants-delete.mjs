import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(path.join(repoRoot, 'src/store/plants.js'), 'utf8')
const transformed = source
  .replace("import { defineStore } from 'pinia'", 'const defineStore = (_name, options) => options')
  .replace(
    "import { queryClient } from '@/lib/query-client.js'",
    'const queryClient = { removeQueries: () => {} }'
  )
  .replace(
    "import { USER_PLANTS_QUERY_KEY } from '@/vue-query/plants/queries/user-plants.js'",
    "const USER_PLANTS_QUERY_KEY = ['user-plants']"
  )
  .replace(
    /import \{\n  completeWateringReminder,\n  fetchUserPlants,\n  patchUserPlant,\n  removeUserPlant\n\} from '@\/api\/plants-http\.js'/u,
    'const completeWateringReminder = async () => ({}); const fetchUserPlants = async () => ({}); const patchUserPlant = async () => ({}); const removeUserPlant = (...args) => globalThis.__removeUserPlant(...args)'
  )
  .replace("import { useUserStore } from '@/store/user.js'", 'const useUserStore = () => ({})')
  .replace(
    "import { parsePlantDateTime } from '@/utils/plant-datetime.js'",
    'const parsePlantDateTime = value => (value ? new Date(value) : null)'
  )

const module = await import(`data:text/javascript,${encodeURIComponent(transformed)}`)
const deleteUserPlant = module.usePlantStore.actions.deleteUserPlant

const state = {
  userPlants: [{ id: 7 }, { id: 8 }],
  currentPlant: { id: 7 }
}
globalThis.__removeUserPlant = async id => {
  assert.equal(id, 7)
  return { code: 200, data: { cleanupPending: true } }
}
try {
  const result = await deleteUserPlant.call(state, '7')
  assert.deepEqual(result, {
    success: true,
    cleanupPending: true,
    message: '植物已删除，图片正在清理'
  })
  assert.deepEqual(state.userPlants, [{ id: 8 }])
  assert.equal(state.currentPlant, null)

  globalThis.__removeUserPlant = async () => {
    throw new Error('PROTOCOL_CONNECTION_LOST')
  }
  const failed = await deleteUserPlant.call(state, '8')
  assert.deepEqual(failed, {
    success: false,
    message: '暂时无法删除植物，请检查网络后重试'
  })

  globalThis.__removeUserPlant = async () => ({
    code: 503,
    message: 'PROTOCOL_CONNECTION_LOST'
  })
  const rejected = await deleteUserPlant.call(state, '8')
  assert.deepEqual(rejected, {
    success: false,
    message: '暂时无法删除植物，请检查网络后重试'
  })

  const invalid = await deleteUserPlant.call(state, 'not-a-number')
  assert.deepEqual(invalid, { success: false, message: '无效的植物ID' })
} finally {
  delete globalThis.__removeUserPlant
}

console.log('plant store delete state tests passed')
