import type { CareMaintenanceSweepInput, CareMaintenanceSweepSummary } from '../application/care-maintenance-sweep.js'
import { readFunctionTimeoutMs } from './care-plan-expiry-handler.js'

/** 事件入口依赖：已组装好的合并补扫。 */
export interface CareMaintenanceSweepEventHandlerDependencies {
  /** 合并补扫（发件箱补扫 → 计划过期扫描）。 */
  readonly sweep: (input: CareMaintenanceSweepInput) => Promise<CareMaintenanceSweepSummary>
}

/**
 * `care-maintenance-sweep` 的 `main(event, context)` 适配：定时触发器事件正文只是“到点了”的信号，不能改变批量、租约或预算；
 * 函数超时从上下文 `time_limit_in_ms` 读取（部署后须核对），返回值只含计数摘要。
 */
export function createCareMaintenanceSweepEventHandler(dependencies: CareMaintenanceSweepEventHandlerDependencies) {
  return async (_event: unknown, context: unknown): Promise<CareMaintenanceSweepSummary> =>
    dependencies.sweep({ functionTimeoutMs: readFunctionTimeoutMs(context) })
}
