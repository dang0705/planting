import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveMvpWateringPolicy } from '../../src/configuration/mvp-watering-policy.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1（unit_real_data：读取已批准 v1 制品与新 v2 制品）。Expected：用户 2026-10-09 裁决 U6——新增 care-watering-mvp/v2，
 * 以 soilEvidenceFallbackHours=24、soilEvidenceMaxHours=72 替代 soilEvidenceTtlHours，其余数值与 v1 相同；v1 保持兼容。
 */
const root = findProjectRoot()
const load = (version: 'v1' | 'v2') => JSON.parse(readFileSync(join(root, `cloudfunctions-v2/models/care/mvp-watering-policy-release.${version}.json`), 'utf8')) as CanonicalJsonObject
const capturedAt = '2026-10-09T04:00:00.000Z'
const release = (body: CanonicalJsonObject) => ({ ...body, releaseVersion: `${String(body.contractVersion)}.0`, contentSha256: calculateCanonicalJsonSha256(body), releaseStatus: 'active', effectiveAt: '2026-10-01T00:00:00Z' })

describe('care-watering-mvp/v2 策略', () => {
  it('v2 制品 = v1 去掉 soilEvidenceTtlHours，换成回退 24h / 封顶 72h，合同版本 v2', () => {
    const { soilEvidenceTtlHours: _ttl, contractVersion: _v1, ...v1Rest } = load('v1')
    const { soilEvidenceFallbackHours, soilEvidenceMaxHours, contractVersion, ...v2Rest } = load('v2')
    expect(contractVersion).toBe('care-watering-mvp/v2')
    expect({ soilEvidenceFallbackHours, soilEvidenceMaxHours }).toEqual({ soilEvidenceFallbackHours: 24, soilEvidenceMaxHours: 72 })
    expect(v2Rest).toEqual(v1Rest)
  })
  it('v2 发布可解析，快照携带回退与封顶、无固定 TTL', () => {
    const resolution = resolveMvpWateringPolicy(release(load('v2')), capturedAt)
    expect(resolution.status).toBe('available')
    if (resolution.status !== 'available') { return }
    expect(resolution.snapshot).toMatchObject({ contractVersion: 'care-watering-mvp/v2', soilEvidenceFallbackHours: 24, soilEvidenceMaxHours: 72 })
    expect('soilEvidenceTtlHours' in resolution.snapshot).toBe(false)
  })
  it('v1 发布仍可解析（兼容旧固定 TTL）', () => {
    const resolution = resolveMvpWateringPolicy(release(load('v1')), capturedAt)
    expect(resolution.status).toBe('available')
    if (resolution.status === 'available') { expect(resolution.snapshot).toMatchObject({ contractVersion: 'care-watering-mvp/v1', soilEvidenceTtlHours: 24 }) }
  })
  it('v2 正文摘要正确但额外携带旧 TTL 字段 → invalid（严格白名单，非摘要不符）', () => {
    const body = load('v2')
    const withTtl = { ...release(body), soilEvidenceTtlHours: 24 }
    expect(resolveMvpWateringPolicy(withTtl, capturedAt)).toEqual({ status: 'invalid' })
  })
  it.each([
    ['v2 混入旧 TTL 字段', { ...load('v2'), soilEvidenceTtlHours: 24 }],
    ['v2 缺封顶', (({ soilEvidenceMaxHours: _m, ...rest }) => rest)(load('v2'))],
    ['v2 封顶小于回退', { ...load('v2'), soilEvidenceMaxHours: 12 }],
    ['v2 回退非正', { ...load('v2'), soilEvidenceFallbackHours: 0 }],
    ['v1 混入 v2 字段', { ...load('v1'), soilEvidenceMaxHours: 72 }]
  ])('%s → invalid', (_name, body) => {
    expect(resolveMvpWateringPolicy(release(body as CanonicalJsonObject), capturedAt)).toEqual({ status: 'invalid' })
  })
})
