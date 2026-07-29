import crypto from 'node:crypto'
import path from 'node:path'
import {
  dispatchRoot,
  findHandoff,
  readJson,
  repoRoot,
  withRunLock,
  writeJsonAtomic
} from './state.mjs'
import { mergeRuntimeMetadata, metadataFrom } from './episode-metadata.mjs'
import { auditEpisodeTraceRecord, renderEpisodeStatusRecord } from './episode-reporting.mjs'

const episodesRoot = path.join(dispatchRoot, 'episodes')
const episodeIndexFile = path.join(episodesRoot, 'index.json')
const terminalStatuses = new Set(['completed', 'blocked', 'aborted', 'cancelled'])
const legalEarlyCheckReasons = new Set(['terminal', 'user_scope_change', 'true_blocker'])
const MAX_REWORK_BATCHES = 1

// Continuation contract: provider delivery must never finish an active episode.
// completion_ready is the only gate that authorizes finishEpisode(completed), and it
// can only be recorded by a successful validate-completion-readiness run.
const LIFECYCLE_STAGES = [
  'implementation_running',
  'provider_delivered',
  'recovery_in_progress',
  'review_passed',
  'qa_passed',
  'qa_not_required',
  'completion_ready'
]
const lifecycleStageOrder = new Map(LIFECYCLE_STAGES.map((stage, index) => [stage, index]))
const COMPLETION_READY_STAGE = 'completion_ready'
const qaOutcomeStage = (qaStatus) =>
  qaStatus === 'not_required' ? 'qa_not_required' : 'qa_passed'

function isValidLifecycleStage(stage) {
  return lifecycleStageOrder.has(stage)
}

function lifecycleStageAtLeast(episode, stage) {
  const current = episode?.lifecycleStage
  if (!isValidLifecycleStage(current) || !isValidLifecycleStage(stage)) {
    return false
  }
  return lifecycleStageOrder.get(current) >= lifecycleStageOrder.get(stage)
}

// --- completion_ready authorization boundary ---
// completion_ready is the only state that authorizes finishEpisode(completed).
// It must be recorded exclusively by a successful validate-completion-readiness
// run, never by a public CLI action, chat, manual or provider self-claim. The
// validator produces an authorization proof (issueCompletionReadyAuthorization)
// that markCompletionReady verifies (verifyCompletionReadyAuthorization) before
// applying the transition. A CLI caller cannot construct a valid proof without
// the shared secret, so the public mark-completion-ready CLI action is rejected.
const COMPLETION_READY_AUTH_SECRET =
  'dispatch-task:completion-ready:authorization:v1:8f3a9c1e-7b24-4d2e-9f6a-3c1d8e5b7a92'

export function issueCompletionReadyAuthorization({
  dispatchRunId,
  handoffFile,
  implementationResultFile,
  postflightReportFile,
  runtimeQaEvidenceFile = null
}) {
  const payload = {
    dispatch_run_id: String(dispatchRunId ?? ''),
    handoff_file: String(handoffFile ?? ''),
    implementation_result_file: String(implementationResultFile ?? ''),
    postflight_report_file: String(postflightReportFile ?? ''),
    runtime_qa_evidence_file: String(runtimeQaEvidenceFile ?? '')
  }
  const hmac = crypto
    .createHmac('sha256', COMPLETION_READY_AUTH_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex')
  return {
    authorized_by: 'validate-completion-readiness',
    payload,
    hmac,
    issued_at: new Date().toISOString()
  }
}

function verifyCompletionReadyAuthorization(proof, dispatchRunId) {
  if (!proof || typeof proof !== 'object') {
    return { valid: false, reason: 'authorization_proof_missing' }
  }
  if (proof.authorized_by !== 'validate-completion-readiness') {
    return { valid: false, reason: 'authorization_proof_authorized_by_mismatch' }
  }
  if (!proof.payload || typeof proof.payload !== 'object') {
    return { valid: false, reason: 'authorization_proof_payload_missing' }
  }
  if (proof.payload.dispatch_run_id !== String(dispatchRunId ?? '')) {
    return { valid: false, reason: 'authorization_proof_dispatch_run_id_mismatch' }
  }
  const expectedHmac = crypto
    .createHmac('sha256', COMPLETION_READY_AUTH_SECRET)
    .update(JSON.stringify(proof.payload))
    .digest('hex')
  const a = Buffer.from(String(proof.hmac ?? ''), 'utf8')
  const b = Buffer.from(expectedHmac, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'authorization_proof_hmac_invalid' }
  }
  return { valid: true }
}

