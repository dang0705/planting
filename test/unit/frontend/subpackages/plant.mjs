import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const pagesConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8'))
const mainPagePaths = new Set((pagesConfig.pages ?? []).map(page => page.path))
const plantPackage = pagesConfig.subPackages?.find(item => item.root === 'subpackages/plant')

assert.ok(plantPackage, 'plant subpackage must be registered')
assert.deepEqual(
  plantPackage.pages?.map(page => page.path),
  ['user-plant-detail/user-plant-detail']
)
assert.equal(mainPagePaths.has('pages/user-plant-detail/user-plant-detail'), false)
assert.ok(
  fs.existsSync(
    path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/user-plant-detail.vue')
  )
)

const indexSource = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')
const detailViewSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'
  ),
  'utf8'
)
assert.match(indexSource, /subpackages\/plant\/user-plant-detail\/user-plant-detail\?mode=create/)
assert.match(indexSource, /subpackages\/plant\/user-plant-detail\/user-plant-detail\?mode=edit/)
assert.match(detailViewSource, /uni\.navigateTo\(\{ url: `\/subpackages\/diagnosis\/flow\?\$\{query\}` \}\)/)
assert.match(detailViewSource, /plant\.value\?\.plantId/)
assert.match(detailViewSource, /plantCatalogId=/)
assert.match(detailViewSource, /entrySource=plant_detail/)

console.log('plant subpackage contract passed')
