/** 一小时对应的毫秒数；单位换算常量，不是可配置业务值。 */
const millisecondsPerHour = 3_600_000

/** 游客临时案例裁决输入；全部来自事务内锁定的会话行与请求级策略快照。 */
export interface GuestTemporaryCaseDecisionInput {
  /** 事务内加锁读到的游客会话状态；只有 active 才可新建案例。 */
  readonly guestSessionStatus: string
  /** 事务内加锁读到的游客会话绝对失效时刻，UTC 毫秒。 */
  readonly guestSessionExpiresAtMs: number
  /** 同一游客会话下 status=active 且尚未过期的案例数量。 */
  readonly activeCaseCount: number
  /** 策略快照中的游客会话案例上限，正整数。 */
  readonly maxCasesPerSession: number
  /** 服务端可信时钟的当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** 游客临时案例裁决结果。 */
export type GuestTemporaryCaseDecision =
  | {
      /** 游客会话已非 active 或已过期，必须按主体无效拒绝。 */
      readonly kind: 'principal_invalid'
    }
  | {
      /** 当前会话 active 未过期案例已达上限，不得新建。 */
      readonly kind: 'limit_reached'
    }
  | {
      /** 允许新建游客案例。 */
      readonly kind: 'create'
      /** 新案例绝对失效时刻：等于所属游客会话失效时刻，UTC 毫秒。 */
      readonly expiresAtMs: number
    }

/** 登录临时案例裁决输入。 */
export interface AuthenticatedTemporaryCaseDecisionInput {
  /** 策略快照中的临时案例有效小时数，正整数。 */
  readonly caseTtlHours: number
  /** 服务端可信时钟的当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** 登录临时案例裁决结果；本阶段登录用户不设数量上限。 */
export interface AuthenticatedTemporaryCaseDecision {
  /** 新案例绝对失效时刻：now + 有效期，UTC 毫秒。 */
  readonly expiresAtMs: number
}

/** 校验正整数输入；非法内部输入直接抛出，禁止猜默认。 */
function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) { throw new TypeError(`${label}必须为正整数`) }
}

/** 校验非负安全整数输入。 */
function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) { throw new TypeError(`${label}必须为非负整数`) }
}

/**
 * 游客临时案例规则（temporary-case/v1 §1/§2）：
 * 会话必须 active 且未过期 → 否则主体无效；active 未过期案例数 ≥ 上限 → 拒绝；
 * 否则案例失效时刻等于所属游客会话失效时刻（合同 §1，主代理 2026-10-09 裁决）；
 * 游客没有独立案例有效期配置，不得借用登录临时案例有效期。
 */
export function decideGuestTemporaryCase(input: GuestTemporaryCaseDecisionInput): GuestTemporaryCaseDecision {
  requirePositiveInteger(input.maxCasesPerSession, '游客案例上限')
  requireNonNegativeInteger(input.activeCaseCount, '当前案例数')
  requireNonNegativeInteger(input.nowMs, '当前时刻')
  requireNonNegativeInteger(input.guestSessionExpiresAtMs, '游客会话失效时刻')
  if (input.guestSessionStatus !== 'active' || input.guestSessionExpiresAtMs <= input.nowMs) {
    return { kind: 'principal_invalid' }
  }
  if (input.activeCaseCount >= input.maxCasesPerSession) {
    return { kind: 'limit_reached' }
  }
  return { kind: 'create', expiresAtMs: input.guestSessionExpiresAtMs }
}

/** 登录临时案例规则：失效时刻 = now + 有效期小时（temporary-case/v1 §1）。 */
export function decideAuthenticatedTemporaryCase(input: AuthenticatedTemporaryCaseDecisionInput): AuthenticatedTemporaryCaseDecision {
  requirePositiveInteger(input.caseTtlHours, '案例有效小时数')
  requireNonNegativeInteger(input.nowMs, '当前时刻')
  const expiresAtMs = input.nowMs + input.caseTtlHours * millisecondsPerHour
  if (!Number.isSafeInteger(expiresAtMs)) { throw new TypeError('案例失效时刻超出可表示范围') }
  return { expiresAtMs }
}
