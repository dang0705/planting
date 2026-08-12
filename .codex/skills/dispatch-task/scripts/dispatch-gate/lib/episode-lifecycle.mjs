import crypto from 'node:crypto'
import {
  appendTrace,
  COMPLETION_READY_STAGE,
  continuationDefaults,
  LIFECYCLE_STAGES,
  now,
  readEpisodeById,
  requireActiveEpisode,
  withActiveEpisode,
  writeEpisode
} from './episode-store.mjs'

const stageSet = new Set(LIFECYCLE_STAGES)
const secret =
  'dispatch-task:completion-ready:authorization:v1:8f3a9c1e-7b24-4d2e-9f6a-3c1d8e5b7a92'
const validStage = stage => stageSet.has(stage)

function transition(input, next, allowed) {
  const target = requireActiveEpisode(input)
  if (!target.episode || !target.episode.status || target.episode.status !== 'active')
    return {
      blocked: true,
      result: { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
    }
  if (!validStage(target.episode.lifecycleStage) || !allowed.has(target.episode.lifecycleStage))
    return {
      blocked: true,
      result: {
        status: 'blocked',
        reason: validStage(target.episode.lifecycleStage)
          ? 'lifecycle_stage_transition_not_allowed'
          : 'lifecycle_stage_missing_or_invalid',
        from_stage: target.episode.lifecycleStage ?? null,
        to_stage: next,
        allowed_from: [...allowed]
      }
    }
  return { blocked: false, target }
}

export function issueCompletionReadyAuthorization({
  dispatchRunId,
  handoffFile,
  implementationResultFile,
  postflightReportFile,
  runtimeQaEvidenceFile = null
} = {}) {
  const payload = {
    dispatch_run_id: String(dispatchRunId ?? ''),
    handoff_file: String(handoffFile ?? ''),
    implementation_result_file: String(implementationResultFile ?? ''),
    postflight_report_file: String(postflightReportFile ?? ''),
    runtime_qa_evidence_file: String(runtimeQaEvidenceFile ?? '')
  }
  return {
    authorized_by: 'validate-completion-readiness',
    payload,
    hmac: crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex'),
    issued_at: now()
  }
}

function validAuthorization(proof, runId) {
  if (
    !proof ||
    proof.authorized_by !== 'validate-completion-readiness' ||
    proof?.payload?.dispatch_run_id !== String(runId ?? '')
  )
    return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(proof.payload))
    .digest('hex')
  return (
    Buffer.from(String(proof.hmac ?? '')).length === Buffer.from(expected).length &&
    crypto.timingSafeEqual(Buffer.from(String(proof.hmac ?? '')), Buffer.from(expected))
  )
}

export function migrateLegacyEpisodeLifecycle(input) {
  const target = requireActiveEpisode(input)
  if (!target.episode || target.episode.status !== 'active')
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  if (validStage(target.episode.lifecycleStage))
    return {
      status: 'already_migrated',
      episode: target.episode,
      lifecycle_stage: target.episode.lifecycleStage
    }
  return withActiveEpisode(input, current => {
    if (validStage(current.lifecycleStage))
      return {
        status: 'already_migrated',
        episode: current,
        lifecycle_stage: current.lifecycleStage
      }
    if (
      current.continuation?.providerDelivered ||
      current.continuation?.recoveryRequired ||
      current.continuation?.completionReadyAt
    )
      return {
        status: 'blocked',
        reason: 'legacy_episode_has_partial_continuation_requires_manual_review',
        episode: current
      }
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'implementation_running',
        continuation: continuationDefaults()
      },
      { event: 'episode_legacy_lifecycle_migration', from: 'missing', to: 'implementation_running' }
    )
    writeEpisode(next)
    return { status: 'migrated', episode: next, lifecycle_stage: next.lifecycleStage }
  })
}

export function recordProviderDelivered(input) {
  const gate = transition(input, 'provider_delivered', new Set(['implementation_running']))
  if (gate.blocked) return gate.result
  return withActiveEpisode(input, current => {
    if (current.lifecycleStage !== 'implementation_running')
      return { status: 'blocked', reason: 'lifecycle_stage_transition_not_allowed' }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'provider_delivered',
        continuation: {
          ...current.continuation,
          providerDelivered: true,
          providerDeliveredAt: at,
          providerOutcome: input.providerOutcome ?? 'delivered',
          recoveryRequired: true,
          recoveryEvidence: input.evidence ?? null
        }
      },
      {
        event: 'episode_provider_delivered',
        provider_outcome: input.providerOutcome ?? 'delivered',
        recovery_required: true
      }
    )
    writeEpisode(next)
    return { status: 'provider_delivered', episode: next }
  })
}

