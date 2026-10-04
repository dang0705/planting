import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import type { DiagnosisAnswerRepository, LockedAnswerSession } from './submit-diagnosis-answers.js'
import {
  readPersistedAnswerEvidence,
  type PersistedDiagnosisAnswerEvidence
} from '../domain/read-persisted-answer-evidence.js'

/** 只读专属端口；复用已核验三项归属的会话锁，不暴露追加或覆盖能力。 */
export interface DiagnosisAnswerEvidenceRepository<T extends TransactionExecutionContext> {
  /** 原持久化题包在同一事务锁定，客户端不能替换。 */ readonly lockOwned: DiagnosisAnswerRepository<T>['lockOwned']
  /** 读取同会话完整答案、原引用及作答时间。 */ readonly readEvidence: (
    tx: T,
    session: LockedAnswerSession
  ) => Promise<readonly PersistedDiagnosisAnswerEvidence[]>
}
/** 内部身份上下文，不是公开请求正文。 */
export interface ReadDiagnosisAnswerEvidenceInput {
  /** identity 验证过的统一用户。 */ readonly userRef: string
  /** 必须属于该用户的用户植物。 */ readonly userPlantRef: string
  /** 属于同用户和植物的诊断会话。 */ readonly diagnosisRef: string
}
/**
 * 独立短事务读取完整已存证据。该用例不产生诊断结论、不调用模型，
 * 不把用户时间线变成实际养护事实；只有完整读回才交给后续受控归一。
 */
export function createReadDiagnosisAnswerEvidence<T extends TransactionExecutionContext>(deps: {
  /** 正式事务设施，读取异常仍须回滚。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 专属只读答案端口。 */ readonly repository: DiagnosisAnswerEvidenceRepository<T>
}) {
  return (input: ReadDiagnosisAnswerEvidenceInput) => {
    const { userRef, userPlantRef, diagnosisRef } = input
    return runDatabaseTransaction(deps.driver, async tx => {
      const found = await deps.repository.lockOwned(tx, userRef, userPlantRef, diagnosisRef)
      if (found.status !== 'found') {
        return { status: found.status } as const
      }
      if (!['active', 'completed'].includes(found.session.status)) {
        return { status: 'session_not_active' } as const
      }
      const rows = await deps.repository.readEvidence(tx, found.session)
      return readPersistedAnswerEvidence(found.session.snapshot, rows)
    })
  }
}
