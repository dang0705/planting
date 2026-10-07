import type { ResearchClimatePoint } from './indoor-climate.js'
import type { OutdoorOnlyClimateFit } from './outdoor-only-climate.js'
import { climateComparisonPoint, summarizeClimateErrors } from './indoor-climate-validation.js'
import {
  fitOutdoorOnlyClimate,
  predictOutdoorOnlyClimate,
  type PairedClimateSample
} from './outdoor-only-climate.js'

/** 固定的回顾性研究范围；不是可发布的业务配置。 */
const START = Date.parse('2017-12-01T00:00:00Z')
const SPLIT = Date.parse('2017-12-29T00:00:00Z')
const END = Date.parse('2018-01-12T00:00:00Z')
const HOUR = 3600000
const PREFIXES = ['indoor_temperature', 'indoor_rh', 'outdoor_temperature', 'outdoor_rh'] as const
const FIELDS = ['mean', 'min', 'max', 'samples', 'first_utc', 'last_utc'] as const
const HEADERS = [
  'interval_start_utc',
  'interval_end_utc',
  ...PREFIXES.flatMap(p => FIELDS.map(f => `${p}_${f}`))
]

/** 同一小时配对均值，时间只用于切分、覆盖审计和结果对齐。 */
interface HourSample extends PairedClimateSample {
  start: number
}
/** 保留首个排除原因及合格小时的连续片段，不填补缺失。 */
interface Selection {
  total: number
  selected: number
  excluded: Record<string, number>
  runs: number
  longestRunHours: number
}
type CsvRow = Record<string, string>

/** 固定制品采用无引号的数值/UTC列；拒绝其他CSV方言，避免默默错列。 */
function parseRows(csv: string): CsvRow[] {
  const lines = csv.trim().split(/\r?\n/)
  if (lines[0] !== HEADERS.join(',')) {
    throw new Error('研究CSV表头不匹配')
  }
  return lines.slice(1).map(line => {
    const cells = line.split(',')
    if (cells.length !== HEADERS.length) {
      throw new Error('研究CSV列数不匹配')
    }
    return Object.fromEntries(HEADERS.map((key, index) => [key, cells[index]!]))
  })
}

/** 所有时间必须显式UTC；不依赖机器默认时区。 */
function utc(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    throw new Error('研究时间必须显式UTC')
  }
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) {
    throw new Error('研究时间非法')
  }
  return ms
}

/** 严格按已固定协议筛选，空串不是零。均值末位舍入不另设排除规则。 */
function select(row: CsvRow, start: number): string | HourSample {
  const numericKeys = PREFIXES.flatMap(p => ['mean', 'min', 'max', 'samples'].map(f => `${p}_${f}`))
  if (numericKeys.some(key => row[key] === '') || PREFIXES.some(p => row[`${p}_samples`] === '0')) {
    return 'missing_values'
  }
  const values = Object.fromEntries(numericKeys.map(key => [key, Number(row[key])]))
  if (Object.values(values).some(n => !Number.isFinite(n))) {
    return 'invalid_values'
  }
  if (
    PREFIXES.some(p => !Number.isInteger(values[`${p}_samples`]) || values[`${p}_samples`]! < 0)
  ) {
    return 'invalid_values'
  }
  if (values.indoor_temperature_samples! < 270 || values.indoor_rh_samples! < 270) {
    return 'indoor_coverage'
  }
  if (values.outdoor_temperature_samples !== 4 || values.outdoor_rh_samples !== 4) {
    return 'outdoor_coverage'
  }
  for (const p of PREFIXES) {
    const first = utc(row[`${p}_first_utc`]!),
      last = utc(row[`${p}_last_utc`]!)
    if (first < start || last >= start + HOUR || first > last) {
      return 'invalid_sample_time'
    }
  }
  for (const location of ['indoor', 'outdoor']) {
    if (values[`${location}_temperature_samples`] !== values[`${location}_rh_samples`]) {
      return 'unpaired_samples'
    }
    for (const f of ['first_utc', 'last_utc']) {
      if (utc(row[`${location}_temperature_${f}`]!) !== utc(row[`${location}_rh_${f}`]!)) {
        return 'unpaired_samples'
      }
    }
    const min = values[`${location}_rh_min`]!,
      max = values[`${location}_rh_max`]!,
      mean = values[`${location}_rh_mean`]!
    if (min < 0 || max > 100 || min > max || mean < 0 || mean > 100) {
      return 'humidity_range'
    }
    if (values[`${location}_temperature_mean`]! <= -237.3) {
      return 'invalid_values'
    }
  }
  return {
    start,
    indoor: {
      temperatureC: values.indoor_temperature_mean!,
      relativeHumidityPercent: values.indoor_rh_mean!
    },
    outdoor: {
      temperatureC: values.outdoor_temperature_mean!,
      relativeHumidityPercent: values.outdoor_rh_mean!
    }
  }
}

/** 连续小时仅用于覆盖报告；拟合不递推，禁止跨缺口补室内初态。 */
function continuity(rows: readonly HourSample[]): { runs: number; longestRunHours: number } {
  let runs = 0,
    current = 0,
    longestRunHours = 0,
    previous = -Infinity
  for (const row of rows) {
    if (row.start !== previous + HOUR) {
      runs++
      current = 0
    }
    current++
    longestRunHours = Math.max(longestRunHours, current)
    previous = row.start
  }
  return { runs, longestRunHours }
}

