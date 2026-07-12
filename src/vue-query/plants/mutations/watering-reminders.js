import { requestHttpFunction } from '@/api/http'
import { queryClient } from '@/lib/query-client.js'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'
import { buildWateringReminderQueryKey } from '@/vue-query/plants/queries/watering-reminders.js'

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

export function executeSaveWateringReminderMutation(payload) {
  return runVueQueryMutation(buildWateringReminderMutationOptions(), payload).then(response => {
    updateWateringReminderQueryCache(payload, response)
    return response
  })
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
