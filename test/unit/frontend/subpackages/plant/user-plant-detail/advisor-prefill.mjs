// data_mode=unit_fake
// test_kind=source_contract
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = relative => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
const route = read('src/subpackages/plant/user-plant-detail/user-plant-detail.vue')
const form = read('src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue')

assert.match(route, /:initial-pot-profile="initialPotProfile"/u)
assert.match(route, /initialPotProfile\.value = decodeRouteJson\(options\?\.initialPotProfile\)/u)
assert.match(form, /initialPotProfile: \{ type: Object, default: null \}/u)
assert.match(form, /await initializeCatalogPlant\(\)\s*applyInitialPotProfile\(\)/u)
assert.match(form, /function applyInitialPotProfile\(\)[\s\S]*potProfile: \{ \.\.\.initialPotProfile \}/u)

console.log('advisor plant prefill source contract passed')
