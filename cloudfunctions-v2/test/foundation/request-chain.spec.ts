import { describe, expect, test, vi } from 'vitest'

import {
  PublicRequestError,
  executeRequestChain,
  type RequestChainConfig,
  type RequestChainStep,
  type RequestChainAuditEvent
} from '../../src/foundation/http/request-chain.js'

type TestPrincipal = {
  /** 测试使用的统一用户公开引用；不代表数据库内部主键。 */
  user_id: string
}

type TestRawRequest = {
  /** 模拟已由 HTTP 适配器接收、尚未经过限制的正文。 */
  body: { action: string }
}

type TestIdentityCredentials = {
  /** 原始令牌的不可逆摘要；这里只用于证明阶段间传值。 */
  tokenDigest: string
}

type TestCommand = {
  /** 经 DTO 校验后进入应用层的操作名称。 */
  action: string
}

type TestDomainDecision = {
  /** 领域规则批准后得到的动作名称。 */
  approvedAction: string
}

type TestPersistenceResult = {
  /** Repository 读回后可用于构造公开 DTO 的高熵引用。 */
  publicRef: string
}

type TestPublicData = {
  /** 对外返回的用户植物高熵引用。 */
  userPlantRef: string
}

type TestRequestChainConfig = RequestChainConfig<
  TestRawRequest,
  { action: string },
  TestIdentityCredentials,
  TestPrincipal,
  { action: string },
  TestCommand,
  TestDomainDecision,
  TestPersistenceResult,
  TestPublicData
>

const successStatusCode = 200
const parameterErrorStatusCode = 400
const identityErrorStatusCode = 401
const notFoundStatusCode = 404

/** 创建一个记录执行顺序的真实请求链步骤包装器。 */
function executeStep<TInput, TOutput>(
  name: string,
  executedStep: string[],
  run: (input: TInput) => TOutput | Promise<TOutput>
): RequestChainStep<TInput, TOutput> {
  return {
    kind: 'execute',
    run: async input => {
      executedStep.push(name)
      return await run(input)
    }
  }
}

/** 创建默认成功链；各假边界只暴露顺序和短路行为，不模拟数据库实现细节。 */
function createDefaultRequestChain(
  executedStep: string[],
  auditEvent: RequestChainAuditEvent[] = []
): TestRequestChainConfig {
  return {
    rawRequest: { body: { action: 'create' } },
    requestLimits: executeStep<TestRawRequest, { action: string }>(
      '请求限制',
      executedStep,
      input => input.body
    ),
    identityValidate: executeStep<{ action: string }, TestIdentityCredentials>(
      '身份校验',
      executedStep,
      () => ({
        tokenDigest: 'digest'
      })
    ),
    principalResolve: executeStep<TestIdentityCredentials, TestPrincipal>(
      '主体解析',
      executedStep,
      () => ({
        user_id: 'usr_test'
      })
    ),
    objectOwnership: executeStep<{ request: { action: string }; principal: TestPrincipal }, void>(
      '对象归属',
      executedStep,
      () => undefined
    ),
    dtoValidate: executeStep<{ action: string }, { action: string }>(
      'DTO校验',
      executedStep,
      body => body
    ),
    buildCommand: executeStep<{ dto: { action: string }; principal: TestPrincipal }, TestCommand>(
      '构造命令',
      executedStep,
      ({ dto }) => ({ action: dto.action })
    ),
    domainRule: executeStep<{ command: TestCommand; principal: TestPrincipal }, TestDomainDecision>(
      '领域规则',
      executedStep,
      ({ command }) => ({ approvedAction: command.action })
    ),
    transactionPersistence: executeStep<
      { domainDecision: TestDomainDecision; principal: TestPrincipal },
      TestPersistenceResult
    >('事务持久化', executedStep, ({ domainDecision }) => ({
      publicRef: `upl_${domainDecision.approvedAction}`
    })),
    publicResponse: executeStep<TestPersistenceResult, TestPublicData>(
      '公开响应',
      executedStep,
      persistenceResult => ({
        userPlantRef: persistenceResult.publicRef
      })
    ),
    writeAudit: async (event: RequestChainAuditEvent) => {
      executedStep.push('写入审计')
      auditEvent.push(event)
    }
  }
}

/**
 * Expected 来源：`docs/backend-v2/contracts/http-api.md` 的固定处理顺序与公开错误合同。
 * 测试层次：L3 / `unit_fake`。真实执行请求链模块；身份、归属、DTO、领域和事务边界使用可观测假实现。
 * 明确未覆盖：真实 HTTP 字节读取、真实 MySQL 提交/回滚、CloudBase 身份验证和远端审计持久化。
 */
