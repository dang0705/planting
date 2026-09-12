import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const groupSource = read('src/components/PlantEnvironmentSettingsGroup.vue')
const routeSource = read('src/subpackages/plant/user-plant-detail/user-plant-detail.vue')
const plantPageSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)
const detailSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'
)
const plantFormSource = read('src/subpackages/plant/user-plant-detail/components/PlantForm.vue')
const potEditorSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantPotProfileEditor.vue'
)
const plantInfoPanelSource = read(
  'src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue'
)
const lightPageSource = read('src/subpackages/care/plant-environment/light-environment.vue')
const airPageSource = read('src/subpackages/care/airflow/index.vue')
const plantSubmitSource = read('src/subpackages/plant/user-plant-detail/components/plant-submit.js')
const plantKnowledgeSource = read('cloudfunctions/layer/utils/plant-knowledge.js')
const plantUserHttpSource = read('cloudfunctions/plant-user-http/app.js')
const pagesSource = read('src/pages.json')

assert.match(groupSource, /环境条件/)
assert.match(groupSource, /:id="`\$\{idPrefix\}-light-entry`"/)
assert.match(groupSource, /:id="`\$\{idPrefix\}-air-entry`"/)
assert.match(groupSource, /emit\('open', 'light'\)/)
assert.match(groupSource, /emit\('open', 'air'\)/)
assert.match(plantFormSource, /<view v-if="showLightEnvironment">[\s\S]*<LightEnvironmentPicker/)
assert.match(plantFormSource, /:id="`\$\{idPrefix\}-basic-info-section`"/)
assert.match(plantFormSource, /:id="`\$\{idPrefix\}-care-info-section`"/)
assert.match(plantFormSource, /:id="`\$\{idPrefix\}-pot-info-section`"/)
assert.match(plantFormSource, />基本信息<\/text>/)
assert.match(plantFormSource, />养护信息<\/text>/)
assert.match(plantFormSource, />盆信息<\/text>/)
assert.match(
  plantFormSource,
  /class="box-border flex w-full items-center rounded-xl border border-solid border-gray-300[\s\S]*nickname-input[\s\S]*class="box-border min-w-0 flex-1 border-none/
)
assert.match(
  plantFormSource,
  /class="box-border w-full rounded-xl border border-solid border-gray-300[\s\S]*notes-input[\s\S]*class="box-border min-h-\[100px\] w-full border-none/
)
assert.match(plantFormSource, /open-pot-profile/)
assert.match(plantFormSource, /pot-profile-button/)
assert.match(plantInfoPanelSource, /open-pot-profile/)
assert.match(
  plantInfoPanelSource,
  /<template #care-settings>[\s\S]*<slot name="after-form" \/>[\s\S]*<\/template>/
)
assert.match(plantPageSource, /UserPlantPotProfileEditor/)
assert.match(plantPageSource, /patchUserPlant\(\{ id: Number\(plantId\.value\), \.\.\.profile \}\)/)
assert.match(potEditorSource, /PotProfileFormCore/)
assert.match(potEditorSource, /confirmOversizedPot/)

