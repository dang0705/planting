import pino from 'pino'

import { createCareOutboxDispatchEventHandler } from '../care/event/care-outbox-dispatch-handler.js'
import { createCareOutboxDispatchJobFromSource } from '../care/event/care-outbox-dispatch-runtime.js'
import { readCareOutboxDispatchEnvironment } from '../configuration/environment.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'

/**
 * care 域事件函数 `care-outbox-dispatch`（user-plant-timeline.md §5；配置目录 `care.outbox_dispatch`，每分钟一次）。
 * CloudBase 定时触发器只能挂在事件型云函数上，因此以 `exports.main(event, context)` 单独入口部署（Nodejs20.19、Handler `index.main`），
 * 复用共享连接与 Repository，不监听端口、不挂 HTTP 网关。
 */

/** 环境变量层统一读取（日志级别、数据库、发件箱租约 / 每批运维覆盖；非法即启动失败，错误不含取值）。 */
const environment = readCareOutboxDispatchEnvironment(process.env)

/** 只输出白名单计数事件；不输出连接、身份、事件内容或错误原文。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(environment.database)

const job = createCareOutboxDispatchJobFromSource({
  source,
  now: () => Date.now(),
  settings: environment.outboxDispatch,
  log: event => {
    const level = event.event === 'care_outbox_delivery_failed' || (event.event === 'care_outbox_dispatch_run' && event.outcome === 'failed') ? 'warn' : 'info'
    logger[level]({ function: 'care-outbox-dispatch', ...event }, '时间线事件派发')
  },
  recordRollbackFailure: () => { logger.error({ event: 'transaction_rollback_failed', function: 'care-outbox-dispatch' }, '事务回滚失败') }
})

/** CloudBase 事件函数入口（Handler：`index.main`）。 */
export const main = createCareOutboxDispatchEventHandler({ job })
