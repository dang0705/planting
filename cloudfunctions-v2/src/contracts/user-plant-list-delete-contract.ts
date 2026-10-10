import type { JSONSchemaType } from 'ajv'

import type { UserPlantDto, UserPlantRef } from './types.js'
import { userPlantSchema } from './user-plant-schema.js'

/**
 * 用户植物列表与删除公开 DTO（`docs/backend-v2/contracts/user-plant.md`「列表公开接口」「删除公开接口」，
 * 2026-10-10 用户裁决冻结）。类型与 AJV Schema 放在同一文件，避免两处漂移。
 */

/** 列表成功数据：一页用户植物公开投影与下一页游标。 */
export type UserPlantListResponseDto = {
  /** 当前页的用户植物；每项与单株读取的公开投影完全一致，最多 50 项（硬规则 user-plant.list.page_size.max）。 */
  items: UserPlantDto[]
  /** 还有下一页时为不透明游标，最后一页为 null；不含内部主键或 user_id。 */
  nextCursor: string | null
}

/** 删除请求体：只允许调用方最后读到的版本。 */
export type DeleteUserPlantRequestDto = {
  /** 正安全整数；与当前版本不一致时返回 409 USER_PLANT_VERSION_CONFLICT。 */
  expectedVersion: number
}

/** 删除受理结果：只说明植物已进入删除中。 */
export type UserPlantDeletionResponseDto = {
  /** 被删除植物的公开引用。 */
  user_plant_id: UserPlantRef
  /** 固定为 deleting；之后对外视为不存在。 */
  lifecycle: 'deleting'
  /** 标记删除后的新版本（原版本 + 1），因此至少为 2。 */
  version: number
  /** 标记删除的服务端 UTC 时间。 */
  updatedAt: string
}

/** 列表页最大条数；与硬规则 user-plant.list.page_size.max 一致，由一致性测试锁定。 */
const listMaxItems = 50
const isoUtcPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'

/** 列表成功数据 Schema：items 逐项复用单株公开投影 Schema。 */
export const userPlantListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'nextCursor'],
  properties: {
    items: { type: 'array', maxItems: listMaxItems, items: userPlantSchema },
    nextCursor: { type: 'string', nullable: true, minLength: 1, maxLength: 200 }
  }
} as unknown as JSONSchemaType<UserPlantListResponseDto>

/** 删除请求 Schema：拒绝额外字段（含误放的幂等键）与非安全整数。 */
export const deleteUserPlantRequestSchema: JSONSchemaType<DeleteUserPlantRequestDto> = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER } }
}

/** 删除成功数据 Schema：lifecycle 固定 deleting，不允许档案或任何内部字段。 */
export const userPlantDeletionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['user_plant_id', 'lifecycle', 'version', 'updatedAt'],
  properties: {
    user_plant_id: { type: 'string', pattern: '^upl_[A-Za-z0-9_-]{8,}$', maxLength: 64 },
    lifecycle: { type: 'string', const: 'deleting' },
    version: { type: 'integer', minimum: 2, maximum: Number.MAX_SAFE_INTEGER },
    updatedAt: { type: 'string', pattern: isoUtcPattern }
  }
} as unknown as JSONSchemaType<UserPlantDeletionResponseDto>
