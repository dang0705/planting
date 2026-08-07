import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const sourcePath = path.join(repoRoot, 'src/http-functions/core/httpRequest.js')
const source = fs.readFileSync(sourcePath, 'utf8')

async function loadHttpRequestModule({ isLocal, devOpenid, token = '', cloudOpenid = '' }) {
  const transformed = source
    .replace(
      "import { BASE_URL, IS_LOCAL_API_BASE_URL, shouldAppendWebFunctionFlag } from '@/api/env'",
      `const BASE_URL = 'https://functions.example.com';\nconst IS_LOCAL_API_BASE_URL = ${isLocal};\nconst shouldAppendWebFunctionFlag = () => true`
    )
    .replace(
      "import { getCloudbaseAccessToken, getCloudbaseUserIdentity } from '@/utils/cloudbase-auth'",
      `const getCloudbaseAccessToken = async () => ${JSON.stringify(token)};\nconst getCloudbaseUserIdentity = async () => ({ openid: ${JSON.stringify(cloudOpenid)} })`
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
  let localStorageReads = 0
  globalThis.uni = {
    getStorageSync: () => {
      localStorageReads += 1
      return { openid: 'cached-wrong-user' }
    }
  }
  delete globalThis.wx
  const localModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local'
  })
  const localHeaders = await localModule.resolveHttpFunctionAuth()
  assert.equal(localHeaders['x-wx-openid'], 'dev_terminal_mp_local')
  assert.equal(localHeaders['x-openid'], 'dev_terminal_mp_local')
  assert.equal(localStorageReads, 0, 'local requests must not read a cached user before VITE_DEV_OPENID')

  globalThis.uni = {
    getStorageSync: () => ({ openid: 'cached-remote-user' })
  }
  const remoteModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local'
  })
  const remoteHeaders = await remoteModule.resolveHttpFunctionAuth()
  assert.equal(remoteHeaders['x-wx-openid'], 'cached-remote-user')
  assert.equal(remoteHeaders['x-openid'], 'cached-remote-user')
  assert.equal(remoteHeaders.Authorization, undefined)

  globalThis.uni = { getStorageSync: () => ({}) }
  globalThis.wx = { cloud: {} }
  const remoteFallbackModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    token: 'remote-cloudbase-token',
    cloudOpenid: 'cloudbase-remote-user'
  })
  const remoteFallbackHeaders = await remoteFallbackModule.resolveHttpFunctionAuth()
  assert.equal(remoteFallbackHeaders['x-wx-openid'], 'cloudbase-remote-user')
  assert.equal(remoteFallbackHeaders['x-openid'], 'cloudbase-remote-user')
  assert.equal(remoteFallbackHeaders.Authorization, 'Bearer remote-cloudbase-token')
} finally {
  globalThis.uni = originalUni
  globalThis.wx = originalWx
}

console.log('http request identity precedence tests passed')
