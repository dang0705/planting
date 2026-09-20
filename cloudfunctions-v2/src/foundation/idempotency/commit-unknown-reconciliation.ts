import type { HTTP幂等公开响应快照, HTTP幂等已存记录 } from './http-idempotency.js'
import type { HTTP幂等作用域 } from './mysql-http-idempotency-repository.js'

/**
 * 数据库提交结果未知后使用的新连接只读 Repository。
 *
 * 该端口禁止接收旧事务上下文，也不提供任何写方法，从类型层阻断自动重跑领域命令。
 */
export type HTTP幂等提交未知只读Repository = {
  /** 使用新连接按完整幂等唯一作用域读取当前已提交记录；不得加行锁或开启业务事务。 */
  readonly 读取: (作用域: HTTP幂等作用域) => Promise<HTTP幂等已存记录 | null>
}

/** 提交结果未知后执行一次只读对账所需的最小输入。 */
export type HTTP幂等提交未知对账输入 = {
  /** 不含原始用户标识或幂等键的完整唯一作用域。 */
  readonly scope: HTTP幂等作用域
  /** 当前规范化请求内容的 SHA-256，用于防止重放其他请求的结果。 */
  readonly requestHash: string
}

/** 未能从已提交数据证明首次事务结果时的内部原因。 */
export type HTTP幂等提交未知原因 =
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
export type HTTP幂等提交未知对账结果 =
  | {
      /** 已由新连接证明首次事务提交了相同请求的完整结果。 */
      readonly kind: 'replay'
      /** 必须原样返回且不得重新计算的首次公开响应。 */
      readonly response: HTTP幂等公开响应快照
    }
  | {
      /** 当前已提交数据不足以证明结果，调用方必须失败关闭。 */
      readonly kind: 'unresolved'
      /** 只供内部观测和测试使用的分类，不得进入公开响应。 */
      readonly reason: HTTP幂等提交未知原因
    }

/**
 * 使用新连接只读判断未知提交是否已经产生可重放结果。
 *
 * Repository 异常被折叠为内部 `read_failed`，避免泄露主机、SQL 或驱动细节；本函数从不写库、
 * 从不等待处理中记录，也从不调用领域命令。
 */
export async function 对账HTTP幂等提交结果(
  repository: HTTP幂等提交未知只读Repository,
  输入: HTTP幂等提交未知对账输入
): Promise<HTTP幂等提交未知对账结果> {
  let 记录: HTTP幂等已存记录 | null
  try {
    记录 = await repository.读取(输入.scope)
  } catch {
    return { kind: 'unresolved', reason: 'read_failed' }
  }

  if (记录 === null) {
    return { kind: 'unresolved', reason: 'missing' }
  }
  if (记录.requestHash !== 输入.requestHash) {
    return { kind: 'unresolved', reason: 'request_hash_mismatch' }
  }
  if (记录.state !== 'completed') {
    return { kind: 'unresolved', reason: 'processing' }
  }
  return { kind: 'replay', response: 记录.response }
}
