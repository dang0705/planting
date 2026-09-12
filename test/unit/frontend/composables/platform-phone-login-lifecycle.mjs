/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const composable = read('src/composables/usePlatformPhoneLogin.js')
assert.match(composable, /typeof tt !== 'undefined'/u)
const composableModuleSource = composable
  .replace(
    "import { onMounted, ref } from 'vue'",
    `globalThis.__platformLoginMountedCallbacks = []
const onMounted = callback => globalThis.__platformLoginMountedCallbacks.push(callback)
const ref = value => ({ value })`
  )
  .replace(
    "import { authorizePlatformPhone, createPlatformLoginCode } from '@/api/platform-phone-auth.js'",
    `globalThis.__platformLoginOptions = []
const authorizePlatformPhone = async () => ({})
const createPlatformLoginCode = async options => {
  globalThis.__platformLoginOptions.push(options)
  return 'platform-code'
}`
  )
const composableModule = await import(
  `data:text/javascript,${encodeURIComponent(composableModuleSource)}`
)
const previousUni = globalThis.uni
const previousDouyin = globalThis.tt
try {
  let uniLoginCalls = 0
  globalThis.uni = {
    login() {
      uniLoginCalls += 1
    }
  }
  globalThis.tt = undefined
  const login = composableModule.usePlatformPhoneLogin()
  for (const callback of globalThis.__platformLoginMountedCallbacks) {
    await callback()
  }
  assert.equal(uniLoginCalls, 0, '挂载新增植物页的登录组件不得调用 uni.login')
  assert.deepEqual(
    globalThis.__platformLoginOptions,
    [],
    '挂载新增植物页的登录组件不得准备平台凭证'
  )
  await login.prepareLoginCode()
  assert.deepEqual(
    globalThis.__platformLoginOptions,
    [{ force: false }],
    '用户主动点击后才允许静默准备平台凭证'
  )
} finally {
  globalThis.uni = previousUni
  globalThis.tt = previousDouyin
  delete globalThis.__platformLoginMountedCallbacks
  delete globalThis.__platformLoginOptions
}

const mountedBody = composable.match(/onMounted\(\(\) => \{([\s\S]*?)\n\s*\}\)/u)?.[1] || ''
assert.doesNotMatch(
  mountedBody,
  /prepareLoginCode|ensureLoginCode|createPlatformLoginCode/u,
  '页面挂载时不得准备平台手机号登录凭证'
)

const indexPage = read('src/pages/index/index.vue')
assert.match(indexPage, /:open-type="loginCodeReady \? 'getPhoneNumber' : ''"/u)
assert.match(indexPage, /@click="handlePlatformLoginTap"/u)

const loginModal = read('src/components/LoginModal.vue')
assert.doesNotMatch(loginModal, /import \{ ref, watch \}/u)
assert.doesNotMatch(loginModal, /watch\(\s*\(\) => props\.show/u)
assert.match(loginModal, /<PlatformPrivacyModal\s+v-if="show"/u)
assert.match(loginModal, /:open-type="loginCodeReady \? 'getPhoneNumber' : ''"/u)
assert.match(loginModal, /@click="handlePlatformLoginTap"/u)

console.log('platform phone login lifecycle contract passed data_mode=unit_fake')
