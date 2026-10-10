/**
 * HTTP 公共错误类型目录。
 *
 * 这里只收纳已经由 `http-api/v1` 冻结、可以安全返回给调用方的稳定类型。
 * 数据库错误、供应商错误、内部状态和追踪标识不得进入此目录。
 */

//Todo 和 cloudfunctions-v2/src/contracts/types.ts 的同名类型冲突.
export type PublicErrorType =
  | 'VALIDATION_FAILED'
  | 'PRINCIPAL_INVALID'
  | 'CAPABILITY_DENIED'
  | 'IDENTITY_BINDING_CONFLICT'
  | 'IDENTITY_LAST_BINDING_REQUIRED'
  | 'NOT_FOUND'
  | 'USER_PLANT_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'GUEST_SESSION_EXPIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'USER_PLANT_VERSION_CONFLICT'
  | 'CAPABILITY_SNAPSHOT_EXPIRED'
  | 'GUEST_SESSION_NOT_CLAIMABLE'
  | 'EPHEMERAL_CASE_NOT_BINDABLE'
  | 'AI_QUOTA_INSUFFICIENT'
  /** 游客会话临时植物案例数量已达已发布上限（temporary-case/v1）。 */
  | 'TEMPORARY_CASE_LIMIT_REACHED'
  /** 用户植物已归档，只读（long-term-care/v1）。 */
  | 'USER_PLANT_ARCHIVED'
  /** 养护建议不可再确认（long-term-care/v1）。 */
  | 'CARE_PROPOSAL_NOT_CONFIRMABLE'
  /** 养护计划版本冲突（long-term-care/v1）。 */
  | 'CARE_PLAN_VERSION_CONFLICT'
  /** 养护计划已过期（long-term-care/v1 §12）。 */
  | 'CARE_PLAN_EXPIRED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  /** 游客令牌签发超过来源限流（guest-token/v1）。 */
  | 'RATE_LIMITED'

/** 允许公开返回的唯一错误形状。 */
//Todo 和 cloudfunctions-v2/src/contracts/types.ts 的ErrorResponseDto冲突.
export type PublicErrorResponse = {
  /** 错误响应根对象；禁止追加内部编号、追踪标识或调试字段。 */
  error: {
    /** 已冻结的稳定错误类型，供调用方进行有限分支处理。 */
    type: PublicErrorType
    /** 面向用户的安全中文消息，不得拼接原始异常文本。 */
    message: string
  }
}

/** 业务接口成功时的统一公开响应形状。 */
export type PublicSuccessResponse<TData> = {
  /** 经白名单转换后的公开 DTO；不得直接放入数据库行或领域实体。 */
  data: TData
}

/** 请求链完成后交给 HTTP 适配器的状态码和公开正文。 */
export type RequestChainResult<TPublicData> = {
  /** HTTP 状态码；成功链当前固定为 200，失败码来自稳定公开错误。 */
  status: number
  /** 公开成功或错误正文，两者严格互斥。 */
  body: PublicSuccessResponse<TPublicData> | PublicErrorResponse
}

/**
 * 可被请求链识别的安全异常。
 *
 * 只有路由边界主动创建的此类异常可以原样映射；其他异常全部降级为
 * `INTERNAL_ERROR`，避免 SQL、凭证、模型原文或堆栈意外外露。
 */
export class PublicRequestError extends Error {
  /** 应返回的 HTTP 状态码。 */
  readonly status: number

  /** 已冻结的公开错误类型。 */
  readonly type: PublicErrorType

  constructor(status: number, type: PublicErrorType, message: string) {
    super(message)
    this.name = '公开请求错误'
    this.status = status
    this.type = type
  }
}

/** 一个请求阶段要么执行，要么以可审计原因明确声明不适用。 */
export type RequestChainStep<TInput, TOutput> =
  | {
      /** 当前路由需要执行此阶段。 */
      kind: 'execute'
      /** 阶段实现；抛出 `公开请求错误` 表示可安全公开的失败。 */
      run: (input: TInput) => TOutput | Promise<TOutput>
    }
  | {
      /** 当前路由基于合同明确不需要此阶段，不能用它掩盖尚未实现。 */
      kind: 'not_applicable'
      /** 说明不适用原因的中文审计文本；空字符串会失败关闭。 */
      reason: string
    }

