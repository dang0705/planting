import Ajv2020 from 'ajv/dist/2020.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 本返回值只是持有审核锁的内部候选快照，不是来源许可或知识发布授权。 */
export type ReviewedDiagnosisCandidate =
  | {
      /** 审核不可用或记录损坏；调用方不得继续生成发布内容。 */
      readonly status: 'unavailable' | 'invalid_record'
    }
  | {
      /** 仅确认精确被审候选已读回，其他发布准入尚须核验。 */
      readonly status: 'reviewed_candidate'
      /** 精确被审完整候选，递归冻结且已重算摘要。 */
      readonly candidate: CanonicalJsonObject
      /** 原样被审内容摘要，不包括数据库行状态。 */
      readonly contentSha256: string
      /** 受控审核引用，仅限内部审计，不进入公开响应。 */
      readonly reviewRef: string
      /** 由受控接线指定且与数据库一致的交换协议版本。 */
      readonly protocolVersion: string
      /** 审核主体不可逆摘要，不等于本应用已经验真CMS管理员。 */
      readonly reviewerRefHash: string
      /** 安全可表示的审核UTC毫秒，不能用时间替代协议版本。 */
      readonly decidedAtMs: number
    }
/** SQL引用与版本必须非空并遵循列宽，不设置任何默认协议或候选。 */
function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    /\S/u.test(value) &&
    [...value].length <= max
  )
}
/** 摘要格式只是第一层检查；候选正文还须重新规范化计算并比较。 */
function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}
/** 内部JSON快照递归冻结，避免异步发布期间被调用方改写内容。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freeze(child)
    }
    Object.freeze(value)
  }
}
/**
 * 读取发布准备所需的精确人工审核与候选，先锁审核目标再检查撤销事实。
 * 调用方必须保持同一显式事务并继续核验来源、题包及语义；本Reader不会发布或提交。
 * 候选Schema只能来自受控应用接线，不能来自CMS正文或客户端；协议版本没有默认值。
 */
export function createMysqlReviewedDiagnosisCandidateReader(candidateSchema: object) {
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(candidateSchema)
  return {
    /** 审核引用、候选引用及批准协议须逐项匹配，撤销或驳回只返回不可用。 */
    async read(
      tx: MysqlTransactionContext<Mysql2QueryConnection>,
      candidateRef: string,
      reviewRef: string,
      protocolVersion: string
    ): Promise<ReviewedDiagnosisCandidate> {
      if (tx.transactionContext !== true || !tx.connection) {
        throw new TypeError('审核读取需要显式事务')
      }
      if (!text(candidateRef, 96) || !text(reviewRef, 96) || !text(protocolVersion, 48)) {
        throw new TypeError('审核精确引用或协议非法')
      }
      const reviews = await tx.connection.query(
        'SELECT candidate_internal_id,content_sha256,decision,protocol_version,reviewer_ref_hash,CAST(decided_at_ms AS CHAR) AS decided_at_ms,_openid FROM diagnosis_review_attestations WHERE BINARY review_ref=BINARY ? FOR UPDATE',
        [reviewRef]
      )
      if (reviews.length === 0) {
        return { status: 'unavailable' }
      }
      if (reviews.length !== 1) {
        return { status: 'invalid_record' }
      }
      const review = reviews[0]!
      const time =
        typeof review.decided_at_ms === 'string' && /^(0|[1-9][0-9]*)$/u.test(review.decided_at_ms)
          ? Number(review.decided_at_ms)
          : NaN
      if (
        review._openid !== '' ||
        review.protocol_version !== protocolVersion ||
        !digest(review.content_sha256) ||
        !digest(review.reviewer_ref_hash) ||
        !Number.isSafeInteger(time) ||
        time > 8_640_000_000_000_000 ||
        !/^[1-9][0-9]*$/u.test(String(review.candidate_internal_id))
      ) {
        return { status: 'invalid_record' }
      }
      if (review.decision === 'rejected') {
        return { status: 'unavailable' }
      }
      if (review.decision !== 'approved') {
        return { status: 'invalid_record' }
      }
      const rows = await tx.connection.query(
        'SELECT candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,_openid FROM diagnosis_knowledge_candidates WHERE id=? AND BINARY candidate_ref=BINARY ? FOR UPDATE',
        [String(review.candidate_internal_id), candidateRef]
      )
      if (rows.length === 0) {
        return { status: 'unavailable' }
      }
      if (rows.length !== 1) {
        return { status: 'invalid_record' }
      }
      const row = rows[0]!
      if (
        row._openid !== '' ||
        row.candidate_ref !== candidateRef ||
        row.content_sha256 !== review.content_sha256
      ) {
        return { status: 'invalid_record' }
      }
      if (row.candidate_state !== 'reviewed') {
        return { status: 'unavailable' }
      }
      let candidate: CanonicalJsonObject
      try {
        const input: unknown =
          typeof row.candidate_json === 'string'
            ? JSON.parse(row.candidate_json)
            : row.candidate_json
        candidate = JSON.parse(
          serializeCanonicalJson(input as CanonicalJsonValue)
        ) as CanonicalJsonObject
        if (
          !validate(candidate) ||
          candidate.bundleCode !== row.bundle_code ||
          candidate.revisionNo !== row.revision_no ||
          candidate.schemaVersion !== row.schema_version ||
          calculateCanonicalJsonSha256(candidate) !== review.content_sha256
        ) {
          return { status: 'invalid_record' }
        }
      } catch (e) {
        if (e instanceof SyntaxError || e instanceof TypeError || e instanceof RangeError) {
          return { status: 'invalid_record' }
        }
        throw e
      }
      const revocations = await tx.connection.query(
        'SELECT v.revocation_ref FROM diagnosis_review_revocations v JOIN diagnosis_review_attestations a ON a.id=v.target_review_internal_id WHERE BINARY a.review_ref=BINARY ?',
        [reviewRef]
      )
      if (revocations.length > 0) {
        return { status: 'unavailable' }
      }
      freeze(candidate)
      return Object.freeze({
        status: 'reviewed_candidate',
        candidate,
        contentSha256: review.content_sha256,
        reviewRef,
        protocolVersion,
        reviewerRefHash: review.reviewer_ref_hash,
        decidedAtMs: time
      })
    }
  }
}
