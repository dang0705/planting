import type { JSONSchemaType } from 'ajv'
import type { UserPlantDto, UserPlantProfileDto } from './types.js'
import potSchema from '../../models/user-plant/measured-pot-profile.v1.schema.json'
import patchV2Schema from '../../models/user-plant/profile-patch.v2.schema.json'

/** 公开投影中的环境分组只出现“对象分支”（未设置时省略，不返回 null）；规则复用 profile-patch/v2 唯一事实源。 */
const groupObjectSchema = (key: 'potShape' | 'substrate' | 'location' | 'lighting' | 'ventilation') =>
  ({ ...(patchV2Schema.properties[key].oneOf[1] as object), nullable: true, not: { type: 'null' } })

/** 既有公开引用和UTC时间合同，不是新的可配置规则。 */
const PUBLIC_REF_SUFFIX = '[A-Za-z0-9_-]{8,}'
const ISO_UTC_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'
/** 可选档案必须为对象；测量复用唯一事实Schema，禁止null和任意存储字段。 */
const publicProfileSchema = {
  type: 'object', nullable: true, not: { type: 'null' }, additionalProperties: false,
  required: ['nickname'], properties: {
    nickname: { type: 'string', maxLength: 80 },
    measuredPot: { type: potSchema.type, additionalProperties: potSchema.additionalProperties,
      required: potSchema.required, properties: potSchema.properties, nullable: true, not: { type: 'null' } },
    potShape: groupObjectSchema('potShape'),
    substrate: groupObjectSchema('substrate'),
    location: groupObjectSchema('location'),
    lighting: groupObjectSchema('lighting'),
    ventilation: groupObjectSchema('ventilation')
  }
} as unknown as JSONSchemaType<UserPlantProfileDto>

/** 严格用户植物联合响应；身份与档案字段均按已冻结公开合同校验。 */
export const userPlantSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: [
        "user_plant_id",
        "lifecycle",
        "identityStatus",
        "version",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        user_plant_id: { type: "string", pattern: `^upl_${PUBLIC_REF_SUFFIX}$` },
        lifecycle: { type: "string", enum: ["active", "archived", "deleting", "deleted"] },
        identityStatus: { type: "string", enum: ["unidentified", "candidate_pending"] },
        version: { type: "integer", minimum: 1 },
        createdAt: { type: "string", pattern: ISO_UTC_PATTERN },
        updatedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        profile: publicProfileSchema,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "user_plant_id",
        "lifecycle",
        "identityStatus",
        "confirmedIdentityRef",
        "version",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        user_plant_id: { type: "string", pattern: `^upl_${PUBLIC_REF_SUFFIX}$` },
        lifecycle: { type: "string", enum: ["active", "archived", "deleting", "deleted"] },
        identityStatus: { type: "string", const: "confirmed" },
        confirmedIdentityRef: { type: "string", pattern: `^pid_${PUBLIC_REF_SUFFIX}$` },
        version: { type: "integer", minimum: 1 },
        createdAt: { type: "string", pattern: ISO_UTC_PATTERN },
        updatedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        profile: publicProfileSchema,
      },
    },
  ],
} as unknown as JSONSchemaType<UserPlantDto>;