// --- Legacy episode migration ---
// Episodes opened before the lifecycleStage state machine landed have no
// lifecycleStage field. A legacy active episode must be migrated to
// implementation_running before any lifecycle transition is legal. This is a
// restricted, audited one-time migration: it only back-fills the missing field
// on an active episode that has never recorded a lifecycle event, and it records
// a migration trace event so the back-fill is auditable. It does NOT advance the
// stage beyond implementation_running and does not accept episodes that already
// have a lifecycleStage (those use the normal transitions).
export function migrateLegacyEpisodeLifecycle({ dispatchRunId, objectiveKey, episodeId }) {
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode || !isActive(target.episode)) {
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  }
  if (isValidLifecycleStage(target.episode.lifecycleStage)) {
    return {
      status: 'already_migrated',
      episode: target.episode,
      lifecycle_stage: target.episode.lifecycleStage
    }
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    if (isValidLifecycleStage(current.lifecycleStage)) {
      return { status: 'already_migrated', episode: current, lifecycle_stage: current.lifecycleStage }
    }
    // Refuse to migrate if any lifecycle-shaped continuation field already exists
    // with a non-default value, to avoid silently overwriting a partial state.
    const continuation = current.continuation
    const hasPartialContinuation =
      continuation &&
      (continuation.providerDelivered === true ||
        continuation.recoveryRequired === true ||
        continuation.completionReadyAt)
    if (hasPartialContinuation) {
      return {
        status: 'blocked',
        reason: 'legacy_episode_has_partial_continuation_requires_manual_review',
        episode: current
      }
    }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'implementation_running',
        continuation: {
          providerDelivered: false,
          providerDeliveredAt: null,
          recoveryRequired: false,
          recoveryStartedAt: null,
          reviewPassedAt: null,
          qaOutcome: 'pending',
          completionReadyAt: null,
          completionReadyAuthorizedBy: null
        },
        successorDispatch: current.successorDispatch ?? null,
        supersedesDispatchRunId: current.supersedesDispatchRunId ?? null
      },
      {
        event: 'episode_legacy_lifecycle_migration',
        from: 'missing',
        to: 'implementation_running',
        migrated_at: at
      }
    )
    writeEpisode(next)
    return { status: 'migrated', episode: next, lifecycle_stage: 'implementation_running' }
  })
}

// --- Successor dispatch existence validation ---
// The circuit breaker successor linkage must be bidirectional and backed by a
// real successor dispatch contract (handoff) or a real successor episode. A
// bare string successor_run_id is not enough: the original episode records
// successor_dispatch_run_id, and the successor dispatch contract must record
// supersedes_dispatch_run_id pointing back at the original. This function is
// used by registerEpisodeRework and linkSuccessorDispatch to refuse non-existent
// or inconsistent successors.
function resolveSuccessorContract(successorDispatchRunId) {
  const successorRunId = asNonEmptyString(successorDispatchRunId)
  if (!successorRunId) {
    return { exists: false, reason: 'successor_dispatch_run_id_is_required' }
  }
  const successorHandoffPath = findHandoff(successorRunId)
  const successorHandoff = successorHandoffPath ? readJson(successorHandoffPath, null) : null
  const index = readIndex()
  const successorEpisodeId = index.dispatch_runs[successorRunId]
  const successorEpisode = successorEpisodeId ? readEpisodeById(successorEpisodeId) : null
  const hasHandoff = successorHandoff && successorHandoff.dispatch_run_id === successorRunId
  const hasEpisode = successorEpisode && successorEpisode.dispatchRunId === successorRunId
  if (!hasHandoff && !hasEpisode) {
    return {
      exists: false,
      reason: 'successor_dispatch_run_id_has_no_contract_or_episode',
      successor_dispatch_run_id: successorRunId
    }
  }
  return {
    exists: true,
    successor_dispatch_run_id: successorRunId,
    successor_handoff: hasHandoff ? successorHandoffPath : null,
    successor_episode_id: hasEpisode ? successorEpisodeId : null
  }
}

function validateSuccessorReciprocal(originalRunId, successorDispatchRunId) {
  const successor = resolveSuccessorContract(successorDispatchRunId)
  if (!successor.exists) {
    return { valid: false, reason: successor.reason }
  }
  // If a successor episode exists, it must record supersedes_dispatch_run_id
  // pointing back at the original run. If only a handoff exists (episode not yet
  // opened), the handoff must declare supersedes_dispatch_run_id. This makes the
  // linkage bidirectional and auditable.
  const index = readIndex()
  const successorEpisodeId = index.dispatch_runs[successor.successor_dispatch_run_id]
  const successorEpisode = successorEpisodeId ? readEpisodeById(successorEpisodeId) : null
  if (successorEpisode) {
    if (successorEpisode.supersedesDispatchRunId !== originalRunId) {
      return {
        valid: false,
        reason: 'successor_episode_missing_reciprocal_supersedes_dispatch_run_id',
        expected_supersedes: originalRunId,
        actual_supersedes: successorEpisode.supersedesDispatchRunId ?? null
      }
    }
    return { valid: true, successor_episode_id: successorEpisodeId }
  }
  // Successor handoff exists but no episode yet: require the handoff to declare
  // supersedes_dispatch_run_id so the linkage is established up front.
  const successorHandoff = successor.successor_handoff
    ? readJson(successor.successor_handoff, null)
    : null
  const handoffSupersedes =
    successorHandoff?.supersedes_dispatch_run_id ??
    successorHandoff?.supersedesDispatchRunId ??
    null
  if (handoffSupersedes !== originalRunId) {
    return {
      valid: false,
      reason: 'successor_handoff_missing_reciprocal_supersedes_dispatch_run_id',
      expected_supersedes: originalRunId,
      actual_supersedes: handoffSupersedes
    }
  }
  return { valid: true, successor_handoff: successor.successor_handoff }
}

