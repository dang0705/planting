import { requestHttpFunction } from '@/api/http.js'
import { queryClient } from '@/lib/query-client.js'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'
import { invalidateUserPlantsQuery } from '@/vue-query/plants/queries/user-plants.js'
import { buildFertilizationReminderQueryKey } from '@/vue-query/plants/queries/fertilization-reminders.js'

const HTTP_OK = 200

function buildMutationOptions(action) {
  return {
    mutationKey: ['http-function', 'plant-user-http', 'fertilization-reminders', action],
    mutationFn: async payload =>
      requestHttpFunction(`plant-user-http/user-plants/fertilization-reminders/${action}`, {
        method: 'POST',
        body: payload
      })
  }
}

export async function executeFertilizationReminderMutation(action, payload = {}) {
  const response = await runVueQueryMutation(buildMutationOptions(action), payload)
  if (
    action === 'confirm' &&
    response?.code === HTTP_OK &&
    response.data?.active &&
    payload?.plantId
  ) {
    queryClient.setQueryData(buildFertilizationReminderQueryKey(payload.plantId), response)
  }
  if (['complete', 'dismiss', 'cancel'].includes(action) && payload?.plantId) {
    queryClient.removeQueries({ queryKey: buildFertilizationReminderQueryKey(payload.plantId) })
  }
  await invalidateUserPlantsQuery()
  return response
}
