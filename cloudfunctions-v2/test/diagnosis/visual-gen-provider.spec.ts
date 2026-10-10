import { describe, expect, test } from 'vitest'

import {
  ModelProviderError,
  callVisualModelWithFallback,
  type VisualModelClient,
  type VisualModelRequest
} from '../../src/diagnosis/provider/visual-model-registry.js'
import {
  buildBailianVisualRequestBody,
  classifyBailianFailure,
  createBailianVisualModelClient
} from '../../src/diagnosis/provider/bailian-visual-model-client.js'
import { readBailianDiagnosisEnvironment } from '../../src/configuration/bailian-diagnosis-environment.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnc「视觉诊断 2/4」票面与协调方 2026-10-11 要求——
 * credential_ref 只写环境变量名；兜底顺序由策略发布给出（代码无默认）；遇 FreeTierOnly、额度不足或不可用按顺序切换；
 * 超时与重试来自环境变量（pending，缺失即不创建 Provider）；严格模式 system 必须是纯字符串（A2 结论）；
 * 图片 max_pixels 为 1024² 硬上限（diagnosis-visual-image-input/v1）；不打印凭证。
 * 测试层次：unit_fake（假 fetch / 假 client，不发起真实模型调用）。
 */
const request: VisualModelRequest = {
  prefixText: '固定前缀',
  dynamicText: '本次任务',
  imageUrls: ['https://example.invalid/a.jpg']
}

function fakeClient(
  outcomes: Record<string, () => Promise<unknown>>
): VisualModelClient & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async complete(modelCode) {
      calls.push(modelCode)
      const outcome = outcomes[modelCode]
      if (!outcome) {
        throw new ModelProviderError('unavailable', 500)
      }
      return (await outcome()) as never
    }
  }
}

const okResponse = (modelCode: string) => async () => ({
  text: '{}',
  modelCode,
  latencyMs: 5,
  usage: { promptTokens: 10, completionTokens: 5, cachedTokens: 0, cacheCreationTokens: 0 }
})

describe('视觉模型 Provider：按策略顺序兜底', () => {
  test('免费额度、额度不足、不可用时依次切换到下一个模型', async () => {
    const client = fakeClient({
      a: () => Promise.reject(new ModelProviderError('free_tier_only', 403)),
      b: () => Promise.reject(new ModelProviderError('quota_exhausted', 403)),
      c: () => Promise.reject(new ModelProviderError('unavailable', 503)),
      d: okResponse('d')
    })
    const result = await callVisualModelWithFallback(client, ['a', 'b', 'c', 'd'], request)
    expect(result.response.modelCode).toBe('d')
    expect(client.calls).toEqual(['a', 'b', 'c', 'd'])
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual([
      'free_tier_only',
      'quota_exhausted',
      'unavailable',
      'succeeded'
    ])
  })

  test('请求本身不合法时不切换模型，直接失败关闭', async () => {
    const client = fakeClient({
      a: () => Promise.reject(new ModelProviderError('invalid_request', 400)),
      b: okResponse('b')
    })
    await expect(callVisualModelWithFallback(client, ['a', 'b'], request)).rejects.toMatchObject({
      kind: 'invalid_request'
    })
    expect(client.calls).toEqual(['a'])
  })

  test('没有策略给出的模型顺序时拒绝调用（代码不提供默认模型）', async () => {
    const client = fakeClient({})
    await expect(callVisualModelWithFallback(client, [], request)).rejects.toMatchObject({
      kind: 'model_order_unavailable'
    })
    expect(client.calls).toEqual([])
  })

  test('全部候选都不可用时失败关闭', async () => {
    const client = fakeClient({
      a: () => Promise.reject(new ModelProviderError('free_tier_only', 403))
    })
    await expect(callVisualModelWithFallback(client, ['a'], request)).rejects.toMatchObject({
      kind: 'all_models_unavailable'
    })
  })
})

