#!/usr/bin/env node
import fs from 'node:fs'

const [
  handoffFile,
  implementationResultFile,
  worktreeReportFile,
  noNewDepsReportFile,
  styleStackReportFile,
  qaResultFile
] = process.argv.slice(2)
if (!handoffFile || !implementationResultFile || !worktreeReportFile) {
  console.error(
    'usage: validate-completion-readiness.mjs <handoff.json> <implementer-or-external-result.json> <worktree-scope-report.json> <no-new-deps-report.json> <style-stack-report.json> [qa-result.json]'
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
const impl = readJson(implementationResultFile)
const worktree = readJson(worktreeReportFile)
const noDeps = noNewDepsReportFile ? readJson(noNewDepsReportFile) : null
const style = styleStackReportFile ? readJson(styleStackReportFile) : null
const qa = qaResultFile ? readJson(qaResultFile) : null
const errors = []
const need = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}
const blockers = impl.deviations_or_blockers ?? impl.blockers ?? []
const mode = handoff.implementation_mode ?? 'codex_subagent'
const codeChanges = handoff?.task?.code_changes_required === true
need(
  impl.status === 'completed',
  `implementation result must be completed before Completion Gate, got ${impl.status}`
)
if (mode === 'codex_subagent') {
  need(
    impl?.agent_identity?.dispatch_run_id === handoff.dispatch_run_id,
    'implementation result agent_identity.dispatch_run_id must match handoff'
  )
  need(
    impl?.agent_identity?.agent_type === handoff?.spawn_contract?.implementer_agent_type,
    'implementation result agent_identity.agent_type must match spawn_contract.implementer_agent_type'
  )
}
if (mode === 'zcode_external') {
  need(
    impl.source === 'codex_recovery_after_zcode',
    'external implementation result source must be codex_recovery_after_zcode'
  )
  need(
    impl.codex_self_implementation === false,
    'external implementation result must confirm codex_self_implementation=false'
  )
}
need(Array.isArray(blockers), 'implementation blockers/deviations must be an array')
need(blockers.length === 0, 'Completion Gate cannot pass with deviations_or_blockers/blockers')
if (codeChanges) {
  need(noDeps !== null, 'code changes require no-new-deps report')
  need(style !== null, 'code changes require style-stack report')
  need(worktree.status === 'passed', `worktree scope report must be passed, got ${worktree.status}`)
  need(worktree.gate === 'worktree_scope', 'worktree report gate must be worktree_scope')
  need(
    worktree.dispatch_run_id === handoff.dispatch_run_id,
    'worktree scope report dispatch_run_id must match handoff'
  )
  need(
    Array.isArray(worktree.changed_files_since_baseline),
    'worktree.changed_files_since_baseline must be an array'
  )
  need(
    Array.isArray(worktree.declared_changed_files),
    'worktree.declared_changed_files must be an array'
  )
  need(
    (worktree.undeclared_actual_changed_files ?? []).length === 0,
    'Completion Gate cannot pass with undeclared actual changed files'
  )
  need(
    (worktree.declared_not_visible ?? []).length === 0,
    'Completion Gate cannot pass with declared files not visible in worktree'
  )
  need(
    (worktree.declared_preexisting_overlap ?? []).length === 0,
    'Completion Gate cannot pass with preexisting dirty overlap'
  )
  need(
    (worktree.preexisting_dirty_modified_since_baseline ?? []).length === 0,
    'Completion Gate cannot pass with preexisting dirty files modified since baseline'
  )
  need(
    (worktree.disappeared_since_baseline ?? []).length === 0,
    'Completion Gate cannot pass with baseline dirty files disappeared'
  )
  if (noDeps) {
    need(noDeps.status === 'passed', `no-new-deps report must be passed, got ${noDeps.status}`)
    need(noDeps.gate === 'no_new_deps', 'no-new-deps report gate must be no_new_deps')
    need(
      noDeps.dispatch_run_id === handoff.dispatch_run_id,
      'no-new-deps report dispatch_run_id must match handoff'
    )
    need((noDeps.errors ?? []).length === 0, 'Completion Gate cannot pass with no-new-deps errors')
  }
  if (style) {
    need(style.status === 'passed', `style-stack report must be passed, got ${style.status}`)
    need(style.gate === 'style_stack', 'style-stack report gate must be style_stack')
    need(
      style.dispatch_run_id === handoff.dispatch_run_id,
      'style-stack report dispatch_run_id must match handoff'
    )
    need((style.errors ?? []).length === 0, 'Completion Gate cannot pass with style-stack errors')
  }
}
if (handoff?.task?.qa_required === true) {
  need(qa !== null, 'qa_required=true requires qa-result.json')
  if (qa) {
    need(qa.status === 'passed', `QA must be passed before Completion Gate, got ${qa.status}`)
    need(
      qa?.agent_identity?.dispatch_run_id === handoff.dispatch_run_id,
      'QA agent_identity.dispatch_run_id must match handoff'
    )
    need(
      qa?.agent_identity?.agent_type === handoff?.spawn_contract?.qa_agent_type,
      'QA agent_identity.agent_type must match spawn_contract.qa_agent_type'
    )
  }
}
if (qa) {
  need(Array.isArray(qa.failures), 'qa.failures must be an array')
  need(Array.isArray(qa.not_verified), 'qa.not_verified must be an array')
  need((qa.failures ?? []).length === 0, 'Completion Gate cannot pass with QA failures')
  need(
    (qa.not_verified ?? []).length === 0,
    'Completion Gate cannot pass with QA not_verified items'
  )
}
if (errors.length) {
  console.error(
    JSON.stringify({ status: 'blocked', gate: 'completion_readiness', errors }, null, 2)
  )
  process.exit(1)
}
console.log(
  JSON.stringify(
    { status: 'passed', gate: 'completion_readiness', dispatch_run_id: handoff.dispatch_run_id },
    null,
    2
  )
)
