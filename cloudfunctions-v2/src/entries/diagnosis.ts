import pino from 'pino'

import { HTTP_REQUEST_WRITE_POLICY } from '../configuration/business-policies/index.js'
import { createMysqlTypedPolicyReader, policyRulesPort } from '../foundation/policy/mysql-typed-policy-reader.js'
import { readFunctionEnvironment } from '../configuration/environment.js'
import {
  createMysql2ConnectionSource,
  withReadConnection,
  toSqlParameters
} from '../foundation/database/mysql2-connection-source.js'
import { createResolveGuestOrUserPrincipal } from '../identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../identity/repository/mysql-guest-session-repository.js'
import {
  createMysqlUserPrincipalRepository,
  type UserPrincipalSqlRow
} from '../identity/repository/mysql-user-principal-repository.js'
import { createDiagnosisServer } from '../diagnosis/http/server.js'

/** CloudBase HTTP运行约定的监听端口。 */
const servicePort = 9000
/** 环境变量层统一读取（日志级别、数据库；非法即启动失败，错误不含取值）。 */
const environment = readFunctionEnvironment(process.env)

/** 只记录脱敏事件；不输出连接、身份、提示词或请求正文。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['headers', 'authorization', 'body', 'env', 'config'], censor: '[已脱敏]' }
})
const source = createMysql2ConnectionSource(environment.database)
/** guest_or_authenticated：`Bearer guest.<令牌>` 解析为游客（guest-token/v1 §2），其他 Bearer 解析为登录用户。 */
const resolvePrincipal = createResolveGuestOrUserPrincipal({
  guestRepository: createMysqlGuestSessionRepository(source),
  resolveUser: createResolveUserPrincipalUseCase({
  repository: {
    read: input =>
      withReadConnection(source, connection =>
        createMysqlUserPrincipalRepository({
          executeQuery: async (sql, parameters) =>
            (await connection.query(
              sql,
              toSqlParameters(parameters)
            )) as unknown as readonly UserPrincipalSqlRow[]
        }).read(input)
      )
  }
  })
})
/** HTTP 写入策略快照端口（幂等保留期，用户 2026-10-10 裁定迁入策略发布）。 */
const readHttpWriteRules = policyRulesPort(createMysqlTypedPolicyReader(source, HTTP_REQUEST_WRITE_POLICY), () => Date.now())
const server = createDiagnosisServer({
  readHttpWriteRules,
  connectionSource: source,
  resolvePrincipal,
  now: () => Date.now(),
  writeAudit: event => {
    logger.info({ event: 'request_outcome', function: 'diagnosis', ...event }, '请求结果')
  },
  recordRollbackFailure: () => {
    logger.error({ event: 'transaction_rollback_failed', function: 'diagnosis' }, '事务回滚失败')
  }
})
server.listen(servicePort, '0.0.0.0', () => {
  logger.info({ event: 'server_started', function: 'diagnosis' }, 'diagnosis已启动')
})
/** 停止接收新请求，不输出凭证或连接配置。 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ event: 'server_stopping', signal }, 'diagnosis正在停止')
  server.close(error => {
    if (error) {
      process.exitCode = 1
    }
  })
}
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
