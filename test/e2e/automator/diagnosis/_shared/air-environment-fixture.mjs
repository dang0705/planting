'use strict'
/* eslint-disable no-var -- miniProgram.evaluate serializes these callbacks for the runtime. */
import { resolveWithinDeadline } from './fixture-async-deadline.mjs'
import {
  inspectHomeFixtureState,
  readFixtureRequests
} from './air-environment-fixture-readiness.mjs'
const USER_STORE_KEY = 'user'
const FIXTURE_SLOT = '__e2eAirEnvironmentDiagnosisFixtureV2'
const DIAGNOSIS_STORAGE_PREFIX = '__plantsight_diagnose_'
const USER_PLANTS_QUERY_KEY = ['http-function', 'plant-user-http', 'user-plants']
const FIXTURE_STORE_READY_TIMEOUT_MS = 10000
const FIXTURE_STORE_READY_POLL_MS = 200
const FIXTURE_STORE_INSPECTION_TIMEOUT_MS = 2000
const RUNTIME_IDENTITY_TIMEOUT_MS = 5000
const RUNTIME_IDENTITY_POLL_MS = 100
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const AIR_ENVIRONMENT_FIXTURE_USER = Object.freeze({
  userId: 'e2e_air_environment_fixture_user',
  openid: 'e2e_air_environment_fixture_openid',
  union_id: '',
  username: '空气环境验收用户',
  nickname: '空气环境验收用户',
  avatar: '',
  email: '',
  phoneNumber: '',
  location: { province: '', city: '', latitude: 0, longitude: 0 },
  membership: { type: 'free', expireTime: null, freeQuota: 5, usedCount: 0 },
  isLoggedIn: true,
  token: '',
  lastRefreshTime: 0
})
export const AIR_ENVIRONMENT_FIXTURE_PLANT = Object.freeze({
  id: 94021,
  plantId: 101,
  canonicalName: '空气环境验收植物',
  displayName: '空气环境验收植物',
  sourceType: 'catalog',
  careLocationId: 'e2e-living-room',
  locationKey: 'e2e-window-side',
  wateringReminder: null
})
export class AirEnvironmentFixtureError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AirEnvironmentFixtureError'
  }
}
function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function fixtureDefinition(principal) {
  const user = clone(AIR_ENVIRONMENT_FIXTURE_USER)
  if (principal?.value) {
    user.openid = String(principal.value)
  }
  return {
    user,
    plant: clone(AIR_ENVIRONMENT_FIXTURE_PLANT),
    userStoreKey: USER_STORE_KEY,
    runtimeSlot: FIXTURE_SLOT,
    userPlantsQueryKey: USER_PLANTS_QUERY_KEY
  }
}

function fixtureError(prefix, result) {
  const reason = result?.reason || result?.error || 'unavailable fixture runtime state'
  const detail = result && typeof result === 'object' ? JSON.stringify(result) : reason
  return new AirEnvironmentFixtureError(`${prefix}: ${detail}`)
}

async function resolveRuntimeOpenid(miniProgram) {
  const slot = `__e2eAirEnvironmentRuntimeIdentity_${Date.now()}`
  const started = await miniProgram.evaluate(function (identitySlot) {
    try {
      globalThis[identitySlot] = { status: 'pending' }
      if (!wx?.cloud || typeof wx.cloud.callFunction !== 'function') {
        globalThis[identitySlot] = {
          status: 'failed',
          reason: 'wx.cloud.callFunction unavailable'
        }
        return { ok: false, reason: 'wx.cloud.callFunction unavailable' }
      }
      wx.cloud.callFunction({
        name: 'wechat-identity',
        data: {},
        success: function (response) {
          const openid = String(response?.result?.openid || '').trim()
          globalThis[identitySlot] = openid
            ? { status: 'resolved', openid }
            : { status: 'failed', reason: 'wechat-identity returned no openid' }
        },
        fail: function (error) {
          globalThis[identitySlot] = {
            status: 'failed',
            reason: String(error?.errMsg || error || 'wechat-identity failed')
          }
        }
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) }
    }
  }, slot)
  if (!started?.ok) {
    throw new AirEnvironmentFixtureError(
      `fixture runtime identity probe did not start: ${started?.reason || 'unknown error'}`
    )
  }

  const deadline = Date.now() + RUNTIME_IDENTITY_TIMEOUT_MS
  let lastState = null
  try {
    while (Date.now() < deadline) {
      lastState = await miniProgram.evaluate(function (identitySlot) {
        const state = globalThis[identitySlot]
        return state && typeof state === 'object' ? { ...state } : null
      }, slot)
      if (lastState?.status === 'resolved' && lastState.openid) {
        return String(lastState.openid)
      }
      if (lastState?.status === 'failed') {
        break
      }
      await sleep(RUNTIME_IDENTITY_POLL_MS)
    }
  } finally {
    await miniProgram.evaluate(function (identitySlot) {
      delete globalThis[identitySlot]
    }, slot)
  }
  throw new AirEnvironmentFixtureError(
    `fixture runtime identity unavailable: ${JSON.stringify(lastState || { status: 'timeout' })}`
  )
}

