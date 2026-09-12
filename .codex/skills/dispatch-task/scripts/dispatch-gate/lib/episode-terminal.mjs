import path from 'node:path'
import { repoRoot } from './state.mjs'
import { auditEpisodeTraceRecord, renderEpisodeStatusRecord } from './episode-reporting.mjs'
import {
  appendTrace,
  COMPLETION_READY_STAGE,
  isActive,
  LEGAL_EARLY_CHECK_REASONS,
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

export function watchEpisode({
  dispatchRunId,
  objectiveKey,
  episodeId,
  reason = '',
  reasonEvidence = '',
  at = Date.now()
} = {}) {
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!isActive(target.episode))
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  const due = Date.parse(target.episode.monitoring?.nextCheckNotBefore ?? '')
  const isDue = Number.isNaN(due) || at >= due
  const legal = LEGAL_EARLY_CHECK_REASONS.has(reason)
  const evidence = String(reasonEvidence ?? '').trim()
  if (!isDue && !legal)
    return {
      status: 'not_due',
      episode_id: target.episode.episode_id,
      nextCheckNotBefore: target.episode.monitoring?.nextCheckNotBefore,
      reason: 'short_polling_forbidden'
    }
  if (!isDue && !evidence)
    return {
      status: 'blocked',
      episode_id: target.episode.episode_id,
      nextCheckNotBefore: target.episode.monitoring?.nextCheckNotBefore,
      reason: 'early_check_reason_evidence_required'
    }
  return withActiveEpisode({ dispatchRunId, objectiveKey, episodeId }, current => {
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
        reason_evidence: isDue ? null : evidence,
        nextCheckNotBefore
      }
    )
    writeEpisode(next)
    return { status: 'checked', episode: next }
  })
}

export function finishEpisode({
  dispatchRunId,
  objectiveKey,
  episodeId,
  status,
  fields = {}
} = {}) {
  if (!TERMINAL_STATUSES.has(status))
    return {
      status: 'blocked',
      reason: 'terminal_status_must_be_completed|blocked|aborted|cancelled'
    }
  const target = requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId })
  if (!target.episode) return { status: 'blocked', reason: target.reason }
  if (status === 'completed' && target.episode.circuitBreaker?.tripped)
    return {
      status: 'blocked',
      reason: 'circuit_breaker_tripped_cannot_complete',
      episode: target.episode
    }
  if (status === 'completed' && target.episode.lifecycleStage !== COMPLETION_READY_STAGE)
    return {
      status: 'blocked',
      reason: 'completion_requires_completion_ready_lifecycle_stage',
      lifecycle_stage: target.episode.lifecycleStage,
      episode: target.episode
    }
  return withActiveEpisode({ dispatchRunId, objectiveKey, episodeId }, current => {
    if (status === 'completed' && current.lifecycleStage !== COMPLETION_READY_STAGE)
      return {
        status: 'blocked',
        reason: 'completion_requires_completion_ready_lifecycle_stage',
        lifecycle_stage: current.lifecycleStage
      }
    const index = readIndex()
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
    if (index.objectives[current.objective_key] === current.episode_id)
      delete index.objectives[current.objective_key]
    if (index.dispatch_runs[current.dispatchRunId] === current.episode_id)
      delete index.dispatch_runs[current.dispatchRunId]
    for (const id of Object.keys(current.agent_bindings ?? {}))
      if (index.agents[id] === current.episode_id) delete index.agents[id]
    writeIndex(index)
    writeEpisode(next)
    return { status: 'finished', episode: next }
  })
}

export function renderEpisodeStatus(input) {
  const target = requireActiveEpisode(input)
  return target.episode
    ? renderEpisodeStatusRecord(target.episode, { maxReworkBatches: MAX_REWORK_BATCHES })
    : { status: 'unavailable', reason: target.reason }
}
export function auditEpisodeTrace(input) {
  const target = requireActiveEpisode(input)
  return target.episode
    ? auditEpisodeTraceRecord(target.episode, {
        maxReworkBatches: MAX_REWORK_BATCHES,
        legalEarlyCheckReasons: LEGAL_EARLY_CHECK_REASONS
      })
    : { status: 'blocked', errors: [target.reason] }
}
export const defaultProjectPath = () => path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
