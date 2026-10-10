import pino from 'pino'


import { readIdentityEnvironment } from '../configuration/environment.js'
import { createMysql2ConnectionSource } from '../foundation/database/mysql2-connection-source.js'
import { deriveGuestIssuanceSourceKey } from '../identity/http/guest-session-route.js'
import { createIdentityServer } from '../identity/http/server.js'
import { createDouyinMiniprogramCredentialProvider } from '../identity/provider/douyin-miniprogram-credential-provider.js'
import { createPlatformLoginDispatcher } from '../identity/provider/platform-login-dispatcher.js'
import { createMysqlIdentitySessionPolicyReader } from '../identity/repository/mysql-identity-session-policy-reader.js'

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000

/** 环境变量层统一读取（日志级别、数据库、平台登录凭证、登录 Provider 总时限）；非法即启动失败，错误不含取值。 */
const environment = readIdentityEnvironment(process.env)

/** 日志只记录固定脱敏事件类别，禁止记录请求体、Authorization、连接参数或 Provider 原文。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: {
    paths: ['req.headers', 'request.headers', 'headers', 'authorization', 'body', 'env', 'config'],
    censor: '[已脱敏]'
  }
})

const connectionSource = createMysql2ConnectionSource(environment.database)

/**
 * 多平台登录验真（微信/抖音已批准档案＋平台主体 HMAC 密钥 v1；小红书待配置）。
 * 每个平台独立失败关闭，不调用未配置平台、不信任客户端声明的 OpenID。
 */
const verifyPlatformCode = createPlatformLoginDispatcher(environment.platformLogin, globalThis.fetch, {
  wechatTotalDeadlineMs: environment.wechatLoginTotalDeadlineMs,
  douyinTotalDeadlineMs: environment.douyinLoginTotalDeadlineMs
})
/** 只读取 identity/identity_sessions 的唯一活动发布；没有可信发布时返回 null 并拒签。 */
const sessionPolicyReader = createMysqlIdentitySessionPolicyReader(connectionSource)

/** 游客来源摘要子密钥：由平台主体 HMAC 主密钥 v1 经 HKDF 派生；主密钥缺失或过短时为 null，签发入口失败关闭。 */
const issuanceSourceKey = (() => {
  try {
    return deriveGuestIssuanceSourceKey(Buffer.from(environment.platformLogin.PLATFORM_SUBJECT_HMAC_KEY_V1?.trim() ?? '', 'base64'))
  } catch {
    return null
  }
})()
/** 抖音匿名信号换取（与登录同一已批准档案：总时限默认 5 秒、单次）；抖音未配置时为 null，仅按 IP 限流。 */
const douyinAppId = environment.platformLogin.DOUYIN_APPID?.trim()
const douyinAppSecret = environment.platformLogin.DOUYIN_APP_SECRET?.trim()
const douyinProvider = douyinAppId && douyinAppSecret
  ? createDouyinMiniprogramCredentialProvider({ fetch: globalThis.fetch, appId: douyinAppId, appSecret: douyinAppSecret, totalDeadlineMs: environment.douyinLoginTotalDeadlineMs })
  : null

const server = createIdentityServer({
  // 服务签名参数来自环境变量层（V2_SERVICE_SIGNATURE_*；签名方与验证方必须部署同一取值）。
  serviceSignature: environment.serviceSignature,
  connectionSource,
  verifyPlatformCode,
  resolveSessionPolicy: () => sessionPolicyReader.read(new Date().toISOString()),
  now: () => Date.now(),
  guestIssuance: {
    // 游客策略只来自已发布的 identity-session-policy/v2；仍为 v1 或无发布时为 null，签发入口 503（guest-token-contract.md §6）。
    resolveGuestPolicy: async () => (await sessionPolicyReader.read(new Date().toISOString()))?.guest ?? null,
    exchangeDouyinAnonymousCode: douyinProvider === null ? null : code => douyinProvider.exchangeAnonymousCode(code),
    issuanceSourceKey
  },
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
