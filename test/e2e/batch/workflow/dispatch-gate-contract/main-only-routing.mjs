import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const handoffValidator = path.join(repoRoot, '.codex/skills/dispatch-task/scripts/validate-handoff.mjs')
const resultValidator = path.join(repoRoot, '.codex/skills/dispatch-task/scripts/validate-result.mjs')
const exampleHandoff = path.join(repoRoot, '.codex/skills/dispatch-task/examples/普通代码任务-handoff.json')
const exampleResult = path.join(repoRoot, '.codex/skills/dispatch-task/examples/普通代码任务-implementer-result.json')
const tempDir = path.join(repoRoot, '.tmp/dispatch-task/main-only-routing-test')
fs.mkdirSync(tempDir, { recursive: true })

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: 'utf8' })
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

const mainHandoff = JSON.parse(fs.readFileSync(exampleHandoff, 'utf8'))
const mainHandoffFile = path.join(tempDir, 'main-handoff.json')
writeJson(mainHandoffFile, mainHandoff)
const acceptedHandoff = run(handoffValidator, [mainHandoffFile])
assert.equal(acceptedHandoff.status, 0, acceptedHandoff.stderr || acceptedHandoff.stdout)

const mainResultFile = path.join(tempDir, 'main-result.json')
writeJson(mainResultFile, JSON.parse(fs.readFileSync(exampleResult, 'utf8')))
const acceptedResult = run(resultValidator, ['main', mainHandoffFile, mainResultFile])
assert.equal(acceptedResult.status, 0, acceptedResult.stderr || acceptedResult.stdout)

const legacyHandoff = {
  ...mainHandoff,
  dispatch_run_id: 'main-only-routing-legacy-rejection',
  implementation_mode: 'codex_subagent',
  target_role: 'implementer_fast',
  spawn_contract: { implementer_agent_type: 'implementer_fast' }
}
const legacyHandoffFile = path.join(tempDir, 'legacy-handoff.json')
writeJson(legacyHandoffFile, legacyHandoff)
const rejectedLegacy = run(handoffValidator, [legacyHandoffFile])
assert.notEqual(rejectedLegacy.status, 0, 'codex_subagent must be rejected')
assert.match(
  `${rejectedLegacy.stdout}\n${rejectedLegacy.stderr}`,
  /implementation_mode must be main_direct\|external_implementer\|zcode_external/
)

const internalAgentsDir = path.join(repoRoot, '.codex/agents')
const remainingAgentFiles = fs.existsSync(internalAgentsDir)
  ? fs.readdirSync(internalAgentsDir).filter(file => file.endsWith('.toml'))
  : []
assert.deepEqual(remainingAgentFiles, [], 'dispatch-task must not expose internal agent configs')

fs.rmSync(tempDir, { recursive: true, force: true })
console.log(JSON.stringify({ status: 'passed', gate: 'main_only_routing' }, null, 2))
