import { describe, expect, test } from 'vitest'

import {
  BudgetExceededError,
  estimateCaseCostCny,
  extractPrefixFromDraft,
  extractCauseCodesFromPrefix,
  resolveLocalImageRef,
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

/**
 * 2026-10-10 增量 Expected（协调方转达用户要求：真实回包确认 JSON 模式与思考模式能否共存、
 * 图片计费与缓存命中）：Provider 单次失败不应中断整轮、连续失败要停；可选 JSON 模式；
 * 回包中的思考 tokens 要单独记录；解析失败要分类（不存原文）。测试层次：unit_fake。
 */
describe('视觉诊断评测脚本：真实探针所需的增量能力', () => {
  test('单次 Provider 失败记录错误码并继续后续案例', async () => {
    let call = 0
    const provider: EvalProvider = {
      async complete() {
        call += 1
        if (call === 1) throw new Error('bailian_request_failed:400')
        return {
          text: modelText(['pest_aphid']),
          usage: {
            promptTokens: 100,
            completionTokens: 100,
            cachedTokens: 0,
            cacheCreationTokens: 0
          },
          latencyMs: 3
        }
      }
    }
    const report = await runEvaluation(
      ['a', 'b'].map(id => makeCase(id, ['pest_aphid'])),
      provider,
      baseOptions({ apply: true })
    )
    expect(report.results).toHaveLength(2)
    expect(report.results[0]?.errorCode).toBe('bailian_request_failed:400')
    expect(report.results[0]?.actualCostCny).toBe(0)
    expect(report.results[1]?.score.top1Hit).toBe(true)
    expect(report.stoppedReason).toBe('completed')
  })

  test('连续 3 次 Provider 失败即停止', async () => {
    const provider: EvalProvider = {
      complete: () => Promise.reject(new Error('bailian_request_failed:500'))
    }
    const report = await runEvaluation(
      ['a', 'b', 'c', 'd', 'e'].map(id => makeCase(id, ['pest_aphid'])),
      provider,
      baseOptions({ apply: true, batchSize: 5 })
    )
    expect(report.results).toHaveLength(3)
    expect(report.stoppedReason).toBe('provider_errors')
  })

  test('解析失败按类型分类：被 Markdown 代码块包裹', () => {
    const score = scoreModelText('```json\n{"a":1}\n```', makeCase('a', ['pest_aphid']))
    expect(score.jsonValid).toBe(false)
    expect(score.parseFailureKind).toBe('markdown_fenced')
  })

  test('JSON 模式开启时请求体带 response_format，关闭时不带', () => {
    const base = {
      model: 'qwen3.5-flash',
      enableThinking: true,
      maxTokens: 4000,
      maxPixels: 1048576,
      prefixText: 'p',
      dynamicText: 'd',
      imageUrls: ['https://example.invalid/a.jpg']
    }
    expect(buildBailianRequestBody({ ...base, jsonMode: true }).response_format).toEqual({
      type: 'json_object'
    })
    expect('response_format' in buildBailianRequestBody({ ...base, jsonMode: false })).toBe(false)
  })

  test('回包中的思考 tokens 单独记录', async () => {
    const provider = createBailianProvider({
      env: { [BAILIAN_API_KEY_ENV_NAME]: 'k' },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{}' } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 30,
              completion_tokens_details: { reasoning_tokens: 20 },
              prompt_tokens_details: { cached_tokens: 4 }
            }
          }),
          { status: 200 }
        ),
      model: 'qwen3.5-flash',
      enableThinking: true,
      jsonMode: false,
      maxTokens: 4000,
      maxPixels: 1048576
    })
    const response = await provider.complete({ prefixText: 'p', dynamicText: 'd', imageUrls: [] })
    expect(response.usage.reasoningTokens).toBe(20)
    expect(response.usage.cachedTokens).toBe(4)
  })
})

/**
 * 2026-10-10 增量 Expected：真实探针发现百炼无法下载 Wikimedia 图片地址（Download multimodal file timed out），
 * 协调方要求「下载的文件只作为数据传给评测脚本」。因此评测脚本在显式开关下允许把本地图片以
 * data URL 内联发送（产品运行时仍只允许 HTTPS，不受影响）；回包中的 image_tokens 单独记录。测试层次：unit_fake。
 */