// Open a successor episode that explicitly supersedes the original dispatch run.
// The new episode records supersedesDispatchRunId so the reciprocal linkage is
// established atomically with its creation.
export function openSuccessorEpisode({
  dispatchRunId,
  objectiveKey,
  supersedesDispatchRunId,
  metadata = {},
  handoff = null
}) {
  const successorRunId = asNonEmptyString(dispatchRunId)
  const objective = asNonEmptyString(objectiveKey)
  const supersedes = asNonEmptyString(supersedesDispatchRunId)
  if (!successorRunId || !objective || !supersedes) {
    return {
      status: 'blocked',
      reason: 'successor_open_requires_dispatch_run_id_and_objective_key_and_supersedes_dispatch_run_id'
    }
  }
  return withRunLock(successorRunId, () => {
    const index = readIndex()
    const activeId = index.objectives[objective]
    const activeEpisode = activeId ? readEpisodeById(activeId) : null
    if (isActive(activeEpisode)) {
      return { status: 'blocked', reason: 'active_episode_exists', episode: activeEpisode }
    }
    const resolvedHandoff = handoff ?? readJson(findHandoff(successorRunId), {})
    const intervalMs = intervalForHandoff(resolvedHandoff)
    const createdAt = now()
    const episodeId = createEpisodeId(successorRunId, objective)
    const episode = {
      version: 1,
      episode_id: episodeId,
      objective_key: objective,
      dispatchRunId: successorRunId,
      supersedesDispatchRunId: supersedes,
      amendmentSequence: 0,
      implementationAttempts: 1,
      reworkBatches: [],
      reworkPolicy: { max_batches: MAX_REWORK_BATCHES, mode: 'single_consolidated_rework' },
      circuitBreaker: { tripped: false, reason: null, tripped_at: null },
      implementationStatus: 'requested',
      reviewStatus: 'pending',
      qaStatus: 'pending',
      docsImpact: 'pending',
      brvImpact: 'main_owned',
      status: 'active',
      lifecycleStage: 'implementation_running',
      continuation: {
        providerDelivered: false,
        providerDeliveredAt: null,
        recoveryRequired: false,
        recoveryStartedAt: null,
        reviewPassedAt: null,
        qaOutcome: 'pending',
        completionReadyAt: null,
        completionReadyAuthorizedBy: null
      },
      successorDispatch: null,
      monitoring: {
        initial_interval_ms: intervalMs,
        subsequent_interval_ms: 5 * 60 * 1000,
        firstCheckNotBefore: new Date(Date.now() + intervalMs).toISOString(),
        nextCheckNotBefore: new Date(Date.now() + intervalMs).toISOString(),
        checks_completed: 0
      },
      runtime: metadataFrom(metadata),
      metrics: {
        tool_calls: 0,
        tokens: 'unavailable',
        token_usage: {
          input_tokens: 'unavailable',
          cached_input_tokens: 'unavailable',
          output_tokens: 'unavailable',
          reasoning_tokens: 'unavailable',
          total_tokens: 'unavailable'
        },
        compactions: 'unavailable'
      },
      amendments: [],
      agent_bindings: {},
      created_at: createdAt,
      last_activity_at: createdAt,
      trace: [
        { event: 'episode_opened', at: createdAt, reason: 'successor_dispatch', supersedes_dispatch_run_id: supersedes }
      ]
    }
    index.objectives[objective] = episodeId
    index.dispatch_runs[successorRunId] = episodeId
    writeIndex(index)
    writeEpisode(episode)
    return { status: 'opened', episode }
  })
}

function now() {
  return new Date().toISOString()
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function safeKey(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function episodeFile(episodeId) {
  return path.join(episodesRoot, `${safeKey(episodeId)}.json`)
}

function emptyIndex() {
  return { version: 1, objectives: {}, dispatch_runs: {}, agents: {} }
}

function readIndex() {
  return readJson(episodeIndexFile, emptyIndex())
}

function writeIndex(index) {
  writeJsonAtomic(episodeIndexFile, index)
}

function intervalForHandoff(handoff) {
  return handoff?.dispatch_tier === 'deep_contract' ? 10 * 60 * 1000 : 5 * 60 * 1000
}

function createEpisodeId(dispatchRunId, objectiveKey) {
  const digest = crypto
    .createHash('sha256')
    .update(`${dispatchRunId}:${objectiveKey}`)
    .digest('hex')
  return `${safeKey(dispatchRunId)}-${digest.slice(0, 12)}`
}

function readEpisodeById(episodeId) {
  return readJson(episodeFile(episodeId), null)
}

function isActive(episode) {
  return episode && !terminalStatuses.has(episode.status)
}

function eventTimestamp(event) {
  return event.at ?? now()
}

function appendTrace(episode, event) {
  const trace = Array.isArray(episode.trace) ? episode.trace : []
  return {
    ...episode,
    trace: [...trace, { ...event, at: eventTimestamp(event) }],
    last_activity_at: eventTimestamp(event),
    updated_at: now()
  }
}

function writeEpisode(episode) {
  writeJsonAtomic(episodeFile(episode.episode_id), episode)
  return episode
}

function requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId }) {
  const index = readIndex()
  const resolvedId =
    episodeId ||
    (objectiveKey ? index.objectives[objectiveKey] : index.dispatch_runs[dispatchRunId])
  const episode = resolvedId ? readEpisodeById(resolvedId) : null
  if (!episode) {
    return { index, episode: null, reason: 'episode_not_found' }
  }
  return { index, episode, reason: null }
}

