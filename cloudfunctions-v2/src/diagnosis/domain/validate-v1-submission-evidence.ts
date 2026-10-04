import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { normalizeV1TimelineEvidence, type TimelineAnswerEvidence } from './normalize-v1-timeline-evidence.js'
import { validateV1AirAnswerEvidence, type AirAnswerEvidence } from './validate-v1-air-answer-evidence.js'
import { validateV1PackageAnswerMembership, type AuthorizedPackageAnswer } from './validate-v1-package-answer-membership.js'

/** 证据准入不是事务提交、诊断知识准入或实际行为事实。 */
export type SubmissionEvidenceValidation = {
  /** 失败阶段明确分开，不把部分通过当作提交成功。 */
  readonly status: 'invalid_snapshot' | 'invalid_answers' | 'not_answerable' | 'invalid_air_evidence' | 'invalid_timeline_evidence'
} | {
  /** 服务端题包的成员与所有要求的复合证据通过。 */
  readonly status: 'valid_submission_evidence'
  /** 已授权且按服务端题目顺序冻结的答案。 */
  readonly answers: readonly AuthorizedPackageAnswer[]
  /** 已校验空气复合证据；申报来源仍待上层核验。 */
  readonly airByQuestionId: Readonly<Record<string, AirAnswerEvidence>>
  /** 明确时间线证据；普通选项或未知答案不产生时间线。 */
  readonly timeline: TimelineAnswerEvidence | null
}

/**
 * 将独立证据校验接为整包准入，供归属已核验的应用用例消费。
 * 不接受客户端题包，不写结果、奖励或care事实；空题虫害仍交直判流程。
 */
export function validateV1SubmissionEvidence(serverSnapshot: unknown, submitted: unknown): SubmissionEvidenceValidation {
  const membership = validateV1PackageAnswerMembership(serverSnapshot, submitted)
  if (membership.status !== 'valid_membership') { return { status: membership.status } }
  const air = validateV1AirAnswerEvidence(serverSnapshot, submitted)
  if (air.status !== 'valid_air_evidence') { return { status: air.status } }
  const payload = submitted as Record<string, unknown>
  const hasCamel = Object.hasOwn(payload, 'careBehaviorTimeline')
  const hasSnake = Object.hasOwn(payload, 'care_behavior_timeline')
  let timeline: TimelineAnswerEvidence | null = null
  if (membership.requiredEvidenceKinds.includes('care_behavior_timeline')) {
    timeline = normalizeV1TimelineEvidence(hasCamel ? payload.careBehaviorTimeline : payload.care_behavior_timeline)
    if (!timeline) { return { status: 'invalid_timeline_evidence' } }
    if (hasCamel && hasSnake) {
      const other = normalizeV1TimelineEvidence(payload.care_behavior_timeline)
      if (!other || serializeCanonicalJson(timeline as unknown as CanonicalJsonValue) !== serializeCanonicalJson(other as unknown as CanonicalJsonValue)) {
        return { status: 'invalid_timeline_evidence' }
      }
    }
  } else if (hasCamel || hasSnake) { return { status: 'invalid_timeline_evidence' } }
  return Object.freeze({ status: 'valid_submission_evidence', answers: membership.answers, airByQuestionId: air.byQuestionId, timeline })
}
