import type { PrincipalDto, UserRef } from '../../contracts/types.js'

/** 已登录临时案例绑定判定可返回的领域拒绝原因。 */
export type AuthenticatedEphemeralPromotionDenialReason =
  | 'principal_not_user'
  | 'principal_expired'
  | 'case_owner_mismatch'
  | 'case_expired'
  | 'case_already_promoted'
  | 'target_owner_mismatch'
  | 'internal_input_invalid'

/** 已登录临时案例绑定判定所需的可信服务端快照，不包含任何请求正文中的身份声明。 */
export type AuthenticatedEphemeralPromotionAuthorizationInput = {
  /** identity 域已经验证的平台凭证并解析出的主体；只有 user 分支可以认领登录临时案例。 */
  principal: PrincipalDto
  /** user-plant Repository 按不透明临时案例引用读取的归属、过期与绑定状态投影。 */
  ephemeralCase: {
    /** 创建临时案例时服务端绑定的统一用户公开引用，不是平台 OpenID 或数据库内部键。 */
    ownerUserRef: UserRef
    /** 该案例签发时记录的绝对过期时刻，Unix epoch 毫秒；本函数不计算或决定 TTL。 */
    expiresAtMs: number
    /** 表示该案例是否已经成功绑定；该值须来自锁定后的可信持久化读回。 */
    alreadyPromoted: boolean
  }
  /** 用户本次明确选择的长期植物目标；existing 分支中的 owner 由 Repository 读回。 */
  target:
    | {
        /** 目标由当前事务按 UserPrincipal 创建；调用方仍须执行能力快照与活跃数量上限校验。 */
        type: 'new_user_plant'
      }
    | {
        /** 目标植物类型；区分服务端创建与用户明确选择本人已有植物。 */
        type: 'existing_user_plant'
        /** 由 Repository 按公开用户植物引用读回的统一用户所有者。 */
        ownerUserRef: UserRef
      }
  /** 服务端可信时钟的当前时刻，Unix epoch 毫秒；客户端时间不得传入。 */
  nowMs: number
}

/** 纯授权结果；拒绝原因只供内部编排使用，不得原样暴露为可枚举资源的公开响应。 */
export type AuthenticatedEphemeralPromotionAuthorizationResult =
  | {
      /** 本纯函数负责的主体、案例状态与目标归属门均通过；不是整个绑定命令或创建资格已批准。 */
      allowed: true
    }
  | {
      /** 当前快照不满足合同；应用层不得继续写入。 */
      allowed: false
      /** 内部稳定拒绝原因；不得原样映射为可枚举资源的公开差异。 */
      reason: AuthenticatedEphemeralPromotionDenialReason
    }

/** 用于拒绝空白公开引用的比较常量。 */
const emptyReference = ''

/** 判断字符串是否可作为服务端可信快照中的非空公开引用参与归属比较。 */
function isNonEmptyReference(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== emptyReference
}

/** 判断领域输入是否为已从请求层和持久层验证后的完整投影。 */
function hasValidProjection(input: AuthenticatedEphemeralPromotionAuthorizationInput): boolean {
  if (!Number.isFinite(input.nowMs) || !Number.isFinite(input.ephemeralCase.expiresAtMs)) {
    return false
  }

  if (
    !isNonEmptyReference(input.ephemeralCase.ownerUserRef) ||
    typeof input.ephemeralCase.alreadyPromoted !== 'boolean'
  ) {
    return false
  }

  if (input.target.type === 'new_user_plant') {
    return true
  }

  return (
    input.target.type === 'existing_user_plant' && isNonEmptyReference(input.target.ownerUserRef)
  )
}

/**
 * 判定已登录临时案例是否允许进入显式绑定用例。
 *
 * 只比较认证层 Principal 与 Repository 提供的可信归属投影，不创建临时案例、不计算 TTL、不写数据库，
 * 也不处理幂等、并发锁、目标植物创建资格或跨域结果回填。返回允许只代表本函数负责的案例持有权和状态门
 * 已通过；新建植物仍须经现有能力快照与活跃数量上限检查。应用层必须在受控事务锁定案例与目标植物后调用，
 * 并把“无权”与“不存在”的内部差异折叠为同一公开错误，避免通过公开引用枚举其他用户的案例。
 */
export function authorizeAuthenticatedEphemeralPromotion(
  input: AuthenticatedEphemeralPromotionAuthorizationInput
): AuthenticatedEphemeralPromotionAuthorizationResult {
  if (
    !input ||
    !input.ephemeralCase ||
    !input.target ||
    !input.principal ||
    !hasValidProjection(input)
  ) {
    return { allowed: false, reason: 'internal_input_invalid' }
  }

  if (input.principal.principalType !== 'user') {
    return { allowed: false, reason: 'principal_not_user' }
  }

  const principalExpiresAtMs = Date.parse(input.principal.expiresAt)
  if (!isNonEmptyReference(input.principal.user_id) || !Number.isFinite(principalExpiresAtMs)) {
    return { allowed: false, reason: 'internal_input_invalid' }
  }

  if (input.nowMs >= principalExpiresAtMs) {
    return { allowed: false, reason: 'principal_expired' }
  }

  if (input.principal.user_id !== input.ephemeralCase.ownerUserRef) {
    return { allowed: false, reason: 'case_owner_mismatch' }
  }

  if (input.nowMs >= input.ephemeralCase.expiresAtMs) {
    return { allowed: false, reason: 'case_expired' }
  }

  if (input.ephemeralCase.alreadyPromoted) {
    return { allowed: false, reason: 'case_already_promoted' }
  }

  if (
    input.target.type === 'existing_user_plant' &&
    input.target.ownerUserRef !== input.principal.user_id
  ) {
    return { allowed: false, reason: 'target_owner_mismatch' }
  }

  return { allowed: true }
}
