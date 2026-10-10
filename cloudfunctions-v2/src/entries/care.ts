import pino from 'pino'

import { CARE_LONG_TERM_RULES_POLICY, HTTP_REQUEST_WRITE_POLICY } from '../configuration/business-policies/index.js'
import { createMysqlTypedPolicyReader, policyRulesPort } from '../foundation/policy/mysql-typed-policy-reader.js'

import { readCareEnvironment } from '../configuration/environment.js'
import { createCareServer } from '../care/http/server.js'
import { createInlineCareEventDispatcherFromSource } from '../care/event/care-outbox-dispatch-runtime.js'
import { createOpenMeteoRadiationFetcher } from '../care/provider/open-meteo-radiation-fetcher.js'
import { createMysql2ConnectionSource, toSqlParameters, withReadConnection } from '../foundation/database/mysql2-connection-source.js'
import { createResolveGuestOrUserPrincipal } from '../identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../identity/repository/mysql-guest-session-repository.js'
import { createMysqlUserPrincipalRepository, type UserPrincipalSqlRow } from '../identity/repository/mysql-user-principal-repository.js'

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000
/** 环境变量层统一读取（日志级别、数据库、Open-Meteo 总时限；非法即启动失败，错误不含取值）。 */
const environment = readCareEnvironment(process.env)

/** 只记录脱敏事件；不输出连接、身份、坐标或请求正文。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(environment.database)
const now = () => Date.now()
/** guest_or_authenticated：`Bearer guest.<令牌>` 解析为游客，其他 Bearer 解析为登录用户。 */
const resolvePrincipal = createResolveGuestOrUserPrincipal({
  guestRepository: createMysqlGuestSessionRepository(source),
  resolveUser: createResolveUserPrincipalUseCase({
    repository: {
      read: input => withReadConnection(source, connection => createMysqlUserPrincipalRepository({
        executeQuery: async (sql, parameters) => (await connection.query(sql, toSqlParameters(parameters))) as unknown as readonly UserPrincipalSqlRow[]
      }).read(input))
    }
  })
})

/** 请求内只读策略快照端口（用户 2026-10-10 裁定：业务参数来自策略发布；无可信发布时对应接口 503）。 */
const readLongTermRules = policyRulesPort(createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY), now)
const readHttpWriteRules = policyRulesPort(createMysqlTypedPolicyReader(source, HTTP_REQUEST_WRITE_POLICY), now)

/** 写入时顺带派发（用户 2026-10-10 裁决）：只派发本请求新写入的事件，最长等待 V2_CARE_OUTBOX_INLINE_BUDGET_MS（默认 1500 毫秒）。 */
const dispatchCreatedEvents = createInlineCareEventDispatcherFromSource({
  source, now, budgetMs: environment.inlineDispatch.budgetMs, settings: environment.inlineDispatch.outboxDispatch,
  log: event => {
    const level = event.event === 'care_outbox_delivery_failed' || (event.event === 'care_outbox_dispatch_run' && event.outcome === 'failed') ? 'warn' : 'info'
    logger[level]({ function: 'care', mode: 'inline', ...event }, '时间线事件同请求派发')
  },
  recordRollbackFailure: () => { logger.error({ event: 'transaction_rollback_failed', function: 'care' }, '事务回滚失败') }
})

const server = createCareServer({
  dispatchCreatedEvents,
  readLongTermRules,
  readHttpWriteRules,
  connectionSource: source,
  now,
  resolvePrincipal,
  fetchRadiation: createOpenMeteoRadiationFetcher({ fetch: globalThis.fetch, now, totalDeadlineMs: environment.openMeteoTotalDeadlineMs, logger }),
  writeAudit: event => { logger.info({ event: 'request_outcome', function: 'care', ...event }, '请求结果') },
  recordRollbackFailure: () => { logger.error({ event: 'transaction_rollback_failed', function: 'care' }, '事务回滚失败') }
})

server.listen(servicePort, '0.0.0.0', () => {
  logger.info({ event: 'server_started', function: 'care' }, 'care 已启动')
})

/** 停止接收新请求，不输出凭证或连接配置。 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ event: 'server_stopping', signal }, 'care 正在停止')
  server.close(error => { if (error) { process.exitCode = 1 } })
}
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
