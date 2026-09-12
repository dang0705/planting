import path from 'node:path'
import {
  appendEvent,
  findHandoff,
  readJson,
  readRunState,
  stateDir,
  updateRunState,
  withRunLock,
  writeJsonAtomic
} from './state.mjs'
import {
  agentIdFrom,
  commandStatus,
  commandSucceeded,
  eventNameFrom,
  figmaCallName,
  inputCommand,
  isBareAutomatorRun,
  isCodeEdit,
  isExternalFigmaRecovery,
  isQaEvidenceForgery,
  isWriteLike,
  matchesAny,
  normalizeRequirements,
  pathsFromPayload,
  payloadRuntimeMetadata,
  readRecallPacket,
  requestedDispatchRunId,
  toolName
} from './hook-payload.mjs'
import {
  bindAgentToEpisode,
  recordEpisodeActivity,
  resolveEpisodeAttribution
} from './episode-state.mjs'

function preDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }
}

function hookContext(eventName, additionalContext, extra = {}) {
  return {
    ...extra,
    hookSpecificOutput: { hookEventName: eventName, additionalContext }
  }
}

function lifecycleCapability(payload = {}) {
  const runtime = payload.hook_runtime ?? payload.hookRuntime ?? {}
  if (runtime.surface === 'codex_desktop' && runtime.native_lifecycle_event === true) {
    return { status: 'native_supported', source: 'desktop_lifecycle_event' }
  }
  return {
    status: 'cli_fallback',
    source: 'native_lifecycle_event_unavailable',
    enforcement: 'dispatch-gate CLI lifecycle only'
  }
}

function resolveAttribution(payload) {
  const dispatchRunId = requestedDispatchRunId(payload)
  const agentId = agentIdFrom(payload)
  const episode = resolveEpisodeAttribution({ dispatchRunId, agentId })
  if (!episode || !findHandoff(episode.dispatchRunId)) {
    return null
  }
  return {
    dispatchRunId: episode.dispatchRunId,
    agentId,
    episode,
    handoff: readJson(findHandoff(episode.dispatchRunId), {})
  }
}

function recordTelemetry(attribution, event, metadata = {}) {
  const { dispatchRunId, agentId } = attribution
  const state = updateRunState(dispatchRunId, current => {
    const sequence = Number(current.sequence || 0) + 1
    const updated = { ...current, sequence, updated_at: new Date().toISOString() }
    if (event.telemetry_type === 'code_edit') {
      updated.last_code_edit_sequence = sequence
      updated.last_code_edit_at = new Date().toISOString()
      updated.last_code_edit_paths = event.paths
    }
    if (event.telemetry_type === 'feature_test' && event.success) {
      updated.last_feature_test_sequence = sequence
      updated.last_feature_test_command = event.command
    }
    if (event.telemetry_type === 'figma_mcp') {
      updated.figma_tools = [...new Set([...(updated.figma_tools ?? []), event.tool])]
      updated.figma_calls_seen = [...new Set([...(updated.figma_calls_seen ?? []), event.call])]
    }
    if (event.telemetry_type === 'figma_external_recovery') {
      updated.figma_external_recovery_seen = true
    }
    if (event.telemetry_type === 'bare_automator_troubleshooting') {
      updated.bare_automator_runs = Number(updated.bare_automator_runs || 0) + 1
    }
    if (event.true_blocker) {
      updated.true_blockers = [...(updated.true_blockers ?? []), event]
    }
    updated.hook_capability = lifecycleCapability(metadata.payload ?? {})
    return updated
  })
  appendEvent(dispatchRunId, { ...event, sequence: state.sequence })
  recordEpisodeActivity({
    dispatchRunId,
    agentId,
    event: { ...event, sequence: state.sequence },
    metadata: metadata.payload ?? metadata
  })
  return state
}

function buildActionCard(handoff) {
  const requirements = normalizeRequirements(handoff)
  return {
    dispatch_run_id: handoff.dispatch_run_id,
    status: 'injected',
    requirements,
    actions: [
      'Stay within allowed_paths and preserve forbidden_paths.',
      'Use actual tool telemetry for Figma, terminal and code edits.',
      'Run a contract-declared feature command after the final code edit.',
      'Use qa-run catalog leaves for Automator acceptance; direct runs are troubleshooting only.',
      'Do not query or write BRV. Main supplies and owns the recall packet.'
    ]
  }
}

