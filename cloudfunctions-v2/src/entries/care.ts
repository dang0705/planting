import pino from 'pino'

import { readCareEnvironment } from '../configuration/environment.js'
import { createCareServer } from '../care/http/server.js'
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

const server = createCareServer({
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
