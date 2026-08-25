import path from 'node:path'
import { findHandoff, repoRoot, withRunLock } from './state.mjs'
import { auditEpisodeTraceRecord, renderEpisodeStatusRecord } from './episode-reporting.mjs'
import { mergeRuntimeMetadata, metadataFrom } from './episode-metadata.mjs'
import {
  appendTrace,
  asNonEmptyString,
  COMPLETION_READY_STAGE,
  initialEpisode,
  isActive,
  LEGAL_EARLY_CHECK_REASONS,
  LIFECYCLE_STAGES,
  MAX_REWORK_BATCHES,
  now,
  readEpisodeById,
  readIndex,
  requireActiveEpisode,
  TERMINAL_STATUSES,
  withActiveEpisode,
  writeEpisode,
  writeIndex
} from './episode-store.mjs'
import { readJson, repoRoot as root } from './state.mjs'

function resolvedHandoff(runId, handoff) {
  return handoff ?? readJson(findHandoff(runId), {})
}
function open(input, supersedesDispatchRunId = null) {
  const runId = asNonEmptyString(input.dispatchRunId)
  const objective = asNonEmptyString(input.objectiveKey)
  if (!runId || !objective)
    return { status: 'blocked', reason: 'dispatch_run_id_and_objective_key_are_required' }
  return withRunLock(runId, () => {
    const index = readIndex()
    const active = index.objectives[objective] ? readEpisodeById(index.objectives[objective]) : null
    if (isActive(active))
      return { status: 'blocked', reason: 'active_episode_exists', episode: active }
    const episode = initialEpisode({
      dispatchRunId: runId,
      objectiveKey: objective,
      metadata: input.metadata,
      handoff: resolvedHandoff(runId, input.handoff),
      supersedesDispatchRunId
    })
    index.objectives[objective] = episode.episode_id
    index.dispatch_runs[runId] = episode.episode_id
    writeIndex(index)
    writeEpisode(episode)
    return { status: 'opened', episode }
  })
}
export const openEpisode = input => open(input)
export function openSuccessorEpisode(input) {
  const prior = asNonEmptyString(input.supersedesDispatchRunId)
  if (!prior)
    return {
      status: 'blocked',
      reason:
        'successor_open_requires_dispatch_run_id_and_objective_key_and_supersedes_dispatch_run_id'
    }
  return open(input, prior)
}

export function amendEpisode(input) {
  return withActiveEpisode(input, current => {
    const entry = {
      sequence: Number(current.amendmentSequence ?? 0) + 1,
      payload: input.amendment ?? null,
      knowledge_scope_changed: input.knowledgeScopeChanged === true,
      recall: input.knowledgeScopeChanged ? 'main_recall_required' : 'reused_existing_packet',
      amended_at: now()
    }
    const next = appendTrace(
      {
        ...current,
        amendmentSequence: entry.sequence,
        amendments: [...(current.amendments ?? []), entry],
        latest_amendment: entry.payload,
        brv_recall: entry.recall
      },
      {
        event: 'episode_amended',
        sequence: entry.sequence,
        knowledge_scope_changed: entry.knowledge_scope_changed,
        recall: entry.recall
      }
    )
    writeEpisode(next)
    return { status: 'amended', episode: next }
  })
}

function successorContract(originalRunId, runId) {
  const handoff = readJson(findHandoff(runId), null)
  const index = readIndex()
  const episode = index.dispatch_runs[runId] ? readEpisodeById(index.dispatch_runs[runId]) : null
  const reciprocal = episode?.supersedesDispatchRunId ?? handoff?.supersedes_dispatch_run_id
  return reciprocal === originalRunId
    ? { valid: true, episode, handoff: handoff ? findHandoff(runId) : null }
    : {
        valid: false,
        reason:
          episode || handoff
            ? 'successor_missing_reciprocal_supersedes_dispatch_run_id'
            : 'successor_dispatch_run_id_has_no_contract_or_episode'
      }
}

