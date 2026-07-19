#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { handleHookEvent } from './lib/hook-events.mjs'
import { createQaSkeleton, readCatalog, sha256File, validateCatalog } from './lib/catalog.mjs'
import { findHandoff, inferDispatchRunId, readJson, repoRoot, stateDir } from './lib/state.mjs'

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

function stripGateArgs(rawArgs) {
  const stripped = []
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (arg === '--allow-live' || arg === '--dry-run') {
      continue
    }
    if (arg === '--catalog-id' || arg === '--execution-id') {
      index += 1
      continue
    }
    if (arg.startsWith('--catalog-id=') || arg.startsWith('--execution-id=')) {
      continue
    }
    stripped.push(arg)
  }
  return stripped
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

function print(data, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  process.exit(exitCode)
}

function hookEvent() {
  const payloadFile = argValue('payload')
  const payload = payloadFile ? readJson(payloadFile, {}) : readStdinJson()
  const result = handleHookEvent({ payload, eventName: argValue('event') })
  print(result, result.decision === 'deny' ? 2 : 0)
}

function validateE2eCatalog() {
  const report = validateCatalog()
  print(report, report.status === 'passed' ? 0 : 1)
}

function qaRun() {
  const catalogId = argValue('catalog-id')
  const executionId = argValue('execution-id')
  const dryRun = args.includes('--dry-run')
  const allowLive = args.includes('--allow-live')
  const errors = []
  if (!catalogId) {
    errors.push('--catalog-id is required')
  }
  if (!executionId || executionId.length < 8) {
    errors.push('--execution-id with at least 8 chars is required')
  }
  const catalogReport = validateCatalog()
  if (catalogReport.status !== 'passed') {
    errors.push(...catalogReport.errors)
  }
  const catalog = readCatalog()
  const entry = catalog.entries.find(item => item.id === catalogId)
  if (!entry) {
    errors.push(`unknown catalog id: ${catalogId}`)
  }
  if (entry && !dryRun && !allowLive) {
    errors.push(
      'live automator execution requires --allow-live after catalog/id-policy/hash/execution-id checks'
    )
  }
  if (errors.length) {
    print(
      {
        status: 'blocked',
        gate: 'qa_run',
        catalog_id: catalogId,
        execution_id: executionId,
        errors
      },
      1
    )
  }
  const script = path.join(repoRoot, entry.script)
  const actualHash = sha256File(script)
  const record = {
    status: dryRun ? 'passed_dry_run' : 'running',
    gate: 'qa_run',
    catalog_id: catalogId,
    execution_id: executionId,
    script: entry.script,
    script_sha256: actualHash,
    id_policy_refs: entry.required_id_policy_refs,
    started_at: new Date().toISOString()
  }
  if (dryRun) {
    print(record)
  }
  const child = spawnSync(process.execPath, [script, ...stripGateArgs(args)], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DISPATCH_QA_EXECUTION_ID: executionId }
  })
  print(
    { ...record, status: child.status === 0 ? 'passed' : 'failed', exit_code: child.status },
    child.status ?? 1
  )
}

function createSkeleton() {
  const dispatchRunId = argValue('dispatch-run-id') || inferDispatchRunId({})
  const handoffFile = argValue('handoff') || findHandoff(dispatchRunId)
  const postflightFile = argValue('postflight')
  const result = createQaSkeleton({
    dispatchRunId,
    handoff: readJson(handoffFile, {}),
    postflight: readJson(postflightFile, null)
  })
  print({ status: 'created', gate: 'qa_skeleton', file: path.relative(repoRoot, result.file) })
}

function hookSelfTest() {
  const dispatchRunId = `hook-self-test-${Date.now()}`
  const payload = {
    dispatch_run_id: dispatchRunId,
    tool_name: 'apply_patch',
    tool_input: '*** Begin Patch\\n*** End Patch'
  }
  const pre = handleHookEvent({ payload, eventName: 'PreToolUse' })
  const post = handleHookEvent({
    payload: { dispatch_run_id: dispatchRunId, tool_name: 'apply_patch' },
    eventName: 'PostToolUse'
  })
  const start = handleHookEvent({
    payload: { dispatch_run_id: dispatchRunId, agent_type: 'implementer_deep' },
    eventName: 'SubagentStart'
  })
  const stop1 = handleHookEvent({
    payload: { dispatch_run_id: dispatchRunId },
    eventName: 'SubagentStop'
  })
  const stop2 = handleHookEvent({
    payload: { dispatch_run_id: dispatchRunId },
    eventName: 'SubagentStop'
  })
  const catalog = validateCatalog()
  const statePath = path.join(stateDir(dispatchRunId), 'events.jsonl')
  const passed =
    pre.decision === 'allow' &&
    post.decision === 'allow' &&
    start.task_card?.status === 'injected' &&
    stop1.summary_emitted === true &&
    stop2.summary_emitted === false &&
    fs.existsSync(statePath) &&
    catalog.status === 'passed'
  print(
    {
      status: passed ? 'passed' : 'failed',
      gate: 'hook_self_test',
      dispatch_run_id: dispatchRunId,
      state_path: path.relative(repoRoot, statePath),
      checks: { pre, post, start, stop1, stop2, catalog_status: catalog.status },
      errors: catalog.errors
    },
    passed ? 0 : 1
  )
}

if (command === 'hook-event') {
  hookEvent()
} else if (command === 'validate-e2e-catalog') {
  validateE2eCatalog()
} else if (command === 'qa-run') {
  qaRun()
} else if (command === 'create-qa-skeleton') {
  createSkeleton()
} else if (command === 'hook-self-test') {
  hookSelfTest()
} else {
  print(
    {
      status: 'usage',
      commands: [
        'hook-event',
        'validate-e2e-catalog',
        'qa-run',
        'create-qa-skeleton',
        'hook-self-test'
      ]
    },
    2
  )
}
