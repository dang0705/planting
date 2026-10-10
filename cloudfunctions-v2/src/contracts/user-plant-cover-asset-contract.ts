import type { JSONSchemaType } from 'ajv'

/** 登记封面请求（user-plant-cover-asset/v1 §2）。 */
export type BindUserPlantAssetRequestDto = {
  /** 第一期固定 profile（封面）。 */ purpose: 'profile'
  /** 刚上传到本人封面目录的云存储 fileID。 */ fileId: string
  /** 客户端计算的文件 SHA-256（64 位小写十六进制）。 */ contentSha256: string
}

/** 登记封面成功数据。 */
export type UserPlantAssetResponseDto = {
  /** 封面公开引用 ast_…。 */ assetRef: string
  /** 第一期固定 profile（封面）。 */ purpose: 'profile'
  /** 临时访问链接（有效期以平台默认为准）。 */ url: string
  /** 平台给出的到期时间；当前 HTTP API 不返回，因此为 null。 */ urlExpiresAt: string | null
  /** 封面登记时间（UTC）。 */ createdAt: string
}

/** 单株读取中的封面公开投影。 */
export type PublicCoverDto = {
  /** 封面公开引用 ast_…。 */ assetRef: string
  /** 现场换取的临时访问链接；云存储不可用时为 null。 */ url: string | null
  /** 平台给出的到期时间；当前 HTTP API 不返回，因此为 null。 */ urlExpiresAt: string | null
}

const isoUtcPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'

/** 登记封面请求 Schema：严格三字段。 */
export const bindUserPlantAssetRequestSchema = {
  type: 'object', additionalProperties: false, required: ['purpose', 'fileId', 'contentSha256'],
  properties: {
    purpose: { type: 'string', const: 'profile' },
    fileId: { type: 'string', minLength: 1, maxLength: 512 },
    contentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }
  }
} as unknown as JSONSchemaType<BindUserPlantAssetRequestDto>

/** 登记封面成功数据 Schema：不允许 fileId 或任何内部字段。 */
export const userPlantAssetResponseSchema = {
  type: 'object', additionalProperties: false, required: ['assetRef', 'purpose', 'url', 'urlExpiresAt', 'createdAt'],
  properties: {
    assetRef: { type: 'string', pattern: '^ast_[A-Za-z0-9_-]{8,60}$' },
    purpose: { type: 'string', const: 'profile' },
    url: { type: 'string', pattern: '^https://' },
    urlExpiresAt: { type: 'string', nullable: true, pattern: isoUtcPattern },
    createdAt: { type: 'string', pattern: isoUtcPattern }
  }
} as unknown as JSONSchemaType<UserPlantAssetResponseDto>

/** 单株读取中的封面（Provider 不可用时 url 为 null，不让读取失败）。 */
export const publicCoverSchema = {
  type: 'object', additionalProperties: false, required: ['assetRef', 'url', 'urlExpiresAt'], nullable: true, not: { type: 'null' },
  properties: {
    assetRef: { type: 'string', pattern: '^ast_[A-Za-z0-9_-]{8,60}$' },
    url: { type: 'string', nullable: true, pattern: '^https://' },
    urlExpiresAt: { type: 'string', nullable: true, pattern: isoUtcPattern }
  }
}

/** 封面上传路径成功数据（user-plant-cover-asset/v1 §2.1）。 */
export type CoverUploadTargetResponseDto = {
  /** 第一期固定 profile（封面）。 */ purpose: 'profile'
  /** 本次上传路径（不含扩展名）；含本人用户公开编号，仅本人可见。 */ cloudPath: string
  /** 允许的图片类型。 */ allowedMimeTypes: Array<'image/jpeg' | 'image/png' | 'image/webp'>
  /** 单张上限字节数。 */ maxBytes: number
}

/** 封面上传路径 Schema：不允许单独的用户编号字段、桶名或环境 ID。 */
export const coverUploadTargetResponseSchema = {
  type: 'object', additionalProperties: false, required: ['purpose', 'cloudPath', 'allowedMimeTypes', 'maxBytes'],
  properties: {
    purpose: { type: 'string', const: 'profile' },
    cloudPath: { type: 'string', pattern: '^user-plant/usr_[A-Za-z0-9_-]{8,60}/covers/upl_[A-Za-z0-9_-]{8,60}-[a-f0-9]{32}$' },
    allowedMimeTypes: { type: 'array', minItems: 1, maxItems: 3, uniqueItems: true, items: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] } },
    maxBytes: { type: 'integer', minimum: 1 }
  }
} as unknown as JSONSchemaType<CoverUploadTargetResponseDto>
