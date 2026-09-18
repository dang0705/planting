import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=unit_logic。验证列表读请求的瞬态 SQL 恢复边界，不发真实网络请求。
const require = createRequire(import.meta.url)
const retry = require('../../../../cloudfunctions/plant-user-http/read-sql-retry.js')

function errorWith(code, message) {
  return Object.assign(new Error(message), { code })
}

assert.equal(
  retry.isTransientCloudbaseSqlConnectionError(errorWith('econnreset', 'socket reset')),
  true
)
assert.equal(
  retry.isTransientCloudbaseSqlConnectionError(
    errorWith('CLOUDBASE_SQL_TIMEOUT', 'CloudBase SQL 读取超时')
  ),
  true
)
assert.equal(
  retry.isTransientCloudbaseSqlConnectionError(
    errorWith('CLOUDBASE_SQL_HTTP_503', 'Service unavailable')
  ),
  true
)
assert.equal(retry.isTransientCloudbaseSqlConnectionError(errorWith('', 'socket hang up')), true)
assert.equal(
  retry.isTransientCloudbaseSqlConnectionError(
    errorWith('PE-MYS-5000', 'SQLSTATE: 08000, detailMessage=Connection error')
  ),
  true
)
assert.equal(
  retry.isTransientCloudbaseSqlConnectionError(
    errorWith('PE-MYS-5000', 'SQL syntax error near SELECT')
  ),
  false
)
assert.equal(
  retry.isTransientCloudbaseSqlConnectionError(
    errorWith('CLOUDBASE_SQL_HTTP_500', 'internal server error')
  ),
  false
)

{
  let calls = 0
  let retryCode = ''
  const result = await retry.runWithOneTransientRetry(
    async () => {
      calls += 1
      if (calls === 1) {
        throw errorWith('ECONNRESET', 'socket reset')
      }
      return 'ok'
    },
    {
      delayMs: 0,
      onRetry: error => {
        retryCode = error.code
      }
    }
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
  assert.equal(retryCode, 'ECONNRESET')
}

{
  let calls = 0
  await assert.rejects(
    () =>
      retry.runWithOneTransientRetry(
        async () => {
          calls += 1
          throw errorWith('SQL_SYNTAX', 'syntax error')
        },
        { delayMs: 0 }
      ),
    { code: 'SQL_SYNTAX' }
  )
  assert.equal(calls, 1)
}

console.log('plant SQL retry policy tests passed data_mode=unit_fake test_kind=unit_logic')
