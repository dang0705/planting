import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const imageSource = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/diagnose-flow/images.js'),
  'utf8'
)
const popupSource = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/diagnose-flow/popup-actions.js'),
  'utf8'
)

for (const source of [imageSource, popupSource]) {
  assert.match(source, /requireMvpAccess/u)
  assert.match(source, /await requireMvpAccess\(userStore, \{ source: 'diagnose_flow_/u)
  assert.doesNotMatch(source, /免费诊断次数已用完/u)
}

console.log('diagnosis paid access source contracts passed data_mode=unit_fake test_kind=source_contract')
