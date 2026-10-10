import { randomBytes } from 'node:crypto'

import { createMysqlTransactionDriver, type MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { runDatabaseTransaction } from '../../foundation/database/transaction-runner.js'
import { createProjectCareTimelineEvent } from '../../user-plant/application/project-care-timeline-event.js'
import { createDispatchCareOutboxJob, type CareOutboxDispatchLogEvent, type CareOutboxDispatchSettings } from '../application/dispatch-care-outbox.js'
import { leaseCareTimelineEvents, settleCareTimelineEvent } from '../repository/mysql-care-outbox-dispatch-repository.js'
import type { CareLongTermRules } from '../../configuration/business-policies/index.js'
import { createCareMaintenanceSweep, type CareMaintenanceSweepLogEvent } from '../application/care-maintenance-sweep.js'
import { createInlineCareEventDispatcher } from '../application/dispatch-inline-care-events.js'
import { createExpireCarePlansJob, type CarePlanExpiryLogEvent } from '../application/expire-care-plans.js'
import { CARE_OUTBOX_DISPATCH } from '../domain/care-outbox-dispatch-rules.js'
import { expireDueCarePlans } from '../repository/mysql-care-plan-expiry-repository.js'

/**
 * 组装 `care-outbox-dispatch` 派发用例：领取与结算各用独立短事务；投递调用 user-plant 时间线投影（进程内适配，user-plant 只写自己的表）。
 * 事件函数入口与本机真实库测试共用本组装，避免测试与线上接线不一致。
 */
export function createCareOutboxDispatchJobFromSource(dependencies: {
  /** 每次取一条独占连接的连接来源。 */ readonly source: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 服务端 UTC 毫秒时钟。 */ readonly now: () => number
  /** 白名单日志端口。 */ readonly log: (event: CareOutboxDispatchLogEvent) => void
  /** 事务回滚失败观测端口。 */ readonly recordRollbackFailure?: () => void
  /** 运维参数（来自环境变量层）；省略时取代码默认。 */ readonly settings?: CareOutboxDispatchSettings
}) {
  const driver = createMysqlTransactionDriver(dependencies.source, () => { dependencies.recordRollbackFailure?.() })
  return createDispatchCareOutboxJob({
    now: dependencies.now,
    createLeaseOwner: () => `dsp_${randomBytes(18).toString('base64url')}`,
    lease: input => runDatabaseTransaction(driver, transaction => leaseCareTimelineEvents(transaction, input)),
    deliver: createProjectCareTimelineEvent({ driver, now: dependencies.now }),
    settle: input => runDatabaseTransaction(driver, transaction => settleCareTimelineEvent(transaction, input)),
    log: dependencies.log,
    ...(dependencies.settings === undefined ? {} : { settings: dependencies.settings })
  })
}

/** 同请求派发组装依赖。 */
export interface InlineCareEventDispatcherFromSourceDependencies {
  /** 每次取一条独占连接的连接来源。 */ readonly source: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 服务端 UTC 毫秒时钟。 */ readonly now: () => number
  /** 最长等待毫秒（环境变量层 V2_CARE_OUTBOX_INLINE_BUDGET_MS，默认 1500）。 */ readonly budgetMs: number
  /** 白名单日志端口。 */ readonly log: (event: CareOutboxDispatchLogEvent) => void
  /** 事务回滚失败观测端口。 */ readonly recordRollbackFailure?: () => void
  /** 发件箱运维参数（与补扫一致）；省略时取代码默认。 */ readonly settings?: CareOutboxDispatchSettings
}

/**
 * 组装写入时顺带派发（long-term-care-contract.md §13）：与补扫同一派发用例，只领取给定 event_id；
 * 外层套等待上限与错误吞掉，care HTTP 入口与本机真实库测试共用本组装。
 */
export function createInlineCareEventDispatcherFromSource(dependencies: InlineCareEventDispatcherFromSourceDependencies) {
  const job = createCareOutboxDispatchJobFromSource(dependencies)
  return createInlineCareEventDispatcher({ budgetMs: dependencies.budgetMs, dispatch: eventIds => job({ eventIds }) })
}

/** 合并补扫组装依赖。 */
export interface CareMaintenanceSweepFromSourceDependencies {
  /** 每次取一条独占连接的连接来源。 */ readonly source: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 服务端 UTC 毫秒时钟。 */ readonly now: () => number
  /** 发件箱运维参数（环境变量层）；省略时取代码默认。 */ readonly outboxSettings?: CareOutboxDispatchSettings
  /** 发件箱阶段时长占函数超时的比例（care.maintenance_sweep）。 */ readonly outboxBudgetFraction: number
  /** 过期扫描单批最多改写行数（环境变量层）。 */ readonly expiryBatchSize: number
  /** 过期扫描时长占其可用时长的比例（环境变量层）。 */ readonly runBudgetFraction: number
  /** 读取长期养护规则策略快照（72 小时宽限）。 */ readonly readLongTermRules: () => Promise<Readonly<Pick<CareLongTermRules, 'planExpiryGraceHours'>> | null>
  /** 白名单日志端口（三类计数事件）。 */ readonly log: (event: CareOutboxDispatchLogEvent | CarePlanExpiryLogEvent | CareMaintenanceSweepLogEvent) => void
  /** 事务回滚失败观测端口。 */ readonly recordRollbackFailure?: () => void
}

/** 组装合并补扫 `care-maintenance-sweep`：事件函数入口与本机真实库测试共用。 */
export function createCareMaintenanceSweepFromSource(dependencies: CareMaintenanceSweepFromSourceDependencies) {
  const batchSize = dependencies.outboxSettings?.batchSize ?? CARE_OUTBOX_DISPATCH.batchSize
  const dispatch = createCareOutboxDispatchJobFromSource({ source: dependencies.source, now: dependencies.now, log: dependencies.log,
    ...(dependencies.recordRollbackFailure === undefined ? {} : { recordRollbackFailure: dependencies.recordRollbackFailure }),
    ...(dependencies.outboxSettings === undefined ? {} : { settings: dependencies.outboxSettings }) })
  const driver = createMysqlTransactionDriver(dependencies.source, () => { dependencies.recordRollbackFailure?.() })
  const expire = createExpireCarePlansJob({ now: dependencies.now, batchSize: dependencies.expiryBatchSize, runBudgetFraction: dependencies.runBudgetFraction,
    readLongTermRules: dependencies.readLongTermRules, log: dependencies.log,
    runBatch: input => runDatabaseTransaction(driver, transaction => expireDueCarePlans(transaction, input)) })
  return createCareMaintenanceSweep({ now: dependencies.now, dispatchOutbox: () => dispatch(), expirePlans: expire,
    outboxBatchSize: batchSize, outboxBudgetFraction: dependencies.outboxBudgetFraction, log: dependencies.log })
}
