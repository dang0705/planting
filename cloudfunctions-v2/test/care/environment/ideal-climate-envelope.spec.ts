import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayIdealClimateEnvelope } from '../../../models/care/experiments/ideal-climate-envelope.js'

// unit_real_data：独立Python读取固定CSV和原系数复算；没有mock。
// 实际经过摘要校验、原小时质控、固定点模型、残差包络、后续评分；不经过和风或生产HTTP。
const read = (path: string) =>
  readFileSync(resolve(__dirname, '../../../models/care', path), 'utf8')
const input = () => ({
  model: read('indoor-outdoor-comparison-results.json'),
  calibration: read('fixtures/ideal-home100-hourly.csv'),
  sameHome: read('fixtures/ideal-home100-envelope-validation-hourly.csv'),
  transferHome: read('fixtures/ideal-transfer-home59-followup-hourly.csv')
})

describe('unit_real_data 固定包络校准与后续室内估算', () => {
  it('后续同宅和跨宅评分不反过来修改校准范围', () => {
    const result = replayIdealClimateEnvelope(input())
    expect(result.productionAdmission).toBe(false)
    expect(result.calibration.selection).toMatchObject({ total: 336, selected: 238 })
    const envelope = result.calibration.envelope
    expect(envelope.temperatureResidualC.min).toBeCloseTo(-2.763749801182767, 10)
    expect(envelope.temperatureResidualC.max).toBeCloseTo(3.525895955804611, 10)
    expect(envelope.vaporResidualKpa.min).toBeCloseTo(-0.19653677197868635, 10)
    expect(envelope.vaporResidualKpa.max).toBeCloseTo(0.24088921774075178, 10)
    expect(result.sameHome).toMatchObject({
      selection: { total: 336, selected: 289 },
      available: 289,
      unavailable: 0,
      jointCovered: 287,
      fields: {
        temperatureC: { covered: 287 },
        relativeHumidityPercent: { covered: 289 },
        vpdKpa: { covered: 289 }
      }
    })
    expect(result.transferHome).toMatchObject({
      selection: { total: 336, selected: 124 },
      available: 124,
      unavailable: 0,
      jointCovered: 102,
      fields: {
        temperatureC: { covered: 102 },
        relativeHumidityPercent: { covered: 123 },
        vpdKpa: { covered: 122 }
      }
    })
    expect(result.sameHome.jointCoverageOfFullWindow).toBeCloseTo(287 / 336, 12)
    expect(result.transferHome.jointCoverageOfQualifiedHours).toBeCloseTo(102 / 124, 12)
  })

  it.each(['model', 'calibration', 'sameHome', 'transferHome'] as const)(
    '替换%s制品必须拒绝，不能重新拟合后沿用原报告',
    key => {
      const changed = input()
      changed[key] += '\n'
      expect(() => replayIdealClimateEnvelope(changed)).toThrow(/摘要不符/)
    }
  )
})
