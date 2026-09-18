/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const gate = read('src/utils/phone-login-gate.js')
const layout = read('src/Layout.vue')
const loginModal = read('src/components/LoginModal.vue')
const bottomSheet = read('src/components/common/BottomSheet.vue')
const platformPhoneLogin = read('src/composables/usePlatformPhoneLogin.js')
const main = read('src/main.js')
const userStore = read('src/store/user.js')

assert.match(
  gate,
  /const NAVIGATION_METHODS = \['navigateTo', 'redirectTo', 'reLaunch', 'switchTab'\]/u
)
assert.match(gate, /export function requestPhoneLogin/u)
assert.match(gate, /export function completePhoneLogin/u)
assert.match(gate, /export function cancelPhoneLogin/u)
assert.match(gate, /export function installPhoneLoginNavigationGate/u)
assert.match(gate, /installPhoneLoginNavigationGate\(runtimeUni = getRuntimeUni\(\)\)/u)
assert.match(gate, /requestPhoneLogin\(\{ message: '登录后才能继续使用青花植' \}\)/u)
assert.match(gate, /getPhoneLoginGateSkipFlag/u)

assert.match(layout, /<LoginModal/u)
assert.match(layout, /:show="phoneLoginVisible"/u)
assert.match(layout, /@success="completePhoneLogin"/u)
assert.match(layout, /@close="cancelPhoneLogin"/u)
assert.match(layout, /getPhoneLoginGateSkipFlag/u)

assert.match(loginModal, /id="login-modal"/u)
assert.match(loginModal, /id="login-modal-panel"/u)
assert.match(loginModal, /<BottomSheet/u)
assert.match(loginModal, /:animation="true"/u)
assert.match(loginModal, /bottomSheetRef/u)
assert.match(loginModal, /id="login-modal-phone-login-button"/u)
assert.match(loginModal, /id="login-modal-other-phone-login-button"/u)
assert.match(loginModal, /id="login-modal-error"/u)
assert.match(loginModal, /id="login-modal-security-note"/u)
assert.doesNotMatch(loginModal, /uni\.showToast/u)
assert.doesNotMatch(loginModal, /🌱|📱/u)

assert.match(main, /installPhoneLoginNavigationGate\(uni\)/u)
assert.match(userStore, /async ensureLogin\(\{ prompt = false \} = \{\}\)/u)
assert.match(userStore, /requestPhoneLogin\(\{ message: '登录后才能继续使用青花植' \}\)/u)
assert.match(bottomSheet, /:animation="animation"/u)
assert.match(bottomSheet, /animation: \{ type: Boolean, default: true \}/u)
assert.doesNotMatch(platformPhoneLogin, /uni\.showToast/u)

console.log(
  'global phone login gate source contract passed data_mode=unit_fake test_kind=source_contract'
)
