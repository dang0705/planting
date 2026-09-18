import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, 'src/utils/cloudbase-auth.js')
const source = fs
  .readFileSync(sourcePath, 'utf8')
  .replace(
    "import { IS_LOCAL_API_BASE_URL, PUBLIC_HTTP_FUNCTION_BASE_URL } from '@/api/env'",
    "const IS_LOCAL_API_BASE_URL = false; const PUBLIC_HTTP_FUNCTION_BASE_URL = 'https://public.example.com'"
  )
  .replace(
    "import { CLOUDBASE_ENV_ID, getRequestAppEnvHeader } from '@/utils/runtime-env'",
    "const CLOUDBASE_ENV_ID = 'cloud1-dev'; const getRequestAppEnvHeader = () => 'development'"
  )
  .replace(
    /import \{[\s\S]*?\} from '@\/api\/platform-session'/u,
    "const getActivePlatformAccessToken = () => globalThis.__platformSession?.accessToken || ''; const savePlatformIdentityTicket = (...args) => globalThis.__savedPlatformIdentityTicket = args; const clearPlatformSession = () => { globalThis.__platformSession = null; globalThis.__platformSessionCleared = true }"
  )

// 这是 source_contract / unit_fake：验证小程序身份模块不会把 Web SDK 登录
// 打进 AppService；真实登录态仍需由 Automator live 运行时验证。
assert.doesNotMatch(source, /@cloudbase\/js-sdk/u)
assert.match(source, /ensureWechatCloudInitialized/u)
assert.match(source, /name: 'wechat-identity'/u)
assert.match(source, /httpIdentityTicket: result\.httpIdentityTicket/u)

const originalWx = globalThis.wx
try {
  let cloudInitOptions = null
  globalThis.wx = {
    cloud: {
      init(options) {
        cloudInitOptions = options
      },
      callFunction(options) {
        options.success({
          result: {
            openid: 'runtime-openid',
            unionid: 'wx-union',
            httpIdentityTicket: 'runtime-http-ticket'
          }
        })
      }
    }
  }
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)
  assert.deepEqual(await module.getCloudbaseUserIdentity(), {
    openid: 'runtime-openid',
    uid: '',
    customUserId: '',
    appid: '',
    unionid: 'wx-union',
    httpIdentityTicket: 'runtime-http-ticket'
  })
  assert.deepEqual(cloudInitOptions, { env: 'cloud1-dev', traceUser: false })

  let refreshRequest = null
  globalThis.__platformSession = { accessToken: 'cross-platform-session' }
  globalThis.uni = {
    request(options) {
      refreshRequest = options
      options.success({
        statusCode: 200,
        data: {
          code: 200,
          data: {
            _openid: 'cross_platform_storage_user',
            httpIdentityTicket: 'fresh-signed-ticket',
            httpIdentityTicketExpiresAt: Date.now() + 60_000
          }
        }
      })
      return {}
    }
  }
  const [firstRefresh, secondRefresh] = await Promise.all([
    module.refreshPlatformHttpIdentity(),
    module.refreshPlatformHttpIdentity()
  ])
  assert.equal(firstRefresh.httpIdentityTicket, 'fresh-signed-ticket')
  assert.equal(secondRefresh.httpIdentityTicket, 'fresh-signed-ticket')
  assert.equal(refreshRequest?.url, 'https://public.example.com/auth-user-http/auth/user')
  assert.equal(refreshRequest?.header['x-planting-platform-session'], 'cross-platform-session')
  assert.equal(refreshRequest?.header['x-app-env'], 'development')
  assert.deepEqual(refreshRequest?.data, { action: 'getUserByOpenid', data: {} })
  assert.equal(globalThis.__savedPlatformIdentityTicket?.[0], 'fresh-signed-ticket')

  globalThis.__platformSession = { accessToken: 'expired-on-server-session' }
  globalThis.__platformSessionCleared = false
  globalThis.uni = {
    request(options) {
      options.success({
        statusCode: 401,
        data: { code: 401, message: '会话已失效', data: null }
      })
      return {}
    }
  }
  await assert.rejects(() => module.refreshPlatformHttpIdentity(), /会话已失效/u)
  assert.equal(globalThis.__platformSessionCleared, true)
} finally {
  if (originalWx === undefined) {
    delete globalThis.wx
  } else {
    globalThis.wx = originalWx
  }
}

console.log('cloudbase auth identity contract tests passed')
