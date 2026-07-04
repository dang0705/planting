#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: validate-handoff.mjs <handoff.json>');
  process.exit(2);
}

let raw;
let data;
try {
  raw = fs.readFileSync(file, 'utf8');
  data = JSON.parse(raw);
} catch (error) {
  console.error(JSON.stringify({ status: 'invalid_json', error: error.message }, null, 2));
  process.exit(2);
}

const errors = [];
const need = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const stringArray = (value, { min = 0, max = Infinity } = {}) =>
  Array.isArray(value) && value.length >= min && value.length <= max && value.every(nonEmptyString);
const lower = (value) => String(value ?? '').trim().toLowerCase();
const usesUniUi = (value) => /uni[-_ ]?ui|uniui/.test(lower(value));
const unknownKeys = (object, allowed) => isObject(object)
  ? Object.keys(object).filter((key) => !allowed.includes(key))
  : [];
const includesAll = (array, items) => items.every((item) => array?.includes(item));

const risk = data?.task?.risk;
const mode = data.implementation_mode ?? 'codex_subagent';
const dispatchTier = data.dispatch_tier;
const maxContractChars = risk === 'high' ? 24000 : 14000;
need(raw.length <= maxContractChars, `handoff exceeds character budget: ${raw.length}/${maxContractChars}`);

need(nonEmptyString(data.dispatch_run_id), 'dispatch_run_id is required');
need(['codex_subagent', 'zcode_external'].includes(mode), 'implementation_mode must be codex_subagent|zcode_external');
if (dispatchTier !== undefined) {
  need(['standard_task', 'deep_contract', 'external_zcode', 'qa_only', 'docs_only'].includes(dispatchTier),
    'dispatch_tier must be standard_task|deep_contract|external_zcode|qa_only|docs_only when a handoff is generated');
}
if (mode === 'zcode_external') {
  need(dispatchTier === 'external_zcode' || dispatchTier === undefined, 'zcode_external should use dispatch_tier=external_zcode');
}
need(isObject(data.task), 'task object is required');
need(nonEmptyString(data?.task?.objective), 'task.objective is required');
need(typeof data?.task?.code_changes_required === 'boolean', 'task.code_changes_required must be boolean');
need(typeof data?.task?.ui_task === 'boolean', 'task.ui_task must be boolean');
need(typeof data?.task?.qa_required === 'boolean', 'task.qa_required must be boolean');
need(['local', 'standard', 'high'].includes(risk), 'task.risk must be local|standard|high');
need(stringArray(data.acceptance, { min: 1, max: 12 }), 'acceptance must contain 1-12 non-empty strings');

const codeChanges = data?.task?.code_changes_required === true;
const ui = data?.task?.ui_task === true;
const qaRequired = data?.task?.qa_required === true;
const pc = data.project_constraints ?? {};
const spawn = data.spawn_contract ?? {};
const zcode = data.zcode_contract ?? {};

