import pino from 'pino'

import { readDatabaseConnectionConfig } from '../foundation/config/database-config.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { createMysqlCapabilitySnapshotReader } from '../subscription/repository/mysql-capability-snapshot-reader.js'
import { createUserPlantServer } from '../user-plant/http/server.js'

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

const server = createUserPlantServer({
  connectionSource,
  now,
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
