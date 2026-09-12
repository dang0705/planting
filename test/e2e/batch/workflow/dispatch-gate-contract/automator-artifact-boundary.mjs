import assert from 'node:assert/strict'
import fs from 'node:fs'

const paths = [
  'test/e2e/automator/care/watering/transpiration-v3/_shared/lib/env.mjs',
  'test/e2e/automator/care/airflow/_shared/lib/env.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/runtime-core.mjs',
  'test/e2e/automator/care/watering/transpiration-v3/_shared/lib/request-capture.mjs',
  'scripts/qa/record-user-plant-environment.mjs'
]

for (const file of paths) {
  const source = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /\.e2e-artifacts/,
    `${file} must not default to the repository-owned .e2e-artifacts directory`
  )
}

const requestCapture = fs.readFileSync(paths[3], 'utf8')
assert.match(
  requestCapture,
  /uni\.request/,
  'request capture must cover the UniApp runtime transport'
)
assert.match(
  requestCapture,
  /wx\.request/,
  'request capture must retain native wx.request coverage'
)
assert.match(
  requestCapture,
  /transport/,
  'request evidence must identify the captured runtime transport'
)

console.log('Automator artifact boundary contract passed')
