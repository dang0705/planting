'use strict'

const crypto = require('crypto')

let models
try {
  models = require('/opt/utils/cloudbase').models
} catch {
  models = require('./cloudbase').models
}

let platformSession
try {
  platformSession = require('/opt/utils/platform-session')
} catch {
  platformSession = require('./platform-session')
}

const {
  createPlatformError,
  createPhoneProof,
  createSessionToken,
  hashPhone,
  hashSessionToken,
  maskPhone,
  normalizeAppId,
  sessionExpiresAt,
  verifyPhoneProof
} = platformSession

let platformPhoneVerifiers
try {
  platformPhoneVerifiers = require('/opt/utils/platform-phone-verifiers')
} catch {
  platformPhoneVerifiers = require('./platform-phone-verifiers')
}

const { verifyDouyinPhoneAuthorization, verifyXhsPhoneAuthorization } = platformPhoneVerifiers

const PLATFORM_APP_IDS = {
  wechat_mp: String(process.env.WECHAT_MINIPROGRAM_APP_ID || '').trim(),
  douyin_mp: 'tt79ef0f52e78e857401',
  xiaohongshu_mp: '69b9576cdb45760001d82e15'
}

function rows(result) {
  return result?.data?.executeResultList || []
}

function getConfiguredPlatformAppId(platform) {
  const appId = normalizeAppId(PLATFORM_APP_IDS[platform])
  if (!appId) {
    throw createPlatformError('平台登录配置未完成，请稍后再试', 'PLATFORM_AUTH_NOT_CONFIGURED', 503)
  }
  return appId
}

function assertNoClientIdentityFields(data = {}) {
  const forbidden = [
    'openid',
    'openId',
    'unionid',
    'unionId',
    'phoneNumber',
    'purePhoneNumber',
    'countryCode',
    'platformUserId',
    'appId',
    'appid',
    'sessionKey',
    'session_key'
  ]
  const received = forbidden.find(key => Object.prototype.hasOwnProperty.call(data || {}, key))
  if (received) {
    throw createPlatformError('请使用平台授权凭据登录', 'PLATFORM_CLIENT_IDENTITY_REJECTED', 400)
  }
}

function userResponse(user = {}) {
  const maskedPhone = String(
    user.phone_masked || maskPhone(user.phoneNumber, user.phone_country_code || '+86') || ''
  ).trim()
  const {
    password: _password,
    phone_ciphertext: _ciphertext,
    phone_hash: _hash,
    phoneNumber: _legacyPhoneNumber,
    ...safe
  } = user
  return {
    ...safe,
    phoneNumber: maskedPhone,
    phoneMasked: maskedPhone
  }
}

function hashPhoneProofNonce(nonce) {
  return crypto
    .createHash('sha256')
    .update(String(nonce || ''))
    .digest('hex')
}

async function issueSession({ userId, platform, appId, proofNonce, now = Date.now() }) {
  if (!proofNonce) {
    throw createPlatformError('手机号授权凭据无效，请重新授权', 'PLATFORM_PHONE_PROOF_INVALID', 401)
  }
  const token = createSessionToken()
  const expiresAt = sessionExpiresAt(now)
  try {
    await models.$runSQL(
      `INSERT INTO user_sessions (
        session_id, token_hash, phone_proof_hash, user_id, platform, app_id, expires_at, created_at, updated_at
      ) VALUES (
        {{sessionId}}, {{tokenHash}}, {{phoneProofHash}}, {{userId}}, {{platform}}, {{appId}}, {{expiresAt}}, {{now}}, {{now}}
      )`,
      {
        sessionId: `ups_${now}_${Math.random().toString(36).slice(2, 12)}`,
        tokenHash: hashSessionToken(token),
        phoneProofHash: hashPhoneProofNonce(proofNonce),
        userId,
        platform,
        appId,
        expiresAt,
        now
      }
    )
  } catch (error) {
    if (/duplicate|uk_user_sessions_phone_proof_hash/i.test(String(error?.message || ''))) {
      throw createPlatformError(
        '手机号授权已使用，请重新授权',
        'PLATFORM_PHONE_PROOF_CONSUMED',
        409
      )
    }
    throw error
  }
  return { accessToken: token, expiresAt }
}

