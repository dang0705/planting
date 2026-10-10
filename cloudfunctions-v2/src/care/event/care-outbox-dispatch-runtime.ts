import { randomBytes } from 'node:crypto'

import { createMysqlTransactionDriver, type MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { runDatabaseTransaction } from '../../foundation/database/transaction-runner.js'
import { createProjectCareTimelineEvent } from '../../user-plant/application/project-care-timeline-event.js'
import { createDispatchCareOutboxJob, type CareOutboxDispatchLogEvent, type CareOutboxDispatchSettings } from '../application/dispatch-care-outbox.js'
import { leaseCareTimelineEvents, settleCareTimelineEvent } from '../repository/mysql-care-outbox-dispatch-repository.js'

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
