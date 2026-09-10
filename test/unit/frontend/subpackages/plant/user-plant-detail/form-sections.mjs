// data_mode=unit_fake
// test_kind=source_contract
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const formSource = read('src/subpackages/plant/user-plant-detail/components/PlantForm.vue')
const panelSource = read(
  'src/subpackages/plant/user-plant-detail/components/PlantInfoStepPanel.vue'
)
const selectionSource = read(
  'src/subpackages/plant/user-plant-detail/components/PlantSelectionStep.vue'
)
const pageSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)

// 新增和编辑必须共享同一份三段式表单骨架，不能因模式切换而出现整块布局漂移。
assert.match(formSource, /:id="`\$\{idPrefix\}-basic-info-section`"/)
assert.match(formSource, /:id="`\$\{idPrefix\}-care-info-section`"/)
assert.match(formSource, /:id="`\$\{idPrefix\}-pot-info-section`"/)
assert.match(formSource, />基本信息<\/text>/)
assert.match(formSource, />养护信息<\/text>/)
assert.match(formSource, />盆信息<\/text>/)
assert.match(
  formSource,
  /class="box-border flex w-full items-center rounded-xl border border-solid border-gray-300[^\"]*"[\s\S]*:id="`\$\{idPrefix\}-nickname-input`"[\s\S]*class="box-border min-w-0 flex-1 border-none/
)
assert.match(
  formSource,
  /class="box-border w-full rounded-xl border border-solid border-gray-300[^\"]*"[\s\S]*:id="`\$\{idPrefix\}-notes-input`"[\s\S]*class="box-border min-h-\[100px\] w-full border-none/
)

// 编辑页的环境入口仍然落在“养护信息”分区内，新增页则保留可直接填写的光照入口。
assert.match(formSource, /<slot name="care-settings" \/>/)
assert.match(
  panelSource,
  /<template #care-settings>[\s\S]*<slot name="after-form" \/>[\s\S]*<\/template>/
)
assert.match(pageSource, /:show-light-environment="!isEditMode && !restrictedPlatform"/)
assert.match(pageSource, /:show-photo="!restrictedPlatform"/)
assert.match(pageSource, /:show-pot-profile="!restrictedPlatform"/)
assert.match(selectionSource, /:id="`add-plant-card-\$\{plant\.id\}`"/)
assert.match(selectionSource, /@tap\.stop="handlePlantSelect\(plant\)"/)
assert.match(
  selectionSource,
  /function handlePlantSelect\(plant\) \{[\s\S]*emit\('select-plant', plant\)/
)
assert.match(
  pageSource,
  /function handlePlantSelect\(plant\) \{[\s\S]*selectedPlant\.value = plant[\s\S]*activeStep\.value = INFO_STEP/
)
assert.match(
  pageSource,
  /<template #after-form>[\s\S]*<PlantEnvironmentSettingsGroup[\s\S]*v-if="isEditMode && !restrictedPlatform"/
)

// 表单页必须只占用导航栏以下的视口；信息步骤的纵向滚动容器不能再使用整屏高度。
assert.match(
  pageSource,
  /class="box-border h-\[calc\(100vh-var\(--app-header-height\)\)\] min-h-0 bg-\[#f8faf9\]"/
)
assert.match(pageSource, /class="flex min-h-full items-center justify-center px-6"/)
assert.match(pageSource, /id="add-plant-swiper"[\s\S]*class="h-full min-h-0"/)
assert.match(
  pageSource,
  /<scroll-view id="add-plant-selection-scroll" scroll-y class="box-border h-full min-h-0">/
)
assert.match(panelSource, /:id="`\$\{idPrefix\}-info-scroll`"/)
assert.match(panelSource, /class="box-border flex h-full min-h-0 flex-col bg-\[#f8faf9\]"/)
assert.match(panelSource, /class="box-border min-h-0 flex-1 px-4 pb-4 pt-4"/)
assert.match(panelSource, /:id="`\$\{idPrefix\}-submit-bar`"/)
assert.match(
  panelSource,
  /class="box-border shrink-0 border-t border-\[#e1e9e3\] bg-\[#f8faf9\] px-4 pt-3"/
)
assert.match(panelSource, /:style="\{ paddingBottom: `\$\{bottomPadding\}px` \}"/)
assert.match(panelSource, /<\/scroll-view>[\s\S]*:id="`\$\{idPrefix\}-submit-bar`"/)
assert.match(panelSource, /bottomPadding: \{ type: Number, default: 48 \}/)
assert.doesNotMatch(panelSource, /class="h-screen[^\"]*"/)
assert.doesNotMatch(pageSource, /class="min-h-screen bg-\[#f8faf9\] pb-5"/)

console.log('user plant add/edit form section contract tests passed')