export function openEpisode({ dispatchRunId, objectiveKey, metadata = {}, handoff = null }) {
  const runId = asNonEmptyString(dispatchRunId)
  const objective = asNonEmptyString(objectiveKey)
  if (!runId || !objective) {
    return { status: 'blocked', reason: 'dispatch_run_id_and_objective_key_are_required' }
  }
  return withRunLock(runId, () => {
    const index = readIndex()
    const activeId = index.objectives[objective]
    const activeEpisode = activeId ? readEpisodeById(activeId) : null
    if (isActive(activeEpisode)) {
      return {
        status: 'blocked',
        reason: 'active_episode_exists',
        episode: activeEpisode
      }
    }
    const resolvedHandoff = handoff ?? readJson(findHandoff(runId), {})
    const intervalMs = intervalForHandoff(resolvedHandoff)
    const createdAt = now()
    const episodeId = createEpisodeId(runId, objective)
    const episode = {
      version: 1,
      episode_id: episodeId,
      objective_key: objective,
      dispatchRunId: runId,
      amendmentSequence: 0,
      implementationAttempts: 1,
      reworkBatches: [],
      reworkPolicy: {
        max_batches: MAX_REWORK_BATCHES,
        mode: 'single_consolidated_rework'
      },
      circuitBreaker: {
        tripped: false,
        reason: null,
        tripped_at: null
      },
      implementationStatus: 'requested',
      reviewStatus: 'pending',
      qaStatus: 'pending',
      docsImpact: 'pending',
      brvImpact: 'main_owned',
      status: 'active',
      lifecycleStage: 'implementation_running',
      continuation: {
        providerDelivered: false,
        providerDeliveredAt: null,
        recoveryRequired: false,
        recoveryStartedAt: null,
        reviewPassedAt: null,
        qaOutcome: 'pending',
        completionReadyAt: null,
        completionReadyAuthorizedBy: null
      },
      successorDispatch: null,
      supersedesDispatchRunId: null,
      monitoring: {
        initial_interval_ms: intervalMs,
        subsequent_interval_ms: 5 * 60 * 1000,
        firstCheckNotBefore: new Date(Date.now() + intervalMs).toISOString(),
        nextCheckNotBefore: new Date(Date.now() + intervalMs).toISOString(),
        checks_completed: 0
      },
      runtime: metadataFrom(metadata),
      metrics: {
        tool_calls: 0,
        tokens: 'unavailable',
        token_usage: {
          input_tokens: 'unavailable',
          cached_input_tokens: 'unavailable',
          output_tokens: 'unavailable',
          reasoning_tokens: 'unavailable',
          total_tokens: 'unavailable'
        },
        compactions: 'unavailable'
      },
      amendments: [],
      agent_bindings: {},
      created_at: createdAt,
      last_activity_at: createdAt,
      trace: [{ event: 'episode_opened', at: createdAt, reason: 'baseline' }]
    }
    index.objectives[objective] = episodeId
    index.dispatch_runs[runId] = episodeId
    writeIndex(index)
    writeEpisode(episode)
    return { status: 'opened', episode }
  })
}

export function amendEpisode({
  dispatchRunId,
  objectiveKey,
  episodeId,
  amendment,
  knowledgeScopeChanged = false
}) {
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode || !isActive(target.episode)) {
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    const sequence = Number(current.amendmentSequence ?? 0) + 1
    const recall = knowledgeScopeChanged ? 'main_recall_required' : 'reused_existing_packet'
    const amendmentEntry = {
      sequence,
      payload: amendment ?? null,
      knowledge_scope_changed: knowledgeScopeChanged,
      recall,
      amended_at: now()
    }
    const next = appendTrace(
      {
        ...current,
        amendmentSequence: sequence,
        amendments: [...(current.amendments ?? []), amendmentEntry],
        latest_amendment: amendmentEntry.payload,
        brv_recall: recall
      },
      { event: 'episode_amended', sequence, knowledge_scope_changed: knowledgeScopeChanged, recall }
    )
    writeEpisode(next)
    return { status: 'amended', episode: next }
  })
}

