import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const source = JSON.parse(
  fs.readFileSync(
    path.join(
      repoRoot,
      '.codex/skills/dispatch-task/examples/web-external-miniprogram-runtime-handoff.json'
    ),
    'utf8'
  )
)
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-web-branch-policy-'))
const handoffPath = path.join(tempDir, 'handoff.json')
const validator = path.join(repoRoot, '.codex/skills/dispatch-task/scripts/validate-handoff.mjs')

function run(branch) {
  const handoff = structuredClone(source)
  handoff.dispatch_run_id = `web-branch-policy-${branch.replaceAll('/', '-')}`
  handoff.handoff_manual.path = `.tmp/dispatch-task/${handoff.dispatch_run_id}-handoff-manual.json`
  handoff.external_contract.remote_sync.branch = branch
  handoff.external_contract.remote_sync.push_ref = `origin/${branch}`
  fs.writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`)
  return spawnSync(process.execPath, [validator, handoffPath], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
}

const blocked = run('trae/web-branch-policy')
assert.notEqual(blocked.status, 0)
assert.match(`${blocked.stdout}\n${blocked.stderr}`, /filtered trae\//)

const visible = run('trae-test-web-branch-policy')
assert.equal(visible.status, 0, visible.stderr || visible.stdout)

fs.rmSync(tempDir, { recursive: true, force: true })
console.log('web branch policy tests passed')
