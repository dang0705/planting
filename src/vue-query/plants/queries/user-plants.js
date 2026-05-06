import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildUserPlantsQueryOptions(page = 1, pageSize = 20) {
  return {
    queryKey: ['http-function', 'plant-user-http', 'user-plants', page, pageSize],
    queryFn: async () =>
      requestHttpFunction('plant-user-http/user-plants', {
        query: { page, pageSize }
      })
  }
}

export function fetchUserPlantsQuery(page = 1, pageSize = 20) {
  return runVueQueryQuery(buildUserPlantsQueryOptions(page, pageSize))
}
