import pino from 'pino'

import { createCareServer } from '../care/http/server.js'
import { normalizeOpenMeteoRadiation } from '../care/light/normalize-open-meteo-radiation.js'
import { fetchOpenMeteoRadiation } from '../care/provider/open-meteo-radiation-client.js'
import { readDatabaseConnectionConfig } from '../foundation/config/database-config.js'
import { createMysql2ConnectionSource, toSqlParameters, withReadConnection } from '../foundation/database/mysql2-connection-source.js'
import { createResolveGuestOrUserPrincipal } from '../identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../identity/repository/mysql-guest-session-repository.js'
import { createMysqlUserPrincipalRepository, type UserPrincipalSqlRow } from '../identity/repository/mysql-user-principal-repository.js'

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000
/** 配置目录 Provider `open_meteo` 已确认总时限（total=8000ms、1 次、不重试），同 identity 入口 Provider 时限约定。 */
const openMeteoTotalDeadlineMs = 8000

/** 只记录脱敏事件；不输出连接、身份、坐标或请求正文。 */
const logger = pino({
  base: null,
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(readDatabaseConnectionConfig(process.env))
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

const server = createCareServer({
  connectionSource: source,
  now,
  resolvePrincipal,
  fetchRadiation: async query => {
    const fetched = await fetchOpenMeteoRadiation({ fetch: globalThis.fetch, now, totalDeadlineMs: openMeteoTotalDeadlineMs }, query)
    if (fetched.status !== 'ok') {
      logger.warn({ event: 'provider_unavailable', provider: 'open_meteo', reason: fetched.reason }, 'Open-Meteo 不可用')
      return null
    }
    try {
      return normalizeOpenMeteoRadiation(fetched.raw, { series: 'hourly', sourceRef: 'open_meteo_forecast_v1', fetchedAtMs: fetched.fetchedAtMs })
    } catch {
      logger.warn({ event: 'provider_unavailable', provider: 'open_meteo', reason: 'normalize_failed' }, 'Open-Meteo 响应不可用')
      return null
    }
  },
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
