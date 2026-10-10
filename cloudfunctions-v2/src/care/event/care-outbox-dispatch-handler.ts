import type { CareOutboxDispatchSummary } from '../application/dispatch-care-outbox.js'

/** 事件入口依赖：已组装好的派发用例。 */
export interface CareOutboxDispatchEventHandlerDependencies {
  /** 已组装好的单次派发用例（领取、投递、结算）。 */
  readonly job: () => Promise<CareOutboxDispatchSummary>
}

/**
 * care 事件函数 `care-outbox-dispatch` 的 `main(event, context)` 适配（user-plant-timeline.md §5）。
 * 定时触发器事件正文只作为“到点了”的信号，其中任何字段都不能改变批量、租约或重试次数；返回值只含计数摘要。
 */
export function createCareOutboxDispatchEventHandler(dependencies: CareOutboxDispatchEventHandlerDependencies) {
  return async (_event: unknown, _context: unknown): Promise<CareOutboxDispatchSummary> => dependencies.job()
}
