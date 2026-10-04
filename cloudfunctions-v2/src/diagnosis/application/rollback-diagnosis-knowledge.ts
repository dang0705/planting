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
  createDiagnosisKnowledgeReleaseLocker,
  DiagnosisKnowledgePublicationConflictError,
  type LockedDiagnosisKnowledgeRelease
} from '../domain/diagnosis-knowledge-release.js'
import {
  lockDiagnosisRollbackCommand,
  type DiagnosisKnowledgeRollbackCommand
} from '../domain/diagnosis-knowledge-rollback.js'
/** 历史回滚收据仅证明命令结果，不授予当前版本安全资格。 */
export type DiagnosisKnowledgeRollbackResult =
  | {
      /** 指针及审计已原子保存或原样重放。 */ readonly status: 'rolled_back'
      /** 当时切回的旧知识引用。 */ readonly releaseRef: string
      /** 当时旧包完整摘要。 */ readonly packageSha256: string
      /** 当次切换后的活动指针版本。 */ readonly pointerVersion: number
    }
  | {
      /** 依赖缺失、并发冲突或提交未知，不伪报成功。 */ readonly status:
        | 'unavailable'
        | 'conflict'
        | 'unknown_commit'
    }
/** 缺历史收据时才允许进入回滚准备。 */
export interface MissingDiagnosisRollbackReceipt {
  /** 精确命令尚未保存。 */ readonly status: 'not_found'
}
/** 目标原审核已持锁检查，但仍须由应用核验外部依赖。 */
export type DiagnosisRollbackTarget =
  | {
      /** 原样旧包及精确未撤销批准已经读回。 */ readonly status: 'ready'
      /** 完整冻结旧包，不改写或重新生成。 */ readonly release: LockedDiagnosisKnowledgeRelease
    }
  | {
      /** 旧包、批准或关联不可用。 */ readonly status: 'unavailable'
    }
/** 专属回滚持久化端口，所有写入留在同一事务。 */
export interface DiagnosisKnowledgeRollbackRepository<T extends TransactionExecutionContext> {
  /** 按原审计及完整旧包比对命令，不读当前指针重建收据。 */ readReceipt(
    tx: T,
    command: DiagnosisKnowledgeRollbackCommand
  ): Promise<DiagnosisKnowledgeRollbackResult | MissingDiagnosisRollbackReceipt>
  /** 锁精确原审核，并检查撤销、候选及原样包关联。 */ readTarget(
    tx: T,
    command: DiagnosisKnowledgeRollbackCommand
  ): Promise<DiagnosisRollbackTarget>
  /** 锁指针/旧包当前状态，再原子切换与追加回滚审计。 */ rollback(
    tx: T,
    command: DiagnosisKnowledgeRollbackCommand,
    release: LockedDiagnosisKnowledgeRelease,
    at: number
  ): Promise<DiagnosisKnowledgeRollbackResult>
  /** 提交未知时使用新连接只读对账。 */ reconcile(
    command: DiagnosisKnowledgeRollbackCommand
  ): Promise<DiagnosisKnowledgeRollbackResult>
}
/** 不提供CMS管理员或依赖默认值；缺受控接线不得开放HTTP。 */
export interface DiagnosisKnowledgeRollbackDependencies<T extends TransactionExecutionContext> {
  /** 共享事务驱动，不能另开写连接。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 专属回滚Repository。 */ readonly repository: DiagnosisKnowledgeRollbackRepository<T>
  /** 与发布使用相同受控Schema。 */ readonly schemas: DiagnosisCandidateSchemas
  /** 原题包及来源许可依赖当前准入Reader。 */ readonly dependencyReader: (
    tx: T
  ) => CandidateDependencyReader
  /** 首次回滚服务器时间，不进入重放比较。 */ readonly now: () => number
}
/** 仍有效旧包重新准入→同事务指针回滚；不改原知识或历史结果。 */
export function createRollbackDiagnosisKnowledge<T extends TransactionExecutionContext>(
  deps: DiagnosisKnowledgeRollbackDependencies<T>
) {
  const lock = createDiagnosisKnowledgeReleaseLocker(deps.schemas.candidate)
  return async (input: unknown): Promise<DiagnosisKnowledgeRollbackResult> => {
    const command = lockDiagnosisRollbackCommand(input)
    try {
      return await runDatabaseTransaction(deps.driver, async tx => {
        const receipt = await deps.repository.readReceipt(tx, command)
        if (receipt.status !== 'not_found') {
          return receipt
        }
        const target = await deps.repository.readTarget(tx, command)
        if (target.status !== 'ready') {
          return { status: 'unavailable' as const }
        }
        const release = lock(target.release.package),
          p = release.package
        if (
          release.packageSha256 !== target.release.packageSha256 ||
          release.packageSha256 !== command.targetPackageSha256 ||
          p.releaseRef !== command.targetReleaseRef ||
          p.bundleCode !== command.bundleCode ||
          p.reviewProtocolVersion !== command.reviewProtocolVersion
        ) {
          return { status: 'unavailable' as const }
        }
        const prepared = await createDiagnosisCandidatePreparation(
          deps.schemas,
          deps.dependencyReader(tx)
        )(p.candidate)
        if (
          prepared.status !== 'prepared_for_review' ||
          prepared.contentSha256 !== p.candidateContentSha256
        ) {
          return { status: 'unavailable' as const }
        }
        const at = deps.now()
        if (!Number.isSafeInteger(at) || at < p.publishedAtMs || at > 8640000000000000) {
          return { status: 'unavailable' as const }
        }
        return deps.repository.rollback(tx, command, release, at)
      })
    } catch (error) {
      if (error instanceof DiagnosisKnowledgePublicationConflictError) {
        return { status: 'conflict' }
      }
      if (error instanceof DatabaseCommitResultUnknownError) {
        return deps.repository.reconcile(command)
      }
      throw error
    }
  }
}
