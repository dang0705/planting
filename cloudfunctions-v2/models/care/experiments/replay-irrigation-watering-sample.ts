import { replayRootZoneWateringSample, type RootZoneWateringSample } from './replay-root-zone-watering-sample.js'
import { deriveIrrigationApplication, type IrrigationApplicationInput } from './irrigation-application.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../../src/foundation/json/canonical-json-sha256.js'
import { projectWateringReplayResult } from '../../../src/care/application/project-watering-replay-result.js'

/** 同盆样本的供水方法及净留水参考；不从用户字段或材料名称生成。 */
export interface IrrigationWateringSample {
  readonly classification: 'synthetic_experimental'
  /** 既有根区、历史参考及未来环境样本。 */
  readonly rootZone: RootZoneWateringSample
  /** 固定浇入方式及流速等条件的引用，改变即不能沿用参考。 */
  readonly methodRef: string
  readonly application: (Omit<IrrigationApplicationInput, 'netDeficitMl'> & {
    readonly sourceRef: string
    readonly plantReference: string
    readonly cultivationRef: string
    readonly methodRef: string
    /** 参考核验时刻，不能使用预测之后取得的校准。 */
    readonly observedAt: number
    /** 允许净补水范围归属本次根区观察。 */
    readonly rootObservationRef: string
    /** 供排水与操作期间其他水量变化已被核对。 */
    readonly waterBalanceAccounted: boolean
    /** 本候选仅适用于已确认自由排水；其他类型需独立策略。 */
    readonly drainage: 'free' | 'limited' | 'none' | 'unknown'
  }) | null
}

/** 同轮生成日期、净缺口及有条件的施水候选，不产生任何已浇水事实。 */
export function replayIrrigationWateringSample(input: IrrigationWateringSample) {
  const snapshotHash = calculateCanonicalJsonSha256(input as unknown as CanonicalJsonValue)
  const snapshot = structuredClone(input)
  if (snapshot.classification !== 'synthetic_experimental' || !snapshot.methodRef?.trim()) { throw new TypeError('缺少显式合成样本或供水方法') }
  const rootZone = replayRootZoneWateringSample(snapshot.rootZone)
  const app = snapshot.application; const root = snapshot.rootZone.rootZone
  if (app !== null && (!app || !app.sourceRef?.trim() || app.plantReference !== root.plantReference
    || app.cultivationRef !== snapshot.rootZone.cultivationRef || app.methodRef !== snapshot.methodRef
    || app.rootObservationRef !== root.sourceRef || !Number.isSafeInteger(app.observedAt)
    || !Number.isFinite(new Date(app.observedAt).getTime()) || app.observedAt > root.observedAt
    || app.waterBalanceAccounted !== true || !['free', 'limited', 'none', 'unknown'].includes(app.drainage))) {
    throw new TypeError('供排水参考不属于当前同盆、方法和观察，或尚未核对水量平衡')
  }
  const math = deriveIrrigationApplication({ netDeficitMl: rootZone.watering.waterDeficit?.netDeficitMl ?? null,
    retentionFraction: app?.retentionFraction ?? null, allowedNetAdditionMl: app?.allowedNetAdditionMl ?? null,
    calibratedAppliedMl: app?.calibratedAppliedMl ?? null, maximumSingleApplicationMl: app?.maximumSingleApplicationMl ?? null })
  const withheld = (status: 'not_allowed_now' | 'unsupported_drainage' | 'conflicting_evidence') => ({
    ...math, status, appliedAmountCandidateMl: null, retainedEnvelopeMl: null,
  })
  const contradictoryDryState = rootZone.watering.decision.soilGate === 'target_dry_confirmed'
    && root.water.currentVwc !== null && root.triggerVwc !== null && root.water.currentVwc.min > root.triggerVwc.max
  const application = contradictoryDryState ? withheld('conflicting_evidence')
    : rootZone.watering.decision.action !== 'water_allowed' ? withheld('not_allowed_now')
      : app !== null && app.drainage !== 'free' ? withheld('unsupported_drainage') : math
  return { classification: 'synthetic_experimental' as const, productionAdmission: false as const,
    rootZone, application, assessment: projectWateringReplayResult(rootZone.watering, application), snapshot, snapshotHash }
}
