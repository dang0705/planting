import pino from 'pino'

import { WEATHER_PUBLIC_READ_POLICY } from '../configuration/business-policies/index.js'
import { createMysqlTypedPolicyReader, policyRulesPort } from '../foundation/policy/mysql-typed-policy-reader.js'

import { readFunctionEnvironment } from '../configuration/environment.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { createWeatherServer } from '../weather/http/server.js'

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000

/** 环境变量层统一读取（日志级别、数据库；非法即启动失败，错误不含取值）。 */
const environment = readFunctionEnvironment(process.env)

/** 日志只记录固定白名单字段，禁止记录请求头、请求体、连接参数和运行环境。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: { paths: ['req.headers', 'request.headers', 'body', 'env', 'config'], censor: '[已脱敏]' }
})

const connectionSource = createMysql2ConnectionSource(environment.database)

/** weather 公开读取策略快照端口（推荐 top 默认与上限；用户 2026-10-10 裁定迁入策略发布）。 */
const readPublicReadRules = policyRulesPort(createMysqlTypedPolicyReader(connectionSource, WEATHER_PUBLIC_READ_POLICY), () => Date.now())

const server = createWeatherServer({
  readPublicReadRules,
  connectionSource,
  writeAudit: event => {
    logger.info({ event: 'request_outcome', function: 'weather', ...event }, '请求结果')
  }
})

server.listen(servicePort, '0.0.0.0', () => {
  logger.info({ event: 'server_started', function: 'weather' }, 'weather 已启动')
})

/** 收到停止信号时停止接收新连接。 */
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ event: 'server_stopping', signal }, 'weather 正在停止')
  server.close(error => {
    if (error) {
      process.exitCode = 1
    }
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
