/** 回放结构字段属于合同常量，无运营开关或经验阈值。 */
const text = { type: 'string', minLength: 1, pattern: '\\S' } as const
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const
const time = { type: 'integer', minimum: 0, maximum: 8_640_000_000_000_000 } as const
/** 严格对象：声明字段全部必填，不允许原始提示词或其他额外成员。 */
function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  }
}
const claims = {
  type: 'array',
  minItems: 1,
  items: object({
    sourceCode: text,
    claimCode: text,
    revisionNo: { type: 'integer', minimum: 0, maximum: 4_294_967_295 },
    linkRole: { enum: ['support', 'oppose', 'limit', 'safety'] }
  })
} as const
const evidenceRefs = { type: 'array', uniqueItems: true, items: text } as const
const gates = { enum: ['pass', 'block', 'insufficient_evidence'] } as const
/** 当次输入合同，证据内容所属Schema必须由上游领域另外核验。 */
export const diagnosisReplayInputSchema = object({
  contractVersion: { const: 'diagnosis-replay-input/v1' },
  plantIdentityRef: { anyOf: [text, { type: 'null' }] },
  capturedAtMs: time,
  evidences: {
    type: 'array',
    minItems: 1,
    items: object({
      evidenceRef: text,
      kind: { enum: ['answer', 'visual', 'care_fact', 'environment'] },
      schemaVersion: text,
      occurredAtMs: time,
      content: { type: 'object', minProperties: 1 },
      contentSha256: hash
    })
  }
})
/** 独立档位及理由，不允许百分比代替定性结论。 */
function assessment(values: readonly string[]) {
  return object({ value: { enum: values }, reasonZh: text })
}
/** 当次结论、行动与四个安全门的结构合同。 */
export const diagnosisDecisionTraceSchema = object({
  contractVersion: { const: 'diagnosis-decision-trace/v1' },
  outcomes: {
    type: 'array',
    minItems: 1,
    items: object({
      outcomeCode: text,
      causeCode: text,
      disposition: { enum: ['selected', 'alternative', 'excluded'] },
      reasonZh: text,
      evidenceRefs,
      sourceClaimRefs: claims
    })
  },
  actions: {
    type: 'array',
    items: object({
      actionCode: text,
      mappingCode: text,
      outcomeCode: text,
      disposition: { enum: ['proposed', 'withheld'] },
      reasonZh: text,
      evidenceRefs,
      sourceClaimRefs: claims,
      gates: object({
        applicability: gates,
        evidence: gates,
        contraindications: gates,
        risk: gates
      }),
      publicActionIndex: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] }
    })
  },
  assessment: object({
    certainty: assessment(['likely', 'possible', 'unconfirmed']),
    severity: assessment(['low', 'medium', 'high', 'unknown']),
    urgency: assessment(['immediate', 'soon', 'monitor', 'unknown']),
    isolation: assessment(['required', 'not_required', 'undetermined'])
  })
})
