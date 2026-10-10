/**
 * 视觉诊断模型 Provider 注册与兜底调用（ClickUp z8v0kmvhnc「视觉诊断 2/4」）。
 *
 * 通俗说明：像前端封装的 `request` 层——业务只调用「按顺序试几个模型」这一个函数，不关心背后是哪家供应商。
 * 模型顺序完全来自策略发布（配置目录 `diagnosis.visual_gen.model_code` 的候选顺序，待冻结），代码里没有默认模型。
 * 只有「免费额度用完、额度不足、服务不可用、限流」才会切到下一个模型；请求本身不合法时不切换，直接失败关闭，
 * 避免把同一个坏请求发给所有模型。
 */

/** 一次视觉模型调用的输入；只含服务端拼装好的内容，客户端无权提供。 */
export interface VisualModelRequest {
  /** 固定前缀正文（已发布提示词）。 */
  readonly prefixText: string
  /** 可变部分文本（本次任务与上下文摘要）。 */
  readonly dynamicText: string
  /** 图片 HTTPS 临时地址，最多 3 张。 */
  readonly imageUrls: readonly string[]
  /** 可选的 JSON Schema 严格模式；给出时 system 必须用纯字符串（A2 结论）。 */
  readonly strictSchema?: VisualModelStrictSchema
}

/** 严格模式使用的 JSON Schema 描述。 */
export interface VisualModelStrictSchema {
  /** Schema 名称，传给供应商 json_schema.name。 */
  readonly name: string
  /** JSON Schema 正文，要求模型严格按其输出。 */
  readonly schema: object
}

/** 调用计量；与供应商回包字段一一对应。 */
export interface VisualModelUsage {
  /** 输入 tokens（含缓存命中与创建部分）。 */
  readonly promptTokens: number
  /** 输出 tokens。 */
  readonly completionTokens: number
  /** 缓存命中 tokens。 */
  readonly cachedTokens: number
  /** 缓存创建 tokens。 */
  readonly cacheCreationTokens: number
  /** 图片 tokens（供应商返回时记录）。 */
  readonly imageTokens?: number
}

/** 一次成功调用的回包；text 只在内存中用于解析，不得持久化。 */
export interface VisualModelResponse {
  /** 模型原文；只用于本次解析与计算 SHA-256。 */
  readonly text: string
  /** 实际使用的模型代码。 */
  readonly modelCode: string
  /** 本次调用耗时，单位毫秒。 */
  readonly latencyMs: number
  /** 本次调用的 tokens 计量。 */
  readonly usage: VisualModelUsage
}

/** 可替换的模型调用边界；测试使用假实现。 */
export interface VisualModelClient {
  /** 用指定模型发起一次调用；失败抛 ModelProviderError。 */
  complete(modelCode: string, request: VisualModelRequest): Promise<VisualModelResponse>
}

/** Provider 失败类型。 */
export type ModelProviderErrorKind =
  | 'free_tier_only'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_request'
  | 'model_order_unavailable'
  | 'all_models_unavailable'

/** 可切换到下一个模型的失败类型。 */
const switchableKinds: ReadonlySet<ModelProviderErrorKind> = new Set([
  'free_tier_only',
  'quota_exhausted',
  'rate_limited',
  'unavailable'
])

/** Provider 调用失败；消息与字段都不含凭证、请求正文或供应商回包原文。 */
export class ModelProviderError extends Error {
  /** 失败类型。 */
  readonly kind: ModelProviderErrorKind
  /** 供应商 HTTP 状态（没有时为 0）。 */
  readonly status: number

  constructor(kind: ModelProviderErrorKind, status = 0) {
    super(`视觉模型调用失败：${kind}`)
    this.name = 'ModelProviderError'
    this.kind = kind
    this.status = status
  }
}

/** 单次尝试记录（只含模型代码与结果类型，供审计）。 */
export interface ModelAttempt {
  /** 本次尝试使用的模型代码。 */
  readonly modelCode: string
  /** 结果：成功或失败类型。 */
  readonly outcome: 'succeeded' | ModelProviderErrorKind
}

/** 兜底调用结果。 */
export interface FallbackCallResult {
  /** 最终成功的模型回包。 */
  readonly response: VisualModelResponse
  /** 按顺序记录的全部尝试。 */
  readonly attempts: readonly ModelAttempt[]
}

/**
 * 按策略给出的模型顺序依次调用：可切换的失败就换下一个，不可切换的失败立即失败关闭。
 * 模型顺序为空（策略缺失）时拒绝调用；全部候选都失败时抛 all_models_unavailable。
 */
export async function callVisualModelWithFallback(
  client: VisualModelClient,
  modelOrder: readonly string[],
  request: VisualModelRequest
): Promise<FallbackCallResult> {
  if (modelOrder.length === 0) {
    throw new ModelProviderError('model_order_unavailable')
  }
  const attempts: ModelAttempt[] = []
  for (const modelCode of modelOrder) {
    try {
      const response = await client.complete(modelCode, request)
      attempts.push({ modelCode, outcome: 'succeeded' })
      return { response, attempts }
    } catch (error) {
      const kind = error instanceof ModelProviderError ? error.kind : 'unavailable'
      attempts.push({ modelCode, outcome: kind })
      if (!switchableKinds.has(kind)) {
        throw error instanceof ModelProviderError ? error : new ModelProviderError('unavailable')
      }
    }
  }
  throw new ModelProviderError('all_models_unavailable')
}
