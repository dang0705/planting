import { RUNTIME_PARAMETERS } from '../runtime-parameters.js'
import {
  compilePolicySchema,
  freezePolicy,
  integerWithin,
  type TypedPolicyDefinition
} from './typed-policy.js'

/**
 * AI 额度预占规则（subscription / ai_reservation，正文 `subscription-ai-reservation/v1`）。
 * 用户 2026-10-11 裁决：预占有效期 300 秒。到期仍未结算的预占由到期扫描转入对账（care-points-and-ai-quota.md），
 * 不会自动退回或扣除；代码里没有默认有效期，策略缺失时生成式 AI 接口 503。
 */
export interface SubscriptionAiReservationRules {
  /** 正文合同版本，固定 `subscription-ai-reservation/v1`。 */
  readonly contractVersion: 'subscription-ai-reservation/v1'
  /** 预占有效期秒数：从预占到必须结算或释放的最长时间。 */
  readonly ttlSeconds: number
}

const bounds = RUNTIME_PARAMETERS.policyBounds.subscriptionAiReservation.value
const validate = compilePolicySchema<SubscriptionAiReservationRules>({
  type: 'object',
  additionalProperties: false,
  required: ['contractVersion', 'ttlSeconds'],
  properties: {
    contractVersion: { const: 'subscription-ai-reservation/v1' },
    ttlSeconds: integerWithin(bounds.ttlSeconds.min, bounds.ttlSeconds.max)
  }
})

/** 策略定义：结构与有效期边界由 Schema 校验，不合法返回 null（读取方 503）。 */
export const SUBSCRIPTION_AI_RESERVATION_POLICY: TypedPolicyDefinition<SubscriptionAiReservationRules> =
  Object.freeze({
    domainCode: 'subscription',
    policyCode: 'ai_reservation',
    schemaVersions: Object.freeze(['subscription-ai-reservation/v1']),
    resolve: (document: unknown, schemaVersion: string) => {
      if (schemaVersion !== 'subscription-ai-reservation/v1' || !validate(document)) {
        return null
      }
      return freezePolicy(structuredClone(document))
    }
  })
