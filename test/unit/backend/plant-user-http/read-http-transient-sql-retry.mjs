import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=unit_logic。
// 只验证已被云端日志确认的 PE-MYS-5000 / SQLSTATE 08000 瞬态连接失败：
// 列表至多串行重试一次，详情和其他失败不改变原有语义。
const require = createRequire(import.meta.url)
const { _test: readTest } = require('../../../../cloudfunctions/plant-user-http/read-http.js')

function connectionError() {
  const error = new Error(
    'Parameter error.Run query failed, detailCode:SQLSTATE: 08000, detailMessage=Connection error'
  )
  error.code = 'PE-MYS-5000'
  error.requestId = 'sql-request-unit'
  return error
}

function successfulSqlResult() {
  return {
    data: {
      executeResultList: [
        {
          id: 7,
          total_count: 1,
          plant_id: 'plant-unit-7',
          canonical_name: '测试植物',
          source_type: 'catalog'
        }
      ]
    }
  }
}

assert.equal(readTest.isTransientCloudbaseSqlConnectionError(connectionError()), true)
assert.equal(
  readTest.isTransientCloudbaseSqlConnectionError(
    Object.assign(new Error('SQL syntax error'), { code: 'PE-MYS-5000' })
  ),
  false,
  '同一错误码但非连接错误不得被重试'
)

{
  const calls = []
  const marks = []
  const result = await readTest.listUserPlants(
    { openid: 'openid-unit', userId: 'user-unit' },
    1,
    50,
    { mark: (stage, details) => marks.push({ stage, details }) },
    null,
    {
      runSql: async (sql, params) => {
        calls.push({ sql, params })
        if (calls.length === 1) throw connectionError()
        return successfulSqlResult()
      }
    }
  )
  assert.equal(calls.length, 2, '列表只允许一次顺序重试')
  assert.deepEqual(calls[0], calls[1], '重试必须使用相同 SQL 与参数')
  assert.equal(result.total, 1)
  assert.deepEqual(result.list.map(item => item.id), [7])
  assert.equal(marks.filter(mark => mark.stage === 'list-sql-transient-retry').length, 1)
}

{
  let calls = 0
  await assert.rejects(
    () =>
      readTest.listUserPlants(
        { openid: 'openid-unit', userId: 'user-unit' },
        1,
        50,
        null,
        null,
        {
          runSql: async () => {
            calls += 1
            throw Object.assign(new Error('Unknown database failure'), { code: 'PE-MYS-5000' })
          }
        }
      ),
    { code: 'PE-MYS-5000' }
  )
  assert.equal(calls, 1, '非瞬态数据库错误必须直接失败')
}

{
  let calls = 0
  await assert.rejects(
    () =>
      readTest.listUserPlants(
        { openid: 'openid-unit', userId: 'user-unit' },
        1,
        1,
        null,
        7,
        {
          runSql: async () => {
            calls += 1
            throw connectionError()
          }
        }
      ),
    { code: 'PE-MYS-5000' }
  )
  assert.equal(calls, 1, '详情路径不得启用列表重试')
}

console.log('plant list transient SQL retry tests passed data_mode=unit_fake test_kind=unit_logic')
