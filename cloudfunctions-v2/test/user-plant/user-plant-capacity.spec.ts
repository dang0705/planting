import { describe, expect, test } from 'vitest'

import { isUserPlantCapacityReached } from '../../src/user-plant/domain/user-plant-capacity.js'

/**
 * Expected 来源：`docs/backend-v2/decisions/P0-product-cost-boundaries.md#D-03` 与
 * `docs/backend-v2/contracts/user-plant.md`：仅 active 用户植物占用能力上限。
 * 测试层次：L1 / `unit_fake`；直接验证共享纯领域比较，不替换外部边界。
 * 明确未覆盖：active 数量的数据库读取、用户行锁、并发竞争及公开错误映射。
 */
describe('用户植物 active 数量上限', () => {
  test.each([
    { name: '当前数量低于上限', activeCount: 0, activeLimit: 1, reached: false },
    { name: '当前数量等于上限', activeCount: 1, activeLimit: 1, reached: true },
    { name: '当前数量超过上限', activeCount: 2, activeLimit: 1, reached: true },
    { name: '上限为零时无 active 名额', activeCount: 0, activeLimit: 0, reached: true }
  ])('$name 时返回 $reached', ({ activeCount, activeLimit, reached }) => {
    expect(isUserPlantCapacityReached(activeCount, activeLimit)).toBe(reached)
  })
})
