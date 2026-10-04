import Ajv2020 from 'ajv/dist/2020.js'
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 引用或包修订唯一键冲突，必须回滚后只读核对，不自动重写。 */
export class DiagnosisCandidateSubmissionConflictError extends Error {
  constructor() {
    super('诊断候选提交冲突')
    this.name = 'DiagnosisCandidateSubmissionConflictError'
  }
}
/** 内部提交的完整不可变内容；不是审核或发布凭证。 */
export interface LockedDiagnosisCandidateSubmission {
  /** 调用方明确选择的新候选修订引用。 */ readonly candidateRef: string
  /** 原样完整候选的规范化 JSON 内容摘要。 */ readonly contentSha256: string
  /** 已按受控 Schema 验证并递归冻结的完整正文。 */ readonly candidate: CanonicalJsonObject
}
/** 只对纯 JSON 树冻结，不默默转换未知对象。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freeze(child)
    }
    Object.freeze(value)
  }
}
/** 在第一次异步操作前锁定提交，Schema 只能来自服务端接线。 */
export function createLockDiagnosisCandidateSubmission(candidateSchema: object) {
  const ajv = new Ajv2020({ strict: true }),
    validateCandidate = ajv.compile(candidateSchema)
  const validateEnvelope = ajv.compile<{ candidateRef: string; candidate: CanonicalJsonObject }>({
    type: 'object',
    additionalProperties: false,
    required: ['candidateRef', 'candidate'],
    properties: {
      candidateRef: {
        type: 'string',
        minLength: 1,
        maxLength: 96,
        pattern: '^\\S(?:[\\s\\S]*\\S)?$'
      },
      candidate: { type: 'object' }
    }
  })
  return (input: unknown): LockedDiagnosisCandidateSubmission => {
    const copy: unknown = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue))
    if (!validateEnvelope(copy) || !validateCandidate(copy.candidate)) {
      throw new TypeError('诊断候选提交结构非法')
    }
    freeze(copy.candidate)
    return Object.freeze({
      candidateRef: copy.candidateRef,
      contentSha256: calculateCanonicalJsonSha256(copy.candidate),
      candidate: copy.candidate
    })
  }
}
