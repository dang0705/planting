import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * RED（尚未实现，须显式运行 npm run test:red）：输入预算守卫的上限只能来自 USER_DIAGNOSIS_VISUAL 成本策略快照；
 * 该策略仍 pending，定稿并发布后本用例才能转绿，届时再把守卫接入真实策略读取。
 * Expected 来源：ClickUp z8v0kmvhnc；配置目录 subscription.ai_action.diagnosis_visual_multi（maxInputTokens 28,800、maxImages 3）。
 * 测试层次：unit_real_data。
 */
describe('视觉诊断成本策略已冻结（待用户确认）', () => {
  test('配置目录中的成本策略为 confirmed 并带价目快照', () => {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(
          findProjectRoot(),
          'docs/backend-v2/architecture/configuration-variable-catalog.json'
        ),
        'utf8'
      )
    ) as { variables: { id: string; status: string; currentValue: unknown }[] }
    const item = catalog.variables.find(
      variable => variable.id === 'subscription.ai_action.diagnosis_visual_multi'
    )
    expect(item?.status).toBe('confirmed')
    expect(item?.currentValue).toMatchObject({ maxInputTokens: 28800, maxImages: 3 })
  })
})