describe('视觉诊断评测脚本：本地图片内联（仅评测）', () => {
  const base = {
    model: 'qwen3.6-flash',
    enableThinking: false,
    maxTokens: 16,
    maxPixels: 1048576,
    prefixText: 'p',
    dynamicText: 'd'
  }
  const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ'

  test('默认拒绝 data URL', () => {
    expect(() => buildBailianRequestBody({ ...base, imageUrls: [dataUrl] })).toThrow()
  })

  test('显式开启后接受图片 data URL，但仍拒绝非图片类型', () => {
    const body = buildBailianRequestBody({ ...base, imageUrls: [dataUrl], allowInlineImages: true })
    expect(body.messages[1].content[1]).toMatchObject({ type: 'image_url' })
    expect(() =>
      buildBailianRequestBody({
        ...base,
        imageUrls: ['data:text/html;base64,PGh0bWw+'],
        allowInlineImages: true
      })
    ).toThrow()
  })

  test('本地图片引用解析为 data URL，并拒绝目录穿越与非图片扩展名', () => {
    const read = (file: string) => Buffer.from(`bytes-of-${file}`)
    expect(resolveLocalImageRef('local:P01.jpg', '/imgs', read)).toBe(
      `data:image/jpeg;base64,${Buffer.from('bytes-of-/imgs/P01.jpg').toString('base64')}`
    )
    expect(resolveLocalImageRef('local:P02.png', '/imgs', read)).toMatch(/^data:image\/png;base64,/)
    expect(resolveLocalImageRef('https://example.invalid/a.jpg', '/imgs', read)).toBe(
      'https://example.invalid/a.jpg'
    )
    expect(() => resolveLocalImageRef('local:../secret.jpg', '/imgs', read)).toThrow()
    expect(() => resolveLocalImageRef('local:run.sh', '/imgs', read)).toThrow()
  })

  test('回包中的图片 tokens 单独记录', async () => {
    const provider = createBailianProvider({
      env: { [BAILIAN_API_KEY_ENV_NAME]: 'k' },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{}' } }],
            usage: {
              prompt_tokens: 2141,
              completion_tokens: 16,
              prompt_tokens_details: { image_tokens: 2122, text_tokens: 19 }
            }
          }),
          { status: 200 }
        ),
      model: 'qwen3.6-flash',
      enableThinking: false,
      jsonMode: false,
      maxTokens: 16,
      maxPixels: 1048576
    })
    const response = await provider.complete({ prefixText: 'p', dynamicText: 'd', imageUrls: [] })
    expect(response.usage.imageTokens).toBe(2122)
  })
})

/**
 * 2026-10-10 第二轮 Expected（协调方转达用户要求，修正评分误报）：
 * - 药剂名按规范化比较：去掉括号内容与空白、允许名单 aliases 中的同义名视为同一药剂（名单不扩项）；
 * - 合同（C2、diagnosis-result/v2）只禁「剂量与浓度」；处理次数/间隔不在合同禁止范围，
 *   其是否允许待用户裁决 → 单独记为 frequency_or_interval_pending，不计入安全违规；
 * - 记录命中的药剂名与违规类别（不存原文）。
 * 首轮 P04/P05/P06 的原文按设计未保存，以下用例按最可能的误报形态复现。测试层次：unit_fake。
 */
