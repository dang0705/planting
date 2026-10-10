import { describe, expect, test } from 'vitest'

import {
  BudgetExceededError,
  estimateCaseCostCny,
  extractPrefixFromDraft,
  runEvaluation,
  scoreModelText,
  type EvalCase,
  type EvalProvider,
  type PriceSnapshot,
  type ProviderResponse,
  type RunOptions
} from '../../scripts/visual-diagnosis-eval/eval-core.js'
import {
  buildBailianRequestBody,
  createBailianProvider,
  BAILIAN_API_KEY_ENV_NAME
} from '../../scripts/visual-diagnosis-eval/bailian-provider.js'

/**
 * Expected 来源：用户 2026-10-10 对评测跑分脚本的要求（经协调方转达）——
 * 默认 dry-run 只估算 token 与费用；加 --apply 才调用；每批开跑前打印预算估算；
 * 累计到 40 元强制停；结果只保存结构化评分与 usage，不保存模型原文；
 * 读环境变量里的百炼 Key 变量名，不打印值。价格取 docs/backend-v2/diagnosis-eval 的官方价目快照。
 * 测试层次：unit_fake（假 Provider / 假 fetch，不发网络请求、不调用付费模型）。
 * 未覆盖：真实百炼回包形态、真实缓存命中、命令行参数解析与文件写入。
 */

/** 2026-10-10 官方价目快照（北京，≤128K 档）。 */
const price: PriceSnapshot = {
  snapshotId: 'qwen3.5-flash-cn-beijing-2026-10-10',
  inputCnyPerMillion: 0.2,
  outputCnyPerMillion: 2,
  cacheCreateMultiplier: 1.25,
  cacheHitMultiplier: 0.1
}

function makeCase(id: string, expected: string[], extra: Partial<EvalCase> = {}): EvalCase {
  return {
    caseId: id,
    imageUrls: ['https://example.invalid/a.jpg'],
    expectedCauseCodes: expected,
    expectedStatus: 'problem_found',
    edibleContext: 'no',
    dynamicContextText: '【11 本次任务】测试',
    ...extra
  }
}

/** 模型原文中带一段唯一标记，用来证明原文不会进入结果。 */
const secretMarker = 'RAW_MODEL_TEXT_MARKER_9f3a'

function modelText(causeCodes: string[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    contractVersion: 'diagnosis-visual-gen-output/v1',
    classification: {
      isPlant: 'yes',
      usable: 'good',
      qualityIssues: [],
      overallStatus: causeCodes.length ? 'problem_found' : 'insufficient_evidence',
      candidates: causeCodes.map((causeCode, index) => ({
        rank: index + 1,
        causeCode,
        certaintyBand: 'possible',
        directMarkerKeys: []
      })),
      severity: 'mild',
      urgency: 'soon',
      isolation: 'uncertain',
      edibleContext: 'no'
    },
    titleZh: secretMarker,
    summaryZh: '可能是问题',
    diagnosisTable: { certaintyReasonZh: '证据一般' },
    immediateActions: [],
    ongoingCare: [],
    ...extra
  })
}

function fakeProvider(
  texts: string[],
  usage: ProviderResponse['usage'] = {
    promptTokens: 11752,
    completionTokens: 3000,
    cachedTokens: 0,
    cacheCreationTokens: 0
  }
): EvalProvider & { calls: number } {
  let index = 0
  const provider = {
    calls: 0,
    async complete(): Promise<ProviderResponse> {
      provider.calls += 1
      const text = texts[index] ?? texts[texts.length - 1] ?? '{}'
      index += 1
      return { text, usage, latencyMs: 5 }
    }
  }
  return provider
}

function baseOptions(patch: Partial<RunOptions> = {}): RunOptions {
  return {
    apply: false,
    budgetCapCny: 50,
    hardStopCny: 40,
    batchSize: 2,
    price,
    estimate: {
      prefixTokens: 9000,
      dynamicTextTokens: 700,
      tokensPerImage: 1026,
      outputTokens: 3000
    },
    prefixText: '固定前缀',
    log: () => undefined,
    ...patch
  }
}

describe('视觉诊断评测脚本：费用估算', () => {
  // Expected：规划 §7.1 的 2 图不命中 ≈0.0084 元（由官方单价独立复算）。
  test('按官方单价估算单案例不命中费用', () => {
    const cost = estimateCaseCostCny(
      { prefixTokens: 9000, dynamicTextTokens: 700, tokensPerImage: 1026, outputTokens: 3000 },
      2,
      price
    )
    expect(cost).toBeCloseTo((9000 + 700 + 2052) * 0.2e-6 + 3000 * 2e-6, 8)
  })
})

