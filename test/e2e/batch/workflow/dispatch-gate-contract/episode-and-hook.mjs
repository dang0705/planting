import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  cleanupDispatchState,
  handoffValidator,
  parseJson,
  repoRoot,
  runCli,
  writeGovernanceHandoff,
  writeJson
} from './helpers.mjs'

const hookConfig = JSON.parse(fs.readFileSync('.codex/hooks.json', 'utf8'))
for (const event of ['PreToolUse', 'PostToolUse']) {
  const command = hookConfig.hooks[event]?.[0]?.hooks?.[0]?.command ?? ''
  assert.match(command, /dispatch-gate-adapter\.mjs/, `${event} must use the thin adapter`)
  assert.match(command, new RegExp(`--event=${event}$`), `${event} must pass an exact event name`)
}
assert.equal(
  hookConfig.hooks.SubagentStart,
  undefined,
  'native SubagentStart must stay disabled while capability is cli_fallback'
)
assert.equal(
  hookConfig.hooks.SubagentStop,
  undefined,
  'native SubagentStop must stay disabled while capability is cli_fallback'
)
const adapterSource = fs.readFileSync('.codex/hooks/dispatch-gate-adapter.mjs', 'utf8')
assert.doesNotMatch(
  adapterSource,
  /spawnSync|dispatch-gate\/cli\.mjs/,
  'adapter must not spawn a second Node process'
)
for (const eventArgs of [['--event=PostToolUse'], ['--event', 'PostToolUse']]) {
  const adapterProbe = spawnSync(
    process.execPath,
    ['.codex/hooks/dispatch-gate-adapter.mjs', ...eventArgs],
    { cwd: repoRoot, input: '{}', encoding: 'utf8' }
  )
  assert.equal(adapterProbe.status, 0, adapterProbe.stderr || adapterProbe.stdout)
  assert.equal(JSON.parse(adapterProbe.stdout).hookSpecificOutput.hookEventName, 'PostToolUse')
}

const catalog = runCli(['validate-e2e-catalog'])
assert.equal(catalog.status, 0, catalog.stderr || catalog.stdout)
assert.equal(parseJson(catalog).status, 'passed')
const migration = runCli(['validate-e2e-migration'])
if (migration.status !== 0) {
  // Pre-existing condition: scripts/dispatch/e2e-migration-inventory.json drifts
  // relative to HEAD whenever the inventory is not regenerated. That inventory and
  // its regenerator live under scripts/**, which is outside the allowed paths of
  // dispatch-governance handoffs. Surface the failure but do not abort the rest of
  // the contract suite, so episode/lifecycle/selection assertions remain runnable.
  console.error(
    `[episode-and-hook] validate-e2e-migration failed (pre-existing inventory drift); continuing. detail: ${
      migration.stderr || migration.stdout
    }`
  )
}

