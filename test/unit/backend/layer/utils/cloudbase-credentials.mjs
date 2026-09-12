import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cloudbase = require('../../../../../cloudfunctions/layer/utils/cloudbase.js')

const runtime = cloudbase.resolveCloudbaseCredentials({
  TENCENTCLOUD_SECRETID: 'runtime-id',
  TENCENTCLOUD_SECRETKEY: 'runtime-key',
  TENCENTCLOUD_SESSIONTOKEN: 'runtime-token'
})
assert.deepEqual(runtime, {
  secretId: 'runtime-id',
  secretKey: 'runtime-key',
  sessionToken: 'runtime-token'
})

const runtimeBeforeExplicit = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_SECRET_ID: 'configured-id',
  CLOUDBASE_SECRET_KEY: 'configured-key',
  TENCENTCLOUD_SECRETID: 'runtime-id',
  TENCENTCLOUD_SECRETKEY: 'runtime-key',
  TENCENTCLOUD_SESSIONTOKEN: 'runtime-token'
})
assert.deepEqual(runtimeBeforeExplicit, {
  secretId: 'runtime-id',
  secretKey: 'runtime-key',
  sessionToken: 'runtime-token'
})

const officialPriority = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_APIKEY: 'server-api-key',
  TENCENTCLOUD_SECRETID: 'runtime-id',
  TENCENTCLOUD_SECRETKEY: 'runtime-key',
  TENCENTCLOUD_SESSIONTOKEN: 'runtime-token'
})
assert.deepEqual(officialPriority, {
  secretId: 'runtime-id',
  secretKey: 'runtime-key',
  sessionToken: 'runtime-token'
})

const explicit = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_SECRET_ID: 'local-id',
  CLOUDBASE_SECRET_KEY: 'local-key',
  CLOUDBASE_TOKEN: 'local-token'
})
assert.deepEqual(explicit, {
  secretId: 'local-id',
  secretKey: 'local-key',
  sessionToken: 'local-token'
})

const apiKey = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_APIKEY: 'server-api-key',
})
assert.deepEqual(apiKey, { accessKey: 'server-api-key' })

const explicitBeforeApiKey = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_APIKEY: 'server-api-key',
  CLOUDBASE_SECRET_ID: 'configured-id',
  CLOUDBASE_SECRET_KEY: 'configured-key'
})
assert.deepEqual(explicitBeforeApiKey, {
  secretId: 'configured-id',
  secretKey: 'configured-key'
})

const initOptions = cloudbase.buildCloudbaseInitOptions(
  { environment: { TCB_ENV: 'cloud1_dev' } },
  {
    CLOUDBASE_ENV_ID: 'cloud1_dev',
    TENCENTCLOUD_SECRETID: 'runtime-id',
    TENCENTCLOUD_SECRETKEY: 'runtime-key',
    TENCENTCLOUD_SESSIONTOKEN: 'runtime-token'
  }
)
assert.equal(initOptions.env, 'cloud1_dev')
assert.equal(initOptions.secretId, 'runtime-id')
assert.equal(initOptions.secretKey, 'runtime-key')
assert.equal(initOptions.sessionToken, 'runtime-token')

const apiKeyInitOptions = cloudbase.buildCloudbaseInitOptions(
  { environment: { TCB_ENV: 'cloud1_dev' } },
  { CLOUDBASE_ENV_ID: 'cloud1_dev', CLOUDBASE_APIKEY: 'server-api-key' }
)
assert.equal(apiKeyInitOptions.accessKey, 'server-api-key')
assert.equal(apiKeyInitOptions.secretId, undefined)

assert.equal(cloudbase._test.resolveRequestPort(new URL('http://cloudbase.internal/admin')), 80)
assert.equal(cloudbase._test.resolveRequestPort(new URL('https://cloudbase.example/admin')), 443)
assert.equal(cloudbase._test.resolveRequestPort(new URL('http://cloudbase.internal:8080/admin')), 8080)
assert.equal(cloudbase._test.isRetryableRunSqlError({ code: 'ECONNRESET' }), true)
assert.equal(cloudbase._test.isRetryableRunSqlError(new Error('read ECONNRESET')), true)
assert.equal(cloudbase._test.isRetryableRunSqlError(new Error('SQL syntax error')), false)

console.log('cloudbase credential resolution tests passed')
