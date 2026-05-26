// LLM pricing snapshots used only for review-side cost estimation.
// Keep pricing centralized because cloud vendors may update listed prices.

export const HUNYUAN_VISION_1_5_INSTRUCT_PRICING = Object.freeze({
  providerKey: 'hunyuan',
  modelKey: 'hunyuan-vision-1.5-instruct',
  displayName: 'Tencent HY Vision 1.5 Instruct',
  currency: 'CNY',
  unitTokens: 1000000,
  inputPricePerUnit: 3,
  outputPricePerUnit: 9,
  cacheSupported: false,
  sourceUrl: 'https://cloud.tencent.com/document/product/1729/97731',
  sourcePageUpdatedAt: '2026-04-08 16:10:12',
  recordedAt: '2026-04-27'
})

export const QWEN3_VL_PLUS_PRICING = Object.freeze({
  providerKey: 'qwen',
  modelKey: 'qwen3-vl-plus',
  displayName: 'Alibaba Qwen3-VL-Plus',
  currency: 'CNY',
  unitTokens: 1000000,
  deploymentScope: 'China mainland / dashscope.aliyuncs.com',
  cacheSupported: true,
  explicitCacheHitInputPriceRatio: 0.1,
  explicitCacheCreationInputPriceRatio: 1.25,
  implicitCacheHitInputPriceRatio: 0.2,
  tiers: Object.freeze([
    Object.freeze({ maxPromptTokens: 32768, inputPricePerUnit: 1, outputPricePerUnit: 10 }),
    Object.freeze({ maxPromptTokens: 131072, inputPricePerUnit: 1.5, outputPricePerUnit: 15 }),
    Object.freeze({ maxPromptTokens: 262144, inputPricePerUnit: 3, outputPricePerUnit: 30 })
  ]),
  sourceUrl: 'https://help.aliyun.com/zh/model-studio/models',
  cacheSourceUrl: 'https://help.aliyun.com/zh/model-studio/context-cache',
  recordedAt: '2026-04-27'
})

export const LLM_PRICING_NOTICE = Object.freeze({
  title: 'Prompt 费用估算口径',
  message: [
    `${HUNYUAN_VISION_1_5_INSTRUCT_PRICING.displayName}：输入 ${HUNYUAN_VISION_1_5_INSTRUCT_PRICING.inputPricePerUnit} 元/百万 tokens，输出 ${HUNYUAN_VISION_1_5_INSTRUCT_PRICING.outputPricePerUnit} 元/百万 tokens，不计缓存折扣。`,
    `${QWEN3_VL_PLUS_PRICING.displayName}（${QWEN3_VL_PLUS_PRICING.deploymentScope}）：按输入 tokens 阶梯计费；0-32K 为输入 1 元/百万、输出 10 元/百万；显式缓存命中输入按 10%，创建缓存按 125%。`,
    `记录日期 ${HUNYUAN_VISION_1_5_INSTRUCT_PRICING.recordedAt}，实际账单以云厂商结算为准。`
  ].join(' ')
})

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function clampTokenCount(value = 0) {
  const count = Number(value || 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function resolveModelText(source = {}) {
  if (typeof source === 'string') {return source}
  return [
    source?.modelKey,
    source?.modelName,
    source?.sourceModelName,
    source?.llmSourceModelName,
    source?.source_model_name,
    source?.providerKey,
    source?.modelProvider,
    source?.sourceModelProvider,
    source?.llmSourceModelProvider,
    source?.source_model_provider,
    source?.hunyuanPromptAudit?.modelName,
    source?.hunyuanPromptAudit?.sourceModelName,
    source?.llmPromptAudit?.sourceModelName,
    source?.usage?.modelName
  ].filter(Boolean).join(' ')
}

export function resolveLlmPricingForModel(source = {}) {
  const modelText = normalizeText(resolveModelText(source))
  if (modelText.includes('qwen3-vl-plus') || modelText.includes('cloudbase_qwen_vl')) {
    return QWEN3_VL_PLUS_PRICING
  }
  return HUNYUAN_VISION_1_5_INSTRUCT_PRICING
}

export function resolveQwen3VlPlusTier(promptTokens = 0) {
  const tokens = clampTokenCount(promptTokens)
  return QWEN3_VL_PLUS_PRICING.tiers.find(tier => tokens <= tier.maxPromptTokens) ||
    QWEN3_VL_PLUS_PRICING.tiers[QWEN3_VL_PLUS_PRICING.tiers.length - 1]
}

function resolveFlatPricing(pricing = HUNYUAN_VISION_1_5_INSTRUCT_PRICING, promptTokens = 0) {
  if (pricing?.tiers?.length) {return resolveQwen3VlPlusTier(promptTokens)}
  return pricing
}

export function calculateLlmTokenCost(tokens = {}, pricingSource = HUNYUAN_VISION_1_5_INSTRUCT_PRICING) {
  const promptTokens = clampTokenCount(tokens?.prompt ?? tokens?.promptTokens)
  const completionTokens = clampTokenCount(tokens?.completion ?? tokens?.completionTokens)
  const pricing = pricingSource?.unitTokens
    ? pricingSource
    : resolveLlmPricingForModel(pricingSource)
  const tierPricing = resolveFlatPricing(pricing, promptTokens)
  const unitTokens = pricing.unitTokens || 1000000
  const inputPricePerUnit = Number(tierPricing.inputPricePerUnit || pricing.inputPricePerUnit || 0)
  const outputPricePerUnit = Number(tierPricing.outputPricePerUnit || pricing.outputPricePerUnit || 0)
  const cacheHitTokens = clampTokenCount(tokens?.promptCacheHitTokens ?? tokens?.cacheHitTokens)
  const cacheCreationInputTokens = clampTokenCount(
    tokens?.promptCacheCreationInputTokens ?? tokens?.cacheCreationInputTokens
  )
  const billableCacheHitTokens = pricing.cacheSupported ? Math.min(cacheHitTokens, promptTokens) : 0
  const billableCacheCreationInputTokens = pricing.cacheSupported
    ? Math.min(cacheCreationInputTokens, Math.max(0, promptTokens - billableCacheHitTokens))
    : 0
  const uncachedInputTokens = pricing.cacheSupported
    ? Math.max(0, promptTokens - billableCacheHitTokens - billableCacheCreationInputTokens)
    : promptTokens
  const cacheHitInputCost = billableCacheHitTokens / unitTokens * inputPricePerUnit *
    Number(pricing.explicitCacheHitInputPriceRatio || 0)
  const cacheCreationInputCost = billableCacheCreationInputTokens / unitTokens * inputPricePerUnit *
    Number(pricing.explicitCacheCreationInputPriceRatio || 0)
  const uncachedInputCost = uncachedInputTokens / unitTokens * inputPricePerUnit
  const inputCost = uncachedInputCost + cacheHitInputCost + cacheCreationInputCost
  const outputCost = completionTokens / unitTokens * outputPricePerUnit

  return {
    pricing,
    tierPricing,
    promptTokens,
    completionTokens,
    inputPricePerUnit,
    outputPricePerUnit,
    uncachedInputTokens,
    cacheHitTokens: billableCacheHitTokens,
    cacheCreationInputTokens: billableCacheCreationInputTokens,
    uncachedInputCost,
    cacheHitInputCost,
    cacheCreationInputCost,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  }
}

export function formatCnyTokenCost(value = 0) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) {return '¥0'}
  if (amount >= 1) {return `¥${amount.toFixed(2)}`}
  if (amount >= 0.01) {return `¥${amount.toFixed(4)}`}
  return `¥${amount.toFixed(6)}`
}
