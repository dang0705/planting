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
  summary
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
      const next = appendTrace(
        {
          ...current,
          implementationStatus: 'blocked_rework_budget_exhausted',
          circuitBreaker: {
            tripped: true,
            reason: 'second_rework_requires_redesign_or_user_decision',
            tripped_at: trippedAt,
            rejected_defect_signature: signature
          }
        },
        {
          event: 'episode_rework_blocked',
          reason: 'second_rework_requires_redesign_or_user_decision',
          defect_signature: signature
        }
      )
      writeEpisode(next)
      return {
        status: 'blocked',
        reason: 'rework_budget_exhausted_requires_redesign_or_user_decision',
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
  return withRunLock(target.episode.dispatchRunId, () => {
    const index = readIndex()
    const current = readEpisodeById(target.episode.episode_id)
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
