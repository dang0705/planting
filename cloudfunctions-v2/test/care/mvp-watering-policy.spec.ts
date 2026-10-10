import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { resolveMvpWateringPolicy } from '../../src/configuration/mvp-watering-policy.js'
import { approvedV3Body, approvedV3Fields } from './watering/v3-policy-fixture.js'

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
    // 合同 2a 节：单通道光照参数随同一发布锁定。
    expect(result.snapshot).toMatchObject({ luxPerPpfd: { min: 50, max: 58 }, luxAnchorMinGhiWm2: 50,
      luxUncertainty: { meter: 0.1, camera_estimate: 0.3 }, luxAnchorMaxAgeDays: 30 })
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
    ['可用水（AW，Bilderback 2005 口径）上限超过持水量下限', (b: Record<string, any>) => { b.substrates.peat = { containerCapacity: { min: 0.3, max: 0.4 }, availableWater: { min: 0.2, max: 0.35 } } }],
    ['参考 VPD 超出有效域', (b: Record<string, any>) => { b.referenceVpdKpa = 5 }],
    ['缺少一种材料', (b: Record<string, any>) => { delete b.substrates.sphagnum }],
    ['缺 Lux 换算系数', (b: Record<string, any>) => { delete b.luxPerPpfd }],
    ['Lux 换算系数反序', (b: Record<string, any>) => { b.luxPerPpfd = { min: 58, max: 50 } }],
    ['摄像头误差超过 100%', (b: Record<string, any>) => { b.luxUncertainty.camera_estimate = 1.2 }],
    ['锚点最低辐射非正', (b: Record<string, any>) => { b.luxAnchorMinGhiWm2 = 0 }],
    ['Lux 有效天数非正', (b: Record<string, any>) => { b.luxAnchorMaxAgeDays = 0 }],
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

describe('MVP 浇水策略 v3 解析（盆型与基质参与干燥，用户 2026-10-10 审定）｜L1 unit_fake', () => {
  const v3 = approvedV3Body()
  const v3Release = (body: CanonicalJsonObject) => ({ ...body, releaseVersion: 'care-watering-mvp/v3.0.0', contentSha256: calculateCanonicalJsonSha256(body), releaseStatus: 'active', effectiveAt: '2026-10-08T00:00:00Z' })
  const changed = (change: (body: Record<string, any>) => void) => { const body = structuredClone(v3) as Record<string, any>; change(body); return v3Release(body) }
  it('V3-1 审定正文可解析，快照保留参考盆、参考可用水（AW，Bilderback 2005 口径）与植物伸缩指数', () => {
    const result = resolveMvpWateringPolicy(v3Release(v3), at)
    expect(result.status).toBe('available')
    if (result.status !== 'available') { throw new Error('unreachable') }
    expect(result.snapshot).toMatchObject(approvedV3Fields)
  })
  it('V3-2 缺任一新增字段、混入盆壁蒸发系数（未验证）或 v1 固定 TTL → 非法', () => {
    for (const key of ['referencePot', 'referenceAvailableWater', 'plantDemandVolumeExponent']) {
      expect(resolveMvpWateringPolicy(changed(body => { delete body[key] }), at)).toEqual({ status: 'invalid' })
    }
    expect(resolveMvpWateringPolicy(changed(body => { body.porousWallEvaporationRatio = { min: 0.4, max: 0.8 } }), at)).toEqual({ status: 'invalid' })
    expect(resolveMvpWateringPolicy(changed(body => { body.soilEvidenceTtlHours = 24 }), at)).toEqual({ status: 'invalid' })
  })
  it('V3-3 物理约束：参考盆留空最大值不小于盆高、参考可用水（AW，Bilderback 2005 口径）不在 (0,1]、指数反序 → 非法', () => {
    expect(resolveMvpWateringPolicy(changed(body => { body.referencePot = { topDiameterCm: 15, bottomDiameterCm: 11, heightCm: 3 } }), at)).toEqual({ status: 'invalid' })
    expect(resolveMvpWateringPolicy(changed(body => { body.referenceAvailableWater = 0 }), at)).toEqual({ status: 'invalid' })
    expect(resolveMvpWateringPolicy(changed(body => { body.plantDemandVolumeExponent = { min: 0.6, max: 0.5 } }), at)).toEqual({ status: 'invalid' })
  })
  it('V3-4 仓库内 v3 发布正文与审定值一致', () => {
    const released = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v3.json'), 'utf8')) as CanonicalJsonObject
    expect(released).toEqual(v3)
  })
})