describe('视觉诊断评测脚本：dry-run 与 --apply', () => {
  // Expected：默认 dry-run 不调用 Provider，只给出估算。
  test('默认 dry-run 不调用 Provider', async () => {
    const provider = fakeProvider([modelText(['pest_aphid'])])
    const report = await runEvaluation([makeCase('c1', ['pest_aphid'])], provider, baseOptions())
    expect(provider.calls).toBe(0)
    expect(report.mode).toBe('dry_run')
    expect(report.estimatedTotalCny).toBeGreaterThan(0)
    expect(report.results).toHaveLength(0)
  })

  // Expected：只有 apply=true 才真正调用。
  test('apply 时逐案调用并记录评分与 usage', async () => {
    const provider = fakeProvider([modelText(['pest_aphid', 'pest_whitefly'])])
    const report = await runEvaluation(
      [makeCase('c1', ['pest_whitefly'])],
      provider,
      baseOptions({ apply: true })
    )
    expect(provider.calls).toBe(1)
    const [result] = report.results
    expect(result?.score.top1Hit).toBe(false)
    expect(result?.score.top3Hit).toBe(true)
    expect(result?.usage.promptTokens).toBe(11752)
    expect(result?.actualCostCny).toBeGreaterThan(0)
  })

  // Expected：每批开跑前打印预算估算（批次估算、累计、上限）。
  test('每批开跑前输出预算估算', async () => {
    const lines: string[] = []
    const provider = fakeProvider([modelText(['pest_aphid'])])
    const cases = ['a', 'b', 'c'].map(id => makeCase(id, ['pest_aphid']))
    await runEvaluation(
      cases,
      provider,
      baseOptions({ apply: true, log: line => lines.push(line) })
    )
    const batchLines = lines.filter(line => line.includes('批次预算'))
    expect(batchLines).toHaveLength(2)
    expect(batchLines[0]).toContain('累计')
    expect(batchLines[0]).toContain('40')
  })
})

describe('视觉诊断评测脚本：40 元强制停', () => {
  // Expected：累计实际费用达到强制停止线后不再发起调用。
  test('累计达到强制停止线后停止并报告', async () => {
    // 每次调用 1,000 万输出 tokens = 20 元，两次即达到 40 元。
    const provider = fakeProvider([modelText(['pest_aphid'])], {
      promptTokens: 0,
      completionTokens: 10_000_000,
      cachedTokens: 0,
      cacheCreationTokens: 0
    })
    const cases = ['a', 'b', 'c', 'd'].map(id => makeCase(id, ['pest_aphid']))
    const report = await runEvaluation(cases, provider, baseOptions({ apply: true, batchSize: 4 }))
    expect(provider.calls).toBe(2)
    expect(report.stoppedReason).toBe('hard_stop_reached')
    expect(report.cumulativeCostCny).toBeGreaterThanOrEqual(40)
  })

  // Expected：下一次调用的保守估算会越过强制停止线时，不发起该调用。
  test('下一次保守估算会越线时不发起调用', async () => {
    const provider = fakeProvider([modelText(['pest_aphid'])])
    const report = await runEvaluation(
      [makeCase('a', ['pest_aphid'])],
      provider,
      baseOptions({ apply: true, hardStopCny: 0.001 })
    )
    expect(provider.calls).toBe(0)
    expect(report.stoppedReason).toBe('hard_stop_reached')
  })

  // Reverse：强制停止线不能高于预算上限。
  test('强制停止线高于预算上限时拒绝运行', async () => {
    const provider = fakeProvider([modelText(['pest_aphid'])])
    await expect(
      runEvaluation([makeCase('a', [])], provider, baseOptions({ hardStopCny: 60 }))
    ).rejects.toBeInstanceOf(BudgetExceededError)
  })

  // Reverse：dry-run 总估算超过预算上限时直接拒绝，提示缩小批次。
  test('估算总费用超出预算上限时拒绝 apply', async () => {
    const provider = fakeProvider([modelText(['pest_aphid'])])
    await expect(
      runEvaluation(
        [makeCase('a', [])],
        provider,
        baseOptions({ apply: true, budgetCapCny: 0.001, hardStopCny: 0.001 })
      )
    ).rejects.toBeInstanceOf(BudgetExceededError)
    expect(provider.calls).toBe(0)
  })
})

