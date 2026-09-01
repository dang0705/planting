'use strict'

const {
  jsonResponse,
  internalServerError,
  methodNotAllowed,
  notFound,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { createPlatformError, normalizePlatform } = require('/opt/utils/platform-session')
const {
  assertNoClientIdentityFields,
  platformPhoneLogin
} = require('/opt/utils/platform-phone-bootstrap')

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

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'POST'

  try {
    // 健康探针是运行维护接口，不承载任何业务动作。
    if (path.includes('/auth/platform-phone/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (!path.includes('/auth/platform-phone')) {
      return notFound(path)
    }
    if (method !== 'POST') {
      return methodNotAllowed(method)
    }

    const payload = request.body && typeof request.body === 'object' ? request.body : {}
    const action = String(payload.action || '')
    if (action !== 'platformPhoneLogin') {
      throw createPlatformError(
        '手机号引导登录接口仅支持 platformPhoneLogin',
        'PLATFORM_PHONE_ACTION_REJECTED',
        400
      )
    }

    const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
    assertNoClientIdentityFields(data)
    const platform = normalizePlatform(data.platform)
    if (!platform) {
      throw createPlatformError('平台登录参数无效', 'PLATFORM_AUTH_INVALID', 400)
    }

    console.log('platform-phone-bootstrap-http action:', {
      action,
      platform,
      hasLoginCode: Boolean(data.loginCode),
      hasPhoneCode: Boolean(data.phoneCode),
      hasEncryptedData: Boolean(data.encryptedData)
    })

    const result = await platformPhoneLogin({
      platform,
      data,
      resolvedIdentity: null
    })
    return jsonResponse(200, { code: 200, message: '登录成功', data: result })
  } catch (error) {
    console.error('platform-phone-bootstrap-http error:', {
      code: error?.code || '',
      statusCode: Number(error?.statusCode || 0),
      message: error?.message || 'unknown'
    })
    const publicError = getErrorResponse(error)
    if (publicError) {
      return publicError
    }
    const schemaNotReady = getSchemaNotReadyResponse(error)
    if (schemaNotReady) {
      return schemaNotReady
    }
    return internalServerError('手机号登录服务暂时不可用，请稍后重试')
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
