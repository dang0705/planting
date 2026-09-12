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

assert.match(searchSource, /import \{ onBeforeUnmount, onMounted, ref, watch \} from 'vue'/)
assert.match(
  searchSource,
  /const \{ plants,[\s\S]*load, loadNextPage \}[\s\S]*useDefaultPlants\(\)/
)
assert.match(searchSource, /error, load, loadNextPage/)
assert.match(searchSource, /id="watering-advisor-catalog-error"/)
assert.match(searchSource, /id="watering-advisor-catalog-retry"/)
assert.match(searchSource, /onBeforeUnmount\(\(\) => \{[\s\S]*clearTimeout\(searchTimer\)/)
assert.match(searchSource, /onMounted\(\(\) => \{[\s\S]*load\(''\)[\s\S]*\}\)/)
assert.match(
  pageSource,
  /function loadInitialCatalog\(\) \{[\s\S]*searchRef\.value\?\.loadPlants\(''\)/
)
assert.match(pageSource, /let hasShownOnce = false/)
assert.match(
  pageSource,
  /onShow\(\(\) => \{[\s\S]*if \(!hasShownOnce\) \{[\s\S]*hasShownOnce = true[\s\S]*return[\s\S]*\}[\s\S]*loadInitialCatalog\(\)[\s\S]*\}\)/
)

console.log('watering advisor catalog initial-load contract tests passed')
