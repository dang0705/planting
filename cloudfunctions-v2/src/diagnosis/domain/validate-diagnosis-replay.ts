import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonObject
} from '../../foundation/json/canonical-json-sha256.js'
import type {
  DiagnosisReplayInput,
  DiagnosisDecisionTrace,
  ReplaySourceClaim
} from './diagnosis-replay-types.js'
/** 重复来源引用不可以覆盖或合并不同用途。 */
function distinctClaims(claims: readonly ReplaySourceClaim[]): boolean {
  return (
    new Set(claims.map(c => JSON.stringify([c.sourceCode, c.claimCode, c.revisionNo, c.linkRole])))
      .size === claims.length
  )
}
/** 仅核验引用闭合及与公开投影的一致性，不批准来源或执行知识规则。 */
export function validateDiagnosisReplay(
  input: DiagnosisReplayInput,
  trace: DiagnosisDecisionTrace,
  publicResult: CanonicalJsonObject
): boolean {
  const evidence = new Set<string>()
  for (const e of input.evidences) {
    if (
      evidence.has(e.evidenceRef) ||
      e.occurredAtMs > input.capturedAtMs ||
      calculateCanonicalJsonSha256(e.content) !== e.contentSha256
    ) {
      return false
    }
    evidence.add(e.evidenceRef)
  }
  const outcomes = new Map<string, string>()
  for (const o of trace.outcomes) {
    if (
      outcomes.has(o.outcomeCode) ||
      !distinctClaims(o.sourceClaimRefs) ||
      o.evidenceRefs.some(ref => !evidence.has(ref))
    ) {
      return false
    }
    outcomes.set(o.outcomeCode, o.disposition)
  }
  if (![...outcomes.values()].includes('selected')) {
    return false
  }
  const actions = new Set<string>(),
    mappings = new Set<string>(),
    indexes = new Set<number>()
  const publicActions = publicResult.recommendedActions as readonly CanonicalJsonObject[]
  for (const a of trace.actions) {
    if (
      actions.has(a.actionCode) ||
      mappings.has(a.mappingCode) ||
      !outcomes.has(a.outcomeCode) ||
      !distinctClaims(a.sourceClaimRefs) ||
      a.evidenceRefs.some(ref => !evidence.has(ref))
    ) {
      return false
    }
    actions.add(a.actionCode)
    mappings.add(a.mappingCode)
    const passed = Object.values(a.gates).every(g => g === 'pass')
    if (a.disposition === 'proposed') {
      if (
        !passed ||
        outcomes.get(a.outcomeCode) !== 'selected' ||
        a.publicActionIndex === null ||
        indexes.has(a.publicActionIndex) ||
        !publicActions[a.publicActionIndex]
      ) {
        return false
      }
      if (
        publicActions[a.publicActionIndex]!.riskLevel === 'high' &&
        !a.sourceClaimRefs.some(c => c.linkRole === 'safety')
      ) {
        return false
      }
      indexes.add(a.publicActionIndex)
    } else if (passed || a.publicActionIndex !== null) {
      return false
    }
  }
  if (indexes.size !== publicActions.length) {
    return false
  }
  for (const [key, level, reason] of [
    ['certainty', 'certaintyLevel', 'certaintyReasonZh'],
    ['severity', 'severityLevel', 'severityReasonZh'],
    ['urgency', 'urgencyLevel', 'urgencyReasonZh'],
    ['isolation', 'isolationDecision', 'isolationReasonZh']
  ] as const) {
    const assessment = trace.assessment[key]
    if (assessment.value !== publicResult[level] || assessment.reasonZh !== publicResult[reason]) {
      return false
    }
  }
  return true
}
