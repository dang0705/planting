import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { afterEach, describe, expect, test } from 'vitest'

import { createNodeRequestChainHandler } from '../../src/foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainConfig,
  type RequestChainStep,
  type RequestChainAuditEvent
} from '../../src/foundation/http/request-chain.js'

type RestrictedRequest = {
  /** 经第一步限制后的 HTTP 方法，供后续身份、归属和 DTO 阶段读取。 */
  method: string
  /** 已从原始 URL 中提取的路径；不得由适配器自行选择业务路由。 */
  pathname: string
  /** 原始授权头只在请求链内部使用，不允许进入公开响应。 */
  authorization: string | undefined
  /** 已读取的原始字节；实际媒体类型、大小限制由请求链第一步实施。 */
  body: Buffer
}

type IdentityCredentials = {
  /** 测试用的验证结论，不含原始令牌或平台主体标识。 */
  accepted: true
}

type TestPrincipal = {
  /** 当前请求已解析为统一登录主体。 */
  kind: 'user'
  /** 仅供测试链内部传递的用户引用。 */
  userId: string
}

type TestDto = {
  /** 本测试请求中经 JSON DTO 校验的养护动作。 */
  action: string
}

type TestCommand = {
  /** 由已校验 DTO 与统一主体构造的测试命令。 */
  action: string
  /** 命令归属的测试用户引用。 */
  userId: string
}

type TestDecision = {
  /** 领域阶段是否允许该动作继续持久化。 */
  approved: true
  /** 通过领域校验的动作。 */
  action: string
}

type TestPersistenceResult = {
  /** 模拟 Repository 读回后可安全转换为公开响应的引用。 */
  publicRef: string
}

type TestPublicData = {
  /** 公开 DTO 中的用户植物引用。 */
  userPlantRef: string
  /** 仅供序列化失败边界测试构造循环引用。 */
  self?: TestPublicData
}

type TestRequestChainConfig = RequestChainConfig<
  IncomingMessage,
  RestrictedRequest,
  IdentityCredentials,
  TestPrincipal,
  TestDto,
  TestCommand,
  TestDecision,
  TestPersistenceResult,
  TestPublicData
>

type TestRequestChainSteps = Omit<TestRequestChainConfig, 'rawRequest'>

type Handler = (request: IncomingMessage, response: ServerResponse) => Promise<void>

type HttpResult = {
  /** 真实 Node HTTP 服务返回的状态码。 */
  status: number
  /** 真实 Node HTTP 服务返回的响应头。 */
  headers: Headers
  /** 已完整读取的 UTF-8 响应正文。 */
  text: string
}

type StepHarnessOptions = {
  /** 设置后，身份阶段按合同拒绝请求并使后续阶段短路。 */
  rejectIdentity?: boolean
  /** 设置后，公开响应阶段构造循环引用以触发序列化失败边界。 */
  circularPublicData?: boolean
  /** 设置后，事务步骤抛出含私密标记的异常，验证公开错误不会泄漏原文。 */
  failPersistence?: boolean
  /** 测试用首阶段正文上限；实际 1 MiB 限制另由真实 server 合同测试验证。 */
  maxBodyBytes?: number
}

const requestBody = JSON.stringify({ action: 'water' })
const normalJsonRequestBodyLimitBytes = 1_048_576
const zeroBytes = 0
const oneByte = 1
const authorizationMarker = 'Bearer private-test-token-71c4'
const rawFailureMarker = 'private-database-error-51a2'
const successStatusCode = 200
const principalErrorStatusCode = 401
const validationErrorStatusCode = 400
const payloadTooLargeStatusCode = 413
const internalErrorStatusCode = 500
const outerHandledStatusCode = 202
const ephemeralPort = 0

const expectedStageOrder = [
  'requestLimits',
  'identityValidate',
  'principalResolve',
  'objectOwnership',
  'dtoValidate',
  'buildCommand',
  'domainRule',
  'transactionPersistence',
  'publicResponse',
  'writeAudit:allowed'
]
const handlersToClose = new Set<ReturnType<typeof createServer>>()