describe('后端 v2 公共 HTTP 请求链', () => {
  test('成功请求严格按固定顺序执行并只返回白名单 data', async () => {
    const executedStep: string[] = []
    const auditEvent: RequestChainAuditEvent[] = []

    const config: TestRequestChainConfig = {
      rawRequest: { body: { action: 'create' } },
      requestLimits: executeStep<TestRawRequest, { action: string }>(
        '请求限制',
        executedStep,
        input => input.body
      ),
      identityValidate: executeStep<{ action: string }, TestIdentityCredentials>(
        '身份校验',
        executedStep,
        () => ({
          tokenDigest: 'digest'
        })
      ),
      principalResolve: executeStep<TestIdentityCredentials, TestPrincipal>(
        '主体解析',
        executedStep,
        () => ({
          user_id: 'usr_test'
        })
      ),
      objectOwnership: executeStep<{ request: { action: string }; principal: TestPrincipal }, void>(
        '对象归属',
        executedStep,
        () => undefined
      ),
      dtoValidate: executeStep<{ action: string }, { action: string }>(
        'DTO校验',
        executedStep,
        body => body
      ),
      buildCommand: executeStep<{ dto: { action: string }; principal: TestPrincipal }, TestCommand>(
        '构造命令',
        executedStep,
        ({ dto }) => ({ action: dto.action })
      ),
      domainRule: executeStep<
        { command: TestCommand; principal: TestPrincipal },
        TestDomainDecision
      >('领域规则', executedStep, ({ command }) => ({ approvedAction: command.action })),
      transactionPersistence: executeStep<
        { domainDecision: TestDomainDecision; principal: TestPrincipal },
        TestPersistenceResult
      >('事务持久化', executedStep, ({ domainDecision }) => ({
        publicRef: `upl_${domainDecision.approvedAction}`
      })),
      publicResponse: executeStep<TestPersistenceResult, TestPublicData>(
        '公开响应',
        executedStep,
        persistenceResult => ({
          userPlantRef: persistenceResult.publicRef
        })
      ),
      writeAudit: async event => {
        executedStep.push('写入审计')
        auditEvent.push(event)
      }
    }
    const result = await executeRequestChain(config)

    expect(result).toEqual({
      status: 200,
      body: { data: { userPlantRef: 'upl_create' } }
    })
    expect(executedStep).toEqual([
      '请求限制',
      '身份校验',
      '主体解析',
      '对象归属',
      'DTO校验',
      '构造命令',
      '领域规则',
      '事务持久化',
      '公开响应',
      '写入审计'
    ])
    expect(auditEvent).toEqual([{ outcome: 'allowed' }])
  })

  test('已提交的成功结果不因链尾请求结果事件写入失败而改成业务失败', async () => {
    const executedStep: string[] = []
    const attemptedEvents: RequestChainAuditEvent[] = []
    const reportedFailures: RequestChainAuditEvent[] = []
    const config = Object.assign(createDefaultRequestChain(executedStep), {
      writeAudit: async (event: RequestChainAuditEvent) => {
        attemptedEvents.push(event)
        throw new Error('private audit sink connection details')
      },
      reportAuditFailure: async (event: RequestChainAuditEvent) => {
        reportedFailures.push(event)
      }
    })

    const result = await executeRequestChain(config)

    expect(result).toEqual({ status: 200, body: { data: { userPlantRef: 'upl_create' } } })
    expect(attemptedEvents).toEqual([{ outcome: 'allowed' }])
    expect(reportedFailures).toEqual([{ outcome: 'allowed' }])
    expect(JSON.stringify(result)).not.toContain('private audit sink')
  })

  test('已确定的身份拒绝不因链尾请求结果事件写入失败而改成内部错误', async () => {
    const executedStep: string[] = []
    const attemptedEvents: RequestChainAuditEvent[] = []
    const reportedFailures: RequestChainAuditEvent[] = []
    const config = Object.assign(createDefaultRequestChain(executedStep), {
      identityValidate: executeStep('身份校验', executedStep, () => {
        throw new PublicRequestError(identityErrorStatusCode, 'PRINCIPAL_INVALID', '身份凭证无效')
      }),
      writeAudit: async (event: RequestChainAuditEvent) => {
        attemptedEvents.push(event)
        throw new Error('private audit sink connection details')
      },
      reportAuditFailure: async (event: RequestChainAuditEvent) => {
        reportedFailures.push(event)
      }
    })

    const result = await executeRequestChain(config)

    expect(result).toEqual({
      status: 401,
      body: { error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效' } }
    })
    expect(attemptedEvents).toEqual([{ outcome: 'denied', errorType: 'PRINCIPAL_INVALID' }])
    expect(reportedFailures).toEqual([{ outcome: 'denied', errorType: 'PRINCIPAL_INVALID' }])
    expect(JSON.stringify(result)).not.toContain('private audit sink')
  })

  test('告警端口和运行时警告均失效时仍不改写已确定的业务结果', async () => {
    const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {
      throw new Error('private warning sink details')
    })
    try {
      const config = Object.assign(createDefaultRequestChain([]), {
        writeAudit: async () => {
          throw new Error('private audit sink details')
        },
        reportAuditFailure: async () => {
          throw new Error('private reporter details')
        }
      })
      const result = await executeRequestChain(config)
      expect(result).toEqual({ status: 200, body: { data: { userPlantRef: 'upl_create' } } })
      expect(warningSpy).toHaveBeenCalled()
      expect(JSON.stringify(result)).not.toContain('private')
    } finally {
      warningSpy.mockRestore()
    }
  })

  test('身份失败后立即停止且不进入主体、归属、DTO或业务步骤', async () => {
    const executedStep: string[] = []

    const result = await executeRequestChain({
      ...createDefaultRequestChain(executedStep),
      identityValidate: executeStep('身份校验', executedStep, () => {
        throw new PublicRequestError(identityErrorStatusCode, 'PRINCIPAL_INVALID', '身份凭证无效')
      })
    })

    expect(result).toEqual({
      status: 401,
      body: { error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效' } }
    })
    expect(executedStep).toEqual(['请求限制', '身份校验', '写入审计'])
  })

  test('对象不属于当前用户时统一返回 USER_PLANT_NOT_FOUND', async () => {
    const executedStep: string[] = []

    const result = await executeRequestChain({
      ...createDefaultRequestChain(executedStep),
      objectOwnership: executeStep<{ request: { action: string }; principal: TestPrincipal }, void>(
        '对象归属',
        executedStep,
        () => {
          throw new PublicRequestError(notFoundStatusCode, 'USER_PLANT_NOT_FOUND', '用户植物不存在')
        }
      )
    })

    expect(result).toEqual({
      status: 404,
      body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } }
    })
    expect(executedStep).toEqual(['请求限制', '身份校验', '主体解析', '对象归属', '写入审计'])
  })

  test('DTO 校验失败后不构造命令或执行领域与事务', async () => {
    const executedStep: string[] = []

    const result = await executeRequestChain({
      ...createDefaultRequestChain(executedStep),
      dtoValidate: executeStep('DTO校验', executedStep, () => {
        throw new PublicRequestError(
          parameterErrorStatusCode,
          'VALIDATION_FAILED',
          '请求参数不合法'
        )
      })
    })

    expect(result).toEqual({
      status: 400,
      body: { error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' } }
    })
    expect(executedStep).toEqual([
      '请求限制',
      '身份校验',
      '主体解析',
      '对象归属',
      'DTO校验',
      '写入审计'
    ])
  })

  test('未分类内部异常只返回泛化错误且审计内容不携带原始异常', async () => {
    const executedStep: string[] = []
    const auditEvent: RequestChainAuditEvent[] = []

    const result = await executeRequestChain({
      ...createDefaultRequestChain(executedStep, auditEvent),
      transactionPersistence: executeStep<
        { domainDecision: TestDomainDecision; principal: TestPrincipal },
        TestPersistenceResult
      >('事务持久化', executedStep, () => {
        throw new Error('mysql password=super-secret')
      })
    })

    expect(result).toEqual({
      status: 500,
      body: { error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } }
    })
    expect(JSON.stringify(result)).not.toContain('super-secret')
    expect(auditEvent).toEqual([{ outcome: 'failed', errorType: 'INTERNAL_ERROR' }])
    expect(JSON.stringify(auditEvent)).not.toContain('super-secret')
  })

  test('不需要对象归属校验的路由必须显式声明中文原因', async () => {
    const executedStep: string[] = []

    const result = await executeRequestChain({
      ...createDefaultRequestChain(executedStep),
      objectOwnership: {
        kind: 'not_applicable',
        reason: '该公开查询不读取任何用户植物对象'
      }
    })

    expect(result.status).toBe(successStatusCode)
    expect(executedStep).toEqual([
      '请求限制',
      '身份校验',
      '主体解析',
      'DTO校验',
      '构造命令',
      '领域规则',
      '事务持久化',
      '公开响应',
      '写入审计'
    ])
  })

  test('非适用步骤缺少可审计原因时失败关闭', async () => {
    const executedStep: string[] = []
    const invalidStep = { kind: 'not_applicable', reason: '' } as RequestChainStep<unknown, void>

    const result = await executeRequestChain({
      ...createDefaultRequestChain(executedStep),
      objectOwnership: invalidStep
    })

    expect(result).toEqual({
      status: 500,
      body: { error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } }
    })
    expect(executedStep).toEqual(['请求限制', '身份校验', '主体解析', '写入审计'])
  })
})
