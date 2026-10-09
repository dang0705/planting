import type { IncomingHttpHeaders } from 'node:http'

import { createPublicContractValidators } from '../../contracts/index.js'
import type { GuestPrincipalDto, UserPrincipalDto } from '../../contracts/types.js'
import { PublicRequestError } from '../../foundation/http/request-chain.js'
import type { ResolveUserPrincipalCommand } from '../application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../domain/resolve-user-principal.js'
import { extractBearerToken } from './request-identity.js'

const validators = createPublicContractValidators()
/** 统一 401：不区分缺失、伪造、过期、撤销或游客令牌。 */
const principalInvalid = () => new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')

/**
 * authenticated 路由的身份阶段：Bearer → 统一用户主体。
 * 合并解析器可能返回游客主体；authenticated 安全级别下一律视为无效凭证（401），不降级。
 */
export function createUserBearerAuthenticator(
  resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto | GuestPrincipalDto>
): (headers: IncomingHttpHeaders, nowMs: number) => Promise<UserPrincipalDto> {
  return async (headers, nowMs) => {
    const bearerToken = extractBearerToken(headers)
    if (bearerToken === null) { throw principalInvalid() }
    let principal: UserPrincipalDto | GuestPrincipalDto
    try {
      principal = await resolvePrincipal({ bearerToken, nowMs })
    } catch (error: unknown) {
      if (error instanceof UnifiedUserPrincipalResolveError && error.type === 'PRINCIPAL_INVALID') { throw principalInvalid() }
      throw error
    }
    if (principal.principalType !== 'user' || !validators.userPrincipal(principal)) { throw principalInvalid() }
    const issuedAtMs = Date.parse(principal.issuedAt)
    const expiresAtMs = Date.parse(principal.expiresAt)
    if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || issuedAtMs > nowMs || expiresAtMs <= nowMs) { throw principalInvalid() }
    return principal
  }
}
