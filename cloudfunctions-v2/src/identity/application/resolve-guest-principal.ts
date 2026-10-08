import { createHash } from 'node:crypto'

import type { GuestPrincipalDto, UserPrincipalDto } from '../../contracts/types.js'
import type { ResolveUserPrincipalCommand } from './resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../domain/resolve-user-principal.js'
import type { ActiveGuestSession } from '../repository/mysql-guest-session-repository.js'

/** 游客 Bearer 固定前缀（guest-token/v1 §2）：`Authorization: Bearer guest.<token>`。 */
const guestBearerPrefix = 'guest.'
/** 游客令牌格式：32 字节随机数的 base64url（无填充），固定 43 字符。 */
const guestTokenPattern = /^[A-Za-z0-9_-]{43}$/u

/** 游客解析用例依赖；只替换存储，摘要与过期裁决不可替换。 */
export interface ResolveGuestPrincipalDependencies {
  /** 游客会话存储；只接收令牌摘要，返回 active 且未过期的会话或 null。 */
  readonly repository: {
    /** 按持有证明摘要查找有效游客会话。 */
    readonly findActiveByProofHash: (possessionProofHash: string, nowMs: number) => Promise<ActiveGuestSession | null>
  }
}

/** 游客解析输入；令牌原文只在当前调用栈内摘要，不落库、不写日志。 */
export interface ResolveGuestPrincipalCommand {
  /** 去掉 `guest.` 前缀后的游客令牌原文。 */
  readonly guestToken: string
  /** 服务端可信时钟的当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** 统一拒绝：消息固定，不回显令牌或会话引用。 */
const guestInvalid = () => new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '游客会话无效或已过期')

/**
 * 从 Bearer 原文提取游客令牌；不是 `guest.` 前缀（区分大小写）或前缀后为空时返回 null，
 * 交由登录用户会话解析，避免两种主体互相冒充。
 */
export function parseGuestBearer(bearerToken: string): string | null {
  if (!bearerToken.startsWith(guestBearerPrefix)) { return null }
  const guestToken = bearerToken.slice(guestBearerPrefix.length)
  return guestToken.length > 0 ? guestToken : null
}

/**
 * 解析游客主体（guest-token/v1 §2）：格式校验 → 进程内 SHA-256 → 按摘要定位 → 再次确认未过期。
 * 格式非法或会话无效统一 PRINCIPAL_INVALID；存储故障原样抛出，由入口映射为服务不可用。
 */
export async function resolveGuestPrincipal(
  dependencies: ResolveGuestPrincipalDependencies,
  command: ResolveGuestPrincipalCommand,
): Promise<GuestPrincipalDto> {
  if (!guestTokenPattern.test(command.guestToken)) { throw guestInvalid() }
  const possessionProofHash = createHash('sha256').update(command.guestToken, 'utf8').digest('hex')
  const session = await dependencies.repository.findActiveByProofHash(possessionProofHash, command.nowMs)
  // 存储已按 expires_at_ms > now 过滤；此处再判一次，防止存储实现或时钟漂移放行过期会话。
  if (session === null || session.expiresAtMs <= command.nowMs) { throw guestInvalid() }
  return {
    principalType: 'guest',
    guestSessionRef: session.guestSessionRef as GuestPrincipalDto['guestSessionRef'],
    authProvider: 'server_issued_guest_token',
    issuedAt: new Date(session.issuedAtMs).toISOString(),
    expiresAt: new Date(session.expiresAtMs).toISOString(),
  }
}

/** 合并解析依赖：登录用户解析与游客存储均由 identity 域提供。 */
export interface ResolveGuestOrUserPrincipalDependencies {
  /** 登录会话解析（无 `guest.` 前缀的 Bearer）。 */
  readonly resolveUser: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** 游客会话存储：只按令牌摘要查找有效会话。 */
  readonly guestRepository: ResolveGuestPrincipalDependencies['repository']
}

/**
 * `guest_or_authenticated` 路由的统一主体解析：`guest.` 前缀只走游客，其他只走登录会话。
 * 游客令牌无效时直接拒绝，不回落到登录解析，避免两种主体互相冒充。
 */
export function createResolveGuestOrUserPrincipal(
  dependencies: ResolveGuestOrUserPrincipalDependencies,
): (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto | GuestPrincipalDto> {
  return command => {
    const guestToken = parseGuestBearer(command.bearerToken)
    return guestToken === null
      ? dependencies.resolveUser(command)
      : resolveGuestPrincipal({ repository: dependencies.guestRepository }, { guestToken, nowMs: command.nowMs })
  }
}
