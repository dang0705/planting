import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  executeRequestChain,
  type RequestChainConfig,
  type RequestChainResult
} from './request-chain.js'

/** 请求链无法生成结果时返回的稳定公开错误；不得附加内部异常文本。 */
const unexpectedFailureResult: RequestChainResult<never> = {
  status: 500,
  body: {
    error: {
      type: 'INTERNAL_ERROR',
      message: '服务暂时不可用'
    }
  }
}

/**
 * 不同路由可注入的固定请求链阶段；HTTP 适配器负责在每次请求时补入原始 Node 请求。
 *
 * @typeParam TRestrictedInput 请求限制阶段输出的安全输入，后续步骤只能使用该受限结果。
 * @typeParam TIdentityCredentials 身份验证阶段输出的凭据验证结果，不应包含可公开的令牌原文。
 * @typeParam TPrincipal 经凭据解析得到的统一访问主体。
 * @typeParam TDto 通过对应路由结构校验的请求数据传输对象。
 * @typeParam TCommand 由 DTO 与统一主体构造的应用命令或查询。
 * @typeParam TDomainDecision 领域规则阶段批准的确定性结果。
 * @typeParam TPersistenceResult Repository 在事务边界内持久化并读回的结果。
 * @typeParam TPublicData 经过白名单转换、可安全返回给 HTTP 调用方的数据。
 */
export type NodeRequestChainSteps<
  TRestrictedInput,
  TIdentityCredentials,
  TPrincipal,
  TDto,
  TCommand,
  TDomainDecision,
  TPersistenceResult,
  TPublicData
> = Omit<
  RequestChainConfig<
    IncomingMessage,
    TRestrictedInput,
    TIdentityCredentials,
    TPrincipal,
    TDto,
    TCommand,
    TDomainDecision,
    TPersistenceResult,
    TPublicData
  >,
  'rawRequest'
>

/**
 * 把 Node.js HTTP 请求接入既有固定请求链，并将链结果写成单次 JSON 响应。
 *
 * 该工厂只提供协议适配，不选择路由、不读取或解析请求正文，也不配置身份、数据库或领域步骤。
 * 调用方须在已冻结的路由匹配之后选择对应处理器；`requestLimits` 是唯一能首先消费原始请求流的阶段。
 */
export type NodeRequestChainHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void>

/** 判断响应是否已结束、已销毁或已由其他处理器开始发送。 */
function isResponseClosed(response: ServerResponse): boolean {
  return response.destroyed || response.writableEnded
}

/** 将请求链结果转换为一次性 UTF-8 JSON HTTP 响应；重复发送时销毁不完整连接。 */
function writeJsonResponse<TPublicData>(
  response: ServerResponse,
  result: RequestChainResult<TPublicData>
): void {
  if (isResponseClosed(response)) {
    return
  }

  if (response.headersSent) {
    response.destroy()
    return
  }

  const serializedBody = JSON.stringify(result.body)
  if (typeof serializedBody !== 'string') {
    throw new TypeError('HTTP 响应正文无法序列化')
  }

  response.writeHead(result.status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(serializedBody, 'utf8')
  })
  response.end(serializedBody)
}

/** 在未发送任何响应字节时写稳定泛化错误；已经开始发送则销毁半截响应。 */
function writeUnexpectedFailureResponse(response: ServerResponse): void {
  if (isResponseClosed(response)) {
    return
  }

  if (response.headersSent) {
    response.destroy()
    return
  }

  try {
    writeJsonResponse(response, unexpectedFailureResult)
  } catch {
    if (!isResponseClosed(response)) {
      response.destroy()
    }
  }
}

/**
 * 为单一路由创建 Node.js HTTP 请求处理器。
 *
 * 请求对象原样作为固定链的 `rawRequest` 输入，因此正文大小与媒体类型检查仍由链的第一阶段负责。
 * 适配器只负责把链返回的状态码和公开 JSON 正文写入响应，并在链异常或响应序列化失败时返回
 * 稳定、脱敏的 `INTERNAL_ERROR`。如果响应已被其他处理器结束，不会再次写响应头或结束响应。
 *
 * @typeParam TRestrictedInput 请求限制阶段输出的安全输入。
 * @typeParam TIdentityCredentials 身份验证阶段输出的凭据验证结果。
 * @typeParam TPrincipal 经凭据解析得到的统一访问主体。
 * @typeParam TDto 通过对应路由结构校验的请求数据传输对象。
 * @typeParam TCommand 由 DTO 与统一主体构造的应用命令或查询。
 * @typeParam TDomainDecision 领域规则阶段批准的确定性结果。
 * @typeParam TPersistenceResult Repository 在事务边界内持久化并读回的结果。
 * @typeParam TPublicData 经过白名单转换、可安全返回给 HTTP 调用方的数据。
 * @param steps 当前路由实现的固定请求链各阶段；不包含每请求变化的 `rawRequest`。
 * @returns 可直接传给 `node:http` `createServer` 的异步请求处理器。
 */
export function createNodeRequestChainHandler<
  TRestrictedInput,
  TIdentityCredentials,
  TPrincipal,
  TDto,
  TCommand,
  TDomainDecision,
  TPersistenceResult,
  TPublicData
>(
  steps: NodeRequestChainSteps<
    TRestrictedInput,
    TIdentityCredentials,
    TPrincipal,
    TDto,
    TCommand,
    TDomainDecision,
    TPersistenceResult,
    TPublicData
  >
): NodeRequestChainHandler {
  return async (request, response) => {
    if (isResponseClosed(response)) {
      return
    }

    try {
      const result = await executeRequestChain({ ...steps, rawRequest: request })
      writeJsonResponse(response, result)
    } catch {
      writeUnexpectedFailureResponse(response)
    }
  }
}
