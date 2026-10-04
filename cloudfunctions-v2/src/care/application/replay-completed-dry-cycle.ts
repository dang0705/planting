/** 历史循环证据的三值状态；未知不等于已证实。 */
export type CycleEvidenceState = boolean | null

/** 达到同一目标干燥状态的时间区间，端点为 UTC Unix 毫秒。 */
export interface TargetDryWindow {
  /** 最早可能达到目标的时刻；点值可与最晚时刻相等。 */
  readonly earliestMs: number
  /** 最晚可能达到目标的时刻，必须不早于最早时刻。 */
  readonly latestMs: number
}

/** 从同一历史循环的不可变事实、预测及证据组装的回放输入。 */
export interface CompletedDryCycleInput {
  /** 已确认实际浇水起点；缺失不补零。 */
  readonly actualWateredAtMs: number | null
  /** 本次回放的 UTC 时刻，拒绝尚未结束的观察窗口。 */
  readonly computedAtMs: number
  /** 不含个体校准的历史预测；不是当前轮刚生成的预测。 */
  readonly predictedTargetWindow: TargetDryWindow | null
  /** 已结束且可靠的目标状态观察区间；不是单张表土照片的推断。 */
  readonly observedTargetWindow: TargetDryWindow | null
  /** 上游是否确认循环完成，预测与观察属于同一循环及同一目标状态。 */
  readonly reliableCompletedCycle: CycleEvidenceState
  /** 盆器、基质、位置条件是否一致；换盆等变化使该证据失效。 */
  readonly cultivationConditionsUnchanged: CycleEvidenceState
  /** 历史算法与本次回放是否按发布约束兼容。 */
  readonly predictionVersionCompatible: CycleEvidenceState
  /** 历史预测是否明确未乘入个体校准；避免反馈计算自身。 */
  readonly predictionExcludesPersonalCalibration: CycleEvidenceState
  /** 个体校准策略是否获准；只控制后续校准资格，不阻断离线残差。 */
  readonly calibrationPolicyApproved: CycleEvidenceState
}

/** 离线残差的可审阅结果；不得作为持久化行为或正式校准倍率。 */
export interface CompletedDryCycleReplay {
  /** 固定离线语义，不表示算法已生产发布。 */
  readonly scope: 'offline_replay'
  /** 历史证据齐备才可计算残差。 */
  readonly status: 'replay_ready' | 'insufficient_evidence'
  /** 观察减预测的秒数区间；正值更晚、负值更早，跨零表示方向不确定。 */
  readonly residualSeconds: {
    /** 最早观察减最晚预测，表示残差区间下界，单位秒。 */
    readonly lower: number
    /** 最晚观察减最早预测，表示残差区间上界，单位秒。 */
    readonly upper: number
  } | null
  /** 证据及策略均满足时，可供后续受控校准；不等于已得到倍率。 */
  readonly calibrationEligible: boolean
  /** 本用例不做拟合、阈值筛选、倍率生成或默认倍率 1。 */
  readonly personalCalibration: null
}

/** 固定 ECMAScript 日期表示范围及整数毫秒，不是业务阈值。 */
function validateInstant(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > 8_640_000_000_000_000) {
    throw new TypeError('循环时刻必须为有效 UTC 整数毫秒')
  }
}

/** 拒绝倒序区间及未经归一化的字段；null 是合法缺证据。 */
function validateWindow(value: TargetDryWindow | null): void {
  if (value === null) {
    return
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('干燥目标窗口必须是时间区间或 null')
  }
  validateInstant(value.earliestMs)
  validateInstant(value.latestMs)
  if (value.earliestMs > value.latestMs) {
    throw new RangeError('干燥目标窗口不能倒序')
  }
}

/**
 * 回放历史预测与观察，计算保留不确定性的区间残差。
 * 残差区间 = [观察最早 - 预测最晚, 观察最晚 - 预测最早]。
 * 只读历史输入；不写事实、计划、提醒，不将当前轮计算回灌自身。
 */
export function replayCompletedDryCycle(input: CompletedDryCycleInput): CompletedDryCycleReplay {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('缺少历史干湿循环输入')
  }
  validateInstant(input.computedAtMs)
  if (input.actualWateredAtMs !== null) {
    validateInstant(input.actualWateredAtMs)
  }
  validateWindow(input.predictedTargetWindow)
  validateWindow(input.observedTargetWindow)
  const conditions = [input.reliableCompletedCycle, input.cultivationConditionsUnchanged,
    input.predictionVersionCompatible, input.predictionExcludesPersonalCalibration]
  for (const value of [...conditions, input.calibrationPolicyApproved]) {
    if (value !== true && value !== false && value !== null) {
      throw new TypeError('循环证据必须为布尔值或明确的未知值 null')
    }
  }
  const { actualWateredAtMs, predictedTargetWindow: predicted, observedTargetWindow: observed } = input
  if (actualWateredAtMs !== null) {
    if (actualWateredAtMs > input.computedAtMs ||
      (predicted !== null && predicted.earliestMs < actualWateredAtMs) ||
      (observed !== null && observed.earliestMs < actualWateredAtMs)) {
      throw new RangeError('循环窗口必须始于实际浇水之后，浇水事实不能在未来')
    }
  }
  if (actualWateredAtMs === null || predicted === null || observed === null ||
    conditions.some(value => value !== true) || observed.latestMs > input.computedAtMs) {
    return { scope: 'offline_replay', status: 'insufficient_evidence', residualSeconds: null,
      calibrationEligible: false, personalCalibration: null }
  }
  return {
    scope: 'offline_replay', status: 'replay_ready',
    residualSeconds: {
      lower: (observed.earliestMs - predicted.latestMs) / 1000,
      upper: (observed.latestMs - predicted.earliestMs) / 1000,
    },
    calibrationEligible: input.calibrationPolicyApproved === true,
    personalCalibration: null,
  }
}
