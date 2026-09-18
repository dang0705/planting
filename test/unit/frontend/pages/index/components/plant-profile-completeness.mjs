import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// 产品期望：植物卡用颜色表达资料完整度，点击植物名打开状态说明，不把分数直接展示在卡片上。
const repoRoot = process.cwd()
const componentSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/PlantProfileCompleteness.vue'),
  'utf8'
)
const plantCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/PlantCard.vue'),
  'utf8'
)
const completenessSource = fs.readFileSync(
  path.join(repoRoot, 'src/utils/plant-profile-completeness.js'),
  'utf8'
)
const ACTIONABLE_STATUS_COUNT = 2

assert.match(componentSource, /<uni-popup[\s\S]*type="center"/)
assert.match(componentSource, /plant-profile-completeness-dialog/)
assert.match(componentSource, /v-for="status in statusLegend"/)
assert.match(componentSource, /@click\.stop="openDetails"/)
assert.match(componentSource, /defineExpose\(\{ open: openDetails \}\)/)
assert.doesNotMatch(componentSource, /\{\{ detail\.score \}\}分/)
assert.doesNotMatch(componentSource, /item\.earned|item\.max/)
assert.match(componentSource, /COMPLETE_SCORE_MIN = 90/)
assert.match(componentSource, /FAIRLY_COMPLETE_SCORE_MIN = 80/)
assert.match(componentSource, /INCOMPLETE_SCORE_MIN = 70/)
assert.match(componentSource, /color: '#2f6f4e'/)
assert.match(componentSource, /color: '#6aad7e'/)
assert.match(componentSource, /color: '#d4a017'/)
assert.match(componentSource, /color: '#d94f4f'/)
assert.match(
  componentSource,
  /description: '关键条件缺失，建议先补充资料，再继续获取更准确的诊断和养护建议。'/
)
assert.match(componentSource, /description: '建议先补充资料，否则暂不生成精细方案。'/)
assert.match(
  componentSource,
  /v-if="status\.key === scorePresentation\.key && status\.requiresProfileCompletion"/
)
assert.match(componentSource, /去完善/)
assert.match(componentSource, /@click\.stop="requestCompletion"/)
assert.match(componentSource, /defineEmits\(\['complete'\]\)/)
assert.match(componentSource, /plant-profile-completeness-complete-/)
assert.equal(
  (componentSource.match(/requiresProfileCompletion: true/g) || []).length,
  ACTIONABLE_STATUS_COUNT,
  'incomplete and unqualified statuses must both expose the completion entry'
)
assert.match(plantCardSource, /@complete="\$emit\('edit', plant\)"/)
assert.match(componentSource, /inactiveBackgroundColor: '#f3f5f4'/)
assert.match(componentSource, /inactiveBorderColor: '#cbd6ce'/)
assert.match(componentSource, /borderWidth: '2px'/)
assert.match(componentSource, /borderWidth: '1px'/)
assert.match(plantCardSource, /:id="`\$\{idPrefix\}-plant-card-name-\$\{plant\.id\}`"/)
assert.match(plantCardSource, /@click\.stop="openCompletenessDetails"/)

const expectedWeights = {
  identity: '10',
  careCity: '45',
  plantDate: '5',
  lightEnvironment: '10',
  airEnvironment: '15',
  potProfile: '15'
}

for (const [key, weight] of Object.entries(expectedWeights)) {
  assert.match(
    completenessSource,
    new RegExp(`${key}: ${weight}`),
    `${key} must retain its approved completeness weight`
  )
}
