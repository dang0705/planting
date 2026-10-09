import { createHmac, createSecretKey, hkdfSync, randomBytes as cryptoRandomBytes, type KeyObject } from 'node:crypto'

import {
  createPublicContractValidators,
  type CreateGuestSessionRequestDto,
  type CreateGuestSessionResponseDto
} from '../../contracts/index.js'
import type { GuestIssuancePolicy } from '../../configuration/identity-session-policy.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { PublicErrorType, RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import { issueGuestSession, type IssueGuestSessionDependencies } from '../application/issue-guest-session.js'
import { IdentityLoginInputError, readJsonBody, verifyJsonContentType, writeJson } from './json-request.js'

/** 派生游客来源摘要子密钥的 HKDF info（guest-token-contract.md §6），与平台主体摘要域隔离。 */
const issuanceSourceKeyInfo = 'qinghuazhi/guest-issuance-source/v1'
/** 主密钥与派生子密钥的最少字节数（256 位）。 */
const minimumKeyBytes = 32
/** 抖音匿名信号摘要输入前缀。 */
const douyinAnonymousPrefix = 'douyin_anonymous:'

/** 游客签发策略来自已发布身份策略 v2（configuration 层所有）。 */
export type { GuestIssuancePolicy } from '../../configuration/identity-session-policy.js'

/** 游客签发入口依赖；存储、抖音换取与策略可替换，摘要与签发规则不可替换。 */
export interface GuestSessionRouteDependencies {
  /** guest_sessions 存储：按限流键计数与写入。 */
  readonly repository: IssueGuestSessionDependencies['repository']
  /** 每请求锁定一次游客策略；没有可信发布时返回 null。 */
  readonly resolveGuestPolicy: () => Promise<GuestIssuancePolicy | null>
  /** 抖音 anonymousCode → anonymous_openid；抖音未配置时为 null（无信号，应用层不计数）。 */
  readonly exchangeDouyinAnonymousCode: ((anonymousCode: string) => Promise<string>) | null
  /** 由 deriveGuestIssuanceSourceKey 派生的摘要子密钥；缺失时入口失败关闭。 */
  readonly issuanceSourceKey: KeyObject | null
  /** 密码学安全随机源；默认 node:crypto。 */
  readonly randomBytes?: (size: number) => Buffer
  /** 服务端可信 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 只接收脱敏结果类别的审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 用 HKDF-SHA256 从平台主体 HMAC 主密钥派生游客来源摘要子密钥；主密钥不足 256 位时拒绝。 */
export function deriveGuestIssuanceSourceKey(masterKeyBytes: Buffer): KeyObject {
  if (masterKeyBytes.length < minimumKeyBytes) { throw new Error('游客来源摘要主密钥长度不足') }
  return createSecretKey(Buffer.from(hkdfSync('sha256', masterKeyBytes, Buffer.alloc(0), issuanceSourceKeyInfo, minimumKeyBytes)))
}

/** 前缀 + 值的 HMAC-SHA256 十六进制摘要；原值只在本调用栈内使用。 */
function digest(key: KeyObject, prefix: string, value: string): string {
  return createHmac('sha256', key).update(prefix + value, 'utf8').digest('hex')
}

/** 签发结果到公开错误的映射；只允许 route-registry 登记的三类错误。 */
const failureByStatus: Record<'invalid' | 'rate_limited' | 'unavailable', { status: number; type: PublicErrorType; message: string }> = {
  invalid: { status: 400, type: 'VALIDATION_FAILED', message: '游客请求不合法' },
  rate_limited: { status: 429, type: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' },
  unavailable: { status: 503, type: 'SERVICE_UNAVAILABLE', message: '游客服务暂时不可用，请稍后重试' },
}

/** 审计端故障不能影响公开结果或泄漏敏感异常。 */
async function safelyWriteAudit(writeAudit: GuestSessionRouteDependencies['writeAudit'], event: RequestChainAuditEvent): Promise<void> {
  try { await writeAudit(event) } catch { /* 只接受脱敏事件；故障不外泄。 */ }
}

/**
 * 抖音匿名信号摘要：仅当策略开启、请求带 anonymousCode、换取端口已配置时尝试；
 * 换取失败不阻断签发（配置目录 identity.guest.douyin_anonymous_signal_enabled），返回 null 按无信号处理（应用层不计数，网关单客户端限频兜底）。
 */
async function resolveAnonymousSignalHash(
  dependencies: GuestSessionRouteDependencies, policy: GuestIssuancePolicy, dto: CreateGuestSessionRequestDto, key: KeyObject
): Promise<string | null> {
  if (dto.platform !== 'douyin' || dto.anonymousCode === undefined || !policy.douyinAnonymousSignalEnabled
    || dependencies.exchangeDouyinAnonymousCode === null) { return null }
  try {
    return digest(key, douyinAnonymousPrefix, await dependencies.exchangeDouyinAnonymousCode(dto.anonymousCode))
  } catch {
    return null
  }
}

/**
 * `POST /api/v2/identity/guest-sessions`（guest-token/v1）：
 * 媒体类型/正文/DTO → 锁定策略 → 抖音匿名信号摘要（有则按信号限流）→ 签发 → 公开响应。
 * 不读取任何 IP 请求头（用户 2026-10-09 裁决：CDN 下不可信，防刷由网关单客户端限频承担）。
 * 令牌只在成功响应出现一次；anonymousCode、匿名 openid 不进入日志、审计或响应。
 */
export function createGuestSessionRouteHandler(dependencies: GuestSessionRouteDependencies): RouteHandler {
  const validators = createPublicContractValidators()
  const randomBytes = dependencies.randomBytes ?? cryptoRandomBytes
  return async (request, response) => {
    let outcome: 'invalid' | 'rate_limited' | 'unavailable'
    try {
      verifyJsonContentType(request)
      const rawInput = await readJsonBody(request)
      if (!validators.createGuestSessionRequest(rawInput)) { throw new IdentityLoginInputError() }
      const dto: CreateGuestSessionRequestDto = rawInput
      const policy = await dependencies.resolveGuestPolicy()
      const key = dependencies.issuanceSourceKey
      if (policy === null || key === null) {
        outcome = 'unavailable'
      } else {
        const anonymousSignalHash = await resolveAnonymousSignalHash(dependencies, policy, dto, key)
        const result = await issueGuestSession(
          { repository: dependencies.repository, randomBytes, now: dependencies.now, policy },
          { platform: dto.platform, issuanceSourceHash: anonymousSignalHash, anonymousSignalHash },
        )
        if (result.status === 'issued') {
          const publicData: CreateGuestSessionResponseDto = {
            guestToken: result.guestToken,
            guestSessionRef: result.guestSessionRef as CreateGuestSessionResponseDto['guestSessionRef'],
            expiresAt: result.expiresAt,
          }
          if (!validators.createGuestSessionResponse(publicData)) { throw new Error('游客签发数据不符合公开合同') }
          await safelyWriteAudit(dependencies.writeAudit, { outcome: 'allowed' })
          writeJson(response, 200, { data: publicData })
          return
        }
        outcome = result.status
      }
    } catch (error: unknown) {
      outcome = error instanceof IdentityLoginInputError ? 'invalid' : 'unavailable'
    }
    const failure = failureByStatus[outcome]
    await safelyWriteAudit(dependencies.writeAudit, { outcome: outcome === 'unavailable' ? 'failed' : 'denied', errorType: failure.type })
    writeJson(response, failure.status, { error: { type: failure.type, message: failure.message } })
  }
}