/** 共用固定制品质控；迁移回放额外拒绝目标窗口外的小时。 */
function collectSamples(
  csv: string,
  validationOnly: boolean,
  evaluationWindow?: { start: number; end: number }
) {
  const allowedStart = evaluationWindow?.start ?? (validationOnly ? SPLIT : START)
  const allowedEnd = evaluationWindow?.end ?? END
  const samples: { training: HourSample[]; validation: HourSample[] } = {
    training: [],
    validation: []
  }
  const empty = (): Selection => ({
    total: 0,
    selected: 0,
    excluded: {},
    runs: 0,
    longestRunHours: 0
  })
  const selection = { training: empty(), validation: empty() }
  let previous = -Infinity
  for (const row of parseRows(csv)) {
    const start = utc(row.interval_start_utc!),
      end = utc(row.interval_end_utc!)
    if (validationOnly && (start < allowedStart || end > allowedEnd)) {
      throw new Error('跨住宅评价只允许固定验证窗口')
    }
    if (
      end - start !== HOUR ||
      start % HOUR !== 0 ||
      start <= previous ||
      start < allowedStart ||
      end > allowedEnd
    ) {
      throw new Error('研究时段必须按固定范围内的UTC小时严格递增，不能重复或重叠')
    }
    previous = start
    const part = !validationOnly && start < SPLIT ? 'training' : 'validation'
    selection[part].total++
    const value = select(row, start)
    if (typeof value === 'string') {
      selection[part].excluded[value] = (selection[part].excluded[value] ?? 0) + 1
    } else {
      samples[part].push(value)
      selection[part].selected++
    }
  }
  for (const part of ['training', 'validation'] as const) {
    Object.assign(selection[part], continuity(samples[part]))
  }
  if (samples.validation.length === 0) {
    throw new Error('固定验证段没有合格小时')
  }
  return { samples, selection }
}

/** 只评价传入参数；目标室内真值仅进入评分，不进入预测。 */
function scoreHours(
  rows: readonly HourSample[],
  fit: OutdoorOnlyClimateFit,
  trainingMean: ResearchClimatePoint
) {
  const predictions = rows.map(row => ({
    intervalStart: new Date(row.start).toISOString(),
    candidate: predictOutdoorOnlyClimate(row.outdoor, fit, (row.start - START) / 1000),
    trainingMean: climateComparisonPoint(trainingMean, (row.start - START) / 1000),
    outdoor: climateComparisonPoint(row.outdoor, (row.start - START) / 1000)
  }))
  const truth = rows.map(row => row.indoor)
  return {
    predictions,
    scores: {
      candidate: summarizeClimateErrors(
        truth,
        predictions.map(row => row.candidate)
      ),
      trainingMean: summarizeClimateErrors(
        truth,
        predictions.map(row => row.trainingMean)
      ),
      outdoor: summarizeClimateErrors(
        truth,
        predictions.map(row => row.outdoor)
      )
    }
  }
}

/** 固定四周训练/两周验证；原研究的系数与对照均来自训练段。 */
export function runIdealOutdoorComparison(csv: string) {
  const { samples, selection } = collectSamples(csv, false)
  const fit = fitOutdoorOnlyClimate(samples.training)
  const trainingMean = {
    temperatureC:
      samples.training.reduce((sum, row) => sum + row.indoor.temperatureC, 0) /
      samples.training.length,
    relativeHumidityPercent:
      samples.training.reduce((sum, row) => sum + row.indoor.relativeHumidityPercent, 0) /
      samples.training.length
  }
  return {
    productionAdmission: false as const,
    method: 'same_hour_outdoor_affine_temperature_and_vapor' as const,
    selection,
    fit,
    trainingMean,
    ...scoreHours(samples.validation, fit, trainingMean)
  }
}

/** 固定来源住宅的模型与均值对照，在目标住宅只评分，不重拟合。 */
export function evaluateIdealClimateTransfer(
  csv: string,
  source: { readonly fit: OutdoorOnlyClimateFit; readonly trainingMean: ResearchClimatePoint },
  window?: { readonly startUtc: string; readonly endExclusiveUtc: string }
) {
  const evaluationWindow = window
    ? { start: utc(window.startUtc), end: utc(window.endExclusiveUtc) }
    : undefined
  if (
    evaluationWindow &&
    (evaluationWindow.start < SPLIT ||
      evaluationWindow.end <= evaluationWindow.start ||
      evaluationWindow.start % HOUR !== 0 ||
      evaluationWindow.end % HOUR !== 0)
  ) {
    throw new Error('显式验证窗口必须在来源训练段之后且为正向整小时区间')
  }
  const { samples, selection } = collectSamples(csv, true, evaluationWindow)
  return {
    productionAdmission: false as const,
    method: 'fixed_parameters_cross_home' as const,
    selection: selection.validation,
    fit: source.fit,
    trainingMean: source.trainingMean,
    ...scoreHours(samples.validation, source.fit, source.trainingMean)
  }
}
