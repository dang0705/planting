import { requestHttpFunction } from '@/api/http.js'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'
import { invalidateUserPlantsQuery } from '@/vue-query/plants/queries/user-plants.js'

function buildAirEnvironmentMutationOptions() {
  return {
    mutationKey: ['http-function', 'plant-user-http', 'user-plant-air-environment'],
    mutationFn: async payload =>
      requestHttpFunction('plant-user-http/user-plants/air-environment', {
        method: 'PATCH',
        body: payload,
        returnErrorResponse: true
      })
  }
}

export async function executePatchUserPlantAirEnvironmentMutation(payload = {}) {
  const response = await runVueQueryMutation(buildAirEnvironmentMutationOptions(), payload)
  await invalidateUserPlantsQuery()
  return response
}