export function registerEpisodeRework({
  dispatchRunId,
  objectiveKey,
  episodeId,
  defectSignature,
  summary,
  supersedesTarget = null
}) {
  const signature = asNonEmptyString(defectSignature)
  const consolidatedSummary = asNonEmptyString(summary)
  if (!signature || !consolidatedSummary) {
    return {
      status: 'blocked',
      reason: 'defect_signature_and_consolidated_summary_are_required'
    }
  }
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode || !isActive(target.episode)) {
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    const batches = Array.isArray(current.reworkBatches) ? current.reworkBatches : []
    if (batches.length >= MAX_REWORK_BATCHES) {
      const trippedAt = now()
      // Circuit breaker on second rework must produce an auditable successor
      // dispatch or an explicit user decision block. It must NOT silently stop
      // when a fix target exists. The successor linkage (supersedesDispatchRunId
      // on the new run / successorDispatch on the original) is recorded so the
      // redesign/recovery path is traceable. A user_decision_required block is
      // only legal when no fix target is available.
      const successorRunId = asNonEmptyString(supersedesTarget?.successorDispatchRunId)
      const fixTarget = asNonEmptyString(supersedesTarget?.fixTarget)
      const userDecisionReason = asNonEmptyString(supersedesTarget?.userDecisionReason)
      const allowUserDecisionBlock =
        !successorRunId && !fixTarget && userDecisionReason.length > 0
      if (!successorRunId && !allowUserDecisionBlock) {
        return {
          status: 'blocked',
          reason:
            'second_rework_requires_successor_dispatch_or_explicit_user_decision_block',
          episode: current,
          defect_signature: signature
        }
      }
      // P0-3: a successor run id is only accepted when a real successor dispatch
      // contract (handoff) or successor episode exists AND records the reciprocal
      // supersedes_dispatch_run_id pointing back at the original run. A bare
      // string is rejected so the linkage is always bidirectional and auditable.
      let successorValidation = null
      if (successorRunId) {
        successorValidation = validateSuccessorReciprocal(current.dispatchRunId, successorRunId)
        if (!successorValidation.valid) {
          return {
            status: 'blocked',
            reason: successorValidation.reason,
            episode: current,
            defect_signature: signature,
            expected_supersedes: successorValidation.expected_supersedes ?? null,
            actual_supersedes: successorValidation.actual_supersedes ?? null
          }
        }
      }
      const successorDispatch = successorRunId
        ? {
            successor_dispatch_run_id: successorRunId,
            supersedes_dispatch_run_id: current.dispatchRunId,
            relationship: supersedesTarget?.relationship || 'redesign_recovery',
            linked_at: trippedAt,
            reciprocal_verified: true,
            successor_episode_id: successorValidation?.successor_episode_id ?? null,
            successor_handoff: successorValidation?.successor_handoff ?? null
          }
        : null
      const next = appendTrace(
        {
          ...current,
          implementationStatus: 'blocked_rework_budget_exhausted',
          circuitBreaker: {
            tripped: true,
            reason: successorRunId
              ? 'second_rework_linked_to_successor_dispatch'
              : 'user_decision_required_no_fix_target',
            tripped_at: trippedAt,
            rejected_defect_signature: signature,
            successor_dispatch_run_id: successorRunId || null,
            user_decision_reason: allowUserDecisionBlock ? userDecisionReason : null
          },
          successorDispatch,
          lifecycleStage: 'implementation_running'
        },
        {
          event: 'episode_rework_blocked',
          reason: successorRunId
            ? 'second_rework_linked_to_successor_dispatch'
            : 'user_decision_required_no_fix_target',
          defect_signature: signature,
          successor_dispatch_run_id: successorRunId || null
        }
      )
      writeEpisode(next)
      return {
        status: 'blocked',
        reason: successorRunId
          ? 'rework_budget_exhausted_successor_dispatch_linked'
          : 'rework_budget_exhausted_user_decision_required',
        episode: next
      }
    }
    const requestedAt = now()
    const batch = {
      sequence: batches.length + 1,
      defect_signature: signature,
      summary: consolidatedSummary,
      requested_at: requestedAt
    }
    const next = appendTrace(
      {
        ...current,
        implementationAttempts: Number(current.implementationAttempts ?? 1) + 1,
        implementationStatus: 'rework_requested',
        reworkBatches: [...batches, batch]
      },
      {
        event: 'episode_rework_requested',
        sequence: batch.sequence,
        defect_signature: signature
      }
    )
    writeEpisode(next)
    return { status: 'rework_requested', episode: next }
  })
}

// --- Continuation contract lifecycle transitions ---
// Provider delivery only records provider_delivered + recovery_required; it must
// never finish or complete the episode. Recovery must start with an explicit
// event/state. The episode stays active until completion_ready is recorded by a
// successful validate-completion-readiness run.

function requireActiveForContinuation({ dispatchRunId, objectiveKey, episodeId }) {
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode || !isActive(target.episode)) {
    return {
      blocked: true,
      result: { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
    }
  }
  return { blocked: false, target }
}

function enforceStageTransition(current, nextStage, { allowedPriorStages }) {
  const priorStage = current.lifecycleStage
  if (!isValidLifecycleStage(priorStage)) {
    return {
      blocked: true,
      result: {
        status: 'blocked',
        reason: 'lifecycle_stage_missing_or_invalid',
        lifecycle_stage: priorStage ?? null
      }
    }
  }
  if (!allowedPriorStages.has(priorStage)) {
    return {
      blocked: true,
      result: {
        status: 'blocked',
        reason: 'lifecycle_stage_transition_not_allowed',
        from_stage: priorStage,
        to_stage: nextStage,
        allowed_from: [...allowedPriorStages]
      }
    }
  }
  return { blocked: false }
}

export function recordProviderDelivered({
  dispatchRunId,
  objectiveKey,
  episodeId,
  providerOutcome = 'delivered',
  evidence = null
}) {
  const check = requireActiveForContinuation({ dispatchRunId, objectiveKey, episodeId })
  if (check.blocked) {
    return check.result
  }
  const { target } = check
  const transition = enforceStageTransition(target.episode, 'provider_delivered', {
    allowedPriorStages: new Set(['implementation_running'])
  })
  if (transition.blocked) {
    return transition.result
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    // Re-validate under the lock to avoid a lost-update race.
    if (current.lifecycleStage !== 'implementation_running') {
      return {
        status: 'blocked',
        reason: 'lifecycle_stage_transition_not_allowed',
        from_stage: current.lifecycleStage,
        to_stage: 'provider_delivered'
      }
    }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'provider_delivered',
        continuation: {
          ...current.continuation,
          providerDelivered: true,
          providerDeliveredAt: at,
          providerOutcome,
          recoveryRequired: true,
          recoveryEvidence: evidence ?? null
        }
      },
      {
        event: 'episode_provider_delivered',
        provider_outcome: providerOutcome,
        recovery_required: true
      }
    )
    writeEpisode(next)
    return { status: 'provider_delivered', episode: next }
  })
}

