import { createHash } from 'node:crypto'
import { calibrateIndoorClimate, climateComparisonPoint, replayHeldOutClimate, summarizeClimateErrors } from './indoor-climate-validation.js'
import type { ClimateObservation } from './indoor-climate-validation.js'

/** 日期保留源文本，不据此声称采集时区已经确认。 */
export interface DatedClimateObservation extends ClimateObservation { readonly sourceDate: string }
/** NIST SP811常规毫米汞柱到kPa的换算；不是室内模型参数。 */
const mmHgToKpa = 0.1333224

/** 对固定六字段研究子集读取，不是通用CSV导入器或Provider适配器。 */
export function loadClimateBenchmarkCsv(csv: string): DatedClimateObservation[] {
  const lines = csv.trim().split('\n')
  if (lines.shift() !== 'date,T2,RH_2,T_out,RH_out,Press_mm_hg') {throw new RangeError('研究子集表头不符')}
  let origin: number | undefined
  return lines.map((line) => {
    const fields = line.split(',').map((value) => value.trim())
    if (fields.length !== 6 || fields.some((value) => value.length === 0)) {throw new RangeError('研究字段缺失')}
    const sourceDate = fields[0]!
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sourceDate)) {throw new RangeError('日期格式非法')}
    // Z只用于无夏令时的名义日历差值计算，不将原始记录标为UTC观测。
    const nominal = Date.parse(sourceDate.replace(' ', 'T') + 'Z')
    if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19).replace('T', ' ') !== sourceDate) {throw new RangeError('日期非法')}
    const values = fields.slice(1).map(Number)
    if (values.some((value) => !Number.isFinite(value))) {throw new RangeError('研究字段不是有限数值')}
    origin ??= nominal
    return { sourceDate, elapsedSeconds: (nominal - origin) / 1000, indoor: { temperatureC: values[0]!, relativeHumidityPercent: values[1]! }, outdoor: { temperatureC: values[2]!, relativeHumidityPercent: values[3]! }, pressureKpa: values[4]! * mmHgToKpa }
  })
}

/**
 * 先按预先指定日期分割，再训练；不搜索最优切分、不用验证数据选参数。
 * 两种简单对照仅用于诊断候选的研究价值，绝不是产品缺证据时的后备规则。
 */
export function runClimateBenchmark(rows: readonly DatedClimateObservation[], splitDate: string) {
  if (rows.length < 5) {throw new RangeError('研究样本不足')}
  const interval = rows[1]!.elapsedSeconds - rows[0]!.elapsedSeconds
  if (interval <= 0) {throw new RangeError('时段非法')}
  for (let index = 1; index < rows.length; index++) {
    if (rows[index]!.elapsedSeconds - rows[index - 1]!.elapsedSeconds !== interval || rows[index]!.sourceDate <= rows[index - 1]!.sourceDate) {throw new RangeError('研究数据重复、倒序或缺段')}
  }
  const splitIndex = rows.findIndex((row) => row.sourceDate === splitDate)
  if (splitIndex < 3 || splitIndex >= rows.length - 1) {throw new RangeError('切分未对齐或分段样本不足')}
  const calibration = rows.slice(0, splitIndex); const validation = rows.slice(splitIndex)
  const fit = calibrateIndoorClimate(calibration)
  const predictions = replayHeldOutClimate(validation, fit.coefficients)
  const constant = {
    temperatureC: calibration.reduce((sum, row) => sum + row.indoor.temperatureC, 0) / calibration.length,
    relativeHumidityPercent: calibration.reduce((sum, row) => sum + row.indoor.relativeHumidityPercent, 0) / calibration.length,
  }
  const scoredRows = validation.slice(1); const truth = scoredRows.map((row) => row.indoor)
  return {
    scope: 'retrospective_single_house_experiment', productionAdmission: false,
    calibration: { rows: calibration.length, transitions: calibration.length - 1, firstRecord: calibration[0]!.sourceDate, lastRecord: calibration.at(-1)!.sourceDate },
    validation: { rows: validation.length, predictions: predictions.length, firstRecord: validation[0]!.sourceDate, lastRecord: validation.at(-1)!.sourceDate, indoorAnchors: 1 },
    intervalSeconds: interval, pressureConversionKpaPerMmHg: mmHgToKpa, fit, trainingMean: constant,
    predictionSha256: createHash('sha256').update(JSON.stringify(predictions)).digest('hex'),
    scores: {
      candidate: summarizeClimateErrors(truth, predictions),
      trainingMean: summarizeClimateErrors(truth, scoredRows.map((row) => climateComparisonPoint(constant, row.elapsedSeconds))),
      outdoorAsIndoor: summarizeClimateErrors(truth, scoredRows.map((row) => climateComparisonPoint(row.outdoor, row.elapsedSeconds))),
    },
  }
}
