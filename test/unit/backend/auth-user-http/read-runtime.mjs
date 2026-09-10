import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=unit_logic。只验证本地签名和环境选择，不发出 HTTP 请求。
const require = createRequire(import.meta.url)
const oldEnv = {
  HTTP_IDENTITY_TICKET_SECRET: process.env.HTTP_IDENTITY_TICKET_SECRET,
  SESSION_TOKEN_SECRET: process.env.SESSION_TOKEN_SECRET,
  APP_ENV: process.env.APP_ENV,
  TCB_ENV_DEV: process.env.TCB_ENV_DEV,
  SQL_DATABASE_DEV: process.env.SQL_DATABASE_DEV,
  CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY: process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY
}

try {
  process.env.HTTP_IDENTITY_TICKET_SECRET = 'unit-http-ticket-secret-012345678901234567890123'
  process.env.SESSION_TOKEN_SECRET = 'unit-session-secret-012345678901234567890123'
  process.env.APP_ENV = 'development'
  process.env.TCB_ENV_DEV = 'cloud1-unit-dev'
  process.env.SQL_DATABASE_DEV = 'unit_schema'
  const runtime = require('../../../../cloudfunctions/auth-user-http/read-runtime.js')
  const ticket = runtime.createHttpIdentityTicket({
    openid: 'user_unit_1',
    uid: 'user_unit_1',
    customUserId: 'user_unit_1',
    subject: 'planting-user',
    platform: 'wechat_mp'
  })
  assert.match(ticket, /^planting-http-v1\./)
  assert.deepEqual(
    runtime.resolveHttpIdentityTicket({ 'x-planting-http-identity-ticket': ticket }),
    {
      openid: 'user_unit_1',
      uid: 'user_unit_1',
      customUserId: 'user_unit_1',
      userId: 'user_unit_1',
      subject: 'planting-user',
      platform: 'wechat_mp',
      source: 'signed-http-ticket'
    }
  )
  assert.equal(
    runtime.resolveHttpIdentityTicket({ 'x-planting-http-identity-ticket': `${ticket}x` }),
    null
  )
  assert.match(runtime.hashSessionToken('planting-session-v1_unit-session'), /^[a-f0-9]{64}$/)
  assert.equal(
    runtime.hasPlatformSessionMaterial({
      'x-planting-platform-session': 'planting-session-v1_unit-session'
    }),
    true
  )
  assert.equal(
    runtime.hasPlatformSessionMaterial({
      authorization: 'Bearer planting-session-v1_unit-session'
    }),
    true
  )
  assert.equal(
    runtime.hasPlatformSessionMaterial({ authorization: 'Bearer cloudbase-gateway-token' }),
    false
  )
  process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY = 'true'
  assert.deepEqual(runtime.resolveLocalFunctionUser({ 'x-openid': 'dev_terminal_mp_local' }), {
    openid: 'dev_terminal_mp_local',
    source: 'local-function-gateway'
  })
  assert.equal(
    runtime.hasPlatformSessionMaterial({ 'x-planting-platform-session': 'invalid-session' }),
    true
  )
  assert.deepEqual(
    runtime.getHttpRequestData({ httpMethod: 'GET' }, { httpContext: { url: '/auth/user?%zz=1' } })
      .query,
    { '%zz': '1' }
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

console.log('auth user read runtime tests passed data_mode=unit_fake test_kind=unit_logic')
