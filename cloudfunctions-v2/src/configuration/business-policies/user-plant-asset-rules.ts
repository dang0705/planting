import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import { compilePolicySchema, freezePolicy, integerWithin, type TypedPolicyDefinition } from './typed-policy.js'

/** 代码已实现魔数识别的封面图片类型（策略只能从中选子集）。 */
export type CoverImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

/**
 * 封面资产规则策略（user-plant / asset_rules，正文 `user-plant-asset-rules/v1`）。
 * 用户 2026-10-10 裁定：上传 MIME 白名单、单图字节上限、换下旧封面清理天数迁入策略发布，取值不变（jpeg/png/webp、5 MiB、7 天）。
 * 每株封面数（单槽数据结构）仍为代码硬边界 `user-plant.assets.max_count_per_plant`。
 */
export interface UserPlantAssetRules {
  /** 正文合同版本，固定 `user-plant-asset-rules/v1`。 */
  readonly contractVersion: 'user-plant-asset-rules/v1'
  /** 允许上传的图片类型（按文件魔数判断）；非空、不重复，且只能是代码支持类型的子集。 */
  readonly allowedMimeTypes: readonly CoverImageMime[]
  /** 单张图片字节上限；上传目标与登记下载校验共用。 */
  readonly maxImageBytes: number
  /** 换下的旧封面最早可清理天数。 */
  readonly replacedCoverCleanupDays: number
}

const bounds = RUNTIME_PARAMETERS.policyBounds.userPlantAssetRules.value
const validate = compilePolicySchema<UserPlantAssetRules>({
  type: 'object', additionalProperties: false, required: ['contractVersion', 'allowedMimeTypes', 'maxImageBytes', 'replacedCoverCleanupDays'],
  properties: {
    contractVersion: { const: 'user-plant-asset-rules/v1' },
    allowedMimeTypes: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: [...bounds.supportedMimeTypes] } },
    maxImageBytes: integerWithin(bounds.maxImageBytes.min, bounds.maxImageBytes.max),
    replacedCoverCleanupDays: integerWithin(bounds.replacedCoverCleanupDays.min, bounds.replacedCoverCleanupDays.max),
  },
})

/** 策略定义：结构、MIME 子集与字节 / 天数边界全部由 Schema 校验。 */
export const USER_PLANT_ASSET_RULES_POLICY: TypedPolicyDefinition<UserPlantAssetRules> = Object.freeze({
  domainCode: 'user-plant',
  policyCode: 'asset_rules',
  schemaVersions: Object.freeze(['user-plant-asset-rules/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    if (schemaVersion !== 'user-plant-asset-rules/v1' || !validate(document)) { return null }
    return freezePolicy(structuredClone(document))
  },
})
