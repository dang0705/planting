import type { IncomingMessage, ServerResponse } from 'node:http'

import type { UserRef } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import {
  ServiceSignatureRejectedError,
  claimServiceNonce,
  verifyServiceSignature,
  type ServiceSigningKey
} from '../../foundation/http/service-signature.js'
import { createMysqlUserTrialAnchorReader } from '../repository/mysql-user-trial-anchor-reader.js'

/** 内部调用方签名材料；与 foundation 服务签名模块共用同一类型。 */
export type { ServiceSigningKey }

/** 试用锚点路由的最小依赖；缺少密钥解析器时全部内部请求失败关闭。 */
export type UserTrialAnchorRouteDependencies = {
  /** Identity 自有 MySQL 连接来源，读取用户事实并原子占用签名 nonce。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 依据已登记密钥版本解析服务主体和密钥；未登记时返回 null。 */
  readonly resolveServiceSigningKey?: (keyId: string) => Promise<ServiceSigningKey | null>
  /** 服务端可信 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 服务签名参数（环境变量层 V2_SERVICE_SIGNATURE_*；签名方与验证方必须部署同一取值）。 */
  readonly serviceSignature: {
    /** 允许的请求时间与服务端时间绝对差（秒）。 */
    readonly clockSkewSeconds: number
    /** nonce 占用后最少保留秒数（≥ 2 × 时钟偏差）。 */
    readonly nonceTtlSeconds: number
  }
}

/** 不回显内部签名字段的稳定错误类别。 */
type TrialAnchorErrorType =
  | 'VALIDATION_FAILED'
  | 'PRINCIPAL_INVALID'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'

/** 服务端内部错误标记；对外只发送固定中文文案。 */
class TrialAnchorRouteError extends Error {
  /** HTTP 合同允许的错误状态。 */
  readonly status: number
  /** HTTP 合同允许的错误类别。 */
  readonly type: TrialAnchorErrorType

  /** 构造无敏感输入原值的内部错误。 */
  constructor(status: number, type: TrialAnchorErrorType) {
    super(type)
    this.status = status
    this.type = type
  }
}

/** 本路由登记的唯一 requiredScope；白名单只授予 subscription 服务主体。 */
const scope = 'identity.trial-anchor.read'
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const invalidInput = new TrialAnchorRouteError(400, 'VALIDATION_FAILED')
const invalidPrincipal = new TrialAnchorRouteError(401, 'PRINCIPAL_INVALID')
const unavailable = new TrialAnchorRouteError(503, 'SERVICE_UNAVAILABLE')

/** 内部 GET 不接受正文；读取流可防止分块传输绕过 Content-Length 检查。 */
async function rejectRequestBody(request: IncomingMessage): Promise<void> {
  for await (const chunk of request) {
    if (Buffer.byteLength(chunk as Buffer) > 0) {
      throw invalidInput
    }
  }
}

/** 把 foundation 验签与 nonce 错误映射为本路由合同允许的稳定错误。 */
function mapSignatureFailure(error: unknown): TrialAnchorRouteError {
  // 验签或重放 → 401；nonce 存储不可用（ServiceNonceStoreUnavailableError）及其他异常一律失败关闭为 503。
  return error instanceof ServiceSignatureRejectedError ? invalidPrincipal : unavailable
}

/** 只发送合同白名单字段和稳定错误，绝不回显签名头或数据库内部键。 */
function writeResponse(response: ServerResponse, status: number, body: object): void {
  const serialized = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(serialized, 'utf8'),
    'cache-control': 'no-store'
  })
  response.end(serialized)
}

/** 连接已登记路由、真实服务签名、MySQL nonce 和 Identity 自有事实读取。 */
export function createUserTrialAnchorRouteHandler(
  dependencies: UserTrialAnchorRouteDependencies
): RouteHandler {
  const readAnchor = createMysqlUserTrialAnchorReader(dependencies.connectionSource)
  return async (request, response, pathParameters) => {
    try {
      const userRef = pathParameters.userRef
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (
        typeof userRef !== 'string' ||
        !userRefFormat.test(userRef) ||
        request.url !== url.pathname ||
        url.search !== ''
      ) {
        request.resume()
        throw invalidInput
      }
      await rejectRequestBody(request)
      try {
        const verified = await verifyServiceSignature(
          {
            method: 'GET',
            canonicalTarget: url.pathname,
            rawHeaders: request.rawHeaders,
            rawBody: Buffer.alloc(0)
          },
          scope,
          {
            resolveServiceSigningKey: dependencies.resolveServiceSigningKey,
            now: dependencies.now,
            clockSkewSeconds: dependencies.serviceSignature.clockSkewSeconds
          }
        )
        await claimServiceNonce(
          dependencies.connectionSource,
          verified,
          dependencies.serviceSignature.nonceTtlSeconds
        )
      } catch (error: unknown) {
        throw mapSignatureFailure(error)
      }
      const anchor = await readAnchor(userRef as UserRef)
      if (anchor === null) {
        throw new TrialAnchorRouteError(404, 'NOT_FOUND')
      }
      writeResponse(response, 200, {
        data: { userRef: anchor.userRef, status: anchor.status, createdAtMs: anchor.createdAtMs }
      })
    } catch (error: unknown) {
      const failure = error instanceof TrialAnchorRouteError ? error : unavailable
      const messages: Record<TrialAnchorErrorType, string> = {
        VALIDATION_FAILED: '请求参数不合法',
        PRINCIPAL_INVALID: '内部服务身份无效',
        NOT_FOUND: '用户不存在',
        SERVICE_UNAVAILABLE: '身份服务暂时不可用'
      }
      writeResponse(response, failure.status, {
        error: { type: failure.type, message: messages[failure.type] }
      })
    }
  }
}
