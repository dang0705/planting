import type { DiagnosisReplayRecord } from './diagnosis-replay-types.js'
import {
  diagnosisReplayInputSchema,
  diagnosisDecisionTraceSchema
} from './diagnosis-replay-schema.js'
import { validateDiagnosisReplay } from './validate-diagnosis-replay.js'
import Ajv2020 from 'ajv/dist/2020.js'
import publicSchema from '../../../../docs/backend-v2/contracts/schemas/diagnosis-result.v1.schema.json'
import {
  serializeCanonicalJson,
  calculateCanonicalJsonSha256,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import { lockQuestionPackageSnapshot } from './question-package-snapshot.js'
import { validateDiagnosisModelBinding } from './diagnosis-model-binding.js'

/** 完整结果的内部回放记录，不是客户端DTO或已审核知识凭证。 */
export interface DiagnosisResultRecord {
  /** 当前存储结构常量，不能以运行开关替换历史版本。 */ readonly contractVersion: 'diagnosis-result-record/v1'
  /** 唯一允许对外投影的严格公开结果。 */ readonly publicResult: CanonicalJsonObject
  /** 原版本输入、来源和决策轨迹，只供受控回放。 */ readonly replay: DiagnosisReplayRecord
}
/** 结构锁定、完整正文与规范化摘要，存储不得自行改写其中字段。 */
export interface LockedDiagnosisResultRecord {
  /** 递归冻结后的原样JSON。 */ readonly record: DiagnosisResultRecord
  /** 包括公开结果和全部回放内容的SHA-256。 */ readonly recordSha256: string
}
const text = { type: 'string', minLength: 1, pattern: '\\S' } as const
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const
const replaySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'knowledgeReleaseRef',
    'knowledgePackageSha256',
    'questionPackage',
    'inputSnapshot',
    'decisionTrace',
    'ruleReleaseRef',
    'ruleReleaseSha256',
    'modelBinding'
  ],
  properties: {
    knowledgeReleaseRef: { ...text, maxLength: 96 },
    knowledgePackageSha256: hash,
    questionPackage: { type: 'object' },
    inputSnapshot: diagnosisReplayInputSchema,
    decisionTrace: diagnosisDecisionTraceSchema,
    ruleReleaseRef: text,
    ruleReleaseSha256: hash,
    modelBinding: { type: ['object', 'null'] }
  }
} as const
const ajv = new Ajv2020({ strict: true, allErrors: true })
const validatePublic = ajv.compile(publicSchema)
const validateRecord = ajv.compile({
  type: 'object',
  additionalProperties: false,
  required: ['contractVersion', 'publicResult', 'replay'],
  properties: {
    contractVersion: { const: 'diagnosis-result-record/v1' },
    publicResult: { type: 'object' },
    replay: replaySchema
  }
})
/** 原JSON树递归冻结；序列化前已拒绝Date、空洞及非有限数值。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) {
      freeze(v)
    }
    Object.freeze(value)
  }
}
/** 只核验结构与版本引用，不推断病因、不批准知识/Provider，不写任何业务事实。 */
export function lockDiagnosisResultRecord(input: unknown): LockedDiagnosisResultRecord {
  const record = JSON.parse(
    serializeCanonicalJson(input as CanonicalJsonValue)
  ) as DiagnosisResultRecord
  if (!validateRecord(record) || !validatePublic(record.publicResult)) {
    throw new TypeError('诊断结果记录结构不完整')
  }
  const replay = record.replay
  if (replay.modelBinding !== null && !validateDiagnosisModelBinding(replay.modelBinding)) {
    throw new TypeError('诊断结果模型版本不匹配')
  }
  const question = replay.questionPackage as unknown as CanonicalJsonObject
  const locked = lockQuestionPackageSnapshot(question.snapshot)
  if (locked.snapshotSha256 !== question.snapshotSha256 || Object.keys(question).length !== 2) {
    throw new TypeError('诊断结果题包快照不匹配')
  }
  if (!validateDiagnosisReplay(replay.inputSnapshot, replay.decisionTrace, record.publicResult)) {
    throw new TypeError('诊断回放证据、引用或安全门不一致')
  }
  const recordSha256 = calculateCanonicalJsonSha256(record as unknown as CanonicalJsonValue)
  freeze(record as unknown as CanonicalJsonValue)
  return Object.freeze({ record, recordSha256 })
}
