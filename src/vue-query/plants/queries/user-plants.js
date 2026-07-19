import { requestHttpFunction } from '@/api/http'
import { queryClient } from '@/lib/query-client.js'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export const USER_PLANTS_QUERY_KEY = ['http-function', 'plant-user-http', 'user-plants']
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20

export function buildUserPlantsQueryKey(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
  return [...USER_PLANTS_QUERY_KEY, page, pageSize]
}

export function buildUserPlantsQueryOptions(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
  return {
    queryKey: buildUserPlantsQueryKey(page, pageSize),
    queryFn: async () =>
      requestHttpFunction('plant-user-http/user-plants', {
        query: { page, pageSize }
      })
  }
}

export function invalidateUserPlantsQuery() {
  return queryClient.invalidateQueries({ queryKey: USER_PLANTS_QUERY_KEY })
}

export function fetchUserPlantsQuery(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
  return runVueQueryQuery(buildUserPlantsQueryOptions(page, pageSize))
}
