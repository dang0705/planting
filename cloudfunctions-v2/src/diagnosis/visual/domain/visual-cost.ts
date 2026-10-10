import type { VisualCostPolicy, VisualModelTariff } from '../../../configuration/business-policies/index.js'
import type { VisualModelUsage } from '../../provider/visual-model-registry.js'

/**
 * 视觉诊断成本计算（care-points-and-ai-quota.md §AI 点数、diagnosis-visual-api.md §2.3）。
 *
 * 通俗说明：像购物车结算——每次模型调用按「用了多少 tokens × 单价」算钱，全部用整数微元（1 元 = 1,000,000 微元），
 * 不用浮点金额；缓存命中按折扣价、缓存创建按加价算；最后把总成本换算成 AI 点数（1 点 = 800 微元，向上取整）。
 */

/** 一次成功模型调用的计量与所用模型。 */
export interface VisualModelCall {
  /** 本次调用实际使用的模型代码（决定适用哪份价目）。 */
  readonly modelCode: string
  /** 本次调用供应商回包中的 tokens 计量。 */
  readonly usage: VisualModelUsage
}

/** 基点分母：10,000 基点 = 100%。 */
const basisPointsDenominator = 10_000
/** 价目单位：每百万 tokens。 */
const tokensPerPriceUnit = 1_000_000

/** 单次调用成本（微元，向上取整）：未缓存输入 + 缓存命中 + 缓存创建 + 输出。 */
export function computeVisualCallCostMicros(usage: VisualModelUsage, tariff: VisualModelTariff): number {
  const values = [usage.promptTokens, usage.completionTokens, usage.cachedTokens, usage.cacheCreationTokens]
  if (!values.every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError('计量必须是非负整数')
  }
  const uncached = Math.max(0, usage.promptTokens - usage.cachedTokens - usage.cacheCreationTokens)
  const input = tariff.inputMicrosPerMillionTokens
  const numerator =
    uncached * input * basisPointsDenominator +
    usage.cachedTokens * input * tariff.cacheHitBasisPoints +
    usage.cacheCreationTokens * input * tariff.cacheCreateBasisPoints +
    usage.completionTokens * tariff.outputMicrosPerMillionTokens * basisPointsDenominator
  return Math.ceil(numerator / (basisPointsDenominator * tokensPerPriceUnit))
}

/** 多次调用总成本；任一调用的模型不在策略价目中时失败关闭（不能按其他模型价目估算）。 */
export function sumVisualCostMicros(
  calls: readonly VisualModelCall[],
  tariffs: Readonly<Record<string, VisualModelTariff>>
): number {
  return calls.reduce((total, call) => {
    const tariff = tariffs[call.modelCode]
    if (tariff === undefined) {
      throw new RangeError('模型缺少价目')
    }
    return total + computeVisualCallCostMicros(call.usage, tariff)
  }, 0)
}

/** 点数换算结果。 */
export interface VisualChargedPoints {
  /** 按实际成本换算、交给额度结算的点数；超过预占时由额度用例转入待对账。 */
  readonly requestedPoints: number
  /** 公开展示的扣点：不超过预估点数（超出部分由平台承担）。 */
  readonly publicChargedPoints: number
}

/** 结算点数 = ceil(costMicros / microsPerPoint)；公开扣点封顶为预估点数。 */
export function computeVisualChargedPoints(
  costMicros: number,
  cost: Pick<VisualCostPolicy, 'microsPerPoint' | 'estimatedPoints'>
): VisualChargedPoints {
  if (!Number.isSafeInteger(costMicros) || costMicros < 0) {
    throw new RangeError('成本必须是非负整数微元')
  }
  const requestedPoints = Math.ceil(costMicros / cost.microsPerPoint)
  return { requestedPoints, publicChargedPoints: Math.min(requestedPoints, cost.estimatedPoints) }
}
