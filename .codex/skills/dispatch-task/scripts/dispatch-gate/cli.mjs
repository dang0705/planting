#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { handleHookEvent, inspectHookCapability } from './lib/hook-events.mjs'
import { createQaSkeleton, validateCatalog } from './lib/catalog.mjs'
import {
  amendEpisode,
  auditEpisodeTrace,
  bindAgentToEpisode,
  finishEpisode,
  issueCompletionReadyAuthorization,
  linkSuccessorDispatch,
  markCompletionReady,
  migrateLegacyEpisodeLifecycle,
  openEpisode,
  openSuccessorEpisode,
  recordProviderDelivered,
  recordQaOutcome,
  recordReviewPassed,
  registerEpisodeRework,
  renderEpisodeStatus,
  startRecovery,
  watchEpisode
} from './lib/episode-state.mjs'
import { createQaRunCommands } from './lib/qa-run.mjs'
import { reconcileQaRunClassification } from './lib/qa-reconciliation.mjs'
import { findHandoff, readJson, repoRoot, stateDir, writeJsonAtomic } from './lib/state.mjs'

const [command, ...args] = process.argv.slice(2)

function argValue(name) {
  const prefix = `--${name}=`
  const hit = args.find(arg => arg.startsWith(prefix))
  if (hit) {
    return hit.slice(prefix.length)
  }
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : ''
}

function hasFlag(name) {
  return args.includes(`--${name}`)
}

function readStdinJson() {
  const raw = fs.readFileSync(0, 'utf8').trim()
  if (!raw) {
    return {}
  }
  try {
    return JSON.parse(raw)
  } catch {
    return { raw_stdin: raw }
  }
}

function emit(data, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  process.exitCode = exitCode
  return exitCode
}

const qaCommands = createQaRunCommands({ args, argValue, hasFlag, emit })

function hookEvent() {
  const payloadFile = argValue('payload')
  const payload = payloadFile ? readJson(payloadFile, {}) : readStdinJson()
  const result = handleHookEvent({ payload, eventName: argValue('event') })
  const denied = result.hookSpecificOutput?.permissionDecision === 'deny'
  return emit(result, denied ? 2 : 0)
}

function validateE2eCatalog() {
  const report = validateCatalog()
  return emit(report, report.status === 'passed' ? 0 : 1)
}

function createSkeleton() {
  const dispatchRunId = argValue('dispatch-run-id')
  const handoffFile = argValue('handoff') || findHandoff(dispatchRunId)
  if (!dispatchRunId || !handoffFile) {
    return emit(
      {
        status: 'blocked',
        gate: 'qa_skeleton',
        errors: ['explicit dispatch run and handoff are required']
      },
      1
    )
  }
  const result = createQaSkeleton({
    dispatchRunId,
    handoff: readJson(handoffFile, {}),
    postflight: readJson(argValue('postflight'), null)
  })
  return emit({
    status: 'created',
    gate: 'qa_skeleton',
    file: path.relative(repoRoot, result.file)
  })
}

