import {
  runDatabaseTransaction,
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import {
  lockDiagnosisReviewRevocation,
  DiagnosisReviewRevocationConflictError,
  type LockedDiagnosisReviewRevocation
} from '../domain/diagnosis-review-revocation.js'
/** 撤销内部收据不代表知识撤回或CMS验真已经完成。 */
export type DiagnosisReviewRevocationResult =
  | {
      /** 该精确命令已经追加撤销事实或原样重放。 */ readonly status: 'revoked'
      /** 同命令稳定撤销引用。 */ readonly revocationRef: string
      /** 第一次记录的服务器UTC毫秒。 */ readonly revokedAtMs: number
    }
  | {
      /** 前置缺失、冲突、损坏或提交未知，不伪报成功。 */ readonly status:
        | 'unavailable'
        | 'conflict'
        | 'unknown_commit'
    }
/** 缺历史收据才允许继续申请撤销。 */
export interface MissingDiagnosisRevocationReceipt {
  /** 该精确撤销引用尚未保存。 */ readonly status: 'not_found'
}
/** 独立审核撤销专属端口，与发布共享事务及审核目标锁。 */
export interface DiagnosisReviewRevocationRepository<T extends TransactionExecutionContext> {
  /** 比对完整请求摘要及原批准，重放不修改事实。 */ readReceipt(
    tx: T,
    locked: LockedDiagnosisReviewRevocation
  ): Promise<DiagnosisReviewRevocationResult | MissingDiagnosisRevocationReceipt>
  /** 锁定精确批准并追加唯一目标事实；不修改发布或指针。 */ append(
    tx: T,
    locked: LockedDiagnosisReviewRevocation,
    at: number
  ): Promise<DiagnosisReviewRevocationResult>
  /** 提交未知时使用新连接只读对账。 */ reconcile(
    locked: LockedDiagnosisReviewRevocation
  ): Promise<DiagnosisReviewRevocationResult>
}
/** 没有正式CMS身份接线时不得开放写HTTP。 */
export interface DiagnosisReviewRevocationDependencies<T extends TransactionExecutionContext> {
  /** 既有共享事务生命周期。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 撤销事实专属持久化端口。 */ readonly repository: DiagnosisReviewRevocationRepository<T>
  /** 仅首次追加使用的受控时钟。 */ readonly now: () => number
}
/** 精确批准→独立撤销；异常回滚，未知提交只读对账。 */
export function createRevokeDiagnosisReview<T extends TransactionExecutionContext>(
  deps: DiagnosisReviewRevocationDependencies<T>
) {
  return async (input: unknown): Promise<DiagnosisReviewRevocationResult> => {
    const locked = lockDiagnosisReviewRevocation(input)
    try {
      return await runDatabaseTransaction(deps.driver, async tx => {
        const receipt = await deps.repository.readReceipt(tx, locked)
        if (receipt.status !== 'not_found') {
          return receipt
        }
        const at = deps.now()
        if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000) {
          throw new TypeError('撤销时间非法')
        }
        return deps.repository.append(tx, locked, at)
      })
    } catch (error) {
      if (error instanceof DiagnosisReviewRevocationConflictError) {
        return { status: 'conflict' }
      }
      if (error instanceof DatabaseCommitResultUnknownError) {
        return deps.repository.reconcile(locked)
      }
      throw error
    }
  }
}
