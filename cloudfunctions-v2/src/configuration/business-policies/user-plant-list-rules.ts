import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import { compilePolicySchema, freezePolicy, pageSizeSchema, type PolicyPageSize, type TypedPolicyDefinition } from './typed-policy.js'

/**
 * 用户植物列表规则策略（user-plant / list_rules，正文 `user-plant-list-rules/v1`）。
 * 用户 2026-10-10 裁定：植物列表与时间线分页迁入策略发布，取值不变（均为 {20, 50}）；绝对上限 50 = 公开合同与 OpenAPI 的 maxItems。
 */
export interface UserPlantListRules {
  /** 正文合同版本，固定 `user-plant-list-rules/v1`。 */
  readonly contractVersion: 'user-plant-list-rules/v1'
  /** `GET /api/v2/user-plants` 分页。 */
  readonly userPlantListPageSize: PolicyPageSize
  /** `GET /api/v2/user-plants/{ref}/timeline` 分页。 */
  readonly timelinePageSize: PolicyPageSize
}

const bounds = RUNTIME_PARAMETERS.policyBounds.userPlantListRules.value
const validate = compilePolicySchema<UserPlantListRules>({
  type: 'object', additionalProperties: false, required: ['contractVersion', 'userPlantListPageSize', 'timelinePageSize'],
  properties: {
    contractVersion: { const: 'user-plant-list-rules/v1' },
    userPlantListPageSize: pageSizeSchema(bounds.pageSizeMax),
    timelinePageSize: pageSizeSchema(bounds.pageSizeMax),
  },
})

/** 策略定义：每组分页 default ≤ max。 */
export const USER_PLANT_LIST_RULES_POLICY: TypedPolicyDefinition<UserPlantListRules> = Object.freeze({
  domainCode: 'user-plant',
  policyCode: 'list_rules',
  schemaVersions: Object.freeze(['user-plant-list-rules/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    if (schemaVersion !== 'user-plant-list-rules/v1' || !validate(document)) { return null }
    if ([document.userPlantListPageSize, document.timelinePageSize].some(page => page.default > page.max)) { return null }
    return freezePolicy(structuredClone(document))
  },
})
