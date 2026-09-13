import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cloudbase = require('../../../../../cloudfunctions/layer/utils/cloudbase.js')

const runtime = cloudbase.resolveCloudbaseCredentials({
  TENCENTCLOUD_SECRETID: '__TEST_RUNTIME_SECRET_ID__',
  TENCENTCLOUD_SECRETKEY: '__TEST_RUNTIME_SECRET_KEY__',
  TENCENTCLOUD_SESSIONTOKEN: '__TEST_RUNTIME_SESSION_TOKEN__'
})
assert.deepEqual(runtime, {
  secretId: '__TEST_RUNTIME_SECRET_ID__',
  secretKey: '__TEST_RUNTIME_SECRET_KEY__',
  sessionToken: '__TEST_RUNTIME_SESSION_TOKEN__'
})

const runtimeBeforeExplicit = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_SECRET_ID: '__TEST_CONFIGURED_SECRET_ID__',
  CLOUDBASE_SECRET_KEY: '__TEST_CONFIGURED_SECRET_KEY__',
  TENCENTCLOUD_SECRETID: '__TEST_RUNTIME_SECRET_ID__',
  TENCENTCLOUD_SECRETKEY: '__TEST_RUNTIME_SECRET_KEY__',
  TENCENTCLOUD_SESSIONTOKEN: '__TEST_RUNTIME_SESSION_TOKEN__'
})
assert.deepEqual(runtimeBeforeExplicit, {
  secretId: '__TEST_RUNTIME_SECRET_ID__',
  secretKey: '__TEST_RUNTIME_SECRET_KEY__',
  sessionToken: '__TEST_RUNTIME_SESSION_TOKEN__'
})

const officialPriority = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_APIKEY: '__TEST_SERVER_API_KEY__',
  TENCENTCLOUD_SECRETID: '__TEST_RUNTIME_SECRET_ID__',
  TENCENTCLOUD_SECRETKEY: '__TEST_RUNTIME_SECRET_KEY__',
  TENCENTCLOUD_SESSIONTOKEN: '__TEST_RUNTIME_SESSION_TOKEN__'
})
assert.deepEqual(officialPriority, {
  secretId: '__TEST_RUNTIME_SECRET_ID__',
  secretKey: '__TEST_RUNTIME_SECRET_KEY__',
  sessionToken: '__TEST_RUNTIME_SESSION_TOKEN__'
})

const explicit = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_SECRET_ID: '__TEST_LOCAL_SECRET_ID__',
  CLOUDBASE_SECRET_KEY: '__TEST_LOCAL_SECRET_KEY__',
  CLOUDBASE_TOKEN: '__TEST_LOCAL_TOKEN__'
})
assert.deepEqual(explicit, {
  secretId: '__TEST_LOCAL_SECRET_ID__',
  secretKey: '__TEST_LOCAL_SECRET_KEY__',
  sessionToken: '__TEST_LOCAL_TOKEN__'
})

const apiKey = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_APIKEY: '__TEST_SERVER_API_KEY__'
})
assert.deepEqual(apiKey, { accessKey: '__TEST_SERVER_API_KEY__' })

const explicitBeforeApiKey = cloudbase.resolveCloudbaseCredentials({
  CLOUDBASE_APIKEY: '__TEST_SERVER_API_KEY__',
  CLOUDBASE_SECRET_ID: '__TEST_CONFIGURED_SECRET_ID__',
  CLOUDBASE_SECRET_KEY: '__TEST_CONFIGURED_SECRET_KEY__'
})
assert.deepEqual(explicitBeforeApiKey, {
  secretId: '__TEST_CONFIGURED_SECRET_ID__',
  secretKey: '__TEST_CONFIGURED_SECRET_KEY__'
})

const initOptions = cloudbase.buildCloudbaseInitOptions(
  { environment: { TCB_ENV: 'cloud1_dev' } },
  {
    CLOUDBASE_ENV_ID: 'cloud1_dev',
    TENCENTCLOUD_SECRETID: '__TEST_RUNTIME_SECRET_ID__',
    TENCENTCLOUD_SECRETKEY: '__TEST_RUNTIME_SECRET_KEY__',
    TENCENTCLOUD_SESSIONTOKEN: '__TEST_RUNTIME_SESSION_TOKEN__'
  }
)
assert.equal(initOptions.env, 'cloud1_dev')
assert.equal(initOptions.secretId, '__TEST_RUNTIME_SECRET_ID__')
assert.equal(initOptions.secretKey, '__TEST_RUNTIME_SECRET_KEY__')
assert.equal(initOptions.sessionToken, '__TEST_RUNTIME_SESSION_TOKEN__')

const apiKeyInitOptions = cloudbase.buildCloudbaseInitOptions(
  { environment: { TCB_ENV: 'cloud1_dev' } },
  { CLOUDBASE_ENV_ID: 'cloud1_dev', CLOUDBASE_APIKEY: '__TEST_SERVER_API_KEY__' }
)
assert.equal(apiKeyInitOptions.accessKey, '__TEST_SERVER_API_KEY__')
assert.equal(apiKeyInitOptions.secretId, undefined)

assert.equal(cloudbase._test.resolveRequestPort(new URL('http://cloudbase.internal/admin')), 80)
assert.equal(cloudbase._test.resolveRequestPort(new URL('https://cloudbase.example/admin')), 443)
assert.equal(
  cloudbase._test.resolveRequestPort(new URL('http://cloudbase.internal:8080/admin')),
  8080
)
assert.equal(cloudbase._test.isRetryableRunSqlError({ code: 'ECONNRESET' }), true)
assert.equal(cloudbase._test.isRetryableRunSqlError(new Error('read ECONNRESET')), true)
assert.equal(cloudbase._test.isRetryableRunSqlError(new Error('SQL syntax error')), false)

console.log('cloudbase credential resolution tests passed')
