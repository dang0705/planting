import type { IncomingMessage, ServerResponse } from 'node:http'

import type { PublicErrorResponse, PublicErrorType } from './request-chain.js'

/** route-registry.json 中允许出现的路由安全级别，含义见 http-api/v1 §2。 */
export type RouteSecurity =
  | 'public'
  | 'credential_exchange'
  | 'guest'
  | 'authenticated'
  | 'service'
  | 'guest_or_authenticated'
  /** 无需登录、仅签发游客令牌的写入口（guest-token/v1），必须限流。 */
  | 'guest_issuance'

/** 与 route-registry.json 逐字段一致的冻结路由登记；入口只能挂载已登记的路由。 */
export type FrozenRoute = {
  /** 大写 HTTP 方法，例如 GET、POST。 */
  readonly method: string
  /** 以 `/` 开头的冻结路径模板；`{name}` 表示单段路径参数。 */
  readonly path: string
  /** 路由登记表中的唯一操作标识，用于审计和合同对照。 */
  readonly operationId: string
  /** 路由安全级别；处理器必须按该级别配置请求链的身份阶段。 */
  readonly security: RouteSecurity
}

/** 已解码的路径参数，键为模板中的参数名。 */
export type RoutePathParameters = Readonly<Record<string, string>>

/** 单一路由的处理器；分发器只负责匹配，所有业务步骤由处理器内的固定请求链完成。 */
export type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  pathParameters: RoutePathParameters
) => Promise<void>

/** 冻结路由与其处理器的绑定关系。 */
export type RouteBinding = {
  /** 必须与 route-registry.json 一致的冻结登记。 */
  readonly route: FrozenRoute
  /** 仅处理该路由的请求处理器。 */
  readonly handler: RouteHandler
}

/** 编译后的路由匹配器。 */
type CompiledRoute = {
  /** 编译前的原始冻结路由登记，用于方法比对。 */
  readonly route: FrozenRoute
  /** 与该冻结路由绑定的唯一请求处理器。 */
  readonly handler: RouteHandler
  /** 逐段模板：字符串为字面段，对象为参数段。 */
  readonly segments: ReadonlyArray<
    | string
    | {
        /** 路径模板中花括号内声明的参数名称。 */
        readonly parameterName: string
      }
  >
}

const parameterSegmentPattern = /^\{([A-Za-z][A-Za-z0-9]*)\}$/u
const literalSegmentPattern = /^[A-Za-z0-9._-]+$/u
const badRequestStatus = 400
const notFoundStatus = 404
const methodNotAllowedStatus = 405
const internalErrorStatus = 500

/** 把冻结路径模板编译为逐段匹配器；模板不合法时在启动阶段失败关闭。 */
function compileSegments(path: string): CompiledRoute['segments'] {
  if (!path.startsWith('/') || path.length === 1) {
    throw new Error('冻结路由路径模板必须以 / 开头且不能为空')
  }
  return path
    .slice(1)
    .split('/')
    .map(segment => {
      const parameter = parameterSegmentPattern.exec(segment)
      if (parameter?.[1]) {
        return { parameterName: parameter[1] }
      }
      if (!literalSegmentPattern.test(segment)) {
        throw new Error('冻结路由路径模板包含非法段')
      }
      return segment
    })
}

/** 尝试把请求路径段与模板匹配；参数解码失败时返回 `invalid`。 */
function matchSegments(
  segments: CompiledRoute['segments'],
  requestSegments: readonly string[]
): RoutePathParameters | 'invalid' | null {
  if (segments.length !== requestSegments.length) {
    return null
  }
  const parameters: Record<string, string> = {}
  let invalidEncoding = false
  for (const [index, segment] of segments.entries()) {
    const requestSegment = requestSegments[index] ?? ''
    if (typeof segment === 'string') {
      if (segment !== requestSegment) {
        return null
      }
      continue
    }
    if (requestSegment.length === 0) {
      return null
    }
    try {
      parameters[segment.parameterName] = decodeURIComponent(requestSegment)
    } catch {
      invalidEncoding = true
    }
  }
  return invalidEncoding ? 'invalid' : parameters
}

/** 写出稳定公开错误；调用前请求正文已被丢弃。 */
function writeRouteError(
  response: ServerResponse,
  status: number,
  type: PublicErrorType,
  message: string
): void {
  if (response.headersSent || response.writableEnded) {
    response.destroy()
    return
  }
  const body: PublicErrorResponse = { error: { type, message } }
  const serialized = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(serialized, 'utf8')
  })
  response.end(serialized)
}

/**
 * 创建只认冻结登记的路由分发器。
 *
 * 规则：路径未登记返回 404 `NOT_FOUND`；路径已登记但方法不同返回 405 `METHOD_NOT_ALLOWED`；
 * 参数编码非法返回 400 `VALIDATION_FAILED`；处理器异常只返回泛化 500。分发器不做身份、DTO
 * 或业务判断，也不提供通配或兜底路由。
 */
export function createRouteDispatcher(
  bindings: readonly RouteBinding[]
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const seen = new Set<string>()
  const compiled: CompiledRoute[] = bindings.map(binding => {
    const key = `${binding.route.method} ${binding.route.path}`
    if (seen.has(key)) {
      throw new Error('同一 method + path 不得重复绑定')
    }
    seen.add(key)
    return {
      route: binding.route,
      handler: binding.handler,
      segments: compileSegments(binding.route.path)
    }
  })

  return async (request, response) => {
    const method = (request.method ?? '').toUpperCase()
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const requestSegments = pathname.slice(1).split('/')

    let pathMatched = false
    for (const candidate of compiled) {
      const parameters = matchSegments(candidate.segments, requestSegments)
      if (parameters === null) {
        continue
      }
      pathMatched = true
      if (candidate.route.method !== method) {
        continue
      }
      if (parameters === 'invalid') {
        request.resume()
        writeRouteError(response, badRequestStatus, 'VALIDATION_FAILED', '请求参数不合法')
        return
      }
      try {
        await candidate.handler(request, response, parameters)
      } catch {
        writeRouteError(response, internalErrorStatus, 'INTERNAL_ERROR', '服务暂时不可用')
      }
      return
    }

    request.resume()
    if (pathMatched) {
      writeRouteError(response, methodNotAllowedStatus, 'METHOD_NOT_ALLOWED', '请求方法不受支持')
      return
    }
    writeRouteError(response, notFoundStatus, 'NOT_FOUND', '请求路由不存在')
  }
}
