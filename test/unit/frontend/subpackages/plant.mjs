import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readPagesManifest } from '../../../helpers/pages-manifest.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const pagesConfig = readPagesManifest(repoRoot)
const mainPagePaths = new Set((pagesConfig.pages ?? []).map(page => page.path))
const plantPackage = pagesConfig.subPackages?.find(item => item.root === 'subpackages/plant')

assert.ok(plantPackage, 'plant subpackage must be registered')
assert.deepEqual(
  plantPackage.pages?.map(page => page.path),
  ['user-plant-detail/user-plant-detail', 'catalog-detail/catalog-detail']
)
assert.equal(mainPagePaths.has('pages/user-plant-detail/user-plant-detail'), false)
assert.ok(
  fs.existsSync(
    path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/user-plant-detail.vue')
  )
)

const userPlantsSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/UserPlantsSection.vue'),
  'utf8'
)
const detailViewSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'),
  'utf8'
)
const catalogDetailSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/catalog-detail/components/PlantCatalogDetailView.vue'),
  'utf8'
)
const userPlantDetailPageSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/user-plant-detail.vue'),
  'utf8'
)
const userPlantDetailFormSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'),
  'utf8'
)
assert.match(
  userPlantsSource,
  /subpackages\/plant\/user-plant-detail\/user-plant-detail\?mode=create/
)
assert.match(
  userPlantsSource,
  /subpackages\/plant\/user-plant-detail\/user-plant-detail\?mode=edit/
)
assert.match(
  detailViewSource,
  /uni\.navigateTo\(\{ url: `\/subpackages\/diagnosis\/flow\?\$\{query\}` \}\)/
)
assert.match(detailViewSource, /plant\.value\?\.plantId/)
assert.match(detailViewSource, /plantCatalogId=/)
assert.match(detailViewSource, /entrySource=plant_detail/)
assert.match(catalogDetailSource, /mode=create&catalogPlantId=\$\{catalogPlantId\}/u)
assert.match(userPlantDetailPageSource, /:initial-catalog-plant-id="initialCatalogPlantId"/u)
assert.match(
  userPlantDetailPageSource,
  /initialCatalogPlantId\.value = String\(options\?\.catalogPlantId/u
)
assert.match(userPlantDetailFormSource, /fetchPlantCatalogDetail/u)
assert.match(
  userPlantDetailFormSource,
  /initialCatalogPlantId: \{ type: \[String, Number\], default: '' \}/u
)
assert.match(userPlantDetailFormSource, /:show-back="false"/u)
assert.doesNotMatch(userPlantDetailFormSource, /PlantSelectionStep|PlantSearchToolbar|swiper/u)

console.log('plant subpackage contract passed')
