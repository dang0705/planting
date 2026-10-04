import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { replayIndoorNaturalLight } from '../../src/care/application/replay-indoor-natural-light.js'

/**
 * L3 unit_real_data：真实气象制品通过既有双通道传播，再注入透明玻璃近似候选。
 * 独立依据：LBL Buildings v1.0 的 ID102，太阳透射0.834、两面反射0.075。
 * 双层简化组合0.834²/(1−0.075²)约0.6995；本实验取单层0.83、双层0.70。
 * 这是宽带能量近似，不证明实际PAR透射、现场误差或生产发布；无Provider替身。
 */
describe('unit_real_data MVP透明玻璃近似复用既有传播', () => {
  const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
  const context = { series: 'hourly' as const, sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') }
  const target = {
    latitudeDeg: 31.23, longitudeDeg: 121.47,
    plane: { reference: 'window', tiltDeg: 90, azimuthDeg: 180 },
    plantReference: 'plant', plant: { xM: 0, yM: 0, perpendicularDistanceM: 1 },
    apertures: [{ reference: 'wide-window', leftM: -10, rightM: 10, bottomM: 0, topM: 8 }],
    skyModel: 'isotropic' as const,
  }
  const sourceRef = 'lbl-buildings-v1.0-ID102-clear-glass-mvp-candidate'
  const losses = (value: number) => ({
    glass: { sourceRef, direct: { lower: value, upper: value }, diffuse: { lower: value, upper: value } },
    curtain: { sourceRef: 'explicit-open-curtain-experiment', direct: { lower: 1, upper: 1 }, diffuse: { lower: 1, upper: 1 } },
  })

  it.each([['single', 0.83], ['double', 0.70]] as const)('%s近似只计一次玻璃损失，同时保留两通道与候选状态', (_, value) => {
    const reference = replayIndoorNaturalLight(raw, context, target, losses(1))
    const candidate = replayIndoorNaturalLight(raw, context, target, losses(value))
    expect(reference.intervals.some(i => (i.directWattsPerM2?.lower ?? 0) > 0)).toBe(true)
    expect(reference.intervals.some(i => (i.diffuseWattsPerM2?.lower ?? 0) > 0)).toBe(true)
    candidate.intervals.forEach((interval, index) => {
      const previous = reference.intervals[index]!
      for (const key of ['directWattsPerM2', 'diffuseWattsPerM2', 'totalWattsPerM2'] as const) {
        if (previous[key] === null) { expect(interval[key]).toBeNull() } else {
          expect(interval[key]?.lower).toBeCloseTo(previous[key]!.lower * value, 10)
          expect(interval[key]?.upper).toBeCloseTo(previous[key]!.upper * value, 10)
        }
      }
    })
    expect(candidate.transmission.glass).toEqual(losses(value).glass)
    expect(candidate.productionAdmission).toBe(false)
  })
})