function preToolUse({ attribution, payload }) {
  const { dispatchRunId, handoff } = attribution
  const paths = pathsFromPayload(payload)
  if (isWriteLike(payload)) {
    const forbidden = paths.filter(file => matchesAny(file, handoff?.forbidden_paths ?? []))
    if (forbidden.length) {
      recordTelemetry(
        attribution,
        {
          event: 'PreToolUse',
          outcome: 'deny',
          true_blocker: true,
          blocker_type: 'workspace_contamination',
          paths,
          reason: `write-like tool targets forbidden_paths: ${forbidden.join(', ')}`
        },
        { payload }
      )
      return preDeny(`write-like tool targets forbidden_paths: ${forbidden.join(', ')}`)
    }
  }
  if (isQaEvidenceForgery(payload)) {
    recordTelemetry(
      attribution,
      {
        event: 'PreToolUse',
        outcome: 'deny',
        true_blocker: true,
        blocker_type: 'qa_evidence_forgery',
        paths,
        reason: 'bare automator run is being used to create or claim acceptance evidence'
      },
      { payload }
    )
    return preDeny('bare automator run cannot be used to create or claim acceptance evidence')
  }
  recordTelemetry(
    attribution,
    { event: 'PreToolUse', outcome: 'allow', paths, dispatch_run_id: dispatchRunId },
    { payload }
  )
  return hookContext(
    'PreToolUse',
    'dispatch gate allowed tool call; ordinary omissions are audit-only'
  )
}

function subagentStart({ attribution, payload }) {
  const bound = attribution.agentId
    ? bindAgentToEpisode({
        dispatchRunId: attribution.dispatchRunId,
        agentId: attribution.agentId,
        agentType: payload.agent_type ?? payload?.subagent?.agent_type,
        metadata: payloadRuntimeMetadata(payload)
      })
    : null
  const card = buildActionCard(attribution.handoff)
  const packet = readRecallPacket(attribution.handoff)
  withRunLock(attribution.dispatchRunId, () => {
    writeJsonAtomic(path.join(stateDir(attribution.dispatchRunId), 'subagent-task-card.json'), {
      ...card,
      payload_summary: {
        agent_type: payload.agent_type || payload?.subagent?.agent_type || null,
        agent_id: attribution.agentId || null
      },
      brv_recall_packet: packet,
      agent_binding: bound?.status ?? 'not_bound',
      created_at: new Date().toISOString()
    })
  })
  recordTelemetry(
    attribution,
    { event: 'SubagentStart', outcome: 'task_card_injected', brv_packet_status: packet.status },
    { payload }
  )
  return hookContext('SubagentStart', `Dispatch action card:\n${JSON.stringify(card, null, 2)}`, {
    task_card: card,
    brv_recall_packet: packet,
    hook_capability: lifecycleCapability(payload)
  })
}

function postToolUse({ attribution, payload }) {
  const tool = toolName(payload)
  const command = inputCommand(payload)
  const figmaCall = figmaCallName(payload)
  const event = {
    event: 'PostToolUse',
    outcome: 'telemetry_recorded',
    tool,
    command: command || null,
    command_status: commandStatus(payload),
    paths: pathsFromPayload(payload)
  }
  if (figmaCall) {
    event.telemetry_type = 'figma_mcp'
    event.tool = tool || figmaCall
    event.call = figmaCall
    event.success = commandSucceeded(payload) !== false
  } else if (isExternalFigmaRecovery(payload)) {
    event.telemetry_type = 'figma_external_recovery'
    event.success = commandSucceeded(payload) !== false
  } else if (isBareAutomatorRun(payload)) {
    event.telemetry_type = 'bare_automator_troubleshooting'
    event.success = commandSucceeded(payload)
  } else if (isCodeEdit(payload)) {
    event.telemetry_type = 'code_edit'
  } else if (command) {
    const requirements = normalizeRequirements(attribution.handoff)
    event.telemetry_type = requirements.feature.commands.some(required =>
      command.includes(required)
    )
      ? 'feature_test'
      : 'terminal_command'
    event.success = commandSucceeded(payload)
  }
  const state = recordTelemetry(attribution, event, { payload })
  const context =
    state.last_code_edit_sequence && !state.last_feature_test_sequence
      ? 'dispatch gate recorded telemetry; feature command may be pending after the last code edit'
      : 'dispatch gate recorded telemetry'
  return hookContext('PostToolUse', context)
}

