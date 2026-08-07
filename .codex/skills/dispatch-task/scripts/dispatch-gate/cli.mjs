#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { handleHookEvent, inspectHookCapability } from './lib/hook-events.mjs'
import { episodeCommand, hookSelfTest } from './lib/cli-episode-commands.mjs'
import { createQaSkeleton, validateCatalog } from './lib/catalog.mjs'
import { createQaRunCommands } from './lib/qa-run.mjs'
import { reconcileQaRunClassification } from './lib/qa-reconciliation.mjs'
import { findHandoff, readJson, repoRoot } from './lib/state.mjs'

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

export function createCliQaRunCommands({
  args,
  argValue,
  hasFlag,
  emit,
  qaRunCommandFactory = createQaRunCommands
}) {
  return qaRunCommandFactory({ args, argValue, hasFlag, emit })
}

const qaCommands = createCliQaRunCommands({ command, args, argValue, hasFlag, emit })

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
    return hookSelfTest({ emit })
  }
  if (command === 'validate-e2e-migration') {
    return validateE2eMigration()
  }
  if (command === 'episode') {
    return episodeCommand({ args, argValue, hasFlag, emit })
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
