import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '../../../../..')

test('historical headless bridge is not declared as the formal ZCode route', () => {
  const routeSources = [
    '.codex/skills/dispatch-task/examples/simple-zcode-trigger.md',
    '.codex/skills/dispatch-task/examples/zcode-external-ui-handoff.json',
    '.codex/skills/dispatch-task/references/zcode-computer-use-policy.md',
    '.codex/skills/dispatch-task/references/zcode-routing.md'
  ]
    .map(file => fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    .join('\n')
  assert.match(routeSources, /current_open_chat/)
  assert.match(routeSources, /clipboard_paste/)
  assert.match(routeSources, /不得自动回退 headless|不自动触发 `zcode-headless-bridge\.mjs`/)
  assert.doesNotMatch(routeSources, /prompt_transport\s*=\s*zcode_headless_cli/)
})

test('retained headless implementation is isolated as history, not imported by visible bridge', () => {
  const visibleBridge = fs.readFileSync(
    path.join(repoRoot, '.codex/skills/dispatch-task/scripts/zcode-clipboard-bridge.mjs'),
    'utf8'
  )
  const visibleValidator = fs.readFileSync(
    path.join(repoRoot, '.codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs'),
    'utf8'
  )
  assert.doesNotMatch(visibleBridge, /zcode-headless-bridge/)
  assert.doesNotMatch(visibleValidator, /zcode-headless-bridge/)
  assert.match(visibleValidator, /transport\.kind must be zcode_visible_clipboard/)
})
