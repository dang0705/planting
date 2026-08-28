'use strict'

const tcb = require('@cloudbase/node-sdk')
const { resolveCloudbaseEnvId } = require('../layer/utils/runtime-env')
const { createHttpIdentityTicket } = require('../layer/utils/http')

exports.main = async (event, context) => {
  const app = tcb.init({
    env: resolveCloudbaseEnvId(context)
  })
  const auth = app.auth()
  const userInfo = auth.getUserInfo() || {}

  const openid = userInfo.openId || ''
  const uid = userInfo.uid || ''
  const customUserId = userInfo.customUserId || ''

  return {
    openid,
    appid: userInfo.appId || '',
    unionid: userInfo.unionId || '',
    uid,
    customUserId,
    httpIdentityTicket: createHttpIdentityTicket({ openid, uid, customUserId })
  }
}
