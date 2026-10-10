import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-11 裁决（协调方转达）——
 * costPolicy 定稿：预占 23 点，上限 17,920 微元，输入 28,800、输出 4,000，图片最多 3 张，调用最多 2 次，
 * 结算公式 ceil(costMicros/800)，失败和非植物不扣点，单图与多图算同一次诊断；
 * provider_total_deadline_ms = 60000、provider_max_attempts = 2，两项改为 confirmed。
 * 结算公式 ceil(costMicros/800) 在策略中以 microsPerPoint = 800 表达（2026-10-11 写入 diagnosis/visual_generation 策略发布时改用整数字段）。
 * 测试层次：unit_real_data（读取仓库内配置目录机器事实源）。
 * RED 证据：2026-10-11 以同名 .red.spec.ts 落盘，裁决写入前全部失败；改动后转绿，并入默认套件。
 */
interface CatalogVariable {
  /** 配置变量唯一编号，例如 diagnosis.visual.max_images。 */
  id: string
  /** 冻结状态：confirmed、pending 或 hard_rule。 */
  status: string
  /** 当前生效值；pending 时为占位字符串。 */
  currentValue: unknown
}

const catalog = JSON.parse(
  fs.readFileSync(
    path.join(
      findProjectRoot(),
      'docs/backend-v2/architecture/configuration-variable-catalog.json'
    ),
    'utf8'
  )
) as { variables: CatalogVariable[] }

function variable(id: string): CatalogVariable | undefined {
  return catalog.variables.find(item => item.id === id)
}

describe('视觉诊断成本策略与 Provider 运行参数已冻结', () => {
  test('多图视觉诊断成本策略为 confirmed，数值与用户裁决一致', () => {
    const item = variable('subscription.ai_action.diagnosis_visual_multi')
    expect(item?.status).toBe('confirmed')
    expect(item?.currentValue).toMatchObject({
      capability: 'USER_DIAGNOSIS_VISUAL',
      maxInputTokens: 28800,
      maxOutputTokens: 4000,
      maxImages: 3,
      maxModelLoops: 2,
      maxCostMicros: 17920,
      estimatedPoints: 23,
      microsPerPoint: 800
    })
    expect((item?.currentValue as { releaseWithoutCharge: string[] }).releaseWithoutCharge).toEqual(
      expect.arrayContaining([
        'not_plant',
        'image_unusable',
        'model_failed',
        'safety_gate_rejected'
      ])
    )
  })

  test('单图与多图算同一次诊断：单图动作并入多图策略，不再单独计价', () => {
    const item = variable('subscription.ai_action.diagnosis_visual_single')
    expect(item?.status).toBe('confirmed')
    expect(item?.currentValue).toMatchObject({
      mergedInto: 'subscription.ai_action.diagnosis_visual_multi'
    })
  })

  test.each([
    ['diagnosis.visual_gen.provider_total_deadline_ms', 60000],
    ['diagnosis.visual_gen.provider_max_attempts', 2]
  ])('%s 为 confirmed，值为 %s', (id, value) => {
    expect(variable(id)).toMatchObject({ status: 'confirmed', currentValue: value })
  })
})
