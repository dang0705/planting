import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const cardSource = read('src/components/UserPlantAirEnvironmentCard.vue')
const detailSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'
)
const plantPageSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)
const panelSource = read(
  'src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue'
)
const submitSource = read('src/subpackages/plant/user-plant-detail/components/plant-submit.js')
const composableSource = read('src/composables/useUserPlantAirEnvironment.js')
const apiSource = read('src/api/plants-http.js')
const storeSource = read('src/store/plants.js')
const migrationSource = read('scripts/sql/add-user-plant-air-environment-20260804.sql')

// Arrange: 植物详情页和空气环境卡片必须使用同一份完整评估组件。
assert.match(
  cardSource,
  /import AirEnvironmentAssessment from '@\/components\/AirEnvironmentAssessment\.vue'/
)
assert.match(cardSource, /:model-value="draft"/)
assert.match(cardSource, /layout-mode="single-page"/)
assert.match(cardSource, /height-mode="content"/)
assert.match(cardSource, /@change="handleChange"/)
assert.match(cardSource, /@complete="save"/)
assert.match(cardSource, /:completion-id="`\$\{idPrefix\}-save`"/)
assert.match(cardSource, /panel-height="650"/)
assert.match(
  cardSource,
  /idPrefix: \{ type: String, default: 'user-plant-detail-air-environment' \}/
)

// Act: 卡片必须按当前用户植物实例读取，并把养护位置一起保存。
assert.match(cardSource, /airEnvironment\.load\(plant\.id, \{ preserveDraft: true \}\)/)
assert.match(
  cardSource,
  /airEnvironment\.save\(plantId, \{[\s\S]*careLocationId:[\s\S]*locationKey:/
)
assert.match(composableSource, /plantId: Number\(plantId\)/)
assert.match(
  composableSource,
  /locationBinding: normalizeAirEnvironmentLocationBinding\(locationBinding\)/
)
assert.match(apiSource, /plant-user-http\/user-plants\/air-environment/)

// Assert: 保存成功后本地用户植物对象必须立即拥有空气环境资料。
assert.match(
  composableSource,
  /plantStore\?\.applyAirEnvironmentLocal\?\.\(Number\(plantId\), response\.data\)/
)
assert.match(storeSource, /airEnvironment: p\.airEnvironment \|\| null/)
assert.match(storeSource, /applyAirEnvironmentLocal\(id, airEnvironment = null\)/)

// Assert: 植物详情页真正挂载组件，并传入当前植物，而不是独立临时评估页。
assert.match(
  detailSource,
  /import UserPlantAirEnvironmentCard from '@\/components\/UserPlantAirEnvironmentCard\.vue'/
)
assert.match(detailSource, /<UserPlantAirEnvironmentCard :plant="plant" \/>/)

// Assert: 编辑植物页面只保留环境条件入口，不再嵌入完整空气环境卡片。
assert.match(
  plantPageSource,
  /import PlantEnvironmentSettingsGroup from '@\/components\/PlantEnvironmentSettingsGroup\.vue'/
)
assert.match(
  plantPageSource,
  /<template #after-form>[\s\S]*<PlantEnvironmentSettingsGroup[\s\S]*:plant="currentPlant"[\s\S]*id-prefix="edit-plant-environment"/
)
assert.doesNotMatch(plantPageSource, /UserPlantAirEnvironmentCard/)
assert.match(plantPageSource, /:show-light-environment="!isEditMode"/)
assert.match(plantPageSource, /light: '\/subpackages\/care\/plant-environment\/light-environment'/)
assert.match(plantPageSource, /air: '\/subpackages\/care\/airflow\/index'/)
assert.match(plantPageSource, /plant-environment-saved/)
assert.match(panelSource, /<slot name="after-form" \/>/)
assert.match(panelSource, /:style="\{ paddingBottom: `\$\{bottomPadding\}px` \}"/)
assert.match(panelSource, /showLightEnvironment: \{ type: Boolean, default: true \}/)
assert.match(submitSource, /includeLightEnvironment = true/)
assert.match(plantPageSource, /includeLightEnvironment: false/)

// Assert: TDSQL 迁移使用可重复执行的字段检查，不依赖不兼容的 IF NOT EXISTS。
assert.match(migrationSource, /information_schema\.COLUMNS/)
assert.match(migrationSource, /air_environment_json/)
assert.match(migrationSource, /cloud1_dev/)
assert.match(migrationSource, /cloud1-2grufevs395a9d5e/)
const migrationStatements = migrationSource
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
assert.doesNotMatch(migrationStatements, /ADD COLUMN IF NOT EXISTS/i)

console.log('user plant air environment binding contract tests passed')
