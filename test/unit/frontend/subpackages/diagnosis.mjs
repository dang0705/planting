/* oxlint-disable no-console */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const pagesConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8'))
const diagnosisRoot = path.join(repoRoot, 'src/subpackages/diagnosis')
const diagnosisPackage = pagesConfig.subPackages?.find(
  item => item.root === 'subpackages/diagnosis'
)
const mainPagePaths = new Set((pagesConfig.pages || []).map(page => page.path))

assert.ok(diagnosisPackage, 'diagnosis pages must be registered under a dedicated subpackage root')
assert.deepEqual(
  diagnosisPackage.pages.map(page => page.path),
  ['question-package', 'flow', 'result']
)
assert.equal(mainPagePaths.has('pages/diagnose/diagnose'), true)
assert.equal(mainPagePaths.has('pages/diagnose/question-package'), false)
assert.equal(mainPagePaths.has('pages/diagnose/result'), false)

for (const page of diagnosisPackage.pages) {
  assert.ok(
    fs.existsSync(path.join(diagnosisRoot, `${page.path}.vue`)),
    `diagnosis subpackage source page is missing: ${page.path}`
  )
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(child) : [child]
  })
}

const diagnosisFiles = walk(diagnosisRoot).filter(file => /\.(vue|js)$/.test(file))
for (const file of diagnosisFiles) {
  const source = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /(?:@\/)?subpackages\/review\//,
    `diagnosis subpackage must not import review subpackage: ${path.relative(repoRoot, file)}`
  )
}

const flowSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/diagnose-flow/dialog-submit.js'),
  'utf8'
)
const diagnoseTabSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/diagnose/diagnose.vue'),
  'utf8'
)
const diagnoseTabIntakeSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/diagnose/diagnosis-tab-intake.js'),
  'utf8'
)
const flowPageSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/flow.vue'),
  'utf8'
)
const indexSource = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')
const profileSource = fs.readFileSync(path.join(repoRoot, 'src/pages/profile/profile.vue'), 'utf8')
assert.match(flowSource, /\/subpackages\/diagnosis\/question-package\?draftKey=/)
assert.match(diagnoseTabSource, /id="diagnose-tab-page"/)
assert.match(diagnoseTabSource, /<DiagnoseIntake/)
assert.doesNotMatch(diagnoseTabSource, /redirectTo\(/)
assert.doesNotMatch(diagnoseTabSource, /subpackages\/diagnosis/)
assert.match(flowPageSource, /<DiagnoseFlow/)
assert.match(flowPageSource, /:plant-catalog-id="plantCatalogId"/)
assert.match(flowPageSource, /options\?\.plantCatalogId \|\| options\?\.catalogPlantId/)
assert.match(flowPageSource, /const entrySource = ref\('diagnose_tab'\)/)
assert.match(flowPageSource, /const diagnosisProfile = ref\('full'\)/)
assert.match(flowPageSource, /:diagnosis-profile="diagnosisProfile"/)
assert.doesNotMatch(flowPageSource, /intakeKey|intake-draft/)
assert.match(flowPageSource, /normalizeEntrySource\(options\?\.entrySource\)/)
assert.match(flowPageSource, /normalizeDiagnosisProfile\(options\?\.diagnosisProfile\)/)
assert.match(diagnoseTabIntakeSource, /\/subpackages\/diagnosis\/question-package\?draftKey=/)
assert.doesNotMatch(diagnoseTabIntakeSource, /\/subpackages\/diagnosis\/flow/)
assert.match(indexSource, /subpackages\/diagnosis\/flow\?plantId=/)
assert.match(indexSource, /\/subpackages\/diagnosis\/result\?id=/)
assert.match(profileSource, /\/subpackages\/diagnosis\/result\?id=/)

console.log('diagnosis subpackage route contract tests passed')
