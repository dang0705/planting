import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/* oxlint-disable no-console -- source contract emits a concise test result. */

const root = process.cwd()
const history = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/vue-query/diagnosis-history/queries/history.js'),
  'utf8'
)
const sharedKeys = fs.readFileSync(path.join(root, 'src/constants/query-keys.js'), 'utf8')
const mainPackageHistory = fs.readFileSync(
  path.join(root, 'src/vue-query/diagnosis-history/queries/history.js'),
  'utf8'
)
const api = fs.readFileSync(path.join(root, 'src/api/diagnosis-history.js'), 'utf8')
const diagnosisApi = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/api/diagnosis.js'),
  'utf8'
)
const userPlantsPage = fs.readFileSync(
  path.join(root, 'src/components/UserPlantsSection.vue'),
  'utf8'
)
const profilePage = fs.readFileSync(path.join(root, 'src/pages/profile/profile.vue'), 'utf8')
const questionPackagePage = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/question-package.vue'),
  'utf8'
)
const questionPackageContext = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/question-package/page-context.js'),
  'utf8'
)
const submit = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/question-package/question-submit.js'),
  'utf8'
)

assert.match(history, /DIAGNOSIS_HISTORY_QUERY_KEY/u)
assert.match(sharedKeys, /DIAGNOSIS_HISTORY_QUERY_KEY/u)
assert.match(mainPackageHistory, /diagnose-http\/diagnosis\/history/u)
assert.match(mainPackageHistory, /runVueQueryQuery/u)
assert.match(mainPackageHistory, /DIAGNOSIS_HISTORY_QUERY_KEY/u)
assert.match(history, /fetchDiagnosisHistoryQuery/u)
assert.match(history, /invalidateDiagnosisHistoryQueries/u)
assert.match(api, /fetchDiagnosisHistoryQuery\(page, pageSize, plantId\)/u)
assert.doesNotMatch(api, /from ['"]@\/subpackages\//u)
assert.match(diagnosisApi, /params\.sessionId/u)
assert.match(diagnosisApi, /fetchDiagnosisDetailQuery\(id\)/u)
assert.match(userPlantsPage, /clearPlantDiagnoseHistory/u)
assert.match(userPlantsPage, /plantDiagnoseHistory\[plant\.id\]/u)
assert.match(userPlantsPage, /togglePlantHistory/u)
assert.match(userPlantsPage, /garden-my-plants-history-toggle-\$\{plant\.id\}/u)
assert.match(userPlantsPage, /diagnosis-history-panel--collapsed/u)
assert.match(userPlantsPage, /diagnosis-history-item--visible/u)
assert.match(userPlantsPage, /diagnosis-history-chevron/u)
assert.match(profilePage, /onShow/u)
assert.match(profilePage, /diagnoseHistory\.value = \[\]/u)
assert.match(questionPackagePage, /QuestionPackageResult/u)
assert.match(questionPackageContext, /getDiagnosisResult\(\{ id: recordId \}\)/u)
assert.match(submit, /invalidateDiagnosisHistoryQueries/u)

console.log(
  'diagnosis history Vue Query contracts passed data_mode=unit_fake test_kind=source_contract'
)
