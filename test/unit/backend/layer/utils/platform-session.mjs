import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const original = Object.fromEntries(
  ['PHONE_HASH_SECRET', 'PHONE_ENCRYPTION_KEY', 'PHONE_PROOF_SECRET', 'SESSION_TOKEN_SECRET'].map(
    key => [key, process.env[key]]
  )
)

try {
  process.env.PHONE_HASH_SECRET = 'unit-phone-hash-secret-012345678901234567890123'
  process.env.PHONE_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  process.env.PHONE_PROOF_SECRET = 'unit-phone-proof-secret-012345678901234567890123'
  process.env.SESSION_TOKEN_SECRET = 'unit-session-token-secret-012345678901234567890123'

  const platformSession = require('../../../../../cloudfunctions/layer/utils/platform-session.js')
  const proof = platformSession.createPhoneProof({
    platform: 'wechat_mp',
    appId: 'wx85bb3976301f75fb',
    platformUserId: 'wx_unit_owner',
    phone: '13800138000',
    countryCode: '+86'
  })
  assert.doesNotMatch(proof, /13800138000/, '手机号明文不得出现在客户端证明中')
  const verified = platformSession.verifyPhoneProof(proof)
  assert.equal(verified.platform, 'wechat_mp')
  assert.equal(verified.phoneMasked, '+86138****8000')
  assert.match(verified.phoneHash, /^[a-f0-9]{64}$/)
  assert.match(verified.nonce, /^[A-Za-z0-9_-]{16,128}$/)

  const sessionToken = platformSession.createSessionToken()
  assert.match(sessionToken, /^planting-session-v1_[A-Za-z0-9_-]+$/)
  assert.match(platformSession.hashSessionToken(sessionToken), /^[a-f0-9]{64}$/)

  assert.equal(platformSession.isBasicPlantCrudPath('/user-plants'), true)
  assert.equal(platformSession.isBasicPlantCrudPath('/user-plants/watering-planner'), false)
  assert.doesNotThrow(() =>
    platformSession.assertPlatformFeature({ platform: 'douyin_mp' }, '/identify/plant')
  )
  assert.throws(
    () => platformSession.assertPlatformFeature({ platform: 'xiaohongshu_mp' }, '/identify/plant'),
    error => error.code === 'PLATFORM_FEATURE_UNAVAILABLE' && error.statusCode === 403
  )
  assert.doesNotThrow(() =>
    platformSession.assertPlatformFeature({ platform: 'xiaohongshu_mp' }, '/user-plants')
  )
  assert.throws(
    () => platformSession.allowedManualPlantFields({ nickname: '绿萝', photos: ['file'] }),
    error => error.code === 'PLATFORM_PLANT_FIELDS_FORBIDDEN'
  )
  assert.deepEqual(
    platformSession.allowedManualPlantFields({
      nickname: '绿萝',
      notes: '窗边',
      sourceType: 'manual'
    }),
    {
      id: undefined,
      recordVersion: undefined,
      nickname: '绿萝',
      recognizedName: null,
      location: null,
      plantDate: null,
      notes: '窗边',
      sourceType: 'manual'
    }
  )

  // 持久会话必须同时保留业务用户 ID 与历史表存储归属键，
  // 这样手机号并入旧微信账户后，植物表无需批量改写即可继续可见。
  const platformSessionSource = require('node:fs').readFileSync(
    'cloudfunctions/layer/utils/platform-session.js',
    'utf8'
  )
  assert.match(platformSessionSource, /u\._openid AS storage_openid/)
  assert.match(platformSessionSource, /LEFT JOIN users u ON BINARY u\._id = BINARY s\.user_id/)
  assert.match(
    platformSessionSource,
    /openid: String\(session\.storage_openid \|\| session\.user_id\)/
  )

  const resolvedSession = await platformSession.resolvePersistentSession({
    token: sessionToken,
    models: {
      $runSQL: async () => ({
        data: {
          executeResultList: [
            {
              user_id: 'user_business',
              storage_openid: 'legacy_storage_openid',
              platform: 'douyin_mp',
              app_id: 'tt_unit_app',
              expires_at: Date.now() + 60_000,
              revoked_at: null
            }
          ]
        }
      })
    }
  })
  assert.equal(resolvedSession.openid, 'legacy_storage_openid')
  assert.equal(resolvedSession.userId, 'user_business')
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log('platform session utility tests passed')
