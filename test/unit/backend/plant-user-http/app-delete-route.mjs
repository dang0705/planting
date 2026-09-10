import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const sourcePath = path.join(repoRoot, 'cloudfunctions/plant-user-http/app.js')

function loadApp(deleteResult) {
  const originalLoad = Module._load
  const calls = []
  const requestCounters = { list: 0, cleanup: 0 }
  try {
    Module._load = function loadMock(request, parent, isMain) {
      if (request === '/opt/utils/http') {
        return {
          jsonResponse: (statusCode, payload) => ({ statusCode, payload }),
          internalServerError: message => ({ statusCode: 500, payload: { code: 500, message } }),
          notFound: () => ({ statusCode: 404 }),
          methodNotAllowed: () => ({ statusCode: 405 }),
          getHttpRequestData: event => event,
          resolveRequestAppEnv: () => null,
          runWithRequestAppEnv: (_env, fn) => fn(),
          resolveHttpUserInfo: async () => ({ openid: 'wx_owner' })
        }
      }
      if (request === '/opt/utils/plant-knowledge') {
        return {
          createUserPlantInstance: async () => ({}),
          getUserPlantInstanceById: async () => null,
          listUserPlantInstances: async () => {
            requestCounters.list += 1
            return { list: [] }
          },
          updateUserPlantInstance: async () => ({}),
          getUserPlantWateringStrategy: async () => ({})
        }
      }
      if (request === '/opt/utils/watering-planner') {
        return { buildWateringPlanner: () => ({}), normalizeCareBehaviorTimeline: value => value }
      }
      if (request === '/opt/utils/transpiration') {
        return {
          computeTranspirationIntervalFactor: () => ({}),
          resolveShadowModeFromEnv: () => false
        }
      }
      if (request === '/opt/utils/user-plant-light-environment') {
        return { getUserPlantLightEnvironment: async () => null }
      }
      if (request === '/opt/utils/air-environment-evidence') {
        return { resolveAirEnvironmentEvidence: () => null }
      }
      if (request.endsWith('/care-location-service')) {
        return {
          attachCareLocation: value => value,
          attachCareLocationsToList: async ({ data }) => data,
          savePlantCareLocation: async () => null
        }
      }
      if (request.endsWith('/watering-reminder-service')) {
        return {
          attachWateringReminderStateToList: async (_openid, data) => data,
          completeWateringReminder: async () => ({}),
          readWateringReminder: async () => ({}),
          saveWateringReminder: async () => ({})
        }
      }
      if (request.endsWith('/fertilization-reminder-service')) {
        return {
          attachFertilizationReminderStateToList: async (_openid, data) => data,
          cancelFertilizationReminder: async () => ({}),
          completeFertilizationReminder: async () => ({}),
          confirmFertilizationReminder: async () => ({}),
          dismissFertilizationReminder: async () => ({}),
          previewFertilizationReminder: async () => ({}),
          readFertilizationReminder: async () => ({})
        }
      }
      if (request.endsWith('/watering-planner-service')) {
        return {
          buildWeatherSummary: () => ({}),
          computeAdhocPlanner: async () => ({}),
          injectD0IntoForecastDays: async () => ({})
        }
      }
      if (request.endsWith('/watering-advisor-service')) {
        return {
          saveAdvisorSession: async () => ({}),
          confirmAdvisorSessionWatered: async () => ({}),
          listAdvisorSessions: async () => ({})
        }
      }
      if (request.endsWith('/air-environment-service')) {
        return {
          readUserPlantAirEnvironment: async () => ({}),
          saveUserPlantAirEnvironment: async () => ({})
        }
      }
      if (request.endsWith('/plant-deletion-service')) {
        return {
          deleteUserPlantCompletely: async input => {
            calls.push(input)
            if (deleteResult instanceof Error) {
              throw deleteResult
            }
            return deleteResult
          },
          drainPendingPlantFileDeletionJobs: async () => {
            requestCounters.cleanup += 1
            return { attempted: 0, pending: 0 }
          }
        }
      }
      return originalLoad.call(this, request, parent, isMain)
    }
    delete require.cache[sourcePath]
    return { app: require(sourcePath), calls, requestCounters }
  } finally {
    Module._load = originalLoad
    delete require.cache[sourcePath]
  }
}

{
  const { app, requestCounters } = loadApp({ cleanupPending: false, cleanupAttempted: 0 })
  const response = await app._test.main({
    path: '/user-plants',
    method: 'GET',
    query: {},
    headers: {},
    body: {}
  })
  assert.equal(response.statusCode, 200)
  assert.equal(requestCounters.list, 1)
  assert.equal(requestCounters.cleanup, 0)
}

{
  const { app, calls } = loadApp({ cleanupPending: true, cleanupAttempted: 1 })
  const response = await app._test.main({
    path: '/user-plants',
    method: 'DELETE',
    query: {},
    headers: {},
    body: { id: 42 }
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ openid: 'wx_owner', plantId: 42 }])
  assert.equal(response.payload.message, '植物已删除，图片正在清理')
  assert.deepEqual(response.payload.data, { id: 42, cleanupPending: true, cleanupAttempted: 1 })
}

{
  const error = new Error('schema is unavailable')
  error.statusCode = 503
  const { app } = loadApp(error)
  const response = await app._test.main({
    path: '/user-plants',
    method: 'DELETE',
    query: {},
    headers: {},
    body: { id: 42 }
  })
  assert.equal(response.statusCode, 503)
  assert.equal(response.payload.message, '删除服务暂未就绪，请稍后重试')
}

console.log('plant delete route tests passed')
