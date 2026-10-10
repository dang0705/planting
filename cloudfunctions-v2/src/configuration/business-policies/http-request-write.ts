import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import { compilePolicySchema, freezePolicy, integerWithin, type TypedPolicyDefinition } from './typed-policy.js'

/**
 * HTTP 写入策略（http / request_write）。沿用既有发布键：
 * - `http-request-write-policy/v1`：两字段均为常量（1 MiB、168 小时），既有云端发布保持可读；
 * - `http-request-write-policy/v2`（用户 2026-10-10 裁定）：幂等保留期可在 24–720 小时内调整；正文上限仍只能等于代码绝对值 1 MiB
 *   （防攻击上限必须在读入内存前判定，不随策略变化）。公开合同改为「以生效策略为准，当前 168 小时」。
 */
export interface HttpRequestWriteRules {
  /** v2 正文的合同版本（v1 正文无此字段）；使 v2 摘要与内容相同的 v1 发布区分开（content_sha256 全局唯一）。 */
  readonly contractVersion?: 'http-request-write-policy/v2'
  /** 普通 JSON 正文字节上限；必须等于代码层 `http.json_body_limit_bytes`。 */
  readonly jsonBodyLimitBytes: number
  /** 写接口幂等结果保留小时数：保留期内同键同参返回首次确定结果。 */
  readonly idempotencyRetentionHours: number
}

const bounds = RUNTIME_PARAMETERS.policyBounds.httpRequestWrite.value
const validateV1 = compilePolicySchema<HttpRequestWriteRules>({
  type: 'object', additionalProperties: false, required: ['jsonBodyLimitBytes', 'idempotencyRetentionHours'],
  properties: { jsonBodyLimitBytes: { type: 'integer', const: 1_048_576 }, idempotencyRetentionHours: { type: 'integer', const: 168 } },
})
const validateV2 = compilePolicySchema<HttpRequestWriteRules>({
  type: 'object', additionalProperties: false, required: ['contractVersion', 'jsonBodyLimitBytes', 'idempotencyRetentionHours'],
  properties: {
    contractVersion: { const: 'http-request-write-policy/v2' },
    jsonBodyLimitBytes: { type: 'integer', const: bounds.jsonBodyLimitBytes },
    idempotencyRetentionHours: integerWithin(bounds.idempotencyRetentionHours.min, bounds.idempotencyRetentionHours.max),
  },
})

/** 策略定义：v1、v2 均可读；正文上限与代码绝对值不一致即失败。 */
export const HTTP_REQUEST_WRITE_POLICY: TypedPolicyDefinition<HttpRequestWriteRules> = Object.freeze({
  domainCode: 'http',
  policyCode: 'request_write',
  schemaVersions: Object.freeze(['http-request-write-policy/v2', 'http-request-write-policy/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    const valid = schemaVersion === 'http-request-write-policy/v2' ? validateV2(document)
      : schemaVersion === 'http-request-write-policy/v1' ? validateV1(document) : false
    if (!valid || (document as HttpRequestWriteRules).jsonBodyLimitBytes !== RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value) { return null }
    return freezePolicy(structuredClone(document as HttpRequestWriteRules))
  },
})

/** 毫秒换算：幂等记录过期时刻 = 创建时刻 + 保留小时 × 3 600 000。 */
export function idempotencyRetentionMs(rules: Pick<HttpRequestWriteRules, 'idempotencyRetentionHours'>): number {
  return rules.idempotencyRetentionHours * 3_600_000
}
