import type { IndoorPpfdCandidateInterval, LocalLightDay } from '../../../src/care/application/replay-indoor-ppfd-day.js'
import { replayIndoorClimateStep, type IndoorClimateExperiment } from './indoor-climate.js'
import { deriveJointDryingResponse, type JointResponseParameters, type SoilEvaporationCandidate } from './joint-drying-response.js'

/** 离线联合响应入口；每个假设均须明确，不能伪装为已发布能力。 */
export interface NonlinearResearchDemand {
  readonly basis: 'nonlinear_research_candidate'
  readonly sourceRef: string
  readonly parameters: JointResponseParameters | null
  readonly soilEvaporation: SoilEvaporationCandidate | null
  /** 平均辐射不包含时段内波动，本候选明确使用常量近似。 */
  readonly lightTimeAssumption: 'interval_mean_held_constant'
  /** 缺叶温时只允许显式研究近似，不声称气孔处实际VPD。 */
  readonly leafTemperatureAssumption: 'equals_air'
}

/** 已校验热湿结果中的候选分支；包含端点水分状态。 */
type ClimatePoint = Extract<ReturnType<typeof replayIndoorClimateStep>, { status: 'candidate' }>

/** 水汽分压按含湿比换算；分子量比为物理定义，不是产品参数。 */
function vaporPressure(point: ClimatePoint, pressureKpa: number): number {
  return pressureKpa * point.humidityRatioKgPerKg / (0.62198 + point.humidityRatioKgPerKg)
}

/**
 * 常系数热湿解的温度及含湿比各自单调，水汽分压同样单调。
 * es(T) = 端点VPD + 端点水汽分压；交叉端点给保守包络，避免把日末铺成全天。
 */
function vaporDeficitEnvelope(a: ClimatePoint, b: ClimatePoint, pressureKpa: number) {
  const ea = vaporPressure(a, pressureKpa); const eb = vaporPressure(b, pressureKpa)
  const sa = a.vpdKpa + ea; const sb = b.vpdKpa + eb
  return { min: Math.max(0, Math.min(sa, sb) - Math.max(ea, eb)), max: Math.max(sa, sb) - Math.min(ea, eb) }
}

/** 同一日原始光照区间逐一求响应；只返回有依据时段，不生成缺失区间。 */
export function replayJointResponseIntervals(
  light: readonly IndoorPpfdCandidateInterval[], day: LocalLightDay,
  climate: IndoorClimateExperiment, demand: NonlinearResearchDemand,
) {
  if (demand.lightTimeAssumption !== 'interval_mean_held_constant' || demand.leafTemperatureAssumption !== 'equals_air') {
    throw new TypeError('联合响应的时段或叶温假设未明确')
  }
  return light.flatMap(interval => {
    const start = Math.max(day.startMs, interval.startMs); const end = Math.min(day.endMs, interval.endMs)
    if (start >= end) { return [] }
    const a = replayIndoorClimateStep({ ...climate, durationSeconds: (start - day.startMs) / 1000 })
    const b = replayIndoorClimateStep({ ...climate, durationSeconds: (end - day.startMs) / 1000 })
    if (a.status !== 'candidate' || b.status !== 'candidate') { return [] }
    const vpdKpa = vaporDeficitEnvelope(a, b, climate.pressureKpa)
    const response = deriveJointDryingResponse({ parameters: demand.parameters, soilEvaporation: demand.soilEvaporation,
      ppfd: interval.totalPpfd === null ? null : { min: interval.totalPpfd.lower, max: interval.totalPpfd.upper }, vpdKpa })
    return [{ start, end, vpdKpa, response, climateSemantics: 'interval_envelope' as const }]
  })
}
