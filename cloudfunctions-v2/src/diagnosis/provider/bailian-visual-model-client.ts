import type { BailianDiagnosisConfig } from '../../configuration/bailian-diagnosis-environment.js'
import {
  ModelProviderError,
  type ModelProviderErrorKind,
  type VisualModelClient,
  type VisualModelRequest,
  type VisualModelResponse
} from './visual-model-registry.js'

/**
 * 阿里云百炼 OpenAI 兼容接口的视觉诊断适配器（Provider 档案 `bailian_qwen_diagnosis`）。
 *
 * 硬规则（来自已冻结合同，不可配置）：
 * - 图片只接受 HTTPS 地址，每张图写 `max_pixels = 1024²`（diagnosis-visual-image-input/v1），最多 3 张；
 * - 关闭思考模式；
 * - 普通 JSON 模式下 system 用数组并挂显式缓存标记；严格模式下 system 必须是纯字符串（2026-10-11 A2 排查结论）；
 * - 凭证只在请求头里使用，错误信息与日志不出现凭证或回包原文。
 * 超时与每个模型的尝试次数来自环境变量（pending，缺失时不创建本适配器）。
 */

/** 模型输入侧单图像素硬上限（diagnosis-visual-image-input/v1）。 */
export const MODEL_INPUT_MAX_PIXELS = 1024 * 1024
/** 单次调用最多图片数（与 diagnosis.visual.max_images 已冻结值一致，作为适配器自身的防御上限）。 */
const adapterMaxImages = 3

/** 显式缓存标记（百炼 OpenAI 兼容格式）。 */
interface CacheControl {
  /** 缓存类型，固定为 ephemeral（短期显式缓存）。 */
  readonly type: 'ephemeral'
}

/** 文本内容块。 */
interface TextBlock {
  /** 内容块类型，固定为 text。 */
  readonly type: 'text'
  /** 文本正文（固定前缀或本次任务）。 */
  readonly text: string
  /** 显式缓存标记，只挂在固定前缀上。 */
  readonly cache_control?: CacheControl
}

/** 图片地址。 */
interface ImageUrl {
  /** 图片 HTTPS 临时地址，不接受 data URL。 */
  readonly url: string
}

/** 图片内容块。 */
interface ImageBlock {
  /** 内容块类型，固定为 image_url。 */
  readonly type: 'image_url'
  /** 图片地址对象，只含 HTTPS 临时地址。 */
  readonly image_url: ImageUrl
  /** 单图像素上限，固定为 1024²。 */
  readonly max_pixels: number
}

/** system 消息。 */
interface SystemMessage {
  /** 消息角色，固定为 system。 */
  readonly role: 'system'
  /** 严格模式为纯字符串；普通模式为带缓存标记的数组。 */
  readonly content: string | readonly TextBlock[]
}

/** user 消息。 */
interface UserMessage {
  /** 消息角色，固定为 user。 */
  readonly role: 'user'
  /** 先文本后图片的内容块列表。 */
  readonly content: readonly (TextBlock | ImageBlock)[]
}

/** 严格模式的 json_schema 描述。 */
interface JsonSchemaFormat {
  /** Schema 名称，便于供应商侧区分。 */
  readonly name: string
  /** 是否严格按 Schema 输出，固定为 true。 */
  readonly strict: true
  /** JSON Schema 正文，约束模型输出结构。 */
  readonly schema: object
}

/** 普通 JSON 输出模式。 */
interface JsonObjectResponseFormat {
  /** 输出模式类型，固定为 json_object。 */
  readonly type: 'json_object'
}

/** 严格 JSON Schema 输出模式。 */
interface JsonSchemaResponseFormat {
  /** 输出模式类型，固定为 json_schema。 */
  readonly type: 'json_schema'
  /** 严格模式使用的 Schema 描述。 */
  readonly json_schema: JsonSchemaFormat
}

/** 百炼请求体。 */
export interface BailianVisualRequestBody {
  /** 本次调用使用的模型代码。 */
  readonly model: string
  /** system + user 两条消息。 */
  readonly messages: readonly [SystemMessage, UserMessage]
  /** 最大输出 tokens（来自成本策略）。 */
  readonly max_tokens: number
  /** 思考模式，固定关闭。 */
  readonly enable_thinking: false
  /** 是否流式返回，固定为非流式。 */
  readonly stream: false
  /** 结构化输出模式。 */
  readonly response_format: JsonObjectResponseFormat | JsonSchemaResponseFormat
}

