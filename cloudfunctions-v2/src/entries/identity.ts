import pino from 'pino'

import { readDatabaseConnectionConfig } from '../foundation/config/database-config.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { createIdentityServer } from '../identity/http/server.js'
import { PlatformCredentialEvidenceError } from '../identity/provider/platform-credential-evidence.js'

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000

/** 生产 Provider 与身份策略仍为 pending；本入口在其接入前必须拒绝签发而不是使用默认值。 */
const loginProviderUnavailableMessage = '微信登录验真配置尚未发布'

/** 日志只记录固定脱敏事件类别，禁止记录请求体、Authorization、连接参数或 Provider 原文。 */
const logger = pino({
  base: null,
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers', 'request.headers', 'headers', 'authorization', 'body', 'env', 'config'],
    censor: '[已脱敏]'
  }
})

const connectionSource = createMysql2ConnectionSource(readDatabaseConnectionConfig(process.env))

const server = createIdentityServer({
  connectionSource,
  // 受控 Provider 配置尚未确认，禁止调用外部平台或信任客户端声明的 OpenID。
  verifyWechatCode: async () => {
    throw new PlatformCredentialEvidenceError(
      'INTERNAL_IDENTITY_CONFIGURATION_INVALID',
      loginProviderUnavailableMessage
    )
  },
  // active identity_sessions 发布快照尚未接入；没有它必须在消耗 code 前失败关闭。
  resolveSessionPolicy: async () => null,
  now: () => Date.now(),
  writeAudit: event => {
    logger.info({ event: 'request_outcome', function: 'identity', ...event }, '请求结果')
  },
  recordRollbackFailure: () => {
    logger.error({ event: 'transaction_rollback_failed', function: 'identity' }, '事务回滚失败')
  }
})

server.listen(servicePort, '0.0.0.0', () => {
  logger.info({ event: 'server_started', function: 'identity' }, 'identity 已启动')
})

/** 收到停止信号时停止接收新连接。 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ event: 'server_stopping', signal }, 'identity 正在停止')
  server.close(error => {
    if (error) {
      process.exitCode = 1
    }
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
