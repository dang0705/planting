import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  classifyQaFailure,
  extractLeafReport,
  runQaPreflight
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import {
  persistLeafReportEvidence,
  recoverStaleQaRuns
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-run.mjs'
import {
  runLeafWithWatchdog,
  withAutomatorPortLock
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-execution.mjs'
import { recoverVerifiedTargetDevTools } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs'
import {
  canonicalizeLegacyQuotedBaseline,
  parsePorcelainV1Z
} from '../../../../../.codex/skills/dispatch-task/scripts/lib/git-status.mjs'
import {
  cleanupDispatchState,
  handoffValidator,
  parseJson,
  repoRoot,
  resultValidator,
  runCli,
  writeGovernanceHandoff,
  writeJson
} from './helpers.mjs'

const dryRunId = `dispatch-gate-qa-${Date.now()}`
const dry = runCli([
  'qa-run',
  '--catalog-id=care.watering.transpiration_v3.independent_advice',
  `--execution-id=${dryRunId}-dry`,
  `--dispatch-run-id=${dryRunId}`,
  '--dry-run'
])
assert.equal(dry.status, 0, dry.stderr || dry.stdout)
const dryRecord = parseJson(dry)
assert.equal(dryRecord.status, 'passed_dry_run')
assert.equal(dryRecord.frozen_script_sha256, dryRecord.script_sha256)
assert.ok(fs.existsSync(dryRecord.execution_record))

const productBlockedId = `${dryRunId}-product`
const productRecord = path.join('.tmp', 'dispatch-task', productBlockedId, 'qa-runs', 'prior.json')
writeJson(productRecord, {
  status: 'failed_product',
  catalog_id: 'care.watering.transpiration_v3.independent_advice',
  execution_id: 'prior-product-attempt',
  frozen_script_sha256: dryRecord.script_sha256,
  live_attempt: 1,
  started_at: new Date().toISOString()
})
const noProductRetry = runCli([
  'qa-run',
  '--catalog-id=care.watering.transpiration_v3.independent_advice',
  `--execution-id=${productBlockedId}-again`,
  `--dispatch-run-id=${productBlockedId}`,
  '--allow-live'
])
assert.notEqual(noProductRetry.status, 0)
assert.match(
  parseJson(noProductRetry).errors.join('\n'),
  /failed_product_requires_implementation_recovery/
)

// --- Regression: handoff must reject self-contradictory allowed/forbidden paths ---
// A prior dispatch simultaneously allowed qa-and-validation.mjs (exact) and
// forbade qa-*.mjs (glob), trapping the recovery result. validate-handoff must
// reject this intersection before dispatch so the implementer is never handed an
// impossible allow/forbid pair. These regression assertions run before the
// devtools preflight section so they execute even if the pre-existing devtools
// assertion (line ~207, caused by a forbidden-path dirty devtools-recovery.mjs)
// blocks the rest of the file.
const conflictRunId = `dispatch-gate-path-conflict-${Date.now()}`
const conflictHandoff = path.join('.tmp', 'dispatch-task', `${conflictRunId}-handoff.json`)
writeJson(conflictHandoff, {
  dispatch_run_id: conflictRunId,
  dispatch_tier: 'deep_contract',
  implementation_mode: 'codex_subagent',
  task: { objective: 'path conflict regression', code_changes_required: true, ui_task: false, risk: 'high', qa_required: true },
  target_role: 'implementer_deep',
  spawn_contract: { implementer_agent_type: 'implementer_deep', qa_agent_type: null, context_mode: 'isolated', generic_fallback_forbidden: true, identity_receipt_required: true },
  allowed_paths: [
    '.codex/skills/dispatch-task/scripts/validate-result.mjs',
    'test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'
  ],
  forbidden_paths: ['test/e2e/batch/workflow/dispatch-gate-contract/qa-*.mjs'],
  acceptance: ['path conflict regression'],
  project_constraints: { rule_refs: ['AGENTS.md#QA行为约束'], framework: 'Node.js ESM', dependency_policy: 'no_new_dependencies', test_commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  decision_lock: { level: 'strict', architecture_invariants: [], local_decisions_allowed: [] },
  brv_relevance: { required: false, recall_packet_path: '/tmp/x.json', child_brv_allowed: false },
  figma: { required: false, link: '', mode: 'internal_mcp' },
  feature_test_plan: { required: true, targets: ['test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'], commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  e2e_plan: { required: true, automator_required: true, catalog_required: true },
  validation: { miniprogram_automator_required: true, runtime_acceptance_mode: 'automator_required', worktree_baseline_path: `/tmp/${conflictRunId}-baseline.json` },
  selection_to_consumer: { required: false, not_applicable_reason: 'validator contract fix has no user-selectable values' }
})
const conflictValidation = spawnSync(process.execPath, [handoffValidator, conflictHandoff], { cwd: repoRoot, encoding: 'utf8' })
assert.notEqual(conflictValidation.status, 0, 'conflicting allow/forbid handoff must be rejected')
const conflictOutput = conflictValidation.stdout || conflictValidation.stderr
assert.match(
  JSON.parse(conflictOutput).errors.join('\n'),
  /allowed_paths and forbidden_paths conflict/,
  'conflict error must locate the conflicting allow/forbid pair'
)
// Positive control: non-overlapping allow/forbid must not trip the intersection check.
const okConflictRunId = `dispatch-gate-path-ok-${Date.now()}`
const okConflictHandoff = path.join('.tmp', 'dispatch-task', `${okConflictRunId}-handoff.json`)
writeJson(okConflictHandoff, {
  ...JSON.parse(fs.readFileSync(conflictHandoff, 'utf8')),
  dispatch_run_id: okConflictRunId,
  allowed_paths: [
    '.codex/skills/dispatch-task/scripts/validate-result.mjs',
    'test/e2e/batch/workflow/dispatch-gate-contract/episode-and-hook.mjs'
  ]
})
const okConflictValidation = spawnSync(process.execPath, [handoffValidator, okConflictHandoff], { cwd: repoRoot, encoding: 'utf8' })
const okConflictOutput = okConflictValidation.stdout || okConflictValidation.stderr
const okConflictParsed = JSON.parse(okConflictOutput)
const okConflictErrors = Array.isArray(okConflictParsed.errors) ? okConflictParsed.errors.join('\n') : ''
assert.doesNotMatch(
  okConflictErrors,
  /allowed_paths and forbidden_paths conflict/,
  'non-overlapping allow/forbid must not report a conflict'
)

// --- Regression: blocked external recovery may honestly carry forbidden changed_files ---
// A blocked result that records an actual out-of-scope/forbidden file as block
// evidence must pass the result-contract validator. Completed results must still
// be strictly rejected for the same file. This proves validate-result no longer
// traps blocked recovery between an impossible allow/forbid pair.
const blockedRecoveryRunId = `dispatch-gate-blocked-recovery-${Date.now()}`
const blockedRecoveryHandoff = path.join('.tmp', 'dispatch-task', `${blockedRecoveryRunId}-handoff.json`)
writeJson(blockedRecoveryHandoff, {
  dispatch_run_id: blockedRecoveryRunId,
  dispatch_tier: 'external_implementer',
  implementation_mode: 'external_implementer',
  task: { objective: 'blocked recovery regression', code_changes_required: true, ui_task: false, risk: 'standard', qa_required: false },
  external_contract: {
    provider: 'zcode', target_session: 'current_open_chat', prompt_transport: 'clipboard_paste',
    send_receipt_required: true, handoff_manual_required: true, handoff_completion_status_source: 'handoff_manual',
    completion_claim_not_authoritative: true, codex_self_implementation_forbidden: true, generic_fallback_forbidden: true,
    recovery_required: true,
    required_prompt_sections: ['implementation_contract', 'allowed_forbidden_paths', 'project_constraints', 'handoff_manual_contract', 'validation_commands', 'result_json_contract', 'ui_scope_contract', 'style_stack_contract', 'figma_direct_fetch', 'figma_blocker_policy', 'uni_ui_mapping_contract', 'selection_to_consumer_contract']
  },
  handoff_manual: { required: true, path: `/tmp/${blockedRecoveryRunId}-manual.json` },
  allowed_paths: ['.codex/skills/dispatch-task/scripts/validate-result.mjs'],
  forbidden_paths: ['src/**', 'cloudfunctions/**'],
  acceptance: ['blocked recovery regression'],
  project_constraints: { rule_refs: ['AGENTS.md#QA行为约束'], framework: 'Node.js ESM', dependency_policy: 'no_new_dependencies', test_commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  decision_lock: { level: 'standard', architecture_invariants: [], local_decisions_allowed: [] },
  brv_relevance: { required: false, child_brv_allowed: false },
  figma: { required: false, link: '', mode: 'internal_mcp' },
  feature_test_plan: { required: true, targets: ['test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'], commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  e2e_plan: { required: true, automator_required: false, catalog_required: false },
  validation: { miniprogram_automator_required: false },
  selection_to_consumer: { required: false, not_applicable_reason: 'validator contract fix has no user-selectable values' }
})
const blockedRecoveryResult = path.join('.tmp', 'dispatch-task', `${blockedRecoveryRunId}-result.json`)
writeJson(blockedRecoveryResult, {
  source: 'codex_recovery_after_external', status: 'blocked', codex_self_implementation: false,
  external_completion_claim_treated_as_non_authoritative: true, git_diff_recovered_by_codex: true,
  allowed_forbidden_paths_checked: true, project_constraints_checked_by_codex: true,
  external_handoff_manual: { read_by_codex: true, path: `/tmp/${blockedRecoveryRunId}-manual.json`, status: 'missing', updated_at: '' },
  external_send_receipt: { status: 'blocked' },
  changed_files: ['src/forbidden/file.js'],
  implementation_summary: 'blocked after touching forbidden path',
  deviations_or_blockers: [{ reason: 'forbidden path touched' }],
  selection_to_consumer: { not_applicable: true, reason: 'validator contract fix has no user-selectable values' }
})
const blockedRecoveryValidation = spawnSync(process.execPath, [resultValidator, 'external', blockedRecoveryHandoff, blockedRecoveryResult], { cwd: repoRoot, encoding: 'utf8' })
assert.equal(blockedRecoveryValidation.status, 0, `blocked external recovery with forbidden changed_file must pass result-contract: ${blockedRecoveryValidation.stderr || blockedRecoveryValidation.stdout}`)
assert.equal(JSON.parse(blockedRecoveryValidation.stdout).result_status, 'blocked')
// Negative control: completed with the same forbidden file must still be rejected.
const completedRecoveryResult = path.join('.tmp', 'dispatch-task', `${blockedRecoveryRunId}-completed-result.json`)
writeJson(completedRecoveryResult, {
  source: 'codex_recovery_after_external', status: 'completed', codex_self_implementation: false,
  external_completion_claim_treated_as_non_authoritative: true, git_diff_recovered_by_codex: true,
  allowed_forbidden_paths_checked: true, project_constraints_checked_by_codex: true,
  external_recovery_evidence: { handoff_manual_read: true, git_status_read: true, git_diff_read: true, forbidden_paths_clean: true, no_unapproved_dependencies: true },
  external_handoff_manual: { read_by_codex: true, path: `/tmp/${blockedRecoveryRunId}-manual.json`, status: 'completed', updated_at: '2026-07-27T21:00:00Z' },
  external_send_receipt: {
    status: 'sent', prompt_integrity_verified: true, send_action: 'send_button', clipboard_paste_used: true,
    computer_use: {
      tool_invoked: true,
      tool_invocation_evidence: { actual_tool_invocation_required: true, actual_tool_invocation: true, tool_target: '@ZCode', invocations: [{ tool: 'shell', purpose: 'send', success: true }] },
      shell_only_ui_automation_used: false, manual_typing_used: false, evidence_paths: ['/tmp/x']
    }
  },
  changed_files: ['src/forbidden/file.js'],
  implementation_summary: 'completed with forbidden file',
  deviations_or_blockers: [],
  selection_to_consumer: { not_applicable: true, reason: 'validator contract fix has no user-selectable values' }
})
const completedRecoveryValidation = spawnSync(process.execPath, [resultValidator, 'external', blockedRecoveryHandoff, completedRecoveryResult], { cwd: repoRoot, encoding: 'utf8' })
assert.notEqual(completedRecoveryValidation.status, 0, 'completed external recovery with forbidden changed_file must still be rejected')
const completedErrors = JSON.parse(completedRecoveryValidation.stdout || completedRecoveryValidation.stderr).errors.join('\n')
assert.match(completedErrors, /changed file matches forbidden_paths|changed file outside allowed_paths/)

// --- Regression: reliable glob-vs-glob intersection must catch overlaps the
// sampling algorithm missed (allow a/*.js vs forbid a/foo*.js both match
// a/foobar.js, but a/sample.js does not match a/foo*.js). A prior sampling
// implementation let this through; the reliable two-glob intersection must
// reject it before dispatch.
const globVsGlobRunId = `dispatch-gate-glob-vs-glob-${Date.now()}`
const globVsGlobHandoff = path.join('.tmp', 'dispatch-task', `${globVsGlobRunId}-handoff.json`)
writeJson(globVsGlobHandoff, {
  dispatch_run_id: globVsGlobRunId,
  dispatch_tier: 'deep_contract',
  implementation_mode: 'codex_subagent',
  task: { objective: 'glob vs glob regression', code_changes_required: true, ui_task: false, risk: 'high', qa_required: true },
  target_role: 'implementer_deep',
  spawn_contract: { implementer_agent_type: 'implementer_deep', qa_agent_type: null, context_mode: 'isolated', generic_fallback_forbidden: true, identity_receipt_required: true },
  allowed_paths: ['test/e2e/batch/workflow/dispatch-gate-contract/a/*.js'],
  forbidden_paths: ['test/e2e/batch/workflow/dispatch-gate-contract/a/foo*.js'],
  acceptance: ['glob vs glob regression'],
  project_constraints: { rule_refs: ['AGENTS.md#QA行为约束'], framework: 'Node.js ESM', dependency_policy: 'no_new_dependencies', test_commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  decision_lock: { level: 'strict', architecture_invariants: [], local_decisions_allowed: [] },
  brv_relevance: { required: false, recall_packet_path: '/tmp/x.json', child_brv_allowed: false },
  figma: { required: false, link: '', mode: 'internal_mcp' },
  feature_test_plan: { required: true, targets: ['test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'], commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  e2e_plan: { required: true, automator_required: true, catalog_required: true },
  validation: { miniprogram_automator_required: true, runtime_acceptance_mode: 'automator_required', worktree_baseline_path: `/tmp/${globVsGlobRunId}-baseline.json` },
  selection_to_consumer: { required: false, not_applicable_reason: 'validator contract fix has no user-selectable values' }
})
const globVsGlobValidation = spawnSync(process.execPath, [handoffValidator, globVsGlobHandoff], { cwd: repoRoot, encoding: 'utf8' })
assert.notEqual(globVsGlobValidation.status, 0, 'glob-vs-glob overlap (a/*.js vs a/foo*.js) must be rejected before dispatch')
const globVsGlobOutput = globVsGlobValidation.stdout || globVsGlobValidation.stderr
assert.match(
  JSON.parse(globVsGlobOutput).errors.join('\n'),
  /allowed_paths and forbidden_paths conflict/,
  'glob-vs-glob conflict must be located'
)
// Regression: fixed representative samples must never be used as a proxy for
// language intersection. The two globs overlap at p/za, while the old bounded
// expansion missed it because neither pattern's fixed samples contained z in the
// required position.
const missedSampleRunId = `dispatch-gate-glob-exact-${Date.now()}`
const missedSampleHandoff = path.join('.tmp', 'dispatch-task', `${missedSampleRunId}-handoff.json`)
writeJson(missedSampleHandoff, {
  ...JSON.parse(fs.readFileSync(globVsGlobHandoff, 'utf8')),
  dispatch_run_id: missedSampleRunId,
  allowed_paths: ['test/e2e/**/p/*a'],
  forbidden_paths: ['test/e2e/**/p/z*']
})
const missedSampleValidation = spawnSync(process.execPath, [handoffValidator, missedSampleHandoff], { cwd: repoRoot, encoding: 'utf8' })
assert.notEqual(missedSampleValidation.status, 0, 'exact glob intersection must catch p/*a vs p/z* overlap')
assert.match(
  JSON.parse(missedSampleValidation.stdout || missedSampleValidation.stderr).errors.join('\n'),
  /allowed_paths and forbidden_paths conflict/,
  'exact glob intersection must locate the missed-sample conflict'
)
// Positive control: a ** vs literal-subdir overlap is also caught.
const doubleStarRunId = `dispatch-gate-double-star-${Date.now()}`
const doubleStarHandoff = path.join('.tmp', 'dispatch-task', `${doubleStarRunId}-handoff.json`)
writeJson(doubleStarHandoff, {
  ...JSON.parse(fs.readFileSync(globVsGlobHandoff, 'utf8')),
  dispatch_run_id: doubleStarRunId,
  allowed_paths: ['test/e2e/**'],
  forbidden_paths: ['test/e2e/batch/c.js']
})
const doubleStarValidation = spawnSync(process.execPath, [handoffValidator, doubleStarHandoff], { cwd: repoRoot, encoding: 'utf8' })
assert.notEqual(doubleStarValidation.status, 0, '** vs literal overlap must be rejected')
const doubleStarOutput = doubleStarValidation.stdout || doubleStarValidation.stderr
assert.match(JSON.parse(doubleStarOutput).errors.join('\n'), /allowed_paths and forbidden_paths conflict/)

// --- Regression: completed external recovery must accept future
// provider_status=delivered manual without forcing main to rewrite it to
// status=completed. delivered only records provider delivery + recovery_required
// and must not be confused with dispatch completion. Legacy status=completed
// manual stays compatible. The existing completed-with-forbidden-file strict
// rejection (above) must continue to pass.
const deliveredManualRunId = `dispatch-gate-delivered-manual-${Date.now()}`
const deliveredManualHandoff = path.join('.tmp', 'dispatch-task', `${deliveredManualRunId}-handoff.json`)
writeJson(deliveredManualHandoff, {
  dispatch_run_id: deliveredManualRunId,
  dispatch_tier: 'external_implementer',
  implementation_mode: 'external_implementer',
  task: { objective: 'delivered manual regression', code_changes_required: true, ui_task: false, risk: 'standard', qa_required: false },
  external_contract: {
    provider: 'zcode', target_session: 'current_open_chat', prompt_transport: 'clipboard_paste',
    send_receipt_required: true, handoff_manual_required: true, handoff_completion_status_source: 'handoff_manual',
    completion_claim_not_authoritative: true, codex_self_implementation_forbidden: true, generic_fallback_forbidden: true,
    recovery_required: true,
    required_prompt_sections: ['implementation_contract', 'allowed_forbidden_paths', 'project_constraints', 'handoff_manual_contract', 'validation_commands', 'result_json_contract', 'ui_scope_contract', 'style_stack_contract', 'figma_direct_fetch', 'figma_blocker_policy', 'uni_ui_mapping_contract', 'selection_to_consumer_contract']
  },
  handoff_manual: { required: true, path: `/tmp/${deliveredManualRunId}-manual.json` },
  allowed_paths: ['.codex/skills/dispatch-task/scripts/validate-result.mjs'],
  forbidden_paths: ['src/**', 'cloudfunctions/**'],
  acceptance: ['delivered manual regression'],
  project_constraints: { rule_refs: ['AGENTS.md#QA行为约束'], framework: 'Node.js ESM', dependency_policy: 'no_new_dependencies', test_commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  decision_lock: { level: 'standard', architecture_invariants: [], local_decisions_allowed: [] },
  brv_relevance: { required: false, child_brv_allowed: false },
  figma: { required: false, link: '', mode: 'internal_mcp' },
  feature_test_plan: { required: true, targets: ['test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'], commands: ['node test/e2e/batch/workflow/dispatch-gate-contract/qa-and-validation.mjs'] },
  e2e_plan: { required: true, automator_required: false, catalog_required: false },
  validation: { miniprogram_automator_required: false },
  selection_to_consumer: { required: false, not_applicable_reason: 'validator contract fix has no user-selectable values' }
})
const deliveredManualResult = path.join('.tmp', 'dispatch-task', `${deliveredManualRunId}-result.json`)
const fullComputerUse = {
  tool_invoked: true,
  tool_invocation_evidence: {
    actual_tool_invocation_required: true, actual_tool_invocation: true, tool_target: '@ZCode',
    tool_events_seen: true, tool_event_count: 6,
    transcript_event_refs: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'],
    commands_issued: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
  },
  shell_only_ui_automation_used: false, manual_typing_used: false, evidence_paths: ['/tmp/x']
}
const fullValidationEvidence = {
  unit_tests: { result: 'passed', commands: ['c'], evidence_ref: 's' },
  lint: { result: 'passed', commands: ['c'], evidence_ref: 's' },
  typecheck: { result: 'passed', commands: ['c'], evidence_ref: 's' },
  build: { result: 'passed', commands: ['c'], evidence_ref: 's' },
  self_check: { result: 'passed', commands: ['c'], evidence_ref: 's' }
}
writeJson(deliveredManualResult, {
  source: 'codex_recovery_after_external', status: 'completed', codex_self_implementation: false,
  external_completion_claim_treated_as_non_authoritative: true, git_diff_recovered_by_codex: true,
  allowed_forbidden_paths_checked: true, project_constraints_checked_by_codex: true,
  external_recovery_evidence: { handoff_manual_read: true, git_status_read: true, git_diff_read: true, forbidden_paths_clean: true, no_unapproved_dependencies: true },
  external_handoff_manual: { read_by_codex: true, path: `/tmp/${deliveredManualRunId}-manual.json`, provider_status: 'delivered', updated_at: '2026-07-27T22:00:00Z' },
  external_send_receipt: { status: 'sent', prompt_integrity_verified: true, send_action: 'send_button', clipboard_paste_used: true, computer_use: fullComputerUse },
  changed_files: ['.codex/skills/dispatch-task/scripts/validate-result.mjs'],
  implementation_summary: 'completed recovery with delivered manual',
  validation_evidence: fullValidationEvidence,
  deviations_or_blockers: [],
  selection_to_consumer: { not_applicable: true, reason: 'validator contract fix has no user-selectable values' }
})
const deliveredManualValidation = spawnSync(process.execPath, [resultValidator, 'external', deliveredManualHandoff, deliveredManualResult], { cwd: repoRoot, encoding: 'utf8' })
assert.equal(deliveredManualValidation.status, 0, `completed external recovery with provider_status=delivered manual must pass result-contract: ${deliveredManualValidation.stderr || deliveredManualValidation.stdout}`)
assert.equal(JSON.parse(deliveredManualValidation.stdout).result_status, 'completed')
// Legacy compatibility: the same recovery with status=completed manual must also pass.
const legacyManualResult = path.join('.tmp', 'dispatch-task', `${deliveredManualRunId}-legacy-result.json`)
writeJson(legacyManualResult, {
  ...JSON.parse(fs.readFileSync(deliveredManualResult, 'utf8')),
  external_handoff_manual: { read_by_codex: true, path: `/tmp/${deliveredManualRunId}-manual.json`, status: 'completed', updated_at: '2026-07-27T22:00:00Z' },
  implementation_summary: 'completed recovery with legacy manual'
})
const legacyManualValidation = spawnSync(process.execPath, [resultValidator, 'external', deliveredManualHandoff, legacyManualResult], { cwd: repoRoot, encoding: 'utf8' })
assert.equal(legacyManualValidation.status, 0, `completed external recovery with legacy status=completed manual must stay compatible: ${legacyManualValidation.stderr || legacyManualValidation.stdout}`)
// Negative: provider_status=blocked manual must not satisfy completed recovery.
const blockedManualResult = path.join('.tmp', 'dispatch-task', `${deliveredManualRunId}-blocked-manual-result.json`)
writeJson(blockedManualResult, {
  ...JSON.parse(fs.readFileSync(deliveredManualResult, 'utf8')),
  external_handoff_manual: { read_by_codex: true, path: `/tmp/${deliveredManualRunId}-manual.json`, provider_status: 'blocked', updated_at: '2026-07-27T22:00:00Z' },
  implementation_summary: 'completed recovery with blocked manual'
})
const blockedManualValidation = spawnSync(process.execPath, [resultValidator, 'external', deliveredManualHandoff, blockedManualResult], { cwd: repoRoot, encoding: 'utf8' })
assert.notEqual(blockedManualValidation.status, 0, 'completed recovery with provider_status=blocked manual must be rejected')
const blockedManualErrors = JSON.parse(blockedManualValidation.stdout || blockedManualValidation.stderr).errors.join('\n')
assert.match(blockedManualErrors, /provider_status=delivered/)

const expectedProjectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
const verifiedRuntime = ({ mainPid = 43100, listenerPid = 43210 } = {}) => ({
  status: 'verified',
  project_identity_verified: true,
  observed_project_path: expectedProjectPath,
  main_devtools_pid: mainPid,
  automation_listener_pid: listenerPid,
  port_owner_pid: listenerPid,
  automator_port: 9420,
  control_port: 3799,
  control_port_source: 'main_devtools_remote_port',
  project_evidence: [expectedProjectPath]
})

let runtimeCaptureCalls = 0
let recoveryCalls = 0
let recoveryInspectionCalls = 0
const recoveredPreflight = await runQaPreflight({
  projectPath: expectedProjectPath,
  observedProjectPath: '/tmp/not-the-target-project',
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => {
    recoveryInspectionCalls += 1
    return verifiedRuntime({ listenerPid: recoveryInspectionCalls === 1 ? 43210 : 43211 })
  },
  recoveryExecutor: ({ projectPath, wsPort, verifiedRuntime: priorRuntime }) => {
    recoveryCalls += 1
    assert.equal(projectPath, expectedProjectPath)
    assert.equal(wsPort, 9420)
    assert.equal(priorRuntime.port_owner_pid, 43210)
    assert.equal(priorRuntime.control_port, 3799)
    return {
      status: 'recovered',
      recovery: 'synthetic_repository_owned_recovery',
      before: priorRuntime,
      invocations: [
        { action: 'close', exit_code: 0 },
        { action: 'open', exit_code: 0 },
        { action: 'auto', exit_code: 0 }
      ]
    }
  },
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async ({ report }) => {
    runtimeCaptureCalls += 1
    if (runtimeCaptureCalls === 1) {
      throw new Error('screenshot RPC failed')
    }
    report.checks.page_data = { passed: true }
    report.checks.screenshot = { passed: true, path: 'synthetic-preflight.png' }
    report.checks.wx_request = { passed: true, result: { ok: true } }
  }
})
assert.equal(recoveredPreflight.status, 'passed')
assert.equal(recoveredPreflight.caller_observed_project_path, 'ignored_untrusted_input')
assert.equal(recoveryCalls, 1)
assert.equal(runtimeCaptureCalls, 2, 'recovery must rerun the complete evidence capture')
assert.equal(recoveredPreflight.targeted_restart.before.port_owner_pid, 43210)
assert.equal(recoveredPreflight.targeted_restart.after.port_owner_pid, 43211)
assert.equal(recoveredPreflight.targeted_restart.after.control_port, 3799)
assert.equal(recoveredPreflight.targeted_restart.post_recovery_probes.screenshot.passed, true)
assert.equal(recoveredPreflight.targeted_restart.post_recovery_probes.wx_request.passed, true)

let falseRecoveryInspectionCalls = 0
const incompleteRecovery = await runQaPreflight({
  projectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => {
    falseRecoveryInspectionCalls += 1
    return verifiedRuntime({ listenerPid: falseRecoveryInspectionCalls === 1 ? 43212 : 43213 })
  },
  recoveryExecutor: () => ({ status: 'recovered', invocations: [] }),
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('screenshot RPC failed')
  }
})
assert.equal(incompleteRecovery.status, 'failed_environment')
assert.equal(incompleteRecovery.failures[0].code, 'devtools_automator_blocker')

let rejectedRecoveryCalls = 0
const wrongProjectPreflight = await runQaPreflight({
  projectPath: expectedProjectPath,
  observedProjectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => ({
    ...verifiedRuntime(),
    status: 'wrong_project',
    project_identity_verified: false,
    observed_project_path: '/tmp/not-the-target-project',
    project_evidence: ['/tmp/not-the-target-project']
  }),
  recoveryExecutor: () => {
    rejectedRecoveryCalls += 1
    return { status: 'recovered' }
  },
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('must not capture an unverified target')
  }
})
assert.equal(wrongProjectPreflight.status, 'failed_environment')
assert.equal(wrongProjectPreflight.failures[0].code, 'project_path_mismatch')
assert.equal(rejectedRecoveryCalls, 0, 'wrong project must never be restarted')

const unknownProjectPreflight = await runQaPreflight({
  projectPath: expectedProjectPath,
  observedProjectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => ({
    status: 'unavailable',
    project_identity_verified: false,
    observed_project_path: 'unavailable',
    port_owner_pid: 'unavailable',
    automator_port: 9420,
    control_port: 9420,
    project_evidence: []
  }),
  recoveryExecutor: () => {
    rejectedRecoveryCalls += 1
    return { status: 'recovered' }
  },
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('must not capture an unverified target')
  }
})
assert.equal(unknownProjectPreflight.status, 'failed_environment')
assert.equal(unknownProjectPreflight.failures[0].code, 'project_identity_unverified')
assert.equal(rejectedRecoveryCalls, 0, 'unknown target must never be restarted')

const wxRequestEnvironmentFailure = await runQaPreflight({
  projectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  runtimeInspector: verifiedRuntime,
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('wx.request preflight timed out after 10000ms')
  }
})
assert.equal(wxRequestEnvironmentFailure.status, 'failed_environment')
assert.equal(wxRequestEnvironmentFailure.failures[0].code, 'runtime_preflight_failed')

const directUnverifiedRecovery = await recoverVerifiedTargetDevTools({
  projectPath: expectedProjectPath,
  verifiedRuntime: { status: 'wrong_project', project_identity_verified: false },
  commandRunner: () => {
    throw new Error('unverified recovery must never invoke a process')
  }
})
assert.equal(directUnverifiedRecovery.status, 'failed_environment')
assert.equal(directUnverifiedRecovery.code, 'devtools_automator_blocker')
assert.equal(directUnverifiedRecovery.reason, 'target_project_runtime_not_safely_preverified')

const unsafeMarker = path.join(repoRoot, '.tmp', 'dispatch-task', `unsafe-restart-${Date.now()}`)
const unsafeRestart = runCli([
  'qa-run',
  '--catalog-id=care.watering.transpiration_v3.independent_advice',
  `--execution-id=${dryRunId}-unsafe`,
  `--dispatch-run-id=${dryRunId}`,
  '--dry-run',
  `--targeted-restart-command=touch ${unsafeMarker}`
])
assert.notEqual(unsafeRestart.status, 0)
assert.match(
  parseJson(unsafeRestart).errors.join('\n'),
  /caller-supplied targeted restart commands are forbidden/
)
assert.equal(fs.existsSync(unsafeMarker), false, 'caller shell text must never execute')

function syntheticChild(pid = 24680) {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.killSignals = []
  child.kill = signal => child.killSignals.push(signal)
  return child
}

const signalSource = new EventEmitter()
const interruptedChild = syntheticChild()
const interruptedTerminal = []
const interrupted = runLeafWithWatchdog({
  script: 'synthetic-leaf.mjs',
  timeoutMs: 1000,
  terminateGraceMs: 0,
  signalSource,
  spawnChild: () => interruptedChild,
  onTerminal: terminal => interruptedTerminal.push(terminal)
})
signalSource.emit('SIGTERM')
const interruptedResult = await interrupted
assert.equal(interruptedResult.status, 'aborted')
assert.equal(interruptedTerminal[0].terminal_reason, 'parent_sigterm')
assert.deepEqual(interruptedChild.killSignals, ['SIGTERM', 'SIGKILL'])

const errorChild = syntheticChild(24681)
const scriptFailure = await runLeafWithWatchdog({
  script: 'synthetic-leaf.mjs',
  timeoutMs: 1000,
  terminateGraceMs: 0,
  signalSource: new EventEmitter(),
  spawnChild: () => {
    queueMicrotask(() => errorChild.emit('error', new Error('synthetic execution error')))
    return errorChild
  }
})
assert.equal(scriptFailure.status, 'failed_script')
assert.match(scriptFailure.terminal_reason, /synthetic execution error/)

const liveLockPath = path.join(repoRoot, '.tmp', 'dispatch-task', `live-lock-${Date.now()}.lock`)
fs.mkdirSync(path.dirname(liveLockPath), { recursive: true })
fs.writeFileSync(liveLockPath, JSON.stringify({ pid: process.pid }))
fs.utimesSync(liveLockPath, new Date(0), new Date(0))
await assert.rejects(
  withAutomatorPortLock(async () => {}, { lockPath: liveLockPath, timeoutMs: 5, staleMs: 0 }),
  /automator 9420 lock timeout/
)
assert.equal(
  fs.existsSync(liveLockPath),
  true,
  'stale recovery must preserve a lock owned by a live PID'
)
fs.unlinkSync(liveLockPath)

const liveQaRunId = `${dryRunId}-live-owner`
const liveQaRecordPath = path.join('.tmp', 'dispatch-task', liveQaRunId, 'qa-runs', 'live.json')
writeJson(liveQaRecordPath, {
  status: 'running',
  execution_id: 'live-owner-record',
  started_at: new Date(0).toISOString(),
  runner_pid: process.pid
})
const staleRecovery = recoverStaleQaRuns(liveQaRunId, 0)
assert.deepEqual(staleRecovery.recovered, [])
assert.deepEqual(staleRecovery.skipped_live, ['live-owner-record'])
assert.equal(JSON.parse(fs.readFileSync(liveQaRecordPath, 'utf8')).status, 'running')
assert.equal(
  classifyQaFailure({ exitCode: 1, stdout: 'product_blocker assertion failed' }),
  'failed_product'
)
assert.equal(classifyQaFailure({ exitCode: 1, stderr: 'Cannot find module' }), 'failed_script')
assert.equal(classifyQaFailure({ exitCode: null }), 'aborted')

const structuredProductReport = extractLeafReport({
  stdout: JSON.stringify({
    status: 'failed',
    assertions: [{ name: 'care-result', passed: false, detail: 'expected healthy result' }]
  })
})
assert.equal(structuredProductReport.parse_status, 'parsed')
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: structuredProductReport }),
  'failed_product'
)
const structuredEnvironmentReport = extractLeafReport({
  stdout: JSON.stringify({ status: 'failed', failures: [{ code: 'screenshot_rpc_timeout' }] })
})
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: structuredEnvironmentReport }),
  'failed_environment'
)
const malformedStructuredReport = extractLeafReport({ stdout: '{"status":"failed",' })
assert.equal(malformedStructuredReport.parse_status, 'malformed')
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: malformedStructuredReport }),
  'failed_script'
)
const leafReportRecord = path.join(
  repoRoot,
  '.tmp',
  'dispatch-task',
  `leaf-report-contract-${Date.now()}.json`
)
const persistedLeafReport = persistLeafReportEvidence(leafReportRecord, {
  stdout: JSON.stringify({
    status: 'failed',
    assertions: [{ name: 'care-result', passed: false }]
  }),
  stderr: ''
})
const persistedLeafPath = path.join(repoRoot, persistedLeafReport.raw_report_ref)
assert.equal(persistedLeafReport.failure_kind, 'failed_product')
assert.equal(JSON.parse(fs.readFileSync(persistedLeafPath, 'utf8')).report.status, 'failed')
fs.unlinkSync(persistedLeafPath)

