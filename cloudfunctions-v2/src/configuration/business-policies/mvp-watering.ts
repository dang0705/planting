import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import { resolveMvpWateringPolicy, type MvpWateringPolicySnapshot } from '../mvp-watering-policy.js'
import type { TypedPolicyDefinition } from './typed-policy.js'

/** 发布校验时使用的固定捕获时刻（只用于让解析器完成时间类校验，不代表真实生效时间）。 */
const validationInstant = '2026-10-10T00:00:00Z'

/**
 * 浇水策略（care / mvp_watering）在策略发布 CLI 中的类型定义：复用既有解析器，按正文补齐元数据后校验。
 * 读取路径仍由 mysql-mvp-watering-policy-reader 负责（它需要请求级快照与配置快照引用）。
 */
export const MVP_WATERING_POLICY: TypedPolicyDefinition<MvpWateringPolicySnapshot> = Object.freeze({
  domainCode: 'care',
  policyCode: 'mvp_watering',
  schemaVersions: Object.freeze(['care-watering-mvp/v4', 'care-watering-mvp/v3', 'care-watering-mvp/v2', 'care-watering-mvp/v1']),
  resolve: (document: unknown, schemaVersion: string) => {
    if (document === null || typeof document !== 'object' || Array.isArray(document)) { return null }
    if ((document as Record<string, unknown>).contractVersion !== schemaVersion) { return null }
    const body = document as CanonicalJsonObject
    const resolution = resolveMvpWateringPolicy({ ...body, releaseVersion: `${schemaVersion}.validate`, contentSha256: calculateCanonicalJsonSha256(body),
      releaseStatus: 'active', effectiveAt: validationInstant }, validationInstant)
    return resolution.status === 'available' ? resolution.snapshot : null
  },
})
