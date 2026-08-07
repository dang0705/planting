import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { openEpisode } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-management.mjs'
import {
  markCompletionReady,
  recordProviderDelivered,
  recordQaOutcome,
  recordReviewPassed,
  startRecovery
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-lifecycle.mjs'
import {
  auditEpisodeTrace,
  finishEpisode,
  renderEpisodeStatus
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-terminal.mjs'
import { readIndex } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-store.mjs'

const run = `qa-failed-lifecycle-${Date.now()}`
const objective = `qa-failed-objective-${Date.now()}`
const handoff = path.join('.tmp', 'dispatch-task', `${run}-handoff.json`)
fs.writeFileSync(handoff, JSON.stringify({ dispatch_run_id: run, dispatch_tier: 'deep_contract' }))
try {
  assert.equal(openEpisode({ dispatchRunId: run, objectiveKey: objective }).status, 'opened')
  assert.equal(
    recordProviderDelivered({ dispatchRunId: run, objectiveKey: objective }).status,
    'provider_delivered'
  )
  assert.equal(
    startRecovery({ dispatchRunId: run, objectiveKey: objective }).status,
    'recovery_in_progress'
  )
  assert.equal(
    recordReviewPassed({ dispatchRunId: run, objectiveKey: objective }).status,
    'review_passed'
  )
  const failed = recordQaOutcome({
    dispatchRunId: run,
    objectiveKey: objective,
    qaStatus: 'failed',
    qaEvidence: { reason: 'synthetic product failure' }
  })
  assert.equal(failed.status, 'qa_failed')
  assert.equal(failed.episode.lifecycleStage, 'qa_failed')
  assert.equal(renderEpisodeStatus({ dispatchRunId: run }).qaStatus, 'failed')
  assert.equal(
    markCompletionReady({ dispatchRunId: run, objectiveKey: objective, authorizationProof: null })
      .status,
    'blocked'
  )
  const completion = finishEpisode({
    dispatchRunId: run,
    objectiveKey: objective,
    status: 'completed'
  })
  assert.equal(completion.status, 'blocked')
  assert.equal(completion.reason, 'completion_requires_completion_ready_lifecycle_stage')
  const audit = auditEpisodeTrace({ dispatchRunId: run, objectiveKey: objective })
  assert.equal(audit.status, 'passed')
  assert.equal(audit.lifecycle_stage, 'qa_failed')
} finally {
  const index = readIndex()
  const id = index.dispatch_runs[run]
  if (id) fs.rmSync(path.join('.tmp', 'dispatch-task', 'episodes', `${id}.json`), { force: true })
  delete index.dispatch_runs[run]
  delete index.objectives[objective]
  fs.writeFileSync(
    path.join('.tmp', 'dispatch-task', 'episodes', 'index.json'),
    `${JSON.stringify(index, null, 2)}\n`
  )
  fs.rmSync(handoff, { force: true })
}
console.log('qa failed lifecycle contract passed')
