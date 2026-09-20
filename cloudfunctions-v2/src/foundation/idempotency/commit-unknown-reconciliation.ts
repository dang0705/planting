import type { HttpIdempotencyPublicResponseSnapshot, HttpIdempotencyStoredRecord } from './http-idempotency.js'
import type { HttpIdempotencyScope } from './mysql-http-idempotency-repository.js'

/**
 * 数据库提交结果未知后使用的新连接只读 Repository。
 *
 * 该端口禁止接收旧事务上下文，也不提供任何写方法，从类型层阻断自动重跑领域命令。
 */
export type HttpIdempotencyCommitUnknownReadOnlyRepository = {
  /** 使用新连接按完整幂等唯一作用域读取当前已提交记录；不得加行锁或开启业务事务。 */
  readonly read: (scope: HttpIdempotencyScope) => Promise<HttpIdempotencyStoredRecord | null>
}

/** 提交结果未知后执行一次只读对账所需的最小输入。 */
export type HttpIdempotencyCommitUnknownReconcileInput = {
  /** 不含原始用户标识或幂等键的完整唯一作用域。 */
  readonly scope: HttpIdempotencyScope
  /** 当前规范化请求内容的 SHA-256，用于防止重放其他请求的结果。 */
  readonly requestHash: string
}

/** 未能从已提交数据证明首次事务结果时的内部原因。 */
export type HttpIdempotencyCommitUnknownReason =
  | 'missing'
  | 'processing'
  | 'request_hash_mismatch'
  | 'read_failed'

/**
 * 提交结果未知后的封闭式对账结果。
 *
 * 只有 `replay` 可以返回首次公开响应；`unresolved` 一律由应用层映射为临时 503，
 * 不得推导为“未提交”，也不得再次执行领域命令。
 */
export type HttpIdempotencyCommitUnknownReconcileResult =
  | {
      /** 已由新连接证明首次事务提交了相同请求的完整结果。 */
      readonly kind: 'replay'
      /** 必须原样返回且不得重新计算的首次公开响应。 */
      readonly response: HttpIdempotencyPublicResponseSnapshot
    }
  | {
      /** 当前已提交数据不足以证明结果，调用方必须失败关闭。 */
      readonly kind: 'unresolved'
      /** 只供内部观测和测试使用的分类，不得进入公开响应。 */
      readonly reason: HttpIdempotencyCommitUnknownReason
    }

/**
 * 使用新连接只读判断未知提交是否已经产生可重放结果。
 *
 * Repository 异常被折叠为内部 `read_failed`，避免泄露主机、SQL 或驱动细节；本函数从不写库、
 * 从不等待处理中记录，也从不调用领域命令。
 */
export async function reconcileHttpIdempotencyCommitResult(
  repository: HttpIdempotencyCommitUnknownReadOnlyRepository,
  input: HttpIdempotencyCommitUnknownReconcileInput
): Promise<HttpIdempotencyCommitUnknownReconcileResult> {
  let record: HttpIdempotencyStoredRecord | null
  try {
    record = await repository.read(input.scope)
  } catch {
    return { kind: 'unresolved', reason: 'read_failed' }
  }

  if (record === null) {
    return { kind: 'unresolved', reason: 'missing' }
  }
  if (record.requestHash !== input.requestHash) {
    return { kind: 'unresolved', reason: 'request_hash_mismatch' }
  }
  if (record.state !== 'completed') {
    return { kind: 'unresolved', reason: 'processing' }
  }
  return { kind: 'replay', response: record.response }
}
