import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildAuthUserByOpenidQueryOptions(openid) {
  return {
    queryKey: ['http-function', 'auth-user-http', 'user-by-openid', openid],
    queryFn: async () =>
      requestHttpFunction('auth-user-http/auth/user', {
        method: 'POST',
        body: {
          action: 'getUserByOpenid',
          data: { openid }
        }
      }),
    enabled: Boolean(openid)
  }
}

export function fetchAuthUserByOpenidQuery(openid) {
  return runVueQueryQuery(buildAuthUserByOpenidQueryOptions(openid))
}
