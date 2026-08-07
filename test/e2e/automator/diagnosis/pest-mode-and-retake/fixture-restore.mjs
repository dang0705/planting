import { MODAL_LOG_STORAGE_KEY, REQUEST_LOG_STORAGE_KEY } from './fixture-state.mjs'

async function restoreHarness(miniProgram) {
  if (!miniProgram) {
    return
  }
  // Restore the user's real DevTools session: both the persisted storage payload and the
  // live in-memory user store state, so the fixture never leaks into the user's session.
  await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const userStore = useUserStore(pinia)
      const originalState = globalThis.__e2eOriginalUserState
      if (originalState && typeof originalState === 'object') {
        userStore.$patch({
          userId: originalState.userId || '',
          openid: originalState.openid || '',
          union_id: originalState.union_id || '',
          username: originalState.username || '',
          nickname: originalState.nickname || '植物爱好者',
          avatar: originalState.avatar || '',
          email: originalState.email || '',
          phoneNumber: originalState.phoneNumber || '',
          location: originalState.location || { province: '', city: '', latitude: 0, longitude: 0 },
          membership: originalState.membership || {
            type: 'free',
            expireTime: null,
            freeQuota: 5,
            usedCount: 0
          },
          isLoggedIn: Boolean(originalState.isLoggedIn),
          token: originalState.token || '',
          lastRefreshTime: originalState.lastRefreshTime || 0
        })
      }
    } catch (error) {
      globalThis.__e2eUserRestoreError = String(error?.message || error)
    }
    // Restore the original plant store state (userPlants + currentPlant) so the fixture
    // plant 90001 does not leak into the developer's DevTools session.
    try {
      const pinia = require('store/index.js').pinia
      const usePlantStore =
        require('store/plants.js').usePlantStore || require('store/plants.js').default
      const plantStore = usePlantStore(pinia)
      const originalPlantState = globalThis.__e2eOriginalPlantState
      if (originalPlantState && typeof originalPlantState === 'object') {
        plantStore.$patch({
          userPlants: Array.isArray(originalPlantState.userPlants)
            ? originalPlantState.userPlants
            : [],
          currentPlant: originalPlantState.currentPlant || null
        })
      }
    } catch (error) {
      globalThis.__e2ePlantRestoreError = String(error?.message || error)
    }
    try {
      if (typeof wx !== 'undefined') {
        const originalStorage = globalThis.__e2eOriginalUserStorage
        if (originalStorage === null || originalStorage === undefined) {
          wx.removeStorageSync('user')
        } else {
          wx.setStorageSync('user', originalStorage)
        }
      }
    } catch (error) {
      globalThis.__e2eStorageRestoreError = String(error?.message || error)
    }
  })
  await miniProgram.evaluate(() => {
    const uniRef = (() => {
      try {
        return require('common/vendor.js')?.index || null
      } catch {
        return typeof uni !== 'undefined' ? uni : null
      }
    })()
    if (globalThis.__e2eDiagnosisOriginalUniRequest && uniRef) {
      uniRef.request = globalThis.__e2eDiagnosisOriginalUniRequest
    }
    if (globalThis.__e2eDiagnosisOriginalWxRequest && typeof wx !== 'undefined') {
      wx.request = globalThis.__e2eDiagnosisOriginalWxRequest
    }
    if (globalThis.__e2eDiagnosisOriginalUniShowModal && uniRef) {
      uniRef.showModal = globalThis.__e2eDiagnosisOriginalUniShowModal
    }
    if (globalThis.__e2eDiagnosisOriginalWxShowModal && typeof wx !== 'undefined') {
      wx.showModal = globalThis.__e2eDiagnosisOriginalWxShowModal
    }
  })
}

async function readRequests(miniProgram) {
  return (await miniProgram.callWxMethod('getStorageSync', REQUEST_LOG_STORAGE_KEY)) || []
}

async function readModals(miniProgram) {
  return (await miniProgram.callWxMethod('getStorageSync', MODAL_LOG_STORAGE_KEY)) || []
}

export { restoreHarness, readRequests, readModals }
