import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const guard = require('../../../../../cloudfunctions/layer/utils/cloudbase-env-update-guard.js')

const current = {
  CLOUDBASE_ENV_ID: 'cloud1_dev',
  CLOUDBASE_SECRET_ID: '__TEST_CLOUDBASE_SECRET_ID_A__',
  CLOUDBASE_SECRET_KEY: '__TEST_CLOUDBASE_SECRET_KEY_A__',
  QWEATHER_API_KEY: '__TEST_QWEATHER_API_KEY_A__',
  DB_HOST: 'db.example',
  DB_PASSWORD: '__TEST_DB_PASSWORD_A__'
}

const merged = guard.mergeFunctionEnv(current, { DB_HOST: 'db.internal' })
assert.equal(merged.CLOUDBASE_SECRET_ID, '__TEST_CLOUDBASE_SECRET_ID_A__')
assert.equal(merged.DB_HOST, 'db.internal')
assert.equal(Object.keys(merged).length, Object.keys(current).length)
assert.deepEqual(guard.assertSafeFunctionEnvUpdate(current, merged).ok, true)

assert.throws(
  () => guard.assertSafeFunctionEnvUpdate(current, { CLOUDBASE_ENV_ID: 'cloud1_dev' }),
  error => {
    assert.equal(error.code, 'CLOUDBASE_ENV_UPDATE_BLOCKED')
    assert.deepEqual(error.details.missingKeys.sort(), [
      'CLOUDBASE_SECRET_ID',
      'CLOUDBASE_SECRET_KEY',
      'DB_HOST',
      'DB_PASSWORD',
      'QWEATHER_API_KEY'
    ])
    assert.equal(String(error.message).includes('__TEST_CLOUDBASE_SECRET_ID_A__'), false)
    assert.equal(String(error.message).includes('__TEST_CLOUDBASE_SECRET_KEY_A__'), false)
    return true
  }
)

assert.throws(
  () =>
    guard.assertSafeFunctionEnvUpdate(
      current,
      { ...current, DB_PASSWORD: '__TEST_DB_PASSWORD_B__' },
      { allowReplace: [] }
    ),
  /敏感配置变更未显式批准.*DB_PASSWORD/
)

assert.throws(
  () =>
    guard.assertSafeFunctionEnvUpdate(
      current,
      {
        ...current,
        CLOUDBASE_SECRET_ID: '__TEST_CLOUDBASE_SECRET_ID_B__'
      },
      {
        allowReplace: ['CLOUDBASE_SECRET_ID']
      }
    ),
  /凭据成对变更不完整/
)

assert.equal(
  guard.assertSafeFunctionEnvUpdate(
    current,
    {
      ...current,
      CLOUDBASE_SECRET_ID: '__TEST_CLOUDBASE_SECRET_ID_B__',
      CLOUDBASE_SECRET_KEY: '__TEST_CLOUDBASE_SECRET_KEY_B__'
    },
    { allowReplace: ['CLOUDBASE_SECRET_ID', 'CLOUDBASE_SECRET_KEY'] }
  ).ok,
  true
)

assert.throws(
  () => guard.assertSafeFunctionEnvUpdate(current, { ...current, DB_PASSWORD: undefined }),
  /敏感配置变更未显式批准.*DB_PASSWORD/
)

assert.equal(
  guard.assertSafeFunctionEnvUpdate(
    [
      { Key: 'CLOUDBASE_ENV_ID', Value: 'cloud1_dev' },
      { Key: 'LOG_LEVEL', Value: 'info' }
    ],
    { CLOUDBASE_ENV_ID: 'cloud1_dev', LOG_LEVEL: 'debug' }
  ).ok,
  true
)

assert.equal(guard.isSensitiveEnvKey('QWEATHER_API_KEY'), true)
assert.equal(guard.isSensitiveEnvKey('LOG_LEVEL'), false)

console.log('cloudbase env update guard tests passed')
