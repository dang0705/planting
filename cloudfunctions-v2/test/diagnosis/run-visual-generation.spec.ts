import { describe, expect, test } from 'vitest'

import { runVisualGeneration } from '../../src/diagnosis/application/run-visual-generation.js'
import {
  ModelProviderError,
  type VisualModelClient
} from '../../src/diagnosis/provider/visual-model-registry.js'
import {
  VISUAL_INPUT_BUDGET_CONSTANTS,
  assertVisualInputBudget,
  type VisualInputBudgetPolicy
} from '../../src/diagnosis/domain/visual-input-budget.js'
import { requirePolicy } from '../../src/foundation/policy/require-policy.js'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnc——安全门不通过时重试 1 次，仍不通过则失败关闭；不保存模型原文，只保存 SHA-256
 * 与结构化结果；输入预算守卫只从策略快照读取上限（costPolicy 待冻结，代码无默认），策略缺失时 503；
 * 超出预算明确拒绝（400 VALIDATION_FAILED），不静默裁剪；非植物、图片不可用时释放不扣点（diagnosis-visual-api/v1 §2.3）。
 * 测试层次：unit_fake。
 */
const validText = JSON.stringify({
  contractVersion: 'diagnosis-visual-gen-output/v1',
  classification: {
    isPlant: 'yes',
    usable: 'good',
    qualityIssues: [],
    overallStatus: 'problem_found',
    candidates: [
      { rank: 1, causeCode: 'pest_whitefly', certaintyBand: 'likely', directMarkerKeys: [] }
    ],
    severity: 'mild',
    urgency: 'soon',
    isolation: 'uncertain',
    edibleContext: 'unknown'
  },
  perImage: [{ imageIndex: 1, visiblePart: 'leaf_back', quality: 'good', noteZh: '清晰' }],
  titleZh: '白粉虱虫害',
  summaryZh: '较可能是白粉虱。',
  diagnosisTable: {
    problemTypeZh: '虫害',
    certaintyZh: '较可能',
    certaintyReasonZh: '看到虫体',
    mainEvidenceZh: '叶背白虫',
    urgencyZh: '尽快',
    isolationZh: '暂不确定，建议先单独放置观察'
  },
  identificationBasis: [{ aspectZh: '虫体', detailZh: '叶背白虫', imageIndex: 1 }],
  alternatives: [],
  immediateActions: [
    {
      stepNo: 1,
      titleZh: '隔离',
      detailZh: '搬开',
      causeCodes: ['pest_whitefly'],
      riskLevel: 'low',
      agentNames: []
    }
  ],
  ongoingCare: [],
  prevention: [],
  cautions: [],
  followUp: { recheckZh: '几天后复查', escalateZh: '不降时线下核验' },
  retakeRequests: [],
  followUpQuestions: []
})
const badText = validText
  .replace('"detailZh":"搬开"', '"detailZh":"苦参碱稀释 1000 倍"')
  .replace('"agentNames":[]}]', '"agentNames":["苦参碱"]}]')
const notPlantText = JSON.stringify({
  ...JSON.parse(validText),
  classification: {
    ...JSON.parse(validText).classification,
    isPlant: 'no',
    usable: 'unusable',
    overallStatus: 'not_plant',
    candidates: [],
    qualityIssues: ['not_plant']
  },
  perImage: [{ imageIndex: 1, visiblePart: 'unknown', quality: 'unusable', noteZh: '不是植物' }],
  identificationBasis: [],
  alternatives: [],
  immediateActions: []
})

function clientReturning(texts: string[]): VisualModelClient & { calls: number } {
  let index = 0
  const client = {
    calls: 0,
    async complete(modelCode: string) {
      client.calls += 1
      const text = texts[Math.min(index, texts.length - 1)] ?? ''
      index += 1
      return {
        text,
        modelCode,
        latencyMs: 1,
        usage: {
          promptTokens: 9000,
          completionTokens: 1500,
          cachedTokens: 0,
          cacheCreationTokens: 0
        }
      }
    }
  }
  return client
}

const baseInput = {
  modelOrder: ['qwen3.7-flash'],
  request: { prefixText: 'p', dynamicText: 'd', imageUrls: ['https://example.invalid/a.jpg'] },
  context: { edibleContext: 'unknown' as const, causeCatalog: ['pest_whitefly'] },
  maxModelLoops: 2
}

