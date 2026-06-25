#!/usr/bin/env node
import fs from 'node:fs';

const [role, handoffFile, resultFile] = process.argv.slice(2);
if (!['implementer', 'external', 'qa'].includes(role) || !handoffFile || !resultFile) {
  console.error('usage: validate-result.mjs <implementer|external|qa> <handoff.json> <result.json>');
  process.exit(2);
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2));
    process.exit(2);
  }
};

const handoff = readJson(handoffFile);
const result = readJson(resultFile);
const errors = [];
const need = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const lower = (value) => String(value ?? '').trim().toLowerCase();
const usesUniUi = (value) => /uni[-_ ]?ui|uniui/.test(lower(value));
const callsOf = (object) => Array.isArray(object?.calls)
  ? object.calls.map((call) => typeof call === 'string' ? call : call?.tool).filter(Boolean)
  : [];

const implementationMode = handoff.implementation_mode ?? 'codex_subagent';

const validateComputerUseToolEvidence = (cu) => {
  const tie = cu?.tool_invocation_evidence ?? {};
  need(isObject(tie), 'computer_use.tool_invocation_evidence is required');
  need(tie.actual_tool_invocation_required === true, 'tool_invocation_evidence.actual_tool_invocation_required must be true');
  need(['@ZCode', '@Computer'].includes(tie.tool_target), 'tool_invocation_evidence.tool_target must be @ZCode|@Computer');
  need(tie.tool_events_seen === true, 'tool_invocation_evidence.tool_events_seen must be true');
  need(Number.isInteger(tie.tool_event_count) && tie.tool_event_count >= 5, 'tool_invocation_evidence.tool_event_count must be >= 5');
  need(Array.isArray(tie.transcript_event_refs) && tie.transcript_event_refs.length >= 5 && tie.transcript_event_refs.every(nonEmptyString), 'tool_invocation_evidence.transcript_event_refs must contain >=5 non-empty refs');
  need(Array.isArray(tie.commands_issued) && tie.commands_issued.length >= 5 && tie.commands_issued.every(nonEmptyString), 'tool_invocation_evidence.commands_issued must contain >=5 commands');
};

const globToRegExp = (pattern) => {
  let source = String(pattern).replaceAll('\\', '/').replace(/[.+^${}()|[\]\\]/g, '\\$&');
  source = source.replace(/\*\*/g, '§§DOUBLE§§').replace(/\*/g, '[^/]*').replace(/§§DOUBLE§§/g, '.*');
  return new RegExp(`^${source}$`);
};
const matchesAny = (file, patterns = []) => patterns.some((pattern) =>
  globToRegExp(pattern).test(String(file).replaceAll('\\', '/')));

const validateEvidenceCheck = (name, check, requireSuccess) => {
  need(isObject(check), `validation_evidence.${name} must be an object`);
  if (!isObject(check)) {
    return;
  }
  need(['passed', 'not_applicable', 'failed', 'blocked'].includes(check.result),
    `validation_evidence.${name}.result must be passed|not_applicable|failed|blocked`);
  need(Array.isArray(check.commands), `validation_evidence.${name}.commands must be an array`);
  if (check.result === 'not_applicable') {
    need(nonEmptyString(check.reason), `validation_evidence.${name}.reason is required for not_applicable`);
  }
  if (requireSuccess) {
    need(['passed', 'not_applicable'].includes(check.result),
      `validation_evidence.${name} is not successful: ${check.result}`);
  }
};

const validateChangedFiles = (changedFiles) => {
  need(Array.isArray(changedFiles), 'changed_files must be an array');
  if (!Array.isArray(changedFiles)) {
    return;
  }
  for (const file of changedFiles) {
    need(nonEmptyString(file), 'changed_files entries must be strings');
    need(matchesAny(file, handoff.allowed_paths ?? []), `changed file outside allowed_paths: ${file}`);
    need(!matchesAny(file, handoff.forbidden_paths ?? []), `changed file matches forbidden_paths: ${file}`);
  }
};

const validateValidationEvidence = (resultObject, requireSuccess) => {
  need(isObject(resultObject.validation_evidence), 'validation_evidence is required');
  for (const name of ['unit_tests', 'lint', 'typecheck', 'build', 'self_check']) {
    validateEvidenceCheck(name, resultObject?.validation_evidence?.[name], requireSuccess);
  }
};

