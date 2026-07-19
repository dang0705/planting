import assert from 'node:assert/strict'

import { validateCatalog } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/catalog.mjs'
import { handleHookEvent } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/hook-events.mjs'
import { repoRoot } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/state.mjs'

assert.equal(repoRoot, process.cwd())

const catalog = validateCatalog()
assert.equal(catalog.status, 'passed', catalog.errors.join('\n'))
assert.equal(catalog.entries >= 2, true)

const normalWrite = handleHookEvent({
  eventName: 'PreToolUse',
  payload: {
    dispatch_run_id: 'unit-dispatch-gate',
    tool_name: 'apply_patch',
    tool_input: '*** Begin Patch\n*** Add File: test/unit/tmp.mjs\n+ok\n*** End Patch\n'
  }
})
assert.equal(normalWrite.decision, 'allow')

const bareAutomator = handleHookEvent({
  eventName: 'PreToolUse',
  payload: {
    dispatch_run_id: 'unit-dispatch-gate',
    tool_name: 'exec_command',
    cmd: 'node test/e2e/automator/diagnosis/diagnose-yellowing-mcp.mjs'
  }
})
assert.equal(bareAutomator.decision, 'deny')

console.log('dispatch gate unit tests passed')
