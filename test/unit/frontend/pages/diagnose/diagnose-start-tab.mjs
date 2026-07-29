import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const pagesJson = fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8')
const pageSource = fs.readFileSync(path.join(repoRoot, 'src/pages/diagnose/diagnose.vue'), 'utf8')
const resultSource = fs.readFileSync(path.join(repoRoot, 'src/pages/diagnose/result.vue'), 'utf8')
const indexSource = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')
const diagnoseMutationSource = fs.readFileSync(
  path.join(repoRoot, 'src/vue-query/diagnose/mutations/useDiagnoseMutation.js'),
  'utf8'
)
const diagnoseStreamMutationSource = fs.readFileSync(
  path.join(repoRoot, 'src/vue-query/diagnose/mutations/useDiagnoseStreamMutation.js'),
  'utf8'
)
const questionStartMutationSource = fs.readFileSync(
  path.join(repoRoot, 'src/vue-query/diagnose/mutations/useDiagnosisQuestionStartMutation.js'),
  'utf8'
)
const diagnoseMutationSharedSource = fs.readFileSync(
  path.join(repoRoot, 'src/vue-query/diagnose/mutations/shared.js'),
  'utf8'
)

const pagesConfig = JSON.parse(pagesJson)
const tabPaths = pagesConfig.tabBar.list.map(item => item.pagePath)

assert.deepEqual(tabPaths, [
  'pages/index/index',
  'pages/calendar/calendar',
  'pages/diagnose/diagnose',
  'pages/reminder/reminder',
  'pages/profile/profile'
])
assert.match(pageSource, /<DiagnoseFlow/)
assert.match(pageSource, /entry-source="diagnose_tab"/)
assert.match(pageSource, /plant-id=""/)
assert.match(pageSource, /plant-name=""/)
assert.doesNotMatch(pageSource, /userPlants\?\.\[0\]/)
assert.doesNotMatch(pageSource, /getUserPlants/)
assert.doesNotMatch(pageSource, /<PlantCard/)
assert.doesNotMatch(pageSource, /诊断结果承接页/)
assert.match(resultSource, /id="diagnosis-result-page"/)
assert.match(indexSource, /\/pages\/diagnose\/result\?id=/)
assert.match(diagnoseMutationSharedSource, /allowsStandaloneDiagnoseTab/)
assert.match(
  diagnoseMutationSharedSource,
  /!plantId &&[\s\S]*!userPlantId &&[\s\S]*!plantCatalogId &&[\s\S]*!allowsStandaloneDiagnoseTab/
)
assert.match(diagnoseMutationSource, /entrySource/)
assert.match(diagnoseMutationSource, /validateDiagnoseInput\(\{[\s\S]*plantCatalogId/)
assert.match(diagnoseStreamMutationSource, /diagnosisProfile = 'full'/)
assert.match(diagnoseStreamMutationSource, /entrySource = 'diagnose_tab'/)
assert.match(questionStartMutationSource, /const allowsStandaloneDiagnoseTab/)
assert.match(
  questionStartMutationSource,
  /!plantId &&[\s\S]*!userPlantId &&[\s\S]*!plantCatalogId &&[\s\S]*!allowsStandaloneDiagnoseTab/
)
assert.match(questionStartMutationSource, /entrySource: normalizedEntrySource/)
