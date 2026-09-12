import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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
const indexPage = fs.readFileSync(path.join(root, 'src/pages/index/index.vue'), 'utf8')
const profilePage = fs.readFileSync(path.join(root, 'src/pages/profile/profile.vue'), 'utf8')
const resultPage = fs.readFileSync(path.join(root, 'src/subpackages/diagnosis/result.vue'), 'utf8')
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
assert.match(indexPage, /onShow/u)
assert.match(indexPage, /delete plantDiagnoseHistory\[key\]/u)
assert.match(profilePage, /onShow/u)
assert.match(profilePage, /diagnoseHistory\.value = \[\]/u)
assert.match(resultPage, /getDiagnosisResult\(\{ id \}\)/u)
assert.match(submit, /invalidateDiagnosisHistoryQueries/u)

console.log(
  'diagnosis history Vue Query contracts passed data_mode=unit_fake test_kind=source_contract'
)
