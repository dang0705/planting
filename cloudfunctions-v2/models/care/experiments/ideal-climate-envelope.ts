import { createHash } from 'node:crypto'
import { evaluateIdealClimateTransfer } from './ideal-outdoor-comparison.js'
import { buildClimateEnvelope, applyClimateEnvelope } from './indoor-climate-envelope.js'
import type { ClimateEnvelope } from './indoor-climate-envelope.js'
import type { OutdoorOnlyClimateFit } from './outdoor-only-climate.js'
import type { ResearchClimatePoint } from './indoor-climate.js'

/** 输入均为已固化公开研究制品；入口按摘要拒绝替换，不读取服务端凭证。 */
export interface EnvelopeReplayInputs {
  readonly model: string
  readonly calibration: string
  readonly sameHome: string
  readonly transferHome: string
}

const HASHES = {
  model: '281e7c1dc99bf5239d766566b2a92ef3bd4c23be3ddc7c337a80950207ece122',
  calibration: 'a8fa47ffd565f80938c391c96b05c13887b2a33fdf3342040522230e1046c6c2',
  sameHome: 'a35c2486825c071bb43c823387e73d0ea0ede38dabb5f597609af132fba3f549',
  transferHome: 'c31919bc15488896cc1cb9a83c4f5679514d3564fc0f8b1c517f83bf0178d414'
} as const
const CALIBRATION_START = '2017-12-29T00:00:00Z'
const VALIDATION_START = '2018-01-12T00:00:00Z'
const VALIDATION_END = '2018-01-26T00:00:00Z'

/** 只截取预先固定的校准窗口；下游原质控仍验证表头、逐行时段与全部字段。 */
function calibrationWindow(csv: string): string {
  const [header, ...rows] = csv.trim().split(/\r?\n/)
  return (
    [
      header,
      ...rows.filter(row => {
        const at = Date.parse(row.split(',')[0]!)
        return at >= Date.parse(CALIBRATION_START) && at < Date.parse(VALIDATION_START)
      })
    ].join('\n') + '\n'
  )
}

/** 已经过固定质控的时段才会用于配对，真值只进入校准或独立评分。 */
function truthByTime(csv: string): Map<string, ResearchClimatePoint> {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  const keys = header!.split(',')
  return new Map(
    lines.map(line => {
      const cells = line.split(',')
      return [
        new Date(cells[0]!).toISOString(),
        {
          temperatureC: Number(cells[keys.indexOf('indoor_temperature_mean')]),
          relativeHumidityPercent: Number(cells[keys.indexOf('indoor_rh_mean')])
        }
      ]
    })
  )
}

/** 不抛弃范围不可用或未命中记录；同时报告合格样本和完整窗口两个分母。 */
function summarize(
  csv: string,
  points: ReturnType<typeof evaluateIdealClimateTransfer>,
  envelope: ClimateEnvelope
) {
  const truth = truthByTime(csv)
  let available = 0,
    jointCovered = 0
  const fields = {
    temperatureC: { covered: 0, widthSum: 0, maximumWidth: 0 },
    relativeHumidityPercent: { covered: 0, widthSum: 0, maximumWidth: 0 },
    vpdKpa: { covered: 0, widthSum: 0, maximumWidth: 0 }
  }
  const records = points.predictions.map(row => {
    const actual = truth.get(row.intervalStart)
    if (!actual) {
      throw new Error('合格预测缺少同小时室内真值')
    }
    const range = applyClimateEnvelope(row.candidate, envelope)
    if (range.status !== 'candidate') {
      return { at: row.intervalStart, range, covered: false }
    }
    available++
    const actualValues = {
      ...actual,
      vpdKpa:
        0.6108 *
        Math.exp((17.27 * actual.temperatureC) / (actual.temperatureC + 237.3)) *
        (1 - actual.relativeHumidityPercent / 100)
    }
    let all = true
    for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
      const { min, max } = range[field]
      const hit = actualValues[field] >= min && actualValues[field] <= max
      if (hit) {
        fields[field].covered++
      } else {
        all = false
      }
      fields[field].widthSum += max - min
      fields[field].maximumWidth = Math.max(fields[field].maximumWidth, max - min)
    }
    if (all) {
      jointCovered++
    }
    return { at: row.intervalStart, range, covered: all }
  })
  const selected = points.selection.selected
  return {
    selection: points.selection,
    available,
    unavailable: selected - available,
    jointCovered,
    jointCoverageOfQualifiedHours: jointCovered / selected,
    jointCoverageOfFullWindow: jointCovered / points.selection.total,
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, values]) => [
        name,
        {
          covered: values.covered,
          coverageOfQualifiedHours: values.covered / selected,
          meanWidthOfAvailable: available > 0 ? values.widthSum / available : null,
          maximumWidthOfAvailable: available > 0 ? values.maximumWidth : null
        }
      ])
    ),
    recordsSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex')
  }
}

/** 固定模型→旧评分段校准包络→新时段评分；验证结果从不回流扩大包络。 */
export function replayIdealClimateEnvelope(input: EnvelopeReplayInputs) {
  for (const key of Object.keys(HASHES) as (keyof typeof HASHES)[]) {
    if (createHash('sha256').update(input[key]).digest('hex') !== HASHES[key]) {
      throw new Error('研究制品摘要不符：' + key)
    }
  }
  const source = JSON.parse(input.model) as {
    fit: OutdoorOnlyClimateFit
    trainingMean: ResearchClimatePoint
  }
  const csv = calibrationWindow(input.calibration)
  const calibrated = evaluateIdealClimateTransfer(csv, source)
  const truth = truthByTime(csv)
  const envelope = buildClimateEnvelope(
    calibrated.predictions.map(row => ({
      prediction: row.candidate,
      observed: truth.get(row.intervalStart)!
    }))
  )
  const window = { startUtc: VALIDATION_START, endExclusiveUtc: VALIDATION_END }
  return {
    protocol: 'indoor-climate-envelope.md',
    productionAdmission: false,
    sourceHashes: HASHES,
    calibration: {
      startUtc: CALIBRATION_START,
      endExclusiveUtc: VALIDATION_START,
      selection: calibrated.selection,
      envelope
    },
    validationWindow: window,
    sameHome: summarize(
      input.sameHome,
      evaluateIdealClimateTransfer(input.sameHome, source, window),
      envelope
    ),
    transferHome: summarize(
      input.transferHome,
      evaluateIdealClimateTransfer(input.transferHome, source, window),
      envelope
    )
  }
}