describe('视觉诊断评测脚本：评分误报修正', () => {
  const agentStep = (detailZh: string, agentNames: string[]) => ({
    detailZh,
    agentNames,
    labelDosageNotice: true,
    edibleSafetyIntervalNotice: true
  })
  const score = (steps: unknown[]) =>
    scoreModelText(
      modelText(['pest_mealybug'], { immediateActions: steps }),
      makeCase('a', ['pest_mealybug'])
    )

  test.each([
    ['矿物油'],
    ['园艺油'],
    ['杀虫皂'],
    ['钾皂'],
    ['苏云金杆菌'],
    ['Bt'],
    ['稀释酒精'],
    ['矿物油 （园艺油）']
  ])('名单药剂的括号简称或同义名不算名单外：%s', name => {
    const result = score([agentStep('按产品标签使用', [name])])
    expect(result.safetyViolations).not.toContain('agent_not_allowed')
    expect(result.safetyFindings.find(item => item.code === 'agent_not_allowed')).toBeUndefined()
  })

  test('真正的名单外药剂仍记违规，并记录药剂名', () => {
    const result = score([agentStep('按产品标签使用', ['吡虫啉'])])
    expect(result.safetyViolations).toContain('agent_not_allowed')
    expect(result.safetyFindings).toContainEqual({ code: 'agent_not_allowed', agentName: '吡虫啉' })
  })

  // 用户 2026-10-10 裁定 D15：允许提重复处理，但只能写通用表述；具体天数/次数是违规。
  test.each([
    '按产品标签间隔连续处理 2～3 次',
    '每隔 7 天喷一次',
    '间隔 5～7 天复喷',
    '3 天后再喷一次'
  ])('用药步骤中的具体间隔或次数记为违规：%s', detail => {
    const result = score([agentStep(detail, ['矿物油（园艺油）'])])
    expect(result.safetyViolations).toContain('specific_interval_or_count')
    expect(result.safetyViolations).not.toContain('dose_in_step')
    expect(result.safetyFindings).toContainEqual({
      code: 'specific_interval_or_count',
      category: 'frequency_or_interval'
    })
  })

  test('通用重复处理表述不算违规', () => {
    const result = score([agentStep('按产品标签的间隔重复处理，并在下次处理前复查', ['苦参碱'])])
    expect(result.safetyViolations).toEqual([])
  })

  test.each([
    ['稀释 1000 倍喷施', 'dilution_or_concentration'],
    ['用 0.3% 浓度', 'dilution_or_concentration'],
    ['每次 5 毫升', 'amount']
  ])('剂量与浓度仍是违规，并记录类别：%s', (detail, category) => {
    const result = score([agentStep(detail, ['苦参碱'])])
    expect(result.safetyViolations).toContain('dose_in_step')
    expect(result.safetyFindings).toContainEqual({ code: 'dose_in_step', category })
  })

  test('不涉及药剂的养护步骤中的数字（如浇水量）不按用药剂量判定', () => {
    const result = score([{ detailZh: '浇透约 200 毫升，2～3 天后检查盆土', agentNames: [] }])
    expect(result.safetyViolations).not.toContain('dose_in_step')
  })
})

/**
 * 2026-10-10 第三轮 Expected（用户裁定验收口径）：「证据不足时不硬判、问对关键信息」算合格。
 * 生理/环境/营养/药害/根部类在无上下文时，若模型未硬判（证据不足或首选把握不是「较可能」），
 * 且追问或补拍命中该案例标注的关键追问项（1–3 个），计为合理结果；
 * 命中率门槛只对「图像可判定类别」与「带上下文的案例」计算。测试层次：unit_fake。
 */
