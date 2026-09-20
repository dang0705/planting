import { createHash } from 'node:crypto'

import type { UserPrincipalDto } from '../../contracts/types.js'
import {
  resolveUnifiedUserPrincipal,
  UnifiedUserPrincipalResolveError,
  type PlatformAuthenticationEntry
} from '../domain/resolve-user-principal.js'
import type { UserPrincipalRepository } from '../repository/mysql-user-principal-repository.js'

/** Provider 完成外部凭证验证后交给 identity 应用层的最小安全结果。 */
export type VerifiedPlatformIdentity = {
  /** 已验证的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 当前小程序或应用的稳定范围。 */
  readonly appScope: string
  /** 平台主体原文经受控密钥生成的 HMAC-SHA-256。 */
  readonly platformSubjectHash: string
  /** HMAC 密钥版本引用，不含任何密钥材料。 */
  readonly subjectHashKeyVersion: string
}

/** 解析登录用户 Principal 的应用输入。 */
export type ResolveUserPrincipalCommand = {
  /** 外部 Provider 已验证且完成主体 HMAC 的结果。 */
  readonly verifiedIdentity: VerifiedPlatformIdentity
  /** 当前请求携带的原始高熵 Bearer；仅在当前调用栈内摘要，绝不传给 Repository。 */
  readonly bearerToken: string
  /** 服务端可信时钟的当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** Principal 应用用例依赖。 */
export type ResolveUserPrincipalDependencies = {
  /** 只接收摘要并读回三方身份快照。 */
  readonly repository: UserPrincipalRepository
}

const supportedPlatforms = new Set<PlatformAuthenticationEntry>([
  'wechat',
  'douyin',
  'xiaohongshu',
  'phone'
])

/** 校验原始 Bearer 只作为有界内存输入参与一次 SHA-256。 */
function hashBearerToken(bearerToken: string): string {
  if (
    bearerToken.length < Number('16') ||
    bearerToken.length > Number('4096') ||
    bearerToken.trim() !== bearerToken
  ) {
    throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '登录会话凭证无效')
  }
  return createHash('sha256').update(bearerToken, 'utf8').digest('hex')
}

/** 防御性复核 Provider 输出，避免损坏摘要进入 Repository 或日志链路。 */
function verifyIdentityEvidence(identity: VerifiedPlatformIdentity): void {
  if (
    !supportedPlatforms.has(identity.platform) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(identity.appScope) ||
    !/^[a-f0-9]{64}$/u.test(identity.platformSubjectHash) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(identity.subjectHashKeyVersion)
  ) {
    throw new UnifiedUserPrincipalResolveError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '平台身份验证证据不合法'
    )
  }
}

/** 创建“摘要会话 → 最小快照 → 纯领域裁决”的统一用户 Principal 用例。 */
export function createResolveUserPrincipalUseCase(
  dependencies: ResolveUserPrincipalDependencies
): (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto> {
  return async command => {
    verifyIdentityEvidence(command.verifiedIdentity)
    const sessionRefHash = hashBearerToken(command.bearerToken)
    const snapshot = await dependencies.repository.read({
      platform: command.verifiedIdentity.platform,
      appScope: command.verifiedIdentity.appScope,
      platformSubjectHash: command.verifiedIdentity.platformSubjectHash,
      subjectHashKeyVersion: command.verifiedIdentity.subjectHashKeyVersion,
      sessionRefHash
    })
    if (snapshot === null) {
      throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '登录会话无效')
    }
    return resolveUnifiedUserPrincipal({ ...snapshot, nowMs: command.nowMs })
  }
}
