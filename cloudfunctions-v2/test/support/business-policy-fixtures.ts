import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  CARE_LONG_TERM_RULES_POLICY,
  HTTP_REQUEST_WRITE_POLICY,
  PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY,
  USER_PLANT_ASSET_RULES_POLICY,
  USER_PLANT_LIST_RULES_POLICY,
  WEATHER_PUBLIC_READ_POLICY,
  type CareLongTermRules,
  type HttpRequestWriteRules,
  type PlantKnowledgePublicSearchRules,
  type TypedPolicyDefinition,
  type UserPlantAssetRules,
  type UserPlantListRules,
  type WeatherPublicReadRules
} from '../../src/configuration/business-policies/index.js'
import { findProjectRoot } from './project-root.js'

/**
 * 测试夹具：从仓库 v1 发布文档（models/policy-releases/*.release.json）经真实策略类型解析出规则快照。
 * 发布文档本身与配置目录的一致性由 test/configuration/business-policy-releases.spec.ts 锁定，
 * 因此这里的规则值等价于「迁移前的代码常量值」，用于证明迁移前后行为一致。
 * 只替换数据库读取边界（直接返回快照），真实数据库读取见 mysql 用例。
 */
const releaseDirectory = 'cloudfunctions-v2/models/policy-releases'

/** 读取发布文档正文并用策略类型解析；解析失败直接抛出，便于定位。 */
function resolveRelease<T>(file: string, definition: TypedPolicyDefinition<T>): T {
  const document = JSON.parse(readFileSync(join(findProjectRoot(), releaseDirectory, file), 'utf8')) as { schemaVersion: string; policy: unknown }
  const rules = definition.resolve(document.policy, document.schemaVersion)
  if (rules === null) { throw new Error(`夹具发布文档 ${file} 无法解析`) }
  return rules
}

/** 长期养护规则 v1。 */
export const careLongTermRulesV1 = (): CareLongTermRules => resolveRelease('care.long_term_rules.v1.release.json', CARE_LONG_TERM_RULES_POLICY)
/** 用户植物列表规则 v1。 */
export const userPlantListRulesV1 = (): UserPlantListRules => resolveRelease('user-plant.list_rules.v1.release.json', USER_PLANT_LIST_RULES_POLICY)
/** 封面资产规则 v1。 */
export const userPlantAssetRulesV1 = (): UserPlantAssetRules => resolveRelease('user-plant.asset_rules.v1.release.json', USER_PLANT_ASSET_RULES_POLICY)
/** 公开搜索规则 v1。 */
export const plantKnowledgePublicSearchRulesV1 = (): PlantKnowledgePublicSearchRules => resolveRelease('plant-knowledge.public_search.v1.release.json', PLANT_KNOWLEDGE_PUBLIC_SEARCH_POLICY)
/** weather 公开读取规则 v1。 */
export const weatherPublicReadRulesV1 = (): WeatherPublicReadRules => resolveRelease('weather.public_read.v1.release.json', WEATHER_PUBLIC_READ_POLICY)
/** HTTP 写入规则 v2。 */
export const httpRequestWriteRulesV2 = (): HttpRequestWriteRules => resolveRelease('http.request_write.v2.release.json', HTTP_REQUEST_WRITE_POLICY)

/** 各云函数服务依赖中的策略读取端口（全部返回 v1 快照）；单项可用 overrides 替换为 `async () => null` 以模拟 503。 */
export function fixturePolicyPorts() {
  return {
    readLongTermRules: async () => careLongTermRulesV1(),
    readListRules: async () => userPlantListRulesV1(),
    readAssetRules: async () => userPlantAssetRulesV1(),
    readPublicSearchRules: async () => plantKnowledgePublicSearchRulesV1(),
    readPublicReadRules: async () => weatherPublicReadRulesV1(),
    readHttpWriteRules: async () => httpRequestWriteRulesV2(),
    /** 环境变量层默认（V2_SERVICE_SIGNATURE_*）：签名时钟偏差与 nonce 保留秒数。 */
    serviceSignature: { clockSkewSeconds: 300, nonceTtlSeconds: 600 },
    /** 环境变量层默认（V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS）：游客认领处理租约秒数。 */
    guestClaimLeaseSeconds: 30
  }
}
