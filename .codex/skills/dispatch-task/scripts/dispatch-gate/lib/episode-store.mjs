import crypto from 'node:crypto'
import path from 'node:path'
import { dispatchRoot, findHandoff, readJson, withRunLock, writeJsonAtomic } from './state.mjs'
import { mergeRuntimeMetadata, metadataFrom } from './episode-metadata.mjs'

export const EPISODES_ROOT = path.join(dispatchRoot, 'episodes')
export const EPISODE_INDEX_FILE = path.join(EPISODES_ROOT, 'index.json')
export const TERMINAL_STATUSES = new Set(['completed', 'blocked', 'aborted', 'cancelled'])
export const LEGAL_EARLY_CHECK_REASONS = new Set(['terminal', 'user_scope_change', 'true_blocker'])
export const MAX_REWORK_BATCHES = 1
export const LIFECYCLE_STAGES = [
  'implementation_running',
  'provider_delivered',
  'recovery_in_progress',
  'review_passed',
  'qa_passed',
  'qa_not_required',
  'qa_failed',
  'completion_ready'
]
export const COMPLETION_READY_STAGE = 'completion_ready'

export const now = () => new Date().toISOString()
export const asNonEmptyString = value =>
  typeof value === 'string' && value.trim() ? value.trim() : ''
const safeKey = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_')
const episodeFile = episodeId => path.join(EPISODES_ROOT, `${safeKey(episodeId)}.json`)
const createEpisodeId = (runId, objective) =>
  `${safeKey(runId)}-${crypto.createHash('sha256').update(`${runId}:${objective}`).digest('hex').slice(0, 12)}`

export const emptyIndex = () => ({ version: 1, objectives: {}, dispatch_runs: {}, agents: {} })
export const readIndex = () => readJson(EPISODE_INDEX_FILE, emptyIndex())
export const writeIndex = index => writeJsonAtomic(EPISODE_INDEX_FILE, index)
export const readEpisodeById = id => readJson(episodeFile(id), null)
export const writeEpisode = episode => {
  writeJsonAtomic(episodeFile(episode.episode_id), episode)
  return episode
}
export const isActive = episode => Boolean(episode) && !TERMINAL_STATUSES.has(episode.status)

export function appendTrace(episode, event) {
  const at = event.at ?? now()
  return {
    ...episode,
    trace: [...(episode.trace ?? []), { ...event, at }],
    last_activity_at: at,
    updated_at: now()
  }
}

export function requireActiveEpisode({ dispatchRunId, objectiveKey, episodeId } = {}) {
  const index = readIndex()
  const resolved =
    episodeId ||
    (objectiveKey ? index.objectives[objectiveKey] : index.dispatch_runs[dispatchRunId])
  const episode = resolved ? readEpisodeById(resolved) : null
  return episode
    ? { index, episode, reason: null }
    : { index, episode: null, reason: 'episode_not_found' }
}

export function withActiveEpisode(input, callback) {
  const target = requireActiveEpisode(input)
  if (!isActive(target.episode))
    return { status: 'blocked', reason: target.reason ?? 'episode_is_terminal' }
  return withRunLock(target.episode.dispatchRunId, () =>
    callback(readEpisodeById(target.episode.episode_id), target)
  )
}

export function continuationDefaults() {
  return {
    providerDelivered: false,
    providerDeliveredAt: null,
    recoveryRequired: false,
    recoveryStartedAt: null,
    reviewPassedAt: null,
    qaOutcome: 'pending',
    completionReadyAt: null,
    completionReadyAuthorizedBy: null
  }
}

export function initialEpisode({
  dispatchRunId,
  objectiveKey,
  metadata = {},
  handoff = {},
  supersedesDispatchRunId = null
} = {}) {
  const createdAt = now()
  const interval = handoff?.dispatch_tier === 'deep_contract' ? 10 * 60 * 1000 : 5 * 60 * 1000
  return {
    version: 1,
    episode_id: createEpisodeId(dispatchRunId, objectiveKey),
    objective_key: objectiveKey,
    dispatchRunId,
    supersedesDispatchRunId,
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
    continuation: continuationDefaults(),
    successorDispatch: null,
    monitoring: {
      initial_interval_ms: interval,
      subsequent_interval_ms: 5 * 60 * 1000,
      firstCheckNotBefore: new Date(Date.now() + interval).toISOString(),
      nextCheckNotBefore: new Date(Date.now() + interval).toISOString(),
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
      {
        event: 'episode_opened',
        at: createdAt,
        reason: supersedesDispatchRunId ? 'successor_dispatch' : 'baseline'
      }
    ]
  }
}

export function updateRuntimeMetadata(episode, metadata) {
  return { ...episode, runtime: mergeRuntimeMetadata(episode.runtime, metadataFrom(metadata)) }
}

export { findHandoff }
