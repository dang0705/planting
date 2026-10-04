import type { UserRef } from '../../contracts/types.js'
import type {
  PlatformAuthenticationEntry,
  PlatformIdentityBindingResolveSnapshot,
  UnifiedUserResolveSnapshot,
  UserSessionResolveSnapshot
} from '../domain/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../domain/resolve-user-principal.js'

/** 按青花植会话摘要读取 Principal 快照的受控查询。 */
export type ReadUserPrincipalSnapshotInput = {
  /** 原始 Bearer 的 SHA-256；Repository 永不接收原始 Bearer。 */
  readonly sessionRefHash: string
}

/** Repository 返回给纯领域裁决的三组最小快照。 */
export type UserPrincipalResolutionSnapshot = {
  /** 统一用户状态与当前会话撤销版本。 */
  readonly user: UnifiedUserResolveSnapshot
  /** 已验证平台主体对应的绑定状态。 */
  readonly binding: PlatformIdentityBindingResolveSnapshot
  /** 当前 Bearer 摘要对应的会话状态。 */
  readonly session: UserSessionResolveSnapshot
}

/** identity Principal 只读 Repository 端口。 */
export type UserPrincipalRepository = {
  /** 找不到完整三方归属时返回空；数据损坏或重复时失败关闭。 */
  readonly read: (
    input: ReadUserPrincipalSnapshotInput
  ) => Promise<UserPrincipalResolutionSnapshot | null>
}

/** JOIN 查询允许读回的最小数据库行，不包含任何平台主体原文或内部主键。 */
export type UserPrincipalSqlRow = {
  /** 统一用户公开引用。 */
  readonly user_ref: string
  /** 统一用户当前状态。 */
  readonly user_status: UnifiedUserResolveSnapshot['status']
  /** 统一用户当前会话撤销版本的十进制文本。 */
  readonly user_session_version: string
  /** 平台绑定所属统一用户公开引用。 */
  readonly binding_user_ref: string
  /** 平台身份绑定对应的认证入口类型。 */
  readonly platform: PlatformAuthenticationEntry
  /** 平台身份绑定当前的业务状态。 */
  readonly binding_status: PlatformIdentityBindingResolveSnapshot['status']
  /** 会话所属统一用户公开引用。 */
  readonly session_user_ref: string
  /** 会话实际通过的认证入口。 */
  readonly authenticated_via: PlatformAuthenticationEntry
  /** 当前登录会话的生命周期状态。 */
  readonly session_status: UserSessionResolveSnapshot['status']
  /** 会话签发时的撤销版本十进制文本。 */
  readonly session_version: string
  /** 会话签发时间 UTC 毫秒十进制文本。 */
  readonly issued_at_ms: string
  /** 会话失效时间 UTC 毫秒十进制文本。 */
  readonly expires_at_ms: string
}

/** identity Repository 使用的参数化只读 SQL 端口。 */
export type UserPrincipalSqlExecutor = {
  /** 执行只读 JOIN；实现不得记录 SQL 参数值。 */
  readonly executeQuery: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly UserPrincipalSqlRow[]>
}

const zero = Number('0')
const one = Number('1')
const sha256Format = /^[a-f0-9]{64}$/u
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const platforms = new Set<PlatformAuthenticationEntry>(['wechat', 'douyin', 'xiaohongshu', 'phone'])

/** 解析 JavaScript 可安全表达的非负整数文本。 */
function parseSafeInteger(value: string, label: string, positive: boolean): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new UnifiedUserPrincipalResolveError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      `${label}格式不合法`
    )
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < (positive ? one : zero)) {
    throw new UnifiedUserPrincipalResolveError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      `${label}超出安全范围`
    )
  }
  return parsed
}

/** 校验调用方只传入会话摘要，不允许原始身份值穿透。 */
function verifyReadInput(input: ReadUserPrincipalSnapshotInput): void {
  if (!sha256Format.test(input.sessionRefHash)) {
    throw new UnifiedUserPrincipalResolveError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '统一身份摘要查询条件不合法'
    )
  }
}

/** 映射最小快照；归属一致性继续由纯领域函数二次验证。 */
function mapRow(row: UserPrincipalSqlRow): UserPrincipalResolutionSnapshot {
  if (
    !userRefFormat.test(row.user_ref) ||
    !userRefFormat.test(row.binding_user_ref) ||
    !userRefFormat.test(row.session_user_ref) ||
    !platforms.has(row.platform) ||
    !platforms.has(row.authenticated_via)
  ) {
    throw new UnifiedUserPrincipalResolveError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '统一身份数据库快照不合法'
    )
  }
  return {
    user: {
      user_id: row.user_ref as UserRef,
      status: row.user_status,
      sessionVersion: parseSafeInteger(row.user_session_version, '用户会话版本', true)
    },
    binding: {
      user_id: row.binding_user_ref as UserRef,
      platform: row.platform,
      status: row.binding_status
    },
    session: {
      user_id: row.session_user_ref as UserRef,
      authenticatedVia: row.authenticated_via,
      status: row.session_status,
      sessionVersion: parseSafeInteger(row.session_version, '登录会话版本', true),
      issuedAtMs: parseSafeInteger(row.issued_at_ms, '会话签发时间', false),
      expiresAtMs: parseSafeInteger(row.expires_at_ms, '会话失效时间', false)
    }
  }
}

/** 创建只访问 identity 三张主体表的 MySQL Principal Repository。 */
export function createMysqlUserPrincipalRepository(
  executor: UserPrincipalSqlExecutor
): UserPrincipalRepository {
  return {
    read: async input => {
      verifyReadInput(input)
      const rows = await executor.executeQuery(
        `SELECT \`u\`.\`public_user_id\` AS \`user_ref\`, \`u\`.\`status\` AS \`user_status\`,
                CAST(\`u\`.\`session_version\` AS CHAR) AS \`user_session_version\`,
                \`u\`.\`public_user_id\` AS \`binding_user_ref\`, \`p\`.\`platform\`,
                \`p\`.\`binding_status\`, \`u\`.\`public_user_id\` AS \`session_user_ref\`,
                \`s\`.\`authenticated_via\`, \`s\`.\`status\` AS \`session_status\`,
                CAST(\`s\`.\`session_version\` AS CHAR) AS \`session_version\`,
                CAST(\`s\`.\`issued_at_ms\` AS CHAR) AS \`issued_at_ms\`,
                CAST(\`s\`.\`expires_at_ms\` AS CHAR) AS \`expires_at_ms\`
         FROM \`user_sessions\` AS \`s\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`s\`.\`user_internal_id\`
         JOIN \`platform_identities\` AS \`p\`
           ON \`p\`.\`id\` = \`s\`.\`platform_identity_internal_id\`
          AND \`p\`.\`user_internal_id\` = \`u\`.\`id\`
          AND \`p\`.\`platform\` = \`s\`.\`authenticated_via\`
         WHERE \`s\`.\`session_ref_hash\` = ?`,
        [input.sessionRefHash]
      )
      if (rows.length === zero) {
        return null
      }
      const row = rows[zero]
      if (rows.length !== one || row === undefined) {
        throw new UnifiedUserPrincipalResolveError(
          'INTERNAL_IDENTITY_DATA_INVALID',
          '统一身份数据库快照不唯一'
        )
      }
      return mapRow(row)
    }
  }
}
