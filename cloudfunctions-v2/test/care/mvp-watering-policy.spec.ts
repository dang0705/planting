import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { resolveMvpWateringPolicy } from '../../src/configuration/mvp-watering-policy.js'

/**
 * Expected：models/care/mvp-watering-test-matrix.md 第 D 节（合同第1～6节＋配置治理不可变 release／SHA／无默认）。
 * 层次 L1 unit_fake：不访问数据库；摘要用既有通用工具独立计算，不调用 SUT 的摘要函数。
 */
const payload = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v1.json'), 'utf8')) as CanonicalJsonObject
const meta = (body: CanonicalJsonObject) => ({
  releaseVersion: 'care-watering-mvp/v1.0.0', contentSha256: calculateCanonicalJsonSha256(body),
  releaseStatus: 'active', effectiveAt: '2026-10-08T00:00:00Z',
})
const release = (body: CanonicalJsonObject = payload, overrides: Record<string, unknown> = {}) => ({ ...body, ...meta(body), ...overrides })
const at = '2026-10-08T06:00:00Z'
/** 修改正文后重算摘要，确保拒绝来自语义校验而非摘要不符。 */
const mutated = (change: (body: Record<string, any>) => void) => { const body = structuredClone(payload) as Record<string, any>; change(body); return release(body) }

describe('MVP 浇水策略发布解析｜L1 unit_fake', () => {
  it('Happy：合法活动发布可用，快照保留正文、版本与配置快照引用', () => {
    const result = resolveMvpWateringPolicy(release(), at)
    expect(result.status).toBe('available')
    if (result.status !== 'available') { throw new Error('unreachable') }
    expect(result.snapshot).toMatchObject({ ...payload, releaseVersion: 'care-watering-mvp/v1.0.0', capturedAt: at })
    expect(result.snapshot.configurationSnapshot.policyReleases).toEqual([
      { scopeCode: 'care_mvp_watering', releaseVersion: 'care-watering-mvp/v1.0.0', sha256: calculateCanonicalJsonSha256(payload) },
    ])
  })
  it('U1：没有发布不可用；缺必填字段非法', () => {
    expect(resolveMvpWateringPolicy(null, at)).toEqual({ status: 'unavailable' })
    expect(resolveMvpWateringPolicy(undefined, at)).toEqual({ status: 'unavailable' })
    expect(resolveMvpWateringPolicy(mutated(body => { delete body.leachingFraction }), at)).toEqual({ status: 'invalid' })
  })
  it('U2：生效起点包含、失效终点排除、生效前未生效', () => {
    expect(resolveMvpWateringPolicy(release(), '2026-10-08T00:00:00Z').status).toBe('available')
    expect(resolveMvpWateringPolicy(release(payload, { expiresAt: '2026-10-09T00:00:00Z' }), '2026-10-09T00:00:00Z')).toEqual({ status: 'unavailable' })
    expect(resolveMvpWateringPolicy(release(), '2026-10-07T23:59:59Z')).toEqual({ status: 'not_effective' })
  })
  it('U3：摘要不符、多余字段、非 UTC 捕获时刻非法', () => {
    expect(resolveMvpWateringPolicy(release(payload, { contentSha256: '0'.repeat(64) }), at)).toEqual({ status: 'invalid' })
    expect(resolveMvpWateringPolicy(release(payload, { defaultAmountMl: 200 }), at)).toEqual({ status: 'invalid' })
    expect(resolveMvpWateringPolicy(release(), '2026-10-08 06:00')).toEqual({ status: 'invalid' })
  })
  it.each([
    ['区间反序', (b: Record<string, any>) => { b.headspaceCm = { min: 3, max: 1 } }],
    ['比例越界', (b: Record<string, any>) => { b.remainingFraction.wet = { min: 0.6, max: 1.1 } }],
    ['排出比例达到 1', (b: Record<string, any>) => { b.leachingFraction = { min: 0.1, max: 1 } }],
    ['易利用水上限超过持水量下限', (b: Record<string, any>) => { b.substrates.peat = { containerCapacity: { min: 0.3, max: 0.4 }, availableWater: { min: 0.2, max: 0.35 } } }],
    ['参考 VPD 超出有效域', (b: Record<string, any>) => { b.referenceVpdKpa = 5 }],
    ['缺少一种材料', (b: Record<string, any>) => { delete b.substrates.sphagnum }],
  ])('U3：%s 的正文即使摘要正确也非法', (_name, change) => {
    expect(resolveMvpWateringPolicy(mutated(change), at)).toEqual({ status: 'invalid' })
  })
  it.each(['draft', 'verified', 'retired'])('Reverse：%s 状态不可用，不返回参数', status => {
    expect(resolveMvpWateringPolicy(release(payload, { releaseStatus: status }), at)).toEqual({ status: 'unavailable' })
  })
  it('U4：快照冻结，修改原发布对象不影响已返回快照', () => {
    const source = release() as Record<string, any>
    const result = resolveMvpWateringPolicy(source, at)
    if (result.status !== 'available') { throw new Error('unreachable') }
    source.leachingFraction.max = 0.9
    expect(result.snapshot.leachingFraction.max).toBe(0.2)
    expect(Object.isFrozen(result.snapshot)).toBe(true)
  })
})
