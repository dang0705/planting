#!/usr/bin/env node
import fs from 'node:fs'

const [role, handoffFile, resultFile] = process.argv.slice(2)
if (!['implementer', 'external', 'qa'].includes(role) || !handoffFile || !resultFile) {
  console.error('usage: validate-result.mjs <implementer|external|qa> <handoff.json> <result.json>')
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
  externalContract.provider || (externalContract.external_implementer === 'zcode_glm' ? 'zcode' : '')
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
  if (!Array.isArray(changedFiles)) {return}
  if (requireNonEmpty)
    {need(changedFiles.length > 0, 'completed code task requires non-empty changed_files')}
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
const validateEvidenceCheck = (name, check, requireSuccess) => {
  need(isObject(check), `validation_evidence.${name} must be an object`)
  if (!isObject(check)) {return}
  need(
    ['passed', 'not_applicable', 'failed', 'blocked'].includes(check.result),
    `validation_evidence.${name}.result must be passed|not_applicable|failed|blocked`
  )
  need(Array.isArray(check.commands), `validation_evidence.${name}.commands must be an array`)
  if (check.result === 'not_applicable') {
    need(
      nonEmptyString(check.reason),
      `validation_evidence.${name}.reason is required for not_applicable`
    )
  }
  if (requireSuccess) {
    need(
      ['passed', 'not_applicable'].includes(check.result),
      `validation_evidence.${name} is not successful: ${check.result}`
    )
  }
}
const validateValidationEvidence = (resultObject, requireSuccess) => {
  need(isObject(resultObject.validation_evidence), 'completed result requires validation_evidence')
  if (!isObject(resultObject.validation_evidence)) {return}
  for (const name of ['unit_tests', 'lint', 'typecheck', 'build', 'self_check']) {
    validateEvidenceCheck(name, resultObject.validation_evidence[name], requireSuccess)
  }
}
const validateComputerUseToolEvidence = cu => {
  const tie = cu?.tool_invocation_evidence ?? {}
  need(isObject(tie), 'computer_use.tool_invocation_evidence is required')
  need(
    tie.actual_tool_invocation_required === true,
    'tool_invocation_evidence.actual_tool_invocation_required must be true'
  )
  need(
    ['@ZCode', '@Computer'].includes(tie.tool_target),
    'tool_invocation_evidence.tool_target must be @ZCode|@Computer'
  )
  need(tie.tool_events_seen === true, 'tool_invocation_evidence.tool_events_seen must be true')
  need(
    Number.isInteger(tie.tool_event_count) && tie.tool_event_count >= 5,
    'tool_invocation_evidence.tool_event_count must be >= 5'
  )
  need(
    Array.isArray(tie.transcript_event_refs) &&
      tie.transcript_event_refs.length >= 5 &&
      tie.transcript_event_refs.every(nonEmptyString),
    'tool_invocation_evidence.transcript_event_refs must contain >=5 non-empty refs'
  )
  need(
    Array.isArray(tie.commands_issued) &&
      tie.commands_issued.length >= 5 &&
      tie.commands_issued.every(nonEmptyString),
    'tool_invocation_evidence.commands_issued must contain >=5 commands'
  )
}
const validateUiCompleted = (resultObject, { figmaAcquiredBy, uniUiPolicyName }) => {
  if (handoff?.task?.ui_task === true) {
    need(
      nonEmptyArray(resultObject.ui_scope_map),
      'completed UI task requires non-empty ui_scope_map'
    )
    need(
      isObject(resultObject.style_stack_compliance),
      'completed UI task requires style_stack_compliance'
    )
    need(
      isObject(resultObject.component_reuse_evidence),
      'completed UI task requires component_reuse_evidence'
    )
    need(
      nonEmptyArray(resultObject?.component_reuse_evidence?.searched),
      'component_reuse_evidence.searched is required'
    )
    need(
      Array.isArray(resultObject?.component_reuse_evidence?.newly_created),
      'component_reuse_evidence.newly_created must be an array'
    )
    if (nonEmptyArray(resultObject?.component_reuse_evidence?.newly_created)) {
      need(
        nonEmptyString(resultObject?.component_reuse_evidence?.reason),
        'new components require a non-reuse reason'
      )
    }
    const expectedStack = lower(handoff?.project_constraints?.styling_system)
    const actualStack = lower(resultObject?.style_stack_compliance?.styling_system)
    need(
      actualStack === expectedStack,
      `styling_system mismatch: expected ${expectedStack}, got ${actualStack}`
    )
    need(
      Array.isArray(resultObject?.style_stack_compliance?.new_dependencies),
      'style_stack_compliance.new_dependencies must be an array'
    )
    if (expectedStack.includes('tailwind')) {
      need(
        resultObject?.style_stack_compliance?.tailwind_used === true,
        'Tailwind task requires tailwind_used=true'
      )
      const exceptionAllowed =
        lower(handoff?.project_constraints?.new_scss_policy) === 'explicit_exception_only' &&
        nonEmptyString(resultObject?.style_stack_compliance?.scss_exception_ref) &&
        (handoff?.project_constraints?.scss_exceptions ?? []).includes(
          resultObject.style_stack_compliance.scss_exception_ref
        )
      need(
        resultObject?.style_stack_compliance?.new_scss_added === false || exceptionAllowed,
        'new SCSS is forbidden without a Contract-listed exception'
      )
      const changedScss = (resultObject.changed_files ?? []).filter(file =>
        /\.s[ac]ss$/i.test(file)
      )
      need(
        changedScss.length === 0 || exceptionAllowed,
        `changed SCSS files without exception: ${changedScss.join(', ')}`
      )
    }
    if (lower(handoff?.project_constraints?.dependency_policy) === 'no_new_dependencies') {
      need(
        (resultObject?.style_stack_compliance?.new_dependencies ?? []).length === 0,
        'dependency_policy=no_new_dependencies but result reports new dependencies'
      )
    }
  }
  if (
    nonEmptyString(handoff?.figma?.link) &&
    usesUniUi(handoff?.project_constraints?.component_library)
  ) {
    const mapping = resultObject.uni_ui_mapping_evidence
    need(isObject(mapping), 'Figma + uni-ui task requires uni_ui_mapping_evidence')
    if (isObject(mapping)) {
      need(mapping.status === 'completed', 'uni_ui_mapping_evidence.status must be completed')
      const skillOk = mapping.skill === '$uni-ui-figma-component-mapper'
      const policyOk = mapping.policy === uniUiPolicyName
      need(
        skillOk || policyOk,
        `uni_ui_mapping_evidence must cite skill=$uni-ui-figma-component-mapper or policy=${uniUiPolicyName}`
      )
      need(
        mapping.generated_before_first_ui_edit === true,
        'uni_ui_mapping_evidence must be generated before the first UI edit'
      )
      need(nonEmptyArray(mapping.regions), 'uni_ui_mapping_evidence.regions is required')
      need(
        Array.isArray(mapping.used_components),
        'uni_ui_mapping_evidence.used_components must be an array'
      )
      need(
        Array.isArray(mapping.custom_regions),
        'uni_ui_mapping_evidence.custom_regions must be an array'
      )
      need(
        mapping.install_dependency_checked === true,
        'uni_ui_mapping_evidence.install_dependency_checked must be true'
      )
      need(
        ['easycom', 'manual_existing_pattern', 'not_applicable'].includes(mapping.easycom_policy),
        'uni_ui_mapping_evidence.easycom_policy must be easycom|manual_existing_pattern|not_applicable'
      )
    }
  }
  if (nonEmptyString(handoff?.figma?.link)) {
    const evidence = resultObject.figma_fetch_evidence
    need(isObject(evidence), 'Figma task requires figma_fetch_evidence')
    if (isObject(evidence)) {
      need(evidence.status === 'success', 'figma_fetch_evidence.status must be success')
      const allowedAcquirers = Array.isArray(figmaAcquiredBy) ? figmaAcquiredBy : [figmaAcquiredBy]
      need(
        allowedAcquirers.includes(evidence.acquired_by),
        `figma_fetch_evidence.acquired_by must be ${allowedAcquirers.join('|')}`
      )
      need(
        evidence.acquired_before_first_ui_edit === true,
        'Figma must be acquired before the first UI edit'
      )
      need(
        evidence.source_link === handoff.figma.link,
        'figma_fetch_evidence.source_link must match handoff'
      )
      need(
        evidence.node_id === handoff.figma.node_id,
        'figma_fetch_evidence.node_id must match handoff'
      )
      const calls = callsOf(evidence)
      const screenshotPolicySkip =
        allowedAcquirers.includes('zcode_external_implementer') &&
        evidence?.screenshot_policy_skip?.allowed === true &&
        nonEmptyString(evidence?.screenshot_policy_skip?.policy_ref) &&
        /AGENTS\.md/i.test(evidence.screenshot_policy_skip.policy_ref) &&
        /GLM|screenshot|截图|skip|跳过/i.test(evidence.screenshot_policy_skip.policy_ref)
      for (const tool of ['get_metadata', 'get_design_context']) {
        need(calls.includes(tool), `implementer must directly call ${tool}`)
      }
      if (!screenshotPolicySkip)
        {need(calls.includes('get_screenshot'), 'implementer must directly call get_screenshot')}
      need(nonEmptyArray(evidence.nodes_read), 'figma_fetch_evidence.nodes_read is required')
      if (!screenshotPolicySkip)
        {need(
          nonEmptyString(evidence.screenshot_ref),
          'figma_fetch_evidence.screenshot_ref is required'
        )}
      need(
        Array.isArray(evidence.variables_or_assets_used),
        'variables_or_assets_used must be an array'
      )
      need(Array.isArray(evidence.unresolved), 'figma_fetch_evidence.unresolved must be an array')
      need(
        evidence.unresolved.length === 0,
        'completed Figma implementation cannot contain unresolved design items'
      )
    }
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
    validateValidationEvidence(result, true)
    validateUiCompleted(result, {
      figmaAcquiredBy: 'implementer',
      uniUiPolicyName: 'uni-ui-figma-component-mapper-contract'
    })
  } else {
    need(
      nonEmptyArray(result.deviations_or_blockers),
      'blocked result requires deviations_or_blockers'
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
    need(
      handoffManual.read_by_codex === true,
      'external_handoff_manual.read_by_codex must be true'
    )
    need(
      handoffManual.path === handoff?.handoff_manual?.path,
      'external_handoff_manual.path must match handoff.handoff_manual.path'
    )
    if (result.status === 'completed') {
      need(
        handoffManual.status === 'completed',
        'completed external recovery requires handoff_manual.status=completed'
      )
    } else {
      need(
        ['blocked', 'completed', 'missing', 'invalid'].includes(handoffManual.status),
        'blocked external recovery requires handoff manual blocked/completed/missing/invalid status'
      )
    }
    need(
      nonEmptyString(handoffManual.updated_at) ||
        ['missing', 'invalid'].includes(handoffManual.status),
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
        validateComputerUseToolEvidence(cu)
        need(
          cu.shell_only_ui_automation_used === false,
          'zcode_send_receipt.computer_use.shell_only_ui_automation_used must be false'
        )
        need(
          cu.manual_typing_used === false,
          'zcode_send_receipt.computer_use.manual_typing_used must be false'
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
    }
    validateValidationEvidence(result, true)
    validateUiCompleted(result, {
      figmaAcquiredBy: ['external_implementer', 'zcode_external_implementer'],
      uniUiPolicyName: 'uni-ui-figma-component-mapper-contract'
    })
  } else {
    need(
      nonEmptyArray(result.deviations_or_blockers),
      'blocked external result requires deviations_or_blockers'
    )
  }
}

if (role === 'qa') {
  need(isObject(result.agent_identity), 'agent_identity is required')
  need(
    result?.agent_identity?.agent_type === handoff?.spawn_contract?.qa_agent_type,
    `QA agent_identity mismatch: expected ${handoff?.spawn_contract?.qa_agent_type}, got ${result?.agent_identity?.agent_type}`
  )
  need(
    result?.agent_identity?.dispatch_run_id === handoff.dispatch_run_id,
    'QA agent_identity.dispatch_run_id must match handoff'
  )
  need(
    ['passed', 'failed', 'blocked'].includes(result.status),
    'QA status must be passed|failed|blocked'
  )
  need(result.unit_tests_run === false, 'QA must report unit_tests_run=false')
  need(nonEmptyArray(result.coverage), 'QA coverage is required')
  need(nonEmptyArray(result.checks_and_evidence), 'QA checks_and_evidence is required')
  need(Array.isArray(result.failures), 'failures must be an array')
  need(Array.isArray(result.not_verified), 'not_verified must be an array')
  if (result.status === 'passed') {
    need(result.failures.length === 0, 'passed QA cannot contain failures')
    need(result.not_verified.length === 0, 'passed QA cannot contain not_verified')
  } else {
    need(
      result.failures.length > 0 ||
        result.not_verified.length > 0 ||
        nonEmptyString(result.blocked_reason),
      'failed/blocked QA requires failures, not_verified, or blocked_reason'
    )
  }
  if (nonEmptyString(handoff?.figma?.link) && result.status === 'passed') {
    const evidence = result.figma_baseline_evidence
    need(isObject(evidence), 'passed Figma QA requires figma_baseline_evidence')
    if (isObject(evidence)) {
      need(evidence.status === 'ready', 'figma_baseline_evidence.status must be ready')
      need(
        evidence.acquired_by === 'qa_reviewer',
        'figma_baseline_evidence.acquired_by must be qa_reviewer'
      )
      need(evidence.independent_read === true, 'QA must independently read Figma')
      need(evidence.source_link === handoff.figma.link, 'QA source_link must match handoff')
      need(evidence.node_id === handoff.figma.node_id, 'QA node_id must match handoff')
      const calls = callsOf(evidence)
      for (const tool of ['get_metadata', 'get_screenshot'])
        {need(calls.includes(tool), `QA must independently call ${tool}`)}
      need(
        nonEmptyString(evidence.reference_screenshot_ref),
        'QA reference_screenshot_ref is required'
      )
      need(
        nonEmptyString(evidence.actual_runtime_screenshot_ref),
        'QA actual_runtime_screenshot_ref is required'
      )
      need(nonEmptyArray(evidence.states_checked), 'QA states_checked is required')
      need(Array.isArray(evidence.differences), 'QA differences must be an array')
      need(evidence.result === 'passed', 'figma_baseline_evidence.result must be passed')
      const unapproved = (evidence.differences ?? []).filter(
        difference =>
          typeof difference === 'string' ||
          difference?.allowed !== true ||
          !nonEmptyString(difference?.approval_ref)
      )
      need(unapproved.length === 0, 'QA has unapproved Figma differences')
    }
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
