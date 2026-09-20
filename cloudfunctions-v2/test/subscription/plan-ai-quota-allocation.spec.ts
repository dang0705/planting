import { describe, expect, test } from 'vitest'

import { planAiQuotaAllocation } from '../../src/subscription/domain/plan-ai-quota-allocation.js'

const nowMs = Number('1758376800000')

/** 构造仍有效并允许小青文本能力的额度批次候选。 */
function grantCandidate(
  grantRef: string,
  availableAmount: number,
  expiresAtMs: number,
  grantedAtMs = nowMs - Number('1000')
) {
  return {
    grantRef,
    availableAmount,
    grantedAtMs,
    expiresAtMs,
    capabilityScope: ['USER_AGENT_TEXT'] as const
  }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的最早到期优先、能力范围、开区间失效与余额守恒规则。
 * 测试层次：L1 / `unit_fake`；直接执行纯领域规则，不替换依赖。
 * 明确未覆盖：MySQL 行锁、Repository、额度账户投影、不可变账本、HTTP 和 CloudBase。
 */
describe('AI 额度预占的稳定批次分摊', () => {
  test('按失效时间、发放时间和批次引用稳定排序并跨批次分摊', () => {
    const result = planAiQuotaAllocation({
      capability: 'USER_AGENT_TEXT',
      estimatedAmount: 8,
      occurredAtMs: nowMs,
      grants: [
        grantCandidate('aqg_later', Number('20'), nowMs + Number('3000')),
        grantCandidate('aqg_same_b', Number('5'), nowMs + Number('2000'), nowMs - Number('3000')),
        grantCandidate('aqg_same_a', Number('5'), nowMs + Number('2000'), nowMs - Number('3000'))
      ]
    })

    expect(result).toEqual({
      kind: 'allocated',
      estimatedAmount: 8,
      allocations: [
        { grantRef: 'aqg_same_a', reservedAmount: 5 },
        { grantRef: 'aqg_same_b', reservedAmount: 3 }
      ]
    })
  })

  test('达到失效时刻、尚未生效、能力不匹配或零余额的批次均不可参与', () => {
    const result = planAiQuotaAllocation({
      capability: 'USER_AGENT_TEXT',
      estimatedAmount: 3,
      occurredAtMs: nowMs,
      grants: [
        grantCandidate('aqg_expired', Number('9'), nowMs),
        grantCandidate('aqg_future', Number('9'), nowMs + Number('5000'), nowMs + Number('1')),
        {
          ...grantCandidate('aqg_scope_mismatch', Number('9'), nowMs + Number('5000')),
          capabilityScope: ['USER_DIAGNOSIS_TEXT'] as const
        },
        grantCandidate('aqg_empty', Number('0'), nowMs + Number('5000')),
        grantCandidate('aqg_valid', Number('3'), nowMs + Number('5000'))
      ]
    })

    expect(result).toEqual({
      kind: 'allocated',
      estimatedAmount: 3,
      allocations: [{ grantRef: 'aqg_valid', reservedAmount: 3 }]
    })
  })

  test('总可用额度不足时返回完整缺口且不产生部分分摊', () => {
    expect(
      planAiQuotaAllocation({
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 10,
        occurredAtMs: nowMs,
        grants: [
          grantCandidate('aqg_first', Number('4'), nowMs + Number('2000')),
          grantCandidate('aqg_second', Number('3'), nowMs + Number('3000'))
        ]
      })
    ).toEqual({
      kind: 'insufficient_quota',
      estimatedAmount: 10,
      availableAmount: 7,
      shortfallAmount: 3,
      allocations: []
    })
  })

  test('重复批次引用、非法金额或非法时间失败关闭', () => {
    const duplicate = grantCandidate('aqg_duplicate', Number('5'), nowMs + Number('1000'))
    expect(() =>
      planAiQuotaAllocation({
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 1,
        occurredAtMs: nowMs,
        grants: [duplicate, duplicate]
      })
    ).toThrow('额度批次候选不合法')

    expect(() =>
      planAiQuotaAllocation({
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 0,
        occurredAtMs: nowMs,
        grants: []
      })
    ).toThrow('预占额度不合法')

    expect(() =>
      planAiQuotaAllocation({
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 1,
        occurredAtMs: -1,
        grants: []
      })
    ).toThrow('预占时间不合法')
  })
})
