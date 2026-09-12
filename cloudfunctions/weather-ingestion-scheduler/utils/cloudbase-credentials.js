'use strict'

/**
 * 云函数运行时会注入带 session token 的临时密钥。
 * 线上若同时残留旧的显式 CLOUDBASE_SECRET_*，必须优先使用运行时密钥，
 * 否则会出现 SecretId 不存在或 SIGN_PARAM_INVALID，进而中断天气归档。
 * 本地开发仍支持显式密钥；这里只返回 SDK 初始化所需字段，不输出凭据。
 */
function resolveCloudBaseCredentials(env = process.env) {
  const runtimeSecretId = String(env.TENCENTCLOUD_SECRETID || '').trim()
  const runtimeSecretKey = String(env.TENCENTCLOUD_SECRETKEY || '').trim()
  const runtimeSessionToken = String(
    env.TENCENTCLOUD_SESSIONTOKEN || env.TENCENTCLOUD_SESSION_TOKEN || ''
  ).trim()
  if (runtimeSecretId && runtimeSecretKey && runtimeSessionToken) {
    return {
      secretId: runtimeSecretId,
      secretKey: runtimeSecretKey,
      sessionToken: runtimeSessionToken
    }
  }

  const secretId = String(
    env.CLOUDBASE_SECRET_ID || env.TENCENT_SECRET_ID || env.TENCENTCLOUD_SECRETID || ''
  ).trim()
  const secretKey = String(
    env.CLOUDBASE_SECRET_KEY || env.TENCENT_SECRET_KEY || env.TENCENTCLOUD_SECRETKEY || ''
  ).trim()
  const sessionToken = String(
    env.CLOUDBASE_SESSION_TOKEN ||
      env.CLOUDBASE_TOKEN ||
      env.TENCENT_SESSION_TOKEN ||
      env.TENCENTCLOUD_SESSIONTOKEN ||
      env.TENCENTCLOUD_SESSION_TOKEN ||
      ''
  ).trim()
  return {
    ...(secretId ? { secretId } : {}),
    ...(secretKey ? { secretKey } : {}),
    ...(sessionToken ? { sessionToken } : {})
  }
}

function buildCloudBaseInitOptions(env = process.env) {
  const envId = String(env.CLOUDBASE_ENV_ID || env.TCB_ENV || '').trim()
  const credentials = resolveCloudBaseCredentials(env)
  return {
    ...(envId ? { env: envId } : {}),
    ...credentials
  }
}

module.exports = {
  buildCloudBaseInitOptions,
  resolveCloudBaseCredentials
}
