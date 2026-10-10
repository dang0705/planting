import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import { compilePolicySchema, freezePolicy, integerWithin, pageSizeSchema, type PolicyPageSize, type TypedPolicyDefinition } from './typed-policy.js'

/**
 * 长期养护规则策略（care / long_term_rules，正文 `care-long-term-rules/v1`）。
 * 用户 2026-10-10 裁定：原代码硬规则迁入策略发布，取值不变（72 小时、7 天、7 天、24 小时、{20, 50}）。
 * 合同：cloudfunctions-v2/models/care/long-term-care-contract.md §2/§3/§5/§6/§12；绝对边界见目录 `care.long_term_rules.absolute_bounds`。
 */
export interface CareLongTermRules {
  /** 正文合同版本，固定 `care-long-term-rules/v1`。 */
  readonly contractVersion: 'care-long-term-rules/v1'
  /** 检查计划过期宽限小时数：planned 且当前时刻 > 计划时刻 + 该小时数即过期（§12.1）。 */
  readonly planExpiryGraceHours: number
  /** 浇水事实最长补记天数：浇水时刻不得早于「现在 − 该天数」（§3，U3）。 */
  readonly wateringBackfillMaxDays: number
  /** 检查窗口无最晚端时检查计划最多推迟天数（§6，U5）。 */
  readonly checkMaxPostponeDays: number
  /** 检查窗口无最晚端时建议有效小时数（§5，U7）。 */
  readonly openWindowProposalValidHours: number
  /** 计划列表分页（§9）：省略 limit 用 default，超过 max 返回 400。 */
  readonly planPageSize: PolicyPageSize
}

const bounds = RUNTIME_PARAMETERS.policyBounds.careLongTermRules.value
const validate = compilePolicySchema<CareLongTermRules>({
  type: 'object', additionalProperties: false,
  required: ['contractVersion', 'planExpiryGraceHours', 'wateringBackfillMaxDays', 'checkMaxPostponeDays', 'openWindowProposalValidHours', 'planPageSize'],
  properties: {
    contractVersion: { const: 'care-long-term-rules/v1' },
    planExpiryGraceHours: integerWithin(bounds.planExpiryGraceHours.min, bounds.planExpiryGraceHours.max),
    wateringBackfillMaxDays: integerWithin(bounds.wateringBackfillMaxDays.min, bounds.wateringBackfillMaxDays.max),
    checkMaxPostponeDays: integerWithin(bounds.checkMaxPostponeDays.min, bounds.checkMaxPostponeDays.max),
    openWindowProposalValidHours: integerWithin(bounds.openWindowProposalValidHours.min, bounds.openWindowProposalValidHours.max),
    planPageSize: pageSizeSchema(bounds.planPageSizeMax),
  },
})

/** 策略定义：结构与绝对边界由 Schema 校验，default ≤ max 由跨字段规则复核。 */
export const CARE_LONG_TERM_RULES_POLICY: TypedPolicyDefinition<CareLongTermRules> = Object.freeze({
  domainCode: 'care',
  policyCode: 'long_term_rules',
  schemaVersions: Object.freeze(['care-long-term-rules/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    if (schemaVersion !== 'care-long-term-rules/v1' || !validate(document)) { return null }
    if (document.planPageSize.default > document.planPageSize.max) { return null }
    return freezePolicy(structuredClone(document))
  },
})