assert.match(routeSource, /mode = ref\('create'\)/)
assert.match(routeSource, /normalizeMode\(options\?\.mode, plantId\.value\)/)
assert.match(routeSource, /mode === 'view'/)
assert.match(plantPageSource, /<PlantInfoStepPanel/)
assert.match(plantPageSource, /PlantEnvironmentSettingsGroup/)
assert.match(plantPageSource, /fetchUserPlant\(Number\(plantId\.value\)\)/)
assert.match(plantPageSource, /const response = await createUserPlant\(requestPayload\)/)
assert.match(plantPageSource, /patchUserPlant\(\{ id: Number\(plantId\.value\)/)
assert.match(plantPageSource, /returnTo=user-plant-detail/)
assert.match(plantPageSource, /:show-light-environment="!isEditMode && !restrictedPlatform"/)
assert.match(plantPageSource, /:show-back="!isEditMode"/)
assert.match(detailSource, /mode=edit&id=/)
assert.match(
  plantPageSource,
  /class="box-border h-\[calc\(100vh-var\(--app-header-height\)\)\] min-h-0 bg-\[#f8faf9\]"/
)
assert.match(plantPageSource, /id="add-plant-swiper"[\s\S]*class="h-full min-h-0"/)
assert.match(
  plantPageSource,
  /<scroll-view id="add-plant-selection-scroll" scroll-y class="box-border h-full min-h-0">/
)
assert.match(plantInfoPanelSource, /:id="`\$\{idPrefix\}-info-scroll`"/)
assert.match(plantInfoPanelSource, /class="box-border flex h-full min-h-0 flex-col bg-\[#f8faf9\]"/)
assert.match(plantInfoPanelSource, /class="box-border min-h-0 flex-1 px-4 pb-4 pt-4"/)
assert.match(plantInfoPanelSource, /:id="`\$\{idPrefix\}-submit-bar`"/)
assert.match(
  plantInfoPanelSource,
  /class="box-border shrink-0 border-t border-\[#e1e9e3\] bg-\[#f8faf9\] px-4 pt-3"/
)
assert.match(plantInfoPanelSource, /:style="\{ paddingBottom: `\$\{bottomPadding\}px` \}"/)
assert.match(plantInfoPanelSource, /<\/scroll-view>[\s\S]*:id="`\$\{idPrefix\}-submit-bar`"/)
assert.match(plantInfoPanelSource, /bottomPadding: \{ type: Number, default: 48 \}/)

assert.match(
  lightPageSource,
  /import LightEnvironmentPicker from '@\/components\/LightEnvironmentPicker\.vue'/
)
assert.match(lightPageSource, /id="plant-light-environment-complete-button"/)
assert.match(lightPageSource, /patchUserPlant\(\{ id, lightEnvironment:/)
assert.match(lightPageSource, /fetchUserPlant\(id\)/)
assert.match(lightPageSource, /kind: 'light'/)
assert.match(lightPageSource, /getOpenerEventChannel/)

assert.match(
  airPageSource,
  /import AirEnvironmentAssessment from '@\/components\/AirEnvironmentAssessment\.vue'/
)
assert.match(airPageSource, /plant-air-environment-complete-button/)
assert.match(airPageSource, /patchUserPlant\(\{[\s\S]*airEnvironment: input/)
assert.match(airPageSource, /fetchUserPlant\(id\)/)
assert.match(airPageSource, /kind: 'air'/)
assert.match(airPageSource, /getOpenerEventChannel/)
assert.match(airPageSource, /height-mode="content"/)

assert.match(plantSubmitSource, /payload\.airEnvironment = formData\.airEnvironment \|\| null/)
assert.match(
  plantSubmitSource,
  /payload\.potTopDiameterCm = potProfile\.potTopDiameterCm \|\| null/
)
assert.match(plantSubmitSource, /includePotProfile = true/)
assert.match(
  plantUserHttpSource,
  /airEnvironment: Object\.prototype\.hasOwnProperty\.call\(request\.body/
)
assert.match(plantUserHttpSource, /potTopDiameterCm: request\.body\.potTopDiameterCm/)
assert.match(plantKnowledgeSource, /air_environment_json/)
assert.match(plantKnowledgeSource, /airEnvironment: parseAirEnvironmentProfile/)
assert.match(plantKnowledgeSource, /pot_top_diameter_cm, pot_bottom_diameter_cm, pot_height_cm/)
assert.match(plantKnowledgeSource, /INSERT INTO user_plant_instances[\s\S]+pot_profile_source/)

assert.match(
  pagesSource,
  /"root": "subpackages\/plant"[\s\S]*"path": "user-plant-detail\/user-plant-detail"/
)
assert.match(pagesSource, /"root": "subpackages\/care"[\s\S]*"path": "airflow\/index"/)
assert.doesNotMatch(pagesSource, /pages\/add-plant\/add-plant/)
assert.doesNotMatch(pagesSource, /pages\/plant-detail\/plant-detail/)
assert.doesNotMatch(pagesSource, /pages\/edit-plant\/edit-plant/)

console.log('unified add/edit plant environment entry flow contract tests passed')
