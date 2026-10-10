import type { CareOutboxDispatchSummary } from './dispatch-care-outbox.js'
import type { CarePlanExpiryRunSummary, ExpireCarePlansInput } from './expire-care-plans.js'

/**
 * 合并低频补扫 `care-maintenance-sweep`（用户 2026-10-10 裁决；long-term-care-contract.md §12.5、§13）。
 * 一次运行两个阶段：① 发件箱补扫——补派写入时没派成功的时间线事件；② 计划过期扫描——把超过 72 小时未处理的计划标为 expired。
 * 类比：像前端“页面重新可见时”统一跑一次后台同步：先把没发出去的消息补发，再清理过期数据；每步各有时间上限，前一步出错不影响后一步。
 */

/** 发件箱补扫阶段结论：清空、到达本阶段时长上限、领取失败或未启动。 */
export type CareOutboxSweepOutcome = 'drained' | 'deadline_reached' | 'failed' | 'not_started'

/** 发件箱补扫阶段汇总（只含计数）。 */
export interface CareOutboxSweepSummary {
  /** 发件箱补扫阶段的结论。 */ readonly outcome: CareOutboxSweepOutcome
  /** 本阶段执行的派发批次数。 */ readonly runs: number
  /** 本阶段领取的事件总数。 */ readonly leasedCount: number
  /** 本阶段投递成功的事件总数。 */ readonly deliveredCount: number
  /** 本阶段放回重试的事件总数。 */ readonly retryCount: number
  /** 本阶段进入死信的事件总数。 */ readonly deadLetterCount: number
  /** 本阶段租约被他人接管的事件总数。 */ readonly lostLeaseCount: number
}

/** 一次合并补扫的结果（会出现在函数调用记录中，不含任何标识）。 */
export interface CareMaintenanceSweepSummary {
  /** 发件箱补扫阶段汇总。 */ readonly outbox: CareOutboxSweepSummary
  /** 计划过期扫描阶段汇总。 */ readonly expiry: CarePlanExpiryRunSummary
}

/** 合并补扫依赖。 */
export interface CareMaintenanceSweepDependencies {
  /** 服务端 UTC 毫秒时钟。 */ readonly now: () => number
  /** 执行一批发件箱派发（全量补扫）。 */ readonly dispatchOutbox: () => Promise<CareOutboxDispatchSummary>
  /** 执行计划过期扫描（自带分批与时长预算）。 */ readonly expirePlans: (input: ExpireCarePlansInput) => Promise<CarePlanExpiryRunSummary>
  /** 每批最多领取条数（与派发用例一致）；领取数少于它视为清空。 */ readonly outboxBatchSize: number
  /** 发件箱阶段时长占函数超时的比例（care.maintenance_sweep，默认 0.3）。 */ readonly outboxBudgetFraction: number
  /** 白名单结构化日志端口（只含计数）。 */ readonly log: (event: CareMaintenanceSweepLogEvent) => void
}

/** 合并补扫日志事件（每次运行恰好一条）。 */
export interface CareMaintenanceSweepLogEvent extends CareMaintenanceSweepSummary {
  /** 合并补扫汇总日志的事件名。 */ readonly event: 'care_maintenance_sweep_run'
}

/** 合并补扫入参：函数超时毫秒（运行时上下文）；取不到为 null。 */
export interface CareMaintenanceSweepInput {
  /** 函数超时毫秒；取不到时两阶段都不启动。 */ readonly functionTimeoutMs: number | null
}

const notStartedExpiry: CarePlanExpiryRunSummary = { outcome: 'not_started', expiredCount: 0, batchCount: 0, cutoffAt: null, durationMs: 0 }

/** 组装合并补扫。 */
export function createCareMaintenanceSweep(dependencies: CareMaintenanceSweepDependencies) {
  return async (input: CareMaintenanceSweepInput): Promise<CareMaintenanceSweepSummary> => {
    const startedAtMs = dependencies.now()
    const timeout = input.functionTimeoutMs
    const outbox = { outcome: 'not_started' as CareOutboxSweepOutcome, runs: 0, leasedCount: 0, deliveredCount: 0, retryCount: 0, deadLetterCount: 0, lostLeaseCount: 0 }
    if (timeout === null || !Number.isSafeInteger(timeout) || timeout <= 0) {
      const summary = { outbox, expiry: notStartedExpiry }
      dependencies.log({ event: 'care_maintenance_sweep_run', ...summary })
      return summary
    }
    const outboxDeadlineMs = startedAtMs + Math.floor(timeout * dependencies.outboxBudgetFraction)
    for (;;) {
      if (dependencies.now() >= outboxDeadlineMs) { outbox.outcome = 'deadline_reached'; break }
      let batch: CareOutboxDispatchSummary
      try { batch = await dependencies.dispatchOutbox() } catch { outbox.runs += 1; outbox.outcome = 'failed'; break }
      outbox.runs += 1
      outbox.leasedCount += batch.leasedCount
      outbox.deliveredCount += batch.deliveredCount
      outbox.retryCount += batch.retryCount
      outbox.deadLetterCount += batch.deadLetterCount
      outbox.lostLeaseCount += batch.lostLeaseCount
      if (batch.outcome === 'failed') { outbox.outcome = 'failed'; break }
      if (batch.leasedCount < dependencies.outboxBatchSize) { outbox.outcome = 'drained'; break }
    }
    // 过期扫描拿到剩余时长作为它的“函数超时”，再按自身比例留余量。
    const remainingMs = startedAtMs + timeout - dependencies.now()
    const expiry = remainingMs > 0 ? await dependencies.expirePlans({ functionTimeoutMs: remainingMs }) : notStartedExpiry
    const summary = { outbox: { ...outbox }, expiry }
    dependencies.log({ event: 'care_maintenance_sweep_run', ...summary })
    return summary
  }
}
