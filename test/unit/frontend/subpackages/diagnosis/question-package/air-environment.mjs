import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/subpackages/diagnosis/question-package/AirEnvironmentQuestionInput.vue'
  ),
  'utf8'
)

assert.match(source, /<AirEnvironmentAssessment/)
assert.match(source, /layout-mode="single-page"/)
assert.match(source, /height-mode="content"/)
assert.match(source, /@complete="value => emit\('complete', value\)"/)

console.log('diagnose air-environment entry contract tests passed')