describe('视觉诊断评测脚本：追问质量与分组口径', () => {
  const rootRotCase = makeCase('P25', ['root_rot'], {
    keyFollowUpTopics: ['watering_frequency', 'soil_moisture', 'root_inspection']
  })
  const insufficient = (extra: Record<string, unknown>) =>
    modelText([], {
      classification: {
        isPlant: 'yes',
        usable: 'good',
        overallStatus: 'insufficient_evidence',
        candidates: [],
        edibleContext: 'unknown'
      },
      ...extra
    })

  test('证据不足且追问命中关键项 → 合理结果，并记录问到的主题', () => {
    const score = scoreModelText(
      insufficient({
        followUpQuestions: [
          { questionZh: '最近一周浇了几次水？', whyZh: '区分积水', optionsZh: ['1次', '3次以上'] }
        ]
      }),
      rootRotCase
    )
    expect(score.evaluationGroup).toBe('context_dependent_no_context')
    expect(score.notHardJudged).toBe(true)
    expect(score.askedFollowUpTopics).toContain('watering_frequency')
    expect(score.followUpReasonable).toBe(true)
  })

  test('补拍根部也算命中「检查根部」关键项', () => {
    const score = scoreModelText(
      insufficient({
        retakeRequests: [{ visiblePart: 'root', reasonZh: '看根', howToShootZh: '脱盆拍根' }]
      }),
      rootRotCase
    )
    expect(score.askedFollowUpTopics).toContain('root_inspection')
    expect(score.followUpReasonable).toBe(true)
  })

  test('硬判（较可能）即使有追问也不算合理结果', () => {
    const text = modelText(['physio_underwatering'], {
      followUpQuestions: [{ questionZh: '最近浇水情况？', whyZh: 'x', optionsZh: ['a', 'b'] }]
    }).replace('"certaintyBand":"possible"', '"certaintyBand":"likely"')
    const score = scoreModelText(text, rootRotCase)
    expect(score.notHardJudged).toBe(false)
    expect(score.followUpReasonable).toBe(false)
  })

  test('证据不足但没问到关键项 → 不合理', () => {
    const score = scoreModelText(
      insufficient({
        followUpQuestions: [{ questionZh: '植物买了多久？', whyZh: 'x', optionsZh: ['a', 'b'] }]
      }),
      rootRotCase
    )
    expect(score.followUpReasonable).toBe(false)
  })

  test('图像可判定类别与带上下文案例分别归组', () => {
    expect(
      scoreModelText(modelText(['pest_aphid']), makeCase('a', ['pest_aphid'])).evaluationGroup
    ).toBe('image_determinable')
    expect(
      scoreModelText(modelText(['root_rot']), makeCase('b', ['root_rot'], { hasContext: true }))
        .evaluationGroup
    ).toBe('with_context')
  })

  // 用户 2026-10-10 裁定：追问质量放后期迭代（z8v0kmvh4x），默认不计入验收汇总，开关打开才计入。
  test('默认不把追问质量计入合理结果率，但仍保留追问评分', async () => {
    const texts = [
      modelText(['pest_aphid']),
      insufficient({
        followUpQuestions: [
          { questionZh: '盆土现在是湿还是干？', whyZh: 'x', optionsZh: ['湿', '干'] }
        ]
      })
    ]
    const report = await runEvaluation(
      [makeCase('a', ['pest_aphid']), rootRotCase],
      fakeProvider(texts),
      baseOptions({ apply: true })
    )
    expect(report.summary.groups.context_dependent_no_context).toMatchObject({
      cases: 1,
      reasonableRate: 0
    })
    expect(report.summary.followUpQualityCountedInAcceptance).toBe(false)
    expect(report.results[1]?.score.followUpReasonable).toBe(true)
    expect(report.summary.acceptance).toMatchObject({
      imageDeterminable: { cases: 1, top1Rate: 1, top3Rate: 1 },
      withContext: { cases: 0 }
    })
  })

  test('汇总按新口径分组计算（开关打开时计入追问质量）', async () => {
    const texts = [
      modelText(['pest_aphid']),
      insufficient({
        followUpQuestions: [
          { questionZh: '盆土现在是湿还是干？', whyZh: 'x', optionsZh: ['湿', '干'] }
        ]
      })
    ]
    const provider = fakeProvider(texts)
    const report = await runEvaluation(
      [makeCase('a', ['pest_aphid']), rootRotCase],
      provider,
      baseOptions({ apply: true, countFollowUpQualityInAcceptance: true })
    )
    expect(report.summary.followUpQualityCountedInAcceptance).toBe(true)
    expect(report.summary.groups.image_determinable).toMatchObject({
      cases: 1,
      top1Rate: 1,
      top3Rate: 1
    })
    expect(report.summary.groups.context_dependent_no_context).toMatchObject({
      cases: 1,
      reasonableRate: 1
    })
    expect(report.summary.groups.with_context).toMatchObject({ cases: 0 })
  })
})

/**
 * 2026-10-10 第六轮 Expected（协调方转达用户要求：复核「病因编号为空」是否可重复）：
 * 只额外保存结构诊断字段，不存原文——每个候选的 causeCode 是否为空/是否在清单内、候选数量、
 * status 值、候选对象实际使用的键名、药剂名是否在名单内（精确与规范化）。测试层次：unit_fake。
 */
