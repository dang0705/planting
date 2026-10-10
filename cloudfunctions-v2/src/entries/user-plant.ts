import pino from 'pino'

import { readDatabaseConnectionConfig } from '../foundation/config/database-config.js'
import {
  createMysql2ConnectionSource,
  toSqlParameters,
  withReadConnection
} from '../foundation/database/mysql2-connection-source.js'
import { createResolveGuestOrUserPrincipal } from '../identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../identity/repository/mysql-guest-session-repository.js'
import {
  createMysqlUserPrincipalRepository,
  type UserPrincipalSqlRow
} from '../identity/repository/mysql-user-principal-repository.js'
import { createMysqlCapabilitySnapshotReader } from '../subscription/repository/mysql-capability-snapshot-reader.js'
import { createUserPlantServer } from '../user-plant/http/server.js'
import { createMysqlPublishedProfileWritePolicyReader, createMysqlPublishedHttpWritePolicyReader } from '../user-plant/repository/mysql-published-profile-write-policy-reader.js'
import { createMysqlUserPlantLimitsPolicyReader } from '../user-plant/repository/mysql-user-plant-limits-policy-reader.js'
import { createCloudbaseStorageHttpAdapter } from '../foundation/storage/cloudbase-storage-http-adapter.js'

/**
 * 配置目录 Provider `cloudbase_storage`：credentialRef = env:V2_CLOUDBASE_STORAGE_API_KEY（只引用变量名，值在调用时读取、绝不记录），
 * 网关环境 = V2_CLOUDBASE_ENV_ID，totalDeadlineMs = 10000。缺少环境 ID 时不创建 Provider（封面登记 503）。
 */
const storageCredentialEnvName = 'V2_CLOUDBASE_STORAGE_API_KEY'
const storageTotalDeadlineMs = 10_000
const storageEnvId = process.env.V2_CLOUDBASE_ENV_ID
const storage = storageEnvId
  ? createCloudbaseStorageHttpAdapter({ fetch: globalThis.fetch, envId: storageEnvId, readApiKey: () => process.env[storageCredentialEnvName], totalDeadlineMs: storageTotalDeadlineMs })
  : undefined

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000

/** 日志只记录固定白名单字段，禁止记录请求头、请求体、Bearer、平台主体、连接参数和运行环境。 */
const logger = pino({
  base: null,
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers', 'request.headers', 'headers', 'authorization', 'body', 'env', 'config'],
    censor: '[已脱敏]'
  }
})

const connectionSource = createMysql2ConnectionSource(readDatabaseConnectionConfig(process.env))
const now = () => Date.now()
const profileWritePolicyReader = createMysqlPublishedProfileWritePolicyReader(connectionSource)
const bindingHttpPolicyReader = createMysqlPublishedHttpWritePolicyReader(connectionSource)
const userPlantLimitsPolicyReader = createMysqlUserPlantLimitsPolicyReader(connectionSource)
/** guest_or_authenticated：`Bearer guest.<令牌>` 解析为游客（guest-token/v1 §2），其他 Bearer 解析为登录用户。 */
const resolveGuestOrUserPrincipal = createResolveGuestOrUserPrincipal({
  guestRepository: createMysqlGuestSessionRepository(connectionSource),
  resolveUser: createResolveUserPrincipalUseCase({
    repository: {
      read: input =>
        withReadConnection(connectionSource, connection =>
          createMysqlUserPrincipalRepository({
            executeQuery: async (sql, parameters) =>
              (await connection.query(sql, toSqlParameters(parameters))) as unknown as readonly UserPrincipalSqlRow[]
          }).read(input)
        )
    }
  })
})

const server = createUserPlantServer({
  connectionSource,
  ...(storage === undefined ? {} : { storage }),
  now,
  readProfileWriteSnapshot: () => profileWritePolicyReader.read(now()),
  readBindingHttpSnapshot: () => bindingHttpPolicyReader.read(now()),
  resolveGuestOrUserPrincipal,
  readUserPlantLimitsPolicy: capturedAt => userPlantLimitsPolicyReader.read(capturedAt),
  resolveCapabilitySnapshot: createMysqlCapabilitySnapshotReader(connectionSource, now),
  writeAudit: event => {
    logger.info({ event: 'request_outcome', function: 'user-plant', ...event }, '请求结果')
  },
  recordRollbackFailure: () => {
    logger.error({ event: 'transaction_rollback_failed', function: 'user-plant' }, '事务回滚失败')
  }
})

server.listen(servicePort, '0.0.0.0', () => {
  logger.info({ event: 'server_started', function: 'user-plant' }, 'user-plant 已启动')
})

/** 收到停止信号时停止接收新连接。 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ event: 'server_stopping', signal }, 'user-plant 正在停止')
  server.close(error => {
    if (error) {
      process.exitCode = 1
    }
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
