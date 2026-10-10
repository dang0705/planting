import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import type { UserRef } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import { createMysqlUserTrialAnchorReader } from '../repository/mysql-user-trial-anchor-reader.js'

/** 内部调用方签名材料，仅由受控密钥引用解析器在服务端提供。 */
export type ServiceSigningKey = {
  /** 与密钥绑定的唯一服务主体；本路由只接受 subscription。 */
  readonly serviceName: string
  /** HMAC 密钥原文，只驻留服务端内存，不写入日志、数据库或响应。 */
  readonly key: Buffer
}

/** 试用锚点路由的最小依赖；缺少密钥解析器时全部内部请求失败关闭。 */
export type UserTrialAnchorRouteDependencies = {
  /** Identity 自有 MySQL 连接来源，读取用户事实并原子占用签名 nonce。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 依据已登记密钥版本解析服务主体和密钥；未登记时返回 null。 */
  readonly resolveServiceSigningKey?: (keyId: string) => Promise<ServiceSigningKey | null>
  /** 服务端可信 UTC 毫秒时钟。 */
  readonly now: () => number
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

const scope = 'identity.trial-anchor.read'
const serviceName = 'subscription'
const signatureVersion = 'http-api/v1'
const bodySha256 = createHash('sha256').update('').digest('hex')
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const keyIdFormat = /^[A-Za-z0-9._-]{1,64}$/u
const nonceFormat = /^[A-Za-z0-9_-]{8,128}$/u
const timestampFormat = /^(?:0|[1-9][0-9]*)$/u
const signatureFormat = /^[A-Za-z0-9_-]{43}$/u
/** 每秒毫秒数（单位换算）。 */
const millisecondsPerSecond = 1000
/** 签名时钟偏差上限毫秒（`identity.service_signature.clock_skew_seconds`，取值见代码层注册表）。 */
const clockSkewMs = RUNTIME_PARAMETERS.identity.serviceSignatureClockSkewSeconds.value * millisecondsPerSecond
/** nonce 防重放保留毫秒（`identity.service_signature.nonce_ttl_seconds`，取值见代码层注册表）。 */
const nonceRetentionMs = RUNTIME_PARAMETERS.identity.serviceSignatureNonceTtlSeconds.value * millisecondsPerSecond
const invalidInput = new TrialAnchorRouteError(400, 'VALIDATION_FAILED')
const invalidPrincipal = new TrialAnchorRouteError(401, 'PRINCIPAL_INVALID')
const unavailable = new TrialAnchorRouteError(503, 'SERVICE_UNAVAILABLE')

/** 读取恰好一次出现的签名请求头，拒绝大小写变体形成的重复头。 */
function singleHeader(request: IncomingMessage, name: string): string | null {
  let value: string | null = null
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() !== name) {
      continue
    }
    if (value !== null) {
      return null
    }
    value = request.rawHeaders[index + 1] ?? null
  }
  return value
}

/** 内部 GET 不接受正文；读取流可防止分块传输绕过 Content-Length 检查。 */
async function rejectRequestBody(request: IncomingMessage): Promise<void> {
  for await (const chunk of request) {
    if (Buffer.byteLength(chunk as Buffer) > 0) {
      throw invalidInput
    }
  }
}

/** 按冻结合同的九段规范明文验证唯一 subscription scope 的 HMAC 签名。 */
async function verifySignature(
  request: IncomingMessage,
  pathname: string,
  dependencies: UserTrialAnchorRouteDependencies
): Promise<{
  readonly keyId: string
  readonly nonceHash: string
  readonly requestTimestampMs: number
  readonly verifiedAtMs: number
}> {
  const keyId = singleHeader(request, 'x-qhz-key-id')
  const timestamp = singleHeader(request, 'x-qhz-timestamp')
  const nonce = singleHeader(request, 'x-qhz-nonce')
  const suppliedBodyHash = singleHeader(request, 'x-qhz-body-sha256')
  const suppliedScope = singleHeader(request, 'x-qhz-scope')
  const signature = singleHeader(request, 'x-qhz-signature')
  if (
    keyId === null ||
    !keyIdFormat.test(keyId) ||
    timestamp === null ||
    !timestampFormat.test(timestamp) ||
    nonce === null ||
    !nonceFormat.test(nonce) ||
    suppliedBodyHash !== bodySha256 ||
    suppliedScope !== scope ||
    signature === null ||
    !signatureFormat.test(signature)
  ) {
    throw invalidPrincipal
  }
  const requestTimestampMs = Number(timestamp) * 1_000
  const verifiedAtMs = dependencies.now()
  if (
    !Number.isSafeInteger(requestTimestampMs) ||
    !Number.isSafeInteger(verifiedAtMs) ||
    Math.abs(verifiedAtMs - requestTimestampMs) > clockSkewMs
  ) {
    throw invalidPrincipal
  }
  const signingKey = await dependencies.resolveServiceSigningKey?.(keyId)
  if (signingKey?.serviceName !== serviceName || signingKey.key.length === 0) {
    throw invalidPrincipal
  }
  const canonical = [
    signatureVersion,
    serviceName,
    keyId,
    timestamp,
    nonce,
    'GET',
    pathname,
    bodySha256,
    scope
  ].join('\n')
  const expected = createHmac('sha256', signingKey.key).update(canonical).digest()
  const received = Buffer.from(signature, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw invalidPrincipal
  }
  return {
    keyId,
    nonceHash: createHash('sha256').update(nonce).digest('hex'),
    requestTimestampMs,
    verifiedAtMs
  }
}

/** 使用数据库唯一约束原子占用 nonce；重复签名即使换密钥也不能重放。 */
async function claimNonce(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  verified: Awaited<ReturnType<typeof verifySignature>>
): Promise<void> {
  const connection = await source.getConnection()
  try {
    await connection.execute(
      `INSERT INTO service_replay_nonces
       (service_name, key_id, nonce_hash, signature_version, request_timestamp_ms,
        body_sha256, scope_code, verified_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        serviceName,
        verified.keyId,
        verified.nonceHash,
        signatureVersion,
        verified.requestTimestampMs,
        bodySha256,
        scope,
        verified.verifiedAtMs,
        verified.verifiedAtMs + nonceRetentionMs,
        verified.verifiedAtMs,
        verified.verifiedAtMs
      ]
    )
    connection.release()
  } catch (error: unknown) {
    connection.destroy()
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
    ) {
      throw invalidPrincipal
    }
    throw unavailable
  }
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
      const verified = await verifySignature(request, url.pathname, dependencies)
      await claimNonce(dependencies.connectionSource, verified)
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
