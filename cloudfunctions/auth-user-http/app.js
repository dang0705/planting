'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo
} = require('/opt/utils/http')

function generateId() {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function sanitizeUser(user) {
  const { password: _password, ...sanitized } = user
  return sanitized
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
      {{identityId}}, {{openid}}, {{userId}}, 'wechat_mp', {{appid}}, {{openid}},
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

async function wechatLogin(wechatData) {
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
  const result = await models.$runSQL('SELECT * FROM users WHERE _id = {{userId}} LIMIT 1', { userId })
  const users = result?.data?.executeResultList || []
  if (!users.length) {
    throw new Error('用户不存在')
  }
  return users[0]
}

async function getUserByUnionId(unionId) {
  const result = await models.$runSQL('SELECT * FROM users WHERE union_id = {{unionId}} LIMIT 1', {
    unionId
  })
  const users = result?.data?.executeResultList || []
  if (!users.length) {
    throw new Error('用户不存在')
  }
  return sanitizeUser(users[0])
}

async function getUserByOpenid(openid) {
  const result = await models.$runSQL('SELECT * FROM users WHERE _openid = {{openid}} LIMIT 1', {
    openid
  })
  const users = result?.data?.executeResultList || []
  if (!users.length) {
    throw new Error('用户不存在')
  }
  return sanitizeUser(users[0])
}

function resolveWechatIdentity(data = {}, payload = {}) {
  const openid = data.openid || payload.openid || ''
  const unionId = data.unionid || data.union_id || payload.unionid || payload.union_id || ''
  const appid = data.appid || payload.appid || ''

  return {
    openid,
    unionId,
    appid
  }
}

async function getUserByEmail(email) {
  const result = await models.$runSQL('SELECT * FROM users WHERE email = {{email}} LIMIT 1', { email })
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

async function updateUserPhoneNumber(userId, phoneNumber) {
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
    const action = payload.action
    const data = payload.data || {}
    const userInfo = await resolveHttpUserInfo(request.headers, payload, context)
    const wechatIdentity = resolveWechatIdentity(data, payload)

    console.log('auth-user-http identity summary:', {
      action,
      hasResolvedUserInfo: Boolean(userInfo),
      userInfoSource: userInfo?.source || '',
      hasPayloadOpenid: Boolean(wechatIdentity.openid),
      hasPayloadUnionId: Boolean(wechatIdentity.unionId),
      hasPayloadAppid: Boolean(wechatIdentity.appid),
      hasResolvedUserOpenId: Boolean(userInfo?.openid),
      resolvedOpenIdMatchesPayload:
        Boolean(userInfo?.openid) && Boolean(wechatIdentity.openid) && userInfo.openid === wechatIdentity.openid
    })

    switch (action) {
      case 'wechatLogin': {
        const result = await wechatLogin({
          openid: wechatIdentity.openid,
          union_id: wechatIdentity.unionId,
          appid: wechatIdentity.appid,
          nickname: '',
          avatar: ''
        })
        return jsonResponse(200, {
          code: 200,
          message: result.isNewUser ? '注册成功' : '登录成功',
          data: result
        })
      }
      case 'phoneLogin': {
        if (!data.phoneNumber) {
          throw new Error('缺少手机号')
        }
        const result = await wechatLogin({
          openid: wechatIdentity.openid,
          union_id: wechatIdentity.unionId,
          appid: wechatIdentity.appid,
          nickname: '',
          avatar: '',
          phoneNumber: data.phoneNumber,
          phoneCountryCode: data.countryCode || '+86',
          phoneBindSource: data.phoneSource || 'platform_bridge'
        })
        return jsonResponse(200, {
          code: 200,
          message: result.isNewUser ? '注册成功' : '登录成功',
          data: result
        })
      }
      case 'updateEmail':
        return jsonResponse(200, {
          code: 200,
          message: '邮箱更新成功',
          data: await updateUserEmail(data.userId, data.email)
        })
      case 'updatePhoneNumber':
        return jsonResponse(200, {
          code: 200,
          message: '手机号更新成功',
          data: await updateUserPhoneNumber(data.userId, data.phoneNumber)
        })
      case 'getUserByUnionId':
        return jsonResponse(200, { code: 200, message: '获取成功', data: await getUserByUnionId(data.union_id) })
      case 'getUserByOpenid':
        return jsonResponse(200, {
          code: 200,
          message: '获取成功',
          data: await getUserByOpenid(data.openid || payload.openid || userInfo?.openid || '')
        })
      case 'getUserByEmail':
        return jsonResponse(200, { code: 200, message: '获取成功', data: await getUserByEmail(data.email) })
      default:
        return jsonResponse(400, { code: 400, message: '无效操作', data: null })
    }
  } catch (error) {
    console.error('auth-user-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
