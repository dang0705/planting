import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const weather = fs.readFileSync(
  path.join(root, 'src/subpackages/care/watering-advisor/useWateringAdvisorWeather.js'),
  'utf8'
)
const advisor = fs.readFileSync(
  path.join(root, 'src/subpackages/care/watering-advisor/watering-advisor.vue'),
  'utf8'
)
const catalog = fs.readFileSync(
  path.join(root, 'src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue'),
  'utf8'
)
const defaults = fs.readFileSync(path.join(root, 'src/composables/useDefaultPlants.js'), 'utf8')

assert.match(weather, /let requestVersion = 0/u)
assert.match(weather, /version !== requestVersion/u)
assert.match(weather, /getSelectionKey\(selectedCatalogPlant\.value\)/u)
assert.match(weather, /resetWeatherDays/u)
assert.match(weather, /clearWeather\(\)/u)
assert.match(advisor, /resetWeatherDays\(\)/gu)
assert.match(advisor, /if \(computing\.value\) \{[\s\S]*return/u)
assert.match(catalog, /onBeforeUnmount/u)
assert.match(catalog, /watering-advisor-catalog-retry/u)
assert.match(defaults, /error = ref\(''\)/u)
assert.match(defaults, /暂时无法加载植物列表/u)

console.log('watering advisor request race contracts passed data_mode=unit_fake test_kind=source_contract')