describe('视觉诊断评测脚本：结果不含模型原文', () => {
  // Expected：结果只保存结构化评分与 usage，不保存模型原文（可保存其 SHA-256）。
  test('序列化后的报告不含模型原文片段', async () => {
    const provider = fakeProvider([modelText(['pest_aphid'])])
    const report = await runEvaluation(
      [makeCase('a', ['pest_aphid'])],
      provider,
      baseOptions({ apply: true })
    )
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(secretMarker)
    expect(report.results[0]?.rawTextSha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('视觉诊断评测脚本：评分与安全违规', () => {
  test('无法解析的 JSON 记为不合法且不抛错', () => {
    const score = scoreModelText('not json', makeCase('a', ['pest_aphid']))
    expect(score.jsonValid).toBe(false)
    expect(score.top1Hit).toBe(false)
  })

  test('期望 not_plant 时以总体状态判定命中', () => {
    const text = modelText([], {
      classification: {
        isPlant: 'no',
        usable: 'unusable',
        overallStatus: 'not_plant',
        candidates: [],
        edibleContext: 'no'
      }
    })
    const score = scoreModelText(text, makeCase('cat', [], { expectedStatus: 'not_plant' }))
    expect(score.statusHit).toBe(true)
    expect(score.top1Hit).toBe(true)
  })

  test.each([
    [
      '剂量',
      {
        immediateActions: [
          { detailZh: '稀释1000倍喷施', agentNames: ['苦参碱'], labelDosageNotice: true }
        ]
      },
      'dose_in_step'
    ],
    ['百分比把握', { diagnosisTable: { certaintyReasonZh: '约95%' } }, 'numeric_certainty'],
    [
      '名单外药剂',
      { immediateActions: [{ detailZh: '喷施', agentNames: ['克百威'], labelDosageNotice: true }] },
      'agent_not_allowed'
    ],
    [
      '缺按标签提示',
      { immediateActions: [{ detailZh: '喷施苦参碱', agentNames: ['苦参碱'] }] },
      'missing_label_notice'
    ]
  ])('识别安全违规：%s', (_name, extra, code) => {
    const score = scoreModelText(modelText(['pest_aphid'], extra), makeCase('a', ['pest_aphid']))
    expect(score.safetyViolations).toContain(code)
  })

  test('可食用背景下用药缺安全间隔期提示记为违规', () => {
    const text = modelText(['pest_aphid'], {
      immediateActions: [
        { detailZh: '喷施苦参碱', agentNames: ['苦参碱'], labelDosageNotice: true }
      ]
    })
    const score = scoreModelText(text, makeCase('a', ['pest_aphid'], { edibleContext: 'yes' }))
    expect(score.safetyViolations).toContain('missing_edible_interval_notice')
  })
})

describe('视觉诊断评测脚本：百炼 Provider', () => {
  // Expected：只读环境变量名，缺失时报错只提变量名，不打印任何值。
  test('缺少 Key 时报错只包含变量名', () => {
    expect(() => createBailianProvider({ env: {}, fetchImpl: fetch })).toThrow(
      BAILIAN_API_KEY_ENV_NAME
    )
  })

  test('请求失败的错误信息不含 Key 值', async () => {
    const secret = 'sk-test-secret-should-not-leak'
    const provider = createBailianProvider({
      env: { [BAILIAN_API_KEY_ENV_NAME]: secret },
      fetchImpl: async () => new Response('bad', { status: 500 }),
      model: 'qwen3.5-flash',
      enableThinking: false,
      maxTokens: 4000,
      maxPixels: 1048576
    })
    const error = await provider
      .complete({ prefixText: 'p', dynamicText: 'd', imageUrls: ['https://example.invalid/a.jpg'] })
      .catch((caught: unknown) => caught)
    expect(String((error as Error).message)).not.toContain(secret)
  })

  // Expected：显式缓存合同——system 单块挂唯一 cache_control，先文本后图片，enable_thinking 显式给出。
  test('请求体符合百炼显式缓存与先文本后图片约定', () => {
    const body = buildBailianRequestBody({
      model: 'qwen3.5-flash',
      enableThinking: false,
      maxTokens: 4000,
      maxPixels: 1048576,
      prefixText: '固定前缀',
      dynamicText: '本次任务',
      imageUrls: ['https://example.invalid/a.jpg', 'https://example.invalid/b.jpg']
    })
    const [system, user] = body.messages
    expect(body.messages).toHaveLength(2)
    expect(system?.content).toEqual([
      { type: 'text', text: '固定前缀', cache_control: { type: 'ephemeral' } }
    ])
    expect(user?.content[0]).toEqual({ type: 'text', text: '本次任务' })
    expect(user?.content.slice(1).every(item => item.type === 'image_url')).toBe(true)
    expect(body.enable_thinking).toBe(false)
  })

  // Reverse：非 HTTPS 图片地址（含 Base64）拒绝。
  test('拒绝非 HTTPS 图片地址', () => {
    expect(() =>
      buildBailianRequestBody({
        model: 'qwen3.5-flash',
        enableThinking: false,
        maxTokens: 4000,
        maxPixels: 1048576,
        prefixText: 'p',
        dynamicText: 'd',
        imageUrls: ['data:image/png;base64,AAAA']
      })
    ).toThrow()
  })
})

describe('视觉诊断评测脚本：前缀提取', () => {
  test('只提取草案中两条分隔线之间的正文', () => {
    const draft = '说明\n=====PREFIX BEGIN=====\n正文A\n正文B\n=====PREFIX END=====\n尾注'
    expect(extractPrefixFromDraft(draft)).toBe('正文A\n正文B\n')
  })
})
