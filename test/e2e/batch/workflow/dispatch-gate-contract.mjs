#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const cli = '.codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs'

function run(args, input = '') {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    input,
    encoding: 'utf8'
  })
}

function parse(result) {
  assert.ok(result.stdout, result.stderr || 'expected stdout')
  return JSON.parse(result.stdout)
}

const hooks = JSON.parse(fs.readFileSync('.codex/hooks.json', 'utf8'))
for (const event of ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop']) {
  assert.ok(hooks.hooks[event], `${event} hook must be configured`)
  const command = hooks.hooks[event][0].hooks[0].command
  assert.match(command, /dispatch-gate-adapter\.mjs/, `${event} must use thin adapter`)
}

const catalog = run(['validate-e2e-catalog'])
assert.equal(catalog.status, 0, catalog.stderr || catalog.stdout)
assert.equal(parse(catalog).status, 'passed')

const allowPayload = JSON.stringify({
  dispatch_run_id: 'dispatch-gate-contract-test',
  tool_name: 'apply_patch',
  tool_input: '*** Begin Patch\n*** Add File: test/tmp-ok.txt\n+ok\n*** End Patch\n'
})
const allowResult = run(['hook-event', '--event=PreToolUse'], allowPayload)
assert.equal(allowResult.status, 0, allowResult.stderr || allowResult.stdout)
assert.equal(parse(allowResult).decision, 'allow')

const denyPayload = JSON.stringify({
  dispatch_run_id: 'dispatch-hooks-v1-20260719',
  tool_name: 'apply_patch',
  tool_input:
    '*** Begin Patch\n*** Update File: src/pages/index/index.vue\n@@\n+blocked\n*** End Patch\n'
})
const denyResult = run(['hook-event', '--event=PreToolUse'], denyPayload)
assert.notEqual(denyResult.status, 0, 'forbidden write-like payload must be denied')
assert.equal(parse(denyResult).decision, 'deny')

const stopPayload = JSON.stringify({ dispatch_run_id: `dispatch-gate-contract-stop-${Date.now()}` })
const stop1 = run(['hook-event', '--event=SubagentStop'], stopPayload)
const stop2 = run(['hook-event', '--event=SubagentStop'], stopPayload)
assert.equal(stop1.status, 0)
assert.equal(stop2.status, 0)
assert.equal(parse(stop1).summary_emitted, true)
assert.equal(parse(stop2).summary_emitted, false)

const qaDryRun = run([
  'qa-run',
  '--catalog-id=diagnosis.yellowing-mcp',
  '--execution-id=dispatch-gate-contract-dry-run',
  '--dry-run'
])
assert.equal(qaDryRun.status, 0, qaDryRun.stderr || qaDryRun.stdout)
assert.equal(parse(qaDryRun).status, 'passed_dry_run')

const selfTest = execFileSync(process.execPath, [cli, 'hook-self-test'], {
  cwd: repoRoot,
  encoding: 'utf8'
})
assert.equal(JSON.parse(selfTest).status, 'passed')

const skeletonRun = run([
  'create-qa-skeleton',
  '--dispatch-run-id=dispatch-gate-contract-skeleton',
  '--handoff=.tmp/dispatch-task/dispatch-hooks-v1-20260719-handoff.json'
])
assert.equal(skeletonRun.status, 0, skeletonRun.stderr || skeletonRun.stdout)
const skeletonPath = path.join(
  '.tmp',
  'dispatch-task',
  'dispatch-gate-contract-skeleton',
  'qa-skeleton.json'
)
assert.ok(fs.existsSync(skeletonPath), 'qa skeleton must be written under .tmp/dispatch-task/<run>')

console.log('dispatch gate contract E2E passed')
