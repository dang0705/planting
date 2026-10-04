import Ajv2020 from 'ajv/dist/2020.js'
import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 上游已验真管理员与协议的内部命令，禁止直接承接公共客户端输入。 */
export interface DiagnosisReviewRecordCommand {
  /** 本次人工审核的稳定幂等引用。 */ readonly reviewRef: string
  /** 人工审核绑定的精确候选修订引用。 */ readonly candidateRef: string
  /** 人工审核绑定的完整候选正文摘要。 */ readonly contentSha256: string
  /** 明确人工决定，不接受模型自动批准。 */ readonly decision: 'approved' | 'rejected'
  /** 上游已验真管理员主体的不可逆摘要。 */ readonly reviewerRefHash: string
  /** 上游明确批准的交换协议，不提供默认值。 */ readonly reviewProtocolVersion: string
}
/** 引用异参或候选竞争审核需要回滚后精确对账。 */
export class DiagnosisReviewRecordConflictError extends Error {
  constructor() {
    super('诊断人工审核记录冲突')
    this.name = 'DiagnosisReviewRecordConflictError'
  }
}
const text = (maxLength: number) => ({
  type: 'string',
  minLength: 1,
  maxLength,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$'
})
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const properties = {
  reviewRef: text(96),
  candidateRef: text(96),
  contentSha256: hash,
  decision: { enum: ['approved', 'rejected'] },
  reviewerRefHash: hash,
  reviewProtocolVersion: text(48)
}
const validate = new Ajv2020({ strict: true }).compile<DiagnosisReviewRecordCommand>({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties
})
/** 第一项异步操作前复制锁定；结构校验不能代替 CMS 管理员及协议准入。 */
export function lockDiagnosisReviewRecord(input: unknown): DiagnosisReviewRecordCommand {
  const value: unknown = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue))
  if (!validate(value)) {
    throw new TypeError('人工审核命令非法')
  }
  return Object.freeze(value)
}
