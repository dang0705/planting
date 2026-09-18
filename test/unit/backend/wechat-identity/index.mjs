import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(repoRoot, 'cloudfunctions/wechat-identity/index.js')
const originalLoad = Module._load

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return {
        getUserInfo: () => ({
          OPENID: 'wx_identity_user',
          TCB_UUID: 'uid_identity_user',
          TCB_CUSTOM_USER_ID: 'custom_identity_user',
          APPID: 'wx_app',
          UNIONID: 'union_id'
        })
      }
    }
    if (request === '/opt/utils/http') {
      return {
        createHttpIdentityTicket: identity => `signed:${identity.openid}:${identity.uid}`
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[sourcePath]
  const { main } = require(sourcePath)
  const result = await main({}, {})

  assert.equal(result.openid, 'wx_identity_user')
  assert.equal(result.uid, 'uid_identity_user')
  assert.equal(result.customUserId, 'custom_identity_user')
  assert.equal(result.httpIdentityTicket, 'signed:wx_identity_user:uid_identity_user')
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('wechat identity ticket tests passed')
