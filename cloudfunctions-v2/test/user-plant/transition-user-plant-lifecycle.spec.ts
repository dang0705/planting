import { describe, expect, test } from 'vitest'

import { canTransitionUserPlantLifecycle } from '../../src/user-plant/domain/transition-user-plant-lifecycle.js'

/**
 * Expected 来源：`docs/backend-v2/data/state-machines.md` 的用户植物生命周期图，以及
 * `docs/backend-v2/contracts/user-plant.md` 的生命周期约束。图中只允许五条显式边，`deleted` 是终态。
 * 测试层次：L1 / `unit_fake`；直接执行无 I/O 的领域转换判断，不替换依赖。
 * 明确未覆盖：数据库并发写、Repository 乐观锁、HTTP 错误映射、CloudBase MySQL 与身份校验。
 * 风险覆盖：U1/U3 非法或缺失状态失败关闭；U2 五条允许边、跳转和终态有独立期望。
 * U4 N/A（纯状态判断，不产生幂等命令）；U5 N/A（无写入副作用）；U6 N/A（并发由 Repository 负责）；
 * U7 N/A（无服务端源与本地态合并）。
 */
describe('用户植物生命周期转换', () => {
  test.each([
    ['active', 'archived'],
    ['archived', 'active'],
    ['active', 'deleting'],
    ['archived', 'deleting'],
    ['deleting', 'deleted']
  ] as const)('%s → %s 是合同允许的转换', (current, next) => {
    expect(canTransitionUserPlantLifecycle(current, next)).toBe(true)
  })

  test.each([
    ['active', 'deleted'],
    ['archived', 'deleted'],
    ['deleting', 'active'],
    ['deleted', 'active'],
    ['deleted', 'deleting'],
    ['active', 'active']
  ] as const)('%s → %s 不在合同状态图中', (current, next) => {
    expect(canTransitionUserPlantLifecycle(current, next)).toBe(false)
  })

  test('空值、缺失值和未知状态均失败关闭', () => {
    expect(canTransitionUserPlantLifecycle('', 'active')).toBe(false)
    expect(canTransitionUserPlantLifecycle('active', '')).toBe(false)
    expect(canTransitionUserPlantLifecycle(null, 'active')).toBe(false)
    expect(canTransitionUserPlantLifecycle('active', undefined)).toBe(false)
    expect(canTransitionUserPlantLifecycle('superseded', 'active')).toBe(false)
  })
})
