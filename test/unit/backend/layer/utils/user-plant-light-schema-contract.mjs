import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(
  'scripts/sql/add-user-plant-light-environment-20260623.sql',
  'utf8'
)
const plantKnowledge = fs.readFileSync('cloudfunctions/layer/utils/plant-knowledge.js', 'utf8')
const plantUserApp = fs.readFileSync('cloudfunctions/plant-user-http/app.js', 'utf8')

assert.match(migration, /ALTER TABLE [`"]?cloud1_dev[`"]?\.[`"]?user_plant_instances[`"]?/)
assert.match(migration, /ADD COLUMN [`"]?light_environment_json[`"]? JSON NULL/)
assert.match(plantKnowledge, /light_environment_json/)
assert.match(plantKnowledge, /lightEnvironment/)
assert.match(plantKnowledge, /CAST\(up\.light_environment_json AS CHAR\)/)
assert.match(plantUserApp, /lightEnvironment/)

console.log('user plant light schema contract tests passed')
