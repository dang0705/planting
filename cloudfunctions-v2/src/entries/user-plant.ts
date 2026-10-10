import pino from 'pino'

import { HTTP_REQUEST_WRITE_POLICY, USER_PLANT_ASSET_RULES_POLICY, USER_PLANT_LIST_RULES_POLICY } from '../configuration/business-policies/index.js'
import { createMysqlTypedPolicyReader, policyRulesPort } from '../foundation/policy/mysql-typed-policy-reader.js'

import { readUserPlantEnvironment } from '../configuration/environment.js'
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
import { createMysqlMvpWateringPolicyReader } from '../care/repository/mysql-mvp-watering-policy-reader.js'
import { createReadProfileProgressSnapshot } from '../user-plant/application/read-profile-progress-snapshot.js'
import { createMysqlProfileProgressPolicyReader } from '../user-plant/repository/mysql-profile-progress-policy-reader.js'

/** 环境变量层统一读取（日志级别、数据库、云存储）；非法即启动失败，错误不含取值。 */
const environment = readUserPlantEnvironment(process.env)

/**
 * 配置目录 Provider `cloudbase_storage`：credentialRef = env:V2_CLOUDBASE_STORAGE_API_KEY（只引用变量名，值在调用时读取、绝不记录），
 * 网关环境 = V2_CLOUDBASE_ENV_ID，总时限默认 10000（白名单运维覆盖）。缺少环境 ID 时不创建 Provider（封面登记 503）。
 */
const storage = environment.storage
  ? createCloudbaseStorageHttpAdapter({ fetch: globalThis.fetch, ...environment.storage })
  : undefined

/** CloudBase HTTP 云函数固定监听端口。 */
const servicePort = 9000

/** 日志只记录固定白名单字段，禁止记录请求头、请求体、Bearer、平台主体、连接参数和运行环境。 */
const logger = pino({
  base: null,
  level: environment.logLevel,
  redact: {
    paths: ['req.headers', 'request.headers', 'headers', 'authorization', 'body', 'env', 'config'],
    censor: '[已脱敏]'
  }
})

const connectionSource = createMysql2ConnectionSource(environment.database)
const now = () => Date.now()
const profileWritePolicyReader = createMysqlPublishedProfileWritePolicyReader(connectionSource)
const bindingHttpPolicyReader = createMysqlPublishedHttpWritePolicyReader(connectionSource)
const userPlantLimitsPolicyReader = createMysqlUserPlantLimitsPolicyReader(connectionSource)
/** 档案完整度快照：user-plant/profile_progress 规则 + care/mvp_watering 的 Lux 有效天数（入口组装，user-plant 域不依赖 care 实现）。 */
const profileProgressPolicyReader = createMysqlProfileProgressPolicyReader(connectionSource)
const wateringPolicyReader = createMysqlMvpWateringPolicyReader(connectionSource)
const readProfileProgressSnapshot = createReadProfileProgressSnapshot({
  readProgressPolicy: nowMs => profileProgressPolicyReader.read(nowMs),
  readPlantLightMaxAgeDays: async nowMs => {
    const resolution = await wateringPolicyReader.read(new Date(nowMs).toISOString())
    return resolution.status === 'available' ? resolution.snapshot.luxAnchorMaxAgeDays : null
  }
})
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

/** 请求内只读策略快照端口（用户 2026-10-10 裁定：列表分页、封面资产规则、幂等保留期来自策略发布；无可信发布时对应接口 503）。 */
const readListRules = policyRulesPort(createMysqlTypedPolicyReader(connectionSource, USER_PLANT_LIST_RULES_POLICY), now)
const readAssetRules = policyRulesPort(createMysqlTypedPolicyReader(connectionSource, USER_PLANT_ASSET_RULES_POLICY), now)
const readHttpWriteRules = policyRulesPort(createMysqlTypedPolicyReader(connectionSource, HTTP_REQUEST_WRITE_POLICY), now)

const server = createUserPlantServer({
  readListRules,
  readAssetRules,
  readHttpWriteRules,
  guestClaimLeaseSeconds: environment.guestClaimLeaseSeconds,
  connectionSource,
  ...(storage === undefined ? {} : { storage }),
  now,
  readProfileWriteSnapshot: () => profileWritePolicyReader.read(now()),
  readBindingHttpSnapshot: () => bindingHttpPolicyReader.read(now()),
  readProfileProgressSnapshot,
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
