import { PublicRequestError } from '../../foundation/http/request-chain.js'

/**
 * 视觉诊断输入 token 预算守卫（diagnosis-visual-image-input/v1 §4、ClickUp z8v0kmvhnc）。
 *
 * 通俗说明：像上传前先算一下文件大小——调用模型前先估算这次输入大约多少 tokens，超出上限就明确拒绝，
 * 绝不偷偷裁掉图片或上下文。上限（maxInputTokens、maxImages）只能来自 USER_DIAGNOSIS_VISUAL 成本策略快照：
 * 该策略仍待冻结，调用方用 requirePolicy 读取，策略缺失时得到 503，代码里没有默认上限。
 * 下面的常量是已冻结图片输入合同里的结构预留值（不是业务配置），由测试保证与合同 JSON 一致。
 */

/** 已冻结图片输入合同的结构预留值。 */
export const VISUAL_INPUT_BUDGET_CONSTANTS = Object.freeze({
  /** 固定前缀预留（v1.2 实测约 7.9K + 0.4K 余量）。 */
  prefixReserveTokens: 8300,
  /** 诊断上下文摘要上限。 */
  contextSummaryMaxTokens: 600,
  /** 用户描述上限（估算）。 */
  userTextMaxTokens: 300,
  /** 1024² 像素上限下的单图 tokens 上限。 */
  perImageMaxTokens: 1026
})

/** 从成本策略快照读取的上限（不提供默认值）。 */
export interface VisualInputBudgetPolicy {
  /** 单次输入 tokens 上限。 */
  readonly maxInputTokens: number
  /** 单次最多图片数。 */
  readonly maxImages: number
}

/** 本次请求的规模。 */
export interface VisualInputShape {
  /** 本次请求实际携带的图片张数。 */
  readonly imageCount: number
}

/** 预算估算结果。 */
export interface VisualInputBudgetEstimate {
  /** 按合同预留值估算的输入 tokens 上界。 */
  readonly estimatedInputTokens: number
}

/** 按合同预留值估算输入上界，超出策略上限或图片数超限时抛 400 VALIDATION_FAILED。 */
export function assertVisualInputBudget(
  policy: VisualInputBudgetPolicy,
  shape: VisualInputShape
): VisualInputBudgetEstimate {
  if (
    !Number.isInteger(shape.imageCount) ||
    shape.imageCount < 1 ||
    shape.imageCount > policy.maxImages
  ) {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '图片数量超出本次诊断允许的范围')
  }
  const constants = VISUAL_INPUT_BUDGET_CONSTANTS
  const estimatedInputTokens =
    constants.prefixReserveTokens +
    constants.contextSummaryMaxTokens +
    constants.userTextMaxTokens +
    shape.imageCount * constants.perImageMaxTokens
  if (estimatedInputTokens > policy.maxInputTokens) {
    throw new PublicRequestError(
      400,
      'VALIDATION_FAILED',
      '本次诊断输入超出允许范围，请减少图片后重试'
    )
  }
  return { estimatedInputTokens }
}
