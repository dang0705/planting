'use strict'

const tcb = require('@cloudbase/node-sdk')
const { resolveCloudbaseEnvId } = require('../layer/utils/runtime-env')

exports.main = async (event, context) => {
  const app = tcb.init({
    env: resolveCloudbaseEnvId(context)
  })
  const auth = app.auth()
  const userInfo = auth.getUserInfo() || {}

  return {
    openid: userInfo.openId || '',
    appid: userInfo.appId || '',
    unionid: userInfo.unionId || '',
    uid: userInfo.uid || '',
    customUserId: userInfo.customUserId || ''
  }
}
