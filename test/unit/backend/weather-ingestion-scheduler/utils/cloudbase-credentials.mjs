import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildCloudBaseInitOptions,
  resolveCloudBaseCredentials
} = require('../../../../../cloudfunctions/weather-ingestion-scheduler/utils/cloudbase-credentials.js')

const runtime = resolveCloudBaseCredentials({
  CLOUDBASE_ENV_ID: 'cloud1_dev',
  CLOUDBASE_SECRET_ID: 'stale-id',
  CLOUDBASE_SECRET_KEY: 'stale-key',
  TENCENTCLOUD_SECRETID: 'runtime-id',
  TENCENTCLOUD_SECRETKEY: 'runtime-key',
  TENCENTCLOUD_SESSIONTOKEN: 'runtime-token'
})
assert.deepEqual(runtime, {
  secretId: 'runtime-id',
  secretKey: 'runtime-key',
  sessionToken: 'runtime-token'
})

const explicit = buildCloudBaseInitOptions({
  TCB_ENV: 'cloud1_dev',
  CLOUDBASE_SECRET_ID: 'local-id',
  CLOUDBASE_SECRET_KEY: 'local-key',
  CLOUDBASE_SESSION_TOKEN: 'local-token'
})
assert.deepEqual(explicit, {
  env: 'cloud1_dev',
  secretId: 'local-id',
  secretKey: 'local-key',
  sessionToken: 'local-token'
})

console.log('weather-ingestion-scheduler cloudbase credentials tests passed')
