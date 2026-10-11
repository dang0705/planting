import type {
  DiagnosisMaintenanceSweepInput,
  DiagnosisMaintenanceSweepSummary
} from '../application/visual-maintenance-sweep.js'

/** 事件入口依赖：已组装好的低频补扫。 */
export interface DiagnosisMaintenanceSweepEventHandlerDependencies {
  /** diagnosis 低频补扫（预占到期扫描 → 卡住会话回收）。 */
  readonly sweep: (
    input: DiagnosisMaintenanceSweepInput
  ) => Promise<DiagnosisMaintenanceSweepSummary>
}

/** 从 CloudBase 运行时上下文读取函数超时毫秒（time_limit_in_ms）；取不到返回 null（两阶段都不启动）。 */
function readFunctionTimeoutMs(context: unknown): number | null {
  if (context === null || typeof context !== 'object') {
    return null
  }
  const value = (context as { readonly time_limit_in_ms?: unknown }).time_limit_in_ms
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * `diagnosis-maintenance-sweep` 的 `main(event, context)` 适配：定时触发器事件正文只是「到点了」的信号，不能改变批量或预算；
 * 返回值只含计数摘要。
 */
export function createDiagnosisMaintenanceSweepEventHandler(
  deps: DiagnosisMaintenanceSweepEventHandlerDependencies
) {
  return async (_event: unknown, context: unknown): Promise<DiagnosisMaintenanceSweepSummary> =>
    deps.sweep({ functionTimeoutMs: readFunctionTimeoutMs(context) })
}