const preexistingQuotedPath = '.codex/skills/dispatch-task/examples/普通代码任务-handoff.json'
const malformedQuotedPath =
  '".codex/skills/dispatch-task/examples//346/231/256/351/200/232/344/273/243/347/240/201/344/273/273/345/212/241-handoff.json"'
const quotedRawPath =
  '".codex/skills/dispatch-task/examples/\\346\\231\\256\\351\\200\\232\\344\\273\\243\\347\\240\\201\\344\\273\\273\\345\\212\\241-handoff.json"'
const parsedUtf8Status = parsePorcelainV1Z(Buffer.from(` M ${preexistingQuotedPath}\0`, 'utf8'))
assert.deepEqual(parsedUtf8Status, [
  { status: ' M', path: preexistingQuotedPath, raw_path: preexistingQuotedPath }
])
assert.deepEqual(parsePorcelainV1Z(Buffer.from('R  test/new.mjs\0test/original.mjs\0', 'utf8')), [
  {
    status: 'R ',
    path: 'test/new.mjs',
    raw_path: 'test/new.mjs',
    original_path: 'test/original.mjs'
  },
  {
    status: 'R ',
    path: 'test/original.mjs',
    raw_path: 'test/original.mjs',
    renamed_or_copied_from: true
  }
])
const quotedRepair = canonicalizeLegacyQuotedBaseline(
  {
    captured_at: '2026-07-21T08:07:11.067Z',
    status_files: [malformedQuotedPath],
    status_entries: [{ status: ' M', path: malformedQuotedPath, raw_path: quotedRawPath }],
    dirty_file_fingerprints: [
      { path: malformedQuotedPath, exists: false, is_file: false, worktree_sha256: null }
    ]
  },
  {
    currentStatusEntries: parsedUtf8Status,
    getMtimeMs: () => Date.parse('2026-07-19T20:57:46+08:00'),
    getFingerprint: file => ({
      path: file,
      exists: true,
      is_file: true,
      worktree_sha256: 'synthetic'
    })
  }
)
assert.deepEqual(quotedRepair.errors, [])
assert.deepEqual(quotedRepair.baseline.status_files, [preexistingQuotedPath])
assert.equal(quotedRepair.baseline.status_entries[0].legacy_raw_path, quotedRawPath)
assert.equal(quotedRepair.canonicalizations[0].path, preexistingQuotedPath)
const unsafeQuotedRepair = canonicalizeLegacyQuotedBaseline(
  {
    captured_at: '2026-07-21T08:07:11.067Z',
    status_files: [malformedQuotedPath],
    status_entries: [{ status: ' M', path: malformedQuotedPath, raw_path: quotedRawPath }],
    dirty_file_fingerprints: []
  },
  {
    currentStatusEntries: parsedUtf8Status,
    getMtimeMs: () => Date.parse('2026-07-22T08:07:11.068Z')
  }
)
assert.match(unsafeQuotedRepair.errors[0], /cannot safely canonicalize/)
assert.deepEqual(unsafeQuotedRepair.baseline.status_files, [malformedQuotedPath])