if (mode === 'zcode_external') {
  need(codeChanges, 'zcode_external requires code_changes_required=true');
  need(data.target_role === 'zcode_external', 'zcode_external requires target_role=zcode_external');
  need(isObject(zcode), 'zcode_external requires zcode_contract');
  const zcodeUnknown = unknownKeys(zcode, [
    'external_implementer', 'application', 'target_session', 'prompt_transport',
    'prompt_sentinel_required', 'prompt_integrity_check_required', 'input_box_check_required',
    'send_receipt_required', 'send_action_required', 'allowed_send_actions',
    'completion_claim_not_authoritative', 'codex_self_implementation_forbidden',
    'generic_fallback_forbidden', 'recovery_required', 'prompt_max_chars',
    'prompt_sha256', 'required_prompt_sections',
    'handoff_manual_required', 'handoff_completion_status_source',
    'computer_use_required', 'actual_tool_invocation_required', 'allowed_tool_targets', 'minimum_tool_event_count',
    'computer_use_tool_invocation_required', 'computer_use_action_trace_required', 'clipboard_write_via_computer_use_required',
    'manual_typing_forbidden', 'shell_only_ui_automation_forbidden',
    'required_computer_use_actions', 'post_send_computer_use_policy'
  ]);
  need(zcodeUnknown.length === 0, `zcode_contract contains unknown fields: ${zcodeUnknown.join(', ')}`);
  need(zcode.external_implementer === 'zcode_glm', 'zcode_contract.external_implementer must be zcode_glm');
  need(zcode.application === 'ZCode', 'zcode_contract.application must be ZCode');
  need(zcode.target_session === 'current_open_chat', 'zcode_contract.target_session must be current_open_chat');
  need(zcode.prompt_transport === 'clipboard_paste', 'zcode_contract.prompt_transport must be clipboard_paste');
  need(zcode.prompt_sentinel_required === true, 'zcode_contract.prompt_sentinel_required must be true');
  need(zcode.prompt_integrity_check_required === true, 'zcode_contract.prompt_integrity_check_required must be true');
  need(zcode.input_box_check_required === true, 'zcode_contract.input_box_check_required must be true');
  need(zcode.send_receipt_required === true, 'zcode_contract.send_receipt_required must be true');
  need(zcode.send_action_required === true, 'zcode_contract.send_action_required must be true');
  need(Array.isArray(zcode.allowed_send_actions), 'zcode_contract.allowed_send_actions must be an array');
  need(includesAll(zcode.allowed_send_actions, ['enter', 'send_button', 'blocked']),
    'zcode_contract.allowed_send_actions must include enter, send_button, blocked');
  need(zcode.completion_claim_not_authoritative === true,
    'zcode_contract.completion_claim_not_authoritative must be true');
  need(zcode.codex_self_implementation_forbidden === true,
    'zcode_contract.codex_self_implementation_forbidden must be true');
  need(zcode.generic_fallback_forbidden === true,
    'zcode_contract.generic_fallback_forbidden must be true');
  need(zcode.recovery_required === true, 'zcode_contract.recovery_required must be true');
  need(zcode.handoff_manual_required === true, 'zcode_contract.handoff_manual_required must be true');
  need(zcode.handoff_completion_status_source === 'handoff_manual',
    'zcode_contract.handoff_completion_status_source must be handoff_manual');
  need(zcode.computer_use_required === true, 'zcode_contract.computer_use_required must be true');
  need(zcode.actual_tool_invocation_required === true, 'zcode_contract.actual_tool_invocation_required must be true');
  need(Array.isArray(zcode.allowed_tool_targets), 'zcode_contract.allowed_tool_targets must be an array');
  need(includesAll(zcode.allowed_tool_targets, ['@ZCode', '@Computer']), 'zcode_contract.allowed_tool_targets must include @ZCode and @Computer');
  need(Number.isInteger(zcode.minimum_tool_event_count) && zcode.minimum_tool_event_count >= 5, 'zcode_contract.minimum_tool_event_count must be >= 5');
  need(zcode.computer_use_tool_invocation_required === true,
    'zcode_contract.computer_use_tool_invocation_required must be true');
  need(zcode.computer_use_action_trace_required === true,
    'zcode_contract.computer_use_action_trace_required must be true');
  need(zcode.clipboard_write_via_computer_use_required === true,
    'zcode_contract.clipboard_write_via_computer_use_required must be true');
  need(zcode.manual_typing_forbidden === true,
    'zcode_contract.manual_typing_forbidden must be true');
  need(zcode.shell_only_ui_automation_forbidden === true,
    'zcode_contract.shell_only_ui_automation_forbidden must be true');
  need(stringArray(zcode.required_computer_use_actions, { min: 6, max: 8 }),
    'zcode_contract.required_computer_use_actions must contain required computer-use actions');
  const computerUseActions = [
    'verify_zcode_current_session', 'focus_chat_input', 'set_clipboard_to_prompt',
    'paste_clipboard', 'verify_prompt_sentinel_in_input', 'send_prompt'
  ];
  for (const action of computerUseActions) {
    need(zcode.required_computer_use_actions?.includes(action),
      `zcode_contract.required_computer_use_actions must include ${action}`);
  }
  const postSendPolicy = zcode.post_send_computer_use_policy ?? {};
  const postSendPolicyUnknown = unknownKeys(postSendPolicy, [
    'disconnect_after_send_confirmed', 'first_30m_probe_interval_minutes',
    'first_30m_allowed_probes', 'ui_probe_after_30m_min_interval_minutes',
    'continuous_ui_monitoring_forbidden'
  ]);
  need(isObject(postSendPolicy), 'zcode_contract.post_send_computer_use_policy is required');
  need(postSendPolicyUnknown.length === 0,
    `zcode_contract.post_send_computer_use_policy contains unknown fields: ${postSendPolicyUnknown.join(', ')}`);
  need(postSendPolicy.disconnect_after_send_confirmed === true,
    'zcode_contract.post_send_computer_use_policy.disconnect_after_send_confirmed must be true');
  need(postSendPolicy.first_30m_probe_interval_minutes === 5,
    'zcode_contract.post_send_computer_use_policy.first_30m_probe_interval_minutes must be 5');
  need(Array.isArray(postSendPolicy.first_30m_allowed_probes),
    'zcode_contract.post_send_computer_use_policy.first_30m_allowed_probes must be an array');
  for (const probe of [
    'handoff_manual', 'scoped_git_status', 'scoped_git_diff_name_only', 'scoped_git_diff_stat'
  ]) {
    need(postSendPolicy.first_30m_allowed_probes?.includes(probe),
      `zcode_contract.post_send_computer_use_policy.first_30m_allowed_probes must include ${probe}`);
  }
  need(postSendPolicy.ui_probe_after_30m_min_interval_minutes === 10,
    'zcode_contract.post_send_computer_use_policy.ui_probe_after_30m_min_interval_minutes must be 10');
  need(postSendPolicy.continuous_ui_monitoring_forbidden === true,
    'zcode_contract.post_send_computer_use_policy.continuous_ui_monitoring_forbidden must be true');
  need(stringArray(zcode.required_prompt_sections, { min: 5, max: 16 }),
    'zcode_contract.required_prompt_sections must contain 5-16 section ids');

  const baseSections = [
    'implementation_contract', 'allowed_forbidden_paths', 'project_constraints',
    'handoff_manual_contract', 'validation_commands', 'result_json_contract'
  ];
  for (const section of baseSections) {
    need(zcode.required_prompt_sections?.includes(section),
      `zcode_contract.required_prompt_sections must include ${section}`);
  }

  if (isObject(spawn) && Object.keys(spawn).length > 0) {
    const spawnUnknown = unknownKeys(spawn, [
      'qa_agent_type', 'context_mode', 'generic_fallback_forbidden', 'identity_receipt_required'
    ]);
    need(spawnUnknown.length === 0, `zcode_external spawn_contract contains unknown fields: ${spawnUnknown.join(', ')}`);
    need(spawn.implementer_agent_type === undefined,
      'zcode_external must not set spawn_contract.implementer_agent_type');
  }

  const handoffManual = data.handoff_manual ?? {};
  const manualUnknown = unknownKeys(handoffManual, [
    'required', 'path', 'status_field', 'working_status', 'terminal_statuses',
    'main_completion_probe'
  ]);
  need(isObject(handoffManual), 'zcode_external requires handoff_manual');
  need(manualUnknown.length === 0, `handoff_manual contains unknown fields: ${manualUnknown.join(', ')}`);
  need(handoffManual.required === true, 'handoff_manual.required must be true');
  need(nonEmptyString(handoffManual.path), 'handoff_manual.path is required');
  if (nonEmptyString(handoffManual.path)) {
    need(handoffManual.path.startsWith('.tmp/dispatch-task/'),
      'handoff_manual.path must be under .tmp/dispatch-task/');
    need(handoffManual.path.includes(data.dispatch_run_id),
      'handoff_manual.path must include dispatch_run_id');
    need(handoffManual.path.endsWith('-handoff-manual.json'),
      'handoff_manual.path must end with -handoff-manual.json');
  }
  need(handoffManual.status_field === 'status', 'handoff_manual.status_field must be status');
  need(handoffManual.working_status === 'working', 'handoff_manual.working_status must be working');
  need(Array.isArray(handoffManual.terminal_statuses),
    'handoff_manual.terminal_statuses must be an array');
  need(includesAll(handoffManual.terminal_statuses, ['completed', 'blocked']),
    'handoff_manual.terminal_statuses must include completed and blocked');
  need(handoffManual.main_completion_probe === 'read_json_before_ui',
    'handoff_manual.main_completion_probe must be read_json_before_ui');
} else {
  if (codeChanges) {
    need(['implementer_fast', 'implementer_deep'].includes(data.target_role),
      'codex_subagent code changes require implementer_fast|implementer_deep');
    need(isObject(spawn), 'spawn_contract object is required');
    const spawnUnknown = unknownKeys(spawn, [
      'implementer_agent_type', 'qa_agent_type', 'context_mode',
      'generic_fallback_forbidden', 'identity_receipt_required'
    ]);
    need(spawnUnknown.length === 0, `spawn_contract contains unknown fields: ${spawnUnknown.join(', ')}`);
    need(spawn.implementer_agent_type === data.target_role,
      'spawn_contract.implementer_agent_type must exactly equal target_role');
  }
}

