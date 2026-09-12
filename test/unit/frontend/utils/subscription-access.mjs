import assert from 'node:assert/strict'
import {
  SUBSCRIPTION_PAGE_PATH,
  buildSubscriptionPageUrl,
  hasMvpAccess,
  requireMvpAccess
} from '../../../../src/utils/subscription-access.js'

const originalUni = globalThis.uni
const navigations = []
const toasts = []

try {
  globalThis.uni = {
    navigateTo: options => navigations.push(options),
    showToast: options => toasts.push(options)
  }

  assert.equal(buildSubscriptionPageUrl(), SUBSCRIPTION_PAGE_PATH)
  assert.equal(
    buildSubscriptionPageUrl('index 诊断'),
    `${SUBSCRIPTION_PAGE_PATH}?source=index%20%E8%AF%8A%E6%96%AD`
  )

  const freeStore = {
    isMember: false,
    ensureLogin: async () => true
  }
  assert.equal(hasMvpAccess(freeStore), false)
  assert.equal(await requireMvpAccess(freeStore, { source: 'free_entry' }), false)
  assert.deepEqual(navigations, [
    { url: `${SUBSCRIPTION_PAGE_PATH}?source=free_entry` }
  ])
  assert.deepEqual(toasts, [])

  const memberStore = {
    isMember: true,
    ensureLogin: async () => true
  }
  assert.equal(await requireMvpAccess(memberStore, { source: 'member_entry' }), true)
  assert.equal(navigations.length, 1)

  const loggedOutStore = {
    isMember: false,
    ensureLogin: async () => false
  }
  assert.equal(
    await requireMvpAccess(loggedOutStore, {
      source: 'logged_out_entry',
      loginMessage: '请先登录后使用诊断'
    }),
    false
  )
  assert.deepEqual(toasts, [{ title: '请先登录后使用诊断', icon: 'none' }])
} finally {
  globalThis.uni = originalUni
}

console.log('subscription access gate tests passed data_mode=unit_fake')