export function startRecovery({
  dispatchRunId,
  objectiveKey,
  episodeId,
  recoveryMode = 'codex_main_recovery'
}) {
  const check = requireActiveForContinuation({ dispatchRunId, objectiveKey, episodeId })
  if (check.blocked) {
    return check.result
  }
  const { target } = check
  const transition = enforceStageTransition(target.episode, 'recovery_in_progress', {
    allowedPriorStages: new Set(['provider_delivered'])
  })
  if (transition.blocked) {
    return transition.result
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    if (current.lifecycleStage !== 'provider_delivered') {
      return {
        status: 'blocked',
        reason: 'lifecycle_stage_transition_not_allowed',
        from_stage: current.lifecycleStage,
        to_stage: 'recovery_in_progress'
      }
    }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'recovery_in_progress',
        continuation: {
          ...current.continuation,
          recoveryStartedAt: at,
          recoveryMode
        }
      },
      { event: 'episode_recovery_started', recovery_mode: recoveryMode }
    )
    writeEpisode(next)
    return { status: 'recovery_in_progress', episode: next }
  })
}

export function recordReviewPassed({
  dispatchRunId,
  objectiveKey,
  episodeId,
  reviewSummary = ''
}) {
  const check = requireActiveForContinuation({ dispatchRunId, objectiveKey, episodeId })
  if (check.blocked) {
    return check.result
  }
  const { target } = check
  const transition = enforceStageTransition(target.episode, 'review_passed', {
    allowedPriorStages: new Set(['recovery_in_progress', 'review_passed'])
  })
  if (transition.blocked) {
    return transition.result
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    const allowed = new Set(['recovery_in_progress', 'review_passed'])
    if (!allowed.has(current.lifecycleStage)) {
      return {
        status: 'blocked',
        reason: 'lifecycle_stage_transition_not_allowed',
        from_stage: current.lifecycleStage,
        to_stage: 'review_passed'
      }
    }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: 'review_passed',
        reviewStatus: 'passed',
        continuation: {
          ...current.continuation,
          reviewPassedAt: at,
          reviewSummary
        }
      },
      { event: 'episode_review_passed', review_summary: reviewSummary }
    )
    writeEpisode(next)
    return { status: 'review_passed', episode: next }
  })
}

export function recordQaOutcome({
  dispatchRunId,
  objectiveKey,
  episodeId,
  qaStatus,
  qaEvidence = null
}) {
  const check = requireActiveForContinuation({ dispatchRunId, objectiveKey, episodeId })
  if (check.blocked) {
    return check.result
  }
  const { target } = check
  const nextStage = qaOutcomeStage(qaStatus)
  if (!(nextStage === 'qa_passed' || nextStage === 'qa_not_required')) {
    return {
      status: 'blocked',
      reason: 'qa_status_must_be_passed|not_required|failed',
      qa_status: qaStatus
    }
  }
  const transition = enforceStageTransition(target.episode, nextStage, {
    allowedPriorStages: new Set(['review_passed', 'qa_passed', 'qa_not_required'])
  })
  if (transition.blocked) {
    return transition.result
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    const allowed = new Set(['review_passed', 'qa_passed', 'qa_not_required'])
    if (!allowed.has(current.lifecycleStage)) {
      return {
        status: 'blocked',
        reason: 'lifecycle_stage_transition_not_allowed',
        from_stage: current.lifecycleStage,
        to_stage: nextStage
      }
    }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: nextStage,
        qaStatus,
        continuation: {
          ...current.continuation,
          qaOutcome: qaStatus,
          qaRecordedAt: at,
          qaEvidence: qaEvidence ?? null
        }
      },
      { event: 'episode_qa_outcome_recorded', qa_status: qaStatus, qa_stage: nextStage }
    )
    writeEpisode(next)
    return { status: nextStage, episode: next }
  })
}

// completion_ready can ONLY be recorded by a successful validate-completion-readiness
// run. The authorizedBy field records that machine-validated provenance; chat,
// manual, or provider self-claims are not accepted.
export function markCompletionReady({
  dispatchRunId,
  objectiveKey,
  episodeId,
  authorizationProof = null
}) {
  // P0-2: completion_ready must only be recorded by a successful
  // validate-completion-readiness run. The caller must present an authorization
  // proof issued by issueCompletionReadyAuthorization (HMAC over the validated
  // evidence paths). A public CLI caller cannot construct a valid proof without
  // the shared secret, so the public mark-completion-ready CLI action is rejected.
  const verification = verifyCompletionReadyAuthorization(authorizationProof, dispatchRunId)
  if (!verification.valid) {
    return {
      status: 'blocked',
      reason: 'completion_ready_requires_valid_authorization_proof',
      authorization_reason: verification.reason
    }
  }
  const check = requireActiveForContinuation({ dispatchRunId, objectiveKey, episodeId })
  if (check.blocked) {
    return check.result
  }
  const { target } = check
  const transition = enforceStageTransition(target.episode, COMPLETION_READY_STAGE, {
    allowedPriorStages: new Set(['qa_passed', 'qa_not_required', 'completion_ready'])
  })
  if (transition.blocked) {
    return transition.result
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    const allowed = new Set(['qa_passed', 'qa_not_required', 'completion_ready'])
    if (!allowed.has(current.lifecycleStage)) {
      return {
        status: 'blocked',
        reason: 'lifecycle_stage_transition_not_allowed',
        from_stage: current.lifecycleStage,
        to_stage: COMPLETION_READY_STAGE
      }
    }
    const at = now()
    const next = appendTrace(
      {
        ...current,
        lifecycleStage: COMPLETION_READY_STAGE,
        continuation: {
          ...current.continuation,
          completionReadyAt: at,
          completionReadyAuthorizedBy: 'validate-completion-readiness',
          completionReadyAuthorization: authorizationProof
        }
      },
      {
        event: 'episode_completion_ready',
        authorized_by: 'validate-completion-readiness',
        authorization_verified: true,
        authorized_handoff: authorizationProof.payload.handoff_file,
        authorized_result: authorizationProof.payload.implementation_result_file
      }
    )
    writeEpisode(next)
    return { status: 'completion_ready', episode: next }
  })
}

