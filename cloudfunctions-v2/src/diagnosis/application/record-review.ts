import {
  runDatabaseTransaction,
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { createLockDiagnosisCandidateSubmission } from '../domain/candidate-submission.js'
import {
  lockDiagnosisReviewRecord,
  DiagnosisReviewRecordConflictError,
  type DiagnosisReviewRecordCommand
} from '../domain/review-record.js'
import {
  createDiagnosisCandidatePreparation,
  type DiagnosisCandidateSchemas,
  type CandidateDependencyReader
} from './prepare-knowledge-candidate.js'
import type { DiagnosisReviewCandidateRead } from './read-review-candidate.js'
/** 内部人工决定历史收据，不代表当前审核仍有效或知识已经发布。 */
export type DiagnosisReviewRecordResult =
  | {
      /** 原决定与状态变更已原子保存或历史重放。 */ readonly status: 'recorded'
      /** 原人工审核幂等引用，不进入公开诊断响应。 */ readonly reviewRef: string
      /** 原决定，不使用当前候选状态重建。 */ readonly decision: 'approved' | 'rejected'
      /** 第一次保存的服务器决定毫秒时间。 */ readonly decidedAtMs: number
    }
  | {
      /** 缺精确记录、冲突或提交结果仍无法确认。 */ readonly status:
        | 'unavailable'
        | 'conflict'
        | 'unknown_commit'
    }
/** 精确审核引用没有既有收据，才允许尝试新的决定。 */
export interface MissingDiagnosisReviewRecord {
  /** 当前精确审核引用没有历史记录。 */ readonly status: 'not_found'
}
/** 人工审核专属端口；候选锁保持到原子提交结束。 */
export interface DiagnosisReviewRecordRepository<T extends TransactionExecutionContext> {
  /** 比对完整审核命令的历史决定，重放不重新批准。 */ readReceipt(
    tx: T,
    command: DiagnosisReviewRecordCommand
  ): Promise<DiagnosisReviewRecordResult | MissingDiagnosisReviewRecord>
  /** 独占锁定 submitted 候选，并原样核验 Schema/摘要/时间。 */ lockSubmitted(
    tx: T,
    command: DiagnosisReviewRecordCommand
  ): Promise<DiagnosisReviewCandidateRead>
  /** 同事务追加审核并比较更新候选状态，读回原决定。 */ append(
    tx: T,
    command: DiagnosisReviewRecordCommand,
    at: number
  ): Promise<DiagnosisReviewRecordResult>
  /** 用新连接只读核对，缺记录保持明确不存在。 */ reconcile(
    command: DiagnosisReviewRecordCommand
  ): Promise<DiagnosisReviewRecordResult | MissingDiagnosisReviewRecord>
}
/** 没有正式 CMS 管理员与协议接线时不得开放本用例的公共写入口。 */
export interface DiagnosisReviewRecordDependencies<T extends TransactionExecutionContext> {
  /** 共享事务生命周期及提交未知保护。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 人工审核与候选原子持久化端口。 */ readonly repository: DiagnosisReviewRecordRepository<T>
  /** 来自受控接线的完整候选和引用 Schema。 */ readonly schemas: DiagnosisCandidateSchemas
  /** 批准前复核精确题包及来源依赖。 */ readonly dependencyReader: (
    tx: T
  ) => CandidateDependencyReader
  /** 仅首次决定使用的受控服务器毫秒时钟。 */ readonly now: () => number
}
/** 精确候选→人工决定→原子审核记录，不产生发布包或业务事实。 */
export function createRecordDiagnosisReview<T extends TransactionExecutionContext>(
  deps: DiagnosisReviewRecordDependencies<T>
) {
  const lockCandidate = createLockDiagnosisCandidateSubmission(deps.schemas.candidate)
  return async (input: unknown): Promise<DiagnosisReviewRecordResult> => {
    const command = lockDiagnosisReviewRecord(input)
    try {
      return await runDatabaseTransaction(deps.driver, async tx => {
        const receipt = await deps.repository.readReceipt(tx, command)
        if (receipt.status !== 'not_found') {
          return receipt
        }
        const row = await deps.repository.lockSubmitted(tx, command)
        if (row.status !== 'submitted_candidate') {
          return { status: 'unavailable' as const }
        }
        let candidate
        try {
          candidate = lockCandidate({
            candidateRef: command.candidateRef,
            candidate: row.candidate
          })
        } catch (e) {
          if (e instanceof TypeError || e instanceof RangeError || e instanceof SyntaxError) {
            return { status: 'unavailable' as const }
          }
          throw e
        }
        if (candidate.contentSha256 !== command.contentSha256) {
          return { status: 'unavailable' as const }
        }
        if (command.decision === 'approved') {
          const prepared = await createDiagnosisCandidatePreparation(
            deps.schemas,
            deps.dependencyReader(tx)
          )(candidate.candidate)
          if (
            prepared.status !== 'prepared_for_review' ||
            prepared.contentSha256 !== command.contentSha256
          ) {
            return { status: 'unavailable' as const }
          }
        }
        const at = deps.now()
        if (
          !Number.isSafeInteger(at) ||
          at < 0 ||
          at > 8_640_000_000_000_000 ||
          !Number.isSafeInteger(row.submittedAtMs) ||
          at < row.submittedAtMs
        ) {
          return { status: 'unavailable' as const }
        }
        return deps.repository.append(tx, command, at)
      })
    } catch (error) {
      if (
        error instanceof DiagnosisReviewRecordConflictError ||
        error instanceof DatabaseCommitResultUnknownError
      ) {
        const receipt = await deps.repository.reconcile(command)
        if (receipt.status !== 'not_found') {
          return receipt
        }
        return {
          status: error instanceof DatabaseCommitResultUnknownError ? 'unknown_commit' : 'conflict'
        }
      }
      throw error
    }
  }
}
