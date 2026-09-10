import { onMounted, ref } from 'vue'
import { authorizePlatformPhone, createPlatformLoginCode } from '@/api/platform-phone-auth.js'

const PLATFORM_LOGIN_CODE_TTL_MS = 4 * 60 * 1000
const DOUYIN_INTERNAL_PHONE_ERROR_NO = 20000

function normalizeEventDetail(event) {
  return event?.detail && typeof event.detail === 'object' && !Array.isArray(event.detail)
    ? event.detail
    : {}
}

function resolvePhoneAuthorizationError(detail = {}) {
  const errMsg = String(detail.errMsg || '').trim()
  const normalized = errMsg.toLowerCase()
  const errorNo = Number(detail.errno ?? detail.errNo)
  if (normalized.includes('api scope is not declared in the privacy agreement')) {
    return '请先在当前小程序的隐私保护协议中声明手机号。'
  }
  if (normalized.includes('privacy permission is not authorized')) {
    return '请先同意小程序隐私保护协议。'
  }
  if (normalized.includes('no permission')) {
    return '当前小程序尚未开通手机号授权能力。'
  }
  if (normalized.includes('no phone number')) {
    return '当前账号未绑定手机号。'
  }
  if (normalized.includes('not login') || normalized.includes('invalid session')) {
    return '当前平台登录状态已失效，请重新进入小程序后再试。'
  }
  if (normalized.includes('platform auth deny')) {
    return '当前账号暂时无法使用手机号授权。'
  }
  if (
    errorNo === DOUYIN_INTERNAL_PHONE_ERROR_NO ||
    normalized.includes('safe_code') ||
    normalized.includes('safe code')
  ) {
    return '当前平台账号连接异常，请关闭小程序后重新进入并再次授权。'
  }
  return ''
}

