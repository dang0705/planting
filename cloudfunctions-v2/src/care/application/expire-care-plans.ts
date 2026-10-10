import { CARE_PLAN_EXPIRY_SCAN, resolveCarePlanExpiryCutoffMs, resolveExpiryRunDeadlineMs } from '../domain/care-plan-expiry-rules.js'

/** 单次扫描结论（§12.6）：清空、到达时长上限、批次失败、未启动（取不到函数超时）。 */
export type CarePlanExpiryOutcome = 'drained' | 'deadline_reached' | 'failed' | 'not_started'

/** 单次扫描摘要：只含计数与时刻，不含任何计划、植物、用户或平台标识。 */
export interface CarePlanExpiryRunSummary {
  /** 本次运行结论：清空、到达时长上限、批次失败或未启动。 */
  readonly outcome: CarePlanExpiryOutcome
  /** 本次已提交的过期计划总数。 */
  readonly expiredCount: number
  /** 本次成功提交的批次数。 */
  readonly batchCount: number
  /** 本次统一截止时刻（ISO UTC）；未启动为 null。 */
  readonly cutoffAt: string | null
  /** 本次运行耗时毫秒。 */
  readonly durationMs: number
}

/** 白名单结构化日志事件（§12.6）；禁止追加任何标识、SQL 或错误原文字段。 */
export type CarePlanExpiryLogEvent =
  | ({
    /** 单次运行汇总事件名，每次运行恰好一条。 */
    readonly event: 'care_plan_expiry_run'
  } & CarePlanExpiryRunSummary)
  | {
    /** 批次失败事件名。 */
    readonly event: 'care_plan_expiry_batch_failed'
    /** 错误类名（如 Error、DatabaseError）；不记录错误消息，避免 SQL 参数或标识外泄。 */
    readonly errorName: string
  }

/** 一批条件更新输入（与 Repository 对齐）。 */
export interface CarePlanExpiryBatchInput {
  /** 本次统一截止 UTC 毫秒。 */
  readonly cutoffMs: number
  /** 本批写入时刻 UTC 毫秒。 */
  readonly nowMs: number
  /** 本批最多改写行数。 */
  readonly limit: number
}

/** 扫描用例依赖。 */
export interface ExpireCarePlansDependencies {
  /** 服务端 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 在独立短事务中执行一批条件更新并返回改写行数；失败抛出（该批整体回滚）。 */
  readonly runBatch: (input: CarePlanExpiryBatchInput) => Promise<number>
  /** 白名单结构化日志端口。 */
  readonly log: (event: CarePlanExpiryLogEvent) => void
}

/** 扫描入参：函数超时毫秒（来自运行时上下文）；取不到为 null。 */
export interface ExpireCarePlansInput {
  /** 函数超时毫秒；取不到为 null，本次不执行。 */
  readonly functionTimeoutMs: number | null
}

/** 只保留错误类名；非 Error 抛出物记为 unknown。 */
function errorNameOf(error: unknown): string {
  return error instanceof Error && typeof error.name === 'string' && /^[A-Za-z0-9_]{1,64}$/u.test(error.name) ? error.name : 'unknown'
}

/**
 * 计划过期扫描用例（long-term-care-contract.md §12.5）。
 *
 * 前端类比：像一个「分页批量置灰」的后台循环——每次最多处理 500 条，处理到不满一页就说明清空了；
 * 到了时长上限就停手，剩下的交给下一个小时。任一批失败只回滚这一批并结束本次运行，不抛出，下一次运行自然补上。
 */
export function createExpireCarePlansJob(dependencies: ExpireCarePlansDependencies) {
  return async (input: ExpireCarePlansInput): Promise<CarePlanExpiryRunSummary> => {
    const startedAtMs = dependencies.now()
    const deadlineMs = resolveExpiryRunDeadlineMs({ startedAtMs, functionTimeoutMs: input.functionTimeoutMs })
    if (deadlineMs === null) {
      const summary: CarePlanExpiryRunSummary = { outcome: 'not_started', expiredCount: 0, batchCount: 0, cutoffAt: null, durationMs: 0 }
      dependencies.log({ event: 'care_plan_expiry_run', ...summary })
      return summary
    }
    const cutoffMs = resolveCarePlanExpiryCutoffMs(startedAtMs)
    const limit = CARE_PLAN_EXPIRY_SCAN.batchSize
    let expiredCount = 0
    let batchCount = 0
    let outcome: CarePlanExpiryOutcome
    for (;;) {
      const currentMs = dependencies.now()
      if (currentMs >= deadlineMs) { outcome = 'deadline_reached'; break }
      let affected: number
      try {
        affected = await dependencies.runBatch({ cutoffMs, nowMs: currentMs, limit })
        if (!Number.isSafeInteger(affected) || affected < 0 || affected > limit) { throw new RangeError('批次影响行数不合法') }
      } catch (error: unknown) {
        dependencies.log({ event: 'care_plan_expiry_batch_failed', errorName: errorNameOf(error) })
        outcome = 'failed'
        break
      }
      batchCount += 1
      expiredCount += affected
      if (affected < limit) { outcome = 'drained'; break }
    }
    const summary: CarePlanExpiryRunSummary = {
      outcome, expiredCount, batchCount, cutoffAt: new Date(cutoffMs).toISOString(), durationMs: dependencies.now() - startedAtMs
    }
    dependencies.log({ event: 'care_plan_expiry_run', ...summary })
    return summary
  }
}