function computeOrdinaryOmissions(attribution) {
  const requirements = normalizeRequirements(attribution.handoff)
  const state = readRunState(attribution.dispatchRunId)
  const omissions = []
  if (requirements.figma.required && requirements.figma.link) {
    const seen = new Set(state.figma_calls_seen ?? [])
    const missing = requirements.figma.required_calls.filter(call => !seen.has(call))
    if (missing.length) {
      omissions.push({ type: 'figma_telemetry_missing', missing_calls: missing })
    }
  }
  const lastEdit = Number(state.last_code_edit_sequence || 0)
  const lastFeature = Number(state.last_feature_test_sequence || 0)
  if (requirements.feature.required && lastEdit > 0 && lastFeature < lastEdit) {
    omissions.push({ type: 'feature_test_after_last_edit_missing' })
  }
  if ((state.bare_automator_runs ?? 0) > 0) {
    omissions.push({ type: 'bare_automator_non_creditable' })
  }
  return { omissions, trueBlockers: state.true_blockers ?? [] }
}

function subagentStop({ attribution, payload }) {
  if (payload.stop_hook_active === true) {
    recordTelemetry(
      attribution,
      { event: 'SubagentStop', outcome: 'allow_stop_hook_active_guard' },
      { payload }
    )
    return hookContext(
      'SubagentStop',
      'dispatch gate loop guard: stop_hook_active=true, allowing stop'
    )
  }
  const reconciliation = computeOrdinaryOmissions(attribution)
  if (reconciliation.trueBlockers.length) {
    recordTelemetry(
      attribution,
      {
        event: 'SubagentStop',
        outcome: 'true_blocker',
        blocker_count: reconciliation.trueBlockers.length
      },
      { payload }
    )
    return {
      decision: 'block',
      reason: `Dispatch gate true blocker:\n${JSON.stringify(reconciliation.trueBlockers, null, 2)}`
    }
  }
  withRunLock(attribution.dispatchRunId, () => {
    writeJsonAtomic(path.join(stateDir(attribution.dispatchRunId), 'subagent-stop-summary.json'), {
      dispatch_run_id: attribution.dispatchRunId,
      ordinary_omissions: reconciliation.omissions,
      enforcement: 'audit_only_no_subagent_stop_block',
      emitted_at: new Date().toISOString()
    })
  })
  recordTelemetry(
    attribution,
    {
      event: 'SubagentStop',
      outcome: 'ordinary_omissions_recorded',
      omissions: reconciliation.omissions
    },
    { payload }
  )
  return hookContext(
    'SubagentStop',
    'dispatch gate reconciliation recorded; ordinary omissions do not block stop',
    {
      ordinary_omissions: reconciliation.omissions
    }
  )
}

export function handleHookEvent({ payload = {}, eventName }) {
  const name = eventNameFrom(payload, eventName)
  const attribution = resolveAttribution(payload)
  if (!attribution) {
    return hookContext(
      name,
      'dispatch gate inactive: no explicitly bound active episode; CLI lifecycle fallback'
    )
  }
  if (name === 'PreToolUse') {
    return preToolUse({ attribution, payload })
  }
  if (name === 'PostToolUse') {
    return postToolUse({ attribution, payload })
  }
  if (name === 'SubagentStart') {
    return subagentStart({ attribution, payload })
  }
  if (name === 'SubagentStop') {
    return subagentStop({ attribution, payload })
  }
  recordTelemetry(attribution, { event: name, outcome: 'telemetry_recorded' }, { payload })
  return hookContext(name, 'dispatch gate recorded event')
}

export function inspectHookCapability(payload = {}) {
  return lifecycleCapability(payload)
}