export function usePlatformPhoneLogin({ onSuccess } = {}) {
  const loginCode = ref('')
  const loginCodeIssuedAt = ref(0)
  const loginCodeReady = ref(false)
  const loginPreparationError = ref('')
  const loggingIn = ref(false)

  // #ifdef MP-TOUTIAO
  const privacyVisible = ref(false)
  let privacyAuthorizationResolver = null
  // #endif

  // #ifdef MP-TOUTIAO
  function getDouyinApi() {
    // eslint-disable-next-line no-undef
    const nativeDouyin = typeof tt !== 'undefined' ? tt : null
    if (nativeDouyin) {
      return nativeDouyin
    }
    return typeof globalThis === 'undefined' ? null : globalThis.tt || null
  }

  function initDouyinPrivacy() {
    const douyin = getDouyinApi()
    if (!douyin) {
      return
    }
    if (typeof douyin.onNeedPrivacyAuthorization === 'function') {
      douyin.onNeedPrivacyAuthorization((resolve, eventInfo = {}) => {
        privacyAuthorizationResolver = typeof resolve === 'function' ? resolve : null
        privacyVisible.value = true
        console.info('[PhoneAuth] privacy authorization required', {
          referrer: String(eventInfo.referrer || '')
        })
      })
    }
    if (typeof douyin.getPrivacySetting !== 'function') {
      return
    }
    douyin.getPrivacySetting({
      success: result => {
        privacyVisible.value = Boolean(result?.needAuthorization)
      },
      fail: error => {
        console.warn('[PhoneAuth] getPrivacySetting failed', {
          errMsg: String(error?.errMsg || '')
        })
      }
    })
  }

  function openPrivacyContract() {
    const douyin = getDouyinApi()
    if (typeof douyin?.openPrivacyContract !== 'function') {
      uni.showToast({ title: '隐私协议暂不可用，请稍后重试', icon: 'none' })
      return
    }
    douyin.openPrivacyContract({
      fail: error => {
        uni.showToast({ title: error?.errMsg || '隐私协议暂不可用，请稍后重试', icon: 'none' })
      }
    })
  }

  function agreePrivacyAuthorization() {
    privacyVisible.value = false
    const resolve = privacyAuthorizationResolver
    privacyAuthorizationResolver = null
    if (typeof resolve === 'function') {
      resolve({ buttonId: 'phone-auth-privacy-agree', event: 'agree' })
    }
  }
  // #endif

  async function ensureLoginCode({ force = false } = {}) {
    const isFresh =
      loginCode.value && Date.now() - loginCodeIssuedAt.value < PLATFORM_LOGIN_CODE_TTL_MS
    if (!force && isFresh) {
      return loginCode.value
    }
    loginCodeReady.value = false
    loginPreparationError.value = ''
    const code = await createPlatformLoginCode({ force })
    loginCode.value = code
    loginCodeIssuedAt.value = Date.now()
    loginCodeReady.value = true
    return code
  }

  async function prepareLoginCode(options = {}) {
    try {
      await ensureLoginCode(options)
    } catch (error) {
      loginCode.value = ''
      loginCodeIssuedAt.value = 0
      loginCodeReady.value = false
      loginPreparationError.value = error?.message || '平台账号连接失败，请关闭小程序后重新进入。'
      console.error('[PhoneAuth] platform login failed', {
        message: String(error?.message || ''),
        name: String(error?.name || '')
      })
    }
  }

  async function handleGetPhoneNumber(event) {
    if (loggingIn.value) {
      return
    }
    const detail = normalizeEventDetail(event)
    const phoneAuthorizationSucceeded = detail.errMsg === 'getPhoneNumber:ok'
    const platformError = resolvePhoneAuthorizationError(detail)
    console.info('[PhoneAuth] getPhoneNumber result', {
      errMsg: String(detail.errMsg || ''),
      errno: detail.errno ?? detail.errNo ?? '',
      detailKeys: Object.keys(detail).sort(),
      hasCode: Boolean(detail.code),
      hasEncryptedData: Boolean(detail.encryptedData),
      hasIv: Boolean(detail.iv)
    })

    try {
      if (!phoneAuthorizationSucceeded) {
        throw new Error(platformError || detail.errMsg || '手机号授权未完成，请重新点击授权按钮')
      }
      const hasNewPhoneCode = typeof detail.code === 'string' && detail.code.trim()
      const hasLegacyPhonePayload = Boolean(detail.encryptedData && detail.iv)
      if (!hasNewPhoneCode && !hasLegacyPhonePayload) {
        throw new Error(detail.errMsg || '未获取到手机号授权凭据，请确认平台权限和隐私协议后重试')
      }
      if (
        !loginCodeReady.value ||
        Date.now() - loginCodeIssuedAt.value >= PLATFORM_LOGIN_CODE_TTL_MS
      ) {
        throw new Error('平台登录凭证已失效，请返回后重新进入页面')
      }

      const currentLoginCode = loginCode.value
      loginCode.value = ''
      loginCodeIssuedAt.value = 0
      loginCodeReady.value = false
      loggingIn.value = true
      const user = await authorizePlatformPhone({
        loginCode: currentLoginCode,
        eventDetail: detail
      })
      await onSuccess?.(user)
    } catch (error) {
      console.error('[PhoneAuth] phone login failed', {
        message: String(error?.message || ''),
        name: String(error?.name || '')
      })
      uni.showToast({ title: error?.message || '登录失败，请稍后重试', icon: 'none' })
    } finally {
      loggingIn.value = false
    }
  }

  onMounted(() => {
    // #ifdef MP-TOUTIAO
    initDouyinPrivacy()
    // #endif
  })

  return {
    loginCodeReady,
    loginPreparationError,
    loggingIn,
    handleGetPhoneNumber,
    prepareLoginCode,
    // #ifdef MP-TOUTIAO
    privacyVisible,
    openPrivacyContract,
    agreePrivacyAuthorization
    // #endif
  }
}
