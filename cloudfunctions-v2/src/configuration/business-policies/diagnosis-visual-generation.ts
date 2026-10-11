import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import {
  compilePolicySchema,
  freezePolicy,
  integerWithin,
  type TypedPolicyDefinition
} from './typed-policy.js'

/**
 * 视觉诊断生成策略（diagnosis / visual_generation，正文 `diagnosis-visual-generation/v1`）。
 *
 * 通俗说明：像前端的「远程配置」——视觉诊断用哪些模型、按什么顺序兜底、请求参数、每次诊断的成本上限与价目，
 * 都从这份不可变发布里读；读不到或校验不过一律 503，代码里没有默认模型、默认价格或默认点数。
 * 来源：用户 2026-10-11 裁决（兜底顺序、关闭 thinking、costPolicy 定稿）；价目来自 2026-10-10 官方价目快照。
 * 提示词发布哈希、输出 Schema 版本与药剂名单引用仍待冻结，不在本策略内（属于版本组的代码制品）。
 */

/** 模型输出格式模式：普通 JSON 或 JSON Schema 严格模式（严格模式下 system 必须是纯字符串，A2 结论）。 */
export type VisualResponseFormat = 'json_object' | 'json_schema_strict'

/** 请求参数组（版本组的一部分）。 */
export interface VisualRequestParams {
  /** 是否开启思考模式；用户裁决固定关闭。 */
  readonly enableThinking: false
  /** 输出格式模式；默认 json_object（理由见策略发布文档）。 */
  readonly responseFormat: VisualResponseFormat
}

/** 提示词发布（版本组中由代码制品承载的部分：固定前缀、输出结构与药剂名单）。 */
export interface VisualPromptReleaseRef {
  /** 提示词发布版本，例如 visual-diagnosis-prompt/v1.3。 */
  readonly releaseVersion: string
  /** 固定前缀正文 UTF-8 的 SHA-256；运行时按它取打包的发布文件。 */
  readonly promptReleaseSha256: string
  /** 模型输出结构版本（前缀【7】段）。 */
  readonly outputSchemaVersion: string
  /** 药剂允许名单版本。 */
  readonly agentAllowlistVersion: string
  /** 药剂允许名单 JSON 的规范化 SHA-256。 */
  readonly agentAllowlistSha256: string
}

/** 单次视觉诊断产品动作的成本策略。 */
export interface VisualCostPolicy {
  /** 消费的生成式能力代码，固定为 USER_DIAGNOSIS_VISUAL。 */
  readonly capability: 'USER_DIAGNOSIS_VISUAL'
  /** 不可变成本策略版本，写入额度预占记录。 */
  readonly costPolicyVersion: string
  /** 单次模型调用的输入 tokens 上限（预算守卫上限）。 */
  readonly maxInputTokens: number
  /** 单次模型调用的输出 tokens 上限（写入 max_tokens）。 */
  readonly maxOutputTokens: number
  /** 单次诊断最多图片张数。 */
  readonly maxImages: number
  /** 单次诊断最多模型调用次数（含 1 次安全门重试）。 */
  readonly maxModelLoops: number
  /** 单次诊断按首选模型价目计算的最大成本，人民币微元。 */
  readonly maxCostMicros: number
  /** 预占点数 = ceil(maxCostMicros / microsPerPoint)。 */
  readonly estimatedPoints: number
  /** 1 个 AI 点对应的微元数，额度合同固定为 800。 */
  readonly microsPerPoint: number
  /** 不扣点的结束原因（失败与非植物等）。 */
  readonly releaseWithoutCharge: readonly (
    | 'not_plant'
    | 'image_unusable'
    | 'model_failed'
    | 'safety_gate_rejected'
  )[]
}

/** 单个模型的供应商价目。 */
export interface VisualModelTariff {
  /** 每百万输入 tokens 的价格，人民币微元。 */
  readonly inputMicrosPerMillionTokens: number
  /** 每百万输出 tokens 的价格，人民币微元。 */
  readonly outputMicrosPerMillionTokens: number
  /** 缓存命中 tokens 相对输入价的倍率，基点（1000 = 10%）。 */
  readonly cacheHitBasisPoints: number
  /** 缓存创建 tokens 相对输入价的倍率，基点（12500 = 125%）。 */
  readonly cacheCreateBasisPoints: number
  /** 价目快照文件引用，便于审计与复算。 */
  readonly priceSnapshotRef: string
}

/** 视觉诊断生成策略正文。 */
export interface DiagnosisVisualGenerationRules {
  /** 正文合同版本，固定 `diagnosis-visual-generation/v1`。 */
  readonly contractVersion: 'diagnosis-visual-generation/v1'
  /** 模型兜底顺序；遇免费额度用完、额度不足或不可用时按顺序切换。 */
  readonly modelOrder: readonly string[]
  /** 请求参数组（思考模式与输出格式），属于版本组。 */
  readonly requestParams: VisualRequestParams
  /** 提示词发布（前缀摘要、输出结构与药剂名单版本），属于版本组。 */
  readonly promptRelease: VisualPromptReleaseRef
  /** 成本策略：上限、预占点数与换算规则。 */
  readonly costPolicy: VisualCostPolicy
  /** 逐模型价目；必须覆盖 modelOrder 中的每个模型。 */
  readonly tariffs: Readonly<Record<string, VisualModelTariff>>
}

