import path from 'node:path'
import {
  appendEvent,
  findHandoff,
  inferDispatchRunId,
  normalizePath,
  readJson,
  stateDir,
  withRunLock,
  writeJsonAtomic
} from './state.mjs'

function eventNameFrom(payload, fallback) {
  return (
    fallback ||
    payload.hook_event_name ||
    payload.hookEventName ||
    payload.event ||
    process.env.CODEX_HOOK_EVENT ||
    'Unknown'
  )
}

function payloadText(payload) {
  return JSON.stringify(payload)
}

function pathsFromPayload(payload) {
  const text = payloadText(payload)
  const paths = []
  for (const match of text.matchAll(
    /(?:^|["'\s])((?:\.?\/?)?(?:src|cloudfunctions|scripts|test|\.codex|docs)\/[^"'\s,;]+)/g
  )) {
    paths.push(normalizePath(match[1]))
  }
  return [...new Set(paths)]
}

function globToRegExp(pattern) {
  let source = normalizePath(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&')
  source = source
    .replace(/\*\*/g, '§§DOUBLE§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLE§§/g, '.*')
  return new RegExp(`^${source}$`)
}

function matchesAny(file, patterns = []) {
  return patterns.some(pattern => globToRegExp(pattern).test(normalizePath(file)))
}

function deny(reason) {
  return {
    decision: 'deny',
    reason,
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }
}

function allow(extra = {}) {
  return {
    decision: 'allow',
    hookSpecificOutput: {
      permissionDecision: 'allow'
    },
    ...extra
  }
}

function isWriteLike(payload) {
  const tool = String(payload.tool_name || payload.tool || payload.name || '').toLowerCase()
  const text = payloadText(payload).toLowerCase()
  return (
    tool.includes('apply_patch') ||
    /(?:^|\s)(mv|cp|rm|perl\s+-[^\n]*i|sed\s+-[^\n]*i|git\s+(?:reset|checkout|restore))\b/.test(
      text
    )
  )
}

function isBareAutomatorRun(payload) {
  const text = payloadText(payload)
  return (
    /node\s+test\/e2e\/automator\//.test(text) && !/dispatch-gate\/cli\.mjs\s+qa-run/.test(text)
  )
}

function preToolUse({ dispatchRunId, payload, handoff }) {
  const paths = pathsFromPayload(payload)
  if (isWriteLike(payload)) {
    const forbidden = paths.filter(file => matchesAny(file, handoff?.forbidden_paths ?? []))
    if (forbidden.length) {
      return deny(`write-like tool targets forbidden_paths: ${forbidden.join(', ')}`)
    }
  }
  if (isBareAutomatorRun(payload)) {
    return deny(
      'automator scripts must be launched through dispatch-gate qa-run with catalog id, hash check, and execution id'
    )
  }
  appendEvent(dispatchRunId, {
    event: 'PreToolUse',
    outcome: 'allow',
    paths,
    omission_policy: 'normal omissions do not block ordinary writes'
  })
  return allow({ dispatch_run_id: dispatchRunId })
}

function subagentStart({ dispatchRunId, payload }) {
  const card = {
    dispatch_run_id: dispatchRunId,
    event: 'SubagentStart',
    task_card: {
      status: 'injected',
      checklist: [
        'stay within allowed_paths',
        'do not touch forbidden_paths',
        'run feature unit tests and self-checks',
        'return one implementer JSON result'
      ]
    },
    payload_summary: {
      agent_type: payload.agent_type || payload?.subagent?.agent_type || null
    },
    created_at: new Date().toISOString()
  }
  withRunLock(dispatchRunId, () => {
    writeJsonAtomic(path.join(stateDir(dispatchRunId), 'subagent-task-card.json'), card)
  })
  appendEvent(dispatchRunId, { event: 'SubagentStart', outcome: 'task_card_injected' })
  return allow({ dispatch_run_id: dispatchRunId, task_card: card.task_card })
}

function postToolUse({ dispatchRunId, payload }) {
  appendEvent(dispatchRunId, {
    event: 'PostToolUse',
    outcome: 'telemetry_recorded',
    tool: payload.tool_name || payload.tool || payload.name || null,
    paths: pathsFromPayload(payload)
  })
  return allow({ dispatch_run_id: dispatchRunId })
}

function subagentStop({ dispatchRunId }) {
  const result = withRunLock(dispatchRunId, () => {
    const file = path.join(stateDir(dispatchRunId), 'subagent-stop-summary.json')
    const existing = readJson(file, null)
    if (existing?.summary_emitted === true) {
      return {
        output: allow({ dispatch_run_id: dispatchRunId, summary_emitted: false }),
        eventOutcome: 'summary_already_emitted'
      }
    }
    const summary = {
      dispatch_run_id: dispatchRunId,
      summary_emitted: true,
      remediation_mode: 'original_thread_once',
      blocker_policy:
        'only resource unavailable, identity/workspace contamination, or QA evidence forgery may block',
      emitted_at: new Date().toISOString()
    }
    writeJsonAtomic(file, summary)
    return {
      output: allow({ dispatch_run_id: dispatchRunId, summary_emitted: true, summary }),
      eventOutcome: 'summary_emitted_once'
    }
  })
  appendEvent(dispatchRunId, { event: 'SubagentStop', outcome: result.eventOutcome })
  return result.output
}

export function handleHookEvent({ payload = {}, eventName }) {
  const dispatchRunId = inferDispatchRunId(payload)
  const handoff = readJson(findHandoff(dispatchRunId), {})
  const name = eventNameFrom(payload, eventName)
  if (name === 'PreToolUse') {
    return preToolUse({ dispatchRunId, payload, handoff })
  }
  if (name === 'PostToolUse') {
    return postToolUse({ dispatchRunId, payload })
  }
  if (name === 'SubagentStart') {
    return subagentStart({ dispatchRunId, payload })
  }
  if (name === 'SubagentStop') {
    return subagentStop({ dispatchRunId })
  }
  appendEvent(dispatchRunId, { event: name, outcome: 'telemetry_recorded' })
  return allow({ dispatch_run_id: dispatchRunId })
}
