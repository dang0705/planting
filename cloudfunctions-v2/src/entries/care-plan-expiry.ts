import pino from 'pino'

import { CARE_LONG_TERM_RULES_POLICY } from '../configuration/business-policies/index.js'
import { createMysqlTypedPolicyReader } from '../foundation/policy/mysql-typed-policy-reader.js'

import { createExpireCarePlansJob } from '../care/application/expire-care-plans.js'
import { createCarePlanExpiryEventHandler } from '../care/event/care-plan-expiry-handler.js'
import { expireDueCarePlans } from '../care/repository/mysql-care-plan-expiry-repository.js'
import { readCarePlanExpiryEnvironment } from '../configuration/environment.js'
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

/** 环境变量层统一读取（日志级别、数据库、过期扫描每批运维覆盖；非法即启动失败，错误不含取值）。 */
const environment = readCarePlanExpiryEnvironment(process.env)

/** 只输出白名单计数事件；不输出连接、身份、计划或错误原文。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(environment.database)
const driver = createMysqlTransactionDriver(source, () => {
  logger.error({ event: 'transaction_rollback_failed', function: 'care-plan-expiry' }, '事务回滚失败')
})

/** 长期养护规则策略快照（72 小时宽限）：每次运行读一次，无可信发布时本次不执行。 */
const longTermRulesReader = createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY)
const job = createExpireCarePlansJob({
  readLongTermRules: async () => (await longTermRulesReader.read(Date.now()))?.rules ?? null,
  runBudgetFraction: environment.runBudgetFraction,
  now: () => Date.now(),
  batchSize: environment.expiryBatchSize,
  // 每批一个独立短事务：失败只回滚本批，已提交批次保留（§12.5）。
  runBatch: input => runDatabaseTransaction(driver, transaction => expireDueCarePlans(transaction, input)),
  log: event => {
    const level = event.event === 'care_plan_expiry_batch_failed' || (event.event === 'care_plan_expiry_run' && event.outcome !== 'drained') ? 'warn' : 'info'
    logger[level]({ function: 'care-plan-expiry', ...event }, '计划过期扫描')
  }
})

/** CloudBase 事件函数入口（Handler：`index.main`）。 */
export const main = createCarePlanExpiryEventHandler({ job })
