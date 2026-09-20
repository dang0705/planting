import { describe, expect, test } from 'vitest'

import { planAiQuotaSettlement } from '../../src/subscription/domain/plan-ai-quota-settlement.js'

/**
 * Expected 来源：`care-points-ai-quota/v1` 的 reserved→consumed/available 状态转移与 allocation 守恒规则。
 * 测试层次：L1 / `unit_fake`；直接执行纯领域规则，不替换任何依赖。
 * 明确未覆盖：Repository、MySQL 行锁、账本、供应商成本换算、HTTP 和提交结果未知对账。
 */
describe('AI 额度预占结算与释放计划', () => {
  test('按原稳定分摊顺序结算实际额度，并完整释放剩余预占', () => {
    expect(
      planAiQuotaSettlement({
        estimatedAmount: 8,
        settledAmount: 6,
        allocations: [
          { grantRef: 'aqg_first', remainingAmount: 5 },
          { grantRef: 'aqg_second', remainingAmount: 3 }
        ]
      })
    ).toEqual({
      kind: 'settled',
      estimatedAmount: 8,
      settledAmount: 6,
      releasedAmount: 2,
      allocations: [
        { grantRef: 'aqg_first', settledAmount: 5, releasedAmount: 0 },
        { grantRef: 'aqg_second', settledAmount: 1, releasedAmount: 2 }
      ]
    })
  })

  test('实际结算为零时整笔释放且不得制造 settle 分摊', () => {
    expect(
      planAiQuotaSettlement({
        estimatedAmount: 8,
        settledAmount: 0,
        allocations: [
          { grantRef: 'aqg_first', remainingAmount: 5 },
          { grantRef: 'aqg_second', remainingAmount: 3 }
        ]
      })
    ).toEqual({
      kind: 'released',
      estimatedAmount: 8,
      settledAmount: 0,
      releasedAmount: 8,
      allocations: [
        { grantRef: 'aqg_first', settledAmount: 0, releasedAmount: 5 },
        { grantRef: 'aqg_second', settledAmount: 0, releasedAmount: 3 }
      ]
    })
  })

  test('实际额度等于预占时全部结算且不产生 release', () => {
    expect(
      planAiQuotaSettlement({
        estimatedAmount: 8,
        settledAmount: 8,
        allocations: [
          { grantRef: 'aqg_first', remainingAmount: 5 },
          { grantRef: 'aqg_second', remainingAmount: 3 }
        ]
      })
    ).toEqual({
      kind: 'settled',
      estimatedAmount: 8,
      settledAmount: 8,
      releasedAmount: 0,
      allocations: [
        { grantRef: 'aqg_first', settledAmount: 5, releasedAmount: 0 },
        { grantRef: 'aqg_second', settledAmount: 3, releasedAmount: 0 }
      ]
    })
  })

  test('实际额度超过预占时进入待对账且不提前改变任何分摊', () => {
    expect(
      planAiQuotaSettlement({
        estimatedAmount: 8,
        settledAmount: 10,
        allocations: [
          { grantRef: 'aqg_first', remainingAmount: 5 },
          { grantRef: 'aqg_second', remainingAmount: 3 }
        ]
      })
    ).toEqual({
      kind: 'pending_reconciliation',
      estimatedAmount: 8,
      requestedSettlementAmount: 10,
      quotaShortfallAmount: 2,
      allocations: []
    })
  })

  test('分摊不守恒、重复批次或非法整数均失败关闭', () => {
    const validAllocations = [
      { grantRef: 'aqg_first', remainingAmount: 5 },
      { grantRef: 'aqg_second', remainingAmount: 3 }
    ] as const
    expect(() =>
      planAiQuotaSettlement({
        estimatedAmount: 8,
        settledAmount: 6,
        allocations: [{ grantRef: 'aqg_first', remainingAmount: 7 }]
      })
    ).toThrow('AI额度结算分摊不守恒')
    expect(() =>
      planAiQuotaSettlement({
        estimatedAmount: 8,
        settledAmount: 6,
        allocations: [
          { grantRef: 'aqg_duplicate', remainingAmount: 4 },
          { grantRef: 'aqg_duplicate', remainingAmount: 4 }
        ]
      })
    ).toThrow('AI额度结算输入不合法')
    expect(() =>
      planAiQuotaSettlement({
        estimatedAmount: 8,
        settledAmount: Number('-1'),
        allocations: validAllocations
      })
    ).toThrow('AI额度结算输入不合法')
  })
})
