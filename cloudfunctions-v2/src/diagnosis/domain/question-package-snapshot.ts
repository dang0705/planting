import { calculateCanonicalJsonSha256, serializeCanonicalJson, type CanonicalJsonObject, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { validateV1PackageAnswerMembership } from './validate-v1-package-answer-membership.js'

/** 一次问诊锁定的完整题包；来源发布准入由应用层先核验。 */
export interface QuestionPackageSnapshot {
  /** 当前快照结构版本，不是可配置的算法策略。 */
  readonly contractVersion: 'diagnosis-question-package-snapshot/v1'
  /** 应用层锁定的精确题包发布引用，不能从客户端题包采纳。 */
  readonly questionPackageReleaseRef: string
  /** 症状入口，不能作为最终园艺病因。 */
  readonly mode: 'yellow_leaf' | 'wilting_droop' | 'specific_pest_visual'
  /** 本次实际选出的题数，与完整题目数组相等。 */
  readonly questionCount: number
  /** 保留原题目、选项和所有元数据；数组顺序属于内容。 */
  readonly packageQuestions: readonly CanonicalJsonObject[]
}

/** 快照内容与完整规范摘要成对存储，读回必须重算。 */
export interface LockedQuestionPackageSnapshot {
  /** 已深拷贝并递归冻结的纯JSON内容。 */
  readonly snapshot: QuestionPackageSnapshot
  /** 整个快照的规范化SHA-256。 */
  readonly snapshotSha256: string
}

/** 递归冻结合法JSON树，防止调用方在异步存储期间改写。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) { freeze(child) }
    Object.freeze(value)
  }
}

/** 锁定已由受控上层取得的题包内容；本函数不宣称该来源已审核或发布。 */
export function lockQuestionPackageSnapshot(input: unknown): LockedQuestionPackageSnapshot {
  const copied = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue)) as Record<string, unknown>
  if (!copied || Array.isArray(copied) || typeof copied !== 'object'
    || typeof copied.questionPackageReleaseRef !== 'string' || copied.questionPackageReleaseRef.trim() !== copied.questionPackageReleaseRef
    || copied.questionPackageReleaseRef.length === 0 || [...copied.questionPackageReleaseRef].length > 64
    || (copied.contractVersion !== undefined && copied.contractVersion !== 'diagnosis-question-package-snapshot/v1')
    || Object.keys(copied).some(key => !['contractVersion','questionPackageReleaseRef','mode','questionCount','packageQuestions'].includes(key))) {
    throw new TypeError('题包快照引用或结构版本非法')
  }
  const questions = Array.isArray(copied.packageQuestions) ? copied.packageQuestions : []
  const probe = validateV1PackageAnswerMembership(copied, { requestMode:'answer_submit', answers:questions.map(question => ({
    questionKey: question?.questionKey, optionKey: question?.options?.[0]?.optionKey,
  })) })
  if (probe.status !== 'valid_membership' && probe.status !== 'not_answerable') { throw new TypeError('题包快照题目或选项结构非法') }
  const snapshot = { contractVersion:'diagnosis-question-package-snapshot/v1', questionPackageReleaseRef:copied.questionPackageReleaseRef,
    mode:copied.mode,questionCount:copied.questionCount,packageQuestions:copied.packageQuestions } as QuestionPackageSnapshot
  freeze(snapshot as unknown as CanonicalJsonValue)
  return Object.freeze({ snapshot, snapshotSha256:calculateCanonicalJsonSha256(snapshot as unknown as CanonicalJsonValue) })
}
