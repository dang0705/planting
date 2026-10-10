import type { JSONSchemaType } from 'ajv'

/**
 * 用户植物身份确认请求 DTO（`docs/backend-v2/contracts/user-plant-identity-confirmation.md`，2026-10-10 用户审定冻结）。
 * 类型与 AJV Schema 同文件，避免两处漂移。
 */
export type ConfirmUserPlantIdentityRequestDto = {
  /** 调用方最后读到的用户植物版本；正安全整数，不匹配时返回 409 USER_PLANT_VERSION_CONFLICT。 */
  expectedVersion: number
  /** 要确认的已发布规范身份公开引用（pid_ + 8～60 位字母数字下划线连字符）。 */
  plantIdentityRef: string
  /** 确认来源；本期只有用户自行搜索后选择，识别候选来源随识别会话存储上线时追加。 */
  source: {
    /** 来源类型，本期固定 user_search。 */
    type: 'user_search'
  }
}

/** 身份确认请求 Schema：拒绝额外字段（含误放的幂等键、身份状态、user_id）。 */
export const confirmUserPlantIdentityRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'plantIdentityRef', 'source'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    plantIdentityRef: { type: 'string', pattern: '^pid_[A-Za-z0-9_-]{8,60}$' },
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: { type: { type: 'string', const: 'user_search' } }
    }
  }
} as unknown as JSONSchemaType<ConfirmUserPlantIdentityRequestDto>
