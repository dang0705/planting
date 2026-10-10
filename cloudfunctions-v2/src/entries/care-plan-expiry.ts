import pino from 'pino'

import { createExpireCarePlansJob } from '../care/application/expire-care-plans.js'
import { createCarePlanExpiryEventHandler } from '../care/event/care-plan-expiry-handler.js'
import { expireDueCarePlans } from '../care/repository/mysql-care-plan-expiry-repository.js'
import { readDatabaseConnectionConfig } from '../foundation/config/database-config.js'
import { createMysqlTransactionDriver } from '../foundation/database/mysql-transaction-driver.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { runDatabaseTransaction } from '../foundation/database/transaction-runner.js'

/**
 * care 域事件函数 `care-plan-expiry`（long-term-care-contract.md §12.7）。
 *
 * CloudBase 定时触发器只能挂在普通（事件型）云函数上，HTTP 云函数仅由 HTTP 请求触发，
 * 因此计划过期扫描以 `exports.main(event, context)` 形态单独入口部署；它复用 care Repository 与共享数据库连接，
 * 不监听端口、不挂 HTTP 网关、不承载其他业务。
 */

/** 只输出白名单计数事件；不输出连接、身份、计划或错误原文。 */
const logger = pino({
  base: null,
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(readDatabaseConnectionConfig(process.env))
const driver = createMysqlTransactionDriver(source, () => {
  logger.error({ event: 'transaction_rollback_failed', function: 'care-plan-expiry' }, '事务回滚失败')
})

const job = createExpireCarePlansJob({
  now: () => Date.now(),
  // 每批一个独立短事务：失败只回滚本批，已提交批次保留（§12.5）。
  runBatch: input => runDatabaseTransaction(driver, transaction => expireDueCarePlans(transaction, input)),
  log: event => {
    const level = event.event === 'care_plan_expiry_batch_failed' || (event.event === 'care_plan_expiry_run' && event.outcome !== 'drained') ? 'warn' : 'info'
    logger[level]({ function: 'care-plan-expiry', ...event }, '计划过期扫描')
  }
})

/** CloudBase 事件函数入口（Handler：`index.main`）。 */
export const main = createCarePlanExpiryEventHandler({ job })
