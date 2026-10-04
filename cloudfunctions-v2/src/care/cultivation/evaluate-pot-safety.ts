/** 上游已归约的证据；未知不能被强制转成真假值。 */
export type PotEvidenceState = boolean | null

/** 一次不可变输入快照中的实际种植盆器证据。 */
export interface PotSafetyInput {
  /** 是否确认这是植物实际种植内盆；装饰外盆不满足此条件。 */
  readonly actualInnerPotConfirmed: PotEvidenceState
  /** 上游尺寸、单位及形状检查是否已形成有效几何证据。 */
  readonly potGeometryValid: PotEvidenceState
  /** 实际种植内盆的排水孔及排水通道是否有效。 */
  readonly drainageAvailable: PotEvidenceState
}

/** 仅描述盆器证据条件，不代表浇水许可或保水策略准入。 */
export type PotSafetyState = 'safe' | 'drainage_risk' | 'insufficient_evidence'

/** 拒绝脏类型，而非使用 Boolean 转换把字符串或对象作为有效证据。 */
function validateEvidence(value: unknown): asserts value is PotEvidenceState {
  if (value !== true && value !== false && value !== null) {
    throw new TypeError('盆器证据必须为布尔值或明确的未知值 null')
  }
}

/**
 * 按已冻结证据准入合同判定实际内盆安全条件。
 * 不修改事实，不计算保水倍率；没有正式养护策略时也不产生浇水建议。
 */
export function evaluatePotSafety(input: PotSafetyInput): PotSafetyState {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('缺少盆器安全证据对象')
  }
  validateEvidence(input.actualInnerPotConfirmed)
  validateEvidence(input.potGeometryValid)
  validateEvidence(input.drainageAvailable)
  if (input.actualInnerPotConfirmed !== true || input.potGeometryValid !== true) {
    return 'insufficient_evidence'
  }
  if (input.drainageAvailable === false) {
    return 'drainage_risk'
  }
  if (input.drainageAvailable === null) {
    return 'insufficient_evidence'
  }
  return 'safe'
}
