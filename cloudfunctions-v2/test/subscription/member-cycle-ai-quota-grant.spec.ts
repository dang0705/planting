import { describe, expect, test } from 'vitest'

import type { MemberAiQuotaPolicySnapshot } from '../../src/configuration/member-ai-quota-policy.js'
import type { UserRef } from '../../src/contracts/types.js'
import {
  planMemberCycleAiQuotaGrant,
  type MemberCycleAiQuotaGrantInput
} from '../../src/subscription/domain/plan-member-cycle-ai-quota-grant.js'

/** 合同当前批准的会员周期 AI 点数；Expected 固定为 2,000，不从被测计划函数读取。 */
const approvedPointsPerCycle = 2000
/** 会员周期起始时刻，使用固定 UTC 毫秒值供边界断言复用。 */
const periodStartsAtMs = Date.parse('2026-09-24T10:00:00.000Z')
/** 会员额度计划发生时刻，必须落入周期的左闭右开区间。 */
const grantOccurredAtMs = Date.parse('2026-09-24T12:00:00.000Z')
/** 会员周期结束时刻，同时也是额度批次的绝对失效时刻。 */
const periodEndsAtMs = Date.parse('2026-10-24T10:00:00.000Z')
/** 时间值最小递增单位，UTC 毫秒。 */
const oneMillisecond = 1
/** 测试策略摘要使用 SHA-256 固定字符数。 */
const sha256HexLength = 64
/** 非整数时间边界必须被拒绝；半毫秒不是合法 UTC 毫秒。 */
const halfMillisecond = 0.5
/** 能力合同要求会员额度可用于的三类生成式能力。 */
const expectedCapabilityScope = [
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
] as const
/** 用户公开引用仅作为测试中的统一归属标记，不含数据库内部主键。 */
const ownerUserRef = 'usr_member_grant_test' as UserRef
/** 用于断言跨用户失败关闭的另一用户公开引用。 */
const otherUserRef = 'usr_other_member_test' as UserRef
/** 测试策略发布版本；仅为测试夹具，不代表生产发布已存在。 */
const fixtureReleaseVersion = 'member-ai-quota/2026-09-24.1'
/** 测试策略正文摘要占位；此领域计划只接收配置域已校验的快照。 */
const fixturePolicyDigest = 'd'.repeat(sha256HexLength)

/** 构造一条订阅周期、支付对账事实与策略快照均齐全的受信测试输入。 */
function createGrantInput(): MemberCycleAiQuotaGrantInput {
  const policy: MemberAiQuotaPolicySnapshot = {
    aiPointsPerCycle: approvedPointsPerCycle,
    releaseVersion: fixtureReleaseVersion,
    contentSha256: fixturePolicyDigest
  }

  return {
    principalUserRef: ownerUserRef,
    occurredAtMs: grantOccurredAtMs,
    policy,
    subscription: {
      subscriptionRef: 'sub_member_test',
      userRef: ownerUserRef
    },
    period: {
      periodRef: 'period_member_2026_09',
      subscriptionRef: 'sub_member_test',
      userRef: ownerUserRef,
      status: 'active',
      startsAtMs: periodStartsAtMs,
      endsAtMs: periodEndsAtMs,
      paymentOrderRef: 'pay_member_test',
      paymentOrder: {
        paymentOrderRef: 'pay_member_test',
        userRef: ownerUserRef,
        paidAtMs: periodStartsAtMs - oneMillisecond,
        callbackPaymentOrderRef: 'pay_member_test',
        callbackStatus: 'applied'
      }
    }
  }
}

/** 取回成功场景中的支付事实；若固定夹具意外不完整则立即失败，避免测试隐式跳过。 */
function requirePaymentOrder(input: MemberCycleAiQuotaGrantInput) {
  const paymentOrder = input.period.paymentOrder
  if (paymentOrder === null) {
    throw new Error('测试夹具必须包含支付订单事实')
  }
  return paymentOrder
}

/**
 * 层次：L1 / unit_fake；形态：Happy 与 Edge/Reverse 分开断言。
 * Expected 来源：`care-points-and-ai-quota.md`「会员周期额度的发放边界」与「已冻结产品数值」；
 * `005_subscription.sql` 中 subscription_periods 的状态、外键和时间窗；独立策略快照来源为
 * `member-ai-quota-policy.ts` 的类型化发布解析结果。Expected 不由被测计划函数生成。
 * Real path：会员周期额度纯领域计划函数；没有替换被测逻辑。
 * 明确未覆盖：MySQL 事务、Repository 幂等/并发、支付 Provider 验签与回调对账、HTTP、CloudBase。
 */
