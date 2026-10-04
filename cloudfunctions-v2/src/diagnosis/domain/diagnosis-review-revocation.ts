import Ajv2020 from 'ajv/dist/2020.js'
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 精确批准撤销命令，管理员及协议由受控上游验证，不能直接接受公开用户输入。 */
export interface DiagnosisReviewRevocationCommand {
  /** 独立幂等撤销引用，不是发布命令引用。 */ readonly revocationRef: string
  /** 既有批准的精确引用。 */ readonly reviewRef: string
  /** 被审原样内容摘要，防止撤错修订。 */ readonly contentSha256: string
  /** 上游明确批准的审核协议，没有默认值。 */ readonly reviewProtocolVersion: string
  /** 已验证管理员不可逆摘要。 */ readonly operatorRefHash: string
  /** 独立审计中文理由，不进入公开响应。 */ readonly reasonZh: string
  /** 受控证据引用；没有时必须显式null。 */ readonly reviewEvidenceRef: string | null
}
/** 锁定撤销命令和完整请求摘要，服务器时间不参与重复比较。 */
export interface LockedDiagnosisReviewRevocation {
  /** 不允许异步执行期间修改命令。 */ readonly command: DiagnosisReviewRevocationCommand
  /** 完整命令规范化SHA-256。 */ readonly requestSha256: string
}
const text = (maxLength?: number) => ({
  type: 'string',
  minLength: 1,
  ...(maxLength ? { maxLength } : {}),
  pattern: '^\\S(?:[\\s\\S]*\\S)?$'
})
const properties = {
  revocationRef: text(96),
  reviewRef: text(96),
  contentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  reviewProtocolVersion: text(48),
  operatorRefHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  reasonZh: text(),
  reviewEvidenceRef: { anyOf: [text(191), { type: 'null' }] }
}
const validate = new Ajv2020({ strict: true }).compile<DiagnosisReviewRevocationCommand>({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties
})
/** 010的TEXT容量属于数据库物理限制，不能通过截断用户理由满足。 */
export function lockDiagnosisReviewRevocation(input: unknown): LockedDiagnosisReviewRevocation {
  const value: unknown = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue))
  if (
    !validate(value) ||
    Buffer.byteLength((value as DiagnosisReviewRevocationCommand).reasonZh, 'utf8') > 65535
  ) {
    throw new TypeError('审核撤销命令非法')
  }
  const command = Object.freeze(value as DiagnosisReviewRevocationCommand)
  return Object.freeze({
    command,
    requestSha256: calculateCanonicalJsonSha256(command as unknown as CanonicalJsonValue)
  })
}
/** 唯一目标或同引用异参冲突必须使事务回滚。 */
export class DiagnosisReviewRevocationConflictError extends Error {
  constructor() {
    super('审核撤销引用或目标冲突')
    this.name = 'DiagnosisReviewRevocationConflictError'
  }
}
