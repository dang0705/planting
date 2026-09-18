import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/* oxlint-disable no-console -- source contract emits a concise result. */

// data_mode=unit_fake; test_kind=source_contract。真实页面回退后的组件存活与截图仍需 Automator 验证。
const repoRoot = process.cwd()
const gardenSource = fs.readFileSync(path.join(repoRoot, 'src/pages/garden/garden.vue'), 'utf8')
const userPlantsSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/UserPlantsSection.vue'),
  'utf8'
)

assert.match(
  gardenSource,
  /userPlantsRef\.value\?\.reload\(\{ showLoading: false, preserveDiagnosisHistory: true \}\)/u,
  '返回花园时刷新植物数据必须保留已打开的诊断历史'
)
assert.match(
  userPlantsSource,
  /async function reload\(options = \{\}\) \{[\s\S]*?if \(!options\.preserveDiagnosisHistory\) \{[\s\S]*?clearPlantDiagnoseHistory\(\)/u,
  'UserPlantsSection reload must clear history only for an explicit non-preserving reload'
)

console.log('garden diagnosis history state contract passed')
