import Ajv2020 from 'ajv/dist/2020.js'
import candidateSchema from '../../../../docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'
import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
/** 已发布条件，不从模型自由文字推导任何代码。 */
export interface OutcomeEvidenceCondition {
  /** 知识包内可追溯条件代码。 */ readonly evidenceCode: string
  /** 受控观察归一代码。 */ readonly findingCode: string
  /** 唯一允许的事实来源类别。 */ readonly sourceKind:
    | 'answer'
    | 'visual'
    | 'environment'
    | 'care_fact'
  /** 允许的部位范围，空集合不限制。 */ readonly affectedPartCodes: readonly string[]
}
/** 已锁定知识包中的三类证据门，支持条件不替代必需条件。 */
export interface OutcomeEvidenceRules {
  /** 全部须满足的独立条件。 */ readonly required: readonly OutcomeEvidenceCondition[]
  /** 可解释支持但不授予确诊资格。 */ readonly supporting: readonly OutcomeEvidenceCondition[]
  /** 存在命中即保留冲突，不以分数抵消。 */ readonly opposing: readonly OutcomeEvidenceCondition[]
}
/** 领域读取/归一后已接纳的观察；本匹配器不验证其归属或新鲜度。 */
export interface AcceptedDiagnosisFinding {
  /** 快照中的稳定证据引用，不使用数据库内部键。 */ readonly evidenceRef: string
  /** 已由受控归一端口确定的观察代码。 */ readonly findingCode: string
  /** 真实事实来源，不能由模型自报替代。 */ readonly sourceKind: OutcomeEvidenceCondition['sourceKind']
  /** 观察实际覆盖部位，不从表土推断根区。 */ readonly affectedPartCodes: readonly string[]
}
/** 条件命中轨迹，只携带引用，不复制私有原文。 */
export interface OutcomeConditionMatch {
  /** 原条件代码，保留知识规则顺序。 */ readonly evidenceCode: string
  /** 匹配引用去重并按稳定字典序输出。 */ readonly evidenceRefs: readonly string[]
}
/** 确定性证据门结果，不是最终诊断、严重度或行动。 */
export interface OutcomeEvidenceMatch {
  /** 反驳优先，其次缺必需证据，满足仍不自动选择Outcome。 */ readonly status:
    | 'conflicting_evidence'
    | 'insufficient_evidence'
    | 'requirements_met'
  /** 每条必需条件与实际命中引用。 */ readonly required: readonly OutcomeConditionMatch[]
  /** 仅记录支持命中，不增加置信百分比。 */ readonly supporting: readonly OutcomeConditionMatch[]
  /** 反驳条件与实际命中引用。 */ readonly opposing: readonly OutcomeConditionMatch[]
  /** 仍缺必需观察的原条件代码。 */ readonly missingRequiredCodes: readonly string[]
}
const ajv = new Ajv2020({ strict: true, allErrors: true })
ajv.addSchema(candidateSchema)
const base = candidateSchema.$id,
  validateRules = ajv.compile<OutcomeEvidenceRules>({ $ref: `${base}#/$defs/evidenceRules` })
const validateFindings = ajv.compile<readonly AcceptedDiagnosisFinding[]>({
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['evidenceRef', 'findingCode', 'sourceKind', 'affectedPartCodes'],
    properties: {
      evidenceRef: { type: 'string', minLength: 1, pattern: '\\S' },
      findingCode: { $ref: `${base}#/$defs/code` },
      sourceKind: { $ref: `${base}#/$defs/evidenceCondition/properties/sourceKind` },
      affectedPartCodes: { type: 'array', items: { $ref: `${base}#/$defs/code` } }
    }
  }
})
/** 规范JSON副本拒绝非JSON值，不对调用方数组排序或写入。 */
function json(input: unknown): unknown {
  return JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue))
}
/** 逐字代码与来源匹配，限定部位只认交集；没有观察不表示观察为阴性。 */
export function matchOutcomeEvidence(
  ruleInput: unknown,
  findingInput: unknown
): OutcomeEvidenceMatch {
  const rules = json(ruleInput),
    findings = json(findingInput)
  if (!validateRules(rules) || !validateFindings(findings)) {
    throw new TypeError('结论条件或归一观察非法')
  }
  for (const list of [rules.required, rules.supporting, rules.opposing]) {
    if (new Set(list.map(c => c.evidenceCode)).size !== list.length) {
      throw new TypeError('同类证据条件代码重复')
    }
  }
  const match = (conditions: readonly OutcomeEvidenceCondition[]): OutcomeConditionMatch[] =>
    conditions.map(c => ({
      evidenceCode: c.evidenceCode,
      evidenceRefs: [
        ...new Set(
          findings
            .filter(
              f =>
                f.findingCode === c.findingCode &&
                f.sourceKind === c.sourceKind &&
                (c.affectedPartCodes.length === 0 ||
                  f.affectedPartCodes.some(part => c.affectedPartCodes.includes(part)))
            )
            .map(f => f.evidenceRef)
        )
      ].sort()
    }))
  const required = match(rules.required),
    supporting = match(rules.supporting),
    opposing = match(rules.opposing),
    missingRequiredCodes = required.filter(c => !c.evidenceRefs.length).map(c => c.evidenceCode)
  return {
    status: opposing.some(c => c.evidenceRefs.length)
      ? 'conflicting_evidence'
      : missingRequiredCodes.length
        ? 'insufficient_evidence'
        : 'requirements_met',
    required,
    supporting,
    opposing,
    missingRequiredCodes
  }
}
