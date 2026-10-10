import { randomBytes } from 'node:crypto'

import type {
  HttpRequestWriteRules,
  UserPlantListRules
} from '../../configuration/business-policies/index.js'
import type {
  MysqlConnectionPoolPort,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  toSqlParameters,
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver
} from '../../foundation/database/transaction-runner.js'
import {
  publicErrorSnapshot,
  runIdempotentWrite,
  type IdempotentWriteDependencies
} from '../../foundation/idempotency/run-idempotent-write.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { RunVisualIdempotentWrite } from './application/visual-ports.js'
import type { PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import {
  StorageProviderUnavailableError,
  type PrivateObjectStorage
} from '../../foundation/storage/cloudbase-storage-http-adapter.js'
import type { PrivateObjectUploader } from '../../foundation/storage/cloudbase-storage-http-uploader.js'
import { createMarkAiQuotaProviderResultUnknownUseCase } from '../../subscription/application/mark-ai-quota-provider-result-unknown.js'
import { createReserveAiQuotaUseCase } from '../../subscription/application/reserve-ai-quota.js'
import { createSettleAiQuotaUseCase } from '../../subscription/application/settle-ai-quota.js'
import {
  createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository,
  createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository
} from '../../subscription/repository/mysql-ai-quota-commit-unknown-repository.js'
import { createMysqlAiQuotaProviderUnknownRepository } from '../../subscription/repository/mysql-ai-quota-provider-unknown-repository.js'
import { createMysqlAiQuotaReservationRepository } from '../../subscription/repository/mysql-ai-quota-reservation-repository.js'
import { createMysqlAiQuotaSettlementRepository } from '../../subscription/repository/mysql-ai-quota-settlement-repository.js'
import type { ImageNormalizer } from '../image/image-normalizer.js'
import type { VisualModelClient } from '../provider/visual-model-registry.js'
import { createCreateVisualDiagnosisUseCase } from './application/create-visual-diagnosis.js'
import { createProcessVisualDiagnosisUseCase } from './application/process-visual-diagnosis.js'
import { createReadVisualDiagnosisUseCases } from './application/read-visual-diagnosis.js'
import {
  createGetVisualUploadTargets,
  createRegisterVisualImagesUseCase
} from './application/register-visual-images.js'
import type {
  ReadCapabilitySnapshot,
  ReadReservationTtlSeconds,
  ReadVisualAssetRules,
  ReadVisualContextSummary,
  ReadVisualGenerationPolicy,
  ReadVisualPromptRelease
} from './application/visual-ports.js'
import type { VisualRouteDependencies } from './http/visual-routes.js'
import { createMysqlVisualDiagnosisRepository } from './repository/mysql-visual-diagnosis-repository.js'

/**
 * 视觉诊断模块装配（ClickUp z8v0kmvhnd）：把 MySQL、幂等、AI 额度（预占 / 结算 / 结果未知）、存储、压缩器与模型客户端
 * 接到应用用例上，产出路由依赖与后台处理函数。像前端的「依赖注入容器」：用例只认端口，这里决定生产用哪个实现。
 */

/** 事务上下文类型。 */
type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 模块依赖。 */
export interface VisualModuleDependencies {
  /** MySQL 连接来源。 */
  readonly source: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 共享数据库事务驱动（MySQL）。 */
  readonly driver: DatabaseTransactionDriver<Transaction>
  /** 共享 HTTP 幂等依赖。 */
  readonly idempotency: IdempotentWriteDependencies<Transaction>
  /** HTTP 写入策略（幂等保留期）。 */
  readonly readHttpWriteRules: PolicyRulesPort<HttpRequestWriteRules>
  /** 视觉诊断生成策略。 */
  readonly readGenerationPolicy: ReadVisualGenerationPolicy
  /** 上传资产策略（图片类型白名单与字节上限）。 */
  readonly readAssetRules: ReadVisualAssetRules
  /** 列表分页策略（与植物时间线同口径）。 */
  readonly readListRules: PolicyRulesPort<UserPlantListRules>
  /** 读取能力快照（判断是否拥有视觉诊断能力）。 */
  readonly readCapabilitySnapshot: ReadCapabilitySnapshot
  /** 提示词发布（待冻结时返回 null）。 */
  readonly readPromptRelease: ReadVisualPromptRelease
  /** 预占有效期（待冻结时返回 null）。 */
  readonly readReservationTtlSeconds: ReadReservationTtlSeconds
  /** 长期植物上下文摘要。 */
  readonly readContextSummary: ReadVisualContextSummary
  /** 私有云存储下载；未配置时为 null（登记与处理失败关闭）。 */
  readonly storage: PrivateObjectStorage | null
  /** 私有云存储上传；未配置时为 null。 */
  readonly uploader: PrivateObjectUploader | null
  /** 服务端图片压缩器。 */
  readonly normalizer: ImageNormalizer
  /** 按输出上限创建模型客户端；供应商未配置时为 null。 */
  readonly createModelClient: ((maxOutputTokens: number) => VisualModelClient) | null
  /** 后台处理调度；默认在当前进程下一轮事件循环执行。 */
  readonly scheduleProcessing?: (run: () => Promise<unknown>) => void
  /** 后台处理异常的脱敏观测。 */
  readonly onProcessingError: () => void
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

const randomRef = (prefix: string) => `${prefix}${randomBytes(18).toString('base64url')}`

/** 额度仓储需要的事务内 SQL 执行器。 */
function quotaExecutor() {
  return {
    executeQuery: async (transaction: Transaction, sql: string, parameters: readonly unknown[]) =>
      (await transaction.connection.query(sql, toSqlParameters(parameters))) as never,
    executeWrite: async (transaction: Transaction, sql: string, parameters: readonly unknown[]) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  }
}

/** 未配置存储时的失败关闭实现。 */
const unavailableStorage: PrivateObjectStorage = {
  getDownloadUrl: () => Promise.reject(new StorageProviderUnavailableError()),
  download: () => Promise.reject(new StorageProviderUnavailableError())
}
const unavailableUploader: PrivateObjectUploader = {
  upload: () => Promise.reject(new StorageProviderUnavailableError())
}

/** 并发冲突类数据库错误（死锁、锁等待超时）：整笔已回滚、未记录首次结果，客户端可用同一幂等键重试。 */
const retryableLockErrors = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])