describe('百炼适配器：请求体与错误分类', () => {
  test('普通 JSON 模式：system 为数组并挂显式缓存标记，先文本后图片，max_pixels 为 1024²，关闭思考', () => {
    const body = buildBailianVisualRequestBody('qwen3.7-flash', request, 4000)
    expect(body.enable_thinking).toBe(false)
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: [{ type: 'text', text: '固定前缀', cache_control: { type: 'ephemeral' } }]
    })
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: '本次任务' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.invalid/a.jpg' },
        max_pixels: 1048576
      }
    ])
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  test('严格模式：system 必须是纯字符串（不带缓存标记）', () => {
    const schema = { type: 'object' }
    const body = buildBailianVisualRequestBody(
      'qwen3.7-flash',
      { ...request, strictSchema: { name: 'diagnosis_visual_gen_output', schema } },
      4000
    )
    expect(body.messages[0]).toEqual({ role: 'system', content: '固定前缀' })
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'diagnosis_visual_gen_output', strict: true, schema }
    })
  })

  test('拒绝非 HTTPS 图片地址与超过 3 张图', () => {
    expect(() =>
      buildBailianVisualRequestBody(
        'm',
        { ...request, imageUrls: ['data:image/png;base64,AA'] },
        4000
      )
    ).toThrow()
    expect(() =>
      buildBailianVisualRequestBody(
        'm',
        { ...request, imageUrls: [1, 2, 3, 4].map(n => `https://example.invalid/${n}.jpg`) },
        4000
      )
    ).toThrow()
  })

  test.each([
    [403, 'AllocationQuota.FreeTierOnly', 'free_tier_only'],
    [403, 'Arrearage', 'quota_exhausted'],
    [429, 'Throttling.AllocationQuota', 'quota_exhausted'],
    [429, 'Throttling.RateQuota', 'rate_limited'],
    [500, 'InternalError', 'unavailable'],
    [503, '', 'unavailable'],
    [400, 'invalid_parameter_error', 'invalid_request'],
    [401, 'InvalidApiKey', 'invalid_request']
  ])('错误分类：HTTP %s / %s → %s', (status, code, kind) => {
    expect(classifyBailianFailure(status, code)).toBe(kind)
  })

  test('超时按环境配置中止，重试次数按环境配置，错误信息不含凭证', async () => {
    const secret = 'sk-should-not-leak'
    let calls = 0
    const client = createBailianVisualModelClient({
      config: {
        apiKey: secret,
        baseUrl: 'https://example.invalid/v1',
        totalDeadlineMs: 20,
        maxAttemptsPerModel: 2
      },
      maxOutputTokens: 4000,
      fetchImpl: async (_url, init) => {
        calls += 1
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      }
    })
    const error = await client.complete('qwen3.7-flash', request).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ModelProviderError)
    expect((error as ModelProviderError).kind).toBe('unavailable')
    expect(calls).toBe(2)
    expect(JSON.stringify(error)).not.toContain(secret)
    expect(String((error as Error).message)).not.toContain(secret)
  })
})

describe('百炼诊断环境变量：只读变量名，超时与重试缺失时不创建 Provider', () => {
  const full = {
    LLM_ALIYUN_BAILIAN_API_KEY: 'k',
    V2_BAILIAN_DIAGNOSIS_TOTAL_DEADLINE_MS: '60000',
    V2_BAILIAN_DIAGNOSIS_MAX_ATTEMPTS: '2'
  }

  test('齐全时返回配置，凭证容器序列化脱敏', () => {
    const config = readBailianDiagnosisEnvironment(full)
    expect(config).toMatchObject({ totalDeadlineMs: 60000, maxAttemptsPerModel: 2 })
    expect(JSON.stringify(config)).not.toContain('"k"')
  })

  test.each([
    'LLM_ALIYUN_BAILIAN_API_KEY',
    'V2_BAILIAN_DIAGNOSIS_TOTAL_DEADLINE_MS',
    'V2_BAILIAN_DIAGNOSIS_MAX_ATTEMPTS'
  ])('缺少 %s 时返回 null（不使用代码默认值）', name => {
    const environment: Record<string, string | undefined> = { ...full, [name]: undefined }
    expect(readBailianDiagnosisEnvironment(environment)).toBeNull()
  })

  test('越界或非整数时启动失败，错误只含变量名', () => {
    expect(() =>
      readBailianDiagnosisEnvironment({ ...full, V2_BAILIAN_DIAGNOSIS_MAX_ATTEMPTS: '9' })
    ).toThrow('V2_BAILIAN_DIAGNOSIS_MAX_ATTEMPTS')
    expect(() =>
      readBailianDiagnosisEnvironment({ ...full, V2_BAILIAN_DIAGNOSIS_TOTAL_DEADLINE_MS: '1.5' })
    ).toThrow('V2_BAILIAN_DIAGNOSIS_TOTAL_DEADLINE_MS')
  })
})
