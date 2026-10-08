import { createServer, type Server } from 'node:http'

import {
  createPublicContractValidators,
  type CreateIdentitySessionRequestDto,
  type CreateIdentitySessionResponseDto
} from '../../contracts/index.js'
import type { IdentitySessionPolicySnapshot } from '../../configuration/identity-session-policy.js'
import {
  createMysqlTransactionDriver,
  type MysqlConnectionPoolPort,
  type MysqlRollbackFailureRecorder
} from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { createRouteDispatcher, type RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type {
  PublicErrorType,
  RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import { createIssueUserSessionUseCase } from '../application/issue-user-session.js'
import { createMysqlGuestSessionRepository } from '../repository/mysql-guest-session-repository.js'
import { UserSessionIssuanceMaterialError } from '../domain/user-session-issuance-material.js'
import {
  IdentitySessionIssuancePersistenceError,
  createMysqlIdentitySessionIssuanceRepository
} from '../repository/mysql-user-session-issuance-repository.js'
import {
  PlatformCredentialEvidenceError,
  type VerifiedPlatformIdentityEvidence
} from '../provider/platform-credential-evidence.js'
import { IdentityLoginInputError, readJsonBody, verifyJsonContentType, writeJson } from './json-request.js'
import { createGuestSessionRouteHandler, type GuestSessionRouteDependencies } from './guest-session-route.js'
import { createGuestSessionRoute, createIdentitySessionRoute, getUserTrialAnchorInternalRoute } from './routes.js'
import {
  createUserTrialAnchorRouteHandler,
  type ServiceSigningKey
} from './user-trial-anchor-route.js'

/** 服务端健康探针与公开业务成功的稳定 HTTP 状态。 */
const okStatus = Number('200')
/** 格式错误、媒体类型错误和超限输入统一归入冻结的请求验证失败合同。 */
const validationFailedStatus = Number('400')
/** 未验真的平台凭证或失效统一主体使用冻结的身份拒绝状态。 */
const principalInvalidStatus = Number('401')
/** 缺少有效策略、Provider 未配置或持久化失败使用冻结的临时不可用状态。 */
const serviceUnavailableStatus = Number('503')
/** 健康探针响应固定使用 UTF-8 JSON。 */
const jsonContentType = 'application/json; charset=utf-8'
/** 请求不合法时的安全中文提示，不回显输入值或 AJV 细节。 */
const validationFailureMessage = '登录请求不合法'
/** 外部身份或已绑定主体不可用时的统一提示。 */
const principalFailureMessage = '平台登录凭证无效'
/** 临时故障统一提示，不回显配置、Provider、MySQL 或堆栈内容。 */
const unavailableMessage = '登录服务暂时不可用，请稍后重试'

/** 登录 HTTP 入口的受控依赖；生产与测试通过显式 Provider/策略适配器区分。 */
export type IdentityServerDependencies = {
  /** 每请求独占 MySQL 连接来源；登录事务只允许 Identity Repository 使用。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 按请求平台调用受控 Provider；一次性 code 验真成功后返回主体 HMAC 候选，未配置的平台必须失败关闭。 */
  readonly verifyPlatformCode: (
    platform: CreateIdentitySessionRequestDto['platform'],
    code: string
  ) => Promise<Readonly<VerifiedPlatformIdentityEvidence>>
  /** 返回本次请求锁定的有效会话策略；没有 active 发布时返回 null 并拒签。 */
  readonly resolveSessionPolicy: () => Promise<Readonly<IdentitySessionPolicySnapshot> | null>
  /** 从受控密钥引用解析内部调用方；未接线时内部路由失败关闭。 */
  readonly resolveServiceSigningKey?: (keyId: string) => Promise<ServiceSigningKey | null>
  /** 服务端可信 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 只接收脱敏结果类别的审计写入端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 事务回滚清理失败的脱敏观测端口。 */
  readonly recordRollbackFailure: MysqlRollbackFailureRecorder<Mysql2QueryConnection>
  /** 游客签发入口的策略、抖音匿名换取与来源摘要子密钥；未接线时该路由失败关闭（503）。 */
  readonly guestIssuance?: Pick<GuestSessionRouteDependencies, 'resolveGuestPolicy' | 'exchangeDouyinAnonymousCode' | 'issuanceSourceKey'>
}

/** 尝试写入白名单审计事件；审计端故障不能把敏感异常带入公开结果。 */
async function safelyWriteAudit(
  writeAudit: IdentityServerDependencies['writeAudit'],
  event: RequestChainAuditEvent
): Promise<void> {
  try {
    await writeAudit(event)
  } catch {
    // 审计适配器只接受脱敏事件；其故障不得泄漏凭证或覆盖稳定 HTTP 错误。
  }
}

/** 把内部异常映射到路由登记允许公开的三个错误类型。 */
function classifyLoginFailure(error: unknown): {
  readonly status: number
  readonly type: PublicErrorType
  readonly message: string
  readonly outcome: RequestChainAuditEvent['outcome']
} {
  if (error instanceof IdentityLoginInputError) {
    return {
      status: validationFailedStatus,
      type: 'VALIDATION_FAILED',
      message: validationFailureMessage,
      outcome: 'denied'
    }
  }
  if (error instanceof PlatformCredentialEvidenceError && error.type === 'PRINCIPAL_INVALID') {
    return {
      status: principalInvalidStatus,
      type: 'PRINCIPAL_INVALID',
      message: principalFailureMessage,
      outcome: 'denied'
    }
  }
  if (
    error instanceof IdentitySessionIssuancePersistenceError &&
    error.type === 'PRINCIPAL_INVALID'
  ) {
    return {
      status: principalInvalidStatus,
      type: 'PRINCIPAL_INVALID',
      message: principalFailureMessage,
      outcome: 'denied'
    }
  }
  return {
    status: serviceUnavailableStatus,
    type: 'SERVICE_UNAVAILABLE',
    message: unavailableMessage,
    outcome: 'failed'
  }
}

/** 处理一次性平台 code 登录（微信/抖音/小红书）；整个流程不会记录或公开 code、主体摘要、Bearer 以外的秘密。 */
function createIdentitySessionHandler(
  dependencies: IdentityServerDependencies,
  issueSession: ReturnType<typeof createIssueUserSessionUseCase>,
  validateRequest: ReturnType<
    typeof createPublicContractValidators
  >['createIdentitySessionRequest'],
  validateResponse: ReturnType<
    typeof createPublicContractValidators
  >['createIdentitySessionResponse']
): RouteHandler {
  return async (request, response) => {
    try {
      verifyJsonContentType(request)
      const rawInput = await readJsonBody(request)
      if (!validateRequest(rawInput)) {
        throw new IdentityLoginInputError()
      }
      const dto: CreateIdentitySessionRequestDto = rawInput

      // 策略在外部凭证调用前锁定；缺少已发布策略时不消耗一次性平台 code。
      const policySnapshot = await dependencies.resolveSessionPolicy()
      if (policySnapshot === null) {
        throw new UserSessionIssuanceMaterialError(
          'IDENTITY_SESSION_POLICY_UNAVAILABLE',
          '当前没有有效身份会话策略'
        )
      }

      const identity = await dependencies.verifyPlatformCode(dto.platform, dto.code)
      const result = await issueSession({
        identity,
        policySnapshot,
        issuedAtMs: dependencies.now()
      })
      const publicData: CreateIdentitySessionResponseDto = {
        accessToken: result.accessToken,
        expiresAt: result.expiresAt
      }
      if (!validateResponse(publicData)) {
        throw new Error('身份登录成功数据不符合公开合同')
      }
      await safelyWriteAudit(dependencies.writeAudit, { outcome: 'allowed' })
      writeJson(response, okStatus, { data: publicData })
    } catch (error: unknown) {
      const failure = classifyLoginFailure(error)
      await safelyWriteAudit(dependencies.writeAudit, {
        outcome: failure.outcome,
        errorType: failure.type
      })
      writeJson(response, failure.status, {
        error: { type: failure.type, message: failure.message }
      })
    }
  }
}

/** 创建 Identity 域 HTTP 服务：健康探针与冻结的首次会话签发路由，不主动监听端口。 */
export function createIdentityServer(dependencies: IdentityServerDependencies): Server {
  const validators = createPublicContractValidators()
  const driver = createMysqlTransactionDriver(
    dependencies.connectionSource,
    dependencies.recordRollbackFailure
  )
  const repository = createMysqlIdentitySessionIssuanceRepository()
  const issueSession = createIssueUserSessionUseCase({ driver, repository })
  const dispatch = createRouteDispatcher([
    {
      route: createIdentitySessionRoute,
      handler: createIdentitySessionHandler(
        dependencies,
        issueSession,
        validators.createIdentitySessionRequest,
        validators.createIdentitySessionResponse
      )
    },
    {
      route: createGuestSessionRoute,
      handler: createGuestSessionRouteHandler({
        resolveGuestPolicy: async () => null,
        exchangeDouyinAnonymousCode: null,
        issuanceSourceKey: null,
        ...dependencies.guestIssuance,
        repository: createMysqlGuestSessionRepository(dependencies.connectionSource),
        now: dependencies.now,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: getUserTrialAnchorInternalRoute,
      handler: createUserTrialAnchorRouteHandler(dependencies)
    }
  ])

  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/health' && request.method === 'GET') {
      request.resume()
      const body = JSON.stringify({ ok: true })
      response.writeHead(okStatus, {
        'content-type': jsonContentType,
        'content-length': Buffer.byteLength(body, 'utf8'),
        'cache-control': 'no-store'
      })
      response.end(body)
      return
    }
    dispatch(request, response).catch(() => undefined)
  })
}
