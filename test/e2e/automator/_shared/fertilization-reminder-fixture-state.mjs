'use strict'

/* oxlint-disable no-magic-numbers -- Serialized Mini Program fixture callbacks must remain self-contained. */

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export async function readFixtureRequests(mp, runtimeSlot) {
  return mp.evaluate(function (slot) {
    const state = globalThis[slot]
    return state && Array.isArray(state.requests) ? state.requests : []
  }, runtimeSlot)
}

export async function readFixtureFertilizationState(mp, runtimeSlot) {
  return mp.evaluate(function (slot) {
    const state = globalThis[slot]
    if (!state) {
      return null
    }
    return {
      requests: state.requests || [],
      calendarCalls: state.calendarCalls || [],
      reminder: state.reminder || null,
      pendingPlan: state.pendingPlan || null,
      cancelledPlanIds: state.cancelledPlanIds || [],
      completedPlans: state.completedPlans || [],
      dismissedPlans: state.dismissedPlans || [],
      confirmAttempts: state.confirmAttempts || 0
    }
  }, runtimeSlot)
}

export async function resetFixtureFertilizationReminder(mp, runtimeSlot, options = {}) {
  const reset = await mp.evaluate(
    function (payload) {
      const state = globalThis[payload.runtimeSlot]
      if (!state) {
        return { ok: false, reason: 'fixture state unavailable' }
      }
      state.calendarCalls = []
      state.pendingPlan = null
      state.reminder = payload.reminder || null
      state.cancelledPlanIds = []
      state.completedPlans = []
      state.dismissedPlans = []
      state.confirmAttempts = 0
      state.calendarMode = payload.calendarMode || 'success'
      state.behavior = payload.behavior || {}
      try {
        const queryClient = require('lib/query-client.js').queryClient
        if (queryClient && typeof queryClient.removeQueries === 'function') {
          queryClient.removeQueries({ queryKey: state.reminderQueryKey })
        }
      } catch (error) {
        return {
          ok: false,
          reason: `unable to clear fertilization reminder query cache: ${String(
            error && error.message ? error.message : error
          )}`
        }
      }
      return { ok: true }
    },
    {
      runtimeSlot,
      calendarMode: options.calendarMode,
      reminder: options.reminder ? clone(options.reminder) : null,
      behavior: options.behavior ? clone(options.behavior) : {}
    }
  )
  if (!reset?.ok) {
    throw new Error(`fixture fertilization reset failed: ${reset?.reason || 'unknown error'}`)
  }
}