/** 幂等写：并发同键提交撞上数据库锁冲突时返回 503（不记录），其他错误照常抛出。 */
function idempotentWriter(deps: VisualModuleDependencies): RunVisualIdempotentWrite {
  return async (idempotency, work): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    try {
      return await runIdempotentWrite(deps.idempotency, idempotency, deps.now(), work)
    } catch (error) {
      if (retryableLockErrors.has(String((error as { code?: unknown })?.code))) {
        return publicErrorSnapshot(503, 'SERVICE_UNAVAILABLE', '请求正在处理，请使用相同幂等键重试')
      }
      throw error
    }
  }
}

/** 装配视觉诊断模块。 */
export function createVisualDiagnosisModule(deps: VisualModuleDependencies) {
  const repository = createMysqlVisualDiagnosisRepository()
  const readOnlyExecutor = {
    executeQuery: (sql: string, parameters: readonly unknown[]) =>
      withReadConnection(
        deps.source,
        async connection => (await connection.query(sql, toSqlParameters(parameters))) as never
      )
  }
  const reservationRepository =
    createMysqlAiQuotaReservationRepository<Transaction>(quotaExecutor())
  const reserveQuota = createReserveAiQuotaUseCase<Transaction>({
    driver: deps.driver,
    repository: reservationRepository,
    createReservationRef: () => randomRef('aqr_'),
    createLedgerRef: () => randomRef('aql_'),
    commitUnknownReadOnlyRepository:
      createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository(readOnlyExecutor)
  })
  const settleQuota = createSettleAiQuotaUseCase<Transaction>({
    driver: deps.driver,
    reservationRepository,
    settlementRepository: createMysqlAiQuotaSettlementRepository<Transaction>(quotaExecutor()),
    createLedgerRef: () => randomRef('aql_'),
    commitUnknownReadOnlyRepository:
      createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository(readOnlyExecutor)
  })
  const markProviderUnknown = createMarkAiQuotaProviderResultUnknownUseCase<Transaction>({
    driver: deps.driver,
    reservationRepository,
    providerUnknownRepository:
      createMysqlAiQuotaProviderUnknownRepository<Transaction>(quotaExecutor())
  })
  const runTransaction = <T>(work: (context: Transaction) => Promise<T>) =>
    runDatabaseTransaction(deps.driver, work)
  const storage = deps.storage ?? unavailableStorage
  const createModelClient = deps.createModelClient
  const process = createProcessVisualDiagnosisUseCase({
    runTransaction,
    repository,
    readPromptRelease: deps.readPromptRelease,
    storage,
    uploader: deps.uploader ?? unavailableUploader,
    normalizer: deps.normalizer,
    createModelClient: maxOutputTokens =>
      createModelClient === null ? null : createModelClient(maxOutputTokens),
    settleQuota,
    markProviderUnknown,
    now: deps.now
  })
  const schedule =
    deps.scheduleProcessing ??
    (run => {
      setImmediate(() => {
        run().catch(() => undefined)
      })
    })
  const create = createCreateVisualDiagnosisUseCase({
    readCapabilitySnapshot: deps.readCapabilitySnapshot,
    readGenerationPolicy: deps.readGenerationPolicy,
    readAssetRules: deps.readAssetRules,
    readPromptRelease: deps.readPromptRelease,
    readReservationTtlSeconds: deps.readReservationTtlSeconds,
    readHttpWriteRules: deps.readHttpWriteRules,
    isModelProviderConfigured: () =>
      createModelClient !== null && deps.storage !== null && deps.uploader !== null,
    readContextSummary: deps.readContextSummary,
    runIdempotent: idempotentWriter(deps),
    repository,
    reserveQuota,
    scheduleProcessing: ref =>
      schedule(() =>
        process(ref).catch(() => {
          deps.onProcessingError()
        })
      ),
    createRef: prefix => randomRef(prefix),
    now: deps.now
  })
  const reads = createReadVisualDiagnosisUseCases({
    withReadContext: work => withReadConnection(deps.source, connection => work({ connection })),
    repository,
    readListRules: deps.readListRules
  })
  const routeDependencies: Omit<
    VisualRouteDependencies,
    'resolvePrincipal' | 'now' | 'writeAudit'
  > = {
    getUploadTargets: createGetVisualUploadTargets({
      readCapabilitySnapshot: deps.readCapabilitySnapshot,
      readAssetRules: deps.readAssetRules,
      randomHex: () => randomBytes(16).toString('hex'),
      now: deps.now
    }),
    registerImages: createRegisterVisualImagesUseCase({
      readCapabilitySnapshot: deps.readCapabilitySnapshot,
      readAssetRules: deps.readAssetRules,
      readHttpWriteRules: deps.readHttpWriteRules,
      storage,
      runIdempotent: idempotentWriter(deps),
      repository,
      createRef: prefix => randomRef(prefix),
      now: deps.now
    }),
    createDiagnosis: create,
    getDiagnosis: reads.get,
    listDiagnoses: reads.list
  }
  return { routeDependencies, process }
}
