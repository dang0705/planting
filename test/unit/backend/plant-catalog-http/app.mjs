import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// data_mode=unit_fake; test_kind=source_contract。真实 HTTPS 图片由 CloudBase/LAN 与目标端验证。
const repoRoot = process.cwd()
const appSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/plant-catalog-http/app.js'),
  'utf8'
)
const bootstrapSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/plant-catalog-http/scf_bootstrap'),
  'utf8'
)
const preloadSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/plant-catalog-http/bootstrap-preload.js'),
  'utf8'
)
const deploySource = fs.readFileSync(
  path.join(repoRoot, 'scripts/deploy-cloudbase-functions.mjs'),
  'utf8'
)
const functionConfig = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'cloudfunctions/plant-catalog-http/cloudbase-functions.json'),
    'utf8'
  )
)

assert.match(appSource, /catalog\/image-urls/)
assert.match(bootstrapSource, /--require \/var\/user\/bootstrap-preload\.js/)
assert.match(preloadSource, /globalThis\.File/)
assert.match(appSource, /method !== 'POST'/)
assert.match(appSource, /collectCatalogImageRefs/)
assert.match(appSource, /CATALOG_IMAGE_URL_BATCH_LIMIT = 50/)
assert.match(appSource, /resolveCatalogImageUrls/)
assert.match(appSource, /fileId,[\s\S]*imageUrl:/)
assert.match(appSource, /require\('\.\/catalog-image-url'\)/)
assert.match(deploySource, /FUNCTION_BUNDLED_RUNTIME_FILES/)
assert.match(deploySource, /'plant-catalog-http'/)
assert.match(deploySource, /target: 'catalog-image-url\.js'/)
assert.ok(functionConfig.routes.some(route => route.path === '/catalog/image-urls'))

console.log(
  'plant catalog image URL endpoint contract passed data_mode=unit_fake test_kind=source_contract'
)