if (codeChanges) {
  need(stringArray(data.allowed_paths, { min: 1, max: 30 }), 'allowed_paths must contain 1-30 paths');
  need(stringArray(data.forbidden_paths, { min: 0, max: 30 }), 'forbidden_paths must be an array of at most 30 paths');
  need(isObject(pc), 'project_constraints object is required');
  need(stringArray(pc.rule_refs, { min: 1, max: 10 }), 'project_constraints.rule_refs must contain 1-10 scoped references');
  need(nonEmptyString(pc.dependency_policy), 'project_constraints.dependency_policy is required');
  need(Array.isArray(pc.test_commands), 'project_constraints.test_commands must be an array');
  need(isObject(data.validation), 'validation object is required');

  if (mode === 'codex_subagent') {
    need(stringArray(data?.validation?.implementer, { min: 1, max: 12 }),
      'validation.implementer must contain 1-12 checks');
  } else {
    need(stringArray(data?.validation?.external, { min: 1, max: 12 }),
      'validation.external must contain 1-12 checks');
  }

  if (qaRequired || (isObject(spawn) && Object.keys(spawn).length > 0)) {
    need(spawn.context_mode === 'isolated', 'spawn_contract.context_mode must be isolated');
    need(spawn.generic_fallback_forbidden === true,
      'spawn_contract.generic_fallback_forbidden must be true');
    need(spawn.identity_receipt_required === true,
      'spawn_contract.identity_receipt_required must be true');
    if (qaRequired) {
      need(spawn.qa_agent_type === 'qa_reviewer',
        'qa_required=true requires spawn_contract.qa_agent_type=qa_reviewer');
    }
  }

  if (!qaRequired && mode === 'codex_subagent') {
    need(spawn.qa_agent_type === null || spawn.qa_agent_type === undefined,
      'qa_required=false requires spawn_contract.qa_agent_type=null or omitted');
  }
}

