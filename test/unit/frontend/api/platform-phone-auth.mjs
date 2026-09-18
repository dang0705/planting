import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const source = fs
  .readFileSync(path.join(repoRoot, 'src/api/platform-phone-auth.js'), 'utf8')
  .replace(
    "import { requestHttpFunction } from '@/api/http'",
    'const requestHttpFunction = async () => ({ code: 200, data: { session: {} } })'
  )
  .replace(
    "import { clearPlatformSession, savePlatformSession } from '@/api/platform-session'",
    'const clearPlatformSession = () => {}; const savePlatformSession = () => {}'
  )
  .replace(
    "import { IS_LOCAL_API_BASE_URL, PLATFORM_PHONE_BOOTSTRAP_BASE_URL } from '@/api/env'",
    'const IS_LOCAL_API_BASE_URL = true; const PLATFORM_PHONE_BOOTSTRAP_BASE_URL = ""'
  )
const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)

const originalUni = globalThis.uni
const loginOptions = []
try {
  globalThis.uni = {
    login(options) {
      loginOptions.push(options)
      options.success({ code: `platform-code-${loginOptions.length}`, isLogin: true })
    }
  }

  await module.createPlatformLoginCode()
  assert.equal(loginOptions[0].force, false, '自动准备登录凭证必须静默登录')

  await module.createPlatformLoginCode({ force: true })
  assert.equal(loginOptions[1].force, true, '显式重试才允许强制拉起宿主登录')
} finally {
  globalThis.uni = originalUni
}

console.log('platform phone auth silent-login tests passed')
