import pino from 'pino'

import { CARE_LONG_TERM_RULES_POLICY } from '../configuration/business-policies/index.js'
import { readCareMaintenanceSweepEnvironment } from '../configuration/environment.js'
import { RUNTIME_PARAMETERS } from '../configuration/runtime-parameters.js'
import { createCareMaintenanceSweepEventHandler } from '../care/event/care-maintenance-sweep-handler.js'
import { createCareMaintenanceSweepFromSource } from '../care/event/care-outbox-dispatch-runtime.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { createMysqlTypedPolicyReader } from '../foundation/policy/mysql-typed-policy-reader.js'

/**
 * care 域事件函数 `care-maintenance-sweep`（用户 2026-10-10 裁决：合并 care-outbox-dispatch 与 care-plan-expiry 为低频补扫）。
 * 定时触发器 cron 见配置目录 `care.maintenance_sweep`（必须与触发器一致）；一次运行先补派发件箱，再扫描过期计划，各自保留时长预算。
 * Nodejs20.19、Handler `index.main`；不监听端口、不挂 HTTP 网关。
 */

/** 环境变量层统一读取（日志级别、数据库、发件箱与过期扫描运维覆盖；非法即启动失败，错误不含取值）。 */
const environment = readCareMaintenanceSweepEnvironment(process.env)

/** 只输出白名单计数事件；不输出连接、身份、事件内容或错误原文。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(environment.database)
/** 长期养护规则策略快照（72 小时宽限）：每次运行读一次，无可信发布时过期阶段不执行。 */
const longTermRulesReader = createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY)

const sweep = createCareMaintenanceSweepFromSource({
  source,
  now: () => Date.now(),
  outboxSettings: environment.outboxDispatch,
  outboxBudgetFraction: RUNTIME_PARAMETERS.care.maintenanceSweep.value.outboxBudgetFractionOfFunctionTimeout,
  expiryBatchSize: environment.expiryBatchSize,
  runBudgetFraction: environment.runBudgetFraction,
  readLongTermRules: async () => (await longTermRulesReader.read(Date.now()))?.rules ?? null,
  log: event => {
    const warn = event.event === 'care_outbox_delivery_failed' || event.event === 'care_plan_expiry_batch_failed'
      || (event.event === 'care_maintenance_sweep_run' && (event.outbox.outcome === 'failed' || event.expiry.outcome === 'failed'))
    logger[warn ? 'warn' : 'info']({ function: 'care-maintenance-sweep', ...event }, '合并补扫')
  },
  recordRollbackFailure: () => { logger.error({ event: 'transaction_rollback_failed', function: 'care-maintenance-sweep' }, '事务回滚失败') }
})

/** CloudBase 事件函数入口（Handler：`index.main`）；函数超时从运行时上下文读取，取不到两阶段都不启动。 */
export const main = createCareMaintenanceSweepEventHandler({ sweep })
