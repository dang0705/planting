import { requestHttpFunction } from '@/api/http'
import { queryClient } from '@/lib/query-client.js'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export const USER_PLANTS_QUERY_KEY = ['http-function', 'plant-user-http', 'user-plants']
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const QA_PERFORMANCE_REFRESH = import.meta.env.VITE_QA_PERFORMANCE_COLD_LANE === '1'
const QA_PERFORMANCE_PLATFORM_SESSION = import.meta.env.VITE_QA_PERFORMANCE_PLATFORM_SESSION === '1'

export function buildUserPlantsQueryKey(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
  return [...USER_PLANTS_QUERY_KEY, page, pageSize]
}

export function buildUserPlantsQueryOptions(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
  return {
    queryKey: buildUserPlantsQueryKey(page, pageSize),
    queryFn: async () => requestUserPlants(page, pageSize),
    // 性能验收必须每次从首页真实发出列表请求，避免把 Vue Query
    // 缓存命中误报成接口响应速度；普通构建仍保留现有缓存策略。
    ...(QA_PERFORMANCE_REFRESH ? { staleTime: 0 } : {})
  }
}

function requestUserPlants(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
  return requestHttpFunction('plant-user-http/user-plants', {
    query: { page, pageSize },
    requireSignedIdentityTicket: true,
    // 仅用于基线/候选的同传输对比；默认仍使用短票据读链路。
    ...(QA_PERFORMANCE_PLATFORM_SESSION ? { preferPlatformSession: true } : {})
  })
}

export function invalidateUserPlantsQuery() {
  return queryClient.invalidateQueries({ queryKey: USER_PLANTS_QUERY_KEY })
}

export function fetchUserPlantsQuery(page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE) {
  return runVueQueryQuery(buildUserPlantsQueryOptions(page, pageSize))
}
