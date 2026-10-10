import { CARE_LONG_TERM_RULES_POLICY } from './care-long-term-rules.js'
import { HTTP_REQUEST_WRITE_POLICY } from './http-request-write.js'
import { MVP_WATERING_POLICY } from './mvp-watering.js'
import { PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY } from './plant-knowledge-public-search.js'
import type { TypedPolicyDefinition } from './typed-policy.js'
import { USER_PLANT_ASSET_RULES_POLICY } from './user-plant-asset-rules.js'
import { USER_PLANT_LIST_RULES_POLICY } from './user-plant-list-rules.js'
import { WEATHER_PUBLIC_READ_POLICY } from './weather-public-read.js'

export { CARE_LONG_TERM_RULES_POLICY, type CareLongTermRules } from './care-long-term-rules.js'
export { HTTP_REQUEST_WRITE_POLICY, idempotencyRetentionMs, type HttpRequestWriteRules } from './http-request-write.js'
export { MVP_WATERING_POLICY } from './mvp-watering.js'
export { PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY, type PlantKnowledgePublicSearchRules } from './plant-knowledge-public-search.js'
export type { PolicyPageSize, TypedPolicyDefinition } from './typed-policy.js'
export { USER_PLANT_ASSET_RULES_POLICY, type CoverImageMime, type UserPlantAssetRules } from './user-plant-asset-rules.js'
export { USER_PLANT_LIST_RULES_POLICY, type UserPlantListRules } from './user-plant-list-rules.js'
export { WEATHER_PUBLIC_READ_POLICY, type WeatherPublicReadRules } from './weather-public-read.js'

/**
 * 策略发布 CLI 支持的全部类型化策略（configuration-layers/v2 §6）：每个 (domain, policy) 只登记一次。
 * 不在清单中的策略一律拒绝发布，避免变成万能键值配置。
 */
export const BUSINESS_POLICY_DEFINITIONS: readonly TypedPolicyDefinition<unknown>[] = Object.freeze([
  CARE_LONG_TERM_RULES_POLICY, MVP_WATERING_POLICY, USER_PLANT_LIST_RULES_POLICY, USER_PLANT_ASSET_RULES_POLICY,
  PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY, WEATHER_PUBLIC_READ_POLICY, HTTP_REQUEST_WRITE_POLICY,
] as readonly TypedPolicyDefinition<unknown>[])

/** 按业务域与策略代码查找类型定义；未登记返回 null。 */
export function findBusinessPolicyDefinition(domainCode: string, policyCode: string): TypedPolicyDefinition<unknown> | null {
  return BUSINESS_POLICY_DEFINITIONS.find(definition => definition.domainCode === domainCode && definition.policyCode === policyCode) ?? null
}
