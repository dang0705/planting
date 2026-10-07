import type { LightQuantityRange } from './integrate-ppfd-intervals.js'

/** 系统记录的植物位置读数，摄像头候选不能自行提升为仪表来源。 */
export interface PlantLuxObservation {
  /** 与同刻窗面参考严格匹配的 UTC 毫秒时刻。 */
  readonly atMs: number
  /** 实际植物位置的稳定引用。 */
  readonly plantReference: string
  /** 读数制品或事实的来源，不是发布资格。 */
  readonly sourceRef: string
  /** 仪表与尚未准入的摄像头实验分别标识。 */
  readonly source: 'meter' | 'experimental_camera'
  /** 调用方根据位置及使用条件明确确认，不能猜有效期。 */
  readonly confirmed: boolean
  /** 照度单位，不接受辐照度冒充照度。 */
  readonly unit: 'lux'
  /** 有效零与缺失 null 分开。 */
  readonly lux: LightQuantityRange | null
}

/** 上游窗面模型同刻照度，不接受小时平均值直接当瞬时标定。 */
export interface WindowLuxReference {
  /** 与采集时刻相等的 UTC 毫秒时刻。 */
  readonly atMs: number
  /** 固定的窗面配置引用，变化后不能复用。 */
  readonly windowReference: string
  /** 太阳／辐射及换算制品的明确来源引用。 */
  readonly sourceRef: string
  /** 标定只接受明确瞬时语义。 */
  readonly semantics: 'instantaneous'
  /** 本输入已经由上游换算为照度。 */
  readonly unit: 'lux'
  /** 窗面照度范围；分母含零不能构造有限候选。 */
  readonly lux: LightQuantityRange | null
}

/** 离线单点标定输入，不包含任何默认透射率或用户专业几何项。 */
export interface LuxCompositeAnchorInput {
  /** 必须显式选择共用因子假设，不声称识别两套物理系数。 */
  readonly mode: 'shared_channel_candidate'
  /** 此次目标植物位置。 */
  readonly plantReference: string
  /** 此次对应的窗面配置。 */
  readonly windowReference: string
  /** 位置读数与系统记录的元数据。 */
  readonly observation: PlantLuxObservation
  /** 同刻上游参考，不在本模块调用 Provider。 */
  readonly window: WindowLuxReference
}

/** 只有数学候选可用，不代表策略发布、校准精度或正式建议。 */
export type LuxCompositeAnchor =
  | {
      /** 仅此数学运算的可用状态。 */
      readonly status: 'available'
      /** 始终为离线候选。 */
      readonly productionAdmission: false
      /** 不能把单点结果拆成两个独立传播系数。 */
      readonly mode: 'shared_channel_candidate'
      /** 适用的植物位置引用。 */
      readonly plantReference: string
      /** 适用的窗面配置引用。 */
      readonly windowReference: string
      /** 两项来源供回放追溯，不赋予发布资格。 */
      readonly sourceRefs: readonly string[]
      /** 同刻综合比值范围，大于1不解释为反射增强。 */
      readonly factor: LightQuantityRange
    }
  | {
      /** 缺有效观测或正参考，不私设分母和因子。 */
      readonly status: 'insufficient_evidence'
      /** 缺失原因只描述类别，不回显用户数据。 */
      readonly reason: 'unconfirmed_observation' | 'experimental_source' | 'missing_lux' | 'nonpositive_reference'
      /** 缺证据也不具备正式资格。 */
      readonly productionAdmission: false
    }

/** 受控候选消费的同一配置双通道；不接受额外玻璃或距离倍率。 */
export interface AnchorPpfdInput {
  /** 必须与锚点植物位置一致。 */
  readonly plantReference: string
  /** 必须与锚点窗面配置一致。 */
  readonly windowReference: string
  /** 上游已换算的窗面平均直射 PPFD，缺失保持 null。 */
  readonly directPpfd: LightQuantityRange | null
  /** 上游独立散射 PPFD，不套用太阳角度。 */
  readonly diffusePpfd: LightQuantityRange | null
}

/** 非负有限区间验证，不进行 Number(null) 或数值字符串转换。 */
function validateRange(value: LightQuantityRange | null): void {
  if (value !== null && (!value || !Number.isFinite(value.lower) || !Number.isFinite(value.upper) || value.lower < 0 || value.upper < value.lower)) {
    throw new RangeError('光照候选区间非法')
  }
}

/** 不把来源引用当成凭证或自动准入标志。 */
function validReference(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** 同刻区间除法；仅固定实验假设，不估计直射光斑、可信度或全天精度。 */
export function deriveLuxCompositeAnchor(input: LuxCompositeAnchorInput): LuxCompositeAnchor {
  const { observation, window } = input
  if (input.mode !== 'shared_channel_candidate' || !validReference(input.plantReference) || !validReference(input.windowReference)
    || observation.plantReference !== input.plantReference || window.windowReference !== input.windowReference
    || !validReference(observation.sourceRef) || !validReference(window.sourceRef)
    || !Number.isSafeInteger(observation.atMs) || !Number.isSafeInteger(window.atMs) || observation.atMs !== window.atMs
    || observation.unit !== 'lux' || window.unit !== 'lux' || window.semantics !== 'instantaneous'
    || typeof observation.confirmed !== 'boolean' || !['meter', 'experimental_camera'].includes(observation.source)) {
    throw new TypeError('Lux锚点来源、位置、单位或时刻不一致')
  }
  validateRange(observation.lux)
  validateRange(window.lux)
  const unavailable = (reason: 'unconfirmed_observation' | 'experimental_source' | 'missing_lux' | 'nonpositive_reference'): LuxCompositeAnchor => ({ status: 'insufficient_evidence', reason, productionAdmission: false })
  if (!observation.confirmed) { return unavailable('unconfirmed_observation') }
  if (observation.source === 'experimental_camera') { return unavailable('experimental_source') }
  if (observation.lux === null || window.lux === null) { return unavailable('missing_lux') }
  if (window.lux.lower <= 0) { return unavailable('nonpositive_reference') }
  const factor = { lower: observation.lux.lower / window.lux.upper, upper: observation.lux.upper / window.lux.lower }
  validateRange(factor)
  return { status: 'available', productionAdmission: false, mode: input.mode, plantReference: input.plantReference,
    windowReference: input.windowReference, sourceRefs: [observation.sourceRef, window.sourceRef], factor }
}

/** 共用实验比值分别传播两通道；缺任一通道不合成完整总量。 */
export function applyLuxCompositeAnchor(anchor: Extract<LuxCompositeAnchor, { status: 'available' }>, input: AnchorPpfdInput) {
  if (anchor.status !== 'available' || anchor.productionAdmission !== false || anchor.mode !== 'shared_channel_candidate'
    || input.plantReference !== anchor.plantReference || input.windowReference !== anchor.windowReference) {
    throw new TypeError('Lux锚点不属于此位置或窗面配置')
  }
  validateRange(anchor.factor)
  const scale = (range: LightQuantityRange | null): LightQuantityRange | null => {
    validateRange(range)
    if (range === null) { return null }
    const result = { lower: range.lower * anchor.factor.lower, upper: range.upper * anchor.factor.upper }
    validateRange(result)
    return result
  }
  const directPpfd = scale(input.directPpfd)
  const diffusePpfd = scale(input.diffusePpfd)
  const totalPpfd = directPpfd === null || diffusePpfd === null ? null : { lower: directPpfd.lower + diffusePpfd.lower, upper: directPpfd.upper + diffusePpfd.upper }
  validateRange(totalPpfd)
  return { directPpfd, diffusePpfd, totalPpfd }
}
