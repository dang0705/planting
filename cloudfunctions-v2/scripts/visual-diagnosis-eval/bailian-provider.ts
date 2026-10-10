import type { EvalProvider, ProviderRequest, ProviderResponse } from './eval-core.js'

/**
 * 阿里云百炼 OpenAI 兼容接口的离线评测 Provider（不属于产品运行时 Adapter）。
 *
 * 约束：
 * - 只按变量名读取凭证，任何日志、错误、报告中都不出现凭证值；
 * - 显式缓存：system 消息只有一个文本块，并挂唯一的 cache_control；
 * - 可变部分先文本后图片，图片只接受 HTTPS 地址，max_pixels 放在图片内容块根节点；
 * - enable_thinking 必须显式给出（qwen3.5 系列默认开启）。
 */

/** 百炼 API Key 的环境变量名（只读名字，不读日志）。 */
export const BAILIAN_API_KEY_ENV_NAME = 'LLM_ALIYUN_BAILIAN_API_KEY'
/** 可选的接口地址覆盖变量名。 */
export const BAILIAN_BASE_URL_ENV_NAME = 'LLM_ALIYUN_BAILIAN_BASE_URL'
/** 官方 OpenAI 兼容接口地址（华北2 北京）。 */
const officialBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** 请求体构造参数。 */
export interface BailianRequestInput extends ProviderRequest {
  /** 模型代码（含快照时写全）。 */
  readonly model: string
  /** 是否开启思考模式，必须显式给出。 */
  readonly enableThinking: boolean
  /** 最大输出 tokens。 */
  readonly maxTokens: number
  /** 单图像素上限。 */
  readonly maxPixels: number
  /** 是否要求 JSON 对象输出（response_format=json_object）；未给出视为关闭。 */
  readonly jsonMode?: boolean
  /** 仅评测：允许图片 data URL（产品运行时仍只允许 HTTPS）。 */
  readonly allowInlineImages?: boolean
}

/** 评测内联图片 data URL 的唯一允许格式。 */
const inlineImagePattern = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/

/** 文本内容块。 */
interface TextBlock {
  /** 块类型。 */
  readonly type: 'text'
  /** 文本。 */
  readonly text: string
  /** 显式缓存标记。 */
  readonly cache_control?: { readonly type: 'ephemeral' }
}

/** 图片内容块。 */
interface ImageBlock {
  /** 块类型。 */
  readonly type: 'image_url'
  /** 图片地址。 */
  readonly image_url: { readonly url: string }
  /** 单图像素上限。 */
  readonly max_pixels: number
}

/** 百炼请求体。 */
export interface BailianRequestBody {
  /** 模型代码。 */
  readonly model: string
  /** 消息列表：system 固定前缀 + user 可变部分。 */
  readonly messages: readonly [
    { readonly role: 'system'; readonly content: readonly TextBlock[] },
    { readonly role: 'user'; readonly content: readonly (TextBlock | ImageBlock)[] }
  ]
  /** 最大输出 tokens。 */
  readonly max_tokens: number
  /** 思考模式开关。 */
  readonly enable_thinking: boolean
  /** 非流式。 */
  readonly stream: false
  /** JSON 输出模式（仅在开启时出现）。 */
  readonly response_format?: { readonly type: 'json_object' }
}

/** 构造请求体；图片地址必须是 HTTPS。 */
export function buildBailianRequestBody(input: BailianRequestInput): BailianRequestBody {
  for (const url of input.imageUrls) {
    const inlineAllowed = input.allowInlineImages === true && inlineImagePattern.test(url)
    if (!/^https:\/\//i.test(url) && !inlineAllowed) {
      throw new Error('image_url_must_be_https')
    }
  }
  return {
    model: input.model,
    messages: [
      {
        role: 'system',
        content: [{ type: 'text', text: input.prefixText, cache_control: { type: 'ephemeral' } }]
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: input.dynamicText },
          ...input.imageUrls.map(
            (url): ImageBlock => ({
              type: 'image_url',
              image_url: { url },
              max_pixels: input.maxPixels
            })
          )
        ]
      }
    ],
    max_tokens: input.maxTokens,
    enable_thinking: input.enableThinking,
    stream: false,
    ...(input.jsonMode === true ? { response_format: { type: 'json_object' as const } } : {})
  }
}

