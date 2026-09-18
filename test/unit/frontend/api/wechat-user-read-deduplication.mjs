import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const source = fs.readFileSync(path.join(repoRoot, 'src/api/wechat.js'), 'utf8')

async function loadWechatModule({
  isLocal = false,
  platformToken = 'platform-session-token',
  identityTicket = '',
  refreshedIdentity = {},
  fetchedUser = null
}) {
  const transformed = source
    .replace(
      /import \{\s*getWechatPhoneProfile,\s*refreshPlatformHttpIdentity\s*\} from '@\/utils\/cloudbase-auth'/u,
      `const getWechatPhoneProfile = async () => ({ phoneProof: {} })
const refreshPlatformHttpIdentity = async () => {
        globalThis.__refreshPlatformHttpIdentityCalls = (globalThis.__refreshPlatformHttpIdentityCalls || 0) + 1
        return ${JSON.stringify(refreshedIdentity)}
      }`
    )
    .replace(
      /import \{\s*clearPlatformSession,\s*getActivePlatformAccessToken,\s*getActivePlatformIdentityTicket,\s*savePlatformIdentityTicket,\s*savePlatformSession\s*\} from '@\/api\/platform-session'/u,
      `const clearPlatformSession = () => {}
const getActivePlatformIdentityTicket = () => ${JSON.stringify(identityTicket)}
const getActivePlatformAccessToken = () => ${JSON.stringify(platformToken)}
const savePlatformIdentityTicket = (...args) => { globalThis.__savedPlatformIdentityTicket = args }
const savePlatformSession = () => {}`
    )
    .replace(
      "import { IS_LOCAL_API_BASE_URL, PLATFORM_PHONE_BOOTSTRAP_BASE_URL } from '@/api/env'",
      `const IS_LOCAL_API_BASE_URL = ${isLocal}; const PLATFORM_PHONE_BOOTSTRAP_BASE_URL = ''`
    )
    .replace(
      "import { requestHttpFunction } from '@/api/http'",
      'const requestHttpFunction = async () => ({ code: 200, data: { session: {} } })'
    )
    .replace(
      "import { executeAuthUserMutation } from '@/vue-query/auth/mutations/user.js'",
      'const executeAuthUserMutation = async () => ({ code: 200, data: {} })'
    )
    .replace(
      "import { fetchAuthUserByOpenidQuery } from '@/vue-query/auth/queries/user.js'",
      `const fetchAuthUserByOpenidQuery = async userId => {
        globalThis.__fetchAuthUserByOpenidQueryCalls = (globalThis.__fetchAuthUserByOpenidQueryCalls || []).concat(userId)
        return { code: 200, data: ${JSON.stringify(fetchedUser)} }
      }`
    )

  return import(`data:text/javascript,${encodeURIComponent(transformed)}`)
}

const previousRefreshCalls = globalThis.__refreshPlatformHttpIdentityCalls
const previousFetchCalls = globalThis.__fetchAuthUserByOpenidQueryCalls
const previousSavedTicket = globalThis.__savedPlatformIdentityTicket

try {
  globalThis.__refreshPlatformHttpIdentityCalls = 0
  globalThis.__fetchAuthUserByOpenidQueryCalls = []
  delete globalThis.__savedPlatformIdentityTicket

  const refreshedUser = {
    _id: 'user-1',
    wechat_openid: 'openid-1',
    nickname: '绿色用户'
  }
  const refreshedTicketExpiresAt = Date.now() + 60_000
  const reusedModule = await loadWechatModule({
    refreshedIdentity: {
      user: refreshedUser,
      httpIdentityTicket: 'fresh-ticket',
      httpIdentityTicketExpiresAt: refreshedTicketExpiresAt
    }
  })
  assert.deepEqual(await reusedModule.getUserById('user-1'), refreshedUser)
  assert.equal(globalThis.__refreshPlatformHttpIdentityCalls, 1)
  assert.deepEqual(globalThis.__fetchAuthUserByOpenidQueryCalls, [])
  assert.deepEqual(globalThis.__savedPlatformIdentityTicket, [
    'fresh-ticket',
    refreshedTicketExpiresAt
  ])

  globalThis.__refreshPlatformHttpIdentityCalls = 0
  globalThis.__fetchAuthUserByOpenidQueryCalls = []
  const cachedTicketModule = await loadWechatModule({
    identityTicket: 'cached-ticket',
    fetchedUser: refreshedUser
  })
  assert.deepEqual(await cachedTicketModule.getUserById('user-1'), refreshedUser)
  assert.equal(globalThis.__refreshPlatformHttpIdentityCalls, 0)
  assert.deepEqual(globalThis.__fetchAuthUserByOpenidQueryCalls, ['user-1'])

  globalThis.__refreshPlatformHttpIdentityCalls = 0
  globalThis.__fetchAuthUserByOpenidQueryCalls = []
  const localModule = await loadWechatModule({
    isLocal: true,
    refreshedIdentity: { user: refreshedUser },
    fetchedUser: refreshedUser
  })
  assert.deepEqual(await localModule.getUserById('user-1'), refreshedUser)
  assert.equal(globalThis.__refreshPlatformHttpIdentityCalls, 0)
  assert.deepEqual(globalThis.__fetchAuthUserByOpenidQueryCalls, ['user-1'])
} finally {
  if (previousRefreshCalls === undefined) {
    delete globalThis.__refreshPlatformHttpIdentityCalls
  } else {
    globalThis.__refreshPlatformHttpIdentityCalls = previousRefreshCalls
  }
  if (previousFetchCalls === undefined) {
    delete globalThis.__fetchAuthUserByOpenidQueryCalls
  } else {
    globalThis.__fetchAuthUserByOpenidQueryCalls = previousFetchCalls
  }
  if (previousSavedTicket === undefined) {
    delete globalThis.__savedPlatformIdentityTicket
  } else {
    globalThis.__savedPlatformIdentityTicket = previousSavedTicket
  }
}

console.log(
  'wechat auth user read deduplication tests passed data_mode=unit_fake test_kind=unit_logic'
)
