import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=unit_logic。验证 auth/user 读路径的瞬时 SQL 恢复边界，不发真实网络请求。
const require = createRequire(import.meta.url)
const { _test: readTest } = require('../../../../cloudfunctions/auth-user-http/read-http.js')

function connectionError() {
  const error = new Error(
    'Parameter error.Run query failed, Database connection failed, please check the corresponding database connection configuration'
  )
  error.code = 'InvalidParameter'
  error.requestId = 'sql-request-unit'
  return error
}

function successfulSqlResult() {
  return {
    data: {
      executeResultList: [{ _id: 'user-unit', username: '测试用户' }]
    }
  }
}

assert.equal(readTest.isTransientCloudbaseSqlConnectionError(connectionError()), true)
assert.equal(
  readTest.isTransientCloudbaseSqlConnectionError(
    Object.assign(new Error('Parameter error.SQL syntax error near SELECT'), {
      code: 'InvalidParameter'
    })
  ),
  false,
  '同一错误码但非连接错误不得被重试'
)

{
  const calls = []
  const marks = []
  const user = await readTest.readUserByField(
    '_id',
    'user-unit',
    { mark: (stage, details) => marks.push({ stage, details }) },
    async (sql, params) => {
      calls.push({ sql, params })
      if (calls.length === 1) {
        throw connectionError()
      }
      return successfulSqlResult()
    }
  )

  assert.equal(calls.length, 2, '瞬时连接失败后 auth/user 只允许一次顺序重试')
  assert.deepEqual(calls[0], calls[1], '重试必须使用相同 SQL 与参数')
  assert.equal(user._id, 'user-unit')
  assert.equal(marks.filter(mark => mark.stage === 'user-sql-transient-retry').length, 1)
}

{
  let calls = 0
  await assert.rejects(
    () =>
      readTest.readUserByField('_id', 'user-unit', null, async () => {
        calls += 1
        throw Object.assign(new Error('Parameter error.SQL syntax error near SELECT'), {
          code: 'InvalidParameter'
        })
      }),
    { code: 'InvalidParameter' }
  )
  assert.equal(calls, 1, '非瞬时参数/SQL 错误必须保持单次执行')
}

{
  let calls = 0
  await assert.rejects(
    () =>
      readTest.readUserByField('_id', 'user-unit', null, async () => {
        calls += 1
        throw connectionError()
      }),
    { code: 'InvalidParameter' }
  )
  assert.equal(calls, 2, '瞬时连接失败最多执行原请求加一次重试')
}

console.log('auth user transient SQL retry tests passed data_mode=unit_fake test_kind=unit_logic')
