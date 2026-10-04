import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import {
  lockQuestionPackageSnapshot,
  type LockedQuestionPackageSnapshot
} from './question-package-snapshot.js'
import { validateV1SubmissionEvidence } from './validate-v1-submission-evidence.js'

/** SQL 返回的内部证据；完整性在领域重新核验，不能直接交给模型。 */
export interface PersistedDiagnosisAnswerEvidence {
  /** 原数据库答案引用，不接受客户端生成的引用。 */ readonly evidenceRef: string
  /** 同会话唯一题目代码。 */ readonly questionKey: string
  /** 原可信服务器作答时刻，不等于用户行为发生时间。 */ readonly answeredAtMs: number
  /** 原不可覆盖证据正文。 */ readonly body: unknown
}
/** 完整核验后的单条内部输入，用户申报仍不是已完成 care 事实。 */
export interface VerifiedDiagnosisAnswerEvidence extends PersistedDiagnosisAnswerEvidence {
  /** 规范化后与原记录逐字段相同的正文。 */ readonly body: CanonicalJsonObject
}
/** 领域只给出完整输入或明确缺口，不生成结论。 */
export type PersistedAnswerEvidenceResult =
  | {
      /** 空、损坏及零题不能相互冒充。 */ readonly status:
        | 'evidence_not_ready'
        | 'invalid_evidence'
        | 'not_answerable'
    }
  | {
      /** 本次已锁定完整答案，仍待受控映射与诊断准入。 */ readonly status: 'evidence_ready'
      /** 原题包版本及内容摘要供后续兼容性检查。 */ readonly questionPackageReleaseRef: string
      /** 完整题包摘要，不等于发布包或提交摘要。 */ readonly questionSnapshotSha256: string
      /** 重算出的整包提交内容摘要。 */ readonly submissionSha256: string
      /** 原题包顺序的完整答案，保留精确引用和时间。 */ readonly answers: readonly VerifiedDiagnosisAnswerEvidence[]
    }
/** 纯数据对象检查，不使用对象字符串转换填补缺失。 */
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
/** 递归冻结复制后的输入，不能冻结或污染调用方原记录。 */
function freeze(v: unknown): void {
  if (v !== null && typeof v === 'object') {
    Object.values(v).forEach(freeze)
    Object.freeze(v)
  }
}
/**
 * 根据保存合同还原复合表单并重新校验，再逐字段比对规范正文。
 * 还原不是补数据：全部值来自原记录，不补时间、来源、选项或浇水剂量。
 */
export function readPersistedAnswerEvidence(
  originalSnapshot: LockedQuestionPackageSnapshot,
  stored: readonly PersistedDiagnosisAnswerEvidence[]
): PersistedAnswerEvidenceResult {
  try {
    const snapshot = lockQuestionPackageSnapshot(originalSnapshot.snapshot)
    if (snapshot.snapshotSha256 !== originalSnapshot.snapshotSha256) {
      return { status: 'invalid_evidence' }
    }
    if (snapshot.snapshot.questionCount === 0) {
      return { status: 'not_answerable' }
    }
    if (!stored.length) {
      return { status: 'evidence_not_ready' }
    }
    const rows = JSON.parse(
      serializeCanonicalJson(stored as unknown as CanonicalJsonValue)
    ) as PersistedDiagnosisAnswerEvidence[]
    const refs = new Set<string>(),
      keys = new Set<string>()
    const air: Record<string, unknown> = {},
      airSnapshots: Record<string, unknown> = {}
    let timeline: unknown
    const answers: { questionKey: string; optionKey: unknown }[] = []
    for (const row of rows) {
      if (
        !record(row) ||
        Object.keys(row).some(
          k => !['evidenceRef', 'questionKey', 'answeredAtMs', 'body'].includes(k)
        ) ||
        typeof row.evidenceRef !== 'string' ||
        !row.evidenceRef.length ||
        row.evidenceRef.trim() !== row.evidenceRef ||
        refs.has(row.evidenceRef) ||
        typeof row.questionKey !== 'string' ||
        keys.has(row.questionKey) ||
        !Number.isSafeInteger(row.answeredAtMs) ||
        row.answeredAtMs < 0 ||
        row.answeredAtMs > 8640000000000000 ||
        !record(row.body)
      ) {
        return { status: 'invalid_evidence' }
      }
      refs.add(row.evidenceRef)
      keys.add(row.questionKey)
      const body = row.body
      answers.push({ questionKey: row.questionKey, optionKey: body.optionKey })
      if (body.airEvidence !== null) {
        if (!record(body.airEvidence)) {
          return { status: 'invalid_evidence' }
        }
        air[row.questionKey] = body.airEvidence.input
        airSnapshots[row.questionKey] = {
          input: body.airEvidence.input,
          source: body.airEvidence.declaredSource
        }
      }
      if (body.timelineEvidence !== null) {
        if (timeline !== undefined || !record(body.timelineEvidence)) {
          return { status: 'invalid_evidence' }
        }
        const t = body.timelineEvidence
        timeline = {
          referenceDate: t.referenceDate,
          wateringEvents10d: t.wateringEvents,
          fertilizingEvents10d: t.fertilizingEvents,
          lightChangeEvents10d: t.lightChangeEvents,
          dailyRecords: t.dailyRecords,
          lastFertilizedBucket: t.lastFertilizedBucket
        }
      }
    }
    const submitted = {
      requestMode: 'answer_submit',
      answers,
      airEnvironmentByQuestionId: air,
      airEnvironmentSnapshotsByQuestionId: airSnapshots,
      ...(timeline !== undefined ? { careBehaviorTimeline: timeline } : {})
    }
    const verified = validateV1SubmissionEvidence(snapshot.snapshot, submitted)
    if (verified.status !== 'valid_submission_evidence') {
      return { status: 'invalid_evidence' }
    }
    const submissionSha256 = calculateCanonicalJsonSha256({
      questionSnapshotSha256: snapshot.snapshotSha256,
      answers: verified.answers,
      air: verified.airByQuestionId,
      timeline: verified.timeline
    } as unknown as CanonicalJsonValue)
    const output = verified.answers.map(answer => {
      const row = rows.find(r => r.questionKey === answer.questionKey)!
      const body = {
        contractVersion: 'diagnosis-answer-evidence/v1',
        ...answer,
        questionSnapshotSha256: snapshot.snapshotSha256,
        submissionSha256,
        airEvidence: verified.airByQuestionId[answer.questionKey] ?? null,
        timelineEvidence: answer.optionKey === 'care_behavior_timeline' ? verified.timeline : null
      }
      if (
        serializeCanonicalJson(row.body as CanonicalJsonValue) !==
        serializeCanonicalJson(body as unknown as CanonicalJsonValue)
      ) {
        throw new TypeError('已存答案规范正文或提交摘要不匹配')
      }
      return { ...row, body: body as unknown as CanonicalJsonObject }
    })
    const result: PersistedAnswerEvidenceResult = {
      status: 'evidence_ready',
      questionPackageReleaseRef: snapshot.snapshot.questionPackageReleaseRef,
      questionSnapshotSha256: snapshot.snapshotSha256,
      submissionSha256,
      answers: output
    }
    freeze(result)
    return result
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof RangeError) {
      return { status: 'invalid_evidence' }
    }
    throw error
  }
}