// Bind a successor dispatch created by the circuit breaker so the redesign /
// recovery path is auditable. The original episode records successor_dispatch_run_id;
// the successor episode (opened separately) records supersedes_dispatch_run_id.
export function linkSuccessorDispatch({
  dispatchRunId,
  objectiveKey,
  episodeId,
  successorDispatchRunId,
  relationship = 'redesign_recovery'
}) {
  const successorRunId = asNonEmptyString(successorDispatchRunId)
  if (!successorRunId) {
    return { status: 'blocked', reason: 'successor_dispatch_run_id_is_required' }
  }
  const check = requireActiveForContinuation({ dispatchRunId, objectiveKey, episodeId })
  if (check.blocked) {
    return check.result
  }
  const { target } = check
  // P0-3: validate the successor exists and records the reciprocal supersedes
  // relationship before linking. Reject non-existent successors or successors
  // missing the reciprocal linkage.
  const reciprocal = validateSuccessorReciprocal(target.episode.dispatchRunId, successorRunId)
  if (!reciprocal.valid) {
    return {
      status: 'blocked',
      reason: reciprocal.reason,
      expected_supersedes: reciprocal.expected_supersedes ?? null,
      actual_supersedes: reciprocal.actual_supersedes ?? null
    }
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    if (current.successorDispatch?.successor_dispatch_run_id === successorRunId) {
      return { status: 'already_linked', episode: current }
    }
    const at = now()
    const successorDispatch = {
      successor_dispatch_run_id: successorRunId,
      supersedes_dispatch_run_id: current.dispatchRunId,
      relationship,
      linked_at: at,
      reciprocal_verified: true,
      successor_episode_id: reciprocal.successor_episode_id ?? null,
      successor_handoff: reciprocal.successor_handoff ?? null
    }
    const next = appendTrace(
      {
        ...current,
        successorDispatch,
        circuitBreaker: {
          ...(current.circuitBreaker ?? { tripped: false, reason: null, tripped_at: null }),
          successor_dispatch_run_id: successorRunId
        }
      },
      {
        event: 'episode_successor_dispatch_linked',
        successor_dispatch_run_id: successorRunId,
        relationship,
        reciprocal_verified: true
      }
    )
    writeEpisode(next)
    return { status: 'linked', episode: next }
  })
}

export function bindAgentToEpisode({ dispatchRunId, agentId, agentType, metadata = {} }) {
  const id = asNonEmptyString(agentId)
  if (!id) {
    return { status: 'blocked', reason: 'agent_id_is_required_for_explicit_episode_binding' }
  }
  const target = requireActiveEpisode({ dispatchRunId })
  if (!target.episode || !isActive(target.episode)) {
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const index = readIndex()
    const current = readEpisodeById(target.episode.episode_id)
    const binding = { agent_type: asNonEmptyString(agentType) || 'unavailable', bound_at: now() }
    const next = appendTrace(
      {
        ...current,
        agent_bindings: { ...(current.agent_bindings ?? {}), [id]: binding },
        runtime: mergeRuntimeMetadata(current.runtime, metadataFrom(metadata))
      },
      { event: 'agent_bound', agent_id: id, agent_type: binding.agent_type }
    )
    index.agents[id] = next.episode_id
    writeIndex(index)
    writeEpisode(next)
    return { status: 'bound', episode: next }
  })
}

export function resolveEpisodeAttribution({ dispatchRunId, agentId }) {
  const index = readIndex()
  const directRun = asNonEmptyString(dispatchRunId)
  const boundAgent = asNonEmptyString(agentId)
  const episodeId = directRun
    ? index.dispatch_runs[directRun]
    : boundAgent
      ? index.agents[boundAgent]
      : null
  const episode = episodeId ? readEpisodeById(episodeId) : null
  if (!isActive(episode)) {
    return null
  }
  if (directRun && episode.dispatchRunId !== directRun) {
    return null
  }
  return episode
}

export function recordEpisodeActivity({ dispatchRunId, agentId, event, metadata = {} }) {
  const episode = resolveEpisodeAttribution({ dispatchRunId, agentId })
  if (!episode) {
    return null
  }
  return withRunLock(episode.dispatchRunId, () => {
    const current = readEpisodeById(episode.episode_id)
    const isToolCall = event?.event === 'PostToolUse' || event?.telemetry_type === 'tool_call'
    const currentTools = Number(current.metrics?.tool_calls ?? 0)
    const update = metadataFrom(metadata)
    const runtime = mergeRuntimeMetadata(current.runtime, update)
    const next = appendTrace(
      {
        ...current,
        runtime,
        metrics: {
          ...current.metrics,
          tool_calls: currentTools + (isToolCall ? 1 : 0),
          tokens: runtime.total_tokens,
          token_usage: {
            input_tokens: runtime.input_tokens,
            cached_input_tokens: runtime.cached_input_tokens,
            output_tokens: runtime.output_tokens,
            reasoning_tokens: runtime.reasoning_tokens,
            total_tokens: runtime.total_tokens
          },
          compactions: runtime.compactions
        }
      },
      event
    )
    writeEpisode(next)
    return next
  })
}

