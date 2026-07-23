#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const [handoffFile, implementationResultFile, postflightReportFile, runtimeQaEvidenceFile] =
  process.argv.slice(2)
if (!handoffFile || !implementationResultFile || !postflightReportFile) {
  console.error(
    'usage: validate-completion-readiness.mjs <handoff.json> <implementer-or-external-result.json> <postflight-report.json> [runtime-qa-evidence.json]'
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
const postflight = readJson(postflightReportFile)
const runtimeQa = runtimeQaEvidenceFile ? readJson(runtimeQaEvidenceFile) : null
const errors = []
const need = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0
const normalizeFsPath = value => {
  if (!nonEmptyString(value)) {
    return ''
  }
  return path.resolve(String(value)).replaceAll('\\', '/').replace(/\/+$/, '')
}
const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const automatorCatalogPath = path.join(repoRoot, 'test', 'e2e', 'automator', 'catalog.json')
const externalContract = handoff.external_contract ?? handoff.zcode_contract ?? {}
const externalProvider =
  externalContract.provider ||
  (externalContract.external_implementer === 'zcode_glm' ? 'zcode' : '')
const webExternalProvider =
  ['trae', 'chrome_cloud_agent'].includes(externalProvider) ||
  externalContract.prompt_transport === 'browser_plugin'
const mainWorkspaceMiniProgramProjectPath = normalizeFsPath(
  path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
)
const miniprogramAutomatorRequired = handoff?.validation?.miniprogram_automator_required === true
const runtimeAcceptanceMode =
  handoff?.validation?.runtime_acceptance_mode ??
  (handoff?.validation?.miniprogram_automator_required === true ? 'automator_required' : null)
const needsRuntimeQaEvidence = [
  'automator_required',
  'batch_substitute_allowed',
  'batch_only'
].includes(runtimeAcceptanceMode)
const forbiddenRoleReceiptFields = [
  'owner',
  'agent_identity',
  'coverage',
  'checks_and_evidence',
  'unit_tests_run',
  'next_action',
  'blocker_classification',
  'figma_baseline_evidence'
]
const expectedAutomatorProjectPath = () => {
  const plannedWorktreePath = externalContract?.remote_sync?.planned_worktree_path
  if (webExternalProvider && nonEmptyString(plannedWorktreePath)) {
    return normalizeFsPath(path.join(plannedWorktreePath, 'dist', 'dev', 'mp-weixin'))
  }
  return mainWorkspaceMiniProgramProjectPath
}
const validateAutomatorProjectPath = (actualPath, label) => {
  const expectedPath = expectedAutomatorProjectPath()
  need(nonEmptyString(actualPath), `${label} is required`)
  if (!nonEmptyString(actualPath)) {
    return
  }
  need(
    normalizeFsPath(actualPath) === expectedPath,
    `${label} must match expected projectPath: ${expectedPath}`
  )
}
const blockers = impl.deviations_or_blockers ?? impl.blockers ?? []
const mode = handoff.implementation_mode ?? 'codex_subagent'
const codeChanges = handoff?.task?.code_changes_required === true
const resultRole =
  mode === 'codex_subagent'
    ? 'implementer'
    : mode === 'zcode_external' || mode === 'external_implementer'
      ? 'external'
      : null

if (codeChanges && resultRole) {
  const validator = path.join(
    repoRoot,
    '.codex',
    'skills',
    'dispatch-task',
    'scripts',
    'validate-result.mjs'
  )
  const checked = spawnSync(
    process.execPath,
    [validator, resultRole, handoffFile, implementationResultFile],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  )
  need(
    checked.status === 0,
    `implementation result contract validation failed before Completion Gate: ${checked.stderr || checked.stdout}`
  )
}

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
if (mode === 'zcode_external' || mode === 'external_implementer') {
  const allowedSources = [
    'codex_recovery_after_zcode',
    'codex_recovery_after_external',
    'codex_recovery_after_external_implementer'
  ]
  if (mode === 'zcode_external') {
    need(
      impl.source === 'codex_recovery_after_zcode',
      'external implementation result source must be codex_recovery_after_zcode'
    )
  } else {
    need(
      allowedSources.includes(impl.source) || nonEmptyString(impl.source),
      'external implementation result source is required'
    )
  }
  need(
    impl.codex_self_implementation === false,
    'external implementation result must confirm codex_self_implementation=false'
  )
}
need(Array.isArray(blockers), 'implementation blockers/deviations must be an array')
need(blockers.length === 0, 'Completion Gate cannot pass with deviations_or_blockers/blockers')

if (webExternalProvider && impl.status === 'completed') {
  const recoveryEvidence = impl.external_recovery_evidence ?? impl.zcode_recovery_evidence
  const prMerge = recoveryEvidence?.pr_merge ?? {}
  const localSync = recoveryEvidence?.local_base_sync ?? {}
  need(
    isObject(prMerge),
    'completed Web external task requires external_recovery_evidence.pr_merge'
  )
  if (isObject(prMerge)) {
    need(prMerge.provider === 'github_plugin', 'pr_merge.provider must be github_plugin')
    need(nonEmptyString(prMerge.pr_url), 'pr_merge.pr_url is required')
    need(Number.isInteger(prMerge.pr_number), 'pr_merge.pr_number must be an integer')
    need(nonEmptyString(prMerge.base_branch), 'pr_merge.base_branch is required')
    need(
      nonEmptyString(prMerge.head_sha_before_merge),
      'pr_merge.head_sha_before_merge is required'
    )
    need(
      ['merge', 'squash', 'rebase'].includes(prMerge.merge_method),
      'pr_merge.merge_method must be merge|squash|rebase'
    )
    need(prMerge.merged === true, 'pr_merge.merged must be true')
    need(nonEmptyString(prMerge.merge_commit_sha), 'pr_merge.merge_commit_sha is required')
  }
  need(
    isObject(localSync),
    'completed Web external task requires external_recovery_evidence.local_base_sync'
  )
  if (isObject(localSync)) {
    need(nonEmptyString(localSync.branch), 'local_base_sync.branch is required')
    need(localSync.remote === 'origin', 'local_base_sync.remote must be origin')
    need(localSync.fetch_completed === true, 'local_base_sync.fetch_completed must be true')
    need(localSync.pull_mode === 'ff-only', 'local_base_sync.pull_mode must be ff-only')
    need(localSync.pull_completed === true, 'local_base_sync.pull_completed must be true')
    need(nonEmptyString(localSync.head), 'local_base_sync.head is required')
    need(localSync.matches_remote === true, 'local_base_sync.matches_remote must be true')
    need(localSync.clean === true, 'local_base_sync.clean must be true')
  }
}

if (codeChanges) {
  need(isObject(postflight), 'code changes require implementation postflight report')
  need(postflight.status === 'passed', `postflight report must be passed, got ${postflight.status}`)
  need(
    postflight.gate === 'implementation_postflight',
    'postflight report gate must be implementation_postflight'
  )
  need(
    postflight.dispatch_run_id === handoff.dispatch_run_id,
    'postflight dispatch_run_id must match handoff'
  )
  need((postflight.errors ?? []).length === 0, 'Completion Gate cannot pass with postflight errors')

  const worktree = postflight.worktree
  need(isObject(worktree), 'postflight.worktree is required')
  if (isObject(worktree)) {
    need(worktree.status === 'passed', `postflight.worktree must be passed, got ${worktree.status}`)
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
    const dirtyOverlapExplicitlyAllowed =
      worktree.preexisting_dirty_overlap_explicitly_allowed === true
    const unsafePreexistingOverlap = worktree.unsafe_preexisting_overlap ?? []
    if (dirtyOverlapExplicitlyAllowed) {
      need(
        unsafePreexistingOverlap.length === 0,
        'Completion Gate cannot pass with unsafe preexisting dirty overlap'
      )
    } else {
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
    }
  }
  const noDeps = postflight.no_new_deps
  need(isObject(noDeps), 'postflight.no_new_deps is required')
  if (isObject(noDeps)) {
    need(noDeps.status === 'passed', `postflight.no_new_deps must be passed, got ${noDeps.status}`)
    need((noDeps.errors ?? []).length === 0, 'Completion Gate cannot pass with no-new-deps errors')
  }
  const style = postflight.style_stack
  need(isObject(style), 'postflight.style_stack is required')
  if (isObject(style)) {
    need(style.status === 'passed', `postflight.style_stack must be passed, got ${style.status}`)
    need((style.errors ?? []).length === 0, 'Completion Gate cannot pass with style-stack errors')
  }
}

if (needsRuntimeQaEvidence) {
  need(
    runtimeQa !== null,
    `runtime_acceptance_mode=${runtimeAcceptanceMode} requires runtime-qa-evidence.json`
  )
}
if (runtimeQa) {
  need(isObject(runtimeQa), 'runtime-qa-evidence must be an object')
  need(
    runtimeQa.dispatch_run_id === handoff.dispatch_run_id,
    'runtime-qa-evidence dispatch_run_id must match handoff'
  )
  for (const field of forbiddenRoleReceiptFields) {
    need(!(field in runtimeQa), `runtime-qa-evidence must not contain role-receipt field: ${field}`)
  }
  need(
    ['passed', 'failed', 'blocked'].includes(runtimeQa.status),
    'runtime-qa-evidence status must be passed|failed|blocked'
  )
  need(
    runtimeQa.runtime_acceptance_mode === runtimeAcceptanceMode,
    'runtime-qa-evidence.runtime_acceptance_mode must match handoff'
  )
  need(Array.isArray(runtimeQa.failures), 'runtime-qa-evidence.failures must be an array')
  need(Array.isArray(runtimeQa.not_verified), 'runtime-qa-evidence.not_verified must be an array')
  need(
    Array.isArray(runtimeQa.evidence_paths) && runtimeQa.evidence_paths.length > 0,
    'runtime-qa-evidence.evidence_paths must be a non-empty array'
  )
  need(
    runtimeAcceptanceMode === 'batch_substitute_allowed' ||
      (runtimeQa.not_verified ?? []).length === 0 ||
      runtimeQa.status !== 'passed',
    'passed runtime-qa-evidence cannot contain not_verified unless batch_substitute_allowed'
  )
  if (runtimeQa.status === 'passed') {
    need(
      (runtimeQa.failures ?? []).length === 0,
      'passed runtime-qa-evidence cannot contain failures'
    )
    if (runtimeAcceptanceMode !== 'batch_substitute_allowed') {
      need(
        (runtimeQa.not_verified ?? []).length === 0,
        'passed runtime-qa-evidence cannot contain not_verified'
      )
    }
  } else {
    need(
      (runtimeQa.failures ?? []).length > 0 ||
        (runtimeQa.not_verified ?? []).length > 0 ||
        nonEmptyString(runtimeQa.blocked_reason),
      'failed/blocked runtime-qa-evidence requires failures, not_verified, or blocked_reason'
    )
  }
  if (runtimeAcceptanceMode === 'automator_required') {
    need(
      runtimeQa.channel === 'miniprogram_automator',
      'automator_required requires channel=miniprogram_automator'
    )
    need(
      nonEmptyString(runtimeQa.catalog_id),
      'automator_required requires runtime-qa-evidence.catalog_id'
    )
    need(
      nonEmptyString(runtimeQa.execution_id),
      'automator_required requires runtime-qa-evidence.execution_id'
    )
    need(
      nonEmptyString(runtimeQa.script_sha256) && /^[a-f0-9]{64}$/i.test(runtimeQa.script_sha256),
      'automator_required requires runtime-qa-evidence.script_sha256'
    )
    need(
      nonEmptyString(runtimeQa.script) || nonEmptyString(runtimeQa.script_path),
      'automator_required requires exact E2E script path evidence'
    )
    need(
      nonEmptyString(runtimeQa.qa_run_execution_record),
      'automator_required requires runtime-qa-evidence.qa_run_execution_record'
    )
    if (nonEmptyString(runtimeQa.qa_run_execution_record)) {
      const recordPath = path.resolve(runtimeQa.qa_run_execution_record)
      need(
        fs.existsSync(recordPath),
        `qa_run_execution_record does not exist: ${runtimeQa.qa_run_execution_record}`
      )
      if (fs.existsSync(recordPath)) {
        const record = readJson(recordPath)
        need(
          record.catalog_id === runtimeQa.catalog_id,
          'qa_run_execution_record catalog_id must match runtime evidence'
        )
        need(
          record.execution_id === runtimeQa.execution_id,
          'qa_run_execution_record execution_id must match runtime evidence'
        )
        need(
          record.script_sha256 === runtimeQa.script_sha256,
          'qa_run_execution_record script_sha256 must match runtime evidence'
        )
        need(
          record.status === 'passed',
          'qa_run_execution_record status must be passed for automator acceptance'
        )
        need(
          record.preflight?.status === 'passed',
          'qa_run_execution_record must contain a passed qa preflight before automator acceptance'
        )
        need(
          record.frozen_script_sha256 === runtimeQa.script_sha256,
          'qa_run_execution_record frozen_script_sha256 must match runtime evidence'
        )
        need(
          record.observed_script_sha256_after_run === runtimeQa.script_sha256,
          'qa_run_execution_record must prove the frozen hash survived the live attempt'
        )
      }
    }
    if (fs.existsSync(automatorCatalogPath) && nonEmptyString(runtimeQa.catalog_id)) {
      const catalog = readJson(automatorCatalogPath)
      const entry = (catalog.entries ?? []).find(item => item.id === runtimeQa.catalog_id)
      need(
        !!entry,
        `runtime-qa-evidence.catalog_id not found in automator catalog: ${runtimeQa.catalog_id}`
      )
      if (entry) {
        const expectedScript = entry.leaf_script ?? entry.script
        need(
          [runtimeQa.script, runtimeQa.script_path].filter(nonEmptyString).includes(expectedScript),
          `runtime-qa-evidence script must match catalog leaf script: ${expectedScript}`
        )
        need(
          entry.script_sha256 === runtimeQa.script_sha256,
          'runtime-qa-evidence script_sha256 must match catalog script_sha256'
        )
      }
    }
    validateAutomatorProjectPath(runtimeQa.projectPath, 'runtime-qa-evidence.projectPath')
    need(nonEmptyString(runtimeQa.pagePath), 'runtime-qa-evidence.pagePath is required')
    const hasPort =
      Number.isInteger(runtimeQa.automator_port) ||
      (nonEmptyString(runtimeQa.automator_port) && /^\d+$/.test(String(runtimeQa.automator_port)))
    need(
      hasPort || nonEmptyString(runtimeQa.wsEndpoint),
      'runtime-qa-evidence requires automator_port or wsEndpoint'
    )
  }
  if (runtimeAcceptanceMode === 'batch_substitute_allowed') {
    need(runtimeQa.channel === 'batch', 'batch_substitute_allowed requires channel=batch')
    need(
      !nonEmptyString(runtimeQa.catalog_id),
      'batch substitute must not include automator catalog_id'
    )
    need(
      !nonEmptyString(runtimeQa.execution_id),
      'batch substitute must not include automator execution_id'
    )
    need(
      !nonEmptyString(runtimeQa.script_sha256),
      'batch substitute must not include automator script_sha256'
    )
    need(
      nonEmptyString(runtimeQa.user_approval_ref) &&
        runtimeQa.user_approval_ref === handoff?.validation?.batch_substitute_user_approval_ref,
      'batch substitute requires matching user_approval_ref'
    )
    need(
      runtimeQa.end_side_status === 'not_verified_by_user_approved_substitution',
      'batch substitute must set end_side_status=not_verified_by_user_approved_substitution'
    )
  }
  if (runtimeAcceptanceMode === 'batch_only') {
    need(runtimeQa.channel === 'batch', 'batch_only requires channel=batch')
    need(!nonEmptyString(runtimeQa.catalog_id), 'batch_only must not include automator catalog_id')
    need(
      !nonEmptyString(runtimeQa.execution_id),
      'batch_only must not include automator execution_id'
    )
    need(
      !nonEmptyString(runtimeQa.script_sha256),
      'batch_only must not include automator script_sha256'
    )
  }
  need(
    runtimeQa.status === 'passed',
    `runtime-qa-evidence must be passed before Completion Gate, got ${runtimeQa.status}`
  )
} else if (
  runtimeAcceptanceMode === 'automator_required' &&
  miniprogramAutomatorRequired &&
  mode !== 'codex_subagent'
) {
  const recoveryEvidence = impl.external_recovery_evidence ?? impl.zcode_recovery_evidence ?? {}
  const prReview = recoveryEvidence.pr_review ?? {}
  need(
    prReview.runtime_channel === 'miniprogram_automator',
    'Completion Gate external runtime QA requires pr_review.runtime_channel=miniprogram_automator'
  )
  validateAutomatorProjectPath(
    prReview.projectPath,
    'Completion Gate external pr_review.projectPath'
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
