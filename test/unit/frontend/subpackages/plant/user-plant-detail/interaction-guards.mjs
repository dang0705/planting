import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'),
  'utf8'
)
const detailViewSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'),
  'utf8'
)
const detailPageSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/user-plant-detail.vue'),
  'utf8'
)
assert.match(source, /const submitAction = createAsyncActionGuard\(\)/)
assert.match(source, /const potProfileAction = createAsyncActionGuard\(\)/)
assert.match(source, /const editFormDirty = ref\(false\)/)
assert.match(source, /onMounted\(\(\) => \{[\s\S]*initializeEditPage\(\)/)
assert.match(source, /onMounted\(\(\) => \{[\s\S]*loadPlants\(\)/)
assert.match(source, /function getCachedEditPlant\(\)/)
assert.match(source, /plantStore\.userPlantsScope !== scope/)
assert.match(source, /applyEditPlant\(cachedPlant, \{ hydrateForm: true \}\)/)
assert.match(source, /loading\.value = false\s*\n\s*\} else \{\s*\n\s*loading\.value = true/)
assert.match(source, /applyEditPlant\(plant, \{ hydrateForm: !editFormDirty\.value \}\)/)
assert.match(source, /function handleFormModelUpdate\(nextFormData\)/)
assert.match(source, /editFormDirty\.value = true\s*\n\s*\}\s*\n\s*formData\.value = nextFormData/)
assert.match(source, /最新信息暂未同步，可继续编辑现有信息/)
assert.match(source, /return submitAction\.run\(/)
assert.match(source, /return potProfileAction\.run\(/)
assert.match(source, /const debouncedLoadPlants = createDebounced/)
assert.match(source, /onBeforeUnmount\(\(\) => \{\s*debouncedLoadPlants\.cancel\(\)/)
assert.match(detailViewSource, /const wateringAction = createAsyncActionGuard\(\)/)
assert.match(detailViewSource, /:disabled="wateringAction\.isPending"/)
assert.match(detailViewSource, /const refreshed = await loadPlant\(\)/)
assert.match(detailViewSource, /已记录浇水，详情稍后更新/)
assert.match(detailViewSource, /id="user-plant-detail-inline-retry-button"/)
assert.match(detailViewSource, /id="user-plant-detail-retry-button"/)
assert.match(detailViewSource, /暂时无法加载植物信息，请稍后重试/)
assert.match(detailViewSource, /defineExpose\(\{ refresh: loadPlant \}\)/)
assert.match(detailViewSource, /let loadVersion = 0/)
assert.match(detailViewSource, /requestedPlantId !== plantId\.value/)
assert.match(detailViewSource, /watch\(plantId, \(nextId, previousId\)/)
assert.match(detailViewSource, /plant\.value = null\s*\n\s*loadError\.value = ''/)
assert.match(detailViewSource, /if \(!requestedPlantId\) \{[\s\S]*未找到这株植物的信息/)
assert.match(detailViewSource, /const date = parsePlantDateTime\(time\)/)
assert.match(detailViewSource, /const date = parsePlantDateTime\(dateString\)/)
assert.match(detailPageSource, /ref="viewRef"/)
assert.match(detailPageSource, /onShow\(\(\) => \{[\s\S]*viewRef\.value\?\.refresh\?\.\(\)/)

console.log(
  'user plant detail interaction guard contracts passed data_mode=unit_fake test_kind=source_contract'
)
