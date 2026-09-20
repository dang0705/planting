import type { UserPrincipalDto, UserRef } from '../../contracts/types.js'

/** identity 领域解析登录用户主体时可以产生的稳定拒绝类型。 */
export type 统一用户主体解析错误类型 = 'PRINCIPAL_INVALID' | 'INTERNAL_IDENTITY_DATA_INVALID'

/**
 * 主体解析拒绝由应用层统一转换为公开 HTTP 错误。
 *
 * 错误中只保留稳定类型和泛化中文消息，不携带平台主体、会话摘要或数据库内部主键。
 */
export class 统一用户主体解析错误 extends Error {
  /** 稳定拒绝类型；内部数据错误对外必须映射为泛化服务错误。 */
  readonly type: 统一用户主体解析错误类型

  constructor(type: 统一用户主体解析错误类型, message: string) {
    super(message)
    this.name = '统一用户主体解析错误'
    this.type = type
  }
}

/** identity 域支持的平台认证入口。 */
export type 平台认证入口 = 'wechat' | 'douyin' | 'xiaohongshu' | 'phone'

/** Repository 从统一用户记录读取的最小解析快照。 */
export type 统一用户解析快照 = {
  /** 平台无关的高熵公开用户引用；不是数据库 BIGINT 内部主键。 */
  user_id: UserRef
  /** 统一用户当前状态；只有 active 可以签发请求主体。 */
  status: 'active' | 'suspended' | 'deleting' | 'deleted'
  /** 用户当前会话撤销版本；解绑或风险处置后递增。 */
  sessionVersion: number
}

/** Repository 从平台身份绑定读取的最小解析快照。 */
export type 平台身份绑定解析快照 = {
  /** 绑定记录所属的统一用户公开引用，用于防止 Repository 错误接线。 */
  user_id: UserRef
  /** 已完成外部凭证验证的平台入口。 */
  platform: 平台认证入口
  /** 当前绑定状态；只有 active 可以参与主体解析。 */
  status: 'active' | 'revoked' | 'conflicted'
}

/** Repository 根据原始 Bearer 的 SHA-256 摘要读取的最小会话快照。 */
export type 用户会话解析快照 = {
  /** 会话所属的统一用户公开引用，用于与用户和绑定快照交叉核验。 */
  user_id: UserRef
  /** 本次会话实际验证的平台入口，必须与绑定平台一致。 */
  authenticatedVia: 平台认证入口
  /** 会话当前状态；只有 active 可以继续使用。 */
  status: 'active' | 'revoked' | 'expired'
  /** 会话签发时记录的撤销版本，必须等于用户当前版本。 */
  sessionVersion: number
  /** 会话签发时间，使用 Unix epoch 毫秒。 */
  issuedAtMs: number
  /** 会话失效时间，使用 Unix epoch 毫秒；达到该时刻即失效。 */
  expiresAtMs: number
}

/** 解析统一登录用户主体所需的纯领域输入。 */
export type 解析统一用户主体输入 = {
  /** 已按平台身份关联读出的统一用户快照。 */
  user: 统一用户解析快照
  /** 已验证平台凭证对应的身份绑定快照。 */
  binding: 平台身份绑定解析快照
  /** 已按 Bearer 摘要命中的登录会话快照。 */
  session: 用户会话解析快照
  /** 服务端可信时钟的当前时间，使用 Unix epoch 毫秒。 */
  nowMs: number
}

const 用户公开引用格式 = /^usr_[A-Za-z0-9_-]{8,}$/u
const 最小时间毫秒 = 0
const 最小会话版本 = 1

/** 拒绝不可能由合法 Repository 读回产生的损坏或错接数据。 */
function 校验身份数据一致性(输入: 解析统一用户主体输入): void {
  const { user, binding, session, nowMs } = 输入
  const 时间均为安全整数 = [nowMs, session.issuedAtMs, session.expiresAtMs].every(
    (值) => Number.isSafeInteger(值) && 值 >= 最小时间毫秒
  )
  const 版本均为正整数 =
    Number.isSafeInteger(user.sessionVersion) &&
    user.sessionVersion >= 最小会话版本 &&
    Number.isSafeInteger(session.sessionVersion) &&
    session.sessionVersion >= 最小会话版本
  const 归属一致 = user.user_id === binding.user_id && user.user_id === session.user_id
  const 平台一致 = binding.platform === session.authenticatedVia
  const 时间顺序有效 = session.issuedAtMs < session.expiresAtMs && nowMs >= session.issuedAtMs

  if (
    !用户公开引用格式.test(user.user_id) ||
    !用户公开引用格式.test(binding.user_id) ||
    !用户公开引用格式.test(session.user_id) ||
    !时间均为安全整数 ||
    !版本均为正整数 ||
    !归属一致 ||
    !平台一致 ||
    !时间顺序有效
  ) {
    throw new 统一用户主体解析错误(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '统一身份数据不合法，无法解析登录主体'
    )
  }
}

/**
 * 从已经验证并关联读回的用户、绑定和会话快照解析公开登录主体。
 *
 * 本函数不验证外部平台凭证、不接触原始 Bearer，也不访问数据库；应用层必须先完成受控
 * Provider 验证和 Repository 查询，再把最小快照传入。达到 `expiresAtMs` 的同一毫秒即拒绝。
 */
export function 解析统一用户主体(输入: 解析统一用户主体输入): UserPrincipalDto {
  校验身份数据一致性(输入)

  const { user, binding, session, nowMs } = 输入
  const 仍处于有效状态 =
    user.status === 'active' && binding.status === 'active' && session.status === 'active'
  const 会话版本匹配 = session.sessionVersion === user.sessionVersion
  const 尚未过期 = nowMs < session.expiresAtMs

  if (!仍处于有效状态 || !会话版本匹配 || !尚未过期) {
    throw new 统一用户主体解析错误('PRINCIPAL_INVALID', '登录会话已失效')
  }

  return {
    principalType: 'user',
    user_id: user.user_id,
    sessionVersion: user.sessionVersion,
    authenticatedVia: session.authenticatedVia,
    issuedAt: new Date(session.issuedAtMs).toISOString(),
    expiresAt: new Date(session.expiresAtMs).toISOString()
  }
}
