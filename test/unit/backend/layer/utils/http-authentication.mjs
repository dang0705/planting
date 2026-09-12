import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const secret = 'unit-test-http-identity-ticket-secret-0123456789'
const originalTicketSecret = process.env.HTTP_IDENTITY_TICKET_SECRET
const originalLocalGateway = process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY
const originalWechatAppId = process.env.WECHAT_MINIPROGRAM_APP_ID

try {
  process.env.HTTP_IDENTITY_TICKET_SECRET = secret
  process.env.WECHAT_MINIPROGRAM_APP_ID = 'wx_unit_appid'
  delete process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY

  const {
    createHttpIdentityTicket,
    resolveHttpUserInfo
  } = require('../../../../../cloudfunctions/layer/utils/http.js')
  const {
    resolveHttpIdentityTicket
  } = require('../../../../../cloudfunctions/layer/utils/http-identity-ticket.js')

  const ticket = createHttpIdentityTicket({
    openid: 'wx_unit_user',
    uid: 'unit_uid',
    subject: 'planting-user',
    platform: 'wechat_mp'
  })
  assert.match(ticket, /^planting-http-v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.equal(
    createHttpIdentityTicket({
      openid: 'wx_unit_user',
      subject: 'planting-user',
      platform: 'wechat_mp'
    }),
    '',
    '统一用户票据必须携带稳定 userId'
  )
  assert.equal(
    createHttpIdentityTicket({
      openid: 'wx_unit_user',
      uid: 'unit_uid',
      subject: 'planting-user'
    }),
    '',
    '统一用户票据必须携带受支持的平台'
  )

  const ticketUser = await resolveHttpUserInfo(
    { authorization: `Bearer ${ticket}` },
    { skipAuth: true, openid: 'attacker_openid' },
    null,
    { allowRuntimeIdentity: true, allowSignedHttpIdentityTicket: true }
  )
  assert.equal(ticketUser?.openid, 'wx_unit_user')
  assert.equal(ticketUser?.uid, 'unit_uid')
  assert.equal(ticketUser?.userId, 'unit_uid')
  assert.equal(ticketUser?.source, 'signed-http-ticket')

  // 没有统一用户 subject 的旧票据即使签名有效，也只能表示运行时 openid，
  // 不能作为植物数据归属，避免旧票据把数据切到错误账号。
  const legacyTicket = createHttpIdentityTicket({
    openid: 'wx_unit_user',
    uid: 'legacy_uid',
    platform: 'wechat_mp'
  })
  const legacyTicketIdentity = resolveHttpIdentityTicket({
    authorization: `Bearer ${legacyTicket}`
  })
  assert.equal(legacyTicketIdentity?.openid, 'wx_unit_user')
  assert.equal(legacyTicketIdentity?.userId, undefined)
  assert.equal(legacyTicketIdentity?.subject, undefined)
  assert.equal(
    await resolveHttpUserInfo({ authorization: `Bearer ${legacyTicket}` }, {}, null, {
      allowSignedHttpIdentityTicket: true
    }),
    null,
    '旧格式票据不得作为统一用户业务归属'
  )

  // 同一运行时 openid 在不同平台必须落到各自的统一用户和平台语义，
  // 防止跨平台会话串号。
  const wechatTicket = createHttpIdentityTicket({
    openid: 'same_runtime_openid',
    uid: 'wechat_uid',
    subject: 'planting-user',
    platform: 'wechat_mp'
  })
  const douyinTicket = createHttpIdentityTicket({
    openid: 'same_runtime_openid',
    uid: 'douyin_uid',
    subject: 'planting-user',
    platform: 'douyin_mp'
  })
  const wechatIdentity = resolveHttpIdentityTicket({
    authorization: `Bearer ${wechatTicket}`
  })
  const douyinIdentity = resolveHttpIdentityTicket({
    authorization: `Bearer ${douyinTicket}`
  })
  assert.equal(wechatIdentity?.userId, 'wechat_uid')
  assert.equal(wechatIdentity?.platform, 'wechat_mp')
  assert.equal(douyinIdentity?.userId, 'douyin_uid')
  assert.equal(douyinIdentity?.platform, 'douyin_mp')
  assert.notEqual(wechatIdentity?.userId, douyinIdentity?.userId)
  assert.notEqual(wechatIdentity?.platform, douyinIdentity?.platform)

  const nowSeconds = Math.floor(Date.now() / 1000)
  const originalDateNow = Date.now
  let expiredTicket
  try {
    Date.now = () => (nowSeconds - 3600) * 1000
    expiredTicket = createHttpIdentityTicket({
      openid: 'wx_expired_user',
      uid: 'expired_uid',
      subject: 'planting-user',
      platform: 'wechat_mp'
    })
  } finally {
    Date.now = originalDateNow
  }
  assert.equal(
    resolveHttpIdentityTicket({ authorization: `Bearer ${expiredTicket}` }),
    null,
    '过期统一用户票据必须被拒绝'
  )

  const headerTicketUser = await resolveHttpUserInfo(
    { 'x-planting-http-identity-ticket': ticket },
    { skipAuth: true, openid: 'attacker_openid' },
    null
  )
  assert.equal(headerTicketUser, null)

  const nativeGatewayUser = await resolveHttpUserInfo(
    {
      authorization: 'Bearer cloudbase-sdk-managed-credential',
      'x-planting-http-identity-ticket': ticket
    },
    {},
    null
  )
  assert.equal(nativeGatewayUser, null)

  const runtimeHeaderUser = await resolveHttpUserInfo(
    {
      'x-wx-openid': 'wx_runtime_user',
      'x-wx-appid': 'wx_unit_appid',
      'x-wx-source': 'wx_devtools'
    },
    {},
    null
  )
  assert.equal(runtimeHeaderUser, null)
  const allowedRuntimeHeaderUser = await resolveHttpUserInfo(
    {
      'x-wx-openid': 'wx_runtime_user',
      'x-wx-appid': 'wx_unit_appid',
      'x-wx-source': 'wx_devtools'
    },
    {},
    null,
    { allowRuntimeIdentity: true }
  )
  assert.equal(allowedRuntimeHeaderUser?.openid, 'wx_runtime_user')
  assert.equal(allowedRuntimeHeaderUser?.source, 'cloudbase-runtime-header')

  const tamperedTicket = `${ticket.slice(0, -1)}${ticket.endsWith('A') ? 'B' : 'A'}`
  assert.equal(
    await resolveHttpUserInfo({ authorization: `Bearer ${tamperedTicket}` }),
    null,
    '篡改后的票据不得通过验签'
  )

  assert.equal(
    await resolveHttpUserInfo({ 'x-wx-openid': 'victim_openid' }, { skipAuth: true }),
    null,
    '生产路径不得信任客户端 openid 头或 skipAuth'
  )
  assert.equal(
    await resolveHttpUserInfo(
      {
        'x-wx-openid': 'wx_runtime_user',
        'x-wx-appid': 'attacker_appid',
        'x-wx-source': 'wx_devtools'
      },
      {},
      null,
      { allowRuntimeIdentity: true }
    ),
    null,
    'appid 不匹配时不得信任微信身份头'
  )
  assert.equal(
    await resolveHttpUserInfo({ 'x-planting-http-identity-ticket': tamperedTicket }),
    null,
    '篡改后的身份票据请求头不得通过验签'
  )

  process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY = 'true'
  const localUser = await resolveHttpUserInfo({ 'x-openid': 'dev_terminal_mp_local' }, {}, null, {
    allowRuntimeIdentity: true
  })
  assert.equal(localUser?.openid, 'dev_terminal_mp_local')
  assert.equal(localUser?.source, 'local-function-gateway')
} finally {
  if (originalTicketSecret === undefined) {
    delete process.env.HTTP_IDENTITY_TICKET_SECRET
  } else {
    process.env.HTTP_IDENTITY_TICKET_SECRET = originalTicketSecret
  }
  if (originalLocalGateway === undefined) {
    delete process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY
  } else {
    process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY = originalLocalGateway
  }
  if (originalWechatAppId === undefined) {
    delete process.env.WECHAT_MINIPROGRAM_APP_ID
  } else {
    process.env.WECHAT_MINIPROGRAM_APP_ID = originalWechatAppId
  }
}

console.log('http authentication boundary tests passed')