const validateUiCommon = (resultObject, { figmaAcquiredBy, uniUiPolicyName }) => {
  if (handoff?.task?.ui_task === true) {
    need(nonEmptyArray(resultObject.ui_scope_map), 'UI task requires non-empty ui_scope_map');
    need(isObject(resultObject.style_stack_compliance), 'UI task requires style_stack_compliance');
    need(isObject(resultObject.component_reuse_evidence), 'UI task requires component_reuse_evidence');
    need(nonEmptyArray(resultObject?.component_reuse_evidence?.searched), 'component_reuse_evidence.searched is required');

    const created = resultObject?.component_reuse_evidence?.newly_created;
    need(Array.isArray(created), 'component_reuse_evidence.newly_created must be an array');
    if (nonEmptyArray(created)) {
      need(nonEmptyString(resultObject?.component_reuse_evidence?.reason), 'new components require a non-reuse reason');
    }

    const expectedStack = lower(handoff?.project_constraints?.styling_system);
    const actualStack = lower(resultObject?.style_stack_compliance?.styling_system);
    need(actualStack === expectedStack, `styling_system mismatch: expected ${expectedStack}, got ${actualStack}`);
    need(Array.isArray(resultObject?.style_stack_compliance?.new_dependencies),
      'style_stack_compliance.new_dependencies must be an array');

    if (expectedStack.includes('tailwind')) {
      need(resultObject?.style_stack_compliance?.tailwind_used === true, 'Tailwind task requires tailwind_used=true');
      const exceptionAllowed = lower(handoff?.project_constraints?.new_scss_policy) === 'explicit_exception_only'
        && nonEmptyString(resultObject?.style_stack_compliance?.scss_exception_ref)
        && (handoff?.project_constraints?.scss_exceptions ?? []).includes(resultObject.style_stack_compliance.scss_exception_ref);
      need(resultObject?.style_stack_compliance?.new_scss_added === false || exceptionAllowed,
        'new SCSS is forbidden without a Contract-listed exception');

      const changedScss = (resultObject.changed_files ?? []).filter((file) => /\.s[ac]ss$/i.test(file));
      need(changedScss.length === 0 || exceptionAllowed, `changed SCSS files without exception: ${changedScss.join(', ')}`);
    }

    if (lower(handoff?.project_constraints?.dependency_policy) === 'no_new_dependencies') {
      need((resultObject?.style_stack_compliance?.new_dependencies ?? []).length === 0,
        'dependency_policy=no_new_dependencies but result reports new dependencies');
    }
  }

  if (nonEmptyString(handoff?.figma?.link) && usesUniUi(handoff?.project_constraints?.component_library)) {
    const mapping = resultObject.uni_ui_mapping_evidence;
    need(isObject(mapping), 'Figma + uni-ui task requires uni_ui_mapping_evidence');
    if (isObject(mapping)) {
      need(mapping.status === 'completed', 'uni_ui_mapping_evidence.status must be completed');
      const skillOk = mapping.skill === '$uni-ui-figma-component-mapper';
      const policyOk = mapping.policy === uniUiPolicyName;
      need(skillOk || policyOk,
        `uni_ui_mapping_evidence must cite skill=$uni-ui-figma-component-mapper or policy=${uniUiPolicyName}`);
      need(mapping.generated_before_first_ui_edit === true,
        'uni_ui_mapping_evidence must be generated before the first UI edit');
      need(nonEmptyArray(mapping.regions), 'uni_ui_mapping_evidence.regions is required');
      need(Array.isArray(mapping.used_components), 'uni_ui_mapping_evidence.used_components must be an array');
      need(Array.isArray(mapping.custom_regions), 'uni_ui_mapping_evidence.custom_regions must be an array');
      need(mapping.install_dependency_checked === true,
        'uni_ui_mapping_evidence.install_dependency_checked must be true');
      need(['easycom', 'manual_existing_pattern', 'not_applicable'].includes(mapping.easycom_policy),
        'uni_ui_mapping_evidence.easycom_policy must be easycom|manual_existing_pattern|not_applicable');
      for (const [index, region] of (mapping.regions ?? []).entries()) {
        need(isObject(region), `uni_ui_mapping_evidence.regions[${index}] must be an object`);
        if (!isObject(region)) {
          continue;
        }
        need(nonEmptyString(region.figma_node), `uni_ui_mapping_evidence.regions[${index}].figma_node is required`);
        need(nonEmptyString(region.visual_interaction_signal),
          `uni_ui_mapping_evidence.regions[${index}].visual_interaction_signal is required`);
        need(nonEmptyString(region.preferred_component),
          `uni_ui_mapping_evidence.regions[${index}].preferred_component is required`);
        need(['used', 'custom', 'native', 'not_applicable'].includes(region.decision),
          `uni_ui_mapping_evidence.regions[${index}].decision must be used|custom|native|not_applicable`);
        need(nonEmptyString(region.reason), `uni_ui_mapping_evidence.regions[${index}].reason is required`);
      }
      for (const [index, item] of (mapping.custom_regions ?? []).entries()) {
        need(isObject(item), `uni_ui_mapping_evidence.custom_regions[${index}] must be an object`);
        if (!isObject(item)) {
          continue;
        }
        need(nonEmptyString(item.figma_node), `uni_ui_mapping_evidence.custom_regions[${index}].figma_node is required`);
        need(nonEmptyString(item.reason), `uni_ui_mapping_evidence.custom_regions[${index}].reason is required`);
        need(nonEmptyString(item.fallback_component),
          `uni_ui_mapping_evidence.custom_regions[${index}].fallback_component is required`);
      }
    }
  }

  if (nonEmptyString(handoff?.figma?.link)) {
    const evidence = resultObject.figma_fetch_evidence;
    need(isObject(evidence), 'Figma task requires figma_fetch_evidence');
    need(evidence?.status === 'success', 'figma_fetch_evidence.status must be success');
    need(evidence?.acquired_by === figmaAcquiredBy,
      `figma_fetch_evidence.acquired_by must be ${figmaAcquiredBy}`);
    need(evidence?.acquired_before_first_ui_edit === true,
      'Figma must be acquired before the first UI edit');
    need(evidence?.source_link === handoff.figma.link, 'figma_fetch_evidence.source_link must match handoff');
    need(evidence?.node_id === handoff.figma.node_id, 'figma_fetch_evidence.node_id must match handoff');

    const calls = callsOf(evidence);
    const screenshotPolicySkip = figmaAcquiredBy === 'zcode_external_implementer'
      && evidence?.screenshot_policy_skip?.allowed === true
      && nonEmptyString(evidence?.screenshot_policy_skip?.policy_ref)
      && /AGENTS\.md.*2\.18/.test(evidence.screenshot_policy_skip.policy_ref);
    for (const tool of ['get_metadata', 'get_design_context']) {
      need(calls.includes(tool), `implementer must directly call ${tool}`);
    }
    if (!screenshotPolicySkip) {
      need(calls.includes('get_screenshot'), 'implementer must directly call get_screenshot');
    }
    need(nonEmptyArray(evidence?.nodes_read), 'figma_fetch_evidence.nodes_read is required');
    if (!screenshotPolicySkip) {
      need(nonEmptyString(evidence?.screenshot_ref), 'figma_fetch_evidence.screenshot_ref is required');
    }
    need(Array.isArray(evidence?.variables_or_assets_used), 'variables_or_assets_used must be an array');
    need(Array.isArray(evidence?.unresolved), 'figma_fetch_evidence.unresolved must be an array');
    if (resultObject.status === 'completed') {
      need(evidence?.unresolved?.length === 0, 'completed Figma implementation cannot contain unresolved design items');
    }
  }
};

