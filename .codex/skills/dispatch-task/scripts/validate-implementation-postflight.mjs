#!/usr/bin/env node
/**
 * Single postflight gate: runs worktree scope + no-new-deps + style-stack once.
 * Usage:
 *   node validate-implementation-postflight.mjs <handoff.json> <impl-result.json> <worktree-baseline.json>
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [handoffFile, resultFile, baselineFile] = process.argv.slice(2)
if (!handoffFile || !resultFile || !baselineFile) {
  console.error(
    'usage: validate-implementation-postflight.mjs <handoff.json> <implementer-or-external-result.json> <worktree-baseline.json>'
  )
  process.exit(2)
}

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2))
    process.exit(2)
  }
}
const handoff = readJson(handoffFile)
const runValidator = (scriptName, args) => {
  const scriptPath = path.join(scriptsDir, scriptName)
  const spawned = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DISPATCH_POSTFLIGHT_INTERNAL: '1' }
  })
  const stdout = String(spawned.stdout ?? '').trim()
  const stderr = String(spawned.stderr ?? '').trim()
  const payloadText = stdout || stderr
  let report = null
  try {
    report = JSON.parse(payloadText)
  } catch {
    report = {
      status: 'blocked',
      gate: scriptName,
      errors: [
        `failed to parse ${scriptName} output (exit ${spawned.status}): ${payloadText.slice(0, 500)}`
      ]
    }
  }
  return report
}

const worktree = runValidator('validate-worktree-scope.mjs', [
  handoffFile,
  resultFile,
  baselineFile
])
const noNewDeps = runValidator('validate-no-new-deps.mjs', [
  handoffFile,
  baselineFile,
  resultFile
])
const styleStack = runValidator('validate-style-stack.mjs', [
  handoffFile,
  baselineFile,
  resultFile
])

const childErrors = [
  ...(worktree.errors ?? []),
  ...(noNewDeps.errors ?? []),
  ...(styleStack.errors ?? [])
]
const statuses = [worktree.status, noNewDeps.status, styleStack.status]
const blocked = statuses.some(status => status !== 'passed') || childErrors.length > 0
const report = {
  status: blocked ? 'blocked' : 'passed',
  gate: 'implementation_postflight',
  dispatch_run_id: handoff.dispatch_run_id,
  worktree,
  no_new_deps: noNewDeps,
  style_stack: styleStack,
  errors: childErrors
}

console.log(JSON.stringify(report, null, 2))
if (blocked) {
  process.exit(1)
}