function hookSelfTest() {
  const dispatchRunId = `hook-self-test-${Date.now()}`
  const objectiveKey = `hook-self-test-objective-${Date.now()}`
  const handoffFile = path.join(repoRoot, '.tmp', 'dispatch-task', `${dispatchRunId}-handoff.json`)
  writeJsonAtomic(handoffFile, {
    dispatch_run_id: dispatchRunId,
    dispatch_tier: 'deep_contract',
    allowed_paths: ['.codex/**', 'docs/**', 'package.json', 'scripts/**', 'test/**', 'AGENTS.md'],
    forbidden_paths: ['src/**', 'cloudfunctions/**'],
    task: { code_changes_required: true, qa_required: true },
    feature_test_plan: {
      required: true,
      targets: ['test/e2e/batch/workflow/dispatch-gate-contract.mjs'],
      commands: ['node test/e2e/batch/workflow/dispatch-gate-contract.mjs']
    },
    brv_relevance: { required: false, child_brv_allowed: false },
    figma: { required: false, link: '', mode: 'internal_mcp' },
    e2e_plan: { required: true, automator_required: true, catalog_required: true },
    validation: {
      runtime_acceptance_mode: 'automator_required',
      miniprogram_automator_required: true
    }
  })
  const opened = openEpisode({ dispatchRunId, objectiveKey })
  const agentId = `hook-self-test-agent-${Date.now()}`
  const bound = bindAgentToEpisode({ dispatchRunId, agentId, agentType: 'implementer_deep' })
  const payload = {
    dispatch_run_id: dispatchRunId,
    agent_id: agentId,
    tool_name: 'apply_patch',
    tool_input: {
      command: '*** Begin Patch\n*** Add File: test/tmp-self-test.txt\n+ok\n*** End Patch'
    }
  }
  const pre = handleHookEvent({ payload, eventName: 'PreToolUse' })
  const post = handleHookEvent({ payload, eventName: 'PostToolUse' })
  const capability = inspectHookCapability({})
  const catalog = validateCatalog()
  const statePath = path.join(stateDir(dispatchRunId), 'events.jsonl')
  const passed =
    opened.status === 'opened' &&
    bound.status === 'bound' &&
    pre.hookSpecificOutput?.permissionDecision !== 'deny' &&
    post.hookSpecificOutput?.hookEventName === 'PostToolUse' &&
    capability.status === 'cli_fallback' &&
    fs.existsSync(statePath) &&
    catalog.status === 'passed'
  // Exercise the continuation contract lifecycle so hook-self-test also proves the
  // completion_ready gate. Provider delivery must never finish the episode; only
  // completion_ready (authorized by validate-completion-readiness) authorizes completed.
  const providerDelivered = recordProviderDelivered({
    dispatchRunId,
    objectiveKey,
    providerOutcome: 'delivered',
    evidence: 'hook-self-test-synthetic'
  })
  const prematureFinish = finishEpisode({ dispatchRunId, status: 'completed' })
  const recoveryStarted = startRecovery({ dispatchRunId, objectiveKey })
  const reviewPassed = recordReviewPassed({
    dispatchRunId,
    objectiveKey,
    reviewSummary: 'hook-self-test-synthetic-review'
  })
  const qaOutcome = recordQaOutcome({
    dispatchRunId,
    objectiveKey,
    qaStatus: 'not_required',
    qaEvidence: 'hook-self-test-synthetic-qa'
  })
  const completionReadyAuthorization = issueCompletionReadyAuthorization({
    dispatchRunId,
    handoffFile,
    implementationResultFile: handoffFile,
    postflightReportFile: handoffFile,
    runtimeQaEvidenceFile: null
  })
  const completionReady = markCompletionReady({
    dispatchRunId,
    objectiveKey,
    authorizationProof: completionReadyAuthorization
  })
  // P0-2 regression: the public CLI mark-completion-ready action must reject
  // because it cannot construct the unforgeable authorization proof.
  const cliMarkRejected = spawnSync(
    process.execPath,
    [process.argv[1], 'episode', 'mark-completion-ready', `--dispatch-run-id=${dispatchRunId}`],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  const lifecyclePassed =
    passed &&
    providerDelivered.status === 'provider_delivered' &&
    prematureFinish.status === 'blocked' &&
    prematureFinish.reason === 'completion_requires_completion_ready_lifecycle_stage' &&
    recoveryStarted.status === 'recovery_in_progress' &&
    reviewPassed.status === 'review_passed' &&
    qaOutcome.status === 'qa_not_required' &&
    completionReady.status === 'completion_ready' &&
    cliMarkRejected.status !== 0
  const finished = finishEpisode({
    dispatchRunId,
    status: lifecyclePassed ? 'completed' : 'aborted'
  })
  const cleanupTargets = {
    handoff: handoffFile,
    run_state: stateDir(dispatchRunId),
    episode: path.join(
      repoRoot,
      '.tmp',
      'dispatch-task',
      'episodes',
      `${opened.episode?.episode_id ?? 'unavailable'}.json`
    )
  }
  if (lifecyclePassed && finished.status === 'finished') {
    fs.rmSync(cleanupTargets.handoff, { force: true })
    fs.rmSync(cleanupTargets.run_state, { recursive: true, force: true })
    fs.rmSync(cleanupTargets.episode, { force: true })
  }
  return emit(
    {
      status: lifecyclePassed && finished.status === 'finished' ? 'passed' : 'failed',
      gate: 'hook_self_test',
      dispatch_run_id: dispatchRunId,
      state_path: path.relative(repoRoot, statePath),
      cleaned_up: lifecyclePassed && finished.status === 'finished',
      hook_capability: capability,
      checks: {
        opened: opened.status,
        bound: bound.status,
        pre,
        post,
        provider_delivered: providerDelivered.status,
        premature_finish_blocked: prematureFinish.status === 'blocked',
        recovery_started: recoveryStarted.status,
        review_passed: reviewPassed.status,
        qa_outcome: qaOutcome.status,
        completion_ready: completionReady.status,
        cli_mark_completion_ready_rejected: cliMarkRejected.status !== 0,
        finished: finished.status,
        catalog_status: catalog.status
      },
      errors: catalog.errors
    },
    lifecyclePassed && finished.status === 'finished' ? 0 : 1
  )
}

function validateE2eMigration() {
  const script = path.join(repoRoot, 'scripts', 'dispatch', 'validate-e2e-migration-inventory.mjs')
  const child = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' })
  if (child.stdout) {
    process.stdout.write(child.stdout)
  }
  if (child.stderr) {
    process.stderr.write(child.stderr)
  }
  process.exitCode = child.status ?? 1
  return process.exitCode
}

function reconcileQaRun() {
  const result = reconcileQaRunClassification({
    dispatchRunId: argValue('dispatch-run-id'),
    executionId: argValue('execution-id')
  })
  return emit(result, ['reconciled', 'already_reconciled'].includes(result.status) ? 0 : 1)
}

function episodeCommand() {
  const action = args[0]
  const dispatchRunId = argValue('dispatch-run-id')
  const objectiveKey = argValue('objective-key')
  const episodeId = argValue('episode-id')
  if (action === 'open') {
    const result = openEpisode({
      dispatchRunId,
      objectiveKey,
      metadata: {
        requested_model: argValue('requested-model'),
        reasoning_effort: argValue('reasoning-effort'),
        service_tier: argValue('service-tier')
      }
    })
    return emit(result, result.status === 'opened' ? 0 : 1)
  }
  if (action === 'amend') {
    const result = amendEpisode({
      dispatchRunId,
      objectiveKey,
      episodeId,
      amendment: argValue('amendment') || argValue('amend'),
      knowledgeScopeChanged: hasFlag('knowledge-scope-changed')
    })
    return emit(result, result.status === 'amended' ? 0 : 1)
  }
  if (action === 'bind' || action === 'start') {
    const result = bindAgentToEpisode({
      dispatchRunId,
      agentId: argValue('agent-id'),
      agentType: argValue('agent-type'),
      metadata: {
        requested_model: argValue('requested-model'),
        observed_model: argValue('observed-model'),
        reasoning_effort: argValue('reasoning-effort'),
        service_tier: argValue('service-tier')
      }
    })
    return emit(result, result.status === 'bound' ? 0 : 1)
  }
  if (action === 'rework') {
    const supersedesTarget = {}
    const successorRunId = argValue('successor-dispatch-run-id')
    const userDecisionReason = argValue('user-decision-reason')
    const fixTarget = argValue('fix-target')
    const relationship = argValue('relationship')
    if (successorRunId) supersedesTarget.successorDispatchRunId = successorRunId
    if (userDecisionReason) supersedesTarget.userDecisionReason = userDecisionReason
    if (fixTarget) supersedesTarget.fixTarget = fixTarget
    if (relationship) supersedesTarget.relationship = relationship
    const result = registerEpisodeRework({
      dispatchRunId,
      objectiveKey,
      episodeId,
      defectSignature: argValue('defect-signature'),
      summary: argValue('summary'),
      supersedesTarget: Object.keys(supersedesTarget).length ? supersedesTarget : null
    })
    return emit(result, result.status === 'rework_requested' ? 0 : 1)
  }
  if (action === 'provider-delivered') {
    const result = recordProviderDelivered({
      dispatchRunId,
      objectiveKey,
      episodeId,
      providerOutcome: argValue('provider-outcome') || 'delivered',
      evidence: argValue('evidence') || null
    })
    return emit(result, result.status === 'provider_delivered' ? 0 : 1)
  }
  if (action === 'start-recovery') {
    const result = startRecovery({
      dispatchRunId,
      objectiveKey,
      episodeId,
      recoveryMode: argValue('recovery-mode') || 'codex_main_recovery'
    })
    return emit(result, result.status === 'recovery_in_progress' ? 0 : 1)
  }
  if (action === 'review-passed') {
    const result = recordReviewPassed({
      dispatchRunId,
      objectiveKey,
      episodeId,
      reviewSummary: argValue('review-summary') || ''
    })
    return emit(result, result.status === 'review_passed' ? 0 : 1)
  }
  if (action === 'qa-outcome') {
    const result = recordQaOutcome({
      dispatchRunId,
      objectiveKey,
      episodeId,
      qaStatus: argValue('qa-status'),
      qaEvidence: argValue('qa-evidence') || null
    })
    return emit(result, ['qa_passed', 'qa_not_required'].includes(result.status) ? 0 : 1)
  }
  if (action === 'mark-completion-ready') {
    // P0-2: completion_ready must only be recorded by a successful
    // validate-completion-readiness run. The public CLI cannot construct the
    // unforgeable authorization proof (HMAC over validated evidence paths keyed
    // by a shared secret), so this action always rejects. Use
    // validate-completion-readiness.mjs, which issues the proof internally on
    // success.
    return emit(
      {
        status: 'blocked',
        reason: 'completion_ready_requires_validate_completion_readiness_authorization',
        explanation:
          'mark-completion-ready is not callable from the CLI; run validate-completion-readiness.mjs to record completion_ready on success'
      },
      1
    )
  }
  if (action === 'migrate-legacy-lifecycle') {
    const result = migrateLegacyEpisodeLifecycle({ dispatchRunId, objectiveKey, episodeId })
    return emit(
      result,
      ['migrated', 'already_migrated'].includes(result.status) ? 0 : 1
    )
  }
  if (action === 'open-successor') {
    const result = openSuccessorEpisode({
      dispatchRunId,
      objectiveKey,
      supersedesDispatchRunId: argValue('supersedes-dispatch-run-id'),
      metadata: {
        requested_model: argValue('requested-model'),
        reasoning_effort: argValue('reasoning-effort'),
        service_tier: argValue('service-tier')
      }
    })
    return emit(result, result.status === 'opened' ? 0 : 1)
  }
  if (action === 'link-successor') {
    const result = linkSuccessorDispatch({
      dispatchRunId,
      objectiveKey,
      episodeId,
      successorDispatchRunId: argValue('successor-dispatch-run-id'),
      relationship: argValue('relationship') || 'redesign_recovery'
    })
    return emit(result, ['linked', 'already_linked'].includes(result.status) ? 0 : 1)
  }
  if (action === 'status') {
    const checkpoint = watchEpisode({
      dispatchRunId,
      objectiveKey,
      episodeId,
      reason: argValue('reason'),
      reasonEvidence: argValue('reason-evidence')
    })
    if (checkpoint.status !== 'checked') {
      return emit(checkpoint, checkpoint.status === 'not_due' ? 0 : 1)
    }
    const statusCard = renderEpisodeStatus({ dispatchRunId, objectiveKey, episodeId })
    return emit({
      status: 'checked',
      checkpoint: {
        episode_id: checkpoint.episode.episode_id,
        nextCheckNotBefore: checkpoint.episode.monitoring.nextCheckNotBefore,
        checks_completed: checkpoint.episode.monitoring.checks_completed
      },
      status_card: statusCard
    })
  }
  if (action === 'watch') {
    const result = watchEpisode({
      dispatchRunId,
      objectiveKey,
      episodeId,
      reason: argValue('reason'),
      reasonEvidence: argValue('reason-evidence')
    })
    return emit(result, result.status === 'checked' || result.status === 'not_due' ? 0 : 1)
  }
  if (action === 'finish') {
    const result = finishEpisode({
      dispatchRunId,
      objectiveKey,
      episodeId,
      status: argValue('status'),
      fields: {
        implementationStatus: argValue('implementation-status') || undefined,
        reviewStatus: argValue('review-status') || undefined,
        qaStatus: argValue('qa-status') || undefined
      }
    })
    return emit(result, result.status === 'finished' ? 0 : 1)
  }
  if (action === 'trace-audit') {
    const result = auditEpisodeTrace({ dispatchRunId, objectiveKey, episodeId })
    return emit(result, result.status === 'passed' ? 0 : 1)
  }
  return emit(
    {
      status: 'usage',
      commands: [
        'episode open|bind|start|amend|rework|status|watch|finish|trace-audit',
        'episode provider-delivered|start-recovery|review-passed|qa-outcome|link-successor|migrate-legacy-lifecycle|open-successor'
      ]
    },
    2
  )
}

async function main() {
  if (command === 'hook-event') {
    return hookEvent()
  }
  if (command === 'hook-capability') {
    return emit(inspectHookCapability(readStdinJson()))
  }
  if (command === 'validate-e2e-catalog') {
    return validateE2eCatalog()
  }
  if (command === 'qa-run') {
    return qaCommands.qaRun()
  }
  if (command === 'qa-preflight') {
    return qaCommands.qaPreflight()
  }
  if (command === 'qa-reconcile') {
    return reconcileQaRun()
  }
  if (command === 'create-qa-skeleton') {
    return createSkeleton()
  }
  if (command === 'hook-self-test') {
    return hookSelfTest()
  }
  if (command === 'validate-e2e-migration') {
    return validateE2eMigration()
  }
  if (command === 'episode') {
    return episodeCommand()
  }
  return emit(
    {
      status: 'usage',
      commands: [
        'hook-event',
        'hook-capability',
        'validate-e2e-catalog',
        'validate-e2e-migration',
        'qa-run',
        'qa-preflight',
        'qa-reconcile',
        'create-qa-skeleton',
        'hook-self-test',
        'episode'
      ]
    },
    2
  )
}

await main()
