'use strict'

// CloudBase Node 18.15 不提供 Web File 全局变量，而数据库 SDK 的 undici
// 依赖会在模块初始化阶段读取它；必须在加载 /opt/utils/cloudbase 前补齐。
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}

const crypto = require('crypto')
const { models, runCloudbaseRestTableQuery } = require('/opt/utils/cloudbase')
const {
  jsonResponse,
  internalServerError,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo,
  createHttpIdentityTicket
} = require('/opt/utils/http')
const {
  createPlatformError,
  createPhoneProof,
  createSessionToken,
  hashSessionToken,
  normalizeAppId,
  normalizePlatform,
  maskPhone,
  sessionExpiresAt,
  verifyPhoneProof
} = require('/opt/utils/platform-session')

async function readUserSql(sql, params = {}) {
  return models.$runSQL(sql, params)
}

const PLATFORM_APP_IDS = {
  wechat_mp: String(process.env.WECHAT_MINIPROGRAM_APP_ID || '').trim(),
  douyin_mp: 'tt79ef0f52e78e857401',
  xiaohongshu_mp: '69b9576cdb45760001d82e15'
}
const HTTP_IDENTITY_TICKET_TTL_MS = 5 * 60 * 1000
// auth/user 的读接口只需要公开用户资料；显式投影避免把密码、手机号密文/hash
// 和其他内部列带入查询结果，再由 userResponse 二次清理。
const PUBLIC_USER_SELECT_SQL = `
  SELECT
    _id, _openid, principal_platform, principal_openid, wechat_openid,
    wechat_unionid, douyin_openid, xiaohongshu_openid, union_id, username, email,
    phoneNumber, phone_country_code, phone_verified_at, phone_bind_platform,
    phone_bind_source, subscription_plan, subscription_status,
    subscription_startDate, subscription_endDate, usage_diagnoseToday,
    usage_diagnoseTotal, usage_identifyToday, usage_identifyTotal,
    usage_lastResetDate, profile_avatar, profile_bio, profile_wechatNickname,
    profile_wechatAvatar, profile_createdAt, profile_lastLoginAt, isActive,
    createdAt, updatedAt, usage_chatToday, usage_chatTotal, usage_diagnoseMonth,
    usage_lastMonthReset, quota, phone_masked
  FROM users
`
const PUBLIC_USER_SELECT_FIELDS = [
  '_id',
  '_openid',
  'principal_platform',
  'principal_openid',
  'wechat_openid',
  'wechat_unionid',
  'douyin_openid',
  'xiaohongshu_openid',
  'union_id',
  'username',
  'email',
  'phoneNumber',
  'phone_country_code',
  'phone_verified_at',
  'phone_bind_platform',
  'phone_bind_source',
  'subscription_plan',
  'subscription_status',
  'subscription_startDate',
  'subscription_endDate',
  'usage_diagnoseToday',
  'usage_diagnoseTotal',
  'usage_identifyToday',
  'usage_identifyTotal',
  'usage_lastResetDate',
  'profile_avatar',
  'profile_bio',
  'profile_wechatNickname',
  'profile_wechatAvatar',
  'profile_createdAt',
  'profile_lastLoginAt',
  'isActive',
  'createdAt',
  'updatedAt',
  'usage_chatToday',
  'usage_chatTotal',
  'usage_diagnoseMonth',
  'usage_lastMonthReset',
  'quota',
  'phone_masked'
].join(',')
function readQaPerformanceProbeId(headers = {}) {
  const value = headers['x-qa-performance-probe-id'] || headers['X-QA-Performance-Probe-Id'] || ''
  const normalized = String(value).trim()
  return /^[A-Za-z0-9._:-]{8,120}$/u.test(normalized) ? normalized : ''
}

function createQaRequestTiming(probeId) {
  if (!probeId) {
    return null
  }
  const startedAt = Date.now()
  const marks = []
  return {
    mark(stage, details = {}) {
      marks.push({
        stage,
        elapsed_ms: Date.now() - startedAt,
        ...details
      })
    },
    flush() {
      console.log('qa-performance-timing', JSON.stringify({ probeId, marks }))
    }
  }
}

