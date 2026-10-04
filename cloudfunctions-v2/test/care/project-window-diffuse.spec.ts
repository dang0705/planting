import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { projectIsotropicWindowDiffuse, replayIsotropicWindowDiffuse } from '../../src/care/light/project-window-diffuse.js'

/** unit_fake：独立 Expected 为 pvlib isotropic 官方公式及水平/竖直/向下平面的解析边界。 */
describe('unit_fake 均匀天空窗外散射基准', () => {
  const plane = { skyModel: 'isotropic' as const, reference: 'window_exterior', tiltDeg: 90 }
  it.each([[0, 200], [60, 150], [90, 100], [120, 50], [180, 0]])('DHI=200，倾角%s° → %s W/m²', (tiltDeg, expected) => {
    expect(projectIsotropicWindowDiffuse({ ...plane, tiltDeg, dhiWattsPerM2: 200 }).unobstructedSkyDiffuseWattsPerM2).toBeCloseTo(expected, 10)
  })
  it('没有 DHI 保留空值，有效零保持零', () => {
    expect(projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2: null }).unobstructedSkyDiffuseWattsPerM2).toBeNull()
    expect(projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2: 0 }).unobstructedSkyDiffuseWattsPerM2).toBe(0)
  })
  it('明确为窗外实验，不声称室内传播或生产准入', () => {
    expect(projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2: 200 })).toMatchObject({ scope: 'window_exterior_candidate', productionAdmission: false, planeReference: 'window_exterior', assumption: 'uniform_unobstructed_sky' })
  })
  it.each([-1, 181, NaN, Infinity, null, '90'])('拒绝非法倾角%s，即使辐射缺失', tiltDeg => {
    expect(() => projectIsotropicWindowDiffuse({ ...plane, tiltDeg, dhiWattsPerM2: null } as never)).toThrow(TypeError)
  })
  it.each([-1, NaN, Infinity, undefined, '200'])('拒绝非法DHI%s', dhiWattsPerM2 => {
    expect(() => projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2 } as never)).toThrow(TypeError)
  })
  it('必须显式选定均匀天空，不设默认为均匀或擅自支持其他模型', () => {
    expect(() => projectIsotropicWindowDiffuse({ ...plane, skyModel: undefined, dhiWattsPerM2: 200 } as never)).toThrow(TypeError)
  })
})

describe('unit_real_data DHI真实制品→时间归一化→窗外散射；无网络替身之外的模块替换', () => {
  it('24条真实区间保留来源和前一小时均值；竖窗逐条按独立公式核验', () => {
    const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
    const context = { series: 'hourly' as const, sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') }
    const result = replayIsotropicWindowDiffuse(raw, context, { skyModel: 'isotropic', reference: 'window_exterior', tiltDeg: 90 })
    expect(result.radiation.sourceRef).toBe(context.sourceRef)
    expect(result.intervals).toHaveLength(24)
    result.intervals.forEach((interval, index) => {
      expect(interval.intervalEndMs).toBe(raw.hourly.time[index] * 1000)
      expect(interval.intervalEndMs - interval.intervalStartMs).toBe(3_600_000)
      expect(interval.semantics).toBe('interval_mean')
      const dhi = raw.hourly.diffuse_radiation[index]
      if (dhi === null) {
        expect(interval.diffuse.unobstructedSkyDiffuseWattsPerM2).toBeNull()
      } else {
        expect(interval.diffuse.unobstructedSkyDiffuseWattsPerM2).toBeCloseTo(dhi / 2, 10)
      }
      expect(interval.diffuse.productionAdmission).toBe(false)
    })
  })
})