export function registerEpisodeRework(input) {
  const signature = asNonEmptyString(input.defectSignature)
  const summary = asNonEmptyString(input.summary)
  if (!signature || !summary)
    return { status: 'blocked', reason: 'defect_signature_and_consolidated_summary_are_required' }
  return withActiveEpisode(input, current => {
    const batches = current.reworkBatches ?? []
    if (batches.length >= MAX_REWORK_BATCHES) {
      const successor = asNonEmptyString(input.supersedesTarget?.successorDispatchRunId)
      const decision = asNonEmptyString(input.supersedesTarget?.userDecisionReason)
      const fixTarget = asNonEmptyString(input.supersedesTarget?.fixTarget)
      if (!successor && !decision)
        return {
          status: 'blocked',
          reason: 'second_rework_requires_successor_dispatch_or_explicit_user_decision_block',
          episode: current
        }
      if (!successor && decision && fixTarget)
        return {
          status: 'blocked',
          reason: 'second_rework_requires_successor_dispatch_or_explicit_user_decision_block',
          episode: current
        }
      const checked = successor
        ? successorContract(current.dispatchRunId, successor)
        : { valid: true }
      if (!checked.valid) return { status: 'blocked', reason: checked.reason, episode: current }
      const at = now()
      const successorDispatch = successor
        ? {
            successor_dispatch_run_id: successor,
            supersedes_dispatch_run_id: current.dispatchRunId,
            relationship: input.supersedesTarget?.relationship || 'redesign_recovery',
            linked_at: at,
            reciprocal_verified: true,
            successor_episode_id: checked.episode?.episode_id ?? null,
            successor_handoff: checked.handoff ?? null
          }
        : null
      const reason = successor
        ? 'second_rework_linked_to_successor_dispatch'
        : 'user_decision_required_no_fix_target'
      const next = appendTrace(
        {
          ...current,
          implementationStatus: 'blocked_rework_budget_exhausted',
          circuitBreaker: {
            tripped: true,
            reason,
            tripped_at: at,
            rejected_defect_signature: signature,
            successor_dispatch_run_id: successor || null,
            user_decision_reason: decision || null
          },
          successorDispatch,
          lifecycleStage: 'implementation_running'
        },
        {
          event: 'episode_rework_blocked',
          reason,
          defect_signature: signature,
          successor_dispatch_run_id: successor || null
        }
      )
      writeEpisode(next)
      return {
        status: 'blocked',
        reason: successor
          ? 'rework_budget_exhausted_successor_dispatch_linked'
          : 'rework_budget_exhausted_user_decision_required',
        episode: next
      }
    }
    const batch = {
      sequence: batches.length + 1,
      defect_signature: signature,
      summary,
      requested_at: now()
    }
    const next = appendTrace(
      {
        ...current,
        implementationAttempts: Number(current.implementationAttempts ?? 1) + 1,
        implementationStatus: 'rework_requested',
        reworkBatches: [...batches, batch]
      },
      { event: 'episode_rework_requested', sequence: batch.sequence, defect_signature: signature }
    )
    writeEpisode(next)
    return { status: 'rework_requested', episode: next }
  })
}

export function linkSuccessorDispatch(input) {
  const successor = asNonEmptyString(input.successorDispatchRunId)
  if (!successor) return { status: 'blocked', reason: 'successor_dispatch_run_id_is_required' }
  return withActiveEpisode(input, current => {
    if (current.successorDispatch?.successor_dispatch_run_id === successor)
      return { status: 'already_linked', episode: current }
    const checked = successorContract(current.dispatchRunId, successor)
    if (!checked.valid) return { status: 'blocked', reason: checked.reason }
    const next = appendTrace(
      {
        ...current,
        successorDispatch: {
          successor_dispatch_run_id: successor,
          supersedes_dispatch_run_id: current.dispatchRunId,
          relationship: input.relationship || 'redesign_recovery',
          linked_at: now(),
          reciprocal_verified: true,
          successor_episode_id: checked.episode?.episode_id ?? null,
          successor_handoff: checked.handoff ?? null
        }
      },
      {
        event: 'episode_successor_dispatch_linked',
        successor_dispatch_run_id: successor,
        relationship: input.relationship || 'redesign_recovery',
        reciprocal_verified: true
      }
    )
    writeEpisode(next)
    return { status: 'linked', episode: next }
  })
}

export function bindAgentToEpisode({ dispatchRunId, agentId, agentType, metadata = {} } = {}) {
  const target = requireActiveEpisode({ dispatchRunId })
  const id = asNonEmptyString(agentId)
  if (!id) return { status: 'blocked', reason: 'agent_id_is_required_for_explicit_episode_binding' }
  const normalizedAgentType = asNonEmptyString(agentType)
  if (
    ['code_explorer', 'implementer_fast', 'implementer_deep', 'default', 'worker'].includes(
      normalizedAgentType
    )
  ) {
    return { status: 'blocked', reason: 'internal_subagent_forbidden' }
  }
  if (!isActive(target.episode))
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  return withRunLock(target.episode.dispatchRunId, () => {
    const index = readIndex()
    const current = readEpisodeById(target.episode.episode_id)
    const binding = { agent_type: normalizedAgentType || 'unavailable', bound_at: now() }
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

export function resolveEpisodeAttribution({ dispatchRunId, agentId } = {}) {
  const index = readIndex()
  const id = dispatchRunId ? index.dispatch_runs[dispatchRunId] : index.agents[agentId]
  const episode = id ? readEpisodeById(id) : null
  return isActive(episode) && (!dispatchRunId || episode.dispatchRunId === dispatchRunId)
    ? episode
    : null
}

export function recordEpisodeActivity({ dispatchRunId, agentId, event, metadata = {} } = {}) {
  const episode = resolveEpisodeAttribution({ dispatchRunId, agentId })
  if (!episode) return null
  return withRunLock(episode.dispatchRunId, () => {
    const current = readEpisodeById(episode.episode_id)
    const runtime = mergeRuntimeMetadata(current.runtime, metadataFrom(metadata))
    const tool = event?.event === 'PostToolUse' || event?.telemetry_type === 'tool_call'
    const next = appendTrace(
      {
        ...current,
        runtime,
        metrics: {
          ...current.metrics,
          tool_calls: Number(current.metrics?.tool_calls ?? 0) + (tool ? 1 : 0),
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