const governanceRun = `dispatch-gate-result-${Date.now()}`
const { file: governanceHandoff } = writeGovernanceHandoff(governanceRun)
const governanceResult = path.join('.tmp', 'dispatch-task', `${governanceRun}-result.json`)
const passedCheck = name => ({
  status: 'passed',
  commands: ['synthetic command'],
  evidence_ref: `synthetic:${name}`,
  reason: ''
})
const validationCheck = name => ({
  result: 'passed',
  commands: ['synthetic command'],
  evidence_ref: `synthetic:${name}`,
  reason: ''
})
writeJson(governanceResult, {
  agent_identity: { agent_type: 'implementer_deep', dispatch_run_id: governanceRun },
  status: 'completed',
  changed_files: ['test/e2e/batch/workflow/dispatch-gate-contract.mjs'],
  implementation_summary: 'synthetic governance evidence',
  project_constraints_verified: true,
  validation_evidence: {
    unit_tests: validationCheck('unit'),
    lint: validationCheck('lint'),
    typecheck: validationCheck('type'),
    build: validationCheck('build'),
    self_check: validationCheck('self')
  },
  migration_inventory: passedCheck('migration'),
  hook_self_test: passedCheck('hook'),
  e2e_catalog_validation: passedCheck('catalog'),
  episode_state_contract: passedCheck('episode'),
  status_card_contract: passedCheck('status'),
  automator_preflight_contract: passedCheck('preflight'),
  known_limitations: [],
  qa_handoff: { actual_commands: ['synthetic command'] },
  selection_to_consumer: {
    not_applicable: true,
    reason: 'synthetic governance contract has no user-selectable values'
  },
  deviations_or_blockers: []
})
const governanceValidation = spawnSync(
  process.execPath,
  [resultValidator, 'implementer', governanceHandoff, governanceResult],
  {
    cwd: repoRoot,
    encoding: 'utf8'
  }
)
assert.equal(
  governanceValidation.status,
  0,
  governanceValidation.stderr || governanceValidation.stdout
)

const selfTest = runCli(['hook-self-test'])
assert.equal(selfTest.status, 0, selfTest.stderr || selfTest.stdout)
assert.equal(parseJson(selfTest).hook_capability.status, 'cli_fallback')

cleanupDispatchState(dryRunId)
cleanupDispatchState(productBlockedId)
cleanupDispatchState(liveQaRunId)
cleanupDispatchState(governanceRun)
