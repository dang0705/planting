'use strict'

const tcb = require('@cloudbase/node-sdk')
const { models } = require('/opt/utils/cloudbase')

// 生成唯一 ID
function generateId() {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// 清理用户数据（移除敏感信息）
function sanitizeUser(user) {
  const { password, ...sanitized } = user
  return sanitized
}

/**
 * 微信登录/注册 - MySQL 版本
 */
async function wechatLogin(wechatData) {
  const { openid, union_id, nickname, avatar, phoneNumber = '' } = wechatData
  if (!openid) {
    throw new Error('缺少微信 openid')
  }

  console.log(
    'wechatLogin 输入参数:',
    JSON.stringify({ openid, union_id, nickname, avatar, phoneNumber })
  )

  const now = Date.now()

  // 1. 优先使用 union_id 查找用户（跨平台唯一标识）
  if (union_id) {
    console.log('尝试使用 union_id 查找用户:', union_id)
    const unionSQL = 'SELECT * FROM users WHERE union_id = {{union_id}} LIMIT 1'
    const unionResult = await models.$runSQL(unionSQL, { union_id })

    console.log('union_id 查询结果:', JSON.stringify(unionResult))

    // 正确解析返回结果
    const unionUsers = unionResult?.data?.executeResultList || []

    if (unionUsers.length > 0) {
      // 老用户，更新登录信息
      const user = unionUsers[0]

      const updateSQL = `UPDATE users SET
        _openid = {{openid}},
        profile_lastLoginAt = {{now}},
        profile_wechatNickname = COALESCE(NULLIF({{nickname}}, ''), profile_wechatNickname),
        profile_wechatAvatar = COALESCE(NULLIF({{avatar}}, ''), profile_wechatAvatar),
        phoneNumber = COALESCE(NULLIF({{phoneNumber}}, ''), phoneNumber),
        updatedAt = {{now}}
        WHERE _id = {{userId}}`

      await models.$runSQL(updateSQL, {
        openid,
        now,
        nickname,
        avatar,
        phoneNumber,
        userId: user._id
      })

      // 更新用户对象
      const updatedUser = {
        ...user,
        _openid: openid,
        profile_lastLoginAt: now,
        profile_wechatNickname: nickname || user.profile_wechatNickname,
        profile_wechatAvatar: avatar || user.profile_wechatAvatar,
        phoneNumber: phoneNumber || user.phoneNumber,
        updatedAt: now
      }

      console.log('更新后的用户:', JSON.stringify(updatedUser))
      return { user: sanitizeUser(updatedUser), isNewUser: false }
    }
  }

  // 2. 如果 union_id 不存在或未找到，使用 openid 查找
  console.log('尝试使用 openid 查找用户:', openid)
  const openidSQL = 'SELECT * FROM users WHERE _openid = {{openid}} LIMIT 1'
  const openidResult = await models.$runSQL(openidSQL, { openid })

  console.log('openid 查询结果:', JSON.stringify(openidResult))

  // 正确解析返回结果
  const openidUsers = openidResult?.data?.executeResultList || []

  if (openidUsers.length > 0) {
    // 老用户，更新登录信息
    const user = openidUsers[0]

    const updateSQL = `UPDATE users SET
      union_id = COALESCE(NULLIF({{union_id}}, ''), union_id),
      profile_lastLoginAt = {{now}},
      profile_wechatNickname = COALESCE(NULLIF({{nickname}}, ''), profile_wechatNickname),
      profile_wechatAvatar = COALESCE(NULLIF({{avatar}}, ''), profile_wechatAvatar),
      phoneNumber = COALESCE(NULLIF({{phoneNumber}}, ''), phoneNumber),
      updatedAt = {{now}}
      WHERE _id = {{userId}}`

    await models.$runSQL(updateSQL, {
      union_id,
      now,
      nickname,
      avatar,
      phoneNumber,
      userId: user._id
    })

    // 更新用户对象
    const updatedUser = {
      ...user,
      union_id: union_id || user.union_id,
      profile_lastLoginAt: now,
      profile_wechatNickname: nickname || user.profile_wechatNickname,
      profile_wechatAvatar: avatar || user.profile_wechatAvatar,
      phoneNumber: phoneNumber || user.phoneNumber,
      updatedAt: now
    }

    return { user: sanitizeUser(updatedUser), isNewUser: false }
  }

  // 3. 新用户，创建记录
  console.log('未找到用户，准备创建新用户')
  const userId = generateId()
  const username = nickname || `微信用户_${openid.substring(0, 6)}`
  const endDate = now + 30 * 24 * 60 * 60 * 1000 // 免费期30天

  const insertSQL = `INSERT INTO users (
    _id, _openid, union_id, username, email, phoneNumber, password,
    subscription_plan, subscription_status, subscription_startDate, subscription_endDate,
    usage_diagnoseToday, usage_diagnoseTotal, usage_identifyToday, usage_identifyTotal, usage_lastResetDate,
    profile_avatar, profile_bio, profile_wechatNickname, profile_wechatAvatar, profile_createdAt, profile_lastLoginAt,
    isActive, createdAt, updatedAt
  ) VALUES (
    {{userId}}, {{openid}}, {{union_id}}, {{username}}, {{email}}, {{phoneNumber}}, {{password}},
    {{plan}}, {{status}}, {{startDate}}, {{endDate}},
    {{diagnoseToday}}, {{diagnoseTotal}}, {{identifyToday}}, {{identifyTotal}}, {{lastResetDate}},
    {{avatar}}, {{bio}}, {{wechatNickname}}, {{wechatAvatar}}, {{createdAt}}, {{lastLoginAt}},
    {{isActive}}, {{createdAt2}}, {{updatedAt}}
  )`

  await models.$runSQL(insertSQL, {
    userId,
    openid,
    union_id: union_id || null,
    username,
    email: null,
    phoneNumber: phoneNumber || null,
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
  })

  console.log('新用户创建成功，userId:', userId)

  // 构造新用户对象
  const newUser = {
    _id: userId,
    _openid: openid,
    union_id: union_id || '',
    username,
    email: '',
    phoneNumber: phoneNumber || '',
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
  }

  console.log('构造的新用户对象:', JSON.stringify(newUser))

  return { user: sanitizeUser(newUser), isNewUser: true }
}

/**
 * 获取用户信息
 */
async function getUserById(userId) {
  const sql = 'SELECT * FROM users WHERE _id = {{userId}} LIMIT 1'
  const result = await models.$runSQL(sql, { userId })

  console.log('getUserById 查询结果:', JSON.stringify(result))

  const users = result?.data?.executeResultList || []

  if (users.length === 0) {
    throw new Error('用户不存在')
  }

  return users[0]
}

/**
 * 通过 Union_ID 获取用户
 */
async function getUserByUnionId(unionId) {
  const sql = 'SELECT * FROM users WHERE union_id = {{unionId}} LIMIT 1'
  const result = await models.$runSQL(sql, { unionId })

  const users = result?.data?.executeResultList || []

  if (users.length === 0) {
    throw new Error('用户不存在')
  }

  return sanitizeUser(users[0])
}

/**
 * 通过 OpenID 获取用户
 */
async function getUserByOpenid(openid) {
  const sql = 'SELECT * FROM users WHERE _openid = {{openid}} LIMIT 1'
  const result = await models.$runSQL(sql, { openid })

  const users = result?.data?.executeResultList || []

  if (users.length === 0) {
    throw new Error('用户不存在')
  }

  return sanitizeUser(users[0])
}

/**
 * 通过邮箱获取用户
 */
async function getUserByEmail(email) {
  const sql = 'SELECT * FROM users WHERE email = {{email}} LIMIT 1'
  const result = await models.$runSQL(sql, { email })

  const users = result?.data?.executeResultList || []

  if (users.length === 0) {
    throw new Error('用户不存在')
  }

  return sanitizeUser(users[0])
}

/**
 * 更新用户邮箱
 */
async function updateUserEmail(userId, email) {
  // 检查邮箱是否已被其他用户使用
  if (email) {
    const checkSQL = 'SELECT * FROM users WHERE email = {{email}} AND _id != {{userId}} LIMIT 1'
    const result = await models.$runSQL(checkSQL, { email, userId })

    const existingUsers = result?.data?.executeResultList || []

    if (existingUsers.length > 0) {
      throw new Error('邮箱已被其他用户使用')
    }
  }

  const updateSQL = 'UPDATE users SET email = {{email}}, updatedAt = {{now}} WHERE _id = {{userId}}'
  await models.$runSQL(updateSQL, {
    email: email || null,
    now: Date.now(),
    userId
  })

  const updatedUser = await getUserById(userId)
  return sanitizeUser(updatedUser)
}

/**
 * 更新用户手机号
 */
async function updateUserPhoneNumber(userId, phoneNumber) {
  const updateSQL =
    'UPDATE users SET phoneNumber = {{phoneNumber}}, updatedAt = {{now}} WHERE _id = {{userId}}'
  await models.$runSQL(updateSQL, {
    phoneNumber: phoneNumber || null,
    now: Date.now(),
    userId
  })

  const updatedUser = await getUserById(userId)
  return sanitizeUser(updatedUser)
}

exports.main = async (event, context) => {
  try {
    const { action, data, code: loginCode, phoneCode } = event

    // 使用 @cloudbase/node-sdk 获取用户信息
    const app = tcb.init({ env: context.namespace || 'cloud1-2grufevs395a9d5e' })
    const auth = app.auth()
    const userInfo = auth.getUserInfo()

    console.log('获取到的用户信息:', JSON.stringify(userInfo))

    const {
      openId, // 微信openId，非微信授权登录则空
      appId, // 微信appId，非微信授权登录则空
      uid, // 用户唯一ID
      customUserId // 开发者自定义的用户唯一id，非自定义登录则空
    } = userInfo

    // 使用 openId 作为用户的 openid
    const openid = openId || uid || customUserId

    if (!openid) {
      throw new Error('无法获取用户标识信息')
    }

    switch (action) {
      case 'wechatLogin':
        // 微信登录/注册
        const wechatData = {
          openid: openid,
          union_id: '', // @cloudbase/node-sdk 不提供 UNIONID
          nickname: '',
          avatar: ''
        }

        const wechatResult = await wechatLogin(wechatData, context)
        return {
          code: 200,
          message: wechatResult.isNewUser ? '注册成功' : '登录成功',
          data: wechatResult
        }

      case 'phoneLogin':
        // 手机号登录/注册
        if (!phoneCode) {
          throw new Error('缺少手机号 code')
        }

        // 由于 @cloudbase/node-sdk 不提供微信 API 访问，这里需要其他方式获取手机号
        // 暂时使用模拟的手机号，实际项目中需要通过其他方式获取
        let phoneNumber = ''
        try {
          // 这里可以调用其他云函数或服务来获取手机号
          // 暂时使用模拟数据
          phoneNumber = '13800138000' // 模拟手机号
          console.log('使用模拟手机号:', phoneNumber)
        } catch (error) {
          console.error('获取手机号失败:', error)
        }

        const phoneWechatData = {
          openid: openid,
          union_id: '', // @cloudbase/node-sdk 不提供 UNIONID
          nickname: '',
          avatar: '',
          phoneNumber: phoneNumber
        }

        const phoneLoginResult = await wechatLogin(phoneWechatData)
        return {
          code: 200,
          message: phoneLoginResult.isNewUser ? '注册成功' : '登录成功',
          data: phoneLoginResult
        }

      case 'updateEmail':
        if (!data || !data.userId || !data.email) {
          throw new Error('缺少必要参数')
        }
        const emailResult = await updateUserEmail(data.userId, data.email)
        return { code: 200, message: '邮箱更新成功', data: emailResult }

      case 'updatePhoneNumber':
        if (!data || !data.userId || !data.phoneNumber) {
          throw new Error('缺少必要参数')
        }
        const phoneResult = await updateUserPhoneNumber(data.userId, data.phoneNumber)
        return { code: 200, message: '手机号更新成功', data: phoneResult }

      case 'getUserByUnionId':
        if (!data || !data.union_id) {
          throw new Error('缺少 union_id')
        }
        const userByUnionId = await getUserByUnionId(data.union_id)
        return { code: 200, message: '获取成功', data: userByUnionId }

      case 'getUserByOpenid':
        if (!data || !data.openid) {
          throw new Error('缺少 openid')
        }
        const userByOpenid = await getUserByOpenid(data.openid)
        return { code: 200, message: '获取成功', data: userByOpenid }

      case 'getUserByEmail':
        if (!data || !data.email) {
          throw new Error('缺少邮箱')
        }
        const userByEmail = await getUserByEmail(data.email)
        return { code: 200, message: '获取成功', data: userByEmail }

      default:
        return { code: 400, message: '无效操作', data: null }
    }
  } catch (error) {
    console.error('错误:', error)
    return { code: 500, message: error.message, data: null }
  }
}
