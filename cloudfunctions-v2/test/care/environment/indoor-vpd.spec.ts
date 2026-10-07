import { describe, expect, it } from 'vitest'
import { deriveMeasuredIndoorVpd, derivePlantClimateVpdAnchor } from '../../../src/care/environment/derive-indoor-vpd.js'

const measured = () => ({ temperatureC: 0, relativeHumidityPercent: 50, temperatureUnit: 'celsius' as const, humidityUnit: 'percent' as const, observedAtMs: 1_000, positionRef: 'plant-zone', sourceRef: 'synthetic-measurement', inputSnapshotRef: 'synthetic-locked-snapshot', sourceScope: 'indoor' as const, evidenceKind: 'measurement' as const, confirmed: true })
const climate = () => ({ temperatureRangeC: { min: 10, max: 20 }, humidityRangePercent: { min: 40, max: 60 }, sourceRef: 'synthetic-reviewed-traits', inputSnapshotRef: 'synthetic-knowledge-snapshot' })

/** L1 unit_fake：FAO公式/例3表值和已确认来源边界为Expected，无测试替身。 */
describe('unit_fake 室内实测VPD，不把天气标为室内', () => {
  it.each([[-237, 50], [-231.7, 99.99999999999999]])('浮点下溢不能把%s°C、%s%%RH的正值伪造成零', (temperatureC, relativeHumidityPercent) => {
    expect(() => deriveMeasuredIndoorVpd({ ...measured(), temperatureC, relativeHumidityPercent })).toThrow(RangeError)
  })
  it('0°C与50%RH是有效点值，保留来源和快照', () => {
    expect(deriveMeasuredIndoorVpd(measured())).toMatchObject({ status: 'available', productionAdmission: false, vpdKpa: 0.3054, saturationPressureKpa: 0.6108, sourceScope: 'indoor', inputSnapshotRef: 'synthetic-locked-snapshot' })
  })
  it('RH零和完全饱和分别是有效干燥与零VPD', () => {
    expect(deriveMeasuredIndoorVpd({ ...measured(), relativeHumidityPercent: 0 })).toMatchObject({ vpdKpa: 0.6108 })
    expect(deriveMeasuredIndoorVpd({ ...measured(), relativeHumidityPercent: 100 })).toMatchObject({ vpdKpa: 0 })
  })
  it.each([[24.5, 3.075], [15, 1.705]])('FAO例3饱和压：%s°C', (temperatureC, expected) => {
    const result = deriveMeasuredIndoorVpd({ ...measured(), temperatureC })
    if (result.status !== 'available') { throw new Error('数学制品应可用') }
    expect(result.saturationPressureKpa).toBeCloseTo(expected, 3)
  })
  it('室外数据、估算或未确认实测不伪造室内有效结果', () => {
    for (const input of [{ ...measured(), sourceScope: 'outdoor' as const }, { ...measured(), evidenceKind: 'estimate' as const }, { ...measured(), confirmed: false }]) {
      expect(deriveMeasuredIndoorVpd(input)).toMatchObject({ status: 'insufficient_evidence', productionAdmission: false })
    }
  })
  it('缺温度或湿度不补全球参考点', () => {
    expect(deriveMeasuredIndoorVpd({ ...measured(), temperatureC: null })).toMatchObject({ status: 'insufficient_evidence' })
    expect(deriveMeasuredIndoorVpd({ ...measured(), relativeHumidityPercent: null })).toMatchObject({ status: 'insufficient_evidence' })
  })
  it('温湿度单位、百分数、数学域和来源非法时拒绝', () => {
    for (const input of [{ ...measured(), temperatureUnit: 'kelvin' }, { ...measured(), humidityUnit: 'fraction' }, { ...measured(), relativeHumidityPercent: 101 }, { ...measured(), temperatureC: -237.3 }, { ...measured(), temperatureC: NaN }, { ...measured(), sourceRef: '' }]) {
      expect(() => deriveMeasuredIndoorVpd(input as never)).toThrow()
    }
  })
  it('安全整数但不能表示日期的采集时刻拒绝', () => {
    expect(() => deriveMeasuredIndoorVpd({ ...measured(), observedAtMs: Number.MAX_SAFE_INTEGER })).toThrow()
  })
  it('植物区域实测仍保留自身来源范围，不改输入', () => {
    const input = { ...measured(), sourceScope: 'plant_zone' as const }; const before = structuredClone(input)
    expect(deriveMeasuredIndoorVpd(input)).toMatchObject({ sourceScope: 'plant_zone' })
    expect(input).toEqual(before)
  })
})

describe('unit_fake 植物气候中点参考，不是最适值或日均值', () => {
  it('参考区间中点15°C/50%RH，保持知识来源', () => {
    const result = derivePlantClimateVpdAnchor(climate())
    expect(result).toMatchObject({ status: 'available', referenceKind: 'climate_midpoint_not_optimal', temperatureC: 15, relativeHumidityPercent: 50, inputSnapshotRef: 'synthetic-knowledge-snapshot' })
    if (result.status !== 'available') { throw new Error('数学参考应可用') }
    expect(result.vpdKpa).toBeCloseTo(0.8525, 3)
  })
  it('缺参考范围不补默认，零湿度合法但不当缺值', () => {
    expect(derivePlantClimateVpdAnchor({ ...climate(), humidityRangePercent: null })).toMatchObject({ status: 'insufficient_evidence' })
    expect(derivePlantClimateVpdAnchor({ ...climate(), temperatureRangeC: null })).toMatchObject({ status: 'insufficient_evidence' })
    expect(derivePlantClimateVpdAnchor({ ...climate(), humidityRangePercent: { min: 0, max: 0 } })).toMatchObject({ status: 'available', relativeHumidityPercent: 0 })
  })
  it('逆序、非有限或超百分数的知识范围不钳制', () => {
    for (const input of [{ ...climate(), temperatureRangeC: { min: 20, max: 10 } }, { ...climate(), humidityRangePercent: { min: -1, max: 70 } }, { ...climate(), temperatureRangeC: { min: 10, max: Infinity } }]) {
      expect(() => derivePlantClimateVpdAnchor(input)).toThrow()
    }
  })
})
