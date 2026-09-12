import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const detailSource = fs.readFileSync(
  path.join(root, 'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'),
  'utf8'
)
const identifySource = fs.readFileSync(
  path.join(root, 'src/subpackages/plant/user-plant-detail/composables/useUserPlantIdentify.js'),
  'utf8'
)

assert.match(detailSource, /async function startDiagnosis\(\)/u)
assert.match(detailSource, /requireMvpAccess\(userStore, \{ source: 'plant_detail_diagnose' \}\)/u)
assert.match(identifySource, /requireMvpAccess\(userStore, \{[\s\S]*source: 'plant_identify'/u)
assert.match(identifySource, /requireMvpAccess\(userStore, \{ source: 'plant_identify_retry' \}\)/u)
assert.doesNotMatch(identifySource, /免费识别次数已用完/u)

console.log('plant detail paid access source contracts passed data_mode=unit_fake test_kind=source_contract')