async function resolveUserForVerifiedPhone({
  platform,
  appId,
  platformUserId,
  phoneHash,
  phoneCiphertext,
  phoneMasked,
  verifiedPhone = '',
  verifiedCountryCode = '+86',
  now = Date.now()
}) {
  let isNewUser = false
  const identityRows = rows(
    await models.$runSQL(
      `SELECT identity_id, user_id, phone_hash
         FROM user_platform_identities
        WHERE platform = {{platform}} AND app_id = {{appId}} AND platform_user_id = {{platformUserId}}
        LIMIT 1`,
      { platform, appId, platformUserId }
    )
  )
  const phoneRows = rows(
    await models.$runSQL('SELECT * FROM users WHERE phone_hash = {{phoneHash}} LIMIT 1', {
      phoneHash
    })
  )
  const identity = identityRows[0] || null
  let phoneUser = phoneRows[0] || null
  if (!phoneUser && verifiedPhone) {
    const legacyPhoneRows = rows(
      await models.$runSQL(
        `SELECT * FROM users
          WHERE phoneNumber = {{verifiedPhone}}
          LIMIT 20`,
        { verifiedPhone }
      )
    ).filter(
      row => hashPhone(row.phoneNumber, row.phone_country_code || '+86') === phoneHash
    )
    if (legacyPhoneRows.length > 1) {
      throw createPlatformError(
        '手机号关联到多个历史账户，请联系客服处理',
        'PLATFORM_PHONE_ACCOUNT_CONFLICT',
        409
      )
    }
    phoneUser = legacyPhoneRows[0] || null
  }
  if (identity?.user_id && phoneUser?._id && String(identity.user_id) !== String(phoneUser._id)) {
    throw createPlatformError(
      '平台身份与手机号归属冲突，请联系客服处理',
      'PLATFORM_IDENTITY_PHONE_CONFLICT',
      409
    )
  }

  let user = phoneUser
  if (!user && identity?.user_id) {
    const identityUsers = rows(
      await models.$runSQL('SELECT * FROM users WHERE _id = {{userId}} LIMIT 1', {
        userId: identity.user_id
      })
    )
    user = identityUsers[0] || null
    if (user?.phone_hash && String(user.phone_hash) !== phoneHash) {
      throw createPlatformError(
        '平台身份与手机号归属冲突，请联系客服处理',
        'PLATFORM_IDENTITY_PHONE_CONFLICT',
        409
      )
    }
  }

  if (!user) {
    isNewUser = true
    const userId = generateId()
    try {
      await models.$runSQL(
        `INSERT INTO users (
          _id, _openid, principal_platform, principal_openid,
          wechat_openid, wechat_unionid, douyin_openid, xiaohongshu_openid, union_id,
          username, email, phoneNumber, phone_country_code, phone_bind_platform, phone_bind_source,
          phone_hash, phone_ciphertext, phone_masked, phone_verified_at,
          subscription_plan, subscription_status, subscription_startDate, subscription_endDate,
          usage_diagnoseToday, usage_diagnoseTotal, usage_identifyToday, usage_identifyTotal, usage_lastResetDate,
          isActive, createdAt, updatedAt
        ) VALUES (
          {{userId}}, {{ownerUserId}}, {{platform}}, {{platformUserId}},
          NULL, NULL, NULL, NULL, NULL,
          {{username}}, NULL, NULL, {{verifiedCountryCode}}, {{platform}}, 'platform_authorization',
          {{phoneHash}}, {{phoneCiphertext}}, {{phoneMasked}}, {{now}},
          'free', 'active', {{now}}, {{now}},
          0, 0, 0, 0, {{now}}, 1, {{now}}, {{now}}
        )`,
        {
          userId,
          ownerUserId: userId,
          platform,
          platformUserId,
          verifiedCountryCode,
          username: '青花植用户',
          phoneHash,
          phoneCiphertext,
          phoneMasked,
          now
        }
      )
      user = {
        _id: userId,
        _openid: userId,
        principal_platform: platform,
        principal_openid: platformUserId,
        username: '青花植用户',
        phone_masked: phoneMasked,
        phone_verified_at: now
      }
    } catch (error) {
      if (!/duplicate|uk_users_phone_hash/i.test(String(error?.message || ''))) {
        throw error
      }
      const concurrentRows = rows(
        await models.$runSQL('SELECT * FROM users WHERE phone_hash = {{phoneHash}} LIMIT 1', {
          phoneHash
        })
      )
      user = concurrentRows[0] || null
      if (!user) {
        throw error
      }
      isNewUser = false
    }
  } else {
    await models.$runSQL(
      `UPDATE users SET
         phone_hash = {{phoneHash}}, phone_ciphertext = {{phoneCiphertext}}, phone_masked = {{phoneMasked}},
         phone_verified_at = {{now}}, phoneNumber = NULL,
         phone_bind_platform = {{platform}}, phone_bind_source = 'platform_authorization',
         profile_lastLoginAt = {{now}}, updatedAt = {{now}}
       WHERE _id = {{userId}}`,
      { phoneHash, phoneCiphertext, phoneMasked, platform, now, userId: user._id }
    )
    user = {
      ...user,
      phone_hash: phoneHash,
      phone_ciphertext: phoneCiphertext,
      phone_masked: phoneMasked
    }
  }

  await models.$runSQL(
    `INSERT INTO user_platform_identities (
      identity_id, _openid, user_id, platform, app_id, openid, platform_user_id,
      phone_snapshot, phone_hash, is_primary, verified_at, createdAt, updatedAt
    ) VALUES (
      {{identityId}}, {{userId}}, {{userId}}, {{platform}}, {{appId}}, {{platformUserId}}, {{platformUserId}},
      '', {{phoneHash}}, 0, {{now}}, {{now}}, {{now}}
    ) ON DUPLICATE KEY UPDATE
      user_id = IF(user_id = VALUES(user_id), VALUES(user_id), user_id),
      _openid = IF(user_id = VALUES(user_id), VALUES(_openid), _openid),
      phone_hash = VALUES(phone_hash), verified_at = VALUES(verified_at), updatedAt = VALUES(updatedAt)`,
    {
      identityId:
        identity?.identity_id || `upi_${platform}_${crypto.randomBytes(9).toString('hex')}`,
      userId: user._id,
      platform,
      appId,
      platformUserId,
      phoneHash,
      now
    }
  )
  return { user, isNewUser }
}

