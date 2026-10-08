import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/** 已冻结的游客会话时长只作为反例，不能变成登录临时植物的隐式策略。 */
const GUEST_SESSION_TTL_HOURS = 24

/** 配置目录的最小只读形状；测试不从运行实现反推期望值。 */
interface ConfigurationCatalog {
  /** 业务变量清单。 */
  variables: Array<{
    /** 变量的稳定英文代码。 */
    id: string
    /** 中文业务含义。 */
    chineseName: string
    /** 负责裁决和发布的业务域。 */
    owner: string
    /** 未冻结前不得当作运行默认值的登记状态。 */
    status: string
    /** 真正依赖此数值才能实现运行功能的阶段。 */
    phase: string
    /** 当前登记值；待冻结时只能是明确的待定标记。 */
    currentValue: unknown
    /** 可追溯的业务合同来源。 */
    sourceRefs: string[]
    /** 使用该策略的业务域。 */
    consumers: string[]
    /** 尚不能确定数值的原因。 */
    pendingReason?: string
    /** 未冻结数值所阻断的准确功能范围。 */
    blockingScope?: string
  }>
}

/** Expected 来源：已登录用户临时植物案例合同的 P1 增量门第 5 项。 */
function readCatalog(): ConfigurationCatalog {
  const path = resolve(
    findProjectRoot(),
    'docs/backend-v2/architecture/configuration-variable-catalog.json'
  )
  return JSON.parse(readFileSync(path, 'utf8')) as ConfigurationCatalog
}

describe('已登录临时植物有效期配置门', () => {
  // Expected 来源更新：用户 2026-10-08 明确裁决已登录临时案例保留 7 天（168 小时），独立于游客会话。
  test('单独冻结为 168 小时，不沿用游客会话 24 小时', () => {
    const variable = readCatalog().variables.find(
      item => item.id === 'user-plant.authenticated_ephemeral.case_ttl_hours'
    )

    expect(variable).toBeDefined()
    expect(variable).toMatchObject({
      chineseName: '已登录用户临时植物案例有效期',
      owner: 'user-plant',
      status: 'confirmed',
      phase: 'P3',
      currentValue: 168
    })
    expect(variable?.sourceRefs).toContain(
      'docs/backend-v2/contracts/authenticated-ephemeral-plant-case.md'
    )
    expect(variable?.consumers).toEqual(expect.arrayContaining(['user-plant', 'care', 'diagnosis']))
    expect(variable?.currentValue).not.toBe(GUEST_SESSION_TTL_HOURS)
  })
})