/** 创建参数。 */
export interface BailianProviderOptions {
  /** 环境变量来源（测试时传入假对象）。 */
  readonly env: Readonly<Record<string, string | undefined>>
  /** fetch 实现（测试时传入假实现）。 */
  readonly fetchImpl: typeof fetch
  /** 模型代码。 */
  readonly model?: string
  /** 思考模式。 */
  readonly enableThinking?: boolean
  /** 最大输出 tokens。 */
  readonly maxTokens?: number
  /** 单图像素上限。 */
  readonly maxPixels?: number
  /** JSON 输出模式。 */
  readonly jsonMode?: boolean
  /** 仅评测：允许图片 data URL。 */
  readonly allowInlineImages?: boolean
}

/** 读取数字字段。 */
function numberAt(value: unknown, ...path: string[]): number {
  let current: unknown = value
  for (const key of path) {
    current =
      current !== null && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : 0
}

/** 创建百炼 Provider；缺凭证或参数时报错只提名字。 */
export function createBailianProvider(options: BailianProviderOptions): EvalProvider {
  const apiKey = options.env[BAILIAN_API_KEY_ENV_NAME]
  if (!apiKey) {
    throw new Error(`缺少环境变量 ${BAILIAN_API_KEY_ENV_NAME}`)
  }
  const { model, enableThinking, maxTokens, maxPixels } = options
  if (
    model === undefined ||
    enableThinking === undefined ||
    maxTokens === undefined ||
    maxPixels === undefined
  ) {
    throw new Error('必须显式给出 model、enableThinking、maxTokens、maxPixels')
  }
  const baseUrl = (options.env[BAILIAN_BASE_URL_ENV_NAME] || officialBaseUrl).replace(/\/+$/, '')
  return {
    async complete(request: ProviderRequest): Promise<ProviderResponse> {
      const body = buildBailianRequestBody({
        ...request,
        model,
        enableThinking,
        maxTokens,
        maxPixels,
        jsonMode: options.jsonMode === true,
        allowInlineImages: options.allowInlineImages === true
      })
      const startedAt = Date.now()
      const response = await options.fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        // 只提取供应商错误码（限定字符集），不回显响应正文与请求头，避免泄露凭证或上下文。
        const errorBody = (await response.json().catch(() => undefined)) as unknown
        const rawCode = errorBody as { error?: { code?: unknown }; code?: unknown } | undefined
        const code = String(rawCode?.error?.code ?? rawCode?.code ?? '')
          .replace(/[^A-Za-z0-9_.-]/g, '')
          .slice(0, 40)
        throw new Error(`bailian_request_failed:${response.status}${code ? `:${code}` : ''}`)
      }
      const json = (await response.json()) as unknown
      const choices = (json as { choices?: { message?: { content?: unknown } }[] }).choices
      const content = choices?.[0]?.message?.content
      return {
        text: typeof content === 'string' ? content : '',
        usage: {
          promptTokens: numberAt(json, 'usage', 'prompt_tokens'),
          completionTokens: numberAt(json, 'usage', 'completion_tokens'),
          cachedTokens: numberAt(json, 'usage', 'prompt_tokens_details', 'cached_tokens'),
          cacheCreationTokens:
            numberAt(json, 'usage', 'prompt_tokens_details', 'cache_creation_input_tokens') ||
            numberAt(json, 'usage', 'cache_creation_input_tokens'),
          reasoningTokens: numberAt(json, 'usage', 'completion_tokens_details', 'reasoning_tokens'),
          imageTokens: numberAt(json, 'usage', 'prompt_tokens_details', 'image_tokens')
        },
        latencyMs: Date.now() - startedAt
      }
    }
  }
}