export function startRecovery(input) {
  const gate = transition(input, 'recovery_in_progress', new Set(['provider_delivered']))
  if (gate.blocked) return gate.result
  return withActiveEpisode(input, current => {
    if (current.lifecycleStage !== 'provider_delivered')
      return { status: 'blocked', reason: 'lifecycle_stage_transition_not_allowed' }
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'recovery_in_progress',
        continuation: {
          ...current.continuation,
          recoveryStartedAt: now(),
          recoveryMode: input.recoveryMode ?? 'codex_main_recovery'
        }
      },
      {
        event: 'episode_recovery_started',
        recovery_mode: input.recoveryMode ?? 'codex_main_recovery'
      }
    )
    writeEpisode(next)
    return { status: 'recovery_in_progress', episode: next }
  })
}

export function recordReviewPassed(input) {
  const gate = transition(
    input,
    'review_passed',
    new Set(['recovery_in_progress', 'review_passed'])
  )
  if (gate.blocked) return gate.result
  return withActiveEpisode(input, current => {
    if (!['recovery_in_progress', 'review_passed'].includes(current.lifecycleStage))
      return { status: 'blocked', reason: 'lifecycle_stage_transition_not_allowed' }
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'review_passed',
        reviewStatus: 'passed',
        continuation: {
          ...current.continuation,
          reviewPassedAt: now(),
          reviewSummary: input.reviewSummary ?? ''
        }
      },
      { event: 'episode_review_passed', review_summary: input.reviewSummary ?? '' }
    )
    writeEpisode(next)
    return { status: 'review_passed', episode: next }
  })
}

const stageForQaStatus = status =>
  ({ passed: 'qa_passed', not_required: 'qa_not_required', failed: 'qa_failed' })[status] ?? null
export function recordQaOutcome(input) {
  const nextStage = stageForQaStatus(input.qaStatus)
  if (!nextStage)
    return {
      status: 'blocked',
      reason: 'qa_status_must_be_passed|not_required|failed',
      qa_status: input.qaStatus
    }
  const gate = transition(
    input,
    nextStage,
    new Set(['review_passed', 'qa_passed', 'qa_not_required', 'qa_failed'])
  )
  if (gate.blocked) return gate.result
  return withActiveEpisode(input, current => {
    if (
      !['review_passed', 'qa_passed', 'qa_not_required', 'qa_failed'].includes(
        current.lifecycleStage
      )
    )
      return { status: 'blocked', reason: 'lifecycle_stage_transition_not_allowed' }
    if (current.lifecycleStage === 'qa_failed' && nextStage !== 'qa_failed')
      return { status: 'blocked', reason: 'qa_failed_requires_new_recovery' }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: nextStage,
        qaStatus: input.qaStatus,
        continuation: {
          ...current.continuation,
          qaOutcome: input.qaStatus,
          qaRecordedAt: at,
          qaEvidence: input.qaEvidence ?? null
        }
      },
      { event: 'episode_qa_outcome_recorded', qa_status: input.qaStatus, qa_stage: nextStage }
    )
    writeEpisode(next)
    return { status: nextStage, episode: next }
  })
}

export function markCompletionReady(input) {
  if (!validAuthorization(input.authorizationProof, input.dispatchRunId))
    return {
      status: 'blocked',
      reason: 'completion_ready_requires_valid_authorization_proof',
      authorization_reason: 'authorization_proof_invalid'
    }
  const gate = transition(
    input,
    COMPLETION_READY_STAGE,
    new Set(['qa_passed', 'qa_not_required', COMPLETION_READY_STAGE])
  )
  if (gate.blocked) return gate.result
  return withActiveEpisode(input, current => {
    if (!['qa_passed', 'qa_not_required', COMPLETION_READY_STAGE].includes(current.lifecycleStage))
      return { status: 'blocked', reason: 'lifecycle_stage_transition_not_allowed' }
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: COMPLETION_READY_STAGE,
        continuation: {
          ...current.continuation,
          completionReadyAt: now(),
          completionReadyAuthorizedBy: 'validate-completion-readiness',
          completionReadyAuthorization: input.authorizationProof
        }
      },
      {
        event: 'episode_completion_ready',
        authorized_by: 'validate-completion-readiness',
        authorization_verified: true,
        authorized_handoff: input.authorizationProof.payload.handoff_file,
        authorized_result: input.authorizationProof.payload.implementation_result_file
      }
    )
    writeEpisode(next)
    return { status: 'completion_ready', episode: next }
  })
}