let platformPhoneVerifiers
function loadPlatformPhoneVerifiers() {
  if (platformPhoneVerifiers) {
    return platformPhoneVerifiers
  }
  try {
    platformPhoneVerifiers = require('/opt/utils/platform-phone-verifiers')
  } catch {
    platformPhoneVerifiers = require('../layer/utils/platform-phone-verifiers')
  }
  return platformPhoneVerifiers
}

function rows(result) {
  return result?.data?.executeResultList || []
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

function getErrorResponse(error) {
  const statusCode = Number(error?.statusCode || 0)
  if (statusCode >= 400 && statusCode < 600) {
    return jsonResponse(statusCode, {
      code: error.code || statusCode,
      message: error.message || '请求失败',
      data: null
    })
  }
  return null
}

function getSchemaNotReadyResponse(error) {
  if (
    !/user_sessions|user_platform_identities|phone_hash|phone_ciphertext|phone_masked|unknown column|unknown table|doesn'?t exist|table .*not found/i.test(
      String(error?.message || '')
    )
  ) {
    return null
  }
  return jsonResponse(503, {
    code: 'PLATFORM_AUTH_SCHEMA_NOT_READY',
    message: '手机号登录服务尚未初始化，请稍后再试',
    data: null
  })
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

function userResponseWithHttpIdentityTicket(user = {}, identity = {}) {
  const safeUser = userResponse(user)
  const canonicalIdentity =
    identity?.source === 'platform-session' ||
    (identity?.source === 'signed-http-ticket' && identity?.userId)
  if (!canonicalIdentity) {
    return safeUser
  }
  const openid = String(
    identity?.openid || user?._openid || user?.wechat_openid || user?._id || ''
  ).trim()
  const userId = String(identity?.userId || user?._id || '').trim()
  if (!userId) {
    return safeUser
  }
  const httpIdentityTicket = createHttpIdentityTicket({
    openid,
    uid: userId,
    customUserId: userId,
    subject: 'planting-user',
    platform: normalizePlatform(identity?.platform || user?.principal_platform)
  })
  if (!httpIdentityTicket) {
    return safeUser
  }
  return {
    ...safeUser,
    httpIdentityTicket,
    httpIdentityTicketExpiresAt: Date.now() + HTTP_IDENTITY_TICKET_TTL_MS
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
  const phoneUser = phoneRows[0] || null
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
          _id, _openid, principal_platform, principal_openid, username,
          phone_hash, phone_ciphertext, phone_masked, phone_verified_at,
          subscription_plan, subscription_status, subscription_startDate, subscription_endDate,
          usage_diagnoseToday, usage_diagnoseTotal, usage_identifyToday, usage_identifyTotal, usage_lastResetDate,
          isActive, createdAt, updatedAt
        ) VALUES (
          {{userId}}, {{ownerUserId}}, {{platform}}, {{platformUserId}}, {{username}},
          {{phoneHash}}, {{phoneCiphertext}}, {{phoneMasked}}, {{now}},
          'free', 'active', {{now}}, {{now}},
          0, 0, 0, 0, {{now}}, 1, {{now}}, {{now}}
        )`,
        {
          userId,
          ownerUserId: userId,
          platform,
          platformUserId,
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
      // 两个平台同时首次用同一手机号登录时，唯一索引可能由另一请求先占用。
      // 重新读取已落库用户，避免并发竞态制造第二个业务用户。
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
         phone_verified_at = {{now}}, profile_lastLoginAt = {{now}}, updatedAt = {{now}}
       WHERE _id = {{userId}}`,
      { phoneHash, phoneCiphertext, phoneMasked, now, userId: user._id }
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
  // appId 来自受同一服务端密钥签名、且由 CloudBase 运行时生成的手机号证明；
  // 若运维额外配置 WECHAT_MINIPROGRAM_APP_ID，则再做显式一致性校验。
  const expectedAppId = normalizeAppId(PLATFORM_APP_IDS.wechat_mp) || proof.appId
  if (
    proof.platform !== 'wechat_mp' ||
    proof.appId !== expectedAppId ||
    !identity?.openid ||
    proof.platformUserId !== identity.openid
  ) {
    throw createPlatformError(
      '微信手机号授权与当前登录身份不一致，请重新授权',
      'PLATFORM_AUTH_MISMATCH',
      401
    )
  }
}

async function platformPhoneLogin({ platform, data, resolvedIdentity }) {
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
    const { verifyDouyinPhoneAuthorization, verifyXhsPhoneAuthorization } =
      loadPlatformPhoneVerifiers()
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
      proofNonce: verifiedProof.nonce
    }
  }
  const now = Date.now()
  const resolved = await resolveUserForVerifiedPhone({ ...verified, now })
  const user = resolved.user
  const session = await issueSession({
    userId: user._id,
    platform: verified.platform,
    appId: verified.appId,
    proofNonce: verified.proofNonce,
    now
  })
  const safeUser = userResponse(user)
  if (verified.platform === 'wechat_mp') {
    // 仅供既有微信端本地状态与运行时身份比对；服务端绝不信任客户端回传该字段。
    safeUser.wechat_openid = verified.platformUserId
  }
  const httpIdentityTicketUser = userResponseWithHttpIdentityTicket(user, {
    openid: user?._openid,
    userId: user?._id,
    platform: verified.platform,
    source: 'platform-session'
  })
  return {
    user: {
      ...safeUser,
      ...(httpIdentityTicketUser.httpIdentityTicket
        ? {
            httpIdentityTicket: httpIdentityTicketUser.httpIdentityTicket,
            httpIdentityTicketExpiresAt: httpIdentityTicketUser.httpIdentityTicketExpiresAt
          }
        : {})
    },
    session: {
      ...session,
      ...(httpIdentityTicketUser.httpIdentityTicket
        ? {
            httpIdentityTicket: httpIdentityTicketUser.httpIdentityTicket,
            httpIdentityTicketExpiresAt: httpIdentityTicketUser.httpIdentityTicketExpiresAt
          }
        : {})
    },
    isNewUser: resolved.isNewUser
  }
}

