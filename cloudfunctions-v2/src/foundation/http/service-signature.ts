import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import type { MysqlConnectionPoolPort } from '../database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../database/mysql2-connection-source.js'

/**
 * 内部服务主体与可用 scope 的唯一白名单（principal-and-capability/v1 §1）。
 *
 * 通俗理解：像前端路由守卫里的「角色 → 可访问页面」表，只不过角色是后端内部服务。
 * - `cloudbase_agent`（小青）只拿六个用户范围工具权限，永远不含 `identity.trial-anchor.read`；
 * - `identity.trial-anchor.read` 只授予 `subscription` 服务主体。
 * 新增服务或 scope 必须先改冻结合同，再改本表与测试；不得由环境变量或数据库扩展。
 */
export const SERVICE_SCOPE_ALLOWLIST = {
  cloudbase_agent: [
    'identity.resolve',
    'user-plant.context.read',
    'user-plant.agent-context.read',
    'subscription.ai-quota.reserve',
    'subscription.ai-quota.settle',
    'subscription.ai-quota.release'
  ],
  scheduler: ['plant-knowledge.enrichment.lease', 'plant-knowledge.enrichment.submit'],
  payment_callback: ['subscription.payment-callback.receive'],
  outbox_dispatcher: ['subscription.reward-event.consume'],
  subscription: ['identity.trial-anchor.read']
} as const satisfies Record<string, readonly string[]>

/** 已登记的内部服务主体名称。 */
export type ServiceName = keyof typeof SERVICE_SCOPE_ALLOWLIST

/** 已登记的全部内部 scope；路由的 requiredScope 只能取其中之一。 */
export type ServiceScope = (typeof SERVICE_SCOPE_ALLOWLIST)[ServiceName][number]

/** 内部调用方签名材料，仅由受控密钥引用解析器在服务端提供。 */
export type ServiceSigningKey = {
  /** 与密钥绑定的唯一服务主体；签名明文中的服务名必须等于它。 */
  readonly serviceName: string
  /** HMAC 密钥原文，只驻留服务端内存，不写入日志、数据库或响应。 */
  readonly key: Buffer
}

/** 待验签请求的协议无关视图；由路由层从 Node 请求中提取。 */
export type ServiceSignatureRequest = {
  /** HTTP 大写方法，例如 GET、POST。 */
  readonly method: string
  /** 规范化请求目标：当前合同只覆盖无查询串的路径；带查询串的规范化格式尚待冻结。 */
  readonly canonicalTarget: string
  /** Node 原始请求头数组（名、值交替），用于识别大小写变体形成的重复头。 */
  readonly rawHeaders: readonly string[]
  /** 原始请求正文字节；GET 为空。签名覆盖其 SHA-256。 */
  readonly rawBody: Buffer
}

/** 验签所需的服务端依赖。 */
export type ServiceSignatureDependencies = {
  /** 依据已登记密钥版本解析服务主体和密钥；未登记时返回 null。 */
  readonly resolveServiceSigningKey?:
    | ((keyId: string) => Promise<ServiceSigningKey | null>)
    | undefined
  /** 服务端可信 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 允许的请求时间与服务端时间绝对差（秒），来自 V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS。 */
  readonly clockSkewSeconds: number
}

/** 验签成功后的服务主体摘要；不含 nonce 原文、签名或密钥。 */
export type VerifiedServiceCall = {
  /** 已验证的服务主体。 */
  readonly serviceName: ServiceName
  /** 本次使用的密钥版本标识。 */
  readonly keyId: string
  /** 本次签名声明且与路由登记相等的唯一 scope。 */
  readonly scope: ServiceScope
  /** 原始正文 SHA-256（十六进制小写）。 */
  readonly bodySha256: string
  /** nonce 的 SHA-256 摘要；数据库只保存摘要。 */
  readonly nonceHash: string
  /** 请求声明的签名时刻（UTC 毫秒）。 */
  readonly requestTimestampMs: number
  /** 服务端完成验签的时刻（UTC 毫秒）。 */
  readonly verifiedAtMs: number
}

/**
 * 服务签名被拒绝：对外统一映射为 401 PRINCIPAL_INVALID，不说明具体失败环节。
 * 消息固定，不携带任何请求头、签名、nonce 或密钥原文。
 */
export class ServiceSignatureRejectedError extends Error {
  /** 合同规定的统一错误类别。 */
  readonly type = 'PRINCIPAL_INVALID' as const

  /** 构造不含敏感输入的拒绝错误。 */
  constructor() {
    super('内部服务身份无效')
    this.name = 'ServiceSignatureRejectedError'
  }
}

/** nonce 存储不可用：防重放无法确认时失败关闭，对外映射为 503 SERVICE_UNAVAILABLE。 */
export class ServiceNonceStoreUnavailableError extends Error {
  /** 失败关闭时的错误类别。 */
  readonly type = 'SERVICE_UNAVAILABLE' as const

  /** 构造不含底层驱动错误细节的不可用错误。 */
  constructor() {
    super('内部服务暂时不可用')
    this.name = 'ServiceNonceStoreUnavailableError'
  }
}

/** 签名规范明文的合同版本段。 */
const signatureVersion = 'http-api/v1'
/** key_id 允许字符与长度。 */
const keyIdFormat = /^[A-Za-z0-9._-]{1,64}$/u
/** nonce 允许字符与长度（8–128）。 */
const nonceFormat = /^[A-Za-z0-9_-]{8,128}$/u
/** 十进制 UTC 秒时间戳，禁止前导零。 */
const timestampFormat = /^(?:0|[1-9][0-9]*)$/u
/** HMAC-SHA-256 的 base64url 无填充长度固定为 43。 */
const signatureFormat = /^[A-Za-z0-9_-]{43}$/u
/** 十六进制小写 SHA-256。 */
const sha256HexFormat = /^[0-9a-f]{64}$/u
/** 每秒毫秒数（单位换算）。 */
const millisecondsPerSecond = 1000