export function watchEpisode({
  dispatchRunId,
  objectiveKey,
  episodeId,
  reason = '',
  reasonEvidence = '',
  at = Date.now()
}) {
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode || !isActive(target.episode)) {
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  }
  const nextCheckAt = Date.parse(target.episode.monitoring?.nextCheckNotBefore ?? '')
  const isDue = Number.isNaN(nextCheckAt) || at >= nextCheckAt
  const isLegalEarly = legalEarlyCheckReasons.has(reason)
  const normalizedReasonEvidence = String(reasonEvidence ?? '').trim()
  if (!isDue && !isLegalEarly) {
    return {
      status: 'not_due',
      episode_id: target.episode.episode_id,
      nextCheckNotBefore: target.episode.monitoring?.nextCheckNotBefore,
      reason: 'short_polling_forbidden'
    }
  }
  if (!isDue && !normalizedReasonEvidence) {
    return {
      status: 'blocked',
      episode_id: target.episode.episode_id,
      nextCheckNotBefore: target.episode.monitoring?.nextCheckNotBefore,
      reason: 'early_check_reason_evidence_required'
    }
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const current = readEpisodeById(target.episode.episode_id)
    const nextCheckNotBefore = new Date(
      at + current.monitoring.subsequent_interval_ms
    ).toISOString()
    const next = appendTrace(
      {
        ...current,
        monitoring: {
          ...current.monitoring,
          checks_completed: Number(current.monitoring?.checks_completed ?? 0) + 1,
          nextCheckNotBefore
        }
      },
      {
        event: 'episode_watch',
        reason: isDue ? 'scheduled' : reason,
        early: !isDue,
        reason_evidence: isDue ? null : normalizedReasonEvidence,
        nextCheckNotBefore
      }
    )
    writeEpisode(next)
    return { status: 'checked', episode: next }
  })
}

export function finishEpisode({ dispatchRunId, objectiveKey, episodeId, status, fields = {} }) {
  if (!terminalStatuses.has(status)) {
    return {
      status: 'blocked',
      reason: 'terminal_status_must_be_completed|blocked|aborted|cancelled'
    }
  }
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode) {
    return { status: 'blocked', reason: target.reason }
  }
  if (status === 'completed' && target.episode.circuitBreaker?.tripped === true) {
    return {
      status: 'blocked',
      reason: 'circuit_breaker_tripped_cannot_complete',
      episode: target.episode
    }
  }
  // Continuation contract: completed is only legal after the episode has reached
  // completion_ready via a successful validate-completion-readiness run. Provider
  // delivery, recovery, review or QA must not be short-circuited into completed.
  // Legacy self-test episodes that pre-date the lifecycle field are exempted only
  // when they carry no continuation contract (lifecycleStage absent), so the
  // hook-self-test flow continues to validate the CLI adapter.
  if (
    status === 'completed' &&
    isValidLifecycleStage(target.episode.lifecycleStage) &&
    target.episode.lifecycleStage !== COMPLETION_READY_STAGE
  ) {
    return {
      status: 'blocked',
      reason: 'completion_requires_completion_ready_lifecycle_stage',
      lifecycle_stage: target.episode.lifecycleStage,
      episode: target.episode
    }
  }
  return withRunLock(target.episode.dispatchRunId, () => {
    const index = readIndex()
    const current = readEpisodeById(target.episode.episode_id)
    if (
      status === 'completed' &&
      isValidLifecycleStage(current.lifecycleStage) &&
      current.lifecycleStage !== COMPLETION_READY_STAGE
    ) {
      return {
        status: 'blocked',
        reason: 'completion_requires_completion_ready_lifecycle_stage',
        lifecycle_stage: current.lifecycleStage
      }
    }
    const next = appendTrace(
      {
        ...current,
        ...fields,
        status,
        implementationStatus: fields.implementationStatus ?? current.implementationStatus,
        reviewStatus: fields.reviewStatus ?? current.reviewStatus,
        qaStatus: fields.qaStatus ?? current.qaStatus
      },
      { event: 'episode_finished', reason: 'terminal', terminal_status: status }
    )
    if (index.objectives[current.objective_key] === current.episode_id) {
      delete index.objectives[current.objective_key]
    }
    if (index.dispatch_runs[current.dispatchRunId] === current.episode_id) {
      delete index.dispatch_runs[current.dispatchRunId]
    }
    for (const agentId of Object.keys(current.agent_bindings ?? {})) {
      if (index.agents[agentId] === current.episode_id) {
        delete index.agents[agentId]
      }
    }
    writeIndex(index)
    writeEpisode(next)
    return { status: 'finished', episode: next }
  })
}

export function renderEpisodeStatus({ dispatchRunId, objectiveKey, episodeId }) {
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode) {
    return { status: 'unavailable', reason: target.reason }
  }
  return renderEpisodeStatusRecord(target.episode, { maxReworkBatches: MAX_REWORK_BATCHES })
}

export function auditEpisodeTrace({ dispatchRunId, objectiveKey, episodeId }) {
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  const episode = target.episode
  if (!episode) {
    return { status: 'blocked', errors: [target.reason] }
  }
  return auditEpisodeTraceRecord(episode, {
    maxReworkBatches: MAX_REWORK_BATCHES,
    legalEarlyCheckReasons
  })
}

export function defaultProjectPath() {
  return path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
}