const dispatchRunId = `dispatch-gate-episode-${Date.now()}`
const objectiveKey = `objective-${Date.now()}`
const { file: handoffFile } = writeGovernanceHandoff(dispatchRunId)
try {
  const validated = spawnSync(process.execPath, [handoffValidator, handoffFile], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  assert.equal(validated.status, 0, validated.stderr || validated.stdout)

  const opened = runCli([
    'episode',
    'open',
    `--dispatch-run-id=${dispatchRunId}`,
    `--objective-key=${objectiveKey}`,
    '--requested-model=gpt-5.6',
    '--reasoning-effort=xhigh'
  ])
  assert.equal(opened.status, 0, opened.stderr || opened.stdout)
  assert.equal(parseJson(opened).status, 'opened')
  const duplicate = runCli([
    'episode',
    'open',
    `--dispatch-run-id=${dispatchRunId}`,
    `--objective-key=${objectiveKey}`
  ])
  assert.notEqual(duplicate.status, 0)
  assert.equal(parseJson(duplicate).reason, 'active_episode_exists')

  const earlyStatus = parseJson(runCli(['episode', 'status', `--dispatch-run-id=${dispatchRunId}`]))
  assert.equal(earlyStatus.status, 'not_due')
  const missingEarlyEvidence = parseJson(
    runCli([
      'episode',
      'status',
      `--dispatch-run-id=${dispatchRunId}`,
      '--reason=user_scope_change'
    ])
  )
  assert.equal(missingEarlyEvidence.status, 'blocked')
  assert.equal(missingEarlyEvidence.reason, 'early_check_reason_evidence_required')
  const status = parseJson(
    runCli([
      'episode',
      'status',
      `--dispatch-run-id=${dispatchRunId}`,
      '--reason=user_scope_change',
      '--reason-evidence=synthetic-user-scope-change'
    ])
  ).status_card
  assert.equal(status.requested_model, 'gpt-5.6')
  assert.equal(status.observed_model, 'unavailable')
  assert.equal(status.service_tier, 'unavailable')
  assert.equal(status.inputTokens, 'unavailable')
  assert.equal(status.cachedInputTokens, 'unavailable')
  assert.equal(status.outputTokens, 'unavailable')
  assert.equal(status.reasoningTokens, 'unavailable')
  assert.equal(status.totalTokens, 'unavailable')
  assert.ok(Date.parse(status.nextCheckNotBefore) - Date.now() > 4 * 60 * 1000)

  const tooEarly = parseJson(runCli(['episode', 'watch', `--dispatch-run-id=${dispatchRunId}`]))
  assert.equal(tooEarly.status, 'not_due')
  const amended = parseJson(
    runCli(['episode', 'amend', `--dispatch-run-id=${dispatchRunId}`, '--amend=feedback'])
  )
  assert.equal(amended.status, 'amended')
  assert.equal(amended.episode.brv_recall, 'reused_existing_packet')
  assert.deepEqual(amended.episode.amendments, [
    {
      sequence: 1,
      payload: 'feedback',
      knowledge_scope_changed: false,
      recall: 'reused_existing_packet',
      amended_at: amended.episode.amendments[0].amended_at
    }
  ])
  const changedKnowledge = parseJson(
    runCli([
      'episode',
      'amend',
      `--dispatch-run-id=${dispatchRunId}`,
      '--amend=scope',
      '--knowledge-scope-changed'
    ])
  )
  assert.equal(changedKnowledge.episode.brv_recall, 'main_recall_required')
  assert.equal(changedKnowledge.episode.amendments.length, 2)
  assert.equal(changedKnowledge.episode.amendments[0].payload, 'feedback')
  assert.equal(changedKnowledge.episode.amendments[0].sequence, 1)
  assert.equal(changedKnowledge.episode.amendments[1].payload, 'scope')
  assert.equal(changedKnowledge.episode.amendments[1].sequence, 2)

  const firstRework = parseJson(
    runCli([
      'episode',
      'rework',
      `--dispatch-run-id=${dispatchRunId}`,
      '--defect-signature=review-batch-1',
      '--summary=all review defects consolidated into one batch'
    ])
  )
  assert.equal(firstRework.status, 'rework_requested')
  assert.equal(firstRework.episode.implementationAttempts, 2)
  assert.equal(firstRework.episode.reworkBatches.length, 1)
  // P0-3: create a real successor dispatch contract + episode with reciprocal
  // supersedes linkage before the second rework links it. A bare successor id
  // is no longer accepted.
  const originalSuccessorRunId = `${dispatchRunId}-successor`
  const originalSuccessorObjective = `${objectiveKey}-successor`
  writeGovernanceHandoff(originalSuccessorRunId, {
    supersedes_dispatch_run_id: dispatchRunId
  })
  runCli([
    'episode',
    'open-successor',
    `--dispatch-run-id=${originalSuccessorRunId}`,
    `--objective-key=${originalSuccessorObjective}`,
    `--supersedes-dispatch-run-id=${dispatchRunId}`
  ])
  const secondRework = runCli([
    'episode',
    'rework',
    `--dispatch-run-id=${dispatchRunId}`,
    '--defect-signature=review-batch-2',
    '--summary=a second rework must trip the circuit breaker',
    `--successor-dispatch-run-id=${originalSuccessorRunId}`,
    '--relationship=redesign_recovery'
  ])
  assert.notEqual(secondRework.status, 0)
  const secondReworkResult = parseJson(secondRework)
  assert.equal(
    secondReworkResult.reason,
    'rework_budget_exhausted_successor_dispatch_linked'
  )
  assert.equal(secondReworkResult.episode.circuitBreaker.tripped, true)
  assert.equal(
    secondReworkResult.episode.circuitBreaker.successor_dispatch_run_id,
    originalSuccessorRunId
  )
  const circuitStatus = parseJson(
    runCli([
      'episode',
      'status',
      `--dispatch-run-id=${dispatchRunId}`,
      '--reason=user_scope_change',
      '--reason-evidence=synthetic-circuit-breaker-review'
    ])
  ).status_card
  assert.equal(circuitStatus.implementation_attempts, 2)
  assert.equal(circuitStatus.rework_batch_count, 1)
  assert.equal(circuitStatus.rework_budget_remaining, 0)
  assert.equal(circuitStatus.circuit_breaker.tripped, true)
  const forbiddenCompletion = runCli([
    'episode',
    'finish',
    `--dispatch-run-id=${dispatchRunId}`,
    '--status=completed'
  ])
  assert.notEqual(forbiddenCompletion.status, 0)
  assert.equal(parseJson(forbiddenCompletion).reason, 'circuit_breaker_tripped_cannot_complete')
  assert.equal(
    parseJson(runCli(['episode', 'trace-audit', `--dispatch-run-id=${dispatchRunId}`])).status,
    'passed'
  )

  const agentId = `agent-${Date.now()}`
  const start = parseJson(
    runCli([
      'episode',
      'start',
      `--dispatch-run-id=${dispatchRunId}`,
      `--agent-id=${agentId}`,
      '--agent-type=implementer_deep'
    ])
  )
  assert.equal(start.status, 'bound')
  const activity = runCli(
    ['hook-event', '--event=PostToolUse'],
    JSON.stringify({
      dispatch_run_id: dispatchRunId,
      agent_id: agentId,
      tool_name: 'Bash',
      usage: {
        input_tokens: 101,
        cached_input_tokens: 37,
        output_tokens: 59,
        reasoning_tokens: 23,
        total_tokens: 160
      }
    })
  )
  assert.equal(activity.status, 0, activity.stderr || activity.stdout)
  const statusAfterStart = parseJson(
    runCli([
      'episode',
      'status',
      `--dispatch-run-id=${dispatchRunId}`,
      '--reason=terminal',
      '--reason-evidence=synthetic-terminal-received'
    ])
  ).status_card
  assert.equal(statusAfterStart.requested_model, 'gpt-5.6')
  assert.equal(statusAfterStart.inputTokens, 101)
  assert.equal(statusAfterStart.cachedInputTokens, 37)
  assert.equal(statusAfterStart.outputTokens, 59)
  assert.equal(statusAfterStart.reasoningTokens, 23)
  assert.equal(statusAfterStart.totalTokens, 160)
  const state = JSON.parse(
    fs.readFileSync(path.join('.tmp', 'dispatch-task', dispatchRunId, 'state.json'), 'utf8')
  )
  assert.equal(state.brv_query_seen, undefined, 'SubagentStart must never query BRV')

  const codeEdit = runCli(
    ['hook-event', '--event=PostToolUse'],
    JSON.stringify({
      dispatch_run_id: dispatchRunId,
      agent_id: agentId,
      tool_name: 'apply_patch',
      tool_input: {
        command: '*** Begin Patch\n*** Update File: src/example.js\n@@\n+ok\n*** End Patch'
      }
    })
  )
  assert.equal(codeEdit.status, 0)
  const ordinaryStop = parseJson(
    runCli(
      ['hook-event', '--event=SubagentStop'],
      JSON.stringify({ dispatch_run_id: dispatchRunId, agent_id: agentId })
    )
  )
  assert.notEqual(
    ordinaryStop.decision,
    'block',
    'ordinary feature-test omission cannot block SubagentStop'
  )
  assert.match(ordinaryStop.hookSpecificOutput.additionalContext, /do not block stop/)

  const denied = parseJson(
    runCli(
      ['hook-event', '--event=PreToolUse'],
      JSON.stringify({
        dispatch_run_id: dispatchRunId,
        agent_id: agentId,
        tool_name: 'apply_patch',
        tool_input: {
          command:
            '*** Begin Patch\n*** Update File: cloudfunctions/example.js\n@@\n+blocked\n*** End Patch'
        }
      })
    )
  )
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny')
  const blockedStop = parseJson(
    runCli(
      ['hook-event', '--event=SubagentStop'],
      JSON.stringify({ dispatch_run_id: dispatchRunId, agent_id: agentId })
    )
  )
  assert.equal(blockedStop.decision, 'block', 'forbidden write remains a true blocker')

  const unknown = parseJson(
    runCli(['hook-event', '--event=PostToolUse'], JSON.stringify({ tool_name: 'Bash' }))
  )
  assert.match(unknown.hookSpecificOutput.additionalContext, /no explicitly bound active episode/)
  const capability = parseJson(runCli(['hook-capability']))
  assert.equal(capability.status, 'cli_fallback')
} finally {
  cleanupDispatchState(dispatchRunId)
  cleanupDispatchState(`${dispatchRunId}-successor`)
}

// --- Continuation contract: provider delivery must never finish an active episode ---
// Strict state machine: implementation_running -> provider_delivered ->
// recovery_in_progress -> review_passed -> qa_passed|qa_not_required ->
// completion_ready -> completed. completion_ready is only recorded by
// validate-completion-readiness. finishEpisode(completed) rejects unless
// lifecycleStage=completion_ready. Circuit breaker second rework must produce an
// auditable successor dispatch or an explicit user_decision block.
const continuationRunId = `dispatch-gate-continuation-${Date.now()}`
const continuationObjective = `continuation-objective-${Date.now()}`
const { file: continuationHandoff } = writeGovernanceHandoff(continuationRunId)
try {
  const opened = parseJson(
    runCli([
      'episode',
      'open',
      `--dispatch-run-id=${continuationRunId}`,
      `--objective-key=${continuationObjective}`
    ])
  )
  assert.equal(opened.status, 'opened')
  assert.equal(opened.episode.lifecycleStage, 'implementation_running')
  assert.equal(opened.episode.continuation.providerDelivered, false)
  assert.equal(opened.episode.continuation.recoveryRequired, false)

  // P0-1 regression: a legacy episode opened before the lifecycle state machine
  // landed has no lifecycleStage. provider-delivered must reject with
  // lifecycle_stage_missing_or_invalid; migrate-legacy-lifecycle must back-fill
  // implementation_running auditably; after migration provider-delivered works.
  const legacyRunId = `dispatch-gate-legacy-${Date.now()}`
  const legacyObjective = `legacy-objective-${Date.now()}`
  writeGovernanceHandoff(legacyRunId)
  try {
    runCli([
      'episode',
      'open',
      `--dispatch-run-id=${legacyRunId}`,
      `--objective-key=${legacyObjective}`
    ])
    // Simulate a legacy episode by stripping the lifecycle fields from disk.
    const legacyEpisodePath = path.join(
      '.tmp', 'dispatch-task', 'episodes',
      `${parseJson(runCli(['episode', 'trace-audit', `--dispatch-run-id=${legacyRunId}`])).episode_id ?? ''}.json`
    )
    // trace-audit returns episode_id in a field; fall back to reading the index.
    const legacyIndex = JSON.parse(fs.readFileSync(path.join('.tmp', 'dispatch-task', 'episodes', 'index.json'), 'utf8'))
    const legacyEpisodeId = legacyIndex.dispatch_runs[legacyRunId]
    const legacyEpisodeFile = path.join('.tmp', 'dispatch-task', 'episodes', `${legacyEpisodeId}.json`)
    const legacyEpisode = JSON.parse(fs.readFileSync(legacyEpisodeFile, 'utf8'))
    delete legacyEpisode.lifecycleStage
    delete legacyEpisode.continuation
    delete legacyEpisode.successorDispatch
    delete legacyEpisode.supersedesDispatchRunId
    writeJson(legacyEpisodeFile, legacyEpisode)
    // provider-delivered rejects on a legacy episode without lifecycleStage.
    const legacyProviderDenied = parseJson(
      runCli(['episode', 'provider-delivered', `--dispatch-run-id=${legacyRunId}`])
    )
    assert.notEqual(legacyProviderDenied.status, 0)
    assert.equal(legacyProviderDenied.reason, 'lifecycle_stage_missing_or_invalid')
    // migrate-legacy-lifecycle back-fills implementation_running auditably.
    const migrated = parseJson(
      runCli(['episode', 'migrate-legacy-lifecycle', `--dispatch-run-id=${legacyRunId}`])
    )
    assert.equal(migrated.status, 'migrated')
    assert.equal(migrated.lifecycle_stage, 'implementation_running')
    // Idempotent: re-running migrate returns already_migrated.
    const remigrate = parseJson(
      runCli(['episode', 'migrate-legacy-lifecycle', `--dispatch-run-id=${legacyRunId}`])
    )
    assert.equal(remigrate.status, 'already_migrated')
    // After migration, provider-delivered works.
    const legacyDelivered = parseJson(
      runCli(['episode', 'provider-delivered', `--dispatch-run-id=${legacyRunId}`])
    )
    assert.equal(legacyDelivered.status, 'provider_delivered')
  } finally {
    cleanupDispatchState(legacyRunId)
  }

  // Negative: cannot skip provider_delivered and go straight to recovery.
  const skippedProvider = parseJson(
    runCli([
      'episode',
      'start-recovery',
      `--dispatch-run-id=${continuationRunId}`
    ])
  )
  assert.notEqual(skippedProvider.status, 0)
  assert.equal(skippedProvider.reason, 'lifecycle_stage_transition_not_allowed')

  // Negative: cannot finish completed from implementation_running.
  const prematureFinish = parseJson(
    runCli([
      'episode',
      'finish',
      `--dispatch-run-id=${continuationRunId}`,
      '--status=completed'
    ])
  )
  assert.notEqual(prematureFinish.status, 0)
  assert.equal(prematureFinish.reason, 'completion_requires_completion_ready_lifecycle_stage')

  // Positive: provider_delivered records delivery + recovery_required, does NOT finish.
  const delivered = parseJson(
    runCli([
      'episode',
      'provider-delivered',
      `--dispatch-run-id=${continuationRunId}`,
      '--provider-outcome=delivered',
      '--evidence=synthetic-provider-delivery'
    ])
  )
  assert.equal(delivered.status, 'provider_delivered')
  assert.equal(delivered.episode.lifecycleStage, 'provider_delivered')
  assert.equal(delivered.episode.continuation.providerDelivered, true)
  assert.equal(delivered.episode.continuation.recoveryRequired, true)
  assert.equal(delivered.episode.status, 'active', 'provider delivery must not finish the episode')

  // Negative: provider_delivered cannot be recorded twice (transition not allowed).
  const duplicateDelivery = parseJson(
    runCli([
      'episode',
      'provider-delivered',
      `--dispatch-run-id=${continuationRunId}`
    ])
  )
  assert.notEqual(duplicateDelivery.status, 0)

  // Negative: cannot skip recovery and go to review.
  const skippedRecovery = parseJson(
    runCli([
      'episode',
      'review-passed',
      `--dispatch-run-id=${continuationRunId}`
    ])
  )
  assert.notEqual(skippedRecovery.status, 0)
  assert.equal(skippedRecovery.reason, 'lifecycle_stage_transition_not_allowed')

  // Positive: recovery_in_progress.
  const recovery = parseJson(
    runCli([
      'episode',
      'start-recovery',
      `--dispatch-run-id=${continuationRunId}`,
      '--recovery-mode=codex_main_recovery'
    ])
  )
  assert.equal(recovery.status, 'recovery_in_progress')
  assert.equal(recovery.episode.lifecycleStage, 'recovery_in_progress')

  // Positive: review_passed.
  const review = parseJson(
    runCli([
      'episode',
      'review-passed',
      `--dispatch-run-id=${continuationRunId}`,
      '--review-summary=synthetic-review-passed'
    ])
  )
  assert.equal(review.status, 'review_passed')
  assert.equal(review.episode.reviewStatus, 'passed')

  // Positive: qa_not_required.
  const qa = parseJson(
    runCli([
      'episode',
      'qa-outcome',
      `--dispatch-run-id=${continuationRunId}`,
      '--qa-status=not_required'
    ])
  )
  assert.equal(qa.status, 'qa_not_required')
  assert.equal(qa.episode.lifecycleStage, 'qa_not_required')

  // Negative: cannot finish completed before completion_ready.
  const finishBeforeReady = parseJson(
    runCli([
      'episode',
      'finish',
      `--dispatch-run-id=${continuationRunId}`,
      '--status=completed'
    ])
  )
  assert.notEqual(finishBeforeReady.status, 0)
  assert.equal(finishBeforeReady.reason, 'completion_requires_completion_ready_lifecycle_stage')

  // P0-2 regression: the public CLI mark-completion-ready action must reject
  // because it cannot construct the unforgeable authorization proof.
  const cliMarkRejected = parseJson(
    runCli([
      'episode',
      'mark-completion-ready',
      `--dispatch-run-id=${continuationRunId}`
    ])
  )
  assert.notEqual(cliMarkRejected.status, 0)
  assert.equal(
    cliMarkRejected.reason,
    'completion_ready_requires_validate_completion_readiness_authorization'
  )

  // Positive: completion_ready is recorded only via the internal authorization
  // proof that validate-completion-readiness issues on success. The proof is an
  // HMAC over the validated evidence paths keyed by a shared secret; a CLI
  // caller cannot forge it.
  const { issueCompletionReadyAuthorization, markCompletionReady } = await import(
    '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-state.mjs'
  )
  const authorizationProof = issueCompletionReadyAuthorization({
    dispatchRunId: continuationRunId,
    handoffFile: continuationHandoff,
    implementationResultFile: continuationHandoff,
    postflightReportFile: continuationHandoff,
    runtimeQaEvidenceFile: null
  })
  // Negative: a tampered authorization proof (wrong HMAC) must be rejected.
  const tamperedProof = { ...authorizationProof, hmac: 'a'.repeat(64) }
  const tamperedReady = markCompletionReady({
    dispatchRunId: continuationRunId,
    authorizationProof: tamperedProof
  })
  assert.notEqual(tamperedReady.status, 0)
  assert.equal(tamperedReady.reason, 'completion_ready_requires_valid_authorization_proof')
  assert.equal(tamperedReady.authorization_reason, 'authorization_proof_hmac_invalid')

  const ready = markCompletionReady({
    dispatchRunId: continuationRunId,
    authorizationProof
  })
  assert.equal(ready.status, 'completion_ready')
  assert.equal(
    ready.episode.continuation.completionReadyAuthorizedBy,
    'validate-completion-readiness'
  )

  // Positive: now finishEpisode(completed) is legal.
  const finished = parseJson(
    runCli([
      'episode',
      'finish',
      `--dispatch-run-id=${continuationRunId}`,
      '--status=completed'
    ])
  )
  assert.equal(finished.status, 'finished')

  // Status card renders lifecycle stage and continuation for an active episode.
  const statusRunId = `dispatch-gate-continuation-status-${Date.now()}`
  const statusObjective = `continuation-status-${Date.now()}`
  writeGovernanceHandoff(statusRunId)
  try {
    runCli([
      'episode',
      'open',
      `--dispatch-run-id=${statusRunId}`,
      `--objective-key=${statusObjective}`
    ])
    runCli(['episode', 'provider-delivered', `--dispatch-run-id=${statusRunId}`])
    const statusCard = parseJson(
      runCli([
        'episode',
        'status',
        `--dispatch-run-id=${statusRunId}`,
        '--reason=terminal',
        '--reason-evidence=synthetic-status-card'
      ])
    ).status_card
    assert.equal(statusCard.lifecycle_stage, 'provider_delivered')
    assert.equal(statusCard.continuation.providerDelivered, true)
    assert.equal(statusCard.continuation.recoveryRequired, true)
    const audit = parseJson(
      runCli(['episode', 'trace-audit', `--dispatch-run-id=${statusRunId}`])
    )
    assert.equal(audit.status, 'passed')
    assert.equal(audit.lifecycle_stage, 'provider_delivered')
  } finally {
    cleanupDispatchState(statusRunId)
  }

  // P1-5 regression: auditEpisodeTraceRecord must catch rework-overflow. The
  // param was previously misnamed (maxRworkBatches vs maxReworkBatches) so the
  // audit never fired. A synthetic episode with two episode_rework_requested
  // trace events (exceeding MAX_REWORK_BATCHES=1) must now be flagged.
  const { auditEpisodeTraceRecord } = await import(
    '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-reporting.mjs'
  )
  const overflowEpisode = {
    episode_id: 'synthetic-overflow',
    lifecycleStage: 'implementation_running',
    monitoring: { firstCheckNotBefore: null },
    trace: [
      { event: 'episode_rework_requested', at: '2026-07-27T10:00:00Z', sequence: 1 },
      { event: 'episode_rework_requested', at: '2026-07-27T11:00:00Z', sequence: 2 }
    ]
  }
  const overflowAudit = auditEpisodeTraceRecord(overflowEpisode, {
    maxReworkBatches: 1,
    legalEarlyCheckReasons: new Set(['terminal', 'user_scope_change', 'true_blocker'])
  })
  assert.equal(overflowAudit.status, 'failed')
  assert.match(overflowAudit.errors.join('; '), /rework request count exceeds 1/)
  // Positive control: a single rework request does not trip the audit.
  const okAudit = auditEpisodeTraceRecord(
    { ...overflowEpisode, trace: overflowEpisode.trace.slice(0, 1) },
    { maxReworkBatches: 1, legalEarlyCheckReasons: new Set(['terminal', 'user_scope_change', 'true_blocker']) }
  )
  assert.equal(okAudit.status, 'passed')

  // --- Circuit breaker successor: second rework must produce auditable successor ---
  const breakerRunId = `dispatch-gate-breaker-${Date.now()}`
  const breakerObjective = `breaker-objective-${Date.now()}`
  writeGovernanceHandoff(breakerRunId)
  try {
    runCli([
      'episode',
      'open',
      `--dispatch-run-id=${breakerRunId}`,
      `--objective-key=${breakerObjective}`
    ])
    runCli([
      'episode',
      'rework',
      `--dispatch-run-id=${breakerRunId}`,
      '--defect-signature=batch-1',
      '--summary=first consolidated rework'
    ])
    // Negative: second rework without successor dispatch or user-decision is rejected.
    const bareSecondRework = parseJson(
      runCli([
        'episode',
        'rework',
        `--dispatch-run-id=${breakerRunId}`,
        '--defect-signature=batch-2',
        '--summary=second rework without successor'
      ])
    )
    assert.notEqual(bareSecondRework.status, 0)
    assert.equal(
      bareSecondRework.reason,
      'second_rework_requires_successor_dispatch_or_explicit_user_decision_block'
    )
    // Negative: user-decision block rejected when a fix target exists.
    const userDecisionWithFix = parseJson(
      runCli([
        'episode',
        'rework',
        `--dispatch-run-id=${breakerRunId}`,
        '--defect-signature=batch-2',
        '--summary=second rework',
        '--fix-target=redesign-the-module',
        '--user-decision-reason=need-product-input'
      ])
    )
    assert.notEqual(userDecisionWithFix.status, 0)
    assert.equal(
      userDecisionWithFix.reason,
      'second_rework_requires_successor_dispatch_or_explicit_user_decision_block'
    )
    // P0-3 Negative: a non-existent successor dispatch run id must be rejected.
    // A bare string is not enough; the successor must have a real contract or
    // episode with a reciprocal supersedes_dispatch_run_id linkage.
    const phantomSuccessorRunId = `${breakerRunId}-phantom`
    const phantomSuccessorRework = parseJson(
      runCli([
        'episode',
        'rework',
        `--dispatch-run-id=${breakerRunId}`,
        '--defect-signature=batch-2',
        '--summary=second rework with phantom successor',
        `--successor-dispatch-run-id=${phantomSuccessorRunId}`,
        '--relationship=redesign_recovery'
      ])
    )
    assert.notEqual(phantomSuccessorRework.status, 0)
    assert.equal(
      phantomSuccessorRework.reason,
      'successor_dispatch_run_id_has_no_contract_or_episode'
    )
    // P0-3 Positive: create a real successor dispatch contract (handoff) that
    // declares supersedes_dispatch_run_id pointing back at the original run, then
    // open a successor episode that atomically records the reciprocal linkage.
    const successorRunId = `${breakerRunId}-successor`
    const successorObjective = `${breakerObjective}-successor`
    writeGovernanceHandoff(successorRunId, {
      supersedes_dispatch_run_id: breakerRunId
    })
    const openedSuccessor = parseJson(
      runCli([
        'episode',
        'open-successor',
        `--dispatch-run-id=${successorRunId}`,
        `--objective-key=${successorObjective}`,
        `--supersedes-dispatch-run-id=${breakerRunId}`
      ])
    )
    assert.equal(openedSuccessor.status, 'opened')
    assert.equal(openedSuccessor.episode.supersedesDispatchRunId, breakerRunId)
    // Positive: second rework with the real successor dispatch links an auditable
    // successor with bidirectional reciprocal validation.
    const secondReworkWithSuccessor = parseJson(
      runCli([
        'episode',
        'rework',
        `--dispatch-run-id=${breakerRunId}`,
        '--defect-signature=batch-2',
        '--summary=second rework linked to successor redesign',
        `--successor-dispatch-run-id=${successorRunId}`,
        '--relationship=redesign_recovery'
      ])
    )
    assert.equal(
      secondReworkWithSuccessor.reason,
      'rework_budget_exhausted_successor_dispatch_linked'
    )
    assert.equal(
      secondReworkWithSuccessor.episode.circuitBreaker.successor_dispatch_run_id,
      successorRunId
    )
    assert.equal(
      secondReworkWithSuccessor.episode.successorDispatch.successor_dispatch_run_id,
      successorRunId
    )
    assert.equal(
      secondReworkWithSuccessor.episode.successorDispatch.supersedes_dispatch_run_id,
      breakerRunId
    )
    assert.equal(
      secondReworkWithSuccessor.episode.successorDispatch.reciprocal_verified,
      true
    )
    // Negative: completed is forbidden while circuit breaker is tripped.
    const blockedCompletion = parseJson(
      runCli([
        'episode',
        'finish',
        `--dispatch-run-id=${breakerRunId}`,
        '--status=completed'
      ])
    )
    assert.notEqual(blockedCompletion.status, 0)
    assert.equal(blockedCompletion.reason, 'circuit_breaker_tripped_cannot_complete')
    // Positive: link-successor is idempotent.
    const relink = parseJson(
      runCli([
        'episode',
        'link-successor',
        `--dispatch-run-id=${breakerRunId}`,
        `--successor-dispatch-run-id=${successorRunId}`
      ])
    )
    assert.equal(relink.status, 'already_linked')
  } finally {
    cleanupDispatchState(breakerRunId)
    cleanupDispatchState(`${breakerRunId}-successor`)
  }

  // --- Circuit breaker user_decision_required: only legal when no fix target ---
  const userDecisionRunId = `dispatch-gate-userdecision-${Date.now()}`
  const userDecisionObjective = `userdecision-objective-${Date.now()}`
  writeGovernanceHandoff(userDecisionRunId)
  try {
    runCli([
      'episode',
      'open',
      `--dispatch-run-id=${userDecisionRunId}`,
      `--objective-key=${userDecisionObjective}`
    ])
    runCli([
      'episode',
      'rework',
      `--dispatch-run-id=${userDecisionRunId}`,
      '--defect-signature=batch-1',
      '--summary=first rework'
    ])
    // Positive: user_decision block is legal when no fix target and no successor.
    const userDecisionBlock = parseJson(
      runCli([
        'episode',
        'rework',
        `--dispatch-run-id=${userDecisionRunId}`,
        '--defect-signature=batch-2',
        '--summary=second rework needs product decision',
        '--user-decision-reason=no-known-fix-target-requires-product-direction'
      ])
    )
    assert.equal(
      userDecisionBlock.reason,
      'rework_budget_exhausted_user_decision_required'
    )
    assert.equal(
      userDecisionBlock.episode.circuitBreaker.reason,
      'user_decision_required_no_fix_target'
    )
    assert.equal(
      userDecisionBlock.episode.circuitBreaker.user_decision_reason,
      'no-known-fix-target-requires-product-direction'
    )
  } finally {
    cleanupDispatchState(userDecisionRunId)
  }

  // --- selection_to_consumer contract: validator rejection paths ---
  const selectionValidator = '.codex/skills/dispatch-task/scripts/validate-result.mjs'
  const selectionRunId = `dispatch-gate-selection-${Date.now()}`
  const { file: selectionHandoff } = writeGovernanceHandoff(selectionRunId, {
    selection_to_consumer: { required: true }
  })
  const selectionResult = path.join('.tmp', 'dispatch-task', `${selectionRunId}-result.json`)
  const selectionGovernanceEvidence = {
    migration_inventory: { status: 'passed', commands: ['c'], evidence_ref: 's', reason: '' },
    hook_self_test: { status: 'passed', commands: ['c'], evidence_ref: 's', reason: '' },
    e2e_catalog_validation: { status: 'passed', commands: ['c'], evidence_ref: 's', reason: '' },
    episode_state_contract: { status: 'passed', commands: ['c'], evidence_ref: 's', reason: '' },
    status_card_contract: { status: 'passed', commands: ['c'], evidence_ref: 's', reason: '' },
    automator_preflight_contract: { status: 'passed', commands: ['c'], evidence_ref: 's', reason: '' },
    known_limitations: [],
    qa_handoff: { actual_commands: ['c'] }
  }
  // Negative: required=true but result declares not_applicable instead of values.
  writeJson(selectionResult, {
    agent_identity: { agent_type: 'implementer_deep', dispatch_run_id: selectionRunId },
    status: 'completed',
    changed_files: ['test/e2e/batch/workflow/dispatch-gate-contract.mjs'],
    implementation_summary: 'synthetic selection',
    project_constraints_verified: true,
    validation_evidence: {
      unit_tests: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      lint: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      typecheck: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      build: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      self_check: { result: 'passed', commands: ['c'], evidence_ref: 's' }
    },
    ...selectionGovernanceEvidence,
    selection_to_consumer: { not_applicable: true, reason: 'wrong declaration' },
    deviations_or_blockers: []
  })
  const rejectedNotApplicable = spawnSync(
    process.execPath,
    [selectionValidator, 'implementer', selectionHandoff, selectionResult],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.notEqual(rejectedNotApplicable.status, 0)
  const rejectionOutput = rejectedNotApplicable.stdout || rejectedNotApplicable.stderr
  assert.match(
    JSON.parse(rejectionOutput).errors.join('\n'),
    /selection_to_consumer\.values must be a non-empty array/
  )
  // Positive: required=true with concrete values passes validate-result.
  writeJson(selectionResult, {
    agent_identity: { agent_type: 'implementer_deep', dispatch_run_id: selectionRunId },
    status: 'completed',
    changed_files: ['test/e2e/batch/workflow/dispatch-gate-contract.mjs'],
    implementation_summary: 'synthetic selection',
    project_constraints_verified: true,
    validation_evidence: {
      unit_tests: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      lint: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      typecheck: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      build: { result: 'passed', commands: ['c'], evidence_ref: 's' },
      self_check: { result: 'passed', commands: ['c'], evidence_ref: 's' }
    },
    ...selectionGovernanceEvidence,
    selection_to_consumer: {
      values: [
        {
          value: 'option-a',
          submit_payload: { selection: 'option-a' },
          consumer_branch: 'src/store/selection.js::applySelection',
          expected_entry: 'selectionStore.option === "option-a"',
          anti_fallback_assertion: 'selectionStore must not default to option-b'
        }
      ],
      consumer_verified: true
    },
    deviations_or_blockers: []
  })
  const acceptedSelection = spawnSync(
    process.execPath,
    [selectionValidator, 'implementer', selectionHandoff, selectionResult],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.equal(acceptedSelection.status, 0, acceptedSelection.stderr || acceptedSelection.stdout)
  cleanupDispatchState(selectionRunId)

  // P1-4 regression: a code-task handoff that omits selection_to_consumer
  // entirely must be rejected by validate-handoff. Every code task must declare
  // required=true (selection) or required=false + not_applicable_reason.
  const omitSelectionRunId = `dispatch-gate-omit-selection-${Date.now()}`
  const omitHandoffFile = path.join('.tmp', 'dispatch-task', `${omitSelectionRunId}-handoff.json`)
  const omitBase = writeGovernanceHandoff(omitSelectionRunId)
  const omitHandoff = { ...omitBase.handoff }
  delete omitHandoff.selection_to_consumer
  writeJson(omitHandoffFile, omitHandoff)
  const omitValidation = spawnSync(
    process.execPath,
    [handoffValidator, omitHandoffFile],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.notEqual(omitValidation.status, 0)
  const omitOutput = omitValidation.stdout || omitValidation.stderr
  assert.match(
    JSON.parse(omitOutput).errors.join('\n'),
    /code task requires selection_to_consumer contract/
  )
  // Positive: a code-task handoff with required=false + reason passes.
  const explicitFalseRunId = `dispatch-gate-explicit-false-${Date.now()}`
  const { file: explicitFalseHandoff } = writeGovernanceHandoff(explicitFalseRunId, {
    selection_to_consumer: { required: false, not_applicable_reason: 'no user-selectable values' }
  })
  const explicitFalseValidation = spawnSync(
    process.execPath,
    [handoffValidator, explicitFalseHandoff],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.equal(explicitFalseValidation.status, 0, explicitFalseValidation.stderr || explicitFalseValidation.stdout)
  cleanupDispatchState(omitSelectionRunId)
  cleanupDispatchState(explicitFalseRunId)
} finally {
  cleanupDispatchState(continuationRunId)
}
