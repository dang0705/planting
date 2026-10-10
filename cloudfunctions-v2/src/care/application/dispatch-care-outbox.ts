import { CARE_OUTBOX_DISPATCH, type CareTimelineEventType } from '../domain/care-outbox-dispatch-rules.js'

/** 已领取（加租约）的时间线事件；只含公开字段，不含内部主键以外的身份。 */
export interface LeasedCareEvent {
  /** 发件箱行内部主键十进制文本（只用于结算，不进入日志或投影）。 */ readonly id: string
  /** 时间线事件类型（浇水事实或计划完成）。 */ readonly eventType: CareTimelineEventType
  /** 所属统一用户公开引用。 */ readonly userRef: string
  /** 所属用户植物公开引用。 */ readonly userPlantRef: string
  /** 脱敏载荷：只含公开引用、时间与浇水量。 */ readonly payload: Record<string, unknown>
  /** 业务发生 UTC 毫秒。 */ readonly occurredAtMs: number
  /** 本次是第几次尝试（领取时已 +1）。 */ readonly attempt: number
}

/** 领取输入。 */
export interface LeaseCareEventsInput {
  /** 本次运行的租约持有者标识。 */ readonly owner: string
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
  /** 领取后占用租约的毫秒数（默认 30 秒，运维可覆盖 10–120 秒）。 */ readonly leaseMs: number
  /** 本批最多领取的事件条数（默认 100，运维可覆盖 20–500）。 */ readonly limit: number
  /** 最大尝试次数（默认 5，运维可覆盖 3–10；满次进死信）。 */ readonly maxAttempts: number
}

/** 领取结果。 */
export interface LeaseCareEventsResult {
  /** 本次领取到并加上租约的事件。 */ readonly leased: readonly LeasedCareEvent[]
  /** 领取时因“租约过期且已尝试满上限”直接死信的条数。 */ readonly deadLettered: number
}

/** 结算输入。 */
export interface SettleCareEventInput {
  /** 发件箱行内部主键十进制文本。 */ readonly id: string
  /** 本次运行的租约持有者标识。 */ readonly owner: string
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
  /** 结算结论：投递成功、放回重试或进入死信。 */ readonly outcome: 'delivered' | 'retry' | 'dead_letter'
}

/** 单次运行摘要：只含计数，不含任何事件、用户或植物标识。 */
export interface CareOutboxDispatchSummary {
  /** completed：正常结束；failed：领取阶段失败（本次不投递）。 */ readonly outcome: 'completed' | 'failed'
  /** 本次运行领取并加租约的事件条数。 */ readonly leasedCount: number
  /** 本次运行投递成功并结算的事件条数。 */ readonly deliveredCount: number
  /** 失败后放回重试的条数。 */ readonly retryCount: number
  /** 进入死信的条数（含领取时直接死信）。 */ readonly deadLetterCount: number
  /** 结算时发现租约已被接管的条数。 */ readonly lostLeaseCount: number
  /** 本次运行耗时毫秒。 */ readonly durationMs: number
}

/** 白名单日志事件。 */
export type CareOutboxDispatchLogEvent =
  | ({
    /** 单次运行汇总事件名。 */ readonly event: 'care_outbox_dispatch_run'
  } & CareOutboxDispatchSummary)
  | {
    /** 单条投递失败事件名。 */ readonly event: 'care_outbox_delivery_failed'
    /** 错误类名；不记录消息原文。 */ readonly errorName: string
    /** 失败时的尝试次数。 */ readonly attempt: number
  }

/** 派发用例依赖。 */
/** 发件箱派发运维参数（主代理 2026-10-10 裁定可由环境变量在登记范围内覆盖）。 */
export interface CareOutboxDispatchSettings {
  /** 领取后租约秒数（默认 30，允许 10–120）。 */ readonly leaseSeconds: number
  /** 单次最多领取条数（默认 100，允许 20–500）。 */ readonly batchSize: number
  /** 最大尝试次数（默认 5，允许 3–10；用户 2026-10-10 第三轮裁定为运维参数）。 */ readonly maxAttempts: number
}

