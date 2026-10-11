import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findBusinessPolicyDefinition } from '../../src/configuration/business-policies/index.js'
import { loadPolicyReleaseDocument } from '../../src/configuration/policy-release/release-document.js'
import { RUNTIME_PARAMETERS } from '../../src/configuration/runtime-parameters.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源（独立于实现）：
 * - 用户 2026-10-11 裁决（协调方转达）：兜底顺序 qwen3.7-flash → qwen3.7-flash-2026-07-15 → qwen3.6-plus →
 *   qwen3.6-plus-2026-04-02 → qwen3.5-plus-2026-04-20 → qwen3.5-plus-2026-02-15，关闭 thinking（ClickUp z8v0kmvhnb 已定裁决）；
 *   costPolicy 定稿：预占 23 点、上限 17,920 微元、输入 28,800、输出 4,000、最多 3 张图、最多 2 次调用、ceil(costMicros/800)；
 * - A2 结论：只要启用严格模式，system 必须是纯字符串；默认格式由实现方按评测证据决定（json_object，理由见策略发布文档）；
 * - 价目快照 docs/backend-v2/diagnosis-eval/*-price-snapshot-2026-10-10.json（元/百万 tokens 换算为微元/百万 tokens）。
 * 测试层次：unit_real_data（读取真实发布文档、配置目录与价目快照文件）。
 */
const root = findProjectRoot()
const readRepoFile = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')
const releaseFile =
  'cloudfunctions-v2/models/policy-releases/diagnosis.visual_generation.v1.release.json'
const definition = () => findBusinessPolicyDefinition('diagnosis', 'visual_generation')
const load = () => {
  const loaded = loadPolicyReleaseDocument(JSON.parse(readRepoFile(releaseFile)), readRepoFile)
  if (!loaded.ok) {
    throw new Error(`发布文档校验失败：${loaded.reason}`)
  }
  return loaded
}
const body = () => structuredClone(load().policy) as Record<string, any>
const resolve = (policy: unknown) => definition()!.resolve(policy, 'diagnosis-visual-generation/v1')

/** 价目快照：元/百万 tokens → 微元/百万 tokens（×1,000,000），倍率 → 基点（×10,000）。 */
function tariffFromSnapshot(file: string) {
  const snapshot = JSON.parse(readRepoFile(`docs/backend-v2/diagnosis-eval/${file}`)) as {
    inputCnyPerMillion: number
    outputCnyPerMillion: number
    cacheCreateMultiplier: number
    cacheHitMultiplier: number
  }
  return {
    inputMicrosPerMillionTokens: Math.round(snapshot.inputCnyPerMillion * 1_000_000),
    outputMicrosPerMillionTokens: Math.round(snapshot.outputCnyPerMillion * 1_000_000),
    cacheHitBasisPoints: Math.round(snapshot.cacheHitMultiplier * 10_000),
    cacheCreateBasisPoints: Math.round(snapshot.cacheCreateMultiplier * 10_000),
    priceSnapshotRef: `docs/backend-v2/diagnosis-eval/${file}`
  }
}

const expectedModelOrder = [
  'qwen3.7-flash',
  'qwen3.7-flash-2026-07-15',
  'qwen3.6-plus',
  'qwen3.6-plus-2026-04-02',
  'qwen3.5-plus-2026-04-20',
  'qwen3.5-plus-2026-02-15'
]