/** 构造请求体；图片必须是 HTTPS 且不超过 3 张。 */
export function buildBailianVisualRequestBody(
  modelCode: string,
  request: VisualModelRequest,
  maxOutputTokens: number
): BailianVisualRequestBody {
  if (request.imageUrls.length > adapterMaxImages) {
    throw new ModelProviderError('invalid_request')
  }
  for (const url of request.imageUrls) {
    if (!/^https:\/\//iu.test(url)) {
      throw new ModelProviderError('invalid_request')
    }
  }
  const strict = request.strictSchema
  return {
    model: modelCode,
    messages: [
      {
        role: 'system',
        content:
          strict === undefined
            ? [{ type: 'text', text: request.prefixText, cache_control: { type: 'ephemeral' } }]
            : request.prefixText
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: request.dynamicText },
          ...request.imageUrls.map(
            (url): ImageBlock => ({
              type: 'image_url',
              image_url: { url },
              max_pixels: MODEL_INPUT_MAX_PIXELS
            })
          )
        ]
      }
    ],
    max_tokens: maxOutputTokens,
    enable_thinking: false,
    stream: false,
    response_format:
      strict === undefined
        ? { type: 'json_object' }
        : {
            type: 'json_schema',
            json_schema: { name: strict.name, strict: true, schema: strict.schema }
          }
  }
}

/** 把供应商 HTTP 状态与错误码归类为可切换或不可切换的失败。 */
export function classifyBailianFailure(status: number, code: string): ModelProviderErrorKind {
  if (code === 'AllocationQuota.FreeTierOnly') {
    return 'free_tier_only'
  }
  if (/Arrearage|AllocationQuota|InsufficientQuota|insufficient_quota/u.test(code)) {
    return 'quota_exhausted'
  }
  if (status === 429) {
    return 'rate_limited'
  }
  if (status >= 500 || status === 0) {
    return 'unavailable'
  }
  return 'invalid_request'
}

/** 读取数字字段，缺失为 0。 */
function numberAt(value: unknown, ...keys: string[]): number {
  let current: unknown = value
  for (const key of keys) {
    current =
      current !== null && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : 0
}

/** 提取供应商错误码（限定字符集，不回显正文）。 */
async function readErrorCode(response: Response): Promise<string> {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: unknown }; code?: unknown }
    | undefined
  return String(body?.error?.code ?? body?.code ?? '')
    .replace(/[^A-Za-z0-9_.-]/gu, '')
    .slice(0, 60)
}

/** 适配器创建参数。 */
export interface BailianVisualModelClientOptions {
  /** 环境配置（凭证、端点、总时限、每个模型的尝试次数）。 */
  readonly config: BailianDiagnosisConfig
  /** 最大输出 tokens（来自成本策略快照）。 */
  readonly maxOutputTokens: number
  /** fetch 实现（测试注入假实现）。 */
  readonly fetchImpl: typeof fetch
}

/** 创建百炼视觉模型客户端：同一模型内只对「不可用、限流」按配置次数重试，其余失败直接抛出由上层决定是否换模型。 */
export function createBailianVisualModelClient(
  options: BailianVisualModelClientOptions
): VisualModelClient {
  const { config } = options
  const endpoint = `${config.baseUrl.replace(/\/+$/u, '')}/chat/completions`
  const attemptOnce = async (
    modelCode: string,
    request: VisualModelRequest
  ): Promise<VisualModelResponse> => {
    const body = buildBailianVisualRequestBody(modelCode, request, options.maxOutputTokens)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.totalDeadlineMs)
    const startedAt = Date.now()
    let response: Response
    try {
      response = await options.fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })
    } catch {
      throw new ModelProviderError('unavailable')
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      throw new ModelProviderError(
        classifyBailianFailure(response.status, await readErrorCode(response)),
        response.status
      )
    }
    const json = (await response.json().catch(() => undefined)) as unknown
    const content = (json as { choices?: { message?: { content?: unknown } }[] } | undefined)
      ?.choices?.[0]?.message?.content
    return {
      text: typeof content === 'string' ? content : '',
      modelCode,
      latencyMs: Date.now() - startedAt,
      usage: {
        promptTokens: numberAt(json, 'usage', 'prompt_tokens'),
        completionTokens: numberAt(json, 'usage', 'completion_tokens'),
        cachedTokens: numberAt(json, 'usage', 'prompt_tokens_details', 'cached_tokens'),
        cacheCreationTokens:
          numberAt(json, 'usage', 'prompt_tokens_details', 'cache_creation_input_tokens') ||
          numberAt(json, 'usage', 'cache_creation_input_tokens'),
        imageTokens: numberAt(json, 'usage', 'prompt_tokens_details', 'image_tokens')
      }
    }
  }
  return {
    async complete(modelCode, request) {
      let lastError = new ModelProviderError('unavailable')
      for (let attempt = 1; attempt <= config.maxAttemptsPerModel; attempt += 1) {
        try {
          return await attemptOnce(modelCode, request)
        } catch (error) {
          lastError =
            error instanceof ModelProviderError ? error : new ModelProviderError('unavailable')
          if (lastError.kind !== 'unavailable' && lastError.kind !== 'rate_limited') {
            throw lastError
          }
        }
      }
      throw lastError
    }
  }
}