if (ui) {
  need(codeChanges, 'task.ui_task=true requires code_changes_required=true');
  need(nonEmptyString(pc.framework), 'UI task requires project_constraints.framework');
  need(nonEmptyString(pc.styling_system), 'UI task requires project_constraints.styling_system');
  need(['forbidden', 'explicit_exception_only'].includes(lower(pc.new_scss_policy)),
    'UI task requires new_scss_policy=forbidden|explicit_exception_only');
  need(Array.isArray(pc.scss_exceptions), 'UI task requires project_constraints.scss_exceptions array');
  need(nonEmptyString(pc.component_library), 'UI task requires project_constraints.component_library');

  if (lower(pc.styling_system).includes('tailwind')) {
    need(['forbidden', 'explicit_exception_only'].includes(lower(pc.new_scss_policy)),
      'Tailwind task must forbid new SCSS or require explicit exceptions');
  }

  if (mode === 'codex_subagent') {
    const skills = data?.required_skills?.implementer;
    need(stringArray(skills, { min: 1, max: 8 }), 'UI codex_subagent task requires required_skills.implementer');
    need(skills?.includes('$implementer-ui-execution-policy'),
      'UI codex_subagent task requires $implementer-ui-execution-policy');
  } else {
    need(zcode.required_prompt_sections?.includes('ui_scope_contract'),
      'UI zcode_external task requires ui_scope_contract prompt section');
    need(zcode.required_prompt_sections?.includes('style_stack_contract'),
      'UI zcode_external task requires style_stack_contract prompt section');
  }
}

