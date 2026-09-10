import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs
  .readFileSync(path.join(repoRoot, 'src/composables/useDefaultPlants.js'), 'utf8')
  .replace(
    "import { computed, ref } from 'vue'",
    `const ref = value => ({ value });
const computed = getter => ({ get value() { return getter() } })`
  )
  .replace(
    "import { fetchPlantCatalogQuery } from '@/vue-query/plants/queries/catalog.js'",
    'const fetchPlantCatalogQuery = (...args) => globalThis.__catalogFetch(...args)'
  )
  .replace(
    "import { getFileUrl } from '@/composables/useCloudFile.js'",
    'const getFileUrl = async fileId => `url:${fileId}`'
  )
  .replace(
    "import { isRestrictedMiniProgram } from '@/utils/platform-capabilities.js'",
    'const isRestrictedMiniProgram = () => Boolean(globalThis.__restrictedPlatform)'
  )
const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)

const requests = []
globalThis.__catalogFetch = (keyword, page) => {
  let resolve
  const promise = new Promise(next => {
    resolve = next
  })
  requests.push({ keyword, page, resolve })
  return promise
}
globalThis.__restrictedPlatform = false

const state = module.useDefaultPlants()
const oldLoad = state.load('old')
await Promise.resolve()
const newLoad = state.load('new')
await Promise.resolve()
assert.equal(requests.length, 2)
requests[1].resolve({
  data: { list: [{ id: 'new', imageFileId: 'new-file' }], total: 1, hasMore: true }
})
await newLoad
requests[0].resolve({
  data: { list: [{ id: 'old', imageFileId: 'old-file' }], total: 1, hasMore: false }
})
await oldLoad
assert.deepEqual(
  state.plants.value.map(item => item.id),
  ['new']
)
assert.equal(state.hasMore.value, true)
assert.equal(state.plants.value[0].imageUrl, 'url:new-file')

const stalePage = state.loadNextPage()
await Promise.resolve()
const freshLoad = state.load('fresh')
await Promise.resolve()
assert.equal(requests.length, 4)
requests[3].resolve({ data: { list: [{ id: 'fresh' }], total: 1, hasMore: false } })
await freshLoad
requests[2].resolve({ data: { list: [{ id: 'stale-page' }], total: 2, hasMore: false } })
await stalePage
assert.deepEqual(
  state.plants.value.map(item => item.id),
  ['fresh']
)
assert.equal(state.page.value, 1)
assert.equal(state.loading.value, false)

globalThis.__restrictedPlatform = true
const restrictedState = module.useDefaultPlants()
const restrictedLoad = restrictedState.load('restricted')
await Promise.resolve()
assert.equal(requests.length, 5)
requests[4].resolve({
  data: {
    list: [
      {
        id: 'restricted',
        imageFileId: 'restricted-file',
        imageUrl: 'https://temp.example.com/restricted.jpg'
      }
    ],
    total: 1,
    hasMore: false
  }
})
await restrictedLoad
assert.deepEqual(restrictedState.plants.value, [
  {
    id: 'restricted',
    imageFileId: '',
    imageUrl: 'https://temp.example.com/restricted.jpg',
    image: 'https://temp.example.com/restricted.jpg'
  }
])
assert.equal(restrictedState.loading.value, false)

console.log('useDefaultPlants stale-response tests passed data_mode=unit_fake')
