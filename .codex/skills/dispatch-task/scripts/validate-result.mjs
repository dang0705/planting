#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateComputerUseToolEvidence,
  validateValidationEvidence
} from './validate-result-evidence.mjs'
import { validateUiCompleted } from './validate-result-ui.mjs'

const [role, handoffFile, resultFile] = process.argv.slice(2)
if (!['implementer', 'external'].includes(role) || !handoffFile || !resultFile) {
  console.error('usage: validate-result.mjs <implementer|external> <handoff.json> <result.json>')
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
const result = readJson(resultFile)
const handoffMode = handoff.implementation_mode ?? 'codex_subagent'
const handoffExternalMode = ['external_implementer', 'zcode_external'].includes(handoffMode)
const externalContract = handoff.external_contract ?? handoff.zcode_contract ?? {}
const externalProvider =
  externalContract.provider ||
  (externalContract.external_implementer === 'zcode_glm' ? 'zcode' : '')
const webExternalProvider =
  ['trae', 'chrome_cloud_agent'].includes(externalProvider) ||
  externalContract.prompt_transport === 'browser_plugin'
const errors = []
const need = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0
const nonEmptyArray = value => Array.isArray(value) && value.length > 0
const lower = value =>
  String(value ?? '')
    .trim()
    .toLowerCase()
const usesUniUi = value => /uni[-_ ]?ui|uniui/.test(lower(value))
const callsOf = object =>
  Array.isArray(object?.calls)
    ? object.calls.map(call => (typeof call === 'string' ? call : call?.tool)).filter(Boolean)
    : []
const normalize = file =>
  String(file ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
const normalizeFsPath = value => {
  if (!nonEmptyString(value)) {
    return ''
  }
  return path.resolve(String(value)).replaceAll('\\', '/').replace(/\/+$/, '')
}
const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const mainWorkspaceMiniProgramProjectPath = normalizeFsPath(
  path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
)
const acceptanceMentionsMiniProgramRuntime = (handoff.acceptance ?? []).some(item => {
  const raw = String(item ?? '')
  const text = raw.toLowerCase()
  return (
    text.includes('miniprogram-automator') ||
    text.includes('miniprogram automator') ||
    text.includes('9420') ||
    text.includes('wx.request') ||
    raw.includes('小程序') ||
    raw.includes('端上') ||
    raw.includes('微信开发者工具')
  )
})
const acceptanceMentionsDispatchGovernance = (handoff.acceptance ?? []).some(item => {
  const raw = String(item ?? '')
  return /hook|catalog|episode|automator preflight/i.test(raw) || raw.includes('钩子')
})
const miniprogramAutomatorRequired =
  typeof handoff?.validation?.miniprogram_automator_required === 'boolean'
    ? handoff.validation.miniprogram_automator_required
    : acceptanceMentionsMiniProgramRuntime
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
const globToRegExp = pattern => {
  let source = normalize(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&')
  source = source
    .replace(/\*\*/g, '§§DOUBLE§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLE§§/g, '.*')
  return new RegExp(`^${source}$`)
}
const matchesAny = (file, patterns = []) =>
  patterns.some(pattern => globToRegExp(pattern).test(normalize(file)))
const validateChangedFiles = (changedFiles, requireNonEmpty) => {
  need(Array.isArray(changedFiles), 'changed_files must be an array')
  if (!Array.isArray(changedFiles)) {
    return
  }
  if (requireNonEmpty) {
    need(changedFiles.length > 0, 'completed code task requires non-empty changed_files')
  }
  for (const raw of changedFiles) {
    const file = normalize(raw)
    need(nonEmptyString(file), 'changed_files entries must be non-empty strings')
    need(
      matchesAny(file, handoff.allowed_paths ?? []),
      `changed file outside allowed_paths: ${file}`
    )
    need(
      !matchesAny(file, handoff.forbidden_paths ?? []),
      `changed file matches forbidden_paths: ${file}`
    )
  }
}
if (role === 'implementer') {
  need(
    (handoff.implementation_mode ?? 'codex_subagent') === 'codex_subagent',
    'role=implementer is only valid for implementation_mode=codex_subagent'
  )
  need(isObject(result.agent_identity), 'agent_identity is required')
  need(
    result?.agent_identity?.agent_type === handoff?.spawn_contract?.implementer_agent_type,
    `implementer agent_identity mismatch: expected ${handoff?.spawn_contract?.implementer_agent_type}, got ${result?.agent_identity?.agent_type}`
  )
  need(
    result?.agent_identity?.dispatch_run_id === handoff.dispatch_run_id,
    'implementer agent_identity.dispatch_run_id must match handoff'
  )
  need(
    ['completed', 'blocked'].includes(result.status),
    'implementer status must be completed|blocked'
  )
  validateChangedFiles(
    result.changed_files,
    result.status === 'completed' && handoff?.task?.code_changes_required === true
  )
  need(nonEmptyString(result.implementation_summary), 'implementation_summary is required')
  need(
    typeof result.project_constraints_verified === 'boolean',
    'project_constraints_verified must be boolean'
  )
  need(Array.isArray(result.deviations_or_blockers), 'deviations_or_blockers must be an array')
  if (result.status === 'completed') {
    need(
      result.project_constraints_verified === true,
      'completed result requires project_constraints_verified=true'
    )
    need(
      result.deviations_or_blockers.length === 0,
      'completed result cannot contain deviations_or_blockers'
    )
    validateValidationEvidence(result, true, { need, isObject, nonEmptyString })
    if (acceptanceMentionsDispatchGovernance) {
      validateDispatchGovernanceEvidence(result, { need, isObject, nonEmptyString })
    }
    validateUiCompleted(result, {
      handoff,
      figmaAcquiredBy: 'implementer',
      uniUiPolicyName: 'uni-ui-figma-component-mapper-contract',
      need,
      isObject,
      nonEmptyString,
      nonEmptyArray,
      lower,
      usesUniUi,
      callsOf
    })
  } else {
    need(
      nonEmptyArray(result.deviations_or_blockers),
      'blocked result requires deviations_or_blockers'
    )
  }
}

function validateDispatchGovernanceEvidence(resultObject, { need, isObject, nonEmptyString }) {
  for (const name of [
    'migration_inventory',
    'hook_self_test',
    'e2e_catalog_validation',
    'episode_state_contract',
    'status_card_contract',
    'automator_preflight_contract'
  ]) {
    need(isObject(resultObject[name]), `dispatch governance result requires ${name}`)
    if (isObject(resultObject[name])) {
      need(nonEmptyString(resultObject[name].status), `${name}.status is required`)
      need(Array.isArray(resultObject[name].commands), `${name}.commands must be an array`)
      need(nonEmptyString(resultObject[name].evidence_ref), `${name}.evidence_ref is required`)
    }
  }
  need(
    Array.isArray(resultObject.known_limitations),
    'dispatch governance result requires known_limitations array'
  )
  need(isObject(resultObject.qa_handoff), 'dispatch governance result requires qa_handoff')
  if (isObject(resultObject.qa_handoff)) {
    need(
      Array.isArray(resultObject.qa_handoff.actual_commands),
      'dispatch governance qa_handoff.actual_commands must be an array'
    )
  }
}

if (role === 'external') {
  need(
    handoffExternalMode,
    'role=external is only valid for implementation_mode=external_implementer'
  )
  need(
    ['codex_recovery_after_external', 'codex_recovery_after_zcode'].includes(result.source),
    'external result source must be codex_recovery_after_external|codex_recovery_after_zcode'
  )
  need(
    ['completed', 'blocked'].includes(result.status),
    'external status must be completed|blocked'
  )
  need(result.codex_self_implementation === false, 'codex_self_implementation must be false')
  need(
    result.external_completion_claim_treated_as_non_authoritative === true ||
      result.zcode_completion_claim_treated_as_non_authoritative === true,
    'external completion claim must be treated as non-authoritative'
  )
  need(
    result.git_diff_recovered_by_codex === true || result.status === 'blocked',
    'git_diff_recovered_by_codex must be true unless blocked before diff recovery'
  )
  need(
    result.allowed_forbidden_paths_checked === true || result.status === 'blocked',
    'allowed_forbidden_paths_checked must be true unless blocked'
  )
  need(
    result.project_constraints_checked_by_codex === true || result.status === 'blocked',
    'project_constraints_checked_by_codex must be true unless blocked'
  )
  need(
    isObject(result.external_handoff_manual) || isObject(result.zcode_handoff_manual),
    'external_handoff_manual is required in external recovery result'
  )
  const handoffManual = result.external_handoff_manual ?? result.zcode_handoff_manual
  if (isObject(handoffManual)) {
    const remotePrManualNotRequired =
      webExternalProvider && handoffManual.status === 'not_required_remote_pr'
    if (remotePrManualNotRequired) {
      need(
        handoffManual.read_by_codex === false,
        'remote PR external_handoff_manual.read_by_codex must be false when local manual is not required'
      )
      need(
        nonEmptyString(handoffManual.not_required_reason),
        'remote PR external_handoff_manual.not_required_reason is required'
      )
    } else {
      need(
        handoffManual.read_by_codex === true,
        'external_handoff_manual.read_by_codex must be true'
      )
      need(
        handoffManual.path === handoff?.handoff_manual?.path,
        'external_handoff_manual.path must match handoff.handoff_manual.path'
      )
    }
    if (result.status === 'completed') {
      need(
        handoffManual.status === 'completed' || remotePrManualNotRequired,
        'completed external recovery requires handoff_manual.status=completed or not_required_remote_pr for web PR recovery'
      )
    } else {
      const allowedBlockedManualStatuses = ['blocked', 'completed', 'missing', 'invalid']
      if (webExternalProvider) {
        allowedBlockedManualStatuses.push('not_required_remote_pr')
      }
      need(
        allowedBlockedManualStatuses.includes(handoffManual.status),
        'blocked external recovery requires a valid handoff manual status'
      )
    }
    need(
      nonEmptyString(handoffManual.updated_at) ||
        ['missing', 'invalid', 'not_required_remote_pr'].includes(handoffManual.status),
      'external_handoff_manual.updated_at is required unless missing/invalid'
    )
  }
  need(
    isObject(result.external_send_receipt) || isObject(result.zcode_send_receipt),
    'external_send_receipt is required in external recovery result'
  )
  const sendReceipt = result.external_send_receipt ?? result.zcode_send_receipt
  if (isObject(sendReceipt)) {
    if (result.status === 'completed') {
      need(
        sendReceipt.status === 'sent',
        'completed recovery requires external_send_receipt.status=sent'
      )
      need(
        sendReceipt.prompt_integrity_verified === true,
        'external_send_receipt.prompt_integrity_verified must be true'
      )
      if (externalProvider === 'zcode' || result.zcode_send_receipt) {
        need(
          ['enter', 'send_button'].includes(sendReceipt.send_action),
          'completed ZCode recovery requires send_action=enter|send_button'
        )
        need(
          sendReceipt.clipboard_paste_used === true,
          'zcode_send_receipt.clipboard_paste_used must be true'
        )
        const cu = sendReceipt.computer_use ?? {}
        need(isObject(cu), 'zcode_send_receipt.computer_use is required')
        need(cu.tool_invoked === true, 'zcode_send_receipt.computer_use.tool_invoked must be true')
        validateComputerUseToolEvidence(cu, { need, isObject, nonEmptyString })
        need(
          cu.shell_only_ui_automation_used === false,
          'zcode_send_receipt.computer_use.shell_only_ui_automation_used must be false'
        )
        need(
          cu.manual_typing_used === false,
          'zcode_send_receipt.computer_use.manual_typing_used must be false'
        )
      }
      if (webExternalProvider) {
        if (externalContract?.codex_runtime_surface === 'codex_desktop') {
          need(
            sendReceipt.codex_runtime_surface === 'codex_desktop',
            'web external send receipt must record codex_runtime_surface=codex_desktop'
          )
          need(
            sendReceipt.web_provider_open_surface === 'builtin_in_app_browser',
            'Codex Desktop web external send receipt must record web_provider_open_surface=builtin_in_app_browser'
          )
          const tabRetention = sendReceipt.tab_retention ?? {}
          need(
            isObject(tabRetention),
            'Codex Desktop web external send receipt requires tab_retention'
          )
          if (isObject(tabRetention)) {
            need(
              tabRetention.status === 'handoff',
              'Codex Desktop web external tab_retention.status must be handoff'
            )
            need(
              tabRetention.method === 'browser.tabs.finalize.keep',
              'Codex Desktop web external tab_retention.method must be browser.tabs.finalize.keep'
            )
            need(
              nonEmptyString(tabRetention.session_url),
              'Codex Desktop web external tab_retention.session_url is required'
            )
          }
          const waitPolicy = sendReceipt.external_wait_policy ?? {}
          need(
            isObject(waitPolicy),
            'Codex Desktop web external send receipt requires external_wait_policy'
          )
          if (isObject(waitPolicy)) {
            need(
              waitPolicy.mode === 'child_run_lock',
              'Codex Desktop web external external_wait_policy.mode must be child_run_lock'
            )
            need(
              Number(waitPolicy.initial_check_min_minutes) >= 5,
              'Codex Desktop web external initial_check_min_minutes must be >= 5'
            )
            need(
              Number(waitPolicy.poll_interval_min_minutes) >= 5,
              'Codex Desktop web external poll_interval_min_minutes must be >= 5'
            )
            need(
              waitPolicy.short_timeout_completion_forbidden === true,
              'Codex Desktop web external short_timeout_completion_forbidden must be true'
            )
            const monitoring = waitPolicy.monitoring_automation ?? {}
            need(
              isObject(monitoring),
              'Codex Desktop web external requires external_wait_policy.monitoring_automation'
            )
            if (isObject(monitoring)) {
              need(
                monitoring.mode === 'recurring_wakeup',
                'web external monitoring_automation.mode must be recurring_wakeup'
              )
              need(
                nonEmptyString(monitoring.automation_id),
                'web external monitoring_automation.automation_id is required'
              )
              need(
                monitoring.automation_id.includes(handoff.dispatch_run_id),
                'web external monitoring_automation.automation_id must include dispatch_run_id'
              )
              need(
                Number(monitoring.initial_delay_minutes) >= 5,
                'web external monitoring_automation.initial_delay_minutes must be >= 5'
              )
              need(
                Number(monitoring.poll_interval_minutes) >= 5,
                'web external monitoring_automation.poll_interval_minutes must be >= 5'
              )
              need(
                ['stopped', 'unavailable'].includes(monitoring.status),
                'completed web external monitoring_automation.status must be stopped|unavailable'
              )
              need(
                nonEmptyString(monitoring.session_url),
                'web external monitoring_automation.session_url is required'
              )
            }
          }
        }
        const receiptRemoteSync = sendReceipt.remote_sync ?? {}
        need(isObject(receiptRemoteSync), 'web external send receipt requires remote_sync')
        need(
          receiptRemoteSync.status === 'pushed',
          'web external send receipt remote_sync.status must be pushed'
        )
        need(
          receiptRemoteSync.remote === externalContract?.remote_sync?.remote,
          'web external send receipt remote_sync.remote must match handoff'
        )
        need(
          receiptRemoteSync.branch === externalContract?.remote_sync?.branch,
          'web external send receipt remote_sync.branch must match handoff'
        )
        need(
          receiptRemoteSync.base_commit === externalContract?.remote_sync?.base_commit,
          'web external send receipt remote_sync.base_commit must match handoff'
        )
        need(
          nonEmptyString(receiptRemoteSync.push_ref),
          'web external send receipt remote_sync.push_ref is required'
        )
        need(
          receiptRemoteSync.planned_worktree_path ===
            externalContract?.remote_sync?.planned_worktree_path,
          'web external send receipt remote_sync.planned_worktree_path must match handoff'
        )
      }
    } else {
      need(
        ['sent', 'blocked'].includes(sendReceipt.status),
        'blocked recovery receipt status must be sent|blocked'
      )
    }
  }
  validateChangedFiles(
    result.changed_files,
    result.status === 'completed' && handoff?.task?.code_changes_required === true
  )
  need(nonEmptyString(result.implementation_summary), 'implementation_summary is required')
  need(Array.isArray(result.deviations_or_blockers), 'deviations_or_blockers must be an array')
  if (result.status === 'completed') {
    need(
      result.deviations_or_blockers.length === 0,
      'completed external result cannot contain deviations_or_blockers'
    )
    const recoveryEvidence = result.external_recovery_evidence ?? result.zcode_recovery_evidence
    need(isObject(recoveryEvidence), 'external_recovery_evidence is required')
    if (isObject(recoveryEvidence)) {
      need(
        recoveryEvidence.handoff_manual_read === true,
        'external_recovery_evidence.handoff_manual_read must be true'
      )
      need(
        recoveryEvidence.git_status_read === true,
        'external_recovery_evidence.git_status_read must be true'
      )
      need(
        recoveryEvidence.git_diff_read === true,
        'external_recovery_evidence.git_diff_read must be true'
      )
      need(
        recoveryEvidence.forbidden_paths_clean === true,
        'external_recovery_evidence.forbidden_paths_clean must be true'
      )
      need(
        recoveryEvidence.no_unapproved_dependencies === true,
        'external_recovery_evidence.no_unapproved_dependencies must be true'
      )
      if (webExternalProvider) {
        const prReview = recoveryEvidence.pr_review ?? {}
        const expectedRemoteBranch =
          externalContract?.remote_sync?.push_ref ||
          `${externalContract?.remote_sync?.remote}/${externalContract?.remote_sync?.branch}`
        const expectedWorktreePath = externalContract?.remote_sync?.planned_worktree_path
        const claimsAutomatorRuntime =
          prReview.runtime_channel === 'miniprogram_automator' ||
          nonEmptyString(prReview.projectPath)
        const externalReviewMustCarryAutomatorPath =
          miniprogramAutomatorRequired && handoff?.task?.qa_required !== true
        need(isObject(prReview), 'web external recovery requires pr_review evidence')
        need(
          nonEmptyString(prReview.pr_url) || nonEmptyString(prReview.remote_branch),
          'web external pr_review requires pr_url or remote_branch'
        )
        need(
          nonEmptyString(prReview.worktree_path),
          'web external pr_review.worktree_path is required'
        )
        need(nonEmptyString(prReview.fetch_ref), 'web external pr_review.fetch_ref is required')
        need(
          nonEmptyString(prReview.worktree_head),
          'web external pr_review.worktree_head is required'
        )
        need(
          prReview.remote_branch === expectedRemoteBranch ||
            prReview.fetch_ref === expectedRemoteBranch,
          'web external pr_review must match handoff remote branch'
        )
        need(
          prReview.worktree_path === expectedWorktreePath,
          'web external pr_review.worktree_path must match handoff planned_worktree_path'
        )
        need(
          Array.isArray(prReview.commands_run) && prReview.commands_run.length > 0,
          'web external pr_review.commands_run must be a non-empty array'
        )
        need(
          prReview.main_workspace_untouched === true,
          'web external pr_review.main_workspace_untouched must be true'
        )
        if (claimsAutomatorRuntime || externalReviewMustCarryAutomatorPath) {
          need(
            prReview.runtime_channel === 'miniprogram_automator',
            'web external pr_review.runtime_channel must be miniprogram_automator when runtime QA is claimed'
          )
          validateAutomatorProjectPath(prReview.projectPath, 'web external pr_review.projectPath')
        }
      }
    }
    validateValidationEvidence(result, true, { need, isObject, nonEmptyString })
    if (webExternalProvider) {
      const unitTests = result?.validation_evidence?.unit_tests ?? {}
      need(
        unitTests.result === 'passed',
        'completed Web external implementation requires validation_evidence.unit_tests.result=passed'
      )
      need(
        Array.isArray(unitTests.commands) && unitTests.commands.length > 0,
        'completed Web external implementation requires unit test commands'
      )
    }
    validateUiCompleted(result, {
      handoff,
      figmaAcquiredBy: ['external_implementer', 'zcode_external_implementer'],
      uniUiPolicyName: 'uni-ui-figma-component-mapper-contract',
      need,
      isObject,
      nonEmptyString,
      nonEmptyArray,
      lower,
      usesUniUi,
      callsOf
    })
  } else {
    need(
      nonEmptyArray(result.deviations_or_blockers),
      'blocked external result requires deviations_or_blockers'
    )
  }
}

if (errors.length) {
  console.error(
    JSON.stringify({ status: 'blocked', role, gate: 'result_contract', errors }, null, 2)
  )
  process.exit(1)
}
console.log(
  JSON.stringify(
    {
      status: 'passed',
      role,
      gate: 'result_contract',
      result_status: result.status,
      implementation_mode: handoff.implementation_mode ?? 'codex_subagent'
    },
    null,
    2
  )
)
