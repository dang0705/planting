import type { WateringTimingReplayResult } from './replay-watering-timing.js'
import type { DryingRange } from '../watering/replay-dry-progress.js'
import type { WateringDecisionResult } from '../watering/evaluate-watering-decision.js'

/** 只消费供排水模型的最终裁决，不接收其原始引用或需求包络。 */
export interface ApplicationAssessment {
  /** 上游已核验同盆、方法、时间与安全交集。 */
  readonly status: 'candidate' | 'insufficient_evidence' | 'not_required' | 'no_safe_single_application'
    | 'not_allowed_now' | 'unsupported_drainage' | 'conflicting_evidence'
  /** 实际可行候选；需求不确定包络不能填入此字段。 */
  readonly appliedAmountCandidateMl: DryingRange | null
}

/** 能力详情草案：检查时间与施水量分别表达，不能拼成未来自动浇水指令。 */
export interface WateringAssessmentDetails {
  /** 当前安全行动；建议不等于事实或计划。 */
  readonly action: WateringDecisionResult['action']
  /** 只有仍有效的可靠观察才显示其盆土状态。 */
  readonly soilState: 'wet' | 'waterlogged' | 'target_dry' | 'unknown'
  /** 表土观察不能被摘要省略范围后误认成根区证据。 */
  readonly soilScope: 'surface' | 'root_zone' | null
  /** 原进度所处区间，不能替代当前安全行动。 */
  readonly dryingWindowState: WateringDecisionResult['windowState']
  /** 仅为检查盆土的窗口；当地日期依赖明确时区。 */
  readonly checkWindow: {
    /** 固定为盆土检查，不是预约或实际浇水。 */
    readonly purpose: 'soil_check'
    /** 已有预测最早交点的UTC时刻，未覆盖时保持null。 */
    readonly earliestAt: string | null
    /** 已有预测最晚交点的UTC时刻，未覆盖时保持null。 */
    readonly latestAt: string | null
    /** 输入时间序列实际连续覆盖的终点，不充当检查日期。 */
    readonly coverageEndAt: string
    /** 植物所在地明确时区，缺失不使用服务器时区。 */
    readonly timezone: string | null
    /** 地点时区下的最早公历日期，缺时区或交点时为null。 */
    readonly earliestDate: string | null
    /** 地点时区下的最晚公历日期，不从最早日期外推。 */
    readonly latestDate: string | null
  } | null
  /** 当前允许浇水且供排水条件适用时的毫升区间。 */
  readonly amountMl: DryingRange | null
  /** 净缺口另列，不能作为实际浇入量。 */
  readonly netDeficitMl: DryingRange | null
  /** 可理解的缺证据类别；专业标定由后台提供，不增加前端必填。 */
  readonly missingEvidence: readonly string[]
}

/** 复用统一外壳；本详情仍是离线草案，不能自授正式发布资格。 */
export interface WateringCapabilityResult {
  /** 本次能力固定为浇水，不承接其他能力的算法。 */
  readonly capabilityType: 'watering'
  /** 已冻结统一外壳的版本；详情另行演进。 */
  readonly contractVersion: 'care-capability-result/v1'
  /** 当前结果的可用性；候选与正式出口分别判断。 */
  readonly status: 'ready' | 'insufficient_evidence' | 'temporarily_unavailable'
  /** 只用等级，不由模型或程序伪造精确分数。 */
  readonly confidence: 'low' | 'medium' | 'high'
  /** 固定的脱敏业务依据，不传输内部引用或原始载荷。 */
  readonly evidenceSummary: readonly string[]
  /** 可供用户选择的建议，不产生行为或计划。 */
  readonly recommendedActions: readonly string[]
  /** 与输入快照一致的UTC生成时刻。 */
  readonly generatedAt: string
  /** 已知证据或覆盖边界；null表示未确定，不能视为永久有效。 */
  readonly validUntil: string | null
  /** 当前能力详情草案版本，发布需另行验收。 */
  readonly detailsSchemaVersion: 'watering-assessment/v1'
  /** 最终安全裁决之后的能力字段，不直接复制中间推导。 */
  readonly details: WateringAssessmentDetails
}

/** 固定中文说明仅表达已裁决业务语义，不插入受限来源或模型原文。 */
const ACTION_TEXT: Readonly<Record<WateringDecisionResult['action'], string>> = {
  temporarily_unavailable: '浇水模型尚未发布，暂不能提供正式建议。',
  pause_watering: '当前盆土偏湿或积水，请暂停浇水。',
  review_drainage: '请先确认实际种植内盆的排水条件。',
  water_allowed: '当前盆土已达到目标干燥状态，可以考虑浇水。',
  check_later: '请在预计检查窗口复查盆土，再决定是否浇水。',
  check_now: '请检查当前盆土，核实后再决定是否浇水。',
  priority_check: '请优先检查当前盆土，预测超窗不代表已经缺水。',
  insufficient_evidence: '请补充当前盆土及实际种植内盆的信息。',
}

/**
 * 统一最外层实验裁决，保留独立的正式不可用出口。
 * 调用者必须先经过同盆与时效校验；本函数不读数据库、不写事实、不发布模型。
 */
