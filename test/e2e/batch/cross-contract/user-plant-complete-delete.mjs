import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const deletionService = read('cloudfunctions/plant-user-http/plant-deletion-service.js')
const nativeMysql = read('cloudfunctions/layer/utils/native-mysql.js')
const app = read('cloudfunctions/plant-user-http/app.js')
const migration = read('scripts/sql/ensure-user-plant-complete-delete-20260828.sql')
const envExample = read('.env.local.example')

assert.match(nativeMysql, /mysql2\/promise/)
assert.match(nativeMysql, /beginTransaction\(\)/)
assert.match(nativeMysql, /connection\.rollback\(\)/)
assert.match(deletionService, /INFORMATION_SCHEMA\.COLUMNS/)
assert.match(deletionService, /WHERE id = \? AND _openid = \?/)
assert.match(deletionService, /user_plant_id/)
assert.match(deletionService, /plant_care_locations/)
assert.match(deletionService, /plant_images/)
assert.match(deletionService, /diagnosis_id IN/)
assert.match(deletionService, /session_id IN/)
assert.match(deletionService, /getCloudBase\(\)/)
assert.match(deletionService, /user_plant_file_deletion_jobs/)
assert.match(app, /deleteUserPlantCompletely\(\{ openid, plantId: id \}\)/)
assert.match(app, /cleanupPending/)
assert.match(migration, /CREATE TABLE IF NOT EXISTS `cloud1_dev`\.`user_plant_file_deletion_jobs`/)
assert.match(
  migration,
  /CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`\.`user_plant_file_deletion_jobs`/
)
assert.match(envExample, /DB_HOST=/)
assert.match(envExample, /DB_PASSWORD=/)
assert.doesNotMatch(envExample, /DB_PASSWORD=.+/)

console.log('complete user plant delete cross-contract tests passed')