if (role === 'implementer') {
  need(implementationMode === 'codex_subagent', 'role=implementer is only valid for implementation_mode=codex_subagent');
  need(isObject(result.agent_identity), 'agent_identity is required');
  need(result?.agent_identity?.agent_type === handoff?.spawn_contract?.implementer_agent_type,
    `implementer agent_identity mismatch: expected ${handoff?.spawn_contract?.implementer_agent_type}, got ${result?.agent_identity?.agent_type}`);
  need(result?.agent_identity?.dispatch_run_id === handoff?.dispatch_run_id,
    'implementer agent_identity.dispatch_run_id must match handoff');
  need(['completed', 'blocked'].includes(result.status), 'implementer status must be completed|blocked');
  need(result.status === 'completed', `implementation gate cannot continue with status=${result.status}`);
  validateChangedFiles(result.changed_files);
  need(nonEmptyString(result.implementation_summary), 'implementation_summary is required');
  need(result.project_constraints_verified === true, 'project_constraints_verified must be true');
  need(Array.isArray(result.deviations_or_blockers), 'deviations_or_blockers must be an array');

  if (result.status === 'completed') {
    need(result.deviations_or_blockers?.length === 0, 'completed result cannot contain deviations_or_blockers');
    if (handoff?.task?.code_changes_required === true) {
      need(nonEmptyArray(result.changed_files), 'completed code task requires changed_files');
    }
  } else {
    need(nonEmptyArray(result.deviations_or_blockers), 'blocked result requires deviations_or_blockers');
  }

  validateValidationEvidence(result, result.status === 'completed');
  validateUiCommon(result, {
    figmaAcquiredBy: 'implementer',
    uniUiPolicyName: 'uni-ui-figma-component-mapper-contract'
  });
}

