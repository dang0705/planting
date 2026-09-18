import { installRequestFixture } from './fixture-requests.mjs'
import { FORMAL_PRINCIPAL, sleep } from './runtime-core.mjs'

export const REQUEST_LOG_STORAGE_KEY = '__plantsight_e2e_diagnosis_requests__'
export const MODAL_LOG_STORAGE_KEY = '__plantsight_e2e_diagnosis_modals__'
const RETAKE_MODE_STORAGE_KEY = '__plantsight_e2e_diagnosis_retake_mode__'
const AUTOMATION_IMAGES_STORAGE_KEY = '__plantsight_diagnose_automation_images__'
const USER_STORE_STORAGE_KEY = 'user'
const FIXTURE_USER_OPENID = FORMAL_PRINCIPAL.value
const FIXTURE_USER_READY_TIMEOUT_MS = 4000
const FIXTURE_USER_READY_PROBE_INTERVAL_MS = 200

async function setFixtureRetakeMode(miniProgram, mode) {
  await miniProgram.callWxMethod(
    'setStorageSync',
    RETAKE_MODE_STORAGE_KEY,
    mode === 'expired' ? 'expired' : 'active'
  )
}

async function seedAutomationImage(miniProgram) {
  await miniProgram.callWxMethod('setStorageSync', AUTOMATION_IMAGES_STORAGE_KEY, {
    images: [
      {
        imageRef: 'https://example.invalid/e2e-pest-leaf.jpg',
        inputSlotType: 'leaf',
        captureRegion: 'leaf_lower_surface',
        width: 1200,
        height: 900,
        size: 180000
      }
    ]
  })
}

// Establishes a deterministic "authenticated user + one real fixture plant" precondition
// BEFORE the home page lifecycle runs. This writes the pinia-persisted user store
// payload (key 'user') so that, when the home page mounts and useUserStore initializes,
// persist rehydrates openid => isAuthenticated=true. The home page onMounted then calls
// ensureLogin -> loadUserPlants -> plantStore.getUserPlants, which consumes the mocked
// plant-user-http/user-plants response (see fixtureFor in installHarness) and renders
// the real PlantCard with diagnose-entry-button-<plant.id>.
//
// This does NOT inject anonymous plants, test conditionals, or fallbacks into product
// source. It only seeds the same storage layer the real app uses for session restore.
async function seedAuthenticatedUserFixture(miniProgram) {
  const fixtureUser = {
    userId: 'e2e_fixture_user',
    openid: FIXTURE_USER_OPENID,
    union_id: '',
    username: '端上验收用户',
    nickname: '端上验收用户',
    avatar: '',
    email: '',
    phoneNumber: '',
    location: { province: '', city: '', latitude: 0, longitude: 0 },
    membership: { type: 'free', expireTime: null, freeQuota: 5, usedCount: 0 },
    isLoggedIn: true,
    token: '',
    lastRefreshTime: 0
  }
  await miniProgram.callWxMethod('setStorageSync', USER_STORE_STORAGE_KEY, fixtureUser)
}

// Bounded readiness probe: confirms the fixture user store payload is observable in the
// mini-program storage before proceeding to mount/reLaunch the home page. Returns true
// once the persisted openid is readable, false on timeout with a descriptive reason.
async function waitForFixtureUserReady(miniProgram) {
  const deadline = Date.now() + FIXTURE_USER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const stored = await miniProgram.callWxMethod('getStorageSync', USER_STORE_STORAGE_KEY)
      if (stored && String(stored.openid || '') === FIXTURE_USER_OPENID) {
        return { ready: true }
      }
    } catch {
      // storage read transient failure; keep probing within the bounded window
    }
    await sleep(FIXTURE_USER_READY_PROBE_INTERVAL_MS)
  }
  return {
    ready: false,
    reason: `fixture user store not rehydrated within ${FIXTURE_USER_READY_TIMEOUT_MS}ms (expected openid=${FIXTURE_USER_OPENID})`
  }
}

async function captureFixtureState(miniProgram) {
  await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const usePlantStore =
        require('store/plants.js').usePlantStore || require('store/plants.js').default
      const userStore = useUserStore(pinia)
      const plantStore = usePlantStore(pinia)
      globalThis.__e2eOriginalUserStorage =
        typeof wx !== 'undefined' ? wx.getStorageSync('user') : null
      globalThis.__e2eOriginalUserState = {
        userId: userStore.userId,
        openid: userStore.openid,
        union_id: userStore.union_id,
        username: userStore.username,
        nickname: userStore.nickname,
        avatar: userStore.avatar,
        email: userStore.email,
        phoneNumber: userStore.phoneNumber,
        location: userStore.location,
        membership: userStore.membership,
        isLoggedIn: userStore.isLoggedIn,
        token: userStore.token,
        lastRefreshTime: userStore.lastRefreshTime
      }
      globalThis.__e2eOriginalPlantState = {
        userPlants: JSON.parse(JSON.stringify(plantStore.userPlants || [])),
        currentPlant: plantStore.currentPlant
          ? JSON.parse(JSON.stringify(plantStore.currentPlant))
          : null
      }
    } catch (error) {
      globalThis.__e2eOriginalUserCaptureError = String(error?.message || error)
    }
  })
}

