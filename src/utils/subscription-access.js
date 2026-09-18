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

export async function requireMvpAccess(userStore, { source = '', loginChecked = false } = {}) {
  if (!loginChecked) {
    if (!userStore || typeof userStore.ensureLogin !== 'function') {
      return false
    }
    if (!(await userStore.ensureLogin({ prompt: true }))) {
      return false
    }
  }

  if (hasMvpAccess(userStore)) {
    return true
  }

  navigateToSubscription(source)
  return false
}
