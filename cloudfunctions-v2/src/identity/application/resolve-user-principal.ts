import { createHash } from 'node:crypto'

import type { UserPrincipalDto } from '../../contracts/types.js'
import {
  resolveUnifiedUserPrincipal,
  UnifiedUserPrincipalResolveError
} from '../domain/resolve-user-principal.js'
import type { UserPrincipalRepository } from '../repository/mysql-user-principal-repository.js'

/** 解析登录用户 Principal 的应用输入。 */
export type ResolveUserPrincipalCommand = {
  /** 当前请求携带的原始高熵 Bearer；仅在当前调用栈内摘要，绝不传给 Repository。 */
  readonly bearerToken: string
  /** 服务端可信时钟的当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** Principal 应用用例依赖。 */
export type ResolveUserPrincipalDependencies = {
  /** 只接收会话摘要并读回用户、会话及其签发时的平台绑定快照。 */
  readonly repository: UserPrincipalRepository
}

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

/** 创建“摘要会话 → 最小快照 → 纯领域裁决”的统一用户 Principal 用例。 */
export function createResolveUserPrincipalUseCase(
  dependencies: ResolveUserPrincipalDependencies
): (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto> {
  return async command => {
    const sessionRefHash = hashBearerToken(command.bearerToken)
    const snapshot = await dependencies.repository.read({ sessionRefHash })
    if (snapshot === null) {
      throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '登录会话无效')
    }
    return resolveUnifiedUserPrincipal({ ...snapshot, nowMs: command.nowMs })
  }
}