function assertWechatProofMatchesIdentity(proof, identity) {
  const expectedAppId = normalizeAppId(PLATFORM_APP_IDS.wechat_mp)
  if (
    proof.platform !== 'wechat_mp' ||
    !expectedAppId ||
    proof.appId !== expectedAppId ||
    (identity?.openid && proof.platformUserId !== identity.openid)
  ) {
    throw createPlatformError(
      '微信手机号授权与当前登录身份不一致，请重新授权',
      'PLATFORM_AUTH_MISMATCH',
      401
    )
  }
}

async function platformPhoneLogin({ platform, data, resolvedIdentity = null }) {
  let verified
  if (platform === 'wechat_mp') {
    const proof = verifyPhoneProof(data.phoneProof)
    assertWechatProofMatchesIdentity(proof, resolvedIdentity)
    verified = {
      platform,
      appId: proof.appId,
      platformUserId: proof.platformUserId,
      phoneHash: proof.phoneHash,
      phoneCiphertext: proof.phoneCiphertext,
      phoneMasked: proof.phoneMasked,
      proofNonce: proof.nonce
    }
  } else {
    const result =
      platform === 'douyin_mp'
        ? await verifyDouyinPhoneAuthorization(data, { appIds: PLATFORM_APP_IDS })
        : await verifyXhsPhoneAuthorization(data, { appIds: PLATFORM_APP_IDS })
    const proof = createPhoneProof(result)
    const verifiedProof = verifyPhoneProof(proof)
    verified = {
      platform: result.platform,
      appId: result.appId,
      platformUserId: result.platformUserId,
      phoneHash: verifiedProof.phoneHash,
      phoneCiphertext: verifiedProof.phoneCiphertext,
      phoneMasked: verifiedProof.phoneMasked,
      verifiedPhone: result.phone,
      verifiedCountryCode: result.countryCode,
      proofNonce: verifiedProof.nonce
    }
  }
  const now = Date.now()
  const resolved = await resolveUserForVerifiedPhone({ ...verified, now })
  const session = await issueSession({
    userId: resolved.user._id,
    platform: verified.platform,
    appId: verified.appId,
    proofNonce: verified.proofNonce,
    now
  })
  const safeUser = userResponse(resolved.user)
  if (verified.platform === 'wechat_mp') {
    safeUser.wechat_openid = verified.platformUserId
  }
  return { user: safeUser, session, isNewUser: resolved.isNewUser }
}

function generateId() {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

module.exports = {
  PLATFORM_APP_IDS,
  assertNoClientIdentityFields,
  getConfiguredPlatformAppId,
  platformPhoneLogin
}