describe('会员周期 AI 额度发放计划', () => {
  test('将已对账有效周期映射为 2000 点会员批次并冻结来源、策略、范围和到期时间', () => {
    expect(planMemberCycleAiQuotaGrant(createGrantInput())).toEqual({
      kind: 'grant',
      grant: {
        sourceType: 'MEMBER',
        sourceRef: 'period_member_2026_09',
        userRef: ownerUserRef,
        grantedAmount: approvedPointsPerCycle,
        capabilityScope: expectedCapabilityScope,
        policyVersion: fixtureReleaseVersion,
        grantedAtMs: grantOccurredAtMs,
        expiresAtMs: periodEndsAtMs
      }
    })
  })

  test('允许周期起点发放，但周期结束时刻及之后拒绝新批次', () => {
    const input = createGrantInput()

    expect(planMemberCycleAiQuotaGrant({ ...input, occurredAtMs: periodStartsAtMs })).toMatchObject(
      { kind: 'grant', grant: { grantedAtMs: periodStartsAtMs } }
    )
    expect(planMemberCycleAiQuotaGrant({ ...input, occurredAtMs: periodEndsAtMs })).toEqual({
      kind: 'rejected',
      reason: 'MEMBER_CYCLE_OUTSIDE_WINDOW'
    })
    expect(
      planMemberCycleAiQuotaGrant({
        ...input,
        occurredAtMs: periodEndsAtMs + oneMillisecond
      })
    ).toEqual({ kind: 'rejected', reason: 'MEMBER_CYCLE_OUTSIDE_WINDOW' })
  })

  test('拒绝未开始、失效或状态非 active 的订阅周期', () => {
    const input = createGrantInput()

    expect(
      planMemberCycleAiQuotaGrant({ ...input, occurredAtMs: periodStartsAtMs - oneMillisecond })
    ).toEqual({ kind: 'rejected', reason: 'MEMBER_CYCLE_OUTSIDE_WINDOW' })
    expect(
      planMemberCycleAiQuotaGrant({
        ...input,
        period: { ...input.period, status: 'expired' }
      })
    ).toEqual({ kind: 'rejected', reason: 'MEMBER_CYCLE_NOT_ACTIVE' })
  })

  test('拒绝主体、订阅、周期或支付订单的用户归属和引用关系不一致', () => {
    const input = createGrantInput()
    const paymentOrder = requirePaymentOrder(input)

    const mismatchedInputs: MemberCycleAiQuotaGrantInput[] = [
      { ...input, principalUserRef: otherUserRef },
      { ...input, subscription: { ...input.subscription, userRef: otherUserRef } },
      { ...input, period: { ...input.period, userRef: otherUserRef } },
      {
        ...input,
        subscription: { ...input.subscription, subscriptionRef: 'sub_other_test' }
      },
      {
        ...input,
        period: {
          ...input.period,
          paymentOrder: { ...paymentOrder, userRef: otherUserRef }
        }
      },
      {
        ...input,
        period: {
          ...input.period,
          paymentOrder: {
            ...paymentOrder,
            callbackPaymentOrderRef: 'pay_other_test'
          }
        }
      }
    ]

    for (const mismatchedInput of mismatchedInputs) {
      expect(planMemberCycleAiQuotaGrant(mismatchedInput)).toEqual({
        kind: 'rejected',
        reason: 'MEMBER_CYCLE_OWNERSHIP_MISMATCH'
      })
    }
  })

  test('相同但无效的用户公开引用不能绕过四方归属校验', () => {
    const input = createGrantInput()
    const paymentOrder = requirePaymentOrder(input)
    const invalidUserRef = 'usr_' as UserRef
    expect(
      planMemberCycleAiQuotaGrant({
        ...input,
        principalUserRef: invalidUserRef,
        subscription: { ...input.subscription, userRef: invalidUserRef },
        period: {
          ...input.period,
          userRef: invalidUserRef,
          paymentOrder: { ...paymentOrder, userRef: invalidUserRef }
        }
      })
    ).toEqual({ kind: 'rejected', reason: 'MEMBER_CYCLE_INVALID' })
  })

  test('只有已入账且关联同一支付订单的 applied 回调事实可通过周期核验', () => {
    const input = createGrantInput()
    const paymentOrder = requirePaymentOrder(input)

    const unreconciledInputs: MemberCycleAiQuotaGrantInput[] = [
      {
        ...input,
        period: { ...input.period, paymentOrder: null }
      },
      {
        ...input,
        period: {
          ...input.period,
          paymentOrder: { ...paymentOrder, paidAtMs: null }
        }
      },
      {
        ...input,
        period: {
          ...input.period,
          paymentOrder: { ...paymentOrder, callbackStatus: 'received' }
        }
      }
    ]

    for (const unreconciledInput of unreconciledInputs) {
      expect(planMemberCycleAiQuotaGrant(unreconciledInput)).toEqual({
        kind: 'rejected',
        reason: 'MEMBER_CYCLE_PAYMENT_NOT_RECONCILED'
      })
    }
  })

  test('周期时间、支付时间或额度策略不合法时失败关闭', () => {
    const input = createGrantInput()
    const paymentOrder = requirePaymentOrder(input)

    const invalidWindowInputs: MemberCycleAiQuotaGrantInput[] = [
      { ...input, occurredAtMs: Number.NaN },
      { ...input, occurredAtMs: Number.POSITIVE_INFINITY },
      { ...input, occurredAtMs: grantOccurredAtMs + halfMillisecond },
      {
        ...input,
        period: { ...input.period, startsAtMs: Number.NaN }
      },
      {
        ...input,
        period: { ...input.period, endsAtMs: periodStartsAtMs }
      },
      {
        ...input,
        period: {
          ...input.period,
          paymentOrder: { ...paymentOrder, paidAtMs: Number.NaN }
        }
      }
    ]

    for (const invalidInput of invalidWindowInputs) {
      expect(planMemberCycleAiQuotaGrant(invalidInput)).toEqual({
        kind: 'rejected',
        reason: 'MEMBER_CYCLE_INVALID'
      })
    }

    expect(
      planMemberCycleAiQuotaGrant({
        ...input,
        policy: { ...input.policy, aiPointsPerCycle: 0 }
      })
    ).toEqual({ kind: 'rejected', reason: 'MEMBER_AI_QUOTA_POLICY_INVALID' })
  })
})
