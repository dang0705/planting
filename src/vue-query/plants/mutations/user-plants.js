import { requestHttpFunction } from '@/api/http'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'
import { invalidateUserPlantsQuery } from '@/vue-query/plants/queries/user-plants.js'

function buildUserPlantsMutationOptions() {
  return {
    mutationKey: ['http-function', 'plant-user-http', 'user-plants-mutation'],
    mutationFn: async ({ method, payload }) =>
      requestHttpFunction('plant-user-http/user-plants', {
        method,
        body: payload
      })
  }
}

async function runUserPlantsMutation(variables) {
  const response = await runVueQueryMutation(buildUserPlantsMutationOptions(), variables)
  await invalidateUserPlantsQuery()
  return response
}

export function executeCreateUserPlantMutation(payload) {
  return runUserPlantsMutation({
    method: 'POST',
    payload
  })
}

export function executePatchUserPlantMutation(payload) {
  return runUserPlantsMutation({
    method: 'PATCH',
    payload
  })
}

export function executeRemoveUserPlantMutation(id) {
  return runUserPlantsMutation({
    method: 'DELETE',
    payload: { id }
  })
}
