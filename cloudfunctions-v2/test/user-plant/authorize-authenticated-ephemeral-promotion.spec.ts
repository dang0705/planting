import { describe, expect, test } from 'vitest'

import type {
  GuestPrincipalDto,
  PrincipalDto,
  UserRef,
  UserPrincipalDto
} from '../../src/contracts/types.js'
import { authorizeAuthenticatedEphemeralPromotion } from '../../src/user-plant/domain/authorize-authenticated-ephemeral-promotion.js'

/** 作为主人植物案例的统一用户公开引用，不是数据库内部主键。 */
const userA = 'usr_aaaaaaaa' as UserRef
/** 用于跨用户拒绝期望的另一个统一用户公开引用。 */
const userB = 'usr_bbbbbbbb' as UserRef

/** 构造已由认证层解析的用户主体；各测试只改变本次所需的统一 user_id 或失效边界。 */
function createUserPrincipal(
  userId: UserRef,
  expiresAt = '2030-01-01T00:00:00.000Z'
): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userId,
    sessionVersion: 1,
    authenticatedVia: 'wechat',
    issuedAt: '2029-01-01T00:00:00.000Z',
    expiresAt
  }
}

/** 已认证但不具备统一 user_id 的游客主体，用于证明不能走登录用户绑定路径。 */
const guestPrincipal: GuestPrincipalDto = {
  principalType: 'guest',
  guestSessionRef: 'gss_aaaaaaaa' as GuestPrincipalDto['guestSessionRef'],
  authProvider: 'cloudbase_anonymous',
  issuedAt: '2029-01-01T00:00:00.000Z',
  expiresAt: '2030-01-01T00:00:00.000Z'
}

/** Repository 可信读回中一株未绑定、未过期的登录临时案例投影。 */
const validCase = {
  ownerUserRef: userA,
  expiresAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
  alreadyPromoted: false
} as const

/** 用户明确选择新建长期用户植物的目标。 */
const validNewPlantTarget = { type: 'new_user_plant' } as const
/** 用户明确选择自己已有长期用户植物的目标。 */
const validExistingPlantTarget = { type: 'existing_user_plant', ownerUserRef: userA } as const
/** 测试中身份与案例有效期均尚未到达的可信服务端时刻。 */
const nowMs = Date.parse('2029-06-01T00:00:00.000Z')

/** Expected 来源：已登录用户临时植物合同补充门及已冻结 Principal 合同。 */
describe('已登录临时植物案例保存归属判定', () => {
  /**
   * 测试层次：L1 / unit_fake；直接执行无 I/O 的领域判定，不替换依赖。
   * 覆盖 U1 缺失/非法 Principal、U2 有效期等值边界、U3 错误主体和归属不匹配。
   * U4 N/A（不执行命令或幂等写入）；U5 N/A（无写入副作用）；U6 N/A（并发一次性约束由后续事务层验证）。
   * U7 N/A（没有服务端源合并）。不覆盖持久化创建、TTL 计算、路由/API、数据库、游客公开合同和事务。
   */
  test('同一已认证统一用户可保存未过期且未绑定的临时案例到新建植物', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: createUserPrincipal(userA),
        ephemeralCase: validCase,
        target: validNewPlantTarget,
        nowMs
      })
    ).toEqual({ allowed: true })
  })

  test('同一用户更换认证平台但解析到相同 user_id 时可绑定本人已有植物', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: { ...createUserPrincipal(userA), authenticatedVia: 'phone' },
        ephemeralCase: validCase,
        target: validExistingPlantTarget,
        nowMs
      })
    ).toEqual({ allowed: true })
  })

  test('游客主体不能执行已登录临时案例的绑定命令', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: guestPrincipal,
        ephemeralCase: validCase,
        target: validNewPlantTarget,
        nowMs
      })
    ).toEqual({ allowed: false, reason: 'principal_not_user' })
  })

  test('仅凭案例引用不能跨统一用户访问或绑定', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: createUserPrincipal(userB),
        ephemeralCase: validCase,
        target: { type: 'existing_user_plant', ownerUserRef: userB },
        nowMs
      })
    ).toEqual({ allowed: false, reason: 'case_owner_mismatch' })
  })

  test('案例有效期恰好到达边界时拒绝绑定', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: createUserPrincipal(userA),
        ephemeralCase: { ...validCase, expiresAtMs: nowMs },
        target: validNewPlantTarget,
        nowMs
      })
    ).toEqual({ allowed: false, reason: 'case_expired' })
  })

  test('登录主体恰好到达失效边界时拒绝绑定', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: createUserPrincipal(userA, new Date(nowMs).toISOString()),
        ephemeralCase: validCase,
        target: validNewPlantTarget,
        nowMs
      })
    ).toEqual({ allowed: false, reason: 'principal_expired' })
  })

  test('已绑定案例不能再次绑定', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: createUserPrincipal(userA),
        ephemeralCase: { ...validCase, alreadyPromoted: true },
        target: validNewPlantTarget,
        nowMs
      })
    ).toEqual({ allowed: false, reason: 'case_already_promoted' })
  })

  test('目标长期植物不属于当前 user_id 时拒绝绑定', () => {
    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: createUserPrincipal(userA),
        ephemeralCase: validCase,
        target: { type: 'existing_user_plant', ownerUserRef: userB },
        nowMs
      })
    ).toEqual({ allowed: false, reason: 'target_owner_mismatch' })
  })

  test('缺失、损坏的服务端案例投影或无效时间失败关闭', () => {
    /** 复用有效主体、目标与当前时间，只替换被验证的服务端案例投影。 */
    const common = {
      principal: createUserPrincipal(userA),
      target: validNewPlantTarget,
      nowMs
    }

    expect(
      authorizeAuthenticatedEphemeralPromotion({
        ...common,
        ephemeralCase: { ownerUserRef: userA, expiresAtMs: Number.NaN, alreadyPromoted: false }
      })
    ).toEqual({ allowed: false, reason: 'internal_input_invalid' })

    expect(
      authorizeAuthenticatedEphemeralPromotion({
        ...common,
        ephemeralCase: {
          ownerUserRef: userA,
          expiresAtMs: validCase.expiresAtMs,
          alreadyPromoted: false
        },
        nowMs: Number.NaN
      })
    ).toEqual({ allowed: false, reason: 'internal_input_invalid' })
  })

  test('旧的游客主体引用不能被伪造成 user principal', () => {
    /** 保留游客主体判别字段，确保调用方不能靠拼装对象升级访问主体。 */
    const forgedPrincipal = {
      ...guestPrincipal,
      principalType: 'guest'
    } as PrincipalDto

    expect(
      authorizeAuthenticatedEphemeralPromotion({
        principal: forgedPrincipal,
        ephemeralCase: validCase,
        target: validNewPlantTarget,
        nowMs
      })
    ).toEqual({ allowed: false, reason: 'principal_not_user' })
  })
})