if (role === 'external') {
  need(implementationMode === 'zcode_external', 'role=external is only valid for implementation_mode=zcode_external');
  need(result.source === 'codex_recovery_after_zcode', 'external result source must be codex_recovery_after_zcode');
  need(['completed', 'blocked'].includes(result.status), 'external status must be completed|blocked');
  need(result.status === 'completed', `external implementation gate cannot continue with status=${result.status}`);
  need(result.codex_self_implementation === false, 'codex_self_implementation must be false');
  need(result.zcode_completion_claim_treated_as_non_authoritative === true,
    'ZCode completion claim must be treated as non-authoritative');
  need(result.git_diff_recovered_by_codex === true, 'git_diff_recovered_by_codex must be true');
  need(result.allowed_forbidden_paths_checked === true, 'allowed_forbidden_paths_checked must be true');
  need(result.project_constraints_checked_by_codex === true, 'project_constraints_checked_by_codex must be true');
  need(isObject(result.zcode_send_receipt), 'zcode_send_receipt is required in external recovery result');
  if (isObject(result.zcode_send_receipt)) {
    need(result.zcode_send_receipt.status === 'sent', 'zcode_send_receipt.status must be sent');
    need(['enter', 'send_button'].includes(result.zcode_send_receipt.send_action),
      'zcode_send_receipt.send_action must be enter|send_button for completed recovery');
    need(result.zcode_send_receipt.clipboard_paste_used === true,
      'zcode_send_receipt.clipboard_paste_used must be true');
    need(result.zcode_send_receipt.prompt_integrity_verified === true,
      'zcode_send_receipt.prompt_integrity_verified must be true');
    const cu = result.zcode_send_receipt.computer_use ?? {};
    const requiredActions = [
      'verify_zcode_current_session', 'focus_chat_input', 'set_clipboard_to_prompt',
      'paste_clipboard', 'verify_prompt_sentinel_in_input', 'send_prompt'
    ];
    need(isObject(cu), 'zcode_send_receipt.computer_use is required');
    need(cu.tool_invoked === true, 'zcode_send_receipt.computer_use.tool_invoked must be true');
    validateComputerUseToolEvidence(cu);
    need(Array.isArray(cu.actions), 'zcode_send_receipt.computer_use.actions must be an array');
    if (Array.isArray(cu.actions)) {
      for (const action of requiredActions) {
        need(cu.actions.includes(action), `zcode_send_receipt.computer_use.actions must include ${action}`);
      }
    }
    need(cu.clipboard_write_confirmed === true,
      'zcode_send_receipt.computer_use.clipboard_write_confirmed must be true');
    need(cu.shell_only_ui_automation_used === false,
      'zcode_send_receipt.computer_use.shell_only_ui_automation_used must be false');
    need(cu.manual_typing_used === false,
      'zcode_send_receipt.computer_use.manual_typing_used must be false');
  }
  validateChangedFiles(result.changed_files);
  need(nonEmptyArray(result.changed_files), 'completed external code task requires changed_files');
  need(nonEmptyString(result.implementation_summary), 'implementation_summary is required');
  need(Array.isArray(result.deviations_or_blockers), 'deviations_or_blockers must be an array');
  need(result.deviations_or_blockers?.length === 0, 'completed external result cannot contain deviations_or_blockers');
  need(isObject(result.zcode_recovery_evidence), 'zcode_recovery_evidence is required');
  if (isObject(result.zcode_recovery_evidence)) {
    need(result.zcode_recovery_evidence.git_status_read === true, 'zcode_recovery_evidence.git_status_read must be true');
    need(result.zcode_recovery_evidence.git_diff_read === true, 'zcode_recovery_evidence.git_diff_read must be true');
    need(result.zcode_recovery_evidence.forbidden_paths_clean === true,
      'zcode_recovery_evidence.forbidden_paths_clean must be true');
    need(result.zcode_recovery_evidence.no_unapproved_dependencies === true,
      'zcode_recovery_evidence.no_unapproved_dependencies must be true');
  }

  validateValidationEvidence(result, result.status === 'completed');
  validateUiCommon(result, {
    figmaAcquiredBy: 'zcode_external_implementer',
    uniUiPolicyName: 'uni-ui-figma-component-mapper-contract'
  });
}