/** 请求结束时写入审计端口的最小白名单事件。 */
export type RequestChainAuditEvent = {
  /** 请求结果类别：允许、拒绝或内部失败。 */
  outcome: 'allowed' | 'denied' | 'failed'
  /** 失败时唯一允许记录的稳定公开错误类型，不包含原始异常。 */
  errorType?: PublicErrorType
}

/** 用户植物对象归属校验阶段的输入上下文。 */
export type ObjectOwnershipValidateContext<TRestrictedInput, TPrincipal> = {
  /** 已通过请求大小和媒体类型限制、可供提取对象引用的请求输入。 */
  request: TRestrictedInput
  /** 已验证并解析完成的统一访问主体。 */
  principal: TPrincipal
}

/** 应用层 Command 或 Query 构造阶段的输入上下文。 */
export type CommandBuildContext<TDto, TPrincipal> = {
  /** 已通过对应 AJV Schema 严格校验的路由 DTO。 */
  dto: TDto
  /** 当前请求的统一访问主体，用于构造受主体约束的应用命令。 */
  principal: TPrincipal
}

/** 领域规则阶段的输入上下文。 */
export type DomainRuleContext<TCommand, TPrincipal> = {
  /** 应用层已经构造完成、尚未持久化的 Command 或 Query。 */
  command: TCommand
  /** 当前请求的统一访问主体，用于执行权限相关的领域前置条件。 */
  principal: TPrincipal
}

/** Repository 与事务持久化阶段的输入上下文。 */
export type TransactionPersistenceContext<TDomainDecision, TPrincipal> = {
  /** 领域规则计算出的确定性决策，不包含数据库行或连接对象。 */
  domainDecision: TDomainDecision
  /** 当前请求的统一访问主体，用于绑定写入归属和审计主体。 */
  principal: TPrincipal
}

/**
 * 固定请求链的依赖集合。
 *
 * 每个属性对应架构中一个不可交换的阶段。业务云函数只能注入实现，不能改变顺序。
 */
export type RequestChainConfig<
  TRawRequest,
  TRestrictedInput,
  TIdentityCredentials,
  TPrincipal,
  TDto,
  TCommand,
  TDomainDecision,
  TPersistenceResult,
  TPublicData
> = {
  /** HTTP 适配器提供的原始请求；其中的敏感内容不得进入审计或公开响应。 */
  rawRequest: TRawRequest
  /** 第一步：执行请求大小和媒体类型限制，并输出允许继续处理的输入。 */
  requestLimits: RequestChainStep<TRawRequest, TRestrictedInput>
  /** 第二步：机械验证用户令牌、游客证明或内部服务签名。 */
  identityValidate: RequestChainStep<TRestrictedInput, TIdentityCredentials>
  /** 第三步：把已验证凭据解析为统一 Guest/User/Service Principal。 */
  principalResolve: RequestChainStep<TIdentityCredentials, TPrincipal>
  /** 第四步：校验统一用户与目标用户植物的归属；无对象路由必须显式声明不适用。 */
  objectOwnership: RequestChainStep<
    ObjectOwnershipValidateContext<TRestrictedInput, TPrincipal>,
    void
  >
  /** 第五步：用对应路由的 AJV Schema 校验并收窄 DTO。 */
  dtoValidate: RequestChainStep<TRestrictedInput, TDto>
  /** 第六步：由已校验 DTO 与主体构造应用层 Command 或 Query。 */
  buildCommand: RequestChainStep<CommandBuildContext<TDto, TPrincipal>, TCommand>
  /** 第七步：执行不访问网络和数据库的领域规则。 */
  domainRule: RequestChainStep<DomainRuleContext<TCommand, TPrincipal>, TDomainDecision>
  /** 第八步：通过 Repository 在明确事务边界内持久化并读回结果。 */
  transactionPersistence: RequestChainStep<
    TransactionPersistenceContext<TDomainDecision, TPrincipal>,
    TPersistenceResult
  >
  /** 第九步：把内部结果转换为不含内部主键和敏感字段的公开 DTO。 */
  publicResponse: RequestChainStep<TPersistenceResult, TPublicData>
  /** 最后尝试写入脱敏请求结果事件；可靠的业务安全审计必须在领域事务内完成。 */
  writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 请求结果事件写入失败时的脱敏告警端口；不得接收原始异常或改变业务结果。 */
  reportAuditFailure?: (event: RequestChainAuditEvent) => void | Promise<void>
}

