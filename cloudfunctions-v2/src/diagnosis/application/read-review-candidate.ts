import Ajv2020 from 'ajv/dist/2020.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import {
  createDiagnosisCandidatePreparation,
  type DiagnosisCandidateSchemas,
  type CandidateDependencyReader
} from './prepare-knowledge-candidate.js'

/** 待审链接必须精确绑定完整正文，不能隐式选择最新版本。 */
export interface DiagnosisReviewCandidateQuery {
  /** 不可变候选修订的精确引用。 */ readonly candidateRef: string
  /** 该修订完整 JSON 的规范化 SHA-256。 */ readonly contentSha256: string
}
/** Repository 只确认候选原样读回；来源及题包还须应用层复核。 */
export type DiagnosisReviewCandidateRead =
  | {
      /** 无记录、非待审或损坏时拒绝提供候选正文。 */
      readonly status: 'unavailable'
    }
  | {
      /** 完整结构、元数据及摘要已核验；不是人工审核。 */ readonly status: 'submitted_candidate'
      /** 候选原样正文，不包含数据库主键。 */ readonly candidate: CanonicalJsonObject
      /** 原提交时间，不使用读取时刻冒充。 */ readonly submittedAtMs: number
    }
/** 供已授权审核工作流消费的内部结果，不得作为公开诊断响应或批准凭证。 */
export type DiagnosisReviewCandidateResult =
  | {
      /** 未得到有效的完整候选以及精确来源依赖。 */
      readonly status: 'unavailable'
    }
  | {
      /** 仅代表已准备好供人工审核。 */ readonly status: 'review_candidate_ready'
      /** 本次原样修订引用。 */ readonly candidateRef: string
      /** 原待审完整正文的规范化内容摘要。 */ readonly contentSha256: string
      /** 该候选实际提交审核的服务器毫秒时间。 */ readonly submittedAtMs: number
      /** 递归冻结的原样候选。 */ readonly candidate: CanonicalJsonObject
    }
/** SQL 查询限于候选表，不执行审核、发布、奖励或业务写入。 */
export interface DiagnosisReviewCandidateRepository<T extends TransactionExecutionContext> {
  /** 同一短事务按精确引用读取，并核验调用方期望的完整摘要。 */ readSubmitted(
    tx: T,
    query: DiagnosisReviewCandidateQuery
  ): Promise<DiagnosisReviewCandidateRead>
}
/** 所有 Schema 与来源读取能力来自受控服务端接线，不能由候选正文提供。 */
export interface DiagnosisReviewCandidateDependencies<T extends TransactionExecutionContext> {
  /** 复用既有事务生命周期，结束后不保留数据库锁。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 只读候选 Repository。 */ readonly repository: DiagnosisReviewCandidateRepository<T>
  /** 既有候选及引用 Schema。 */ readonly schemas: DiagnosisCandidateSchemas
  /** 同一事务内的精确来源及题包复核。 */ readonly dependencyReader: (
    tx: T
  ) => CandidateDependencyReader
}
const validate = new Ajv2020({ strict: true }).compile<DiagnosisReviewCandidateQuery>({
  type: 'object',
  additionalProperties: false,
  required: ['candidateRef', 'contentSha256'],
  properties: {
    candidateRef: {
      type: 'string',
      minLength: 1,
      maxLength: 96,
      pattern: '^\\S(?:[\\s\\S]*\\S)?$'
    },
    contentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }
  }
})
/** 原样待审快照→精确依赖复核；不设置审核协议，也不签发批准或发布凭证。 */
export function createReadDiagnosisReviewCandidate<T extends TransactionExecutionContext>(
  deps: DiagnosisReviewCandidateDependencies<T>
) {
  return async (input: unknown): Promise<DiagnosisReviewCandidateResult> => {
    if (!validate(input)) {
      throw new TypeError('待审候选精确引用或摘要非法')
    }
    const query = Object.freeze({ ...input })
    return runDatabaseTransaction(deps.driver, async tx => {
      const row = await deps.repository.readSubmitted(tx, query)
      if (row.status !== 'submitted_candidate') {
        return { status: 'unavailable' as const }
      }
      const prepared = await createDiagnosisCandidatePreparation(
        deps.schemas,
        deps.dependencyReader(tx)
      )(row.candidate)
      if (
        prepared.status !== 'prepared_for_review' ||
        prepared.contentSha256 !== query.contentSha256
      ) {
        return { status: 'unavailable' as const }
      }
      return Object.freeze({
        status: 'review_candidate_ready' as const,
        candidateRef: query.candidateRef,
        contentSha256: prepared.contentSha256,
        submittedAtMs: row.submittedAtMs,
        candidate: prepared.candidate
      })
    })
  }
}
