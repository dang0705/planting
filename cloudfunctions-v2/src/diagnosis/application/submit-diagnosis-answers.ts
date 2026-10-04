import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type { LockedQuestionPackageSnapshot } from '../domain/question-package-snapshot.js'
import { validateV1SubmissionEvidence } from '../domain/validate-v1-submission-evidence.js'

/** 只供Repository持有的已归属锁定会话，不进入公开响应。 */
export interface LockedAnswerSession {
  /** 数据库内部连接键，绝不能从客户端采纳。 */
  readonly internalId: string
  /** 会话状态，答案保存不会把它改为诊断已完成。 */
  readonly status: string
  /** 本次服务端题包完整内容及已重算摘要。 */
  readonly snapshot: LockedQuestionPackageSnapshot
}
/** 每题持久化结构；来源由应用层完整证据校验后构造。 */
export interface StoredDiagnosisAnswer {
  /** 服务端快照的稳定题目代码。 */
  readonly questionKey: string
  /** 完整不可覆盖正文；读回时不能只比摘要字段。 */
  readonly body: unknown
}
/** 事务内答案端口，不提供覆盖或删除方法。 */
export interface DiagnosisAnswerRepository<T extends TransactionExecutionContext> {
  /** 同一事务核验三项归属并锁定服务端会话。 */
  readonly lockOwned: (
    tx: T,
    userRef: string,
    userPlantRef: string,
    diagnosisRef: string
  ) => Promise<
    | {
        /** 完整快照可供使用。 */
        readonly status: 'found'
        /** 内部会话引用及服务端快照。 */
        readonly session: LockedAnswerSession
      }
    | {
        /** 归属失败或内容不足，不能进入作答。 */
        readonly status: 'not_found' | 'missing_snapshot' | 'invalid_snapshot'
      }
  >
  /** 原事务精确读取会话全部答案。 */
  readonly readAnswers: (
    tx: T,
    session: LockedAnswerSession
  ) => Promise<readonly StoredDiagnosisAnswer[]>
  /** 原事务整包追加；必须核对影响行数，不能忽略写入错误。 */
  readonly appendAnswers: (
    tx: T,
    session: LockedAnswerSession,
    answers: readonly StoredDiagnosisAnswer[],
    occurredAtMs: number
  ) => Promise<void>
}
/** 已认证入口给出的内部提交输入，不从客户端正文解析用户身份。 */
export interface SubmitDiagnosisAnswersInput {
  /** identity已经验证的统一用户引用。 */
  readonly userRef: string
  /** 当前用户植物的公开引用。 */
  readonly userPlantRef: string
  /** 服务端之前签发的会话公开引用。 */
  readonly diagnosisRef: string
  /** 原始答案DTO，必须按持久化快照重新校验。 */
  readonly submitted: unknown
  /** 服务端可信时间，UTC整数毫秒。 */
  readonly occurredAtMs: number
}
/** 比较完整正文和题目集合，不能把同摘要但损坏正文当作可重放结果。 */
function sameAnswers(
  actual: readonly StoredDiagnosisAnswer[],
  expected: readonly StoredDiagnosisAnswer[]
): boolean {
  if (actual.length !== expected.length) {
    return false
  }
  const seen = new Set<string>()
  try {
    return actual.every(item => {
      if (seen.has(item.questionKey)) {
        return false
      }
      seen.add(item.questionKey)
      const desired = expected.find(row => row.questionKey === item.questionKey)
      return (
        desired !== undefined &&
        serializeCanonicalJson(item.body as CanonicalJsonValue) ===
          serializeCanonicalJson(desired.body as CanonicalJsonValue)
      )
    })
  } catch {
    return false
  }
}
/**
 * 首次整包答案的事务编排。当前结果是内部确认，不代表正式HTTP、知识发布或诊断完成。
 * 共享HTTP幂等和未知提交对账由后续入口接入；本服务不自动重跑未知提交。
 */
export function createSubmitDiagnosisAnswersService<
  T extends TransactionExecutionContext
>(dependencies: {
  /** 既有Foundation事务驱动。 */
  readonly driver: DatabaseTransactionDriver<T>
  /** 只负责SQL与原事务读回的答案Repository。 */
  readonly repository: DiagnosisAnswerRepository<T>
}) {
  return async (input: SubmitDiagnosisAnswersInput) => {
    if (
      !Number.isSafeInteger(input.occurredAtMs) ||
      input.occurredAtMs < 0 ||
      input.occurredAtMs > 8_640_000_000_000_000
    ) {
      throw new TypeError('答案时间非法')
    }
    return runDatabaseTransaction(dependencies.driver, async tx => {
      const found = await dependencies.repository.lockOwned(
        tx,
        input.userRef,
        input.userPlantRef,
        input.diagnosisRef
      )
      if (found.status !== 'found') {
        return { status: found.status } as const
      }
      const session = found.session
      if (!['active', 'completed'].includes(session.status)) {
        return { status: 'session_not_active' } as const
      }
      const evidence = validateV1SubmissionEvidence(session.snapshot.snapshot, input.submitted)
      if (evidence.status !== 'valid_submission_evidence') {
        return { status: evidence.status } as const
      }
      const submissionSha256 = calculateCanonicalJsonSha256({
        questionSnapshotSha256: session.snapshot.snapshotSha256,
        answers: evidence.answers,
        air: evidence.airByQuestionId,
        timeline: evidence.timeline
      } as unknown as CanonicalJsonValue)
      const desired = evidence.answers.map(answer => ({
        questionKey: answer.questionKey,
        body: Object.freeze({
          contractVersion: 'diagnosis-answer-evidence/v1',
          questionKey: answer.questionKey,
          optionKey: answer.optionKey,
          questionSnapshotSha256: session.snapshot.snapshotSha256,
          submissionSha256,
          airEvidence: evidence.airByQuestionId[answer.questionKey] ?? null,
          timelineEvidence: answer.optionKey === 'care_behavior_timeline' ? evidence.timeline : null
        })
      }))
      const stored = await dependencies.repository.readAnswers(tx, session)
      if (stored.length) {
        return sameAnswers(stored, desired)
          ? ({ status: 'replayed', answerCount: desired.length } as const)
          : ({ status: 'conflict' } as const)
      }
      if (session.status !== 'active') {
        return { status: 'session_not_active' } as const
      }
      await dependencies.repository.appendAnswers(tx, session, desired, input.occurredAtMs)
      const readback = await dependencies.repository.readAnswers(tx, session)
      if (!sameAnswers(readback, desired)) {
        throw new Error('答案持久化读回不一致')
      }
      return { status: 'recorded', answerCount: desired.length } as const
    })
  }
}
