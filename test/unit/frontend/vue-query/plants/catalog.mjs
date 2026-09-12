import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs
  .readFileSync(path.join(repoRoot, 'src/vue-query/plants/queries/catalog.js'), 'utf8')
  .replace(
    "import { requestHttpFunction } from '@/api/http'",
    'const requestHttpFunction = (...args) => globalThis.__catalogRequest(...args)'
  )
  .replace(
    "import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'",
    'const runVueQueryQuery = options => options'
  )
  .replace(
    "import { getCurrentMiniProgramPlatform } from '@/utils/platform-capabilities.js'",
    'const getCurrentMiniProgramPlatform = () => globalThis.__catalogPlatform'
  )
const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)

globalThis.__catalogPlatform = 'douyin_mp'
let capturedRequest
globalThis.__catalogRequest = (...args) => {
  capturedRequest = args
  return Promise.resolve({ code: 200 })
}

const options = module.buildPlantCatalogQueryOptions('', 2, 10)
assert.deepEqual(options.queryKey, [
  'http-function',
  'plant-catalog-http',
  'catalog',
  '',
  2,
  10,
  'douyin_mp'
])
await options.queryFn()
assert.equal(capturedRequest[0], 'plant-catalog-http/catalog/plants')
assert.equal(capturedRequest[1].query.platform, 'douyin_mp')

globalThis.__catalogPlatform = 'wechat_mp'
capturedRequest = null
const wechatOptions = module.buildPlantCatalogQueryOptions('', 1, 10)
await wechatOptions.queryFn()
assert.equal(capturedRequest[1].query.platform, 'wechat_mp')

console.log('catalog platform image contract tests passed data_mode=unit_fake')
