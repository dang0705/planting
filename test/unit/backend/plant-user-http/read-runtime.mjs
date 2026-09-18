import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

// data_mode=unit_fake; test_kind=unit_logic。仅覆盖本地身份解析和 URL 过滤，不发起网络请求。
const require = createRequire(import.meta.url)
const runtime = require('../../../../cloudfunctions/plant-user-http/read-runtime.js')
const oldEnv = {
  HTTP_IDENTITY_TICKET_SECRET: process.env.HTTP_IDENTITY_TICKET_SECRET,
  SESSION_TOKEN_SECRET: process.env.SESSION_TOKEN_SECRET,
  APP_ENV: process.env.APP_ENV,
  WECHAT_MINIPROGRAM_APP_ID: process.env.WECHAT_MINIPROGRAM_APP_ID,
  CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY: process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY,
  TCB_ENV_DEV: process.env.TCB_ENV_DEV,
  SQL_DATABASE_DEV: process.env.SQL_DATABASE_DEV
}

function createTicket({
  openid = 'user_unit_1',
  uid = '',
  subject = 'planting-user',
  platform = 'wechat_mp'
} = {}) {
  const issuedAt = Math.floor(Date.now() / 1_000)
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      ...(subject ? { subject } : {}),
      ...(platform ? { platform } : {}),
      openid,
      uid,
      issuedAt,
      expiresAt: issuedAt + 60
    })
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', process.env.HTTP_IDENTITY_TICKET_SECRET)
    .update(payload)
    .digest('base64url')
  return `planting-http-v1.${payload}.${signature}`
}

try {
  process.env.HTTP_IDENTITY_TICKET_SECRET = 'unit-http-ticket-secret-012345678901234567890123'
  process.env.SESSION_TOKEN_SECRET = 'unit-session-secret-012345678901234567890123'
  process.env.APP_ENV = 'development'
  process.env.WECHAT_MINIPROGRAM_APP_ID = 'wx-unit-app'
  process.env.TCB_ENV_DEV = 'cloud1-unit-dev'
  process.env.SQL_DATABASE_DEV = 'unit_schema'

  const ticket = createTicket({ uid: 'user-row-1' })
  assert.deepEqual(
    runtime._test.resolveHttpIdentityTicket({ 'x-planting-http-identity-ticket': ticket }),
    {
      openid: 'user_unit_1',
      uid: 'user-row-1',
      customUserId: '',
      userId: 'user-row-1',
      subject: 'planting-user',
      platform: 'wechat_mp',
      source: 'signed-http-ticket'
    }
  )
  assert.equal(
    runtime._test.resolveHttpIdentityTicket({ 'x-planting-http-identity-ticket': `${ticket}x` }),
    null
  )
  const legacyRuntimeTicket = createTicket({
    uid: 'cloudbase-runtime-user',
    subject: '',
    platform: ''
  })
  const legacyCanonicalTicket = createTicket({
    uid: 'legacy-user-row',
    subject: 'planting-user',
    platform: ''
  })
  assert.deepEqual(
    runtime._test.resolveHttpIdentityTicket({
      'x-planting-http-identity-ticket': legacyRuntimeTicket
    }),
    { openid: 'user_unit_1', source: 'signed-http-ticket' }
  )
  assert.deepEqual(
    await runtime.resolvePlantReadIdentity({
      'x-planting-http-identity-ticket': ticket,
      'x-wx-openid': 'wrong_runtime_openid',
      'x-wx-appid': 'wx-unit-app',
      'x-wx-source': 'wx'
    }),
    {
      openid: 'user_unit_1',
      uid: 'user-row-1',
      customUserId: '',
      userId: 'user-row-1',
      subject: 'planting-user',
      platform: 'wechat_mp',
      source: 'signed-http-ticket'
    }
  )
  assert.equal(
    await runtime.resolvePlantReadIdentity({
      'x-planting-http-identity-ticket': legacyRuntimeTicket,
      'x-wx-openid': 'wrong_runtime_openid',
      'x-wx-appid': 'wx-unit-app',
      'x-wx-source': 'wx'
    }),
    null,
    '旧版运行时票据不得直接决定植物归属'
  )
  assert.equal(
    await runtime.resolvePlantReadIdentity({
      'x-planting-http-identity-ticket': legacyCanonicalTicket
    }),
    null,
    '缺少平台字段的旧统一票据不得决定植物归属'
  )
  process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY = 'true'
  assert.deepEqual(
    await runtime.resolvePlantReadIdentity({ 'x-openid': 'dev_terminal_mp_local' }),
    {
      openid: 'dev_terminal_mp_local',
      source: 'local-function-gateway'
    }
  )
  assert.deepEqual(
    await runtime.resolvePlantReadIdentity(
      {
        'x-planting-platform-session': 'planting-session-v1_unit-session',
        'x-wx-openid': 'wrong_runtime_openid',
        'x-wx-appid': 'wx-unit-app',
        'x-wx-source': 'wx'
      },
      {
        runSql: async () => ({
          data: {
            executeResultList: [
              {
                user_id: 'unified-phone-user',
                platform: 'douyin_mp',
                storage_openid: 'unified-storage-owner'
              }
            ]
          }
        })
      }
    ),
    {
      openid: 'unified-storage-owner',
      userId: 'unified-phone-user',
      platform: 'douyin_mp',
      source: 'platform-session'
    }
  )
  assert.deepEqual(
    await runtime.resolvePlantReadIdentity(
      {
        authorization: 'Bearer planting-session-v1_unit-session',
        'x-planting-http-identity-ticket': ticket
      },
      {
        runSql: async () => ({
          data: {
            executeResultList: [
              {
                user_id: 'session-owner',
                platform: 'wechat_mp',
                storage_openid: 'session-storage-openid'
              }
            ]
          }
        })
      }
    ),
    {
      openid: 'session-storage-openid',
      userId: 'session-owner',
      platform: 'wechat_mp',
      source: 'platform-session'
    },
    '持久会话与票据同时存在时，植物归属必须以持久会话为准'
  )
  assert.match(
    runtime._test.hashSessionToken('planting-session-v1_unit-session'),
    /^[a-f0-9]{64}$/u
  )
  assert.equal(runtime._test.hashSessionToken('not-a-platform-session'), '')
  assert.equal(runtime.isRestrictedPlatform('douyin_mp'), true)
  assert.equal(runtime.isRestrictedPlatform('wechat_mp'), false)
} finally {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

console.log('plant user read runtime tests passed data_mode=unit_fake test_kind=unit_logic')
