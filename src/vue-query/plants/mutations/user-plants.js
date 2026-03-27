import { requestHttpFunction } from '@/api/http'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'

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

export function executeCreateUserPlantMutation(payload) {
  return runVueQueryMutation(buildUserPlantsMutationOptions(), {
    method: 'POST',
    payload
  })
}

export function executePatchUserPlantMutation(payload) {
  return runVueQueryMutation(buildUserPlantsMutationOptions(), {
    method: 'PATCH',
    payload
  })
}

export function executeRemoveUserPlantMutation(id) {
  return runVueQueryMutation(buildUserPlantsMutationOptions(), {
    method: 'DELETE',
    payload: { id }
  })
}
