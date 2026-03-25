/**
 * CloudBase Node SDK 模块
 * 用于 MySQL 数据库操作、AI 能力和用户信息获取
 */
const cloudbaseSDK = require('@cloudbase/node-sdk')

let cloudbaseApp = null

/**
 * 获取 CloudBase 实例（单例模式）
 */
function getCloudBase() {
  if (!cloudbaseApp) {
    cloudbaseApp = cloudbaseSDK.init({
      env: process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID,
      secretId: process.env.CLOUDBASE_SECRET_ID,
      secretKey: process.env.CLOUDBASE_SECRET_KEY
    })
  }
  return cloudbaseApp
}

/**
 * 获取用户信息（替代 wx-server-sdk 的 getWXContext）
 * @param {object} context - 云函数上下文
 * @returns {object} 用户信息对象
 */
function getUserInfo(context) {
  const runtimeEnv = context?.environment || context?.environ || {}
  const extendedContext = context?.extendedContext || {}

  const runtimeOpenId =
    runtimeEnv.WX_OPENID ||
    process.env.WX_OPENID ||
    ''
  const runtimeAppId =
    runtimeEnv.WX_APPID ||
    process.env.WX_APPID ||
    ''
  const runtimeUid =
    runtimeEnv.TCB_UUID ||
    extendedContext.userId ||
    process.env.TCB_UUID ||
    ''
  const runtimeCustomUserId =
    runtimeEnv.TCB_CUSTOM_USER_ID ||
    process.env.TCB_CUSTOM_USER_ID ||
    ''
  const runtimeUnionId =
    runtimeEnv.WX_UNIONID ||
    process.env.WX_UNIONID ||
    ''

  if (runtimeOpenId || runtimeUid || runtimeCustomUserId) {
    const openid = runtimeOpenId || runtimeUid || runtimeCustomUserId

    return {
      OPENID: openid,
      APPID: runtimeAppId,
      UNIONID: runtimeUnionId,
      ENV: context?.namespace || runtimeEnv.TCB_ENV || process.env.CLOUDBASE_ENV_ID
    }
  }

  const app = cloudbaseSDK.init({
    env: context.namespace || process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID
  })
  const auth = app.auth()
  const userInfo = auth.getUserInfo()

  const {
    openId, // 微信openId，非微信授权登录则空
    appId, // 微信appId，非微信授权登录则空
    uid, // 用户唯一ID
    customUserId // 开发者自定义的用户唯一id
  } = userInfo

  // 使用 openId 作为用户的 openid，如果不存在则使用 uid 或 customUserId
  const openid = openId || uid || customUserId

  return {
    OPENID: openid,
    APPID: appId,
    UNIONID: '', // CloudBase Node SDK 不提供 UNIONID
    ENV: context.namespace || process.env.CLOUDBASE_ENV_ID
  }
}

// 封装 models.$runSQL 方法
const models = {
  /**
   * 执行 SQL 语句
   * @param {string} sql - SQL 语句，使用 {{paramName}} 作为参数占位符
   * @param {object} params - 参数对象
   * @returns {Promise<{data: {executeResultList: Array}}>}
   */
  async $runSQL(sql, params = {}) {
    const app = getCloudBase()
    return app.models.$runSQL(sql, params)
  }
}

/**
 * 获取 AI 模块
 */
function ai() {
  const app = getCloudBase()
  return app.ai()
}

/**
 * 获取存储模块
 */
function storage() {
  const app = getCloudBase()
  return app.storage()
}

module.exports = {
  getCloudBase,
  models,
  ai,
  storage,
  getUserInfo
}
