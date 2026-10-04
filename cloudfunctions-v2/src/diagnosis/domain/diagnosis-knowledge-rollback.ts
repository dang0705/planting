import Ajv2020 from 'ajv/dist/2020.js'
import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 受控管理员显式回滚命令，不能隐式选择最新知识或默认协议。 */
export interface DiagnosisKnowledgeRollbackCommand {
  /** 与发布共用原激活审计幂等命令空间。 */ readonly commandRef: string
  /** 回滚兼容包范围，必须与目标及当前指针一致。 */ readonly bundleCode: string
  /** 要回到的精确旧发布引用。 */ readonly targetReleaseRef: string
  /** 原样旧包完整规范化摘要。 */ readonly targetPackageSha256: string
  /** 上游已批准的审核协议，不设默认。 */ readonly reviewProtocolVersion: string
  /** 调用方最后确认的活动指针版本。 */ readonly expectedPointerVersion: number
  /** 已验证操作主体不可逆摘要。 */ readonly operatorRefHash: string
  /** 内部审计中文理由，遵循009列宽。 */ readonly reasonZh: string
}
const text = (maxLength: number) => ({
  type: 'string',
  minLength: 1,
  maxLength,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$'
})
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' },
  properties = {
    commandRef: text(96),
    bundleCode: text(96),
    targetReleaseRef: text(96),
    targetPackageSha256: hash,
    reviewProtocolVersion: text(48),
    expectedPointerVersion: { type: 'integer', minimum: 0, maximum: 4294967294 },
    operatorRefHash: hash,
    reasonZh: text(500)
  }
const validate = new Ajv2020({ strict: true }).compile<DiagnosisKnowledgeRollbackCommand>({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties
})
/** 拒绝额外字段及错误引用；冻结平面命令避免异步期间篡改。 */
export function lockDiagnosisRollbackCommand(input: unknown): DiagnosisKnowledgeRollbackCommand {
  const value: unknown = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue))
  if (!validate(value)) {
    throw new TypeError('知识回滚命令非法')
  }
  return Object.freeze(value)
}
