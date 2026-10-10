import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveMvpWateringPolicy } from '../../../src/configuration/mvp-watering-policy.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../../src/foundation/json/canonical-json-sha256.js'
import { findProjectRoot } from '../../support/project-root.js'

/**
 * 测试夹具：按用户 2026-10-10 审定值构造 `care-watering-mvp/v3` 发布正文（v2 正文 + 审定新增字段），
 * 并经真实解析器得到请求快照。Expected 来源是审定结果本身，不读取产品侧的 v3 发布文件。
 */
export const approvedV3Fields = {
  contractVersion: 'care-watering-mvp/v3',
  referencePot: { topDiameterCm: 15, bottomDiameterCm: 11, heightCm: 13 },
  referenceAvailableWater: 0.3,
  plantDemandVolumeExponent: { min: 0, max: 0.52 },
  cultivationRetention: { min: 0.8, max: 1.25 },
} as const

/** 读取已发布正文（v1/v2）原文。 */
export const releaseBody = (version: 'v1' | 'v2') =>
  JSON.parse(readFileSync(join(findProjectRoot(), `cloudfunctions-v2/models/care/mvp-watering-policy-release.${version}.json`), 'utf8')) as CanonicalJsonObject

/** 审定的 v3 正文：v2 正文 + 审定字段。 */
export const approvedV3Body = (): CanonicalJsonObject => ({ ...releaseBody('v2'), ...approvedV3Fields }) as unknown as CanonicalJsonObject

/** 经真实解析器得到快照；解析失败直接抛出，使用例 RED 时原因清晰。 */
export function resolvedPolicy(body: CanonicalJsonObject, now: number) {
  const resolution = resolveMvpWateringPolicy({ ...body, releaseVersion: `${String(body.contractVersion)}.0.0`, contentSha256: calculateCanonicalJsonSha256(body),
    releaseStatus: 'active', effectiveAt: '2026-10-01T00:00:00Z' }, new Date(now).toISOString())
  if (resolution.status !== 'available') { throw new Error(`夹具策略必须可解析：${resolution.status}`) }
  return resolution.snapshot
}
