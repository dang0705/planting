import { getActivePinia } from 'pinia'
import { ref } from 'vue'

const NAVIGATION_METHODS = ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab']
const PHONE_LOGIN_GATE_SKIP_FLAG = '__skipPhoneLoginGate'
const GATE_CANCEL_MESSAGE = 'navigate:fail phone login required'

const visible = ref(false)
const message = ref('登录后可同步您的植物养护记录')
let pendingRequests = []
let installed = false

function getUserStore() {
  const pinia = getActivePinia()
  return pinia?._s?.get('user') || null
}

export function isPhoneLoggedIn(userStore = getUserStore()) {
  return Boolean(userStore?.isAuthenticated)
}

export function requestPhoneLogin(options = {}) {
  if (isPhoneLoggedIn()) {
    return Promise.resolve(true)
  }

  message.value = String(options.message || '登录后可同步您的植物养护记录')
  visible.value = true

  return new Promise(resolve => {
    pendingRequests.push(resolve)
  })
}

export function completePhoneLogin() {
  settlePhoneLoginRequests(true)
}

export function cancelPhoneLogin() {
  settlePhoneLoginRequests(false)
}

function settlePhoneLoginRequests(result) {
  visible.value = false
  message.value = '登录后可同步您的植物养护记录'
  const requests = pendingRequests
  pendingRequests = []
  requests.forEach(resolve => resolve(result))
}

function getRuntimeUni() {
  return typeof globalThis === 'undefined' ? null : globalThis.uni || null
}

function stripGateOptions(options = {}) {
  const safeOptions = { ...options }
  delete safeOptions[PHONE_LOGIN_GATE_SKIP_FLAG]
  return safeOptions
}

function failNavigation(options = {}) {
  options.fail?.({ errMsg: GATE_CANCEL_MESSAGE })
  options.complete?.({ errMsg: GATE_CANCEL_MESSAGE })
  return { errMsg: GATE_CANCEL_MESSAGE }
}

export function installPhoneLoginNavigationGate(runtimeUni = getRuntimeUni()) {
  if (installed) {
    return
  }
  if (!runtimeUni) {
    return
  }

  const patchedMethods = []
  NAVIGATION_METHODS.forEach(methodName => {
    const original = runtimeUni[methodName]
    if (typeof original !== 'function') {
      return
    }

    const patched = function gatedNavigation(options = {}) {
      const normalizedOptions = options && typeof options === 'object' ? options : {}
      const safeOptions = stripGateOptions(normalizedOptions)
      const shouldSkip = normalizedOptions[PHONE_LOGIN_GATE_SKIP_FLAG] === true

      if (shouldSkip || !safeOptions.url || isPhoneLoggedIn()) {
        return original.call(runtimeUni, safeOptions)
      }

      return requestPhoneLogin({ message: '登录后才能继续使用青花植' }).then(allowed => {
        if (!allowed) {
          return failNavigation(safeOptions)
        }
        return original.call(runtimeUni, safeOptions)
      })
    }

    runtimeUni[methodName] = patched
    patchedMethods.push({ methodName, original })
  })

  if (patchedMethods.length) {
    installed = true
  }
}

export function getPhoneLoginGateState() {
  return { visible, message }
}

export function getPhoneLoginGateSkipFlag() {
  return PHONE_LOGIN_GATE_SKIP_FLAG
}
