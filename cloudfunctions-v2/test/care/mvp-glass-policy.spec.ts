import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveMvpGlassPolicy, selectMvpGlassTransmission } from '../../src/configuration/mvp-glass-policy.js'
import { replayMvpIndoorNaturalLight } from '../../src/care/application/replay-mvp-indoor-natural-light.js'
import { findProjectRoot } from '../support/project-root.js'

/** 独立Expected来自mvp-glass-policy-contract.md；用Node计算合同规定正文，不调用被测摘要函数造答案。 */
const sourceRef = 'lbl-clear-glass-experiment'
const body = { contractVersion: 'mvp-glass-policy/v1', scopeCode: 'care_mvp_glass', approximation: 'clear_glass_broadband_proxy', singleTransmission: 0.83, doubleTransmission: 0.70, sourceRef }
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
const release = { ...body, releaseVersion: 'experiment-1', contentSha256: sha, releaseStatus: 'active', effectiveAt: '2026-10-04T00:00:00Z', expiresAt: '2026-10-05T00:00:00Z' }
const capturedAt = '2026-10-04T12:00:00Z'

describe('unit_fake MVP玻璃版本解析与层数选择', () => {
  it('锁定正文摘要、来源和通用配置快照，单层双层选择各自值且只读', () => {
    const result = resolveMvpGlassPolicy(release, capturedAt)
    expect(result.status).toBe('available')
    if (result.status !== 'available') {throw new Error('Expected available')}
    expect(result.snapshot.contentSha256).toBe(sha)
    expect(result.snapshot.configurationSnapshot.policyReleases).toEqual([{ scopeCode: 'care_mvp_glass', releaseVersion: 'experiment-1', sha256: sha }])
    expect(Object.isFrozen(result.snapshot)).toBe(true)
    for (const [layer, expected] of [['single', 0.83], ['double', 0.70]] as const) {
      const selected = selectMvpGlassTransmission(result.snapshot, layer)
      expect(selected.direct).toEqual({ lower: expected, upper: expected })
      expect(selected.diffuse).toEqual({ lower: expected, upper: expected })
      expect(selected.sourceRef).toContain(sha)
      expect(selected.sourceRef).toContain('experiment-1')
    }
    expect(selectMvpGlassTransmission(result.snapshot, null)).toMatchObject({ direct: null, diffuse: null })
    expect(() => selectMvpGlassTransmission(result.snapshot, 'unknown' as never)).toThrow()
  })
  it.each([null, undefined, { ...release, releaseStatus: 'draft' }, { ...release, releaseStatus: 'verified' }, { ...release, releaseStatus: 'retired' }])('未发布或缺失策略不偷偷采用候选默认%j', value => {
    expect(resolveMvpGlassPolicy(value, capturedAt).status).toBe('unavailable')
  })
  it.each([
    { ...release, contentSha256: '0'.repeat(64) },
    { ...release, sourceRef: 'changed-without-new-digest' },
    { ...release, singleTransmission: -0.1 },
    { ...release, doubleTransmission: 1.1 },
    { ...release, singleTransmission: NaN },
    { ...release, unknownField: true },
    { ...release, effectiveAt: '2026-02-30T00:00:00Z' },
    { ...release, expiresAt: '2026-10-03T00:00:00Z' },
  ])('正文/时间/未知字段非法时拒绝%j', value => {
    expect(resolveMvpGlassPolicy(value, capturedAt).status).toBe('invalid')
  })
  it('生效边界包含起点、失效边界排除终点，不接受无时区日期', () => {
    expect(resolveMvpGlassPolicy(release, release.effectiveAt).status).toBe('available')
    expect(resolveMvpGlassPolicy(release, '2026-10-03T23:59:59Z').status).toBe('not_effective')
    expect(resolveMvpGlassPolicy(release, release.expiresAt).status).toBe('unavailable')
    expect(resolveMvpGlassPolicy(release, '2026-10-04T12:00:00').status).toBe('invalid')
  })
  it('零透射不补默认；不强制双层必须小于单层，返回内容与发布原对象隔离', () => {
    const payload = { ...body, singleTransmission: 0, doubleTransmission: 1 }
    const candidate = { ...release, ...payload, contentSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') }
    const result = resolveMvpGlassPolicy(candidate, capturedAt)
    if (result.status !== 'available') {throw new Error('Expected available')}
    candidate.singleTransmission = 0.9
    expect(selectMvpGlassTransmission(result.snapshot, 'single').direct).toEqual({ lower: 0, upper: 0 })
    expect(selectMvpGlassTransmission(result.snapshot, 'double').diffuse).toEqual({ lower: 1, upper: 1 })
  })
})

/** unit_real_data：真实天气→归一化/太阳/两通道传播；策略发布是测试记录，无数据库/HTTP或现场测量证明。 */
describe('unit_real_data 用户玻璃分类到室内自然光回放', () => {
  const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
  const context = { series: 'hourly' as const, sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') }
  const target = { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'window', tiltDeg: 90, azimuthDeg: 180 }, plantReference: 'plant', plant: { xM: 0, yM: 0, perpendicularDistanceM: 1 }, apertures: [{ reference: 'window', leftM: -1, rightM: 1, bottomM: 0, topM: 1 }], skyModel: 'isotropic' as const }
  const curtain = { sourceRef: 'explicit-open-curtain', direct: { lower: 1, upper: 1 }, diffuse: { lower: 1, upper: 1 } }
  it.each([['single', 0.83], ['double', 0.70]] as const)('只输入%s分类即可进入既有散射传播，玻璃系数只应用一次', (layer, value) => {
    const result = replayMvpIndoorNaturalLight(raw, context, target, curtain, layer, release, capturedAt)
    if (result.status !== 'available') {throw new Error('Expected available')}
    const factor = Math.SQRT2 / Math.PI * Math.atan(1 / Math.SQRT2)
    result.replay.intervals.forEach((interval, i) => {
      const dhi = raw.hourly.diffuse_radiation[i]
      if (dhi === null) {expect(interval.diffuseWattsPerM2).toBeNull()}
      else {expect(interval.diffuseWattsPerM2?.lower).toBeCloseTo(dhi * factor * value, 10)}
    })
    expect(result.replay.productionAdmission).toBe(false)
    expect(result.policy.contentSha256).toBe(sha)
  })
  it('未确认层数保留缺证据；缺有效发布不运行传播', () => {
    const unknown = replayMvpIndoorNaturalLight(raw, context, target, curtain, null, release, capturedAt)
    if (unknown.status !== 'available') {throw new Error('Expected available')}
    expect(unknown.replay.missingTransmission).toEqual(['glass.direct', 'glass.diffuse'])
    expect(unknown.replay.intervals.every(i => i.totalWattsPerM2 === null)).toBe(true)
    // 不合法原始天气也不应被消费：无策略提前返回，不能偷偷启用默认。
    expect(replayMvpIndoorNaturalLight({}, context, target, curtain, 'single', null, capturedAt)).toEqual({ status: 'unavailable' })
  })
})
