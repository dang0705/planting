import Ajv2020 from 'ajv/dist/2020.js'
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 原样被审候选组成的内部不可变发布包；不代表CMS验真或园艺语义批准。 */
export interface DiagnosisKnowledgeRelease {
  /** 只允许明确已冻结的发布包结构版本。 */ readonly schemaVersion: 'diagnosis-knowledge-release/v1'
  /** 本次发布的稳定引用，不从活动指针生成。 */ readonly releaseRef: string
  /** 与原候选完全一致的兼容包业务代码。 */ readonly bundleCode: string
  /** 同包受控发布版本，写入时还须保证递增。 */ readonly version: number
  /** 精确被审候选引用，不能替换为最新候选。 */ readonly candidateRef: string
  /** 原样完整候选内容规范化摘要，与审核关联。 */ readonly candidateContentSha256: string
  /** 内部审核凭据引用，不进入公开诊断响应。 */ readonly reviewRef: string
  /** 已由受控接线批准的审核交换协议版本。 */ readonly reviewProtocolVersion: string
  /** 服务器记录的首次发布时间，安全UTC毫秒。 */ readonly publishedAtMs: number
  /** 已通过受控候选Schema的原样完整正文。 */ readonly candidate: CanonicalJsonObject
}
/** 完整发布包与独立包摘要，避免把候选摘要混作发布摘要。 */
export interface LockedDiagnosisKnowledgeRelease {
  /** 已递归冻结的完整发布正文与审核出处。 */ readonly package: DiagnosisKnowledgeRelease
  /** 全包规范化SHA-256，包含版本与审核引用。 */ readonly packageSha256: string
}
/** 受控管理员发布命令；身份摘要必须先由CMS接入端验真，领域不猜协议。 */
export interface DiagnosisKnowledgePublicationCommand {
  /** 稳定幂等命令引用，同键异参必须拒绝。 */ readonly commandRef: string
  /** 服务端分配且本次固定的发布引用。 */ readonly releaseRef: string
  /** 精确候选所属兼容包的业务代码。 */ readonly bundleCode: string
  /** 同包发布版本，不能从最新指针隐式取得。 */ readonly version: number
  /** 精确被审候选引用，不接受自动选最新版。 */ readonly candidateRef: string
  /** 被批准内容的完整候选摘要，不能省略。 */ readonly candidateContentSha256: string
  /** 受控审核引用，用于串行化与撤销检查。 */ readonly reviewRef: string
  /** 明确批准的协议版本，没有环境默认值。 */ readonly reviewProtocolVersion: string
  /** 乐观并发比较旧版本，首次无指针为零。 */ readonly expectedPointerVersion: number
  /** 受控操作主体不可逆摘要，不能来自公开客户端。 */ readonly operatorRefHash: string
  /** 中文审计理由，遵循原有审计列宽。 */ readonly reasonZh: string
}
const text = (maxLength: number) => ({
  type: 'string',
  minLength: 1,
  maxLength,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$'
})
const uint = { type: 'integer', minimum: 0, maximum: 4294967295 },
  hash = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const common = {
  releaseRef: text(96),
  bundleCode: text(96),
  version: uint,
  candidateRef: text(96),
  candidateContentSha256: hash,
  reviewRef: text(96),
  reviewProtocolVersion: text(48)
}
const commandProperties = {
  commandRef: text(96),
  ...common,
  expectedPointerVersion: uint,
  operatorRefHash: hash,
  reasonZh: text(500)
}
const commandValidator = new Ajv2020({ strict: true }).compile({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(commandProperties),
  properties: commandProperties
})
/** 原样JSON锁定，拒绝undefined等非JSON输入，不允许异步期间修改命令。 */
function lockJson(input: unknown): CanonicalJsonObject {
  const value = JSON.parse(
    serializeCanonicalJson(input as CanonicalJsonValue)
  ) as CanonicalJsonObject
  function freeze(v: CanonicalJsonValue): void {
    if (v !== null && typeof v === 'object') {
      for (const child of Object.values(v)) {
        freeze(child)
      }
      Object.freeze(v)
    }
  }
  freeze(value)
  return value
}
/** 按冻结命令结构锁定输入；不设置默认版本、主体或协议。 */
export function lockDiagnosisPublicationCommand(
  input: unknown
): DiagnosisKnowledgePublicationCommand {
  const command = lockJson(input)
  if (!commandValidator(command)) {
    throw new TypeError('知识发布命令非法')
  }
  return command as unknown as DiagnosisKnowledgePublicationCommand
}
/** 使用受控原候选Schema创建发布包校验器，不从CMS正文或客户端取得Schema。 */
export function createDiagnosisKnowledgeReleaseLocker(candidateSchema: object) {
  const properties = {
    schemaVersion: { const: 'diagnosis-knowledge-release/v1' },
    ...common,
    publishedAtMs: { type: 'integer', minimum: 0, maximum: 8640000000000000 },
    candidate: candidateSchema
  }
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  })
  return (input: unknown): LockedDiagnosisKnowledgeRelease => {
    const value = lockJson(input)
    if (!validate(value)) {
      throw new TypeError('知识发布包结构非法')
    }
    const p = value as unknown as DiagnosisKnowledgeRelease
    if (
      p.candidate.bundleCode !== p.bundleCode ||
      calculateCanonicalJsonSha256(p.candidate) !== p.candidateContentSha256
    ) {
      throw new TypeError('知识发布包原样候选错配')
    }
    return Object.freeze({ package: p, packageSha256: calculateCanonicalJsonSha256(value) })
  }
}
/** 并发版本或唯一键冲突必须回滚全部写入，不能提交部分发布。 */
export class DiagnosisKnowledgePublicationConflictError extends Error {
  constructor() {
    super('知识发布命令或指针版本冲突')
    this.name = 'DiagnosisKnowledgePublicationConflictError'
  }
}
