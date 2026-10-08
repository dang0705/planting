import { replayLuxWindowDay, type LuxWindowDayReplayInput } from '../../../src/care/application/replay-lux-window-day.js'
import { replayWateringTiming, type WateringTimingReplayInput } from '../../../src/care/application/replay-watering-timing.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../../src/foundation/json/canonical-json-sha256.js'
import { replayIndoorClimateStep, type IndoorClimateExperiment } from './indoor-climate.js'

/** 与已有干燥积分相同的数值区间，仅在显式模拟样本中消费。 */
type Range = WateringTimingReplayInput['drying']['intervals'][number]['environmentDemand']

/** 单日同盆环境条件；没有自动生成环境需求的模型或默认房间参数。 */
export interface EnvironmentalSampleDay {
  /** 极简Lux回放，完整保留辐射、地点、窗向及候选换算来源。 */
  readonly light: LuxWindowDayReplayInput
  /** 室内热湿候选的输入及归属；时段长度必须与光照日相同。 */
  readonly climate: {
    /** 与光照相同的植物位置。 */
    readonly plantReference: string
    /** 普通气象来源；本实验形状不证明真实API已调用。 */
    readonly provider: 'qweather'
    /** 明确的模拟气象制品引用。 */
    readonly sourceRef: string
    /** 明确初态、室外温湿度、气压、热湿参数和时长。 */
    readonly experiment: IndoorClimateExperiment
  }
  /** 未准入响应的显式人工替换，不允许以published标记冒充正式模型。 */
  readonly demand: {
    /** 仅允许人工指定模拟控制量。 */
    readonly basis: 'synthetic_manual_assignment'
    /** 明确的模拟需求依据。 */
    readonly sourceRef: string
    /** 给定的需求区间，不由DLI或VPD线性换算。 */
    readonly range: Range
  }
  /** 显式模拟保水区间，不从盆体积或材料名称猜测。 */
  readonly cultivationRetention: Range
  /** 显式模拟校准区间，不声称真实个体学习。 */
  readonly personalCalibration: Range
}

/** 唯一用于离线样本接线的输入，禁止运行入口导入本实验文件。 */
export interface EnvironmentalWateringSample {
  /** 必须声明为合成实验，不接受生产或真实标定标记。 */
  readonly classification: 'synthetic_experimental'
  /** 既有盆土、基线、起点和水量输入；其中的intervals必被本次有效日替换。 */
  readonly watering: WateringTimingReplayInput
  /** 独立指定的各日环境与控制条件；空数组表示没有环境覆盖。 */
  readonly days: readonly EnvironmentalSampleDay[]
}

/** 显式区间不得含字符串、空端点或反序；零需求允许，保水/校准须大于零。 */
function validateRange(range: Range, positive: boolean): void {
  if (!range || typeof range.min !== 'number' || typeof range.max !== 'number'
    || !Number.isFinite(range.min) || !Number.isFinite(range.max)
    || range.max < range.min || (positive ? range.min <= 0 : range.min < 0)) {
    throw new RangeError('模拟需求、保水或校准区间非法')
  }
}

/**
 * 实际执行既有光照、室内气候和浇水计算，用环境覆盖约束人工赋值的模拟需求。
 * 本组合不补非线性响应参数，不将末态VPD转成均值，不写业务事实或发布记录。
 */
export function replayEnvironmentalWateringSample(input: EnvironmentalWateringSample) {
  if (input.classification !== 'synthetic_experimental' || !Array.isArray(input.days)) {
    throw new TypeError('只接受明确的离线合成样本')
  }
  const snapshotHash = calculateCanonicalJsonSha256(input as unknown as CanonicalJsonValue)
  const snapshot = structuredClone(input)
  let previousEnd: number | null = null
  let plantReference: string | null = null
  const intervals: WateringTimingReplayInput['drying']['intervals'][number][] = []
  const days = snapshot.days.map(day => {
    if (!day || day.climate.plantReference !== day.light.plantReference
      || (plantReference !== null && day.light.plantReference !== plantReference)
      || day.climate.provider !== 'qweather' || !day.climate.sourceRef?.trim()
      || day.demand.basis !== 'synthetic_manual_assignment' || !day.demand.sourceRef?.trim()
      || day.climate.experiment.durationSeconds !== (day.light.day.endMs - day.light.day.startMs) / 1000
      || (previousEnd !== null && day.light.day.startMs < previousEnd)) {
      throw new TypeError('同盆环境的来源、时长、顺序或模拟资格不一致')
    }
    validateRange(day.demand.range, false)
    validateRange(day.cultivationRetention, true)
    validateRange(day.personalCalibration, true)
    plantReference = day.light.plantReference
    previousEnd = day.light.day.endMs
    const light = replayLuxWindowDay(day.light)
    const climate = replayIndoorClimateStep(day.climate.experiment)
    const eligibleForSyntheticDemand = light.status === 'available' && light.dailyIntegralMolPerM2 !== null && climate.status === 'candidate'
    if (eligibleForSyntheticDemand) {
      intervals.push({ start: day.light.day.startMs, end: day.light.day.endMs,
        environmentDemand: day.demand.range, cultivationRetention: day.cultivationRetention, personalCalibration: day.personalCalibration })
    }
    return {
      day: day.light.day,
      light: { ...light, dailyIntegralMolPerM2: light.status === 'available' ? light.dailyIntegralMolPerM2 : null },
      climate: { plantReference: day.climate.plantReference, provider: day.climate.provider, sourceRef: day.climate.sourceRef,
        atMs: day.light.day.endMs, semantics: 'interval_end_estimate' as const,
        result: { ...climate,
          temperatureC: climate.status === 'candidate' ? climate.temperatureC : null,
          relativeHumidityPercent: climate.status === 'candidate' ? climate.relativeHumidityPercent : null,
          vpdKpa: climate.status === 'candidate' ? climate.vpdKpa : null,
        },
      },
      demand: day.demand,
      eligibleForSyntheticDemand,
    }
  })
  const watering = replayWateringTiming({ ...snapshot.watering, drying: { ...snapshot.watering.drying, intervals } })
  return { classification: 'synthetic_experimental' as const, productionAdmission: false as const,
    demandMapping: 'pending_response_model' as const, days, watering, snapshot, snapshotHash }
}