if (role === 'qa') {
  need(isObject(result.agent_identity), 'agent_identity is required');
  need(result?.agent_identity?.agent_type === handoff?.spawn_contract?.qa_agent_type,
    `QA agent_identity mismatch: expected ${handoff?.spawn_contract?.qa_agent_type}, got ${result?.agent_identity?.agent_type}`);
  need(result?.agent_identity?.dispatch_run_id === handoff?.dispatch_run_id,
    'QA agent_identity.dispatch_run_id must match handoff');
  need(['passed', 'failed', 'blocked'].includes(result.status), 'QA status must be passed|failed|blocked');
  need(result.status === 'passed', `QA gate cannot complete with status=${result.status}`);
  need(result.unit_tests_run === false, 'QA must report unit_tests_run=false');
  need(nonEmptyArray(result.coverage), 'QA coverage is required');
  need(nonEmptyArray(result.checks_and_evidence), 'QA checks_and_evidence is required');
  need(Array.isArray(result.failures), 'failures must be an array');
  need(Array.isArray(result.not_verified), 'not_verified must be an array');

  if (result.status === 'passed') {
    need(result.failures?.length === 0, 'passed QA cannot contain failures');
    need(result.not_verified?.length === 0, 'passed QA cannot contain not_verified');
  }

  if (nonEmptyString(handoff?.figma?.link)) {
    const evidence = result.figma_baseline_evidence;
    need(isObject(evidence), 'Figma QA requires figma_baseline_evidence');
    need(evidence?.status === 'ready', 'figma_baseline_evidence.status must be ready');
    need(evidence?.acquired_by === 'qa_reviewer', 'figma_baseline_evidence.acquired_by must be qa_reviewer');
    need(evidence?.independent_read === true, 'QA must independently read Figma');
    need(evidence?.source_link === handoff.figma.link, 'QA source_link must match handoff');
    need(evidence?.node_id === handoff.figma.node_id, 'QA node_id must match handoff');

    const calls = callsOf(evidence);
    for (const tool of ['get_metadata', 'get_screenshot']) {
      need(calls.includes(tool), `QA must independently call ${tool}`);
    }
    need(nonEmptyString(evidence?.reference_screenshot_ref), 'QA reference_screenshot_ref is required');
    need(nonEmptyString(evidence?.actual_runtime_screenshot_ref), 'QA actual_runtime_screenshot_ref is required');
    need(nonEmptyArray(evidence?.states_checked), 'QA states_checked is required');
    need(Array.isArray(evidence?.differences), 'QA differences must be an array');
    need(evidence?.result === 'passed', 'figma_baseline_evidence.result must be passed');

    const unapproved = (evidence?.differences ?? []).filter((difference) =>
      typeof difference === 'string' || difference?.allowed !== true || !nonEmptyString(difference?.approval_ref));
    need(unapproved.length === 0, 'QA has unapproved Figma differences');
  }
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', role, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', role, gate: 'result_contract', implementation_mode: implementationMode }, null, 2));
