import pino from 'pino'

import {
  DIAGNOSIS_VISUAL_GENERATION_POLICY,
  HTTP_REQUEST_WRITE_POLICY,
  USER_PLANT_ASSET_RULES_POLICY,
  USER_PLANT_LIST_RULES_POLICY
} from '../configuration/business-policies/index.js'
import { createMysqlTypedPolicyReader, policyRulesPort } from '../foundation/policy/mysql-typed-policy-reader.js'
import { readDiagnosisEnvironment } from '../configuration/environment.js'
import { readBailianDiagnosisEnvironment } from '../configuration/bailian-diagnosis-environment.js'
import { createCloudbaseStorageHttpAdapter } from '../foundation/storage/cloudbase-storage-http-adapter.js'
import { createCloudbaseStorageHttpUploader } from '../foundation/storage/cloudbase-storage-http-uploader.js'
import { createMysqlCapabilitySnapshotReader } from '../subscription/repository/mysql-capability-snapshot-reader.js'
import { createImageNormalizer } from '../diagnosis/image/image-normalizer.js'
import { createBailianVisualModelClient } from '../diagnosis/provider/bailian-visual-model-client.js'
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
const environment = readDiagnosisEnvironment(process.env)
/** 百炼视觉诊断 Provider（凭证只按变量名读取；超时与重试缺失时为 null，视觉诊断 503）。 */
const bailian = readBailianDiagnosisEnvironment(process.env)

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
const now = () => Date.now()
/**
 * 生成式视觉诊断装配（ClickUp z8v0kmvhnd）。以下三项按配置目录仍为 pending，入口固定返回 null，接口因此返回 503，
 * 不在代码里写默认值：提示词发布（diagnosis.visual_gen.prompt_release_sha256 / output_schema_version / agent_allowlist_ref）、
 * AI 额度预占有效期（subscription.ai_reservation.ttl_seconds）。长期植物上下文摘要的 user-plant 内部接口尚未实现，暂按「无摘要」拼装。
 */
const visual = {
  readGenerationPolicy: () => createMysqlTypedPolicyReader(source, DIAGNOSIS_VISUAL_GENERATION_POLICY).read(now()),
  readAssetRules: policyRulesPort(createMysqlTypedPolicyReader(source, USER_PLANT_ASSET_RULES_POLICY), now),
  readListRules: policyRulesPort(createMysqlTypedPolicyReader(source, USER_PLANT_LIST_RULES_POLICY), now),
  readCapabilitySnapshot: createMysqlCapabilitySnapshotReader(source, now),
  readPromptRelease: async () => null,
  readReservationTtlSeconds: async () => null,
  readContextSummary: async () => null,
  storage: environment.storage ? createCloudbaseStorageHttpAdapter({ fetch: globalThis.fetch, ...environment.storage }) : null,
  uploader: environment.storage ? createCloudbaseStorageHttpUploader({ fetch: globalThis.fetch, ...environment.storage }) : null,
  normalizer: createImageNormalizer(),
  createModelClient: bailian
    ? (maxOutputTokens: number) => createBailianVisualModelClient({ config: bailian, maxOutputTokens, fetchImpl: globalThis.fetch })
    : null,
  onProcessingError: () => {
    logger.error({ event: 'visual_diagnosis_processing_failed', function: 'diagnosis' }, '视觉诊断后台处理失败')
  }
}
const server = createDiagnosisServer({
  visual,
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
