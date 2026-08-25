import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pageSource = readFileSync(
  'src/subpackages/care/watering-advisor/watering-advisor.vue',
  'utf8'
)
const searchSource = readFileSync(
  'src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue',
  'utf8'
)

assert.match(searchSource, /import \{ onMounted, ref, watch \} from 'vue'/)
assert.match(searchSource, /const \{ plants,[\s\S]*load, loadNextPage \} = useDefaultPlants\(\)/)
assert.match(searchSource, /onMounted\(\(\) => \{[\s\S]*load\(''\)[\s\S]*\}\)/)
assert.match(
  pageSource,
  /function loadInitialCatalog\(\) \{[\s\S]*searchRef\.value\?\.loadPlants\(''\)/
)
assert.match(pageSource, /onShow\(\(\) => \{[\s\S]*loadInitialCatalog\(\)[\s\S]*\}\)/)

console.log('watering advisor catalog initial-load contract tests passed')