describe('diagnosis/visual_generation 策略发布文档（v1）', () => {
  it('策略类型已登记，发布文档可被解析', () => {
    expect(definition()).not.toBeNull()
    expect(resolve(load().policy)).not.toBeNull()
  })

  it('模型兜底顺序、关闭 thinking 与默认 json_object 格式符合裁决', () => {
    const policy = body()
    expect(policy.modelOrder).toEqual(expectedModelOrder)
    expect(policy.requestParams).toEqual({ enableThinking: false, responseFormat: 'json_object' })
  })

  it('成本策略与用户定稿一致', () => {
    expect(body().costPolicy).toEqual({
      capability: 'USER_DIAGNOSIS_VISUAL',
      costPolicyVersion: 'diagnosis-visual-cost/v1',
      maxInputTokens: 28_800,
      maxOutputTokens: 4_000,
      maxImages: 3,
      maxModelLoops: 2,
      maxCostMicros: 17_920,
      estimatedPoints: 23,
      microsPerPoint: 800,
      releaseWithoutCharge: ['not_plant', 'image_unusable', 'model_failed', 'safety_gate_rejected']
    })
  })

  it('每个兜底模型都有来自价目快照的价格', () => {
    const flash = tariffFromSnapshot('qwen3.7-flash-price-snapshot-2026-10-10.json')
    const plus36 = tariffFromSnapshot('qwen3.6-plus-price-snapshot-2026-10-10.json')
    const plus35 = tariffFromSnapshot('qwen3.5-plus-price-snapshot-2026-10-10.json')
    expect(body().tariffs).toEqual({
      'qwen3.7-flash': flash,
      'qwen3.7-flash-2026-07-15': flash,
      'qwen3.6-plus': plus36,
      'qwen3.6-plus-2026-04-02': plus36,
      'qwen3.5-plus-2026-04-20': plus35,
      'qwen3.5-plus-2026-02-15': plus35
    })
  })

  it('配置目录三项已冻结并指向本发布文档字段', () => {
    const catalog = JSON.parse(
      readRepoFile('docs/backend-v2/architecture/configuration-variable-catalog.json')
    ) as {
      variables: {
        id: string
        status: string
        currentValue: unknown
        policyRelease?: { field: string }
      }[]
    }
    const item = (id: string) => catalog.variables.find(variable => variable.id === id)
    expect(item('diagnosis.visual_gen.model_code')).toMatchObject({
      status: 'confirmed',
      currentValue: expectedModelOrder,
      policyRelease: { field: 'modelOrder' }
    })
    expect(item('diagnosis.visual_gen.request_params')).toMatchObject({
      status: 'confirmed',
      policyRelease: { field: 'requestParams' }
    })
    expect(item('subscription.ai_action.diagnosis_visual_multi')).toMatchObject({
      status: 'confirmed',
      policyRelease: { field: 'costPolicy' }
    })
  })

  it('代码层绝对边界与目录一致', () => {
    const catalog = JSON.parse(
      readRepoFile('docs/backend-v2/architecture/configuration-variable-catalog.json')
    ) as { variables: { id: string; currentValue: unknown }[] }
    expect(RUNTIME_PARAMETERS.policyBounds.diagnosisVisualGeneration.value).toEqual(
      catalog.variables.find(
        variable => variable.id === 'diagnosis.visual_generation.absolute_bounds'
      )?.currentValue
    )
  })
})

describe('diagnosis/visual_generation 越界或不一致时解析失败（不回退默认值）', () => {
  it.each([
    [
      '开启 thinking',
      (p: Record<string, any>) => {
        p.requestParams.enableThinking = true
      }
    ],
    [
      '未知格式模式',
      (p: Record<string, any>) => {
        p.requestParams.responseFormat = 'text'
      }
    ],
    [
      '模型顺序为空',
      (p: Record<string, any>) => {
        p.modelOrder = []
      }
    ],
    [
      '模型顺序重复',
      (p: Record<string, any>) => {
        p.modelOrder = ['qwen3.7-flash', 'qwen3.7-flash']
      }
    ],
    [
      '兜底模型缺价目',
      (p: Record<string, any>) => {
        delete p.tariffs['qwen3.6-plus']
      }
    ],
    [
      '图片超过 3 张硬上限',
      (p: Record<string, any>) => {
        p.costPolicy.maxImages = 4
      }
    ],
    [
      '调用次数超过上限',
      (p: Record<string, any>) => {
        p.costPolicy.maxModelLoops = 4
      }
    ],
    [
      '预占点数与上限成本不符',
      (p: Record<string, any>) => {
        p.costPolicy.estimatedPoints = 22
      }
    ],
    [
      '上限成本与首选模型价目不符',
      (p: Record<string, any>) => {
        p.costPolicy.maxCostMicros = 10_000
      }
    ],
    [
      '输入超过 32K 档',
      (p: Record<string, any>) => {
        p.costPolicy.maxInputTokens = 40_000
      }
    ],
    [
      '缺少提示词发布',
      (p: Record<string, any>) => {
        delete p.promptRelease
      }
    ],
    [
      '提示词摘要格式不合法',
      (p: Record<string, any>) => {
        p.promptRelease.promptReleaseSha256 = 'abc'
      }
    ],
    [
      '混入额外字段',
      (p: Record<string, any>) => {
        p.extra = 1
      }
    ]
  ])('%s', (_name, mutate) => {
    const policy = body()
    mutate(policy)
    expect(resolve(policy)).toBeNull()
  })

  it('严格模式格式值可被接受（启用时适配器负责纯字符串 system）', () => {
    const policy = body()
    policy.requestParams.responseFormat = 'json_schema_strict'
    expect(resolve(policy)).not.toBeNull()
  })
})
