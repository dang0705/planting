import type { HttpRequestWriteRules, UserPlantAssetRules, UserPlantListRules } from '../../configuration/business-policies/index.js'
import type { PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import { createAuthenticatedEphemeralNewPlantApplicationService } from '../application/save-authenticated-ephemeral-as-new-plant.js'
import { createMysqlAuthenticatedEphemeralNewPlantRepository, createMysqlAuthenticatedEphemeralNewPlantCommitUnknownReader } from '../repository/mysql-authenticated-ephemeral-new-plant-repository.js'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

import type { GuestPrincipalDto, UserCapabilitySnapshotDto, UserPrincipalDto } from '../../contracts/types.js'
import type { UserPlantLimitsPolicySnapshot } from '../../configuration/user-plant-limits-policy.js'
import { PublicRequestError } from '../../foundation/http/request-chain.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { createTemporaryCaseApplicationService } from '../application/create-temporary-case.js'
import { createMysqlTemporaryCaseRepository } from '../repository/mysql-temporary-case-repository.js'
import { createTemporaryCaseRoute, createTemporaryCaseRouteHandler } from './create-temporary-case-route.js'
import { claimGuestPlantCaseRoute } from './claim-guest-plant-case-route.js'
import { createGuestClaimRouteHandler } from './guest-claim-wiring.js'
import { createPutCatalogBindingRouteHandler, putUserPlantCatalogBindingRoute } from './put-catalog-binding-route.js'
import { createPutCatalogBindingApplicationService } from '../application/put-catalog-binding.js'
import { createMysqlTropicalsTaxonReader } from '../../plant-knowledge/repository/mysql-tropicals-taxon-reader.js'
import { createUserBearerAuthenticator } from '../../identity/http/user-bearer-authenticator.js'
import {
  createMysqlTransactionDriver,
  type MysqlConnectionPoolPort,
  type MysqlRollbackFailureRecorder,
  type MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  toSqlParameters,
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../foundation/http/route-dispatcher.js'
import {
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencySqlRow
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { createResolveUserPrincipalUseCase } from '../../identity/application/resolve-user-principal.js'
import {
  createMysqlUserPrincipalRepository,
  type UserPrincipalSqlRow
} from '../../identity/repository/mysql-user-principal-repository.js'
import { createGetUserPlantApplicationService } from '../application/get-user-plant.js'
import { createUserPlantApplicationService } from '../application/create-user-plant.js'
import {
  createArchiveUserPlantApplicationService,
  createRestoreUserPlantApplicationService
} from '../application/transition-user-plant-lifecycle.js'
import {
  createMysqlUserPlantLifecycleRepository,
  type UserPlantLifecycleSqlRow
} from '../repository/mysql-user-plant-lifecycle-repository.js'
import {
  createMysqlUserPlantRepository,
  type UserPlantSqlRow
} from '../repository/mysql-user-plant-repository.js'
import { createGetUserPlantRouteHandler, getUserPlantRoute } from './get-user-plant-route.js'
import { createUserPlantRoute, createUserPlantRouteHandler } from './create-user-plant-route.js'
import { createMeasuredProfileApplicationService } from '../application/save-measured-profile.js'
import { createMysqlMeasuredProfileRepository } from '../repository/mysql-measured-profile-repository.js'
import { createMysqlUserPlantEnvironmentRepository } from '../repository/mysql-user-plant-environment-repository.js'
import { createMysqlUserPlantOutboxRepository } from '../repository/mysql-user-plant-outbox-repository.js'
import { createMysqlCityClimateFitRepository } from '../../weather/repository/mysql-city-climate-fit-repository.js'
import { createUpdateProfileRouteHandler, updateProfileRoute } from './update-profile-route.js'
import type { PublishedProfileWriteSnapshot } from '../repository/mysql-published-profile-write-policy-reader.js'
import type { PublishedHttpWriteSnapshot } from '../repository/mysql-published-profile-write-policy-reader.js'
import { createAuthenticatedEphemeralBindingApplicationService } from '../application/bind-authenticated-ephemeral-case.js'
import { createMysqlAuthenticatedEphemeralBindingRepository, createMysqlAuthenticatedEphemeralBindingCommitUnknownReader } from '../repository/mysql-authenticated-ephemeral-binding-repository.js'
import { createMysqlAuthenticatedEphemeralCaseOwnershipReader } from '../repository/mysql-authenticated-ephemeral-case-ownership-reader.js'
import { authenticatedEphemeralBindingRoute, createAuthenticatedEphemeralBindingRouteHandler } from './authenticated-ephemeral-binding-route.js'
import { createListUserPlantsApplicationService } from '../application/list-user-plants.js'
import { createDeleteUserPlantApplicationService } from '../application/delete-user-plant.js'
import { createMysqlUserPlantListRepository } from '../repository/mysql-user-plant-list-repository.js'
import type { UserPlantReadProjectionSqlRow } from '../repository/mysql-user-plant-repository.js'
import { createListUserPlantsRouteHandler, listUserPlantsRoute } from './list-user-plants-route.js'
import { createDeleteUserPlantRouteHandler, deleteUserPlantRoute } from './delete-user-plant-route.js'
import { createListUserPlantTimelineApplicationService } from '../application/list-user-plant-timeline.js'
import type { PrivateObjectStorage } from '../../foundation/storage/cloudbase-storage-http-adapter.js'
import { createBindUserPlantCoverApplicationService } from '../application/bind-user-plant-cover.js'
import { withCoverLink } from '../application/get-user-plant-cover.js'
import { createMysqlActiveCoverReader } from '../repository/mysql-user-plant-asset-repository.js'
import { bindUserPlantCoverRoute, createBindUserPlantCoverRouteHandler } from './bind-user-plant-cover-route.js'
import { createListUserPlantTimelineRouteHandler, listUserPlantTimelineRoute } from './list-user-plant-timeline-route.js'
import { withListCompleteness, withSavedCompleteness, withSingleCompleteness, type ProfileCompletenessDecoratorDependencies } from '../application/profile-completeness-decorator.js'
import type { ProfileProgressSnapshot } from '../application/read-profile-progress-snapshot.js'
import { createMysqlCatalogBindingPresenceReader } from '../repository/mysql-catalog-binding-presence-reader.js'
import { createGetCoverUploadTargetApplicationService } from '../application/get-cover-upload-target.js'
import { coverUploadTargetRoute, createCoverUploadTargetRouteHandler } from './cover-upload-target-route.js'
import { randomBytes } from 'node:crypto'
import { createConfirmUserPlantIdentityApplicationService } from '../application/confirm-user-plant-identity.js'
import { confirmUserPlantIdentityRoute, createConfirmUserPlantIdentityRouteHandler } from './confirm-user-plant-identity-route.js'
import { createMysqlPublishedIdentityRepository, type PublishedIdentitySqlRow } from '../../plant-knowledge/repository/mysql-published-identity-repository.js'
import {
  archiveUserPlantRoute,
  createArchiveUserPlantRouteHandler,
  createRestoreUserPlantRouteHandler,
  restoreUserPlantRoute
} from './transition-user-plant-route.js'

/** user-plant 云函数 HTTP 服务依赖。 */
export type UserPlantServerDependencies = {
  /** 已发布档案写入策略适配；未接入时PATCH失败关闭，不猜大小、有效期或策略版本。 */
  readonly readProfileWriteSnapshot?: () => Promise<PublishedProfileWriteSnapshot | null>
  /** 绑定只读取HTTP限制，不因缺档案完整度发布而增加无关阻断。 */
  readonly readBindingHttpSnapshot?: () => Promise<PublishedHttpWriteSnapshot | null>
  /** 每请求独占连接来源；连接参数由入口从受控环境变量读取。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 服务端可信时钟，返回当前 UTC 毫秒。 */
  readonly now: () => number
  /** 订阅域服务端快照适配器；没有可信快照时须失败关闭，禁止读取客户端传值。 */
  readonly resolveCapabilitySnapshot: (
    principal: UserPrincipalDto
  ) => Promise<UserCapabilitySnapshotDto>
  /** 请求结果审计端口，只接收脱敏事件。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 事务回滚失败的内部观测端口。 */
  readonly recordRollbackFailure: MysqlRollbackFailureRecorder<Mysql2QueryConnection>
  /** guest_or_authenticated 合并主体解析（游客令牌或登录会话）；未接入时临时案例路由失败关闭为 503。 */
  readonly resolveGuestOrUserPrincipal?: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** 已发布 userplant_limits 策略读取；未接入或无发布时临时案例路由返回 503，不补默认值。 */
  readonly readUserPlantLimitsPolicy?: (capturedAt: string) => Promise<Readonly<UserPlantLimitsPolicySnapshot> | null>
  /** 云存储 Provider（user-plant-cover-asset/v1）；未配置时封面登记 503、单株读取 cover.url 为 null。 */
  readonly storage?: PrivateObjectStorage
  /** 档案完整度快照（规则发布 + 浇水策略 Lux 有效天数）；未接入或不可用时省略完整度字段。 */
  readonly readProfileProgressSnapshot?: (nowMs: number) => Promise<ProfileProgressSnapshot | null>
  /** 读取用户植物列表规则策略快照（user-plant/list_rules）；null 时列表 / 时间线 503。 */
  readonly readListRules: PolicyRulesPort<UserPlantListRules>
  /** 读取封面资产规则策略快照（user-plant/asset_rules）；null 时上传目标 / 封面登记 503。 */
  readonly readAssetRules: PolicyRulesPort<UserPlantAssetRules>
  /** 读取 HTTP 写入策略快照（http/request_write：幂等保留期）；null 时写接口 503。 */
  readonly readHttpWriteRules: PolicyRulesPort<HttpRequestWriteRules>
  /** 游客认领处理租约秒数（环境变量层 V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS，默认 30）。 */
  readonly guestClaimLeaseSeconds: number
}

const okStatus = 200

/** 组装 user-plant 函数的 HTTP 服务：`/health` 探针加冻结路由分发，不监听端口。 */
export function createUserPlantServer(dependencies: UserPlantServerDependencies): Server {
  const driver = createMysqlTransactionDriver(
    dependencies.connectionSource,
    dependencies.recordRollbackFailure
  )
  const userPlantRepository = createMysqlUserPlantRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (transaction, sql, parameters) =>
      (await transaction.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly UserPlantSqlRow[],
    executeWrite: (transaction, sql, parameters) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  })
  const resolvePrincipal = createResolveUserPrincipalUseCase({
    repository: {
      read: input =>
        withReadConnection(dependencies.connectionSource, connection =>
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
  const getUserPlant = createGetUserPlantApplicationService({
    driver,
    repository: userPlantRepository
  })
  const bindingApplication = createAuthenticatedEphemeralBindingApplicationService({
    driver, repository: createMysqlAuthenticatedEphemeralBindingRepository(),
    commitUnknownReadOnlyRepository: createMysqlAuthenticatedEphemeralBindingCommitUnknownReader(dependencies.connectionSource)
  })
  const saveNewApplication = createAuthenticatedEphemeralNewPlantApplicationService({
    driver, repository: createMysqlAuthenticatedEphemeralNewPlantRepository(userPlantRepository),
    commitUnknownReader: createMysqlAuthenticatedEphemeralNewPlantCommitUnknownReader(dependencies.connectionSource)
  })
  const ownedCaseReader = createMysqlAuthenticatedEphemeralCaseOwnershipReader(dependencies.connectionSource)
  const idempotencyRepository = createMysqlHttpIdempotencyRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (transaction, sql, parameters) =>
      (await transaction.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly HttpIdempotencySqlRow[],
    executeWrite: (transaction, sql, parameters) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  })
  const commitUnknownReadOnlyRepository = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository(
    {
      executeQuery: (sql, parameters) =>
        withReadConnection(
          dependencies.connectionSource,
          async connection =>
            (await connection.query(
              sql,
              toSqlParameters(parameters)
            )) as unknown as readonly HttpIdempotencySqlRow[]
        )
    }
  )
  const createUserPlant = createUserPlantApplicationService({
    driver,
    userPlantRepository,
    idempotencyRepository,
    commitUnknownReadOnlyRepository
  })
  const saveProfile = createMeasuredProfileApplicationService({
    driver, profileRepository: createMysqlMeasuredProfileRepository(), userPlantRepository,
    idempotencyRepository, commitUnknownReadOnlyRepository,
    environmentRepository: createMysqlUserPlantEnvironmentRepository(),
    outboxRepository: createMysqlUserPlantOutboxRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
      executeWrite: (transaction, sql, parameters) => transaction.connection.execute(sql, toSqlParameters(parameters))
    })
  })
  /** user-plant → weather 只读适配：环境档案位置只确认城市代码存在于城市目录（策略 v0-city-outdoor）。 */
  const cityExists = async (cityRef: string) => (await withReadConnection(dependencies.connectionSource, connection =>
    createMysqlCityClimateFitRepository({ query: (sql, parameters) => connection.query(sql, toSqlParameters(parameters)) }).getProfile(cityRef))) !== null
  const createTemporaryCase = createTemporaryCaseApplicationService({
    driver,
    idempotencyRepository,
    temporaryCaseRepository: createMysqlTemporaryCaseRepository(),
    commitUnknownReadOnlyRepository
  })
  const lifecycleRepository = createMysqlUserPlantLifecycleRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (transaction, sql, parameters) =>
      (await transaction.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly UserPlantLifecycleSqlRow[],
    executeWrite: (transaction, sql, parameters) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  })
  const lifecycleDependencies = {
    driver,
    idempotencyRepository,
    lifecycleRepository,
    userPlantRepository,
    commitUnknownReadOnlyRepository
  }
  const archiveUserPlant = createArchiveUserPlantApplicationService(lifecycleDependencies)
  const restoreUserPlant = createRestoreUserPlantApplicationService(lifecycleDependencies)

  const transitionRouteDependencies = {
    resolvePrincipal,
    resolveCapabilitySnapshot: dependencies.resolveCapabilitySnapshot,
    archiveUserPlant,
    restoreUserPlant,
    now: dependencies.now,
    writeAudit: dependencies.writeAudit,
    readHttpWriteRules: dependencies.readHttpWriteRules
  }

  /** user-plant → plant-knowledge 只读适配：只确认目录引用存在。 */
  const taxonReader = createMysqlTropicalsTaxonReader({
    query: (sql, parameters) => withReadConnection(dependencies.connectionSource, connection => connection.query(sql, toSqlParameters(parameters)))
  })
  const putCatalogBinding = createPutCatalogBindingApplicationService({ driver, idempotencyRepository, commitUnknownReadOnlyRepository })
  /** 列表（只读事务）与标记删除（幂等写事务）用例，user-plant.md 2026-10-10 冻结。 */
  const listUserPlants = createListUserPlantsApplicationService({
    driver,
    repository: createMysqlUserPlantListRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
      executeQuery: async (transaction, sql, parameters) =>
        (await transaction.connection.query(sql, toSqlParameters(parameters))) as unknown as readonly UserPlantReadProjectionSqlRow[]
    })
  })
  const deleteUserPlant = createDeleteUserPlantApplicationService({ driver, idempotencyRepository, commitUnknownReadOnlyRepository })
  /** 档案完整度叠加（user-plant-profile-completeness/v1）：单株、保存、列表读时现算，失败省略字段。 */
  const catalogPresence = createMysqlCatalogBindingPresenceReader(dependencies.connectionSource)
  const completeness: ProfileCompletenessDecoratorDependencies = {
    ...(dependencies.readProfileProgressSnapshot === undefined ? {} : { readSnapshot: dependencies.readProfileProgressSnapshot }),
    readCatalogBound: (userRef, refs) => catalogPresence.read(userRef, refs), now: dependencies.now
  }
  const saveProfileWithCompleteness = withSavedCompleteness(completeness, saveProfile)
  const readUploadTarget = createGetCoverUploadTargetApplicationService({ getUserPlant, randomHex: () => randomBytes(16).toString('hex') })
  const bearerAuthenticator = createUserBearerAuthenticator(resolvePrincipal)
  /** 登录用户 JSON 路由共享依赖：鉴权、时钟、审计与 HTTP 写入策略端口。 */
  const authenticatedRouteBase = { authenticate: bearerAuthenticator, now: dependencies.now, writeAudit: dependencies.writeAudit, readHttpWriteRules: dependencies.readHttpWriteRules }
  /** user-plant → plant-knowledge 只读适配：身份确认前判定规范身份是否已发布（与公开准入同一 SQL）。 */
  const publishedIdentityReader = createMysqlPublishedIdentityRepository({
    // 本连接来源把 BIGINT 读成十进制文本（避免精度丢失），EXISTS 的 0/1 需转回数字再交给准入判定。
    query: (sql, parameters) => withReadConnection(dependencies.connectionSource, async connection =>
      (await connection.query(sql, toSqlParameters(parameters))).map(row => ({ published: Number(row.published) })) as readonly PublishedIdentitySqlRow[])
  })
  const confirmIdentity = createConfirmUserPlantIdentityApplicationService({ driver, idempotencyRepository, commitUnknownReadOnlyRepository, userPlantRepository })

  const dispatch = createRouteDispatcher([
    {
      route: listUserPlantsRoute,
      handler: createListUserPlantsRouteHandler({ ...authenticatedRouteBase,
        readListRules: dependencies.readListRules, listUserPlants: withListCompleteness(completeness, listUserPlants) })
    },
    {
      route: coverUploadTargetRoute,
      handler: createCoverUploadTargetRouteHandler({ ...authenticatedRouteBase, readAssetRules: dependencies.readAssetRules, readUploadTarget })
    },
    {
      route: bindUserPlantCoverRoute,
      handler: createBindUserPlantCoverRouteHandler({ ...authenticatedRouteBase,
        storage: dependencies.storage, readAssetRules: dependencies.readAssetRules, bindCover: createBindUserPlantCoverApplicationService({ driver, idempotencyRepository, commitUnknownReadOnlyRepository }) })
    },
    {
      route: listUserPlantTimelineRoute,
      handler: createListUserPlantTimelineRouteHandler({ ...authenticatedRouteBase,
        readListRules: dependencies.readListRules, listTimeline: createListUserPlantTimelineApplicationService({ driver }) })
    },
    {
      route: confirmUserPlantIdentityRoute,
      handler: createConfirmUserPlantIdentityRouteHandler({
        ...authenticatedRouteBase,
        isPublishedIdentity: ref => publishedIdentityReader.isPublishedIdentity(ref), confirmIdentity
      })
    },
    {
      route: deleteUserPlantRoute,
      handler: createDeleteUserPlantRouteHandler({ ...authenticatedRouteBase, deleteUserPlant })
    },
    {
      route: putUserPlantCatalogBindingRoute,
      handler: createPutCatalogBindingRouteHandler({
        ...authenticatedRouteBase, authenticate: createUserBearerAuthenticator(resolvePrincipal),
        catalogExists: async ref => (await taxonReader.read(ref)) !== null, putCatalogBinding
      })
    },
    {
      route: authenticatedEphemeralBindingRoute,
      handler: async (request, response, parameters) => {
        let snapshot: PublishedHttpWriteSnapshot | null = null
        try { snapshot = await dependencies.readBindingHttpSnapshot?.() ?? null } catch { /* 发布读取失败关闭，不泄露SQL。 */ }
        return createAuthenticatedEphemeralBindingRouteHandler({
          maxBodyBytes: snapshot?.maxBodyBytes ?? null, resolvePrincipal, readOwnedCase: input => ownedCaseReader.readOwned(input),
          bindExisting: bindingApplication, now: dependencies.now, createPromotionRef: () => `prm_${randomUUID().replaceAll('-', '')}`,
          saveNew: saveNewApplication, createUserPlantRef: () => `upl_${randomUUID().replaceAll('-', '')}`,
          resolveCapabilitySnapshot: dependencies.resolveCapabilitySnapshot,
          writeAudit: dependencies.writeAudit
        })(request, response, parameters)
      }
    },
    {
      route: updateProfileRoute,
      handler: async (request, response, parameters) => {
        // 正文读取前锁定一次发布快照；后续策略切换不改变本请求。
        let snapshot: PublishedProfileWriteSnapshot | null = null
        try { snapshot = await dependencies.readProfileWriteSnapshot?.() ?? null } catch { /* SQL异常不暴露，不补默认策略。 */ }
        return createUpdateProfileRouteHandler({
          resolvePrincipal, getUserPlant, saveProfile: saveProfileWithCompleteness, cityExists, now: dependencies.now, writeAudit: dependencies.writeAudit,
          maxBodyBytes: snapshot?.maxBodyBytes ?? null,
          resolveWritePolicy: async () => snapshot
        })(request, response, parameters)
      }
    },
    {
      route: createUserPlantRoute,
      handler: createUserPlantRouteHandler({
        resolvePrincipal,
        resolveCapabilitySnapshot: dependencies.resolveCapabilitySnapshot,
        createUserPlant,
        now: dependencies.now,
        readHttpWriteRules: dependencies.readHttpWriteRules,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: claimGuestPlantCaseRoute,
      handler: createGuestClaimRouteHandler({
        connectionSource: dependencies.connectionSource,
        driver,
        userPlantRepository,
        resolvePrincipal,
        resolveCapabilitySnapshot: dependencies.resolveCapabilitySnapshot,
        now: dependencies.now,
        writeAudit: dependencies.writeAudit,
        guestClaimLeaseSeconds: dependencies.guestClaimLeaseSeconds
      })
    },
    {
      route: createTemporaryCaseRoute,
      handler: createTemporaryCaseRouteHandler({
        resolvePrincipal: dependencies.resolveGuestOrUserPrincipal ?? (async () => {
          throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
        }),
        readLimitsPolicy: async capturedAt => (await dependencies.readUserPlantLimitsPolicy?.(capturedAt)) ?? null,
        createTemporaryCase,
        now: dependencies.now,
        readHttpWriteRules: dependencies.readHttpWriteRules,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: getUserPlantRoute,
      handler: createGetUserPlantRouteHandler({
        resolvePrincipal,
        // 单株读取在有封面时现场换链接；档案修改的归属读取仍用不带封面的原用例（不触发外部调用）。
        getUserPlant: withSingleCompleteness(completeness,
          withCoverLink({ getUserPlant, readActiveCover: createMysqlActiveCoverReader(dependencies.connectionSource), storage: dependencies.storage })),
        now: dependencies.now,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: archiveUserPlantRoute,
      handler: createArchiveUserPlantRouteHandler(transitionRouteDependencies)
    },
    {
      route: restoreUserPlantRoute,
      handler: createRestoreUserPlantRouteHandler(transitionRouteDependencies)
    }
  ])

  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/health' && request.method === 'GET') {
      request.resume()
      const body = JSON.stringify({ ok: true })
      response.writeHead(okStatus, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body, 'utf8')
      })
      response.end(body)
      return
    }
    dispatch(request, response).catch(() => undefined)
  })
}