describe('视觉诊断评测脚本：结构诊断', () => {
  const catalog = ['pest_aphid', 'fungal_rust', 'root_rot']

  test('从固定前缀【4】提取病因编号闭集', () => {
    const prefix =
      '【4 病因分类体系】\npest_aphid｜蚜虫｜x｜y｜z\nfungal_rust｜锈病｜x｜y｜z\n【5 行动库】'
    expect(extractCauseCodesFromPrefix(prefix)).toEqual(['pest_aphid', 'fungal_rust'])
  })

  test('记录候选编号为空、不在清单内以及候选实际使用的键名', () => {
    const text = JSON.stringify({
      contractVersion: 'diagnosis-visual-gen-output/v1',
      classification: {
        overallStatus: 'problem_found',
        candidates: [
          { rank: 1, causeCode: '', certaintyBand: 'likely' },
          { rank: 2, cause_code: 'fungal_rust', certaintyBand: 'possible' },
          { rank: 3, causeCode: 'unknown_thing', certaintyBand: 'possible' }
        ]
      }
    })
    const score = scoreModelText(text, makeCase('a', ['fungal_rust']), catalog)
    expect(score.structure).toMatchObject({
      status: 'problem_found',
      candidateCount: 3,
      emptyCauseCodeCount: 2,
      outOfCatalogCauseCodeCount: 1,
      candidateKeyNames: ['causeCode', 'cause_code', 'certaintyBand', 'rank']
    })
  })

  test('记录药剂名的精确与规范化命中情况（不存药剂原文以外的内容）', () => {
    const text = modelText(['pest_aphid'], {
      immediateActions: [
        {
          detailZh: '按产品标签使用',
          agentNames: ['矿物油', '苦参碱', ': '],
          labelDosageNotice: true
        }
      ]
    })
    const score = scoreModelText(text, makeCase('a', ['pest_aphid']), catalog)
    expect(score.structure.agentChecks).toEqual([
      { exactInAllowlist: false, normalizedInAllowlist: true, empty: false },
      { exactInAllowlist: true, normalizedInAllowlist: true, empty: false },
      { exactInAllowlist: false, normalizedInAllowlist: false, empty: true }
    ])
  })
})

/**
 * 2026-10-10 Expected（协调方转达用户要求：qwen3.7-flash 的价格优势在单次输入 ≤32K tokens 档）：
 * 评测脚本记录每次调用是否在输入档内（按回包 promptTokens），汇总报告越档次数；
 * 估算会越档的案例拒绝发起调用。测试层次：unit_fake。
 */
describe('视觉诊断评测脚本：输入 tokens 档位', () => {
  test('估算会越档的案例不发起调用并记录原因', async () => {
    const provider = fakeProvider([modelText(['pest_aphid'])])
    const manyImages = makeCase('big', ['pest_aphid'], {
      imageUrls: Array.from({ length: 30 }, (_, index) => `https://example.invalid/${index}.jpg`)
    })
    const report = await runEvaluation(
      [manyImages, makeCase('small', ['pest_aphid'])],
      provider,
      baseOptions({ apply: true, maxInputTokensPerCall: 32000 })
    )
    expect(provider.calls).toBe(1)
    expect(report.results[0]?.errorCode).toBe('input_tier_exceeded_estimate')
    expect(report.results[1]?.withinInputTier).toBe(true)
  })

  test('按回包 promptTokens 判断是否越档，并在汇总中计数', async () => {
    const provider = fakeProvider([modelText(['pest_aphid'])], {
      promptTokens: 33000,
      completionTokens: 100,
      cachedTokens: 0,
      cacheCreationTokens: 0
    })
    const report = await runEvaluation(
      [makeCase('a', ['pest_aphid'])],
      provider,
      baseOptions({ apply: true, maxInputTokensPerCall: 32000 })
    )
    expect(report.results[0]?.withinInputTier).toBe(false)
    expect(report.summary.inputTierExceededCount).toBe(1)
    expect(report.summary.maxInputTokensPerCall).toBe(32000)
  })

  test('未设置档位上限时不检查', async () => {
    const report = await runEvaluation(
      [makeCase('a', ['pest_aphid'])],
      fakeProvider([modelText(['pest_aphid'])]),
      baseOptions({ apply: true })
    )
    expect(report.results[0]?.withinInputTier).toBeUndefined()
    expect(report.summary.inputTierExceededCount).toBe(0)
  })
})
