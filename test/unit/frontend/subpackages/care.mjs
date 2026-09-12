import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const pagesConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8'))
const carePackage = pagesConfig.subPackages?.find(item => item.root === 'subpackages/care')
const mainPagePaths = new Set((pagesConfig.pages || []).map(page => page.path))

assert.ok(carePackage, 'care pages must be registered under a dedicated subpackage root')
assert.deepEqual(
  carePackage.pages.map(page => page.path),
  ['watering-advisor/watering-advisor', 'airflow/index', 'plant-environment/light-environment']
)
for (const oldPath of [
  'pages/watering-advisor/watering-advisor',
  'pages/airflow/index',
  'pages/plant-environment/light-environment'
]) {
  assert.equal(mainPagePaths.has(oldPath), false, `care page remains in main pages: ${oldPath}`)
}

const entrySources = [
  fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8'),
  fs.readFileSync(
    path.join(
      repoRoot,
      'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
    ),
    'utf8'
  )
]
for (const source of entrySources) {
  assert.doesNotMatch(source, /\/pages\/(?:watering-advisor\/watering-advisor|airflow\/index)/)
  assert.match(source, /\/subpackages\/care\//)
}

console.log('care subpackage route contract tests passed')
