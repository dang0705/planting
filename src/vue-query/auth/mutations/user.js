import { requestHttpFunction } from '@/api/http'
import { runVueQueryMutation } from '@/lib/vue-query-runtime.js'

function buildAuthUserMutationOptions() {
  return {
    mutationKey: ['http-function', 'auth-user-http', 'auth-user'],
    mutationFn: async ({ method = 'POST', action, data }) => {
      return requestHttpFunction('auth-user-http/auth/user', {
        method,
        body: {
          action,
          data
        }
      })
    }
  }
}

export function executeAuthUserMutation(variables) {
  return runVueQueryMutation(buildAuthUserMutationOptions(), variables)
}