/** 构造 UTF-8 字节数精确为目标值的合法 JSON 正文。 */
function buildJsonRequestBodyOfSize(targetBytes: number): string {
  const prefix = '{"message":"'
  const suffix = '"}'
  const paddingBytes = targetBytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix)
  if (paddingBytes < zeroBytes) {
    throw new Error('目标正文小于 JSON 固定结构')
  }
  return `${prefix}${'x'.repeat(paddingBytes)}${suffix}`
}

/**
 * Expected 来源：`docs/backend-v2/contracts/http-api.md` §1、§3 的固定请求顺序、1 MiB 普通 JSON 正文上限、`{data: ...}` 成功封套与稳定错误合同。
 * 测试层次：L3 `unit_fake`；真实 Node HTTP 服务、`IncomingMessage`、`ServerResponse` 与生产 `executeRequestChain`，各业务依赖使用可观察假步骤。
 * 明确未覆盖：真实 CloudBase 网关、真实身份验证、MySQL 事务、业务路由注册和生产部署。
 */
/** 将阶段名称与原有实现组合，既不替代请求链，也不模拟请求链的错误/短路逻辑。 */
function executeStep<TInput, TOutput>(
  stageName: string,
  observedStages: string[],
  run: (input: TInput) => TOutput | Promise<TOutput>
): RequestChainStep<TInput, TOutput> {
  return {
    kind: 'execute',
    run: async input => {
      observedStages.push(stageName)
      return await run(input)
    }
  }
}

