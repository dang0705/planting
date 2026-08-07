import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const VALID_INPUT = {
  exchange: { source: 'window', direction: 'one', frequency: 'daily' },
  canopy: 'open',
  device: { mode: 'none', sources: [] }
}

function buildStoredProfile() {
  return {
    schemaVersion: 1,
    input: VALID_INPUT,
    locationBinding: { careLocationId: 'care_1', locationKey: 'sg_1' },
    updatedAt: '2026-08-04T08:00:00.000Z'
  }
}

function loadService({ selectRows = [], selectError = null, updateError = null } = {}) {
  const originalLoad = Module._load
  const servicePath =
    require.resolve('../../../../cloudfunctions/plant-user-http/air-environment-service.js')
  const calls = []
  delete require.cache[servicePath]
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return {
        models: {
          async $runSQL(sql, params) {
            calls.push({ sql, params })
            if (sql.includes('SELECT')) {
              if (selectError) {
                throw selectError
              }
              return { data: { executeResultList: selectRows } }
            }
            if (updateError) {
              throw updateError
            }
            return { data: { executeResultList: [] } }
          }
        }
      }
    }
    if (request === '/opt/utils/air-environment-evidence') {
      return {
        normalizeAirEnvironmentInput(input) {
          return input?.exchange && input?.canopy && input?.device ? input : null
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return { service: require(servicePath), calls }
  } finally {
    Module._load = originalLoad
    delete require.cache[servicePath]
  }
}

test('GET 空气资料按所属植物读取 JSON 列', async () => {
  const profile = buildStoredProfile()
  const { service, calls } = loadService({
    selectRows: [
      {
        id: 7,
        air_environment_json_text: JSON.stringify(profile),
        updated_at: '2026-08-04 16:00:00'
      }
    ]
  })
  const result = await service.readUserPlantAirEnvironment('openid_1', 7)
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.data, profile)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.openid, 'openid_1')
  assert.equal(calls[0].params.plantId, 7)
})

test('GET 在迁移未执行时降级为空资料，PATCH 返回可恢复错误', async () => {
  const missingColumn = new Error("Unknown column 'air_environment_json'")
  const getFixture = loadService({ selectError: missingColumn })
  const readResult = await getFixture.service.readUserPlantAirEnvironment('openid_1', 7)
  assert.deepEqual(readResult, {
    statusCode: 200,
    message: '空气环境暂未设置',
    data: null,
    schemaReady: false
  })

  const patchFixture = loadService({ selectError: missingColumn })
  const saveResult = await patchFixture.service.saveUserPlantAirEnvironment('openid_1', {
    plantId: 7,
    airEnvironment: VALID_INPUT,
    writeMode: 'if_missing'
  })
  assert.equal(saveResult.statusCode, 503)
  assert.equal(saveResult.schemaReady, false)
})

test('PATCH if_missing 创建资料，replace_if_match 拒绝过期草稿', async () => {
  const createFixture = loadService({ selectRows: [{ id: 7, air_environment_json_text: null }] })
  const createResult = await createFixture.service.saveUserPlantAirEnvironment('openid_1', {
    plantId: 7,
    airEnvironment: VALID_INPUT,
    locationBinding: { careLocationId: 'care_2', locationKey: 'sg_2' },
    writeMode: 'if_missing'
  })
  assert.equal(createResult.statusCode, 200)
  assert.equal(createFixture.calls.length, 2)
  assert.equal(createFixture.calls[1].params.openid, 'openid_1')
  assert.match(createFixture.calls[1].params.profileJson, /care_2/)

  const existing = buildStoredProfile()
  const conflictFixture = loadService({
    selectRows: [{ id: 7, air_environment_json_text: JSON.stringify(existing) }]
  })
  const conflictResult = await conflictFixture.service.saveUserPlantAirEnvironment('openid_1', {
    plantId: 7,
    airEnvironment: VALID_INPUT,
    writeMode: 'replace_if_match',
    expectedUpdatedAt: 'stale-value'
  })
  assert.equal(conflictResult.statusCode, 409)
  assert.deepEqual(conflictResult.data, existing)
  assert.equal(conflictFixture.calls.length, 1)
})
