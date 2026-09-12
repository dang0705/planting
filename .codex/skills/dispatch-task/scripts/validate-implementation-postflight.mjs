#!/usr/bin/env node
/**
 * Single postflight gate: worktree scope + no-new-deps + style-stack inlined.
 * Usage:
 *   node validate-implementation-postflight.mjs <handoff.json> <impl-result.json> <worktree-baseline.json>
 */
import fs from 'node:fs'
import {
  buildNoNewDepsReport,
  buildStyleStackReport,
  buildWorktreeScopeReport
} from './lib/implementation-postflight-checks.mjs'

const [handoffFile, resultFile, baselineFile] = process.argv.slice(2)
if (!handoffFile || !resultFile || !baselineFile) {
  console.error(
    'usage: validate-implementation-postflight.mjs <handoff.json> <implementer-or-external-result.json> <worktree-baseline.json>'
  )
  process.exit(2)
}

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2))
    process.exit(2)
  }
}

const handoff = readJson(handoffFile)
const result = readJson(resultFile)
const baseline = readJson(baselineFile)

const builderArgs = { handoff, result, baseline, baselineFile }
const worktree = buildWorktreeScopeReport(builderArgs)
const noNewDeps = buildNoNewDepsReport(builderArgs)
const styleStack = buildStyleStackReport(builderArgs)

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
