import type { CarePlanExpiryRunSummary, ExpireCarePlansInput } from '../application/expire-care-plans.js'

/** 事件入口依赖：已组装好的扫描用例。 */
export interface CarePlanExpiryEventHandlerDependencies {
  /** 计划过期扫描用例。 */
  readonly job: (input: ExpireCarePlansInput) => Promise<CarePlanExpiryRunSummary>
}

/**
 * 从 CloudBase 事件函数上下文读取函数超时毫秒（`time_limit_in_ms`）；不是正整数时返回 null。
 * 该字段未在本仓库真实环境读回验证，部署后须核对（交付遗留）；取不到时用例按 not_started 处理，不猜默认值。
 */
function readFunctionTimeoutMs(context: unknown): number | null {
  if (context === null || typeof context !== 'object') { return null }
  const value = (context as { readonly time_limit_in_ms?: unknown }).time_limit_in_ms
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * care 域事件函数 `care-plan-expiry` 的 `main(event, context)` 适配（long-term-care-contract.md §12.7）。
 * 定时触发器事件正文只作为「到点了」的信号：其中任何字段都不能改变截止时刻、批量或宽限时长。
 * 返回值只含计数摘要（不含标识），会出现在函数调用记录中。
 */
export function createCarePlanExpiryEventHandler(dependencies: CarePlanExpiryEventHandlerDependencies) {
  return async (_event: unknown, context: unknown): Promise<CarePlanExpiryRunSummary> =>
    dependencies.job({ functionTimeoutMs: readFunctionTimeoutMs(context) })
}
