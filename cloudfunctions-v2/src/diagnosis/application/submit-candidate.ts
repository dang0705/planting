import {
  runDatabaseTransaction,
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import {
  createDiagnosisCandidatePreparation,
  type DiagnosisCandidateSchemas,
  type CandidateDependencyReader
} from './prepare-knowledge-candidate.js'
import {
  createLockDiagnosisCandidateSubmission,
  DiagnosisCandidateSubmissionConflictError,
  type LockedDiagnosisCandidateSubmission
} from '../domain/candidate-submission.js'
/** 历史候选提交收据，不表示该修订当前仍可审核或发布。 */
export type DiagnosisCandidateSubmissionResult =
  | {
      /** 完整提交已保存或历史收据已读回。 */ readonly status: 'submitted'
      /** 该次提交的原始候选修订引用。 */ readonly candidateRef: string
      /** 该次提交完整正文的规范化摘要。 */ readonly contentSha256: string
      /** 第一次成功提交的服务器毫秒时间。 */ readonly submittedAtMs: number
    }
  | {
      /** 缺前置、命令冲突或提交结果尚无法确认。 */ readonly status:
        | 'unavailable'
        | 'conflict'
        | 'unknown_commit'
    }
/** 精确候选引用尚未产生历史提交收据。 */
export interface MissingCandidateSubmissionReceipt {
  /** 只有不存在的引用才可以进入新提交。 */ readonly status: 'not_found'
}
/** 候选表专属持久化端口，不创建审核或发布记录。 */
export interface DiagnosisCandidateSubmissionRepository<T extends TransactionExecutionContext> {
  /** 同引用、完整正文和原时间核验，历史收据不依赖当前审核状态。 */ readReceipt(
    tx: T,
    command: LockedDiagnosisCandidateSubmission
  ): Promise<DiagnosisCandidateSubmissionResult | MissingCandidateSubmissionReceipt>
  /** 在当前事务保存新候选并读回完整收据，禁止覆盖。 */ insert(
    tx: T,
    command: LockedDiagnosisCandidateSubmission,
    at: number
  ): Promise<DiagnosisCandidateSubmissionResult>
  /** 用新连接只读对账；无收据时保持明确不存在。 */ reconcile(
    command: LockedDiagnosisCandidateSubmission
  ): Promise<DiagnosisCandidateSubmissionResult | MissingCandidateSubmissionReceipt>
}
/** 正式 CMS 身份尚未接线时，只供受控内部应用调用。 */
export interface DiagnosisCandidateSubmissionDependencies<T extends TransactionExecutionContext> {
  /** 复用共享事务及未知提交处理机制。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 只写诊断候选的专属持久化端口。 */ readonly repository: DiagnosisCandidateSubmissionRepository<T>
  /** 完整候选和依赖的唯一受控 Schema。 */ readonly schemas: DiagnosisCandidateSchemas
  /** 在当前短事务核验精确来源及题包依赖。 */ readonly dependencyReader: (
    tx: T
  ) => CandidateDependencyReader
  /** 仅新提交使用的受控服务器毫秒时钟。 */ readonly now: () => number
}
/** 完整草稿→来源复核→待审候选；未知提交和并发失败只读对账，不重写。 */
export function createSubmitDiagnosisCandidate<T extends TransactionExecutionContext>(
  deps: DiagnosisCandidateSubmissionDependencies<T>
) {
  const lock = createLockDiagnosisCandidateSubmission(deps.schemas.candidate)
  return async (input: unknown): Promise<DiagnosisCandidateSubmissionResult> => {
    const command = lock(input)
    try {
      return await runDatabaseTransaction(deps.driver, async tx => {
        const receipt = await deps.repository.readReceipt(tx, command)
        if (receipt.status !== 'not_found') {
          return receipt
        }
        const prepared = await createDiagnosisCandidatePreparation(
          deps.schemas,
          deps.dependencyReader(tx)
        )(command.candidate)
        if (
          prepared.status !== 'prepared_for_review' ||
          prepared.contentSha256 !== command.contentSha256
        ) {
          return { status: 'unavailable' as const }
        }
        const at = deps.now()
        if (!Number.isSafeInteger(at) || at < 0 || at > 8_640_000_000_000_000) {
          throw new TypeError('候选提交时间非法')
        }
        return deps.repository.insert(tx, command, at)
      })
    } catch (error) {
      if (
        error instanceof DiagnosisCandidateSubmissionConflictError ||
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
