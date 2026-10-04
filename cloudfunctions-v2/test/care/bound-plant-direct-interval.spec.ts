import { describe, expect, it } from 'vitest'
import { boundPlantDirectInterval } from '../../src/care/light/bound-plant-direct-interval.js'

const noon = Date.parse('2026-01-01T12:00:00Z')
const input = () => ({ intervalStartMs: noon - 1800000, intervalEndMs: noon + 1800000,
  latitudeDeg: 0, longitudeDeg: 0.72604224,
  plane: { reference: 'south-window', tiltDeg: 90, azimuthDeg: 180 },
  plantReference: 'target', plant: { xM: 0, yM: 1, perpendicularDistanceM: 0.5 },
  apertures: [{ reference: 'opening', leftM: -1, rightM: 1, bottomM: 0, topM: 3 }],
})

/** L1 unit_fake：Expected来自太阳导数及矩形半空间合同；无采样极值或SUT反推。 */
describe('unit_fake 完整时段植物点资格界限', () => {
  it('一小时近窗全段可达，保留窗面及目标各自语义', () => {
    const result = boundPlantDirectInterval(input())
    expect(result).toMatchObject({ state: 'all_reachable', lower: 1, upper: 1, scope: 'model_only', plantReference: 'target', segmentCount: 1 })
    expect(result.windowProjection.lower).toBeCloseTo(0.2605425935963377, 8)
    expect(result.windowProjection.upper).toBeCloseTo(0.5228031076853659, 8)
  })
  it('一小时2米目标在开口上方，不能据中点窗面亮度误报', () => {
    const candidate = input(); candidate.plant.perpendicularDistanceM = 2
    expect(boundPlantDirectInterval(candidate)).toMatchObject({ state: 'all_blocked', lower: 0, upper: 0 })
  })
  it('夜间整段不可达', () => {
    const candidate = input(); candidate.intervalStartMs -= 43200000; candidate.intervalEndMs -= 43200000
    expect(boundPlantDirectInterval(candidate)).toMatchObject({ state: 'all_blocked', lower: 0, upper: 0 })
  })
  it('北窗背面整段不可达', () => {
    const candidate = input(); candidate.plane.azimuthDeg = 0
    expect(boundPlantDirectInterval(candidate)).toMatchObject({ state: 'all_blocked', lower: 0, upper: 0 })
  })
  it('窄墙体的一分钟时段全段不可达，不用包围盒', () => {
    const candidate = input(); candidate.intervalStartMs = noon - 30000; candidate.intervalEndMs = noon + 30000
    candidate.apertures = [
      { reference: 'left', leftM: -1, rightM: -0.1, bottomM: 0, topM: 3 },
      { reference: 'right', leftM: 0.1, rightM: 1, bottomM: 0, topM: 3 },
    ]
    expect(boundPlantDirectInterval(candidate)).toMatchObject({ state: 'all_blocked', lower: 0, upper: 0 })
  })
  it('窗框边缘保留不确定范围，不把中点状态解释成整段可达', () => {
    const candidate = input(); candidate.apertures[0]!.leftM = 0
    expect(boundPlantDirectInterval(candidate)).toMatchObject({ state: 'mixed_or_uncertain', lower: 0, upper: 1 })
  })
  it('长时段证据不够紧时未知，不宣称必然发生变化', () => {
    const candidate = input(); candidate.intervalStartMs = noon - 21600000; candidate.intervalEndMs = noon + 21600000
    expect(boundPlantDirectInterval(candidate)).toMatchObject({ state: 'mixed_or_uncertain', lower: 0, upper: 1 })
  })
  it('UTC跨年分段夜间界限联合，保留两段计算', () => {
    const candidate = input(); candidate.intervalStartMs = Date.parse('2025-12-31T23:40:00Z'); candidate.intervalEndMs = Date.parse('2026-01-01T00:20:00Z')
    expect(boundPlantDirectInterval(candidate)).toMatchObject({ state: 'all_blocked', segmentCount: 2 })
  })
  it.each([
    { ...input(), plane: { ...input().plane, tiltDeg: 89 } },
    { ...input(), plantReference: '' },
    { ...input(), apertures: [] },
    { ...input(), plant: { xM: 0, yM: 1, perpendicularDistanceM: 0 } },
    { ...input(), latitudeDeg: NaN },
    { ...input(), intervalEndMs: noon - 1800000 },
  ])('非法时段、地点或目标几何拒绝', candidate => {
    expect(() => boundPlantDirectInterval(candidate)).toThrow()
  })
  it('线性式不能表示时拒绝，不返回伪造的确定性', () => {
    const candidate = input(); candidate.plant.xM = 1e308; candidate.apertures[0]!.leftM = -1e308
    expect(() => boundPlantDirectInterval(candidate)).toThrow('不可表示')
  })
  it('输入不修改', () => {
    const candidate = input(); const before = structuredClone(candidate)
    boundPlantDirectInterval(candidate); expect(candidate).toEqual(before)
  })
})
