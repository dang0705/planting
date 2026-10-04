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
  DiagnosisKnowledgePublicationConflictError,
  createDiagnosisKnowledgeReleaseLocker,
  lockDiagnosisPublicationCommand,
  type DiagnosisKnowledgePublicationCommand,
  type LockedDiagnosisKnowledgeRelease
} from '../domain/diagnosis-knowledge-release.js'
import type { ReviewedDiagnosisCandidate } from '../repository/mysql-reviewed-diagnosis-candidate-reader.js'
/** 内部发布收据；重放只证明历史命令结果，不授予当前活动版本安全资格。 */
export type DiagnosisKnowledgePublicationResult =
  | {
      /** 已读回原子发布收据，引用与摘要相互对应。 */ readonly status: 'published'
      /** 精确历史发布引用，不能替换当前活动版本。 */ readonly releaseRef: string
      /** 被发布完整包的规范化摘要。 */ readonly packageSha256: string
      /** 当次切换后的指针版本，重放不再加一。 */ readonly pointerVersion: number
    }
  | {
      /** 前置不可用、参数冲突或提交尚无法确认。 */ readonly status:
        | 'unavailable'
        | 'conflict'
        | 'unknown_commit'
    }
/** 精确命令没有既有审计时的内部查询结果，不能作为公开发布成功。 */
export interface MissingDiagnosisPublicationReceipt {
  /**
   * 该精确命令尚无历史收据，只有此状态才允许进入新发布准备。
   */
  readonly status: 'not_found'
}
/** 诊断领域专属发布Repository；所有写入必须留在调用方同一事务。 */
export interface DiagnosisKnowledgePublicationRepository<T extends TransactionExecutionContext> {
  /** 同命令历史收据，逐项比对命令，不读取当前指针重建结果。 */ readReceipt(
    tx: T,
    command: DiagnosisKnowledgePublicationCommand
  ): Promise<DiagnosisKnowledgePublicationResult | MissingDiagnosisPublicationReceipt>
  /** 精确审核锁、原样候选及独立撤销检查，拒绝默认协议。 */ readReviewed(
    tx: T,
    command: DiagnosisKnowledgePublicationCommand
  ): Promise<ReviewedDiagnosisCandidate>
  /** 不可变发布、活动指针及审计在同一事务落下并读回。 */ activate(
    tx: T,
    command: DiagnosisKnowledgePublicationCommand,
    release: LockedDiagnosisKnowledgeRelease
  ): Promise<DiagnosisKnowledgePublicationResult>
  /** 提交未知时仅用新连接读回历史收据，禁止写入或盲重试。 */ reconcile(
    command: DiagnosisKnowledgePublicationCommand
  ): Promise<DiagnosisKnowledgePublicationResult>
}
/** 受控应用接线；没有真实依赖Reader或管理员验真时不开放正式发布入口。 */
export interface DiagnosisKnowledgePublicationDependencies<T extends TransactionExecutionContext> {
  /** 既有事务驱动，未知提交处理遵循共享Foundation规则。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 专属发布Repository，不使用通用配置KV代替知识表。 */ readonly repository: DiagnosisKnowledgePublicationRepository<T>
  /** 唯一受控候选及引用Schema，禁止由调用正文注入。 */ readonly schemas: DiagnosisCandidateSchemas
  /** 在当前事务/只读快照核验题包发布、来源状态、许可与适用性。 */ readonly dependencyReader: (
    tx: T
  ) => CandidateDependencyReader
  /** 受控服务器UTC毫秒，仅首次发布使用，不参与重放比较。 */ readonly now: () => number
}
/** 原样审核→重新核验依赖→原子发布；不调用模型，不产生诊断或养护事实。 */
export function createPublishDiagnosisKnowledge<T extends TransactionExecutionContext>(
  deps: DiagnosisKnowledgePublicationDependencies<T>
) {
  const lock = createDiagnosisKnowledgeReleaseLocker(deps.schemas.candidate)
  return async (input: unknown): Promise<DiagnosisKnowledgePublicationResult> => {
    const command = lockDiagnosisPublicationCommand(input)
    try {
      return await runDatabaseTransaction(deps.driver, async tx => {
        const receipt = await deps.repository.readReceipt(tx, command)
        if (receipt.status !== 'not_found') {
          return receipt
        }
        const reviewed = await deps.repository.readReviewed(tx, command)
        if (
          reviewed.status !== 'reviewed_candidate' ||
          reviewed.contentSha256 !== command.candidateContentSha256 ||
          reviewed.protocolVersion !== command.reviewProtocolVersion
        ) {
          return { status: 'unavailable' as const }
        }
        const prepare = createDiagnosisCandidatePreparation(
            deps.schemas,
            deps.dependencyReader(tx)
          ),
          prepared = await prepare(reviewed.candidate)
        if (
          prepared.status !== 'prepared_for_review' ||
          prepared.contentSha256 !== command.candidateContentSha256
        ) {
          return { status: 'unavailable' as const }
        }
        const release = lock({
          schemaVersion: 'diagnosis-knowledge-release/v1',
          releaseRef: command.releaseRef,
          bundleCode: command.bundleCode,
          version: command.version,
          candidateRef: command.candidateRef,
          candidateContentSha256: command.candidateContentSha256,
          reviewRef: command.reviewRef,
          reviewProtocolVersion: command.reviewProtocolVersion,
          publishedAtMs: deps.now(),
          candidate: prepared.candidate
        })
        if (release.package.publishedAtMs < reviewed.decidedAtMs) {
          return { status: 'unavailable' as const }
        }
        return deps.repository.activate(tx, command, release)
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