describe('视觉生成编排：安全门重试与失败关闭', () => {
  test('首次通过即完成，记录原文 SHA-256 而不保存原文', async () => {
    const client = clientReturning([validText])
    const outcome = await runVisualGeneration(client, baseInput)
    expect(outcome.status).toBe('completed')
    expect(client.calls).toBe(1)
    expect(outcome.rawTextSha256s).toHaveLength(1)
    expect(outcome.rawTextSha256s[0]).toMatch(/^[0-9a-f]{64}$/u)
    // 公开结果里的中文结论属于投影字段；这里检查的是「模型原文整段」与原文专有字段没有被保存。
    expect(JSON.stringify(outcome)).not.toContain(validText)
    expect(outcome).not.toHaveProperty('text')
    expect(JSON.stringify(outcome)).not.toContain('diagnosis-visual-gen-output/v1')
  })

  test('首次违规则重试 1 次，第二次通过即完成', async () => {
    const client = clientReturning([badText, validText])
    const outcome = await runVisualGeneration(client, baseInput)
    expect(outcome.status).toBe('completed')
    expect(client.calls).toBe(2)
  })

  test('两次都违规则失败关闭（safety_gate_rejected），不产生结果', async () => {
    const client = clientReturning([badText, badText])
    const outcome = await runVisualGeneration(client, baseInput)
    expect(outcome).toMatchObject({ status: 'failed', failureReason: 'safety_gate_rejected' })
    expect(client.calls).toBe(2)
    expect(outcome).not.toHaveProperty('result')
  })

  test('非植物时释放（不扣点），并给出脱敏图片评估', async () => {
    const outcome = await runVisualGeneration(clientReturning([notPlantText]), baseInput)
    expect(outcome).toMatchObject({
      status: 'released',
      releaseReason: 'not_plant',
      imageAssessment: { verdict: 'not_plant' }
    })
  })

  test('模型全部不可用时失败关闭（model_failed）', async () => {
    const client: VisualModelClient = {
      complete: () => Promise.reject(new ModelProviderError('free_tier_only', 403))
    }
    const outcome = await runVisualGeneration(client, baseInput)
    expect(outcome).toMatchObject({ status: 'failed', failureReason: 'model_failed' })
  })
})

describe('输入预算守卫', () => {
  const policy: VisualInputBudgetPolicy = { maxInputTokens: 28800, maxImages: 3 }

  test('预算常量与已冻结的图片输入合同一致', () => {
    const contract = JSON.parse(
      fs.readFileSync(
        path.join(
          findProjectRoot(),
          'docs/backend-v2/contracts/diagnosis-visual-image-input.v1.json'
        ),
        'utf8'
      )
    ) as Record<string, number>
    expect(VISUAL_INPUT_BUDGET_CONSTANTS).toEqual({
      prefixReserveTokens: contract.prefixReserveTokens,
      contextSummaryMaxTokens: contract.contextSummaryMaxTokens,
      userTextMaxTokens: contract.userTextMaxTokens,
      perImageMaxTokens: contract.perImageMaxTokens
    })
  })

  test('在预算内通过；超出预算或超过图片上限时明确拒绝（400），不静默裁剪', () => {
    expect(assertVisualInputBudget(policy, { imageCount: 3 })).toMatchObject({
      estimatedInputTokens: 8300 + 600 + 300 + 3 * 1026
    })
    expect(() =>
      assertVisualInputBudget({ ...policy, maxInputTokens: 10000 }, { imageCount: 3 })
    ).toThrow(expect.objectContaining({ status: 400, type: 'VALIDATION_FAILED' }))
    expect(() => assertVisualInputBudget(policy, { imageCount: 4 })).toThrow(
      expect.objectContaining({ status: 400, type: 'VALIDATION_FAILED' })
    )
  })

  test('成本策略缺失时返回 503（不回退代码默认值）', async () => {
    await expect(requirePolicy<VisualInputBudgetPolicy>(async () => null)).rejects.toMatchObject({
      status: 503,
      type: 'SERVICE_UNAVAILABLE'
    })
  })
})
