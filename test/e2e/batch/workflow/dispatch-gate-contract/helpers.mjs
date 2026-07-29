import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const repoRoot = process.cwd()
export const cli = '.codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs'
export const handoffValidator = '.codex/skills/dispatch-task/scripts/validate-handoff.mjs'
export const resultValidator = '.codex/skills/dispatch-task/scripts/validate-result.mjs'

export function runCli(args, input = '') {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repoRoot, input, encoding: 'utf8' })
}

export function parseJson(result) {
  assert.ok(result.stdout, result.stderr || 'expected JSON stdout')
  const lines = result.stdout.trim().split('\n')
  const firstJson = lines.findIndex(line => line.trim().startsWith('{'))
  return JSON.parse(lines.slice(firstJson).join('\n'))
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function writeGovernanceHandoff(dispatchRunId, patch = {}) {
  const file = path.join('.tmp', 'dispatch-task', `${dispatchRunId}-handoff.json`)
  const packet = path.join('.tmp', 'dispatch-task', `${dispatchRunId}-brv-recall.json`)
  writeJson(packet, { dispatch_run_id: dispatchRunId, status: 'governance_audit' })
  const handoff = {
    dispatch_run_id: dispatchRunId,
    dispatch_tier: 'deep_contract',
    implementation_mode: 'codex_subagent',
    task: {
      objective: 'synthetic dispatch governance contract',
      code_changes_required: true,
      ui_task: false,
      risk: 'high',
      qa_required: true
    },
    target_role: 'implementer_deep',
    spawn_contract: {
      implementer_agent_type: 'implementer_deep',
      qa_agent_type: null,
      context_mode: 'isolated',
      generic_fallback_forbidden: true,
      identity_receipt_required: true
    },
    allowed_paths: [
      '.codex/**',
      '.codex/hooks.json',
      '.codex/hooks/**',
      '.codex/skills/dispatch-task/**',
      'scripts/**',
      'test/**',
      'package.json',
      'AGENTS.md'
    ],
    forbidden_paths: ['src/**', 'cloudfunctions/**'],
    acceptance: ['hook episode catalog automator preflight governance'],
    project_constraints: {
      rule_refs: ['AGENTS.md#QA行为约束'],
      framework: 'Node.js ESM',
      dependency_policy: 'no_new_dependencies',
      test_commands: [
        'node test/e2e/batch/workflow/dispatch-gate-contract.mjs',
        'node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs hook-self-test',
        'node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs validate-e2e-catalog'
      ]
    },
    decision_lock: {
      level: 'strict',
      architecture_invariants: ['one active episode'],
      local_decisions_allowed: ['synthetic testing']
    },
    brv_relevance: {
      required: false,
      recall_packet_path: packet,
      child_brv_allowed: false
    },
    figma: { required: false, link: '', mode: 'internal_mcp' },
    feature_test_plan: {
      required: true,
      targets: ['test/e2e/batch/workflow/dispatch-gate-contract.mjs'],
      commands: ['node test/e2e/batch/workflow/dispatch-gate-contract.mjs']
    },
    e2e_plan: { required: true, automator_required: true, catalog_required: true },
    validation: {
      miniprogram_automator_required: true,
      runtime_acceptance_mode: 'automator_required',
      worktree_baseline_path: `.tmp/dispatch-task/${dispatchRunId}-baseline.json`
    },
    output_evidence_required: [
      'validation_evidence',
      'episode_state_contract',
      'status_card_contract',
      'automator_preflight_contract',
      'known_limitations'
    ],
    selection_to_consumer: {
      required: false,
      not_applicable_reason: 'synthetic governance contract has no user-selectable values'
    },
    ...patch
  }
  writeJson(file, handoff)
  return { file, handoff, packet }
}

export function cleanupDispatchState(dispatchRunId) {
  const episodeIndexFile = path.join('.tmp', 'dispatch-task', 'episodes', 'index.json')
  const index = (() => {
    try {
      return JSON.parse(fs.readFileSync(episodeIndexFile, 'utf8'))
    } catch {
      return null
    }
  })()
  const episodeId = index?.dispatch_runs?.[dispatchRunId]
  if (index && episodeId) {
    for (const [objective, id] of Object.entries(index.objectives ?? {})) {
      if (id === episodeId) {
        delete index.objectives[objective]
      }
    }
    for (const [agentId, id] of Object.entries(index.agents ?? {})) {
      if (id === episodeId) {
        delete index.agents[agentId]
      }
    }
    delete index.dispatch_runs[dispatchRunId]
    writeJson(episodeIndexFile, index)
    fs.rmSync(path.join('.tmp', 'dispatch-task', 'episodes', `${episodeId}.json`), { force: true })
  }
  const runDir = path.join('.tmp', 'dispatch-task', dispatchRunId)
  fs.rmSync(runDir, { recursive: true, force: true })
  fs.rmSync(path.join('.tmp', 'dispatch-task', `${dispatchRunId}-handoff.json`), { force: true })
  fs.rmSync(path.join('.tmp', 'dispatch-task', `${dispatchRunId}-brv-recall.json`), { force: true })
}
