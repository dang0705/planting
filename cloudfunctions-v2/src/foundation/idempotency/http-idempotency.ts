/** 公开幂等冲突的固定 HTTP 状态码。 */
const idempotencyConflictHTTPStatusCode = Number('409')

/**
 * 已完成请求可被安全重放的公开 HTTP 结果。
 *
 * 这里只允许保存已经过脱敏和公开合同校验的响应；数据库内部主键、平台主体标识、
 * 追踪标识、凭证、SQL、Prompt 或模型原文不得进入该快照。
 */
export type HttpIdempotencyPublicResponseSnapshot = {
  /** 首次请求已确定的 HTTP 状态码，重放时不得重新计算。 */
  readonly status: number
  /** 首次请求已经脱敏的公开 JSON 响应包装。 */
  readonly body: Readonly<Record<string, unknown>>
}

/**
 * Repository 从共享幂等表读出的已存记录。
 *
 * 联合类型确保只有完成态携带公开响应；处理态不能伪造可重放结果。
 */
export type HttpIdempotencyStoredRecord =
  | {
      /** 规范化请求内容的 SHA-256，用于区分同键同参与同键异参。 */
      readonly requestHash: string
      /** `processing` 表示某个并发请求已获得唯一占位，尚未产生确定结果。 */
      readonly state: 'processing'
    }
  | {
      /** 规范化请求内容的 SHA-256，用于区分同键同参与同键异参。 */
      readonly requestHash: string
      /** `completed` 表示首次请求已在业务事务内落下确定公开结果。 */
      readonly state: 'completed'
      /** 必须原样重放的首次脱敏公开响应。 */
      readonly response: HttpIdempotencyPublicResponseSnapshot
    }

/**
 * 幂等协议对当前请求的唯一决策。
 *
 * `wait_for_winner` 只禁止重复执行领域命令；等待、读回和超时由 Repository/HTTP
 * 适配器在已冻结的运行策略下实现，本模块不私设超时默认值。
 */
export type HttpIdempotencyDecision =
  | {
      /** 当前请求可以尝试写入唯一处理占位；占位冲突后必须重新读取。 */
      readonly kind: 'reserve'
    }
  | {
      /** 当前请求与首次请求完全同参，不得再执行领域命令。 */
      readonly kind: 'replay'
      /** 首次确定结果，HTTP 适配器必须原样返回。 */
      readonly response: HttpIdempotencyPublicResponseSnapshot
    }
  | {
      /** 同一幂等作用域已绑定不同请求，禁止执行任何业务写入。 */
      readonly kind: 'conflict'
      /** 公开错误类型固定为合同中的幂等冲突。 */
      readonly errorType: 'IDEMPOTENCY_CONFLICT'
      /** 公开 HTTP 状态码固定为 409。 */
      readonly httpStatus: number
    }
  | {
      /** 同参请求已有获胜者处理中，当前请求不得重复执行领域命令。 */
      readonly kind: 'wait_for_winner'
    }

/**
 * 依据已存记录与当前规范化请求摘要作出幂等决策。
 *
 * 本函数不访问数据库、不执行领域命令，也不会把处理中状态误报成成功。
 */
export function determineHttpIdempotencyRequest(
  storedRecord: HttpIdempotencyStoredRecord | null,
  currentRequestDigest: string
): HttpIdempotencyDecision {
  if (storedRecord === null) {
    return { kind: 'reserve' }
  }

  if (storedRecord.requestHash !== currentRequestDigest) {
    return {
      kind: 'conflict',
      errorType: 'IDEMPOTENCY_CONFLICT',
      httpStatus: idempotencyConflictHTTPStatusCode
    }
  }

  if (storedRecord.state === 'completed') {
    return { kind: 'replay', response: storedRecord.response }
  }

  return { kind: 'wait_for_winner' }
}
