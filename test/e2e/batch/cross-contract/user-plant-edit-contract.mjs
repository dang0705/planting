import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const TEST_PLANT_INSTANCE_ID = 321

function loadPlantKnowledge(runSQLImpl) {
  const originalLoad = Module._load
  const modulePath = require.resolve('../../../../cloudfunctions/layer/utils/plant-knowledge.js')
  delete require.cache[modulePath]
  const calls = []
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return {
        models: {
          $runSQL: async (sql, params = {}) => {
            calls.push({ sql, params })
            return runSQLImpl(sql, params, calls)
          }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return { mod: require('../../../../cloudfunctions/layer/utils/plant-knowledge.js'), calls }
  } finally {
    Module._load = originalLoad
    delete require.cache[modulePath]
  }
}

function buildUserPlantRow(overrides = {}) {
  return {
    id: TEST_PLANT_INSTANCE_ID,
    plant_id: null,
    plant_identity_id: '',
    session_plant_id: '',
    canonical_name: '',
    recognized_name: '绿萝',
    source_type: 'catalog',
    nickname: '窗边绿萝',
    location: '阳台',
    plant_date: null,
    notes: '',
    photos: null,
    created_at: '2026-07-16T01:02:03.000Z',
    ...overrides
  }
}

function createRunSQLMock() {
  return async sql => {
    if (/LAST_INSERT_ID/i.test(sql)) {
      return { data: { executeResultList: [{ insertId: TEST_PLANT_INSTANCE_ID }] } }
    }
    if (/FROM\s+user_watering_events/i.test(sql)) {
      return { data: { executeResultList: [] } }
    }
    if (/FROM\s+user_plant_instances\s+up/i.test(sql)) {
      return {
        data: {
          executeResultList: [
            buildUserPlantRow({
              plant_date: '2026-07-01',
              notes: '靠近南窗'
            })
          ]
        }
      }
    }
    return { data: { executeResultList: [] } }
  }
}

const { mod, calls } = loadPlantKnowledge(createRunSQLMock())

const created = await mod.createUserPlantInstance({
  openid: 'openid_edit_contract',
  recognizedName: '绿萝',
  nickname: '窗边绿萝',
  location: '阳台',
  plantDate: '2026-07-01',
  notes: '靠近南窗'
})
const insertCall = calls.find(call => /INSERT\s+INTO\s+user_plant_instances/i.test(call.sql))
assert.ok(insertCall, 'create should execute INSERT user_plant_instances')
assert.match(insertCall.sql, /plant_date/, 'create INSERT should include plant_date')
assert.match(insertCall.sql, /notes/, 'create INSERT should include notes')
assert.equal(insertCall.params.plantDate, '2026-07-01')
assert.equal(insertCall.params.notes, '靠近南窗')
assert.equal(Object.hasOwn(insertCall.params, 'createdAt'), false)
assert.equal(created.plantDate, '2026-07-01')
assert.equal(created.notes, '靠近南窗')

calls.length = 0
await mod.updateUserPlantInstance('openid_edit_contract', TEST_PLANT_INSTANCE_ID, {
  plantDate: '',
  notes: ''
})
const updateCall = calls.find(call => /UPDATE\s+user_plant_instances/i.test(call.sql))
assert.ok(updateCall, 'update should execute UPDATE user_plant_instances')
assert.match(updateCall.sql, /plant_date\s*=\s*NULLIF\(\{\{plantDate\}\},\s*''\)/)
assert.match(updateCall.sql, /notes\s*=\s*\{\{notes\}\}/)
assert.equal(updateCall.params.plantDate, '')
assert.equal(updateCall.params.notes, '')

calls.length = 0
await mod.listUserPlantInstances('openid_edit_contract')
const listCall = calls.find(call => /FROM\s+user_plant_instances\s+up/i.test(call.sql))
assert.match(listCall.sql, /up\.plant_date/, 'list SELECT should include plant_date')
assert.match(listCall.sql, /up\.notes/, 'list SELECT should include notes')

calls.length = 0
await mod.getUserPlantInstanceById('openid_edit_contract', TEST_PLANT_INSTANCE_ID)
const detailCall = calls.find(call => /FROM\s+user_plant_instances\s+up/i.test(call.sql))
assert.match(detailCall.sql, /up\.plant_date/, 'detail SELECT should include plant_date')
assert.match(detailCall.sql, /up\.notes/, 'detail SELECT should include notes')

const formModelSource = fs.readFileSync(
  'src/pages/add-plant/components/plant-form-model.js',
  'utf8'
)
assert.doesNotMatch(
  formModelSource,
  /plantDate:\s*formatDate\(plant\.plantDate\s*\|\|\s*plant\.createdAt\)/,
  'edit form must not use createdAt as plantDate fallback'
)

const storeSource = fs.readFileSync('src/store/plants.js', 'utf8')
assert.doesNotMatch(
  storeSource,
  /plantDate:\s*p\.plantDate\s*\|\|\s*p\.createdAt/,
  'store must not expose createdAt as plantDate fallback'
)

const mutationSource = fs.readFileSync('src/vue-query/plants/mutations/user-plants.js', 'utf8')
assert.match(mutationSource, /invalidateUserPlantsQuery/, 'mutations should invalidate user plants')

const editPageSource = fs.readFileSync('src/pages/edit-plant/edit-plant.vue', 'utf8')
assert.match(
  editPageSource,
  /invalidateUserPlantsQuery\(\)/,
  'edit page should refresh stale list cache'
)

const migration = fs.readFileSync('scripts/sql/add-user-plant-edit-fields-20260717.sql', 'utf8')
const migrationStatements = migration
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
assert.match(migration, /SET @dev_schema = 'cloud1_dev'/)
assert.match(migration, /SET @prod_schema = 'cloud1-2grufevs395a9d5e'/)
assert.match(migration, /SET @table_name = 'user_plant_instances'/)
assert.match(migration, /information_schema\.COLUMNS/)
assert.match(migration, /PREPARE\s+prod_stmt\s+FROM\s+@prod_sql/)
assert.match(migration, /PREPARE\s+dev_stmt\s+FROM\s+@dev_sql/)
assert.match(migration, /'ALTER TABLE `', @prod_schema, '`\.`', @table_name, '` '/)
assert.match(migration, /'ALTER TABLE `', @dev_schema, '`\.`', @table_name, '` '/)
assert.match(migration, /ADD COLUMN `plant_date` DATE NULL/)
assert.match(migration, /ADD COLUMN `notes` VARCHAR\(200\) NULL/)
assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS/i)
assert.doesNotMatch(migrationStatements, /\bUPDATE\b|\bDELETE\b|\bDROP\b/i)