/** 读取恰好一次出现的请求头，拒绝大小写变体形成的重复头。 */
function singleHeader(rawHeaders: readonly string[], name: string): string | null {
  let value: string | null = null
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() !== name) {
      continue
    }
    if (value !== null) {
      return null
    }
    value = rawHeaders[index + 1] ?? null
  }
  return value
}

/** 判断某服务白名单是否包含该 scope。 */
function serviceAllowsScope(serviceName: string, scope: string): serviceName is ServiceName {
  if (!Object.hasOwn(SERVICE_SCOPE_ALLOWLIST, serviceName)) {
    return false
  }
  const allowed: readonly string[] = SERVICE_SCOPE_ALLOWLIST[serviceName as ServiceName]
  return allowed.includes(scope)
}

/**
 * 按 http-api/v1 §5 九段规范明文校验内部服务 HMAC 签名。
 *
 * 校验顺序：签名头齐全且唯一 → scope 逐字等于路由 requiredScope → 正文摘要匹配 →
 * 时钟窗口 → 密钥解析且服务白名单包含该 scope → 常量时间比较签名。
 * 任一环节失败统一抛出 ServiceSignatureRejectedError。nonce 占用由 claimServiceNonce 单独完成。
 */
export async function verifyServiceSignature(
  request: ServiceSignatureRequest,
  requiredScope: ServiceScope,
  dependencies: ServiceSignatureDependencies
): Promise<VerifiedServiceCall> {
  const keyId = singleHeader(request.rawHeaders, 'x-qhz-key-id')
  const timestamp = singleHeader(request.rawHeaders, 'x-qhz-timestamp')
  const nonce = singleHeader(request.rawHeaders, 'x-qhz-nonce')
  const suppliedBodyHash = singleHeader(request.rawHeaders, 'x-qhz-body-sha256')
  const suppliedScope = singleHeader(request.rawHeaders, 'x-qhz-scope')
  const signature = singleHeader(request.rawHeaders, 'x-qhz-signature')
  const bodySha256 = createHash('sha256').update(request.rawBody).digest('hex')
  if (
    keyId === null ||
    !keyIdFormat.test(keyId) ||
    timestamp === null ||
    !timestampFormat.test(timestamp) ||
    nonce === null ||
    !nonceFormat.test(nonce) ||
    suppliedBodyHash === null ||
    !sha256HexFormat.test(suppliedBodyHash) ||
    suppliedBodyHash !== bodySha256 ||
    suppliedScope !== requiredScope ||
    signature === null ||
    !signatureFormat.test(signature)
  ) {
    throw new ServiceSignatureRejectedError()
  }
  const requestTimestampMs = Number(timestamp) * millisecondsPerSecond
  const verifiedAtMs = dependencies.now()
  if (
    !Number.isSafeInteger(requestTimestampMs) ||
    !Number.isSafeInteger(verifiedAtMs) ||
    Math.abs(verifiedAtMs - requestTimestampMs) >
      dependencies.clockSkewSeconds * millisecondsPerSecond
  ) {
    throw new ServiceSignatureRejectedError()
  }
  const signingKey = await dependencies.resolveServiceSigningKey?.(keyId)
  if (
    !signingKey ||
    signingKey.key.length === 0 ||
    !serviceAllowsScope(signingKey.serviceName, requiredScope)
  ) {
    throw new ServiceSignatureRejectedError()
  }
  const canonical = [
    signatureVersion,
    signingKey.serviceName,
    keyId,
    timestamp,
    nonce,
    request.method.toUpperCase(),
    request.canonicalTarget,
    bodySha256,
    requiredScope
  ].join('\n')
  const expected = createHmac('sha256', signingKey.key).update(canonical).digest()
  const received = Buffer.from(signature, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new ServiceSignatureRejectedError()
  }
  return {
    serviceName: signingKey.serviceName,
    keyId,
    scope: requiredScope,
    bodySha256,
    nonceHash: createHash('sha256').update(nonce).digest('hex'),
    requestTimestampMs,
    verifiedAtMs
  }
}

/**
 * 使用 `service_replay_nonces` 唯一约束原子占用 nonce（唯一性为 service_name + nonce_hash，不含 key_id，
 * 因此轮换密钥也不能重放）。重复占用 → ServiceSignatureRejectedError；存储异常 → ServiceNonceStoreUnavailableError。
 */
export async function claimServiceNonce(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  verified: VerifiedServiceCall,
  nonceTtlSeconds: number
): Promise<void> {
  let connection: Mysql2QueryConnection
  try {
    connection = await source.getConnection()
  } catch {
    throw new ServiceNonceStoreUnavailableError()
  }
  try {
    await connection.execute(
      `INSERT INTO service_replay_nonces
       (service_name, key_id, nonce_hash, signature_version, request_timestamp_ms,
        body_sha256, scope_code, verified_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        verified.serviceName,
        verified.keyId,
        verified.nonceHash,
        signatureVersion,
        verified.requestTimestampMs,
        verified.bodySha256,
        verified.scope,
        verified.verifiedAtMs,
        verified.verifiedAtMs + nonceTtlSeconds * millisecondsPerSecond,
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
      throw new ServiceSignatureRejectedError()
    }
    throw new ServiceNonceStoreUnavailableError()
  }
}