export interface DispatchCareOutboxDependencies {
  /** 服务端 UTC 毫秒时钟。 */ readonly now: () => number
  /** 为本次运行生成租约持有者标识。 */ readonly createLeaseOwner: () => string
  /** 在独立短事务中领取一批事件。 */ readonly lease: (input: LeaseCareEventsInput) => Promise<LeaseCareEventsResult>
  /** 投递给 user-plant 时间线投影（幂等）；失败抛出。 */ readonly deliver: (event: LeasedCareEvent) => Promise<void>
  /** 在独立短事务中结算一条事件；租约已被接管时返回 false。 */ readonly settle: (input: SettleCareEventInput) => Promise<boolean>
  /** 白名单结构化日志端口。 */ readonly log: (event: CareOutboxDispatchLogEvent) => void
  /** 运维参数（租约秒数、每批条数、最大尝试次数）；入口从环境变量层读取，省略时取代码默认 30 秒 / 100 条 / 5 次。 */
  readonly settings?: CareOutboxDispatchSettings
}

/** 只保留错误类名。 */
function errorNameOf(error: unknown): string {
  return error instanceof Error && /^[A-Za-z0-9_]{1,64}$/u.test(error.name) ? error.name : 'unknown'
}

/**
 * care 发件箱派发用例（user-plant-timeline.md §5）：领取一批 → 逐条投递 → 逐条结算。
 * 至少一次投递：结算失败或运行中断时，租约到期后由下一次运行接管；消费端以唯一约束保证不重复。
 */
export function createDispatchCareOutboxJob(dependencies: DispatchCareOutboxDependencies) {
  return async (): Promise<CareOutboxDispatchSummary> => {
    const startedAtMs = dependencies.now()
    const owner = dependencies.createLeaseOwner()
    const counts = { leasedCount: 0, deliveredCount: 0, retryCount: 0, deadLetterCount: 0, lostLeaseCount: 0 }
    const finish = (outcome: CareOutboxDispatchSummary['outcome']): CareOutboxDispatchSummary => {
      const summary = { outcome, ...counts, durationMs: Math.max(0, dependencies.now() - startedAtMs) }
      dependencies.log({ event: 'care_outbox_dispatch_run', ...summary })
      return summary
    }
    const maxAttempts = dependencies.settings?.maxAttempts ?? CARE_OUTBOX_DISPATCH.maxAttempts
    let leased: LeaseCareEventsResult
    try {
      leased = await dependencies.lease({ owner, nowMs: startedAtMs, leaseMs: (dependencies.settings?.leaseSeconds ?? CARE_OUTBOX_DISPATCH.leaseSeconds) * 1000,
        limit: dependencies.settings?.batchSize ?? CARE_OUTBOX_DISPATCH.batchSize, maxAttempts })
    } catch { return finish('failed') }
    counts.leasedCount = leased.leased.length
    counts.deadLetterCount = leased.deadLettered
    for (const event of leased.leased) {
      let outcome: SettleCareEventInput['outcome'] = 'delivered'
      try { await dependencies.deliver(event) } catch (error: unknown) {
        outcome = event.attempt >= maxAttempts ? 'dead_letter' : 'retry'
        dependencies.log({ event: 'care_outbox_delivery_failed', errorName: errorNameOf(error), attempt: event.attempt })
      }
      let settled: boolean
      try { settled = await dependencies.settle({ id: event.id, owner, nowMs: dependencies.now(), outcome }) } catch { settled = false }
      if (!settled) { counts.lostLeaseCount += 1; continue }
      if (outcome === 'delivered') { counts.deliveredCount += 1 } else if (outcome === 'retry') { counts.retryCount += 1 } else { counts.deadLetterCount += 1 }
    }
    return finish('completed')
  }
}
