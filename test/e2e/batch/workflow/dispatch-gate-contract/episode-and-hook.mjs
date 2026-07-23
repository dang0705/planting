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
  writeGovernanceHandoff
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
assert.equal(migration.status, 0, migration.stderr || migration.stdout)
assert.equal(parseJson(migration).status, 'passed')

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
  const secondRework = runCli([
    'episode',
    'rework',
    `--dispatch-run-id=${dispatchRunId}`,
    '--defect-signature=review-batch-2',
    '--summary=a second rework must trip the circuit breaker'
  ])
  assert.notEqual(secondRework.status, 0)
  const secondReworkResult = parseJson(secondRework)
  assert.equal(
    secondReworkResult.reason,
    'rework_budget_exhausted_requires_redesign_or_user_decision'
  )
  assert.equal(secondReworkResult.episode.circuitBreaker.tripped, true)
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
}
