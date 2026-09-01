'use strict'

const { getUserInfo } = require('/opt/utils/cloudbase')
const { createPhoneProof } = require('/opt/utils/platform-session')

function buildError(message, code = 'WECHAT_PHONE_AUTH_FAILED', statusCode = 401) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

async function fetchWechatJson(url, options = {}) {
  const response = await fetch(url, options)
  const result = await response.json().catch(() => ({}))
  if (!response.ok || Number(result?.errcode || 0) !== 0) {
    throw buildError('微信手机号授权验证失败，请重新授权')
  }
  return result
}

async function resolveWechatPhoneByCode({ appid, phoneCode, loginCode }) {
  const appSecret = String(process.env.WECHAT_MINIPROGRAM_APP_SECRET || '').trim()
  if (!phoneCode || !loginCode || !appSecret) {
    throw buildError('微信手机号授权服务端配置未完成', 'PLATFORM_AUTH_NOT_CONFIGURED', 503)
  }
  const sessionUrl = new URL(
    String(process.env.WECHAT_CODE2SESSION_URL || 'https://api.weixin.qq.com/sns/jscode2session')
  )
  sessionUrl.searchParams.set('appid', appid)
  sessionUrl.searchParams.set('secret', appSecret)
  sessionUrl.searchParams.set('js_code', loginCode)
  sessionUrl.searchParams.set('grant_type', 'authorization_code')
  const loginSession = await fetchWechatJson(sessionUrl)

  const tokenUrl = new URL(
    String(process.env.WECHAT_ACCESS_TOKEN_URL || 'https://api.weixin.qq.com/cgi-bin/token')
  )
  tokenUrl.searchParams.set('grant_type', 'client_credential')
  tokenUrl.searchParams.set('appid', appid)
  tokenUrl.searchParams.set('secret', appSecret)
  const token = await fetchWechatJson(tokenUrl)
  const phone = await fetchWechatJson(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token.access_token || '')}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: phoneCode }) }
  )
  const phoneInfo = phone?.phone_info || {}
  if (!loginSession.openid || !phoneInfo.purePhoneNumber) {
    throw buildError('微信手机号授权验证失败，请重新授权')
  }
  return {
    loginOpenid: String(loginSession.openid),
    phone: phoneInfo.purePhoneNumber,
    countryCode: phoneInfo.countryCode || '+86'
  }
}

exports.main = async (event, context) => {
  const runtimeUserInfo = getUserInfo(context) || {}
  const openid = String(runtimeUserInfo.OPENID || '').trim()
  const appid = String(runtimeUserInfo.APPID || '').trim()
  const weRunData = event?.weRunData || null

  if (!openid || !appid) {
    throw buildError('未获取到有效微信身份')
  }

  let phone
  let countryCode
  if (weRunData) {
    const phoneInfo = weRunData?.data || weRunData || null
    if (!phoneInfo?.phoneNumber && !phoneInfo?.purePhoneNumber) {
      throw buildError('未获取到有效手机号')
    }
    phone = phoneInfo.phoneNumber || phoneInfo.purePhoneNumber
    countryCode = phoneInfo.countryCode || '+86'
  } else {
    const verified = await resolveWechatPhoneByCode({
      appid,
      phoneCode: String(event?.code || ''),
      loginCode: String(event?.loginCode || '')
    })
    if (verified.loginOpenid !== openid) {
      throw buildError('微信登录身份与手机号授权不一致，请重新授权')
    }
    phone = verified.phone
    countryCode = verified.countryCode
  }

  return {
    phoneProof: createPhoneProof({
      platform: 'wechat_mp',
      appId: appid,
      platformUserId: openid,
      phone,
      countryCode
    })
  }
}
