'use strict'

const { getUserInfo } = require('/opt/utils/cloudbase')

function buildError(message) {
  const error = new Error(message)
  error.message = message
  return error
}

exports.main = async (event, context) => {
  const runtimeUserInfo = getUserInfo(context) || {}
  const openid = runtimeUserInfo.OPENID || ''
  const appid = runtimeUserInfo.APPID || ''
  const unionid = runtimeUserInfo.UNIONID || ''
  const weRunData = event?.weRunData || null

  if (!weRunData) {
    throw buildError('缺少手机号授权参数')
  }

  const phoneInfo = weRunData?.data || weRunData || null

  if (!phoneInfo?.phoneNumber && !phoneInfo?.purePhoneNumber) {
    throw buildError('未获取到有效手机号')
  }

  return {
    openid,
    appid,
    unionid,
    phoneNumber: phoneInfo.phoneNumber || phoneInfo.purePhoneNumber || '',
    purePhoneNumber: phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || '',
    countryCode: phoneInfo.countryCode || '+86'
  }
}
