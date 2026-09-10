import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const guard = require('../../../../../cloudfunctions/layer/utils/cloudbase-env-update-guard.js')

const current = {
  CLOUDBASE_ENV_ID: 'cloud1_dev',
  CLOUDBASE_SECRET_ID: 'id-a',
  CLOUDBASE_SECRET_KEY: 'key-a',
  QWEATHER_API_KEY: 'weather-a',
  DB_HOST: 'db.example',
  DB_PASSWORD: 'db-password-a'
}

const merged = guard.mergeFunctionEnv(current, { DB_HOST: 'db.internal' })
assert.equal(merged.CLOUDBASE_SECRET_ID, 'id-a')
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
    assert.equal(String(error.message).includes('id-a'), false)
    assert.equal(String(error.message).includes('key-a'), false)
    return true
  }
)

assert.throws(
  () =>
    guard.assertSafeFunctionEnvUpdate(
      current,
      { ...current, DB_PASSWORD: 'db-password-b' },
      { allowReplace: [] }
    ),
  /敏感配置变更未显式批准.*DB_PASSWORD/
)

assert.throws(
  () =>
    guard.assertSafeFunctionEnvUpdate(
      current,
      { ...current, CLOUDBASE_SECRET_ID: 'id-b' },
      {
        allowReplace: ['CLOUDBASE_SECRET_ID']
      }
    ),
  /凭据成对变更不完整/
)

assert.equal(
  guard.assertSafeFunctionEnvUpdate(
    current,
    { ...current, CLOUDBASE_SECRET_ID: 'id-b', CLOUDBASE_SECRET_KEY: 'key-b' },
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
