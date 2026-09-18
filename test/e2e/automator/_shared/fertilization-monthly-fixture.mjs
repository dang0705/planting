'use strict'

/* oxlint-disable no-magic-numbers -- Serialized Mini Program fixture callbacks must remain self-contained. */

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export async function installFixture(
  mp,
  {
    user,
    plant,
    userStoreKey,
    queryKey,
    runtimeSlot,
    calendarMode = 'success',
    initialReminder = null,
    behavior = {}
  }
) {
  const currentMonth = new Date().getMonth() + 1
  const currentRow = (plant.fertilizationMonthly?.rows || []).find(
    row => Number(row?.month) === currentMonth
  )
  const definition = {
    user: clone(user),
    plant: clone(plant),
    userStoreKey,
    queryKey,
    runtimeSlot,
    calendarMode,
    initialReminder: clone(initialReminder),
    behavior: clone(behavior),
    liquidSchedule: clone(currentRow?.liquid?.schedule || null),
    slowReleaseSchedule: clone(currentRow?.slowRelease?.schedule || null)
  }

  const snapshot = await mp.evaluate(function (fixture) {
    function cloneRuntime(value) {
      if (typeof value === 'undefined') {
        return null
      }
      return JSON.parse(JSON.stringify(value))
    }
    try {
      const pinia = require('store/index.js').pinia
      const userModule = require('store/user.js')
      const plantModule = require('store/plants.js')
      const queryClient = require('lib/query-client.js').queryClient
      const vendor = require('common/vendor.js')
      const wxRef = typeof wx === 'undefined' ? null : wx
      const uniRef = vendor && vendor.index ? vendor.index : typeof uni === 'undefined' ? null : uni
      const userStore = (userModule.useUserStore || userModule.default)(pinia)
      const plantStore = (plantModule.usePlantStore || plantModule.default)(pinia)
      const cached =
        queryClient && typeof queryClient.getQueryData === 'function'
          ? queryClient.getQueryData(fixture.queryKey)
          : undefined
      const reminderQueryKey = [
        'http-function',
        'plant-user-http',
        'fertilization-reminders',
        Number(fixture.plant.id)
      ]
      const cachedReminder =
        queryClient && typeof queryClient.getQueryData === 'function'
          ? queryClient.getQueryData(reminderQueryKey)
          : undefined
      globalThis[fixture.runtimeSlot] = {
        userStoragePresent: Boolean(
          wxRef &&
          wxRef.getStorageInfoSync &&
          wxRef.getStorageInfoSync().keys.indexOf(fixture.userStoreKey) >= 0
        ),
        userStorage: cloneRuntime(
          wxRef && wxRef.getStorageSync ? wxRef.getStorageSync(fixture.userStoreKey) : undefined
        ),
        userState: cloneRuntime(userStore.$state),
        plantState: cloneRuntime(plantStore.$state),
        queryPresent: typeof cached !== 'undefined',
        queryValue: cloneRuntime(cached),
        reminderQueryKey: reminderQueryKey,
        reminderQueryPresent: typeof cachedReminder !== 'undefined',
        reminderQueryValue: cloneRuntime(cachedReminder),
        originalUniRequest: uniRef && uniRef.request,
        originalWxRequest: wxRef && wxRef.request,
        originalUniAddPhoneCalendar: uniRef && uniRef.addPhoneCalendar,
        requests: [],
        calendarCalls: [],
        calendarMode: fixture.calendarMode,
        pendingPlan: null,
        reminder: cloneRuntime(fixture.initialReminder),
        cancelledPlanIds: [],
        completedPlans: [],
        dismissedPlans: [],
        confirmAttempts: 0,
        behavior: cloneRuntime(fixture.behavior || {})
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)

  if (!snapshot?.ok) {
    throw new Error(`fixture snapshot failed: ${snapshot?.reason || 'unknown error'}`)
  }

  await mp.callWxMethod('setStorageSync', userStoreKey, definition.user)

  const patched = await mp.evaluate(function (fixture) {
    function cloneRuntime(value) {
      if (typeof value === 'undefined') {
        return null
      }
      return JSON.parse(JSON.stringify(value))
    }
    try {
      const pinia = require('store/index.js').pinia
      const userModule = require('store/user.js')
      const plantModule = require('store/plants.js')
      const queryClient = require('lib/query-client.js').queryClient
      const userStore = (userModule.useUserStore || userModule.default)(pinia)
      const plantStore = (plantModule.usePlantStore || plantModule.default)(pinia)
      userStore.$patch(fixture.user)
      // Fixture 注入发生在首页已挂载之后。先把页面可观察状态回灌；
      // 请求刷新必须等请求拦截安装完成后再触发，否则原始请求可能在夹具
      // 安装后返回并覆盖月度施肥数据。
      plantStore.userPlants = [cloneRuntime(fixture.plant)]
      if (queryClient && typeof queryClient.removeQueries === 'function') {
        queryClient.removeQueries({ queryKey: fixture.queryKey })
        queryClient.removeQueries({
          queryKey: [
            'http-function',
            'plant-user-http',
            'fertilization-reminders',
            Number(fixture.plant.id)
          ]
        })
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)
  if (!patched?.ok) {
    throw new Error(`fixture user setup failed: ${patched?.reason || 'unknown error'}`)
  }

  const installed = await mp.evaluate(async function (fixture) {
    function cloneRuntime(value) {
      if (typeof value === 'undefined') {
        return null
      }
      return JSON.parse(JSON.stringify(value))
    }
    try {
      const pinia = require('store/index.js').pinia
      const plantModule = require('store/plants.js')
      const plantStore = (plantModule.usePlantStore || plantModule.default)(pinia)
      const state = globalThis[fixture.runtimeSlot]
      const vendor = require('common/vendor.js')
      const wxRef = typeof wx === 'undefined' ? null : wx
      const uniRef = vendor && vendor.index ? vendor.index : typeof uni === 'undefined' ? null : uni
      if (!state || !uniRef || typeof state.originalUniRequest !== 'function') {
        return { ok: false, reason: 'request interception prerequisites unavailable' }
      }
      const plantPayload = function () {
        const plant = cloneRuntime(fixture.plant)
        plant.fertilizationReminder = cloneRuntime(state.reminder)
        return plant
      }
      const requestFixture = function (options) {
        const url = String(options && options.url ? options.url : '')
        const method = String(options && options.method ? options.method : 'GET').toUpperCase()
        const data = (options && options.data) || {}
        if (/plant-user-http\/user-plants\?id=95001(?:&|$)/.test(url)) {
          return { code: 200, data: plantPayload() }
        }
        if (/plant-user-http\/user-plants(?:\?|$)/.test(url)) {
          return {
            code: 200,
            data: { list: [plantPayload()], total: 1, page: 1, pageSize: 50 }
          }
        }
        if (/plant-user-http\/user-plants\/fertilization-reminders\?plantId=95001/.test(url)) {
          return { code: 200, data: cloneRuntime(state.reminder) }
        }
        if (
          method === 'POST' &&
          /plant-user-http\/user-plants\/fertilization-reminders\/preview/.test(url)
        ) {
          const behavior = state.behavior || {}
          const previewBehavior = behavior.preview || {}
          const fertilizerType = data.fertilizerType || 'liquid'
          const schedule =
            previewBehavior.schedule ||
            (fertilizerType === 'slowRelease'
              ? fixture.slowReleaseSchedule
              : fixture.liquidSchedule)
          const reminderKind = previewBehavior.reminderKind || 'first_confirmation'
          const confirmationReasons =
            previewBehavior.confirmationReasons ||
            (reminderKind === 'first_confirmation' ? ['first_confirmation'] : [])
          state.pendingPlan = {
            planId: previewBehavior.planId || 'fixture-fertilization-plan-95001',
            plantId: 95001,
            fertilizerType,
            reminderKind,
            confirmationReasons,
            nextCheckDate: previewBehavior.nextCheckDate || '2026-08-22',
            nextTime: previewBehavior.nextTime || '2026-08-22T09:00:00',
            dueNow: Boolean(previewBehavior.dueNow),
            lastDateSource: previewBehavior.lastDateSource || data.lastDateSource || 'estimated',
            ruleSnapshot: {
              reminderKind,
              confirmationReasons,
              displayText: previewBehavior.displayText || '每月1次',
              sourceNames: previewBehavior.sourceNames || ['RHS', 'UMN Extension'],
              schedule
            }
          }
          return {
            code: 200,
            data: cloneRuntime(state.pendingPlan)
          }
        }
        if (
          method === 'POST' &&
          /plant-user-http\/user-plants\/fertilization-reminders\/confirm/.test(url)
        ) {
          if (!state.pendingPlan || data.planId !== state.pendingPlan.planId) {
            return { code: 409, message: '检查计划已过期，请重新生成', data: null }
          }
          state.confirmAttempts += 1
          const behavior = state.behavior || {}
          const failureCodes = behavior.confirmFailureCodes || []
          const failureCode = failureCodes[state.confirmAttempts - 1]
          if (failureCode) {
            return { code: failureCode, message: '模拟应用内同步失败', data: null }
          }
          if (!data.calendarPayload && !state.pendingPlan.dueNow) {
            return { code: 400, message: '请先添加到手机日历', data: null }
          }
          state.reminder = cloneRuntime(state.pendingPlan)
          state.reminder.active = true
          state.reminder.calendarPayload = cloneRuntime(data.calendarPayload)
          state.reminder.isDue = false
          state.pendingPlan = null
          return { code: 200, data: cloneRuntime(state.reminder) }
        }
        if (
          method === 'POST' &&
          /plant-user-http\/user-plants\/fertilization-reminders\/complete/.test(url)
        ) {
          if (!state.reminder || data.planId !== state.reminder.planId) {
            return { code: 404, message: '提醒不存在', data: null }
          }
          const requirements = Array.isArray(state.reminder.conditionRequirements)
            ? state.reminder.conditionRequirements
            : []
          const answers = data.conditionAnswers || {}
          if (
            requirements.some(
              requirement =>
                typeof answers[requirement.code] !== 'boolean' || answers[requirement.code] !== true
            )
          ) {
            return {
              code: 422,
              message: '请先确认当前情况',
              data: { conditionRequirements: requirements }
            }
          }
          if (
            state.reminder.requiresMinimumIntervalAcknowledgement &&
            data.acknowledgeMinimumInterval !== true
          ) {
            return { code: 422, message: '请确认距离上次施肥至少达到本表最短间隔', data: null }
          }
          state.completedPlans.push({
            planId: String(data.planId),
            conditionAnswers: cloneRuntime(data.conditionAnswers || {}),
            acknowledgeMinimumInterval: data.acknowledgeMinimumInterval === true,
            fertilizerType: state.reminder.fertilizerType
          })
          state.reminder = null
          const behavior = state.behavior || {}
          return {
            code: 200,
            data: {
              completedDate: '2026-08-11',
              nextPreview: cloneRuntime(behavior.nextPreviewAfterComplete || null)
            }
          }
        }
        if (
          method === 'POST' &&
          /plant-user-http\/user-plants\/fertilization-reminders\/dismiss/.test(url)
        ) {
          if (!state.reminder || data.planId !== state.reminder.planId) {
            return { code: 404, message: '提醒不存在', data: null }
          }
          state.dismissedPlans.push({
            planId: String(data.planId),
            reason: data.reason || 'dismiss',
            status: data.reason === 'reconfigure' ? 'superseded' : 'dismissed'
          })
          state.reminder = null
          return { code: 200, data: null }
        }
        if (
          method === 'POST' &&
          /plant-user-http\/user-plants\/fertilization-reminders\/cancel/.test(url)
        ) {
          if (data.planId) {
            state.cancelledPlanIds.push(String(data.planId))
          }
          if (state.pendingPlan && data.planId === state.pendingPlan.planId) {
            state.pendingPlan = null
          }
          return { code: 200, data: null }
        }
        return null
      }
      const wrap = function (original) {
        return function request(options) {
          const opts = options || {}
          const captured = {
            url: String(opts.url || ''),
            method: String(opts.method || 'GET').toUpperCase(),
            data: cloneRuntime(opts.data || {}),
            time: Date.now()
          }
          const response = requestFixture(opts)
          if (!response) {
            return original.call(this, opts)
          }
          captured.fixture = true
          captured.response = { statusCode: 200, data: cloneRuntime(response) }
          state.requests.push(captured)
          setTimeout(function () {
            const result = { statusCode: 200, data: response }
            if (typeof opts.success === 'function') {
              opts.success(result)
            }
            if (typeof opts.complete === 'function') {
              opts.complete(result)
            }
          }, 20)
          return { onChunkReceived: function () {}, abort: function () {} }
        }
      }
      uniRef.request = wrap(state.originalUniRequest)
      if (wxRef && typeof state.originalWxRequest === 'function') {
        wxRef.request = wrap(state.originalWxRequest)
      }
      uniRef.addPhoneCalendar = function (options) {
        const payload = cloneRuntime({
          title: options && options.title,
          startTime: options && options.startTime,
          endTime: options && options.endTime,
          description: options && options.description,
          allDay: options && options.allDay
        })
        state.calendarCalls.push({ mode: state.calendarMode, payload: payload })
        setTimeout(function () {
          if (state.calendarMode === 'fail') {
            if (options && typeof options.fail === 'function') {
              options.fail({ errMsg: 'mock addPhoneCalendar:fail' })
            }
            return
          }
          if (options && typeof options.success === 'function') {
            options.success({ errMsg: 'addPhoneCalendar:ok' })
          }
        }, 20)
        return { abort: function () {} }
      }
      // 通过真实 store action 重新加载，保证首页和详情页都消费与产品一致
      // 的请求->映射链路；此时拦截器已就绪，不会再被真实请求覆盖。
      const loadResult = await plantStore.getUserPlants()
      return { ok: true, loadResult: cloneRuntime(loadResult) }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)
  if (!installed?.ok) {
    throw new Error(`fixture request interception failed: ${installed?.reason || 'unknown error'}`)
  }
}

export async function restoreFixture(mp, { userStoreKey, queryKey, runtimeSlot }) {
  if (!mp) {
    return
  }
  const restored = await mp.evaluate(
    function (fixture) {
      const failures = []
      const state = globalThis[fixture.runtimeSlot]
      if (!state) {
        return { restored: false, reason: 'fixture snapshot unavailable' }
      }
      try {
        const vendor = require('common/vendor.js')
        const wxRef = typeof wx === 'undefined' ? null : wx
        const uniRef =
          vendor && vendor.index ? vendor.index : typeof uni === 'undefined' ? null : uni
        if (uniRef && typeof state.originalUniRequest === 'function') {
          uniRef.request = state.originalUniRequest
        }
        if (uniRef && typeof state.originalUniAddPhoneCalendar === 'function') {
          uniRef.addPhoneCalendar = state.originalUniAddPhoneCalendar
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
          `request/storage restore: ${String(error && error.message ? error.message : error)}`
        )
      }
      try {
        const pinia = require('store/index.js').pinia
        const userModule = require('store/user.js')
        const plantModule = require('store/plants.js')
        ;(userModule.useUserStore || userModule.default)(pinia).$patch(state.userState || {})
        ;(plantModule.usePlantStore || plantModule.default)(pinia).$patch(state.plantState || {})
      } catch (error) {
        failures.push(`store restore: ${String(error && error.message ? error.message : error)}`)
      }
      try {
        const queryClient = require('lib/query-client.js').queryClient
        if (state.queryPresent && queryClient && typeof queryClient.setQueryData === 'function') {
          queryClient.setQueryData(fixture.queryKey, state.queryValue)
        } else if (
          !state.queryPresent &&
          queryClient &&
          typeof queryClient.removeQueries === 'function'
        ) {
          queryClient.removeQueries({ queryKey: fixture.queryKey })
        }
        if (
          state.reminderQueryPresent &&
          queryClient &&
          typeof queryClient.setQueryData === 'function'
        ) {
          queryClient.setQueryData(state.reminderQueryKey, state.reminderQueryValue)
        } else if (
          !state.reminderQueryPresent &&
          queryClient &&
          typeof queryClient.removeQueries === 'function'
        ) {
          queryClient.removeQueries({ queryKey: state.reminderQueryKey })
        }
      } catch (error) {
        failures.push(`query restore: ${String(error && error.message ? error.message : error)}`)
      }
      delete globalThis[fixture.runtimeSlot]
      return { restored: failures.length === 0, failures }
    },
    { runtimeSlot, userStoreKey, queryKey }
  )
  if (!restored?.restored) {
    throw new Error(`fixture restore failed: ${JSON.stringify(restored)}`)
  }
}
