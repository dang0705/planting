import pino from 'pino'

import { readDatabaseConnectionConfig } from '../foundation/config/database-config.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../plant-knowledge/http/server.js'

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000

/** 日志只记录固定白名单字段，禁止记录请求头、请求体、连接参数和运行环境。 */
const logger = pino({
  base: null,
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['req.headers', 'request.headers', 'body', 'env', 'config'], censor: '[已脱敏]' }
})

const connectionSource = createMysql2ConnectionSource(readDatabaseConnectionConfig(process.env))

const server = createPlantKnowledgeServer({
  connectionSource,
  writeAudit: event => {
    logger.info({ event: 'request_outcome', function: 'plant-knowledge', ...event }, '请求结果')
  }
})

server.listen(servicePort, '0.0.0.0', () => {
  logger.info({ event: 'server_started', function: 'plant-knowledge' }, 'plant-knowledge 已启动')
})

/** 收到停止信号时停止接收新连接。 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ event: 'server_stopping', signal }, 'plant-knowledge 正在停止')
  server.close(error => {
    if (error) {
      process.exitCode = 1
    }
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