export function projectWateringReplayResult(watering: WateringTimingReplayResult, application: ApplicationAssessment) {
  const now = watering.snapshot.drying.now
  const soil = watering.snapshot.soil
  const lastWatering = watering.snapshot.drying.lastConfirmedWateringAt
  const reliableSoil = soil !== null && soil.reliable && soil.collectedAt <= now && soil.validUntil > now
    && (lastWatering === null || soil.collectedAt > lastWatering)
    && watering.currentCycleWindow.ignoredObservationReason === null
  const emptyDetails = (action: WateringDecisionResult['action'], missingEvidence: readonly string[]): WateringAssessmentDetails => ({
    action, soilState: reliableSoil ? soil.state : 'unknown', soilScope: reliableSoil ? soil.scope : null,
    dryingWindowState: watering.decision.windowState,
    checkWindow: null, amountMl: null, netDeficitMl: null, missingEvidence,
  })
  const result = (status: WateringCapabilityResult['status'], details: WateringAssessmentDetails,
    explanation: string, validUntil: string | null): WateringCapabilityResult => ({
    capabilityType: 'watering', contractVersion: 'care-capability-result/v1', status,
    confidence: status === 'ready' ? 'medium' : 'low', evidenceSummary: [explanation],
    recommendedActions: status === 'temporarily_unavailable' ? [] : [ACTION_TEXT[details.action]],
    generatedAt: new Date(now).toISOString(), validUntil, detailsSchemaVersion: 'watering-assessment/v1', details,
  })
  // 实验许可仅用于回放安全门；任何候选日期、水量都不能从正式出口泄漏。
  const publicResult = result('temporarily_unavailable', {
    ...emptyDetails('temporarily_unavailable', ['published_watering_model']), soilState: 'unknown', soilScope: null, dryingWindowState: null,
  }, '当前仅完成离线计算，正式浇水模型尚未发布。', null)
  const soilExpiry = reliableSoil ? new Date(soil.validUntil).toISOString() : null
  const finish = (candidate: WateringCapabilityResult) => ({ candidate, publicResult })
  const withheld = (status: WateringCapabilityResult['status'], action: WateringDecisionResult['action'],
    missing: readonly string[], explanation: string) => finish(result(status, emptyDetails(action, missing), explanation, soilExpiry))

  if (watering.decision.action === 'temporarily_unavailable') { return finish(structuredClone(publicResult)) }
  if (application.status === 'conflicting_evidence') {
    return withheld('insufficient_evidence', 'check_now', ['consistent_root_zone_state'], '根区定量数据与干燥判断不一致，需要重新核实当前盆土。')
  }
  if (watering.decision.soilGate === 'pause_watering') {
    return withheld('ready', 'pause_watering', [], '当前可靠盆土证据要求暂停浇水，计算缺口不构成施水许可。')
  }
  if (watering.decision.action === 'review_drainage' || application.status === 'unsupported_drainage') {
    return withheld('insufficient_evidence', 'review_drainage', ['drainage_conditions'], '当前排水条件不适用已核验的施水参考。')
  }
  if (application.status === 'no_safe_single_application') {
    return withheld('insufficient_evidence', 'check_now', ['safe_application_range'], '当前没有满足安全上限的单次施水范围，不能自行截短或拆分剂量。')
  }
  if (application.status === 'not_required') {
    return withheld('ready', 'check_now', [], '当前根区数据没有净补水缺口，请复核盆土，暂不输出施水量。')
  }
  if (watering.decision.action === 'insufficient_evidence') {
    return withheld('insufficient_evidence', 'insufficient_evidence', ['current_soil_or_pot_evidence'], '当前盆土或实际种植内盆的必要证据不足。')
  }

  const action = watering.decision.action
  const window = watering.currentCycleWindow.window
  const local = watering.localCheckWindow
  const availableWindow = window !== null && (window.earliestCheckAt !== null || window.latestCheckAt !== null)
  const canWater = action === 'water_allowed'
  const amountMl = canWater && application.status === 'candidate' ? application.appliedAmountCandidateMl : null
  const missingEvidence: string[] = []
  if (canWater && amountMl === null) { missingEvidence.push('application_reference') }
  if (availableWindow && local.timezone === null) { missingEvidence.push('plant_timezone') }
  const checkWindow: WateringAssessmentDetails['checkWindow'] = availableWindow ? {
    purpose: 'soil_check', earliestAt: window.earliestCheckAt === null ? null : new Date(window.earliestCheckAt).toISOString(),
    latestAt: window.latestCheckAt === null ? null : new Date(window.latestCheckAt).toISOString(),
    coverageEndAt: new Date(window.coverageEnd).toISOString(), timezone: local.timezone,
    earliestDate: local.earliestCheckDate, latestDate: local.latestCheckDate,
  } : null
  const expiry = [reliableSoil ? soil.validUntil : null, availableWindow ? window.coverageEnd : null]
    .filter((at): at is number => at !== null && at > now)
  const details: WateringAssessmentDetails = {
    ...emptyDetails(action, missingEvidence), checkWindow, amountMl: amountMl === null ? null : { ...amountMl },
    netDeficitMl: canWater && watering.waterDeficit?.netDeficitMl ? { ...watering.waterDeficit.netDeficitMl } : null,
  }
  return finish(result('ready', details, canWater
    ? amountMl === null ? '盆土证据支持定性判断，但缺少适用的供排水参考，不能估算浇入量。' : '盆土安全门和供排水参考均满足当前合成样本条件，水量仅为离线候选。'
    : '日期来自当前条件下的动态预测，只用于检查盆土，不承诺届时需要浇水。',
  expiry.length === 0 ? null : new Date(Math.min(...expiry)).toISOString()))
}