const bounds = RUNTIME_PARAMETERS.policyBounds.diagnosisVisualGeneration.value
const modelCodePattern = '^[a-z0-9][a-z0-9.\\-]{0,79}$'
const validate = compilePolicySchema<DiagnosisVisualGenerationRules>({
  type: 'object',
  additionalProperties: false,
  required: [
    'contractVersion',
    'modelOrder',
    'requestParams',
    'promptRelease',
    'costPolicy',
    'tariffs'
  ],
  properties: {
    contractVersion: { const: 'diagnosis-visual-generation/v1' },
    modelOrder: {
      type: 'array',
      minItems: 1,
      maxItems: bounds.modelOrderMaxItems,
      uniqueItems: true,
      items: { type: 'string', pattern: modelCodePattern }
    },
    requestParams: {
      type: 'object',
      additionalProperties: false,
      required: ['enableThinking', 'responseFormat'],
      properties: {
        enableThinking: { const: false },
        responseFormat: { enum: ['json_object', 'json_schema_strict'] }
      }
    },
    promptRelease: {
      type: 'object',
      additionalProperties: false,
      required: [
        'releaseVersion',
        'promptReleaseSha256',
        'outputSchemaVersion',
        'agentAllowlistVersion',
        'agentAllowlistSha256'
      ],
      properties: {
        releaseVersion: { type: 'string', pattern: '^[A-Za-z0-9._/-]{1,64}$' },
        promptReleaseSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        outputSchemaVersion: { type: 'string', pattern: '^[A-Za-z0-9._/-]{1,64}$' },
        agentAllowlistVersion: { type: 'string', pattern: '^[A-Za-z0-9._/-]{1,64}$' },
        agentAllowlistSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }
      }
    },
    costPolicy: {
      type: 'object',
      additionalProperties: false,
      required: [
        'capability',
        'costPolicyVersion',
        'maxInputTokens',
        'maxOutputTokens',
        'maxImages',
        'maxModelLoops',
        'maxCostMicros',
        'estimatedPoints',
        'microsPerPoint',
        'releaseWithoutCharge'
      ],
      properties: {
        capability: { const: 'USER_DIAGNOSIS_VISUAL' },
        costPolicyVersion: { type: 'string', pattern: '^[A-Za-z0-9._/-]{1,64}$' },
        maxInputTokens: integerWithin(bounds.maxInputTokens.min, bounds.maxInputTokens.max),
        maxOutputTokens: integerWithin(bounds.maxOutputTokens.min, bounds.maxOutputTokens.max),
        maxImages: integerWithin(bounds.maxImages.min, bounds.maxImages.max),
        maxModelLoops: integerWithin(bounds.maxModelLoops.min, bounds.maxModelLoops.max),
        maxCostMicros: integerWithin(1, 100_000_000),
        estimatedPoints: integerWithin(1, 1_000_000),
        microsPerPoint: { type: 'integer', const: bounds.microsPerPoint },
        releaseWithoutCharge: {
          type: 'array',
          uniqueItems: true,
          items: { enum: ['not_plant', 'image_unusable', 'model_failed', 'safety_gate_rejected'] }
        }
      }
    },
    tariffs: {
      type: 'object',
      propertyNames: { pattern: modelCodePattern },
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: [
          'inputMicrosPerMillionTokens',
          'outputMicrosPerMillionTokens',
          'cacheHitBasisPoints',
          'cacheCreateBasisPoints',
          'priceSnapshotRef'
        ],
        properties: {
          inputMicrosPerMillionTokens: integerWithin(1, 1_000_000_000),
          outputMicrosPerMillionTokens: integerWithin(1, 1_000_000_000),
          cacheHitBasisPoints: integerWithin(0, 10_000),
          cacheCreateBasisPoints: integerWithin(10_000, 50_000),
          priceSnapshotRef: { type: 'string', minLength: 1, maxLength: 255 }
        }
      }
    }
  }
})

/** 单次调用按某价目的最大成本（无缓存命中，向上取整到微元）。 */
function maxCallCostMicros(tariff: VisualModelTariff, cost: VisualCostPolicy): number {
  return Math.ceil(
    (cost.maxInputTokens * tariff.inputMicrosPerMillionTokens +
      cost.maxOutputTokens * tariff.outputMicrosPerMillionTokens) /
      1_000_000
  )
}

/** 跨字段规则：价目覆盖全部模型；上限成本按首选模型价目计算；预占点数 = ceil(上限成本 / 每点微元)。 */
function crossFieldValid(rules: DiagnosisVisualGenerationRules): boolean {
  const tariffs = rules.modelOrder.map(model => rules.tariffs[model])
  if (tariffs.some(tariff => tariff === undefined)) {
    return false
  }
  const cost = rules.costPolicy
  const primary = tariffs[0]!
  return (
    cost.maxCostMicros === cost.maxModelLoops * maxCallCostMicros(primary, cost) &&
    cost.estimatedPoints === Math.ceil(cost.maxCostMicros / cost.microsPerPoint)
  )
}

/** 策略定义：结构、硬边界与跨字段规则任一不合法即返回 null（读取方按 503 处理）。 */
export const DIAGNOSIS_VISUAL_GENERATION_POLICY: TypedPolicyDefinition<DiagnosisVisualGenerationRules> =
  Object.freeze({
    domainCode: 'diagnosis',
    policyCode: 'visual_generation',
    schemaVersions: Object.freeze(['diagnosis-visual-generation/v1']),
    resolve: (document: unknown, schemaVersion: string) => {
      if (
        schemaVersion !== 'diagnosis-visual-generation/v1' ||
        !validate(document) ||
        !crossFieldValid(document)
      ) {
        return null
      }
      return freezePolicy(structuredClone(document))
    }
  })
