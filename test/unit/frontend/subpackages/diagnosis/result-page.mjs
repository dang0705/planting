import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// data_mode=unit_fake; test_kind=source_contract。真实结果页面仍需目标小程序端上复验。
const pageSource = readFileSync('src/subpackages/diagnosis/question-package.vue', 'utf8')
const contextSource = readFileSync(
  'src/subpackages/diagnosis/question-package/page-context.js',
  'utf8'
)
const resultSource = readFileSync(
  'src/subpackages/diagnosis/question-package/QuestionPackageResult.vue',
  'utf8'
)
const pagesManifestSource = readFileSync('src/pages.json', 'utf8')

function collectVueFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name)
    return entry.isDirectory() ? collectVueFiles(filePath) : [filePath]
  })
}

const resultVueFiles = collectVueFiles('src/subpackages/diagnosis')
  .filter(filePath => filePath.endsWith('.vue'))
  .filter(filePath => /result|outcome/i.test(path.basename(filePath)))
  .map(filePath => filePath.replaceAll(path.sep, '/'))
  .sort()

assert.match(pageSource, /<QuestionPackageResult :result="result" :payload="payload" \/>/u)
assert.match(pageSource, /historyLoading/u)
assert.match(pageSource, /diagnose-question-package-history-retry/u)
assert.match(contextSource, /getDiagnosisResult\(\{ id: recordId \}\)/u)
assert.match(resultSource, /diagnose-question-package-result-outcomes/u)
assert.match(resultSource, /diagnose-question-package-result-action-advice/u)
assert.doesNotMatch(pageSource, /hasRouteConvergenceDetails|showNonProblemOutcomeResultCard/u)
assert.match(pagesManifestSource, /"path": "question-package"/u)
assert.match(pagesManifestSource, /"path": "flow"/u)
assert.doesNotMatch(pagesManifestSource, /"path": "result"/u)
assert.deepEqual(resultVueFiles, [
  'src/subpackages/diagnosis/question-package/QuestionPackageResult.vue'
])

console.log('single diagnosis result page contract passed')