async function hydrateFixtureUser(miniProgram) {
  await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const userStore = useUserStore(pinia)
      // Non-authoritative: ask persist to re-read storage (may help on fresh stores).
      if (typeof userStore.$hydrate === 'function') {
        try {
          userStore.$hydrate()
        } catch {
          /* $hydrate is best-effort */
        }
      }
      const storedUser = typeof wx !== 'undefined' ? wx.getStorageSync('user') : null
      const fixtureOpenid = String(storedUser?.openid || '')
      if (!fixtureOpenid) {
        throw new Error('fixture user storage openid is unavailable')
      }
      // Authoritative: directly overwrite the live reactive state with the fixture user.
      userStore.$patch({
        userId: 'e2e_fixture_user',
        openid: fixtureOpenid,
        union_id: '',
        username: '端上验收用户',
        nickname: '端上验收用户',
        avatar: '',
        email: '',
        phoneNumber: '',
        location: { province: '', city: '', latitude: 0, longitude: 0 },
        membership: { type: 'free', expireTime: null, freeQuota: 5, usedCount: 0 },
        isLoggedIn: true,
        token: '',
        lastRefreshTime: 0
      })
    } catch (error) {
      globalThis.__e2eUserHydrateError = String(error?.message || error)
    }
  })
  // Verify the live store actually carries the fixture openid. If this fails we throw a
  // precise error instead of letting the home page stall into a generic timeout.
  const hydrateCheck = await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const userStore = useUserStore(pinia)
      return {
        authenticated: Boolean(userStore.openid),
        openid: String(userStore.openid || ''),
        hydrateError: globalThis.__e2eUserHydrateError || ''
      }
    } catch (error) {
      return { authenticated: false, openid: '', hydrateError: String(error?.message || error) }
    }
  })
  if (!hydrateCheck.authenticated || hydrateCheck.openid !== FIXTURE_USER_OPENID) {
    throw new Error(
      `[installHarness] fixture user store did not become authenticated with fixture openid: ${JSON.stringify(hydrateCheck)}`
    )
  }
}

async function loadFixturePlant(miniProgram) {
  await miniProgram.evaluate(async () => {
    try {
      const { queryClient } = require('lib/query-client.js')
      const { invalidateUserPlantsQuery } = require('vue-query/plants/queries/user-plants.js')
      // Clear cached user-plants so the real fetchQuery runs against the fixture mock.
      if (typeof invalidateUserPlantsQuery === 'function') {
        await invalidateUserPlantsQuery()
      } else if (queryClient?.invalidateQueries) {
        queryClient.invalidateQueries({
          queryKey: ['http-function', 'plant-user-http', 'user-plants']
        })
      }
      const pinia = require('store/index.js').pinia
      const usePlantStore =
        require('store/plants.js').usePlantStore || require('store/plants.js').default
      const plantStore = usePlantStore(pinia)
      // Call the real product store action; it issues plant-user-http/user-plants which the
      // fixture intercepts and returns plant 90001.
      await plantStore.getUserPlants()
    } catch (error) {
      globalThis.__e2ePlantLoadError = String(error?.message || error)
    }
  })
  // Prove the fixture plant was loaded into the real product store before the three-tab MVP
  // test starts. Fail with a narrow diagnostic if not.
  const plantCheck = await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const usePlantStore =
        require('store/plants.js').usePlantStore || require('store/plants.js').default
      const plantStore = usePlantStore(pinia)
      const plants = Array.isArray(plantStore.userPlants) ? plantStore.userPlants : []
      return {
        count: plants.length,
        hasFixturePlant: plants.some(p => Number(p.id) === 90001),
        plantIds: plants.map(p => p.id),
        loadError: globalThis.__e2ePlantLoadError || ''
      }
    } catch (error) {
      return {
        count: 0,
        hasFixturePlant: false,
        plantIds: [],
        loadError: String(error?.message || error)
      }
    }
  })
  if (!plantCheck.hasFixturePlant) {
    throw new Error(
      `[installHarness] fixture plant 90001 not loaded into plantStore: ${JSON.stringify(plantCheck)}`
    )
  }
}

export async function installHarness(miniProgram, fixtureEnabled) {
  await captureFixtureState(miniProgram)
  await seedAuthenticatedUserFixture(miniProgram)
  const userReady = await waitForFixtureUserReady(miniProgram)
  if (!userReady.ready) {
    throw new Error(`[installHarness] ${userReady.reason}`)
  }
  await hydrateFixtureUser(miniProgram)
  await miniProgram.evaluate(() => {
    globalThis.__e2eDiagnosisFixtureEnabled = true
  })
  if (!fixtureEnabled) {
    await miniProgram.evaluate(() => {
      globalThis.__e2eDiagnosisFixtureEnabled = false
    })
  }
  await installRequestFixture(miniProgram)
  await loadFixturePlant(miniProgram)
}

export { setFixtureRetakeMode, seedAutomationImage }