export async function installAirEnvironmentDiagnosisFixture(miniProgram, { principal } = {}) {
  const definition = fixtureDefinition(principal)
  // The app's real onMounted login reconciliation compares the persisted user
  // openid with the current wx.cloud runtime identity. Fixture leaves may
  // replace the plant list, but they must keep this identity aligned with the
  // authenticated QA session or the product will correctly log out.
  definition.user.openid = await resolveRuntimeOpenid(miniProgram)
  const snapshot = await miniProgram.evaluate(function (fixture) {
    function cloneRuntime(value) {
      if (typeof value === 'undefined') {
        return null
      }
      return JSON.parse(JSON.stringify(value))
    }
    try {
      var pinia = require('store/index.js').pinia
      var userModule = require('store/user.js')
      var plantModule = require('store/plants.js')
      var diagnoseModule = require('store/diagnose.js')
      var useUserStore = userModule.useUserStore || userModule.default
      var usePlantStore = plantModule.usePlantStore || plantModule.default
      var useDiagnoseStore = diagnoseModule.useDiagnoseStore || diagnoseModule.default
      var queryClient = require('lib/query-client.js').queryClient
      var userStore = useUserStore(pinia)
      var plantStore = usePlantStore(pinia)
      var wxRef = typeof wx === 'undefined' ? null : wx
      var vendor = require('common/vendor.js')
      var uniRef = vendor && vendor.index ? vendor.index : typeof uni === 'undefined' ? null : uni
      var storageInfo =
        wxRef && typeof wxRef.getStorageInfoSync === 'function'
          ? wxRef.getStorageInfoSync()
          : { keys: [] }
      var storageKeys = storageInfo && Array.isArray(storageInfo.keys) ? storageInfo.keys : []
      var diagnosisStorage = {}
      storageKeys.forEach(function (key) {
        if (String(key).indexOf(fixture.diagnosisStoragePrefix) === 0) {
          diagnosisStorage[key] = cloneRuntime(
            wxRef && typeof wxRef.getStorageSync === 'function'
              ? wxRef.getStorageSync(key)
              : undefined
          )
        }
      })
      var cached =
        queryClient && typeof queryClient.getQueryData === 'function'
          ? queryClient.getQueryData(fixture.userPlantsQueryKey)
          : undefined
      globalThis[fixture.runtimeSlot] = {
        userStoragePresent: storageKeys.indexOf(fixture.userStoreKey) >= 0,
        userStorage: cloneRuntime(
          wxRef && typeof wxRef.getStorageSync === 'function'
            ? wxRef.getStorageSync(fixture.userStoreKey)
            : undefined
        ),
        diagnosisStorage: diagnosisStorage,
        userState: cloneRuntime(userStore.$state),
        plantState: cloneRuntime(plantStore.$state),
        diagnoseState: cloneRuntime(useDiagnoseStore(pinia).$state),
        queryPresent: typeof cached !== 'undefined',
        queryValue: cloneRuntime(cached),
        originalUniRequest: uniRef && uniRef.request,
        originalWxRequest: wxRef && wxRef.request,
        requests: []
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, { ...definition, diagnosisStoragePrefix: DIAGNOSIS_STORAGE_PREFIX })
  if (!snapshot?.ok) {
    throw fixtureError('fixture snapshot failed', snapshot)
  }

  await miniProgram.callWxMethod('setStorageSync', USER_STORE_KEY, definition.user)
  const patchedUser = await miniProgram.evaluate(function (fixture) {
    try {
      var pinia = require('store/index.js').pinia
      var userModule = require('store/user.js')
      var useUserStore = userModule.useUserStore || userModule.default
      useUserStore(pinia).$patch(fixture.user)
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)
  if (!patchedUser?.ok) {
    throw fixtureError('fixture user store setup failed', patchedUser)
  }

  const installed = await miniProgram.evaluate(function (fixture) {
    try {
      var state = globalThis[fixture.runtimeSlot]
      var wxRef = typeof wx === 'undefined' ? null : wx
      var vendor = require('common/vendor.js')
      var uniRef = vendor && vendor.index ? vendor.index : typeof uni === 'undefined' ? null : uni
      if (!state || !wxRef || !uniRef || typeof state.originalUniRequest !== 'function') {
        return { ok: false, reason: 'request interception prerequisites unavailable' }
      }
      var cloneRuntime = function (value) {
        try {
          if (typeof value === 'undefined') {
            return null
          }
          return JSON.parse(JSON.stringify(value))
        } catch (error) {
          return String(error || value)
        }
      }
      var pack = function (data) {
        return { code: 200, data }
      }
      var fixtureFor = function (options) {
        var url = String(options.url || '')
        var method = String(options.method || 'GET').toUpperCase()
        if (method === 'GET' && /plant-user-http\/user-plants(?:\?|$)/.test(url)) {
          return pack({ list: [fixture.plant], total: 1 })
        }
        return null
      }
      var isObservedDiagnosisRequest = function (url) {
        return /diagnose-http\/diagnosis\/(?:question\/start|answer)(?:\?|$)/.test(url)
      }
      var observeResponse = function (captured, result) {
        captured.response = {
          statusCode: Number(result && result.statusCode) || 0,
          data: cloneRuntime(result && result.data)
        }
      }
      var patch = function (original) {
        return function request(options) {
          var opts = options || {}
          var captured = {
            url: String(opts.url || ''),
            method: String(opts.method || 'GET').toUpperCase(),
            data: cloneRuntime(opts.data || {}),
            time: Date.now()
          }
          var response = fixtureFor(opts)
          if (response) {
            captured.fixture = true
            captured.response = { statusCode: 200, data: cloneRuntime(response) }
            state.requests.push(captured)
            setTimeout(function () {
              var result = { statusCode: 200, data: response }
              if (typeof opts.success === 'function') {
                opts.success(result)
              }
              if (typeof opts.complete === 'function') {
                opts.complete(result)
              }
            }, 20)
            return { onChunkReceived: function () {}, abort: function () {} }
          }
          if (!isObservedDiagnosisRequest(captured.url)) {
            return original.call(this, opts)
          }
          captured.fixture = false
          captured.passthrough = true
          state.requests.push(captured)
          var forwarded = Object.assign({}, opts)
          var originalSuccess = opts.success
          var originalFail = opts.fail
          var originalComplete = opts.complete
          forwarded.success = function (result) {
            observeResponse(captured, result)
            if (typeof originalSuccess === 'function') {
              return originalSuccess.call(this, result)
            }
            return undefined
          }
          forwarded.fail = function (error) {
            captured.failure = cloneRuntime(error)
            if (typeof originalFail === 'function') {
              return originalFail.call(this, error)
            }
            return undefined
          }
          forwarded.complete = function (result) {
            if (!captured.response && !captured.failure) {
              observeResponse(captured, result)
            }
            if (typeof originalComplete === 'function') {
              return originalComplete.call(this, result)
            }
            return undefined
          }
          try {
            return original.call(this, forwarded)
          } catch (error) {
            captured.failure = { message: String(error && error.message ? error.message : error) }
            throw error
          }
        }
      }
      uniRef.request = patch(state.originalUniRequest)
      if (typeof state.originalWxRequest === 'function') {
        wxRef.request = patch(state.originalWxRequest)
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)
  if (!installed?.ok) {
    throw fixtureError('fixture request interception failed', installed)
  }

  const resetDiagnosisRuntime = await miniProgram.evaluate(function (fixture) {
    try {
      var state = globalThis[fixture.runtimeSlot]
      var wxRef = typeof wx === 'undefined' ? null : wx
      var pinia = require('store/index.js').pinia
      var diagnoseModule = require('store/diagnose.js')
      var useDiagnoseStore = diagnoseModule.useDiagnoseStore || diagnoseModule.default
      if (!state || !wxRef || typeof wxRef.removeStorageSync !== 'function') {
        return { ok: false, reason: 'diagnosis reset prerequisites unavailable' }
      }
      Object.keys(state.diagnosisStorage || {}).forEach(function (key) {
        wxRef.removeStorageSync(key)
      })
      var diagnoseStore = useDiagnoseStore(pinia)
      diagnoseStore.$patch({ currentDiagnosis: null, loading: false })
      return { ok: true, clearedStorageKeys: Object.keys(state.diagnosisStorage || {}) }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)
  if (!resetDiagnosisRuntime?.ok) {
    throw fixtureError('diagnosis runtime reset failed', resetDiagnosisRuntime)
  }
  try {
    await miniProgram.reLaunch('/pages/index/index')
  } catch (error) {
    throw fixtureError('diagnosis home re-launch failed', { reason: error?.message || error })
  }

  const storeLoadStarted = await miniProgram.evaluate(function (fixture) {
    try {
      var queryClient = require('lib/query-client.js').queryClient
      var invalidateUserPlantsQuery =
        require('vue-query/plants/queries/user-plants.js').invalidateUserPlantsQuery
      var pinia = require('store/index.js').pinia
      var plantModule = require('store/plants.js')
      var usePlantStore = plantModule.usePlantStore || plantModule.default
      var state = globalThis[fixture.runtimeSlot]
      var invalidationError = null
      if (!state) {
        return { ok: false, reason: 'fixture runtime state unavailable' }
      }
      try {
        if (typeof invalidateUserPlantsQuery === 'function') {
          invalidateUserPlantsQuery()
        } else if (queryClient && typeof queryClient.removeQueries === 'function') {
          queryClient.removeQueries({ queryKey: fixture.userPlantsQueryKey })
        }
      } catch (error) {
        invalidationError = String(error && error.message ? error.message : error)
      }
      var plantStore = usePlantStore(pinia)
      state.storeLoad = { status: 'started', error: null, invalidationError: invalidationError }
      Promise.resolve(plantStore.getUserPlants())
        .then(function () {
          state.storeLoad.status = 'resolved'
        })
        .catch(function (error) {
          state.storeLoad.status = 'failed'
          state.storeLoad.error = String(error && error.message ? error.message : error)
        })
      return { ok: true, storeLoadStarted: true, invalidationError: invalidationError }
    } catch (error) {
      return {
        ok: false,
        reason: String(error && error.message ? error.message : error),
        plantIds: []
      }
    }
  }, definition)
  if (!storeLoadStarted?.ok || !storeLoadStarted.storeLoadStarted) {
    throw fixtureError('fixture plant store load did not start', storeLoadStarted)
  }
  const plantCheck = await pollFixturePlantStoreReadiness({
    inspect: () => inspectFixturePlantStoreState(miniProgram, definition)
  })
  if (!plantCheck.ok) {
    throw fixtureError('fixture plant did not enter the real plant store', plantCheck)
  }
  return plantCheck
}

export async function pollFixturePlantStoreReadiness({
  inspect,
  timeoutMs = FIXTURE_STORE_READY_TIMEOUT_MS,
  pollMs = FIXTURE_STORE_READY_POLL_MS,
  inspectTimeoutMs = FIXTURE_STORE_INSPECTION_TIMEOUT_MS,
  now = Date.now,
  sleepFn = sleep,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  const deadline = now() + timeoutMs
  let lastObservation = null
  while (now() <= deadline) {
    const remaining = Math.max(0, deadline - now())
    const inspection = await resolveWithinDeadline({
      action: inspect,
      timeoutMs: Math.min(inspectTimeoutMs, remaining),
      setTimer,
      clearTimer
    })
    if (inspection.timedOut) {
      return {
        ok: false,
        reason: 'fixture runtime inspection timed out',
        inspectTimeoutMs: inspection.timeoutMs,
        lastObservation,
        inspection
      }
    }
    lastObservation = inspection.error
      ? { ok: false, reason: `fixture runtime observation failed: ${inspection.error}` }
      : inspection.value
    if (
      lastObservation?.fixturePlantPresent === true &&
      lastObservation.userPlantsRequestObserved === true
    ) {
      return { ok: true, ...lastObservation }
    }
    const sleepRemaining = deadline - now()
    if (sleepRemaining <= 0) {
      break
    }
    await sleepFn(Math.min(pollMs, sleepRemaining))
  }
  return {
    ok: false,
    reason: 'fixture plant/store request readiness timed out',
    timeoutMs,
    lastObservation
  }
}

async function inspectFixturePlantStoreState(miniProgram, definition) {
  return miniProgram.evaluate(function (fixture) {
    try {
      var pinia = require('store/index.js').pinia
      var plantModule = require('store/plants.js')
      var usePlantStore = plantModule.usePlantStore || plantModule.default
      var state = globalThis[fixture.runtimeSlot]
      var plantStore = usePlantStore(pinia)
      var plants = Array.isArray(plantStore.userPlants) ? plantStore.userPlants : []
      var plantIds = plants.map(function (plant) {
        return Number(plant && plant.id)
      })
      var requests = state && Array.isArray(state.requests) ? state.requests : []
      return {
        ok: Boolean(state),
        fixturePlantId: Number(fixture.plant.id),
        plantIds: plantIds,
        fixturePlantPresent: plantIds.indexOf(Number(fixture.plant.id)) >= 0,
        userPlantsRequestObserved: requests.some(function (request) {
          return (
            request.fixture === true && /plant-user-http\/user-plants(?:\?|$)/.test(request.url)
          )
        }),
        storeLoad: state && state.storeLoad ? state.storeLoad : null,
        requestCount: requests.length,
        reason: state ? null : 'fixture runtime state unavailable'
      }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)
}

export async function readAirEnvironmentFixtureRequests(miniProgram) {
  return readFixtureRequests(miniProgram, fixtureDefinition())
}

export async function inspectAirEnvironmentHomeFixtureState(miniProgram) {
  return inspectHomeFixtureState(miniProgram, fixtureDefinition(), fixtureError)
}

export async function restoreAirEnvironmentDiagnosisFixture(miniProgram) {
  if (!miniProgram) {
    return { restored: false, skipped: true }
  }
  const definition = fixtureDefinition()
  const restored = await miniProgram.evaluate(function (fixture) {
    var failures = []
    var state = globalThis[fixture.runtimeSlot]
    if (!state) {
      return { restored: false, reason: 'fixture snapshot unavailable' }
    }
    try {
      var wxRef = typeof wx === 'undefined' ? null : wx
      var vendor = require('common/vendor.js')
      var uniRef = vendor && vendor.index ? vendor.index : typeof uni === 'undefined' ? null : uni
      if (uniRef && typeof state.originalUniRequest === 'function') {
        uniRef.request = state.originalUniRequest
      }
      if (wxRef && typeof state.originalWxRequest === 'function') {
        wxRef.request = state.originalWxRequest
      }
      if (wxRef) {
        if (state.userStoragePresent) {
          wxRef.setStorageSync(fixture.userStoreKey, state.userStorage)
        } else {
          wxRef.removeStorageSync(fixture.userStoreKey)
        }
      }
    } catch (error) {
      failures.push(
        'request/storage restore: ' + String(error && error.message ? error.message : error)
      )
    }
    try {
      var pinia = require('store/index.js').pinia
      var userModule = require('store/user.js')
      var plantModule = require('store/plants.js')
      var diagnoseModule = require('store/diagnose.js')
      var useUserStore = userModule.useUserStore || userModule.default
      var usePlantStore = plantModule.usePlantStore || plantModule.default
      var useDiagnoseStore = diagnoseModule.useDiagnoseStore || diagnoseModule.default
      useUserStore(pinia).$patch(state.userState || {})
      usePlantStore(pinia).$patch(state.plantState || {})
      useDiagnoseStore(pinia).$patch(state.diagnoseState || {})
      var storageInfo =
        wxRef && typeof wxRef.getStorageInfoSync === 'function'
          ? wxRef.getStorageInfoSync()
          : { keys: [] }
      var currentKeys = Array.isArray(storageInfo.keys) ? storageInfo.keys : []
      currentKeys.forEach(function (key) {
        if (String(key).indexOf(fixture.diagnosisStoragePrefix) === 0) {
          wxRef.removeStorageSync(key)
        }
      })
      Object.keys(state.diagnosisStorage || {}).forEach(function (key) {
        wxRef.setStorageSync(key, state.diagnosisStorage[key])
      })
    } catch (error) {
      failures.push('store restore: ' + String(error && error.message ? error.message : error))
    }
    try {
      var queryClient = require('lib/query-client.js').queryClient
      if (state.queryPresent && queryClient && typeof queryClient.setQueryData === 'function') {
        queryClient.setQueryData(fixture.userPlantsQueryKey, state.queryValue)
      } else if (
        !state.queryPresent &&
        queryClient &&
        typeof queryClient.removeQueries === 'function'
      ) {
        queryClient.removeQueries({ queryKey: fixture.userPlantsQueryKey })
      } else {
        failures.push('user-plants cache restore API unavailable')
      }
    } catch (error) {
      failures.push('cache restore: ' + String(error && error.message ? error.message : error))
    }
    delete globalThis[fixture.runtimeSlot]
    return { restored: failures.length === 0, failures }
  }, { ...definition, diagnosisStoragePrefix: DIAGNOSIS_STORAGE_PREFIX })
  if (!restored?.restored) {
    throw fixtureError('fixture restore failed', restored)
  }
  return restored
}
