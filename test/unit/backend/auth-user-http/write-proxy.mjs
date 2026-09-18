import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=source_contract。只验证同环境代理边界，不发出网络请求。
const require = createRequire(import.meta.url)
const proxy = require('../../../../cloudfunctions/auth-user-http/write-proxy.js')

const oldEnv = {
  TCB_ENV: process.env.TCB_ENV,
  CLOUDBASE_ENV_ID: process.env.CLOUDBASE_ENV_ID,
  AUTH_USER_WRITE_PROXY_ORIGIN: process.env.AUTH_USER_WRITE_PROXY_ORIGIN
}

try {
  process.env.TCB_ENV = 'cloud1-qa'
  process.env.CLOUDBASE_ENV_ID = 'cloud1-qa'
  assert.equal(
    proxy._test.parseTrustedPublicOrigin('https://cloud1-qa-123.app.tcloudbase.com')?.hostname,
    'cloud1-qa-123.app.tcloudbase.com'
  )
  assert.equal(
    proxy._test.parseTrustedPublicOrigin('http://cloud1-qa-123.app.tcloudbase.com'),
    null
  )
  assert.equal(proxy._test.parseTrustedPublicOrigin('https://other.app.tcloudbase.com'), null)
  assert.equal(proxy._test.parseTrustedPublicOrigin('https://example.com'), null)
  assert.deepEqual(
    proxy._test.buildForwardHeaders(
      {
        authorization: 'Bearer identity-ticket',
        'x-planting-platform-session': 'session',
        host: 'untrusted.example',
        connection: 'close'
      },
      Buffer.from('{"action":"getUserByOpenid"}'),
      'cloud1-qa-123.app.tcloudbase.com'
    ),
    {
      authorization: 'Bearer identity-ticket',
      'x-planting-platform-session': 'session',
      host: 'cloud1-qa-123.app.tcloudbase.com',
      'x-auth-user-write-proxy': '1',
      'content-length': '28'
    }
  )
} finally {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

console.log('auth user write proxy contract passed data_mode=unit_fake test_kind=source_contract')
