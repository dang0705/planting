import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildCloudBaseInitOptions,
  resolveCloudBaseCredentials
} = require('../../../../../cloudfunctions/weather-ingestion-scheduler/utils/cloudbase-credentials.js')

const runtime = resolveCloudBaseCredentials({
  CLOUDBASE_ENV_ID: 'cloud1_dev',
  CLOUDBASE_SECRET_ID: '__TEST_STALE_SECRET_ID__',
  CLOUDBASE_SECRET_KEY: '__TEST_STALE_SECRET_KEY__',
  TENCENTCLOUD_SECRETID: '__TEST_RUNTIME_SECRET_ID__',
  TENCENTCLOUD_SECRETKEY: '__TEST_RUNTIME_SECRET_KEY__',
  TENCENTCLOUD_SESSIONTOKEN: '__TEST_RUNTIME_SESSION_TOKEN__'
})
assert.deepEqual(runtime, {
  secretId: '__TEST_RUNTIME_SECRET_ID__',
  secretKey: '__TEST_RUNTIME_SECRET_KEY__',
  sessionToken: '__TEST_RUNTIME_SESSION_TOKEN__'
})

const explicit = buildCloudBaseInitOptions({
  TCB_ENV: 'cloud1_dev',
  CLOUDBASE_SECRET_ID: '__TEST_LOCAL_SECRET_ID__',
  CLOUDBASE_SECRET_KEY: '__TEST_LOCAL_SECRET_KEY__',
  CLOUDBASE_SESSION_TOKEN: '__TEST_LOCAL_SESSION_TOKEN__'
})
assert.deepEqual(explicit, {
  env: 'cloud1_dev',
  secretId: '__TEST_LOCAL_SECRET_ID__',
  secretKey: '__TEST_LOCAL_SECRET_KEY__',
  sessionToken: '__TEST_LOCAL_SESSION_TOKEN__'
})

console.log('weather-ingestion-scheduler cloudbase credentials tests passed')
