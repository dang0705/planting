import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { repoRoot } from './helpers.mjs'

const outputFile = path.join('.tmp', 'dispatch-task', `native-lifecycle-probe-${Date.now()}.jsonl`)
const probe = spawnSync(
  process.execPath,
  ['.codex/hooks/native-lifecycle-probe.mjs', '--event=SubagentStart', `--output=${outputFile}`],
  {
    cwd: repoRoot,
    input: JSON.stringify({ agent_id: 'probe-agent', dispatch_run_id: 'probe-run' }),
    encoding: 'utf8'
  }
)
assert.equal(probe.status, 0, probe.stderr || probe.stdout)
const entries = fs
  .readFileSync(path.join(repoRoot, outputFile), 'utf8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line))
assert.equal(entries.length, 1)
assert.equal(entries[0].event_name, 'SubagentStart')
assert.equal(entries[0].payload.agent_id, 'probe-agent')
fs.rmSync(path.join(repoRoot, outputFile), { force: true })
