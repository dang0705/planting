'use strict'

// The shared CloudBase layer is the single runtime dependency boundary for
// identity and HTTP-ticket helpers. Using `/opt/utils/*` keeps the deployed
// function consistent with the other cloud functions and avoids relying on a
// relative `../layer` directory that is not present in the function bundle.
const { getUserInfo } = require('/opt/utils/cloudbase')
const { createHttpIdentityTicket } = require('/opt/utils/http')

exports.main = async (event, context) => {
  const userInfo = getUserInfo(context) || {}

  const openid = userInfo.OPENID || ''
  const uid = userInfo.TCB_UUID || userInfo.uid || ''
  const customUserId = userInfo.TCB_CUSTOM_USER_ID || userInfo.customUserId || ''

  return {
    openid,
    appid: userInfo.APPID || '',
    unionid: userInfo.UNIONID || '',
    uid,
    customUserId,
    httpIdentityTicket: createHttpIdentityTicket({ openid, uid, customUserId })
  }
}
