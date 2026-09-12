export const SUBSCRIPTION_PAGE_PATH = '/subpackages/subscription/subscription'

export function buildSubscriptionPageUrl(source = '') {
  const normalizedSource = String(source || '').trim()
  return normalizedSource
    ? `${SUBSCRIPTION_PAGE_PATH}?source=${encodeURIComponent(normalizedSource)}`
    : SUBSCRIPTION_PAGE_PATH
}

export function hasMvpAccess(userStore) {
  return Boolean(userStore?.isMember)
}

export function navigateToSubscription(source = '') {
  if (typeof uni === 'undefined' || typeof uni.navigateTo !== 'function') {
    return false
  }
  uni.navigateTo({ url: buildSubscriptionPageUrl(source) })
  return true
}

export async function requireMvpAccess(
  userStore,
  { source = '', loginMessage = '请先登录后使用该功能', loginChecked = false } = {}
) {
  if (!loginChecked) {
    if (!userStore || typeof userStore.ensureLogin !== 'function') {
      return false
    }
    if (!(await userStore.ensureLogin())) {
      if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
        uni.showToast({ title: loginMessage, icon: 'none' })
      }
      return false
    }
  }

  if (hasMvpAccess(userStore)) {
    return true
  }

  navigateToSubscription(source)
  return false
}