function generateId() {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function sanitizeUser(user) {
  return userResponse(user)
}

async function syncWechatIdentity({
  userId,
  openid,
  unionId = '',
  appid = '',
  phoneNumber = '',
  verifiedAt = null,
  updatedAt = Date.now()
}) {
  if (!userId || !openid) {
    return
  }

  await models.$runSQL(
    `INSERT INTO user_platform_identities (
      identity_id, _openid, user_id, platform, app_id, openid, unionid,
      phone_snapshot, is_primary, verified_at, createdAt, updatedAt
    ) VALUES (
      {{identityId}}, {{userId}}, {{userId}}, 'wechat_mp', {{appid}}, {{openid}},
      {{unionId}}, {{phoneNumber}}, 1, NULLIF({{verifiedAt}}, 0), {{createdAt}}, {{updatedAt}}
    )
    ON DUPLICATE KEY UPDATE
      _openid = VALUES(_openid),
      user_id = VALUES(user_id),
      app_id = VALUES(app_id),
      unionid = VALUES(unionid),
      phone_snapshot = VALUES(phone_snapshot),
      is_primary = VALUES(is_primary),
      verified_at = NULLIF({{verifiedAt}}, 0),
      updatedAt = VALUES(updatedAt)`,
    {
      identityId: `upi_${userId}`,
      openid,
      userId,
      appid: appid || '',
      unionId: unionId || '',
      phoneNumber: phoneNumber || '',
      verifiedAt: Number.isFinite(verifiedAt) ? verifiedAt : 0,
      createdAt: updatedAt,
      updatedAt
    }
  )
}

async function _wechatLogin(wechatData) {
  const {
    openid,
    union_id,
    appid = '',
    nickname,
    avatar,
    phoneNumber = '',
    phoneCountryCode = '+86',
    phoneBindSource = ''
  } = wechatData
  if (!openid) {
    throw new Error('缺少用户标识')
  }

  const now = Date.now()
  const phoneVerifiedAt = phoneNumber ? now : null
  const normalizedUnionId = union_id || ''
  const normalizedPhoneBindSource = phoneBindSource || (phoneNumber ? 'platform_bridge' : '')

  if (normalizedUnionId) {
    const unionResult = await models.$runSQL(
      'SELECT * FROM users WHERE union_id = {{union_id}} LIMIT 1',
      { union_id: normalizedUnionId }
    )
    const unionUsers = unionResult?.data?.executeResultList || []

    if (unionUsers.length > 0) {
      const user = unionUsers[0]
      await models.$runSQL(
        `UPDATE users SET
          _openid = {{openid}},
          principal_platform = 'wechat_mp',
          principal_openid = {{openid}},
          wechat_openid = {{openid}},
          wechat_unionid = COALESCE(NULLIF({{union_id}}, ''), wechat_unionid),
          profile_lastLoginAt = {{now}},
          profile_wechatNickname = COALESCE(NULLIF({{nickname}}, ''), profile_wechatNickname),
          profile_wechatAvatar = COALESCE(NULLIF({{avatar}}, ''), profile_wechatAvatar),
          phoneNumber = COALESCE(NULLIF({{phoneNumber}}, ''), phoneNumber),
          phone_country_code = CASE WHEN {{phoneNumber}} <> '' THEN {{phoneCountryCode}} ELSE phone_country_code END,
          phone_verified_at = CASE WHEN {{phoneNumber}} <> '' THEN {{phoneVerifiedAt}} ELSE phone_verified_at END,
          phone_bind_platform = CASE WHEN {{phoneNumber}} <> '' THEN 'wechat_mp' ELSE phone_bind_platform END,
          phone_bind_source = CASE WHEN {{phoneNumber}} <> '' THEN {{phoneBindSource}} ELSE phone_bind_source END,
          updatedAt = {{now}}
        WHERE _id = {{userId}}`,
        {
          openid,
          union_id: normalizedUnionId,
          now,
          nickname,
          avatar,
          phoneNumber,
          phoneCountryCode,
          phoneVerifiedAt,
          phoneBindSource: normalizedPhoneBindSource,
          userId: user._id
        }
      )

      await syncWechatIdentity({
        userId: user._id,
        openid,
        unionId: normalizedUnionId,
        appid,
        phoneNumber,
        verifiedAt: phoneVerifiedAt,
        updatedAt: now
      })

      return {
        user: sanitizeUser({
          ...user,
          _openid: openid,
          principal_platform: 'wechat_mp',
          principal_openid: openid,
          wechat_openid: openid,
          wechat_unionid: normalizedUnionId || user.wechat_unionid,
          profile_lastLoginAt: now,
          profile_wechatNickname: nickname || user.profile_wechatNickname,
          profile_wechatAvatar: avatar || user.profile_wechatAvatar,
          phoneNumber: phoneNumber || user.phoneNumber,
          phone_country_code: phoneNumber ? phoneCountryCode : user.phone_country_code,
          phone_verified_at: phoneNumber ? phoneVerifiedAt : user.phone_verified_at,
          phone_bind_platform: phoneNumber ? 'wechat_mp' : user.phone_bind_platform,
          phone_bind_source: phoneNumber ? normalizedPhoneBindSource : user.phone_bind_source,
          updatedAt: now
        }),
        isNewUser: false
      }
    }
  }

  const openidResult = await models.$runSQL(
    'SELECT * FROM users WHERE _openid = {{openid}} LIMIT 1',
    { openid }
  )
  const openidUsers = openidResult?.data?.executeResultList || []

  if (openidUsers.length > 0) {
    const user = openidUsers[0]
    await models.$runSQL(
      `UPDATE users SET
        union_id = COALESCE(NULLIF({{union_id}}, ''), union_id),
        principal_platform = 'wechat_mp',
        principal_openid = {{openid}},
        wechat_openid = {{openid}},
        wechat_unionid = COALESCE(NULLIF({{union_id}}, ''), wechat_unionid),
        profile_lastLoginAt = {{now}},
        profile_wechatNickname = COALESCE(NULLIF({{nickname}}, ''), profile_wechatNickname),
        profile_wechatAvatar = COALESCE(NULLIF({{avatar}}, ''), profile_wechatAvatar),
        phoneNumber = COALESCE(NULLIF({{phoneNumber}}, ''), phoneNumber),
        phone_country_code = CASE WHEN {{phoneNumber}} <> '' THEN {{phoneCountryCode}} ELSE phone_country_code END,
        phone_verified_at = CASE WHEN {{phoneNumber}} <> '' THEN {{phoneVerifiedAt}} ELSE phone_verified_at END,
        phone_bind_platform = CASE WHEN {{phoneNumber}} <> '' THEN 'wechat_mp' ELSE phone_bind_platform END,
        phone_bind_source = CASE WHEN {{phoneNumber}} <> '' THEN {{phoneBindSource}} ELSE phone_bind_source END,
        updatedAt = {{now}}
      WHERE _id = {{userId}}`,
      {
        union_id: normalizedUnionId,
        openid,
        now,
        nickname,
        avatar,
        phoneNumber,
        phoneCountryCode,
        phoneVerifiedAt,
        phoneBindSource: normalizedPhoneBindSource,
        userId: user._id
      }
    )

    await syncWechatIdentity({
      userId: user._id,
      openid,
      unionId: normalizedUnionId,
      appid,
      phoneNumber,
      verifiedAt: phoneVerifiedAt,
      updatedAt: now
    })

    return {
      user: sanitizeUser({
        ...user,
        union_id: normalizedUnionId || user.union_id,
        principal_platform: 'wechat_mp',
        principal_openid: openid,
        wechat_openid: openid,
        wechat_unionid: normalizedUnionId || user.wechat_unionid,
        profile_lastLoginAt: now,
        profile_wechatNickname: nickname || user.profile_wechatNickname,
        profile_wechatAvatar: avatar || user.profile_wechatAvatar,
        phoneNumber: phoneNumber || user.phoneNumber,
        phone_country_code: phoneNumber ? phoneCountryCode : user.phone_country_code,
        phone_verified_at: phoneNumber ? phoneVerifiedAt : user.phone_verified_at,
        phone_bind_platform: phoneNumber ? 'wechat_mp' : user.phone_bind_platform,
        phone_bind_source: phoneNumber ? normalizedPhoneBindSource : user.phone_bind_source,
        updatedAt: now
      }),
      isNewUser: false
    }
  }

  const userId = generateId()
  const username = nickname || `微信用户_${openid.substring(0, 6)}`
  const endDate = now + 30 * 24 * 60 * 60 * 1000

  await models.$runSQL(
    `INSERT INTO users (
      _id, _openid, principal_platform, principal_openid, wechat_openid, wechat_unionid, union_id,
      username, email, phoneNumber, phone_country_code, phone_verified_at, phone_bind_platform, phone_bind_source, password,
      subscription_plan, subscription_status, subscription_startDate, subscription_endDate,
      usage_diagnoseToday, usage_diagnoseTotal, usage_identifyToday, usage_identifyTotal, usage_lastResetDate,
      profile_avatar, profile_bio, profile_wechatNickname, profile_wechatAvatar, profile_createdAt, profile_lastLoginAt,
      isActive, createdAt, updatedAt
    ) VALUES (
      {{userId}}, {{openid}}, 'wechat_mp', {{openid}}, {{openid}}, {{wechatUnionId}}, {{union_id}},
      {{username}}, {{email}}, {{phoneNumber}}, {{phoneCountryCode}}, {{phoneVerifiedAt}}, {{phoneBindPlatform}}, {{phoneBindSource}}, {{password}},
      {{plan}}, {{status}}, {{startDate}}, {{endDate}},
      {{diagnoseToday}}, {{diagnoseTotal}}, {{identifyToday}}, {{identifyTotal}}, {{lastResetDate}},
      {{avatar}}, {{bio}}, {{wechatNickname}}, {{wechatAvatar}}, {{createdAt}}, {{lastLoginAt}},
      {{isActive}}, {{createdAt2}}, {{updatedAt}}
    )`,
    {
      userId,
      openid,
      wechatUnionId: normalizedUnionId || null,
      union_id: normalizedUnionId || null,
      username,
      email: null,
      phoneNumber: phoneNumber || null,
      phoneCountryCode,
      phoneVerifiedAt,
      phoneBindPlatform: phoneNumber ? 'wechat_mp' : '',
      phoneBindSource: normalizedPhoneBindSource,
      password: null,
      plan: 'free',
      status: 'active',
      startDate: now,
      endDate,
      diagnoseToday: 0,
      diagnoseTotal: 0,
      identifyToday: 0,
      identifyTotal: 0,
      lastResetDate: now,
      avatar: avatar || null,
      bio: null,
      wechatNickname: nickname || null,
      wechatAvatar: avatar || null,
      createdAt: now,
      lastLoginAt: now,
      isActive: 1,
      createdAt2: now,
      updatedAt: now
    }
  )

  await syncWechatIdentity({
    userId,
    openid,
    unionId: normalizedUnionId,
    appid,
    phoneNumber,
    verifiedAt: phoneVerifiedAt,
    updatedAt: now
  })

  return {
    user: sanitizeUser({
      _id: userId,
      _openid: openid,
      principal_platform: 'wechat_mp',
      principal_openid: openid,
      wechat_openid: openid,
      wechat_unionid: normalizedUnionId || '',
      union_id: normalizedUnionId || '',
      username,
      email: '',
      phoneNumber: phoneNumber || '',
      phone_country_code: phoneCountryCode,
      phone_verified_at: phoneVerifiedAt,
      phone_bind_platform: phoneNumber ? 'wechat_mp' : '',
      phone_bind_source: normalizedPhoneBindSource,
      password: '',
      subscription_plan: 'free',
      subscription_status: 'active',
      subscription_startDate: now,
      subscription_endDate: endDate,
      usage_diagnoseToday: 0,
      usage_diagnoseTotal: 0,
      usage_identifyToday: 0,
      usage_identifyTotal: 0,
      usage_lastResetDate: now,
      profile_avatar: avatar || '',
      profile_bio: '',
      profile_wechatNickname: nickname || '',
      profile_wechatAvatar: avatar || '',
      profile_createdAt: now,
      profile_lastLoginAt: now,
      isActive: 1,
      createdAt: now,
      updatedAt: now
    }),
    isNewUser: true
  }
}

async function getUserById(userId) {
  const result = await models.$runSQL('SELECT * FROM users WHERE _id = {{userId}} LIMIT 1', {
    userId
  })
  const users = result?.data?.executeResultList || []
  if (!users.length) {
    throw new Error('用户不存在')
  }
  return users[0]
}

async function _getUserByUnionId(unionId) {
  const result = await models.$runSQL('SELECT * FROM users WHERE union_id = {{unionId}} LIMIT 1', {
    unionId
  })
  const users = result?.data?.executeResultList || []
  if (!users.length) {
    throw new Error('用户不存在')
  }
  return sanitizeUser(users[0])
}

async function _getUserByOpenid(openid, timing = null) {
  let result
  timing?.mark('user-rest-read-start')
  try {
    result = await runCloudbaseRestTableQuery({
      table: 'users',
      select: PUBLIC_USER_SELECT_FIELDS,
      equals: { _openid: openid },
      limit: 1
    })
    timing?.mark('user-rest-read-success', {
      row_count: Number(result?.data?.executeResultList?.length || 0)
    })
  } catch (error) {
    // 复杂 SQL/旧环境仍保留兼容路径；只有 REST 单表读取失败才回到
    // 低代码 SQL，不把两条查询并行发出，避免一次请求放大数据库压力。
    console.warn(
      '[auth-user-http] REST user read fallback',
      JSON.stringify({
        code: error?.code || 'CLOUDBASE_REST_READ_FAILED',
        message: String(error?.message || '').slice(0, 160)
      })
    )
    timing?.mark('user-rest-read-failed', {
      code: String(error?.code || 'CLOUDBASE_REST_READ_FAILED').slice(0, 80)
    })
    timing?.mark('user-sql-fallback-start')
    result = await readUserSql(`${PUBLIC_USER_SELECT_SQL} WHERE _openid = {{openid}} LIMIT 1`, {
      openid
    })
    timing?.mark('user-sql-fallback-success', {
      row_count: Number(result?.data?.executeResultList?.length || 0)
    })
  }
  const users = result?.data?.executeResultList || []
  if (!users.length) {
    throw new Error('用户不存在')
  }
  return sanitizeUser(users[0])
}

function _resolveWechatIdentity(data = {}, payload = {}) {
  const openid = data.openid || payload.openid || ''
  const unionId = data.unionid || data.union_id || payload.unionid || payload.union_id || ''
  const appid = data.appid || payload.appid || ''

  return {
    openid,
    unionId,
    appid
  }
}

async function _getUserByEmail(email) {
  const result = await models.$runSQL('SELECT * FROM users WHERE email = {{email}} LIMIT 1', {
    email
  })
  const users = result?.data?.executeResultList || []
  if (!users.length) {
    throw new Error('用户不存在')
  }
  return sanitizeUser(users[0])
}

async function updateUserEmail(userId, email) {
  if (email) {
    const result = await models.$runSQL(
      'SELECT * FROM users WHERE email = {{email}} AND _id != {{userId}} LIMIT 1',
      { email, userId }
    )
    if ((result?.data?.executeResultList || []).length > 0) {
      throw new Error('邮箱已被其他用户使用')
    }
  }

  await models.$runSQL(
    'UPDATE users SET email = {{email}}, updatedAt = {{now}} WHERE _id = {{userId}}',
    { email: email || null, now: Date.now(), userId }
  )
  return sanitizeUser(await getUserById(userId))
}

async function _updateUserPhoneNumber(userId, phoneNumber) {
  const now = Date.now()
  await models.$runSQL(
    `UPDATE users SET
      phoneNumber = {{phoneNumber}},
      phone_verified_at = CASE WHEN {{phoneNumber}} <> '' THEN {{now}} ELSE phone_verified_at END,
      phone_bind_source = CASE WHEN {{phoneNumber}} <> '' THEN 'manual_update' ELSE phone_bind_source END,
      updatedAt = {{now}}
    WHERE _id = {{userId}}`,
    { phoneNumber: phoneNumber || null, now, userId }
  )
  return sanitizeUser(await getUserById(userId))
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'POST'
  const qaProbeId = readQaPerformanceProbeId(request.headers)
  const timing = createQaRequestTiming(qaProbeId)
  if (qaProbeId) {
    // 以单行 JSON 写入，CLS 不会把对象参数折叠成不可关联的“{”；
    // 性能验收据此把端上 wx.request 与本次函数日志精确关联。
    console.log(
      'qa-performance-probe',
      JSON.stringify({ probeId: qaProbeId, endpoint: 'auth-user-http/auth/user' })
    )
  }
  timing?.mark('request-enter')

  try {
    if (path.includes('/auth/user/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (!path.includes('/auth/user')) {
      return notFound(path)
    }

    if (!['GET', 'POST', 'PATCH'].includes(method)) {
      return methodNotAllowed(method)
    }

    const payload = method === 'GET' ? request.query : request.body
    const action = String(payload.action || '')
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
    // 微信原生 HTTP 调用由 CloudBase 注入运行时身份。手机号登录和按
    // openid 读取当前微信账户都可以使用这份身份；跨平台业务 action 仍
    // 必须使用服务端签发的持久会话。
    const userInfo = await resolveHttpUserInfo(request.headers, payload, context, {
      allowRuntimeIdentity: ['phoneLogin', 'getUserByOpenid'].includes(action),
      allowSignedHttpIdentityTicket: action === 'getUserByOpenid',
      timing
    })
    timing?.mark('identity-ready', { source: userInfo?.source || '' })

    // 正常读请求不写日志，避免每次 auth/user 都进入日志链路；QA 探针和
    // 显式 DEBUG_LOG 仍保留可审计的来源与动作，但不记录 OpenID、手机号或 token。
    if (
      qaProbeId ||
      String(process.env.DEBUG_LOG || '')
        .trim()
        .toLowerCase() === 'true'
    ) {
      console.log('auth-user-http action:', {
        action,
        hasResolvedUserInfo: Boolean(userInfo),
        userInfoSource: userInfo?.source || ''
      })
    }

    switch (action) {
      case 'phoneLogin': {
        assertNoClientIdentityFields(data)
        if (!userInfo?.openid) {
          throw createPlatformError('请先完成微信登录后再授权手机号', 'PLATFORM_AUTH_REQUIRED', 401)
        }
        const result = await platformPhoneLogin({
          platform: 'wechat_mp',
          data,
          resolvedIdentity: userInfo
        })
        return jsonResponse(200, {
          code: 200,
          message: '登录成功',
          data: result
        })
      }
      case 'platformPhoneLogin': {
        assertNoClientIdentityFields(data)
        const platform = normalizePlatform(data.platform)
        if (!platform || platform === 'wechat_mp') {
          throw createPlatformError('平台登录参数无效', 'PLATFORM_AUTH_INVALID', 400)
        }
        const result = await platformPhoneLogin({ platform, data, resolvedIdentity: userInfo })
        return jsonResponse(200, { code: 200, message: '登录成功', data: result })
      }
      case 'wechatLogin':
        return jsonResponse(403, {
          code: 'PHONE_AUTH_REQUIRED',
          message: '请使用手机号授权登录',
          data: null
        })
      case 'updateEmail':
        if (!userInfo?.userId) {
          return jsonResponse(401, { code: 401, message: '请先登录', data: null })
        }
        return jsonResponse(200, {
          code: 200,
          message: '邮箱更新成功',
          data: userResponse(await updateUserEmail(userInfo.userId, data.email))
        })
      case 'updatePhoneNumber':
        return jsonResponse(403, {
          code: 'PHONE_AUTH_REQUIRED',
          message: '请通过平台手机号授权更新手机号',
          data: null
        })
      case 'getUserByUnionId':
      case 'getUserByOpenid':
      case 'getUserByEmail': {
        // getUserByOpenid 只能按服务端解析出的当前身份读取用户，不能信任
        // 客户端提交的身份字段。原生微信请求使用 CloudBase 网关注入的
        // runtime openid；其他受信调用可使用已验签的 HTTP 身份票据。
        const ticketOpenid = String(userInfo?.openid || '').trim()
        const canReadOwnUserByTicket =
          action === 'getUserByOpenid' &&
          ['signed-http-ticket', 'cloudbase-runtime', 'cloudbase-runtime-header'].includes(
            userInfo?.source
          ) &&
          ticketOpenid

        if (!userInfo?.userId && !canReadOwnUserByTicket) {
          return jsonResponse(401, { code: 401, message: '请先登录', data: null })
        }

        if (canReadOwnUserByTicket) {
          const user = await _getUserByOpenid(ticketOpenid, timing)
          timing?.mark('response-ready')
          return jsonResponse(200, {
            code: 200,
            message: '获取成功',
            data: userResponseWithHttpIdentityTicket(user, userInfo)
          })
        }

        timing?.mark('user-sql-by-id-start')
        const user = await getUserById(userInfo.userId)
        timing?.mark('user-sql-by-id-success')
        timing?.mark('response-ready')
        return jsonResponse(200, {
          code: 200,
          message: '获取成功',
          data: userResponseWithHttpIdentityTicket(user, userInfo)
        })
      }
      default:
        return jsonResponse(400, { code: 400, message: '无效操作', data: null })
    }
  } catch (error) {
    console.error('auth-user-http error:', error)
    const publicError = getErrorResponse(error)
    if (publicError) {
      return publicError
    }
    const schemaNotReady = getSchemaNotReadyResponse(error)
    if (schemaNotReady) {
      return schemaNotReady
    }
    return internalServerError('用户信息暂时不可用，请稍后重试')
  } finally {
    timing?.flush()
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
