import fs from 'node:fs'
import path from 'node:path'
import { dispatchRoot, normalizePath, readJson } from './state.mjs'

export function eventNameFrom(payload, fallback) {
  return (
    fallback ||
    payload.hook_event_name ||
    payload.hookEventName ||
    payload.event ||
    process.env.CODEX_HOOK_EVENT ||
    'Unknown'
  )
}

export function agentIdFrom(payload = {}) {
  return String(payload.agent_id ?? payload.agentId ?? payload?.subagent?.id ?? '').trim()
}

export function requestedDispatchRunId(payload = {}) {
  return String(
    payload.dispatch_run_id ?? payload.dispatchRunId ?? payload?.handoff?.dispatch_run_id ?? ''
  ).trim()
}

export function toolName(payload) {
  return String(payload.tool_name || payload.tool || payload.name || '')
}

export function inputCommand(payload) {
  const input = payload.tool_input ?? payload.toolInput ?? payload.input ?? {}
  if (typeof input === 'string') {
    return input
  }
  return String(input.command || input.cmd || input.patch || '')
}

export function payloadText(payload) {
  return JSON.stringify(payload)
}

export function pathsFromPayload(payload) {
  const paths = []
  for (const match of payloadText(payload).matchAll(
    /(?:^|["'\s])((?:\.?\/?)?(?:AGENTS\.md|package\.json|(?:src|cloudfunctions|scripts|test|\.codex|docs)[^"'\s,;)]*))/g
  )) {
    paths.push(normalizePath(match[1]))
  }
  return [...new Set(paths)]
}

export function globToRegExp(pattern) {
  let source = normalizePath(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&')
  source = source
    .replace(/\*\*/g, '§§DOUBLE§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLE§§/g, '.*')
  return new RegExp(`^${source}$`)
}

export function matchesAny(file, patterns = []) {
  return patterns.some(pattern => globToRegExp(pattern).test(normalizePath(file)))
}

export function isWriteLike(payload) {
  const tool = toolName(payload).toLowerCase()
  const text = payloadText(payload).toLowerCase()
  return (
    tool.includes('apply_patch') ||
    /(?:^|\s)(mv|cp|rm|perl\s+-[^\n]*i|sed\s+-[^\n]*i|git\s+(?:reset|checkout|restore))\b/.test(
      text
    )
  )
}

export function isCodeEdit(payload) {
  if (!isWriteLike(payload)) {
    return false
  }
  return pathsFromPayload(payload).some(file =>
    matchesAny(file, [
      'src/**',
      'cloudfunctions/**',
      '.codex/**',
      'docs/**',
      'package.json',
      'scripts/**',
      'test/**',
      'AGENTS.md'
    ])
  )
}

export function isBareAutomatorRun(payload) {
  const text = payloadText(payload)
  return (
    /(?:node|npm\s+run)\s+[^"\n]*(?:test\/e2e\/automator|e2e:watering)/.test(text) &&
    !/dispatch-gate\/cli\.mjs\s+qa-run/.test(text)
  )
}

export function isQaEvidenceForgery(payload) {
  const text = payloadText(payload)
  return (
    /runtime-qa-evidence\.json|qa[-_]?evidence|acceptance/.test(text) && isBareAutomatorRun(payload)
  )
}

export function commandStatus(payload) {
  const response = payload.tool_response ?? payload.toolResponse ?? payload.output ?? {}
  const raw =
    response.exit_code ??
    response.exitCode ??
    response.status ??
    response.code ??
    payload.exit_code ??
    payload.status
  if (raw === undefined || raw === null || raw === '') {
    return null
  }
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : raw
}

export function commandSucceeded(payload) {
  const status = commandStatus(payload)
  return status === 0 || status === 'passed' || status === 'success'
}

export function figmaCallName(payload) {
  const raw = toolName(payload)
  const text = `${raw} ${payloadText(payload)}`
  const match = text.match(
    /(?:^|[_\s])((?:get_metadata|get_design_context|get_screenshot|get_variable_defs|get_assets|get_code))(?:$|[_\s])/i
  )
  return /figma/i.test(text) && match ? match[1].toLowerCase() : ''
}

export function isExternalFigmaRecovery(payload) {
  const text = payloadText(payload)
  return (
    payload.figma_external_prompt_recovery === true ||
    /external_prompt_recovery/.test(text) ||
    (/validate-result\.mjs\s+external/.test(text) && /figma_fetch_evidence/.test(text))
  )
}

function requiredFigmaCalls(figma = {}) {
  const declared =
    figma.required_calls ??
    figma.required_tool_calls ??
    figma.required_tools ??
    figma.calls_required
  if (Array.isArray(declared) && declared.length) {
    return declared.map(call => String(call).toLowerCase())
  }
  const calls = ['get_metadata', 'get_design_context']
  if (figma.screenshot_required === true && figma.screenshot_policy_skip !== true) {
    calls.push('get_screenshot')
  }
  return calls
}

export function normalizeRequirements(handoff = {}) {
  const brv = handoff.brv_relevance ?? { required: false }
  const figma = handoff.figma ?? {
    required: Boolean(handoff.figma_link || handoff?.ui?.figma_link),
    link: handoff.figma_link || handoff?.ui?.figma_link || '',
    mode: 'internal_mcp'
  }
  const testCommands =
    handoff.feature_test_plan?.commands ?? handoff.project_constraints?.test_commands ?? []
  return {
    brv: {
      required: brv.required === true,
      recall_packet_path: brv.recall_packet_path ?? '',
      child_brv_allowed: brv.child_brv_allowed === true
    },
    figma: { ...figma, required_calls: requiredFigmaCalls(figma) },
    feature: {
      required:
        handoff.feature_test_plan?.required ?? handoff?.task?.code_changes_required === true,
      commands: testCommands.filter(command => !/test\/unit\/run-all\.mjs$/.test(command))
    }
  }
}

export function readRecallPacket(handoff = {}) {
  const raw = normalizeRequirements(handoff).brv.recall_packet_path
  if (!raw) {
    return { status: 'not_provided' }
  }
  const file = path.resolve(raw)
  if (!file.startsWith(`${path.resolve(dispatchRoot)}${path.sep}`)) {
    return { status: 'invalid_packet_path' }
  }
  if (!fs.existsSync(file)) {
    return { status: 'missing_packet' }
  }
  const packet = readJson(file, null)
  return {
    status: packet?.status ?? 'read',
    dispatch_run_id: packet?.dispatch_run_id ?? null,
    source: path.relative(process.cwd(), file)
  }
}

export function payloadRuntimeMetadata(payload = {}) {
  const usage = payload.usage ?? payload.token_usage ?? payload.tokens ?? {}
  return {
    requested_model: payload.requested_model ?? payload.requestedModel,
    observed_model: payload.observed_model ?? payload.observedModel ?? payload.model,
    reasoning_effort: payload.reasoning_effort ?? payload.reasoningEffort,
    service_tier: payload.service_tier ?? payload.serviceTier,
    service_tier_available: payload.service_tier_available,
    usage: {
      input_tokens: usage.input_tokens ?? usage.input ?? payload.input_tokens,
      cached_input_tokens:
        usage.cached_input_tokens ?? usage.cached_input ?? payload.cached_input_tokens,
      output_tokens: usage.output_tokens ?? usage.output ?? payload.output_tokens,
      reasoning_tokens: usage.reasoning_tokens ?? usage.reasoning ?? payload.reasoning_tokens,
      total_tokens: usage.total_tokens ?? usage.total ?? payload.total_tokens,
      compactions: usage.compactions ?? payload.compactions
    }
  }
}
