'use strict'

/**
 * user-plant-light-environment.js 真实行为测试 —— 浇水算法 v3。
 *
 * 本文件不是"仅用于加载的 mock stub"。它真正加载
 * cloudfunctions/layer/utils/user-plant-light-environment.js，
 * 通过拦截 /opt/utils/cloudbase 的 models.$runSQL 捕获 SQL 与参数，
 * 并断言模块的实际运行时行为：
 *   - SQL 使用 light_environment_json、id、_openid 三个核心字段
 *   - 参数绑定为目标 openid / Number(userPlantId)
 *   - JSON 字符串正确解析为对象
 *   - 已是对象时直接返回
 *   - 无记录返回 null
 *   - 非法 JSON 返回 null
 *   - 空字符串返回 null
 *   - 缺失 openid 或 userPlantId 时不查询直接返回 null
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`✓ ${name}`)
    } catch (error) {
      console.error(`✗ ${name}`)
      throw error
    }
  }
  console.log('user-plant-light-environment behavior tests passed')
}

/**
 * 用 mock 的 $runSQL 加载 user-plant-light-environment 模块。
 * 返回 { module, spy }，spy 捕获 SQL 与参数。
 */
function loadModuleWithCloudbaseMock(runSQLImpl) {
  const originalLoad = Module._load
  const modulePath =
    require.resolve('../../../cloudfunctions/layer/utils/user-plant-light-environment.js')
  delete require.cache[modulePath]
  const spy = { sql: null, params: null, callCount: 0 }
  Module._load = function patchedCloudbaseLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return {
        models: {
          $runSQL: async (sql, params) => {
            spy.sql = sql
            spy.params = params
            spy.callCount += 1
            return runSQLImpl(sql, params)
          }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const mod = require('../../../cloudfunctions/layer/utils/user-plant-light-environment.js')
    return { mod, spy }
  } finally {
    Module._load = originalLoad
    delete require.cache[modulePath]
  }
}

/* ============================================================
 * 1. SQL 契约断言
 * ============================================================ */

test('SQL 使用 light_environment_json、id、_openid 三个核心字段', async () => {
  const { mod, spy } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [] }
  }))
  await mod.getUserPlantLightEnvironment('openid_test', 42)
  assert.ok(spy.sql, '应捕获到 SQL')
  assert.match(spy.sql, /light_environment_json/, 'SQL 必须读取 light_environment_json 列')
  assert.match(spy.sql, /id\s*=\s*\{\{id\}\}/, 'SQL 必须使用 id = {{id}} 绑定')
  assert.match(
    spy.sql,
    /_openid\s*=\s*\{\{openid\}\}/,
    'SQL 必须使用 _openid = {{openid}} 权限绑定'
  )
  assert.match(spy.sql, /user_plant_instances/, 'SQL 必须从 user_plant_instances 表查询')
})

test('SQL 使用 CAST(light_environment_json AS CHAR) 避免类型问题', async () => {
  const { mod, spy } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [] }
  }))
  await mod.getUserPlantLightEnvironment('openid_test', 42)
  assert.match(
    spy.sql,
    /CAST\s*\(\s*light_environment_json\s+AS\s+CHAR\s*\)/i,
    'SQL 应使用 CAST(light_environment_json AS CHAR) 读取 JSON 列'
  )
})

/* ============================================================
 * 2. 参数绑定断言
 * ============================================================ */

test('参数绑定为目标 openid 与 userPlantId（id 转为 Number）', async () => {
  const { mod, spy } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [] }
  }))
  await mod.getUserPlantLightEnvironment('openid_alpha', '777')
  assert.deepEqual(
    spy.params,
    { openid: 'openid_alpha', id: 777 },
    '参数应绑定为目标 openid 与 Number(userPlantId)'
  )
})

test('数字 userPlantId 保持数字类型', async () => {
  const { mod, spy } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [] }
  }))
  await mod.getUserPlantLightEnvironment('openid_1', 100)
  assert.equal(spy.params.id, 100)
  assert.equal(typeof spy.params.id, 'number')
})

/* ============================================================
 * 3. 返回行为：JSON 字符串解析
 * ============================================================ */

test('JSON 字符串正确解析为结构化对象', async () => {
  const jsonStr = JSON.stringify({
    facing: 'south',
    windowType: 'standard',
    position: 'windowsill',
    hasDirectSun: true,
    distance: 30
  })
  const { mod } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [{ light_environment_json_text: jsonStr }] }
  }))
  const result = await mod.getUserPlantLightEnvironment('openid_1', 1)
  assert.deepEqual(result, {
    facing: 'south',
    windowType: 'standard',
    position: 'windowsill',
    hasDirectSun: true,
    distance: 30
  })
})

test('已是对象时直接返回同一引用', async () => {
  const obj = {
    facing: 'north',
    windowType: 'bay',
    position: 'floor',
    hasDirectSun: false,
    distance: 200
  }
  const { mod } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [{ light_environment_json_text: obj }] }
  }))
  const result = await mod.getUserPlantLightEnvironment('openid_1', 1)
  assert.equal(result, obj, '已是对象时直接返回同一引用')
})

/* ============================================================
 * 4. 返回行为：边界与异常
 * ============================================================ */

test('无记录返回 null', async () => {
  const { mod } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [] }
  }))
  const result = await mod.getUserPlantLightEnvironment('openid_1', 999)
  assert.equal(result, null, '无记录时应返回 null')
})

test('非法 JSON 返回 null', async () => {
  const { mod } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [{ light_environment_json_text: 'not-json{' }] }
  }))
  const result = await mod.getUserPlantLightEnvironment('openid_1', 1)
  assert.equal(result, null, '非法 JSON 应返回 null')
})

test('空字符串返回 null', async () => {
  const { mod } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [{ light_environment_json_text: '' }] }
  }))
  const result = await mod.getUserPlantLightEnvironment('openid_1', 1)
  assert.equal(result, null, '空字符串应返回 null')
})

test('null 值返回 null', async () => {
  const { mod } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [{ light_environment_json_text: null }] }
  }))
  const result = await mod.getUserPlantLightEnvironment('openid_1', 1)
  assert.equal(result, null, 'null 值应返回 null')
})

test('兼容未命名字段：fallback 到 light_environment_json', async () => {
  // 某些场景下可能直接返回 light_environment_json 字段（无 _text 后缀）
  const { mod } = loadModuleWithCloudbaseMock(async () => ({
    data: {
      executeResultList: [{ light_environment_json: '{"facing":"east"}' }]
    }
  }))
  const result = await mod.getUserPlantLightEnvironment('openid_1', 1)
  assert.deepEqual(result, { facing: 'east' })
})

/* ============================================================
 * 5. 前置检查：缺失参数不查询
 * ============================================================ */

test('缺失 openid 或 userPlantId 时不查询直接返回 null', async () => {
  const { mod, spy } = loadModuleWithCloudbaseMock(async () => ({
    data: { executeResultList: [] }
  }))
  const r1 = await mod.getUserPlantLightEnvironment('', 1)
  const r2 = await mod.getUserPlantLightEnvironment('openid_1', 0)
  const r3 = await mod.getUserPlantLightEnvironment(null, null)
  const r4 = await mod.getUserPlantLightEnvironment(undefined, undefined)
  assert.equal(r1, null)
  assert.equal(r2, null)
  assert.equal(r3, null)
  assert.equal(r4, null)
  assert.equal(spy.callCount, 0, '缺失参数时不应执行任何 SQL')
})

await runAll()