const internalErrorStatusCode = 500

/** 执行单个阶段；非适用阶段缺少可审计原因时按内部配置错误失败关闭。 */
async function runStep<TInput, TOutput>(
  step: RequestChainStep<TInput, TOutput>,
  input: TInput
): Promise<TOutput> {
  if (step.kind === 'execute') {
    return await step.run(input)
  }

  if (!step.reason.trim()) {
    throw new Error('请求链非适用步骤缺少原因')
  }

  return undefined as TOutput
}

/** 把未知异常压缩为不含原始异常内容的稳定公开错误。 */
function mapPublicError(error: unknown): PublicRequestError {
  if (error instanceof PublicRequestError) {
    return error
  }
  return new PublicRequestError(internalErrorStatusCode, 'INTERNAL_ERROR', '服务暂时不可用')
}

/**
 * 按 `http-api/v1` 固定顺序执行一个业务请求。
 *
 * 该函数只负责编排和失败关闭，不实现任何身份、领域或 SQL 规则。
 */
export async function executeRequestChain<
  TRawRequest,
  TRestrictedInput,
  TIdentityCredentials,
  TPrincipal,
  TDto,
  TCommand,
  TDomainDecision,
  TPersistenceResult,
  TPublicData
>(
  config: RequestChainConfig<
    TRawRequest,
    TRestrictedInput,
    TIdentityCredentials,
    TPrincipal,
    TDto,
    TCommand,
    TDomainDecision,
    TPersistenceResult,
    TPublicData
  >
): Promise<RequestChainResult<TPublicData>> {
  /** 最后的运行时告警也可能失效；此时仍须保留已确定的业务结果。 */
  const emitSafeWarning = (message: string, code: string): void => {
    try {
      process.emitWarning(message, { code })
    } catch {
      return
    }
  }

  /**
   * 在后台尽力记录已确定的请求结果；调用方不得等待此 Promise。
   * 端口永不完成时事件可能一直未确认，但不能拖住公开业务响应。
   */
  const dispatchRequestOutcome = (event: RequestChainAuditEvent): Promise<void> => {
    const reportAuditFailure = (): Promise<void> => {
      try {
        const report = config.reportAuditFailure
        if (!report) {
          emitSafeWarning('请求结果事件写入失败', 'REQUEST_AUDIT_WRITE_FAILED')
          return Promise.resolve()
        }

        return Promise.resolve(report(event))
          .catch(() => {
            emitSafeWarning('请求结果事件与脱敏告警均写入失败', 'REQUEST_AUDIT_REPORT_FAILED')
          })
          .catch(() => undefined)
      } catch {
        emitSafeWarning('请求结果事件与脱敏告警均写入失败', 'REQUEST_AUDIT_REPORT_FAILED')
        return Promise.resolve()
      }
    }

    try {
      return Promise.resolve(config.writeAudit(event))
        .catch(() => reportAuditFailure())
        .catch(() => undefined)
    } catch {
      return reportAuditFailure().catch(() => undefined)
    }
  }

  try {
    const restrictedInput = await runStep(config.requestLimits, config.rawRequest)
    const identityCredentials = await runStep(config.identityValidate, restrictedInput)
    const principal = await runStep(config.principalResolve, identityCredentials)
    await runStep(config.objectOwnership, { request: restrictedInput, principal: principal })
    const dto = await runStep(config.dtoValidate, restrictedInput)
    const command = await runStep(config.buildCommand, { dto, principal: principal })
    const domainDecision = await runStep(config.domainRule, {
      command: command,
      principal: principal
    })
    const persistenceResult = await runStep(config.transactionPersistence, {
      domainDecision: domainDecision,
      principal: principal
    })
    const publicData = await runStep(config.publicResponse, persistenceResult)

    dispatchRequestOutcome({ outcome: 'allowed' }).catch(() => undefined)
    return { status: 200, body: { data: publicData } }
  } catch (error: unknown) {
    const publicError = mapPublicError(error)
    dispatchRequestOutcome({
      outcome: publicError.status >= internalErrorStatusCode ? 'failed' : 'denied',
      errorType: publicError.type
    }).catch(() => undefined)
    return {
      status: publicError.status,
      body: { error: { type: publicError.type, message: publicError.message } }
    }
  }
}
