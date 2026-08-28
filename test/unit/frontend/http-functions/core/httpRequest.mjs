import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/http-functions/core/httpRequest.js'),
  'utf8'
)

async function loadHttpRequestModule({ isLocal, devOpenid, identity = {} }) {
  const transformed = source
    .replace(
      "import { BASE_URL, IS_LOCAL_API_BASE_URL, shouldAppendWebFunctionFlag } from '@/api/env'",
      `const BASE_URL = 'https://functions.example.com';\nconst IS_LOCAL_API_BASE_URL = ${isLocal};\nconst shouldAppendWebFunctionFlag = () => true`
    )
    .replace(
      "import { getCloudbaseUserIdentity } from '@/utils/cloudbase-auth'",
      `const getCloudbaseUserIdentity = async () => (${JSON.stringify(identity)})`
    )
    .replace(
      "import { getRequestAppEnvHeader } from '@/utils/runtime-env'",
      "const getRequestAppEnvHeader = () => 'development'"
    )
    .replace(/import\.meta\.env\.VITE_DEV_OPENID/g, JSON.stringify(devOpenid))
  return import(`data:text/javascript,${encodeURIComponent(transformed)}`)
}

const originalUni = globalThis.uni
const originalWx = globalThis.wx

try {
  globalThis.uni = { getStorageSync: () => ({ openid: 'cached-user' }) }
  delete globalThis.wx
  const localModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local'
  })
  const localHeaders = await localModule.resolveHttpFunctionAuth()
  assert.equal(localHeaders['x-wx-openid'], 'dev_terminal_mp_local')
  assert.equal(localHeaders.Authorization, undefined)

  globalThis.wx = { cloud: {} }
  const localMiniProgramModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'unused-local-ticket' }
  })
  const localMiniProgramHeaders = await localMiniProgramModule.resolveHttpFunctionAuth()
  assert.equal(localMiniProgramHeaders['x-wx-openid'], 'wx_live_user')
  assert.equal(localMiniProgramHeaders.Authorization, undefined)

  const remoteMiniProgramModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'signed-ticket' }
  })
  const remoteHeaders = await remoteMiniProgramModule.resolveHttpFunctionAuth({
    headers: { Authorization: 'Bearer attacker-controlled' }
  })
  assert.equal(remoteHeaders.Authorization, 'Bearer signed-ticket')
  assert.equal(remoteHeaders['x-wx-openid'], undefined)
  assert.equal(remoteHeaders['x-openid'], undefined)

  const ticketlessMiniProgramModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user' }
  })
  await assert.rejects(
    ticketlessMiniProgramModule.resolveHttpFunctionAuth(),
    /身份票据获取失败/
  )

  delete globalThis.wx
  const remoteH5Module = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local'
  })
  const remoteH5Headers = await remoteH5Module.resolveHttpFunctionAuth()
  assert.equal(remoteH5Headers['x-wx-openid'], undefined)
  assert.equal(remoteH5Headers.Authorization, undefined)

  const noAuthHeaders = await remoteH5Module.resolveHttpFunctionAuth({
    auth: false,
    headers: { 'X-Custom': 'preserved' }
  })
  assert.equal(noAuthHeaders['X-Custom'], 'preserved')
} finally {
  globalThis.uni = originalUni
  globalThis.wx = originalWx
}

console.log('http request identity transport tests passed')
