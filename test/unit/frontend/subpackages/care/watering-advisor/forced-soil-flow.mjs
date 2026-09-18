// data_mode=unit_fake
// test_kind=source_contract
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = relative => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
const page = read('src/subpackages/care/watering-advisor/watering-advisor.vue')
const request = read('src/pages/index/components/watering-reminder-options.js')

assert.doesNotMatch(page, /hasVisibleWetSoil\(value\?\.review\)[\s\S]*?confirmWetSoilAdvice\(\)/u)
assert.doesNotMatch(page, /if \(!forceAdvice\) \{\s*await finishIndependentAdvisor\(\)\s*return/u)
assert.doesNotMatch(page, /soilEvidence\.value = \{ \.\.\.value, forced: true \}/u)
assert.match(page, /forced: soilEvidence\.value\.forced === true/u)
assert.match(page, /soilMoistureOverride: soilEvidence\.value\.soilMoistureOverride \|\| ''/u)
assert.match(page, /wateringEvents: soilEvidence\.value\.wateringEvents \|\| \[\]/u)
assert.match(page, /hasWateringHistoryInput: soilEvidence\.value\.hasWateringHistoryInput === true/u)
assert.match(page, /confirmSaveIndependentPlant\(\)/u)
assert.match(page, /buildAdvisorPlantCreateUrl\(/u)
assert.match(request, /forced: forced === true/u)
assert.match(request, /soilMoistureOverride: String\(soilMoistureOverride \|\| ''\)\.trim\(\)/u)
assert.match(request, /hasWateringHistoryInput: hasWateringHistoryInput === true/u)

console.log('wet soil planner flow source contract passed')