/** 读取真实 IncomingMessage 字节流；生产限制逻辑由请求链的 requestLimits 阶段负责。 */
async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/** 通过临时本机 Node HTTP 端口发送请求，返回已完整读取的响应摘要。 */
async function sendHttpRequest(handler: Handler, request: RequestInit): Promise<HttpResult> {
  const server = createServer((incomingRequest, response) => {
    handler(incomingRequest, response).catch(() => {
      if (!response.headersSent && !response.writableEnded) {
        response.writeHead(internalErrorStatusCode)
        response.end()
      } else if (!response.writableEnded && !response.destroyed) {
        response.destroy()
      }
    })
  })
  handlersToClose.add(server)

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(ephemeralPort, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('测试 HTTP 服务未获得 TCP 端口')
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v2/test`, request)
    return {
      status: response.status,
      headers: response.headers,
      text: await response.text()
    }
  } finally {
    server.closeAllConnections()
  }
}

/** 关闭测试创建的临时服务，避免 Vitest 保留监听端口。 */
async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) {
    return
  }
  await new Promise<void>(resolve => {
    server.close(() => resolve())
    server.closeAllConnections()
  })
}

afterEach(async () => {
  await Promise.all([...handlersToClose].map(closeServer))
  handlersToClose.clear()
})

/** 创建各阶段可观测的假业务端口；请求与响应适配器以及真实请求链保持生产实现。 */
function createRequestChainSteps(
  observedStages: string[],
  options: StepHarnessOptions = {}
): TestRequestChainSteps {
  return {
    requestLimits: executeStep<IncomingMessage, RestrictedRequest>(
      'requestLimits',
      observedStages,
      async request => {
        const body = await readRequestBody(request)
        if (options.maxBodyBytes !== undefined && body.byteLength > options.maxBodyBytes) {
          throw new PublicRequestError(
            payloadTooLargeStatusCode,
            'PAYLOAD_TOO_LARGE',
            '请求体超过允许大小'
          )
        }
        return {
          method: request.method ?? 'UNKNOWN',
          pathname: new URL(request.url ?? '/', 'http://localhost').pathname,
          authorization: request.headers.authorization,
          body
        }
      }
    ),
    identityValidate: executeStep<RestrictedRequest, IdentityCredentials>(
      'identityValidate',
      observedStages,
      restrictedRequest => {
        if (options.rejectIdentity || restrictedRequest.authorization !== authorizationMarker) {
          throw new PublicRequestError(
            principalErrorStatusCode,
            'PRINCIPAL_INVALID',
            '身份凭证无效'
          )
        }
        return { accepted: true }
      }
    ),
    principalResolve: executeStep<IdentityCredentials, TestPrincipal>(
      'principalResolve',
      observedStages,
      () => ({ kind: 'user', userId: 'usr_test' })
    ),
    objectOwnership: executeStep<{ request: RestrictedRequest; principal: TestPrincipal }, void>(
      'objectOwnership',
      observedStages,
      () => undefined
    ),
    dtoValidate: executeStep<RestrictedRequest, TestDto>(
      'dtoValidate',
      observedStages,
      restrictedRequest => {
        const candidate: unknown = JSON.parse(restrictedRequest.body.toString('utf8'))
        if (
          typeof candidate !== 'object' ||
          candidate === null ||
          !('action' in candidate) ||
          typeof candidate.action !== 'string'
        ) {
          throw new PublicRequestError(
            validationErrorStatusCode,
            'VALIDATION_FAILED',
            '请求参数不合法'
          )
        }
        return { action: candidate.action }
      }
    ),
    buildCommand: executeStep<{ dto: TestDto; principal: TestPrincipal }, TestCommand>(
      'buildCommand',
      observedStages,
      ({ dto, principal }) => ({
        action: dto.action,
        userId: principal.userId
      })
    ),
    domainRule: executeStep<{ command: TestCommand; principal: TestPrincipal }, TestDecision>(
      'domainRule',
      observedStages,
      ({ command }) => ({
        approved: true,
        action: command.action
      })
    ),
    transactionPersistence: executeStep<
      { domainDecision: TestDecision; principal: TestPrincipal },
      TestPersistenceResult
    >('transactionPersistence', observedStages, ({ domainDecision }) => {
      if (options.failPersistence) {
        throw new Error(rawFailureMarker)
      }
      return { publicRef: `upl_test_${domainDecision.action}` }
    }),
    publicResponse: executeStep<TestPersistenceResult, TestPublicData>(
      'publicResponse',
      observedStages,
      persistenceResult => {
        const publicData: TestPublicData = { userPlantRef: persistenceResult.publicRef }
        if (options.circularPublicData) {
          publicData.self = publicData
        }
        return publicData
      }
    ),
    writeAudit: async (event: RequestChainAuditEvent) => {
      observedStages.push(`writeAudit:${event.outcome}`)
    }
  }
}

describe('Node HTTP 请求链适配器', () => {
  test('真实 HTTP 请求按固定阶段顺序执行并返回公开 data 封套', async () => {
    const observedStages: string[] = []
    const handler = createNodeRequestChainHandler(createRequestChainSteps(observedStages))
    const result = await sendHttpRequest(handler, {
      method: 'POST',
      headers: {
        authorization: authorizationMarker,
        'content-type': 'application/json'
      },
      body: requestBody
    })

    expect(observedStages).toEqual(expectedStageOrder)
    expect(result.status).toBe(successStatusCode)
    expect(result.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(result.headers.get('content-length')).toBe(
      String(Buffer.byteLength(result.text, 'utf8'))
    )
    expect(JSON.parse(result.text)).toEqual({ data: { userPlantRef: 'upl_test_water' } })
    expect(result.text).not.toContain(authorizationMarker)
  })

  test('身份失败保留稳定错误形状并阻止主体、领域和持久化阶段', async () => {
    const observedStages: string[] = []
    const handler = createNodeRequestChainHandler(
      createRequestChainSteps(observedStages, { rejectIdentity: true })
    )
    const result = await sendHttpRequest(handler, {
      method: 'POST',
      headers: {
        authorization: authorizationMarker,
        'content-type': 'application/json'
      },
      body: requestBody
    })

    expect(result.status).toBe(principalErrorStatusCode)
    expect(JSON.parse(result.text)).toEqual({
      error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效' }
    })
    expect(observedStages).toEqual(['requestLimits', 'identityValidate', 'writeAudit:denied'])
    expect(result.text).not.toContain(authorizationMarker)
  })

  test('超出合同正文上限时由首个请求限制阶段拒绝且不进入身份或业务阶段', async () => {
    const observedStages: string[] = []
    const handler = createNodeRequestChainHandler(
      createRequestChainSteps(observedStages, { maxBodyBytes: normalJsonRequestBodyLimitBytes })
    )
    const oversizedBody = buildJsonRequestBodyOfSize(normalJsonRequestBodyLimitBytes + oneByte)
    expect(Buffer.byteLength(oversizedBody, 'utf8')).toBe(normalJsonRequestBodyLimitBytes + oneByte)
    const result = await sendHttpRequest(handler, {
      method: 'POST',
      headers: {
        authorization: authorizationMarker,
        'content-type': 'application/json'
      },
      body: oversizedBody
    })

    expect(result.status).toBe(payloadTooLargeStatusCode)
    expect(JSON.parse(result.text)).toEqual({
      error: { type: 'PAYLOAD_TOO_LARGE', message: '请求体超过允许大小' }
    })
    expect(observedStages).toEqual(['requestLimits', 'writeAudit:denied'])
    expect(result.text).not.toContain(authorizationMarker)
  })

  test('未分类持久化异常经真实请求链映射为泛化公开错误且不泄漏异常原文', async () => {
    const observedStages: string[] = []
    const handler = createNodeRequestChainHandler(
      createRequestChainSteps(observedStages, { failPersistence: true })
    )
    const result = await sendHttpRequest(handler, {
      method: 'POST',
      headers: {
        authorization: authorizationMarker,
        'content-type': 'application/json'
      },
      body: requestBody
    })

    expect(result.status).toBe(internalErrorStatusCode)
    expect(JSON.parse(result.text)).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
    expect(observedStages).toEqual([
      'requestLimits',
      'identityValidate',
      'principalResolve',
      'objectOwnership',
      'dtoValidate',
      'buildCommand',
      'domainRule',
      'transactionPersistence',
      'writeAudit:failed'
    ])
    expect(result.text).not.toContain(rawFailureMarker)
    expect(result.text).not.toContain(authorizationMarker)
  })

  test('真实 HTTP 成功响应不被链尾请求事件写入失败改成 500', async () => {
    const observedStages: string[] = []
    const steps = Object.assign(createRequestChainSteps(observedStages), {
      writeAudit: async (event: RequestChainAuditEvent) => {
        observedStages.push(`writeAudit:${event.outcome}`)
        throw new Error(rawFailureMarker)
      },
      reportAuditFailure: async (event: RequestChainAuditEvent) => {
        observedStages.push(`reportAuditFailure:${event.outcome}`)
      }
    })
    const result = await sendHttpRequest(createNodeRequestChainHandler(steps), {
      method: 'POST',
      headers: { authorization: authorizationMarker },
      body: requestBody
    })
    expect(result.status).toBe(successStatusCode)
    expect(JSON.parse(result.text)).toEqual({ data: { userPlantRef: 'upl_test_water' } })
    expect(observedStages).toContain('writeAudit:allowed')
    expect(observedStages).toContain('reportAuditFailure:allowed')
    expect(result.text).not.toContain(rawFailureMarker)
  })
  test('响应无法序列化时返回泛化内部错误而不泄露原始运行异常', async () => {
    const observedStages: string[] = []
    const handler = createNodeRequestChainHandler(
      createRequestChainSteps(observedStages, { circularPublicData: true })
    )
    const result = await sendHttpRequest(handler, {
      method: 'POST',
      headers: {
        authorization: authorizationMarker,
        'content-type': 'application/json'
      },
      body: requestBody
    })
    const publicError = JSON.parse(result.text) as {
      error: { type: string; message: string }
    }

    expect(result.status).toBe(internalErrorStatusCode)
    expect(publicError.error.type).toBe('INTERNAL_ERROR')
    expect(publicError.error.message).not.toContain('Converting circular structure')
    expect(result.text).not.toContain(authorizationMarker)
    expect(result.text).not.toContain(rawFailureMarker)
  })

  test('已结束的响应不再次写响应头或结束响应', async () => {
    const observedStages: string[] = []
    const requestChainHandler = createNodeRequestChainHandler(
      createRequestChainSteps(observedStages)
    )
    const outerHandler: Handler = async (request, response) => {
      response.writeHead(outerHandledStatusCode, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('响应已由外层处理器完成')
      await requestChainHandler(request, response)
    }

    const result = await sendHttpRequest(outerHandler, { method: 'GET' })

    expect(result.status).toBe(outerHandledStatusCode)
    expect(result.text).toBe('响应已由外层处理器完成')
    expect(observedStages).toEqual([])
  })
})
