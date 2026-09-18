import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

const QA_PERFORMANCE_REFRESH = import.meta.env.VITE_QA_PERFORMANCE_COLD_LANE === '1'
const QA_PERFORMANCE_PLATFORM_SESSION = import.meta.env.VITE_QA_PERFORMANCE_PLATFORM_SESSION === '1'

export function buildAuthUserByOpenidQueryOptions(openid) {
  return {
    queryKey: ['http-function', 'auth-user-http', 'user-by-openid', openid],
    queryFn: async () =>
      requestHttpFunction('auth-user-http/auth/user', {
        method: 'POST',
        // 当前用户读取允许使用由持久会话签发的短票据；票据缺失或过期时
        // 请求层只刷新一次，服务端仍按同一 userId 读取。
        requireSignedIdentityTicket: true,
        // 仅用于基线/候选的同传输对比；默认仍使用短票据读链路。
        ...(QA_PERFORMANCE_PLATFORM_SESSION ? { preferPlatformSession: true } : {}),
        body: {
          action: 'getUserByOpenid',
          data: { openid }
        }
      }),
    enabled: Boolean(openid),
    // 性能验收必须测真实 auth/user 网络请求，不能把 Vue Query 缓存命中
    // 误算成接口响应；普通构建不改变现有缓存策略。
    ...(QA_PERFORMANCE_REFRESH ? { staleTime: 0 } : {})
  }
}

export function fetchAuthUserByOpenidQuery(openid) {
  return runVueQueryQuery(buildAuthUserByOpenidQueryOptions(openid))
}
