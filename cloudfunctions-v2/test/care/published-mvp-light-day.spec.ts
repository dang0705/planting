import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { findProjectRoot } from '../support/project-root.js'
import { replayPublishedMvpLightDay } from '../../src/care/application/replay-published-mvp-light-day.js'
import { resolveMvpGlassPolicy } from '../../src/configuration/mvp-glass-policy.js'

const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
const body = { approximation: 'clear_glass_broadband_proxy', contractVersion: 'mvp-glass-policy/v1', doubleTransmission: 0.70, scopeCode: 'care_mvp_glass', singleTransmission: 0.83, sourceRef: 'explicit-clear-glass-candidate' }
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
const capturedAt = '2026-10-04T12:00:00Z'
const resolution = resolveMvpGlassPolicy({ ...body, releaseVersion: 'experiment-1', contentSha256: sha, releaseStatus: 'active', effectiveAt: '2026-10-04T00:00:00Z' }, capturedAt)
if (resolution.status !== 'available') { throw new Error('策略测试制品无效') }
const input = {
  raw, capturedAt,
  context: { series: 'hourly' as const, sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') },
  target: { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'window', tiltDeg: 90, azimuthDeg: 180 }, plantReference: 'plant', plant: { xM: 0, yM: 0, perpendicularDistanceM: 1 }, apertures: [{ reference: 'window', leftM: -1, rightM: 1, bottomM: 0, topM: 1 }], skyModel: 'isotropic' as const },
  curtain: { sourceRef: 'explicit-open-curtain', direct: { lower: 1, upper: 1 }, diffuse: { lower: 1, upper: 1 } },
  layer: 'double' as const,
  conversion: { sourceRef: 'explicit-numeric-experiment', unit: 'micromol_per_joule' as const, direct: { lower: 2, upper: 2 }, diffuse: { lower: 2, upper: 2 } },
  day: { date: '2026-10-04', timezone: 'Asia/Shanghai', startMs: Date.parse('2026-10-03T16:00:00Z'), endMs: Date.parse('2026-10-04T16:00:00Z') },
}

/** unit_fake：仅替换发布读取端口；辐射/太阳/传播/积分真实执行，发布是测试制品。 */
describe('unit_fake 活动玻璃版本到完整光照回放', () => {
  it('读取一次锁定快照，双层按发布值传播，天气缺一小时不输出全天DLI', async () => {
    const read = vi.fn().mockResolvedValue({ ...resolution, releaseRef: 'bpr_glass_sample01' })
    const result = await replayPublishedMvpLightDay(input, { read })
    expect(read).toHaveBeenCalledExactlyOnceWith(capturedAt)
    if (result.status !== 'available') { throw new Error('应得到回放') }
    expect(result.releaseRef).toBe('bpr_glass_sample01')
    expect(result.policy.contentSha256).toBe(sha)
    expect(result.replay.total.coveredMs).toBe(23 * 3600_000)
    expect(result.replay.dailyIntegralMolPerM2).toBeNull()
    expect(result.replay.productionAdmission).toBe(false)
    const factor = Math.SQRT2 / Math.PI * Math.atan(1 / Math.SQRT2)
    result.replay.intervals.forEach((interval, i) => {
      const dhi = raw.hourly.diffuse_radiation[i]
      if (dhi !== null) { expect(interval.diffusePpfd?.lower).toBeCloseTo(dhi * factor * 0.70 * 2, 10) }
    })
  })
  it.each(['unavailable', 'invalid', 'not_effective'] as const)('%s不使用默认策略、不消费非法辐射', async status => {
    const read = vi.fn().mockResolvedValue({ status })
    expect(await replayPublishedMvpLightDay({ ...input, raw: {} }, { read })).toEqual({ status })
    expect(read).toHaveBeenCalledOnce()
  })
  it('未知层数保留缺证据，缺换算也不能填默认系数', async () => {
    const reader = { read: vi.fn().mockResolvedValue({ ...resolution, releaseRef: 'bpr_glass_sample01' }) }
    const unknown = await replayPublishedMvpLightDay({ ...input, layer: null }, reader)
    if (unknown.status !== 'available') { throw new Error('应运行回放') }
    expect(unknown.replay.total.status).toBe('none')
    expect(unknown.replay.naturalLight.missingTransmission).toEqual(['glass.direct', 'glass.diffuse'])
    const missing = await replayPublishedMvpLightDay({ ...input, conversion: { ...input.conversion, diffuse: null } }, reader)
    if (missing.status !== 'available') { throw new Error('应运行回放') }
    expect(missing.replay.total.status).toBe('none')
    expect(missing.replay.dailyIntegralMolPerM2).toBeNull()
  })
  it('数据库失败不伪造不可用结果或光照成功', async () => {
    await expect(replayPublishedMvpLightDay(input, { read: vi.fn().mockRejectedValue(new Error('database unavailable')) })).rejects.toThrow('database unavailable')
  })
})
