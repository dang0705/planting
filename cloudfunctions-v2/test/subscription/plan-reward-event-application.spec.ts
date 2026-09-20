import { describe, expect, test } from 'vitest'

import { planRewardEventApplication } from '../../src/subscription/domain/plan-reward-event-application.js'

const levelPolicy = [
  { code: 'L0', threshold: 0, aiReward: 0 },
  { code: 'L1', threshold: 100, aiReward: 50 },
  { code: 'L2', threshold: 300, aiReward: 100 },
  { code: 'L3', threshold: 800, aiReward: 150 },
  { code: 'L4', threshold: 1800, aiReward: 250 },
  { code: 'L5', threshold: 4000, aiReward: 400 }
] as const
const firstLevelIndex = Number('0')
const secondLevelIndex = Number('1')
const thirdLevelIndex = Number('2')

/**
 * Expected 来源：`care-points-ai-quota/v1` 的积分不变账本、累计净获得等级和每级终身一次奖励。
 * 测试层次：L1 / `unit_fake`；不替换依赖，直接执行纯领域计划。
 * 明确未覆盖：策略解析、MySQL 事务、inbox 幂等、AI grant 写入、HTTP 与 CloudBase。
 */
describe('奖励事件积分与等级计划', () => {
  test('积分事件增加可用与累计积分，并一次规划跨越的所有未发等级', () => {
    expect(
      planRewardEventApplication({
        pointsAmount: 250,
        availablePoints: 80,
        lifetimeNetEarned: 80,
        currentLevelCode: 'L0',
        previouslyGrantedLevelCodes: [],
        levelPolicy
      })
    ).toEqual({
      pointsAmount: 250,
      nextAvailablePoints: 330,
      nextLifetimeNetEarned: 330,
      nextLevelCode: 'L2',
      newLevelRewards: [
        { levelCode: 'L1', aiReward: 50 },
        { levelCode: 'L2', aiReward: 100 }
      ]
    })
  })

  test('已发等级终身不重复，消费历史不影响累计等级', () => {
    expect(
      planRewardEventApplication({
        pointsAmount: 20,
        availablePoints: 5,
        lifetimeNetEarned: 90,
        currentLevelCode: 'L0',
        previouslyGrantedLevelCodes: ['L1'],
        levelPolicy
      })
    ).toEqual({
      pointsAmount: 20,
      nextAvailablePoints: 25,
      nextLifetimeNetEarned: 110,
      nextLevelCode: 'L1',
      newLevelRewards: []
    })
  })

  test('非法金额、损坏账户、乱序策略和未知等级均失败关闭', () => {
    const valid = {
      pointsAmount: 5,
      availablePoints: 0,
      lifetimeNetEarned: 0,
      currentLevelCode: 'L0',
      previouslyGrantedLevelCodes: [] as const,
      levelPolicy
    }
    for (const input of [
      { ...valid, pointsAmount: 0 },
      { ...valid, availablePoints: -1 },
      { ...valid, currentLevelCode: 'L9' },
      {
        ...valid,
        levelPolicy: [
          levelPolicy[firstLevelIndex]!,
          levelPolicy[thirdLevelIndex]!,
          levelPolicy[secondLevelIndex]!
        ]
      }
    ]) {
      expect(() => planRewardEventApplication(input)).toThrow('奖励事件积分计划输入不合法')
    }
  })
})
