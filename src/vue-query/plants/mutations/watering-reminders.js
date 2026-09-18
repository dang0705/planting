import { requestHttpFunction } from '@/api/http'
import { queryClient } from '@/lib/query-client.js'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'
import { buildWateringReminderQueryKey } from '@/vue-query/plants/queries/watering-reminders.js'
import { invalidateUserPlantsQuery } from '@/vue-query/plants/queries/user-plants.js'

const HTTP_OK = 200

function buildWateringReminderMutationOptions() {
  return {
    mutationKey: ['http-function', 'plant-user-http', 'watering-reminders-mutation'],
    mutationFn: async payload =>
      requestHttpFunction('plant-user-http/user-plants/watering-reminders', {
        method: 'POST',
        body: payload
      })
  }
}

function buildCompleteWateringMutationOptions() {
  return {
    mutationKey: ['http-function', 'plant-user-http', 'watering-reminders-complete'],
    mutationFn: async payload =>
      requestHttpFunction('plant-user-http/user-plants/watering-reminders/complete', {
        method: 'POST',
        body: payload,
        returnErrorResponse: true
      })
  }
}

export function executeSaveWateringReminderMutation(payload) {
  return runVueQueryMutation(buildWateringReminderMutationOptions(), payload).then(response => {
    updateWateringReminderQueryCache(payload, response)
    return invalidateUserPlantsQuery().then(() => response)
  })
}

export async function executeCompleteWateringReminderMutation(payload) {
  const response = await runVueQueryMutation(buildCompleteWateringMutationOptions(), payload)
  if (response?.code === HTTP_OK && payload?.plantId) {
    queryClient.removeQueries({ queryKey: buildWateringReminderQueryKey(payload.plantId) })
  }
  await invalidateUserPlantsQuery()
  return response
}

function updateWateringReminderQueryCache(payload = {}, response = {}) {
  if (response?.code !== HTTP_OK || !response?.data) {
    return
  }
  const plantIds = new Set([payload?.plantId, response.data.plantId].filter(Boolean))
  for (const plantId of plantIds) {
    queryClient.setQueryData(buildWateringReminderQueryKey(plantId), response)
  }
}