const lock = data.decision_lock ?? {};
if (codeChanges) {
  need(isObject(lock), 'decision_lock object is required');
  need(['standard', 'strict'].includes(lock.level), 'decision_lock.level must be standard|strict');
  need(Array.isArray(lock.architecture_invariants), 'decision_lock.architecture_invariants must be an array');
  need(Array.isArray(lock.local_decisions_allowed), 'decision_lock.local_decisions_allowed must be an array');
}
if (risk === 'high') {
  if (mode === 'codex_subagent') {
    need(data.target_role === 'implementer_deep', 'high risk codex_subagent requires implementer_deep');
  }
  need(lock.level === 'strict', 'high risk requires decision_lock.level=strict');
  need(stringArray(lock.architecture_invariants, { min: 1, max: 20 }), 'strict lock requires architecture_invariants');
}

const figma = data.figma;
if (isObject(figma) && nonEmptyString(figma.link)) {
  const allowedFigmaKeys = [
    'link', 'node_id', 'lite_status', 'main_access', 'main_tools_used', 'lite_receipt',
    'implementer_fetch_required', 'qa_baseline_fetch_required'
  ];
  const figmaUnknown = unknownKeys(figma, allowedFigmaKeys);
  need(figmaUnknown.length === 0, `figma contains non-Lite fields: ${figmaUnknown.join(', ')}`);
  need(JSON.stringify(figma).length <= 2500, 'figma block exceeds 2,500-character Lite budget');

  need(ui, 'figma.link requires task.ui_task=true');
  need(nonEmptyString(figma.node_id), 'figma.node_id is required');
  need(['link_only', 'metadata_ok', 'metadata_unavailable'].includes(figma.lite_status),
    'figma.lite_status must be link_only|metadata_ok|metadata_unavailable');
  need(figma.main_access === 'lite_only', 'figma.main_access must be lite_only');
  need(figma.implementer_fetch_required === true, 'figma.implementer_fetch_required must be true');
  need(figma.qa_baseline_fetch_required === true, 'figma.qa_baseline_fetch_required must be true');
  need(data?.task?.qa_required === true, 'Figma task requires task.qa_required=true');

  const tools = figma.main_tools_used;
  need(Array.isArray(tools) && tools.length <= 1, 'figma.main_tools_used must contain at most one tool');
  if (Array.isArray(tools)) {
    need(tools.every((tool) => tool === 'get_metadata'), 'main may only use get_metadata for Figma Lite');
  }

  if (figma.lite_status === 'link_only') {
    need(Array.isArray(tools) && tools.length === 0, 'link_only must not claim a Figma MCP call');
    need(figma.lite_receipt === undefined, 'link_only must not include lite_receipt');
  }
  if (figma.lite_status === 'metadata_ok') {
    need(Array.isArray(tools) && tools[0] === 'get_metadata', 'metadata_ok requires one get_metadata call');
    need(isObject(figma.lite_receipt), 'metadata_ok requires lite_receipt');
  }

  if (figma.lite_receipt !== undefined) {
    const receipt = figma.lite_receipt;
    const allowedReceiptKeys = [
      'file_key', 'root_node_id', 'root_name', 'root_type', 'root_size',
      'top_level_sections', 'metadata_status'
    ];
    need(isObject(receipt), 'figma.lite_receipt must be an object');
    const receiptUnknown = unknownKeys(receipt, allowedReceiptKeys);
    need(receiptUnknown.length === 0, `lite_receipt contains forbidden detail fields: ${receiptUnknown.join(', ')}`);
    need(JSON.stringify(receipt).length <= 1500, 'lite_receipt exceeds 1,500-character budget');
    need(Array.isArray(receipt.top_level_sections), 'lite_receipt.top_level_sections must be an array');
    if (Array.isArray(receipt.top_level_sections)) {
      need(receipt.top_level_sections.length <= 8, 'lite_receipt may contain at most 8 top-level sections');
      for (const [index, section] of receipt.top_level_sections.entries()) {
        need(isObject(section), `top_level_sections[${index}] must be an object`);
        const sectionUnknown = unknownKeys(section, ['node_id', 'name', 'type']);
        need(sectionUnknown.length === 0, `top_level_sections[${index}] contains forbidden fields: ${sectionUnknown.join(', ')}`);
      }
    }
  }

  const qaSkills = data?.required_skills?.qa ?? [];
  need(qaSkills.includes('$qa-ui-visual-baseline-policy'),
    'Figma task requires $qa-ui-visual-baseline-policy');

  if (mode === 'codex_subagent') {
    const implementerSkills = data?.required_skills?.implementer ?? [];
    need(implementerSkills.includes('$implementer-ui-execution-policy'),
      'Figma codex_subagent task requires $implementer-ui-execution-policy');
    
    if (usesUniUi(pc.component_library)) {
      need(implementerSkills.includes('$uni-ui-figma-component-mapper'),
        'Figma + uni-ui codex_subagent task requires $uni-ui-figma-component-mapper');
    }
  } else {
    need(zcode.required_prompt_sections?.includes('figma_direct_fetch'),
      'Figma zcode_external task requires figma_direct_fetch prompt section');
    need(zcode.required_prompt_sections?.includes('figma_blocker_policy'),
      'Figma zcode_external task requires figma_blocker_policy prompt section');
    if (usesUniUi(pc.component_library)) {
      need(zcode.required_prompt_sections?.includes('uni_ui_mapping_contract'),
        'Figma + uni-ui zcode_external task requires uni_ui_mapping_contract prompt section');
    }
  }

  const output = data.output_evidence_required ?? [];
  need(stringArray(output, { min: 4, max: 14 }), 'Figma task requires output_evidence_required');
  const requiredOutput = [
    'validation_evidence',
    'figma_fetch_evidence',
    'style_stack_compliance',
    'component_reuse_evidence'
  ];
  if (usesUniUi(pc.component_library)) {
    requiredOutput.push('uni_ui_mapping_evidence');
  }
  for (const key of requiredOutput) {
    need(output.includes(key), `output_evidence_required must include ${key}`);
  }
}

if (mode === 'zcode_external') {
  const output = data.output_evidence_required ?? [];
  need(stringArray(output, { min: 1, max: 14 }), 'zcode_external requires output_evidence_required');
  for (const key of ['zcode_send_receipt', 'zcode_handoff_manual', 'zcode_recovery_evidence', 'validation_evidence']) {
    need(output.includes(key), `zcode_external output_evidence_required must include ${key}`);
  }
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'handoff_contract', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', gate: 'handoff_contract', implementation_mode: mode, dispatch_tier: dispatchTier ?? null, chars: raw.length }, null, 2));
