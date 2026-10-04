import Ajv2020 from 'ajv/dist/2020.js'
import schema from '../../../../docs/backend-v2/contracts/schemas/diagnosis-model-output.v1.schema.json'
import {
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 复用唯一已确认Schema，不制造第二份结构合同或阈值。 */
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema)
/** 合同有效仅表示可供内部归约，不授予事实、可信档位或行动执行权。 */
export type DiagnosisModelOutputValidation =
  | {
      /** 输出结构或局部证据引用不满足已确认合同，禁止进入后续归约。 */
      readonly status: 'invalid'
    }
  | {
      /** 已通过结构与局部证据引用核验。 */ readonly status: 'valid'
      /** 独立、深度冻结的结构化副本。 */ readonly output: CanonicalJsonObject
    }
/** 副本内的所有节点不可被后续异步调用改写。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
}
/** 视觉读取使用严格合同并核验引用闭合；不将模型局部键当成已确认观察。 */
export function validateDiagnosisModelOutput(value: unknown): DiagnosisModelOutputValidation {
  if (!validate(value)) {
    return { status: 'invalid' }
  }
  try {
    const copied = JSON.parse(
      serializeCanonicalJson(value as unknown as CanonicalJsonValue)
    ) as CanonicalJsonObject
    const evidence = copied.evidence as readonly CanonicalJsonObject[]
    const candidates = copied.conclusionCandidates as readonly CanonicalJsonObject[]
    const keys = new Set(evidence.map(e => e.evidenceKey))
    if (
      keys.size !== evidence.length ||
      new Set(candidates.map(c => c.candidateKey)).size !== candidates.length ||
      !evidence.some(e => e.source === 'visual') ||
      candidates.some(c =>
        (c.supportingEvidenceKeys as readonly string[]).some(key => !keys.has(key))
      )
    ) {
      return { status: 'invalid' }
    }
    freeze(copied)
    return { status: 'valid', output: copied }
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof RangeError) {
      return { status: 'invalid' }
    }
    throw error
  }
}
