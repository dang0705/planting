#!/usr/bin/env node
import fs from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: validate-handoff.mjs <handoff.json>')
  process.exit(2)
}

let raw
let data
try {
  raw = fs.readFileSync(file, 'utf8')
  data = JSON.parse(raw)
} catch (error) {
  console.error(JSON.stringify({ status: 'invalid_json', error: error.message }, null, 2))
  process.exit(2)
}

const errors = []
const need = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0
const stringArray = (value, { min = 0, max = Infinity } = {}) =>
  Array.isArray(value) && value.length >= min && value.length <= max && value.every(nonEmptyString)
const lower = value =>
  String(value ?? '')
    .trim()
    .toLowerCase()
const usesUniUi = value => /uni[-_ ]?ui|uniui/.test(lower(value))
const includesAll = (array, items) => items.every(item => array?.includes(item))
const unknownKeys = (object, allowed) =>
  isObject(object) ? Object.keys(object).filter(key => !allowed.includes(key)) : []

const mode = data.implementation_mode ?? 'codex_subagent'
const tier = data.dispatch_tier
const externalMode = ['external_implementer', 'zcode_external'].includes(mode)
const externalTier = ['external_implementer', 'zcode_external'].includes(tier)
const task = data.task ?? {}
const codeChanges = task.code_changes_required === true
const ui = task.ui_task === true
const qaRequired = task.qa_required === true
const risk = task.risk
const maxContractChars = risk === 'high' ? 24000 : 14000
need(
  raw.length <= maxContractChars,
  `handoff exceeds character budget: ${raw.length}/${maxContractChars}`
)

need(nonEmptyString(data.dispatch_run_id), 'dispatch_run_id is required')
need(
  ['codex_subagent', 'external_implementer', 'zcode_external'].includes(mode),
  'implementation_mode must be codex_subagent|external_implementer|zcode_external'
)
need(
  ['simple_patch', 'standard_task', 'deep_contract', 'external_implementer', 'zcode_external'].includes(tier),
  'dispatch_tier must be simple_patch|standard_task|deep_contract|external_implementer|zcode_external'
)
need(isObject(task), 'task object is required')
need(nonEmptyString(task.objective), 'task.objective is required')
need(typeof task.code_changes_required === 'boolean', 'task.code_changes_required must be boolean')
need(typeof task.ui_task === 'boolean', 'task.ui_task must be boolean')
need(typeof task.qa_required === 'boolean', 'task.qa_required must be boolean')
need(['local', 'standard', 'high'].includes(risk), 'task.risk must be local|standard|high')
need(
  stringArray(data.acceptance, { min: 1, max: 12 }),
  'acceptance must contain 1-12 non-empty strings'
)
need(
  stringArray(data.allowed_paths, { min: 1, max: 30 }),
  'allowed_paths must contain 1-30 non-empty strings'
)
need(
  stringArray(data.forbidden_paths, { min: 0, max: 50 }),
  'forbidden_paths must be an array of non-empty strings'
)
need(isObject(data.decision_lock), 'decision_lock is required')
need(
  ['standard', 'strict'].includes(data?.decision_lock?.level),
  'decision_lock.level must be standard|strict'
)

if (codeChanges) {
  need(
    nonEmptyString(data?.validation?.worktree_baseline_path),
    'code changes require validation.worktree_baseline_path'
  )
}

const pc = data.project_constraints ?? {}
const external = data.external_contract ?? data.zcode_contract ?? {}
const zcode = data.zcode_contract ?? (external.provider === 'zcode' ? external : {})
need(isObject(pc), 'project_constraints is required')
need(
  stringArray(pc.rule_refs, { min: 1, max: 12 }),
  'project_constraints.rule_refs must contain 1-12 refs'
)
need(nonEmptyString(pc.dependency_policy), 'project_constraints.dependency_policy is required')
need(Array.isArray(pc.test_commands), 'project_constraints.test_commands must be an array')

if (ui) {
  need(tier !== 'simple_patch', 'UI/Figma tasks must not use simple_patch')
  need(nonEmptyString(pc.framework), 'UI task requires project_constraints.framework')
  need(nonEmptyString(pc.styling_system), 'UI task requires project_constraints.styling_system')
  need(nonEmptyString(pc.new_scss_policy), 'UI task requires project_constraints.new_scss_policy')
  need(
    Array.isArray(pc.scss_exceptions),
    'UI task requires project_constraints.scss_exceptions array'
  )
  need(
    nonEmptyString(pc.component_library),
    'UI task requires project_constraints.component_library'
  )
  if (lower(pc.styling_system).includes('tailwind')) {
    need(
      ['forbidden', 'explicit_exception_only'].includes(lower(pc.new_scss_policy)),
      'Tailwind UI task requires new_scss_policy=forbidden|explicit_exception_only'
    )
  }
  need(qaRequired === true, 'UI tasks require task.qa_required=true')
}
if (risk === 'high') {
  need(qaRequired === true, 'high-risk tasks require task.qa_required=true')
}

if (tier === 'simple_patch') {
  need(mode === 'codex_subagent', 'simple_patch must use codex_subagent')
  need(!ui, 'simple_patch cannot be a UI task')
  need(risk === 'local', 'simple_patch requires task.risk=local')
}
if (tier === 'deep_contract') {
  need(data?.decision_lock?.level === 'strict', 'deep_contract requires decision_lock.level=strict')
}
if (externalTier) {
  need(
    externalMode,
    'external dispatch_tier requires implementation_mode=external_implementer'
  )
}
if (externalMode) {
  need(externalTier, 'external_implementer mode requires dispatch_tier=external_implementer')
  need(codeChanges, 'external_implementer requires code_changes_required=true')
  need(
    ['external_implementer', 'zcode_external'].includes(data.target_role),
    'external_implementer requires target_role=external_implementer'
  )
  need(isObject(data.external_contract) || isObject(data.zcode_contract), 'external_implementer requires external_contract')
  need(isObject(data.handoff_manual), 'external_implementer requires handoff_manual')
  const externalUnknown = unknownKeys(external, [
    'provider',
    'external_implementer',
    'application',
    'adapter',
    'target_session',
    'prompt_transport',
    'prompt_sentinel_required',
    'prompt_integrity_check_required',
    'input_box_check_required',
    'send_receipt_required',
    'send_action_required',
    'allowed_send_actions',
    'completion_claim_not_authoritative',
    'codex_self_implementation_forbidden',
    'generic_fallback_forbidden',
    'recovery_required',
    'prompt_max_chars',
    'prompt_sha256',
    'required_prompt_sections',
    'handoff_manual_required',
    'handoff_completion_status_source',
    'computer_use_required',
    'actual_tool_invocation_required',
    'allowed_tool_targets',
    'minimum_tool_event_count',
    'computer_use_tool_invocation_required',
    'computer_use_action_trace_required',
    'clipboard_write_via_computer_use_required',
    'manual_typing_forbidden',
    'shell_only_ui_automation_forbidden',
    'required_computer_use_actions',
    'post_send_computer_use_policy'
  ])
  need(
    externalUnknown.length === 0,
    `external_contract contains unknown fields: ${externalUnknown.join(', ')}`
  )
  const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
  need(
    ['zcode', 'trae', 'chrome_cloud_agent', 'other'].includes(provider),
    'external_contract.provider must be zcode|trae|chrome_cloud_agent|other'
  )
  need(nonEmptyString(external.target_session), 'external_contract.target_session is required')
  need(nonEmptyString(external.prompt_transport), 'external_contract.prompt_transport is required')
  need(external.send_receipt_required === true, 'external_contract.send_receipt_required must be true')
  need(
    external.completion_claim_not_authoritative === true,
    'external_contract.completion_claim_not_authoritative must be true'
  )
  need(
    external.codex_self_implementation_forbidden === true,
    'external_contract.codex_self_implementation_forbidden must be true'
  )
  need(
    external.generic_fallback_forbidden === true,
    'external_contract.generic_fallback_forbidden must be true'
  )
  need(external.recovery_required === true, 'external_contract.recovery_required must be true')
  need(
    external.handoff_manual_required === true,
    'external_contract.handoff_manual_required must be true'
  )
  need(
    external.handoff_completion_status_source === 'handoff_manual',
    'external_contract.handoff_completion_status_source must be handoff_manual'
  )
  const zcodeUnknown = unknownKeys(zcode, [
    'provider',
    'external_implementer',
    'application',
    'adapter',
    'target_session',
    'prompt_transport',
    'prompt_sentinel_required',
    'prompt_integrity_check_required',
    'input_box_check_required',
    'send_receipt_required',
    'send_action_required',
    'allowed_send_actions',
    'completion_claim_not_authoritative',
    'codex_self_implementation_forbidden',
    'generic_fallback_forbidden',
    'recovery_required',
    'prompt_max_chars',
    'prompt_sha256',
    'required_prompt_sections',
    'handoff_manual_required',
    'handoff_completion_status_source',
    'computer_use_required',
    'actual_tool_invocation_required',
    'allowed_tool_targets',
    'minimum_tool_event_count',
    'computer_use_tool_invocation_required',
    'computer_use_action_trace_required',
    'clipboard_write_via_computer_use_required',
    'manual_typing_forbidden',
    'shell_only_ui_automation_forbidden',
    'required_computer_use_actions',
    'post_send_computer_use_policy'
  ])
  if (provider === 'zcode') {
    need(
      zcodeUnknown.length === 0,
      `zcode_contract contains unknown fields: ${zcodeUnknown.join(', ')}`
    )
    need(
      zcode.external_implementer === 'zcode_glm' || zcode.provider === 'zcode',
      'zcode_contract.external_implementer must be zcode_glm or provider must be zcode'
    )
    need(!zcode.application || zcode.application === 'ZCode', 'zcode_contract.application must be ZCode')
    need(
      zcode.target_session === 'current_open_chat',
      'zcode_contract.target_session must be current_open_chat'
    )
    need(
      zcode.prompt_transport === 'clipboard_paste',
      'zcode_contract.prompt_transport must be clipboard_paste'
    )
    need(
      zcode.prompt_sentinel_required === true,
      'zcode_contract.prompt_sentinel_required must be true'
    )
    need(
      zcode.prompt_integrity_check_required === true,
      'zcode_contract.prompt_integrity_check_required must be true'
    )
    need(
      zcode.input_box_check_required === true,
      'zcode_contract.input_box_check_required must be true'
    )
    need(zcode.send_action_required === true, 'zcode_contract.send_action_required must be true')
    need(
      includesAll(zcode.allowed_send_actions, ['enter', 'send_button', 'blocked']),
      'zcode_contract.allowed_send_actions must include enter, send_button, blocked'
    )
    need(zcode.computer_use_required === true, 'zcode_contract.computer_use_required must be true')
    need(
      zcode.actual_tool_invocation_required === true,
      'zcode_contract.actual_tool_invocation_required must be true'
    )
    need(
      includesAll(zcode.allowed_tool_targets, ['@ZCode', '@Computer']),
      'zcode_contract.allowed_tool_targets must include @ZCode and @Computer'
    )
    need(
      Number.isInteger(zcode.minimum_tool_event_count) && zcode.minimum_tool_event_count >= 5,
      'zcode_contract.minimum_tool_event_count must be >= 5'
    )
    need(
      zcode.computer_use_tool_invocation_required === true,
      'zcode_contract.computer_use_tool_invocation_required must be true'
    )
    need(
      zcode.computer_use_action_trace_required === true,
      'zcode_contract.computer_use_action_trace_required must be true'
    )
    need(
      zcode.clipboard_write_via_computer_use_required === true,
      'zcode_contract.clipboard_write_via_computer_use_required must be true'
    )
    need(
      zcode.manual_typing_forbidden === true,
      'zcode_contract.manual_typing_forbidden must be true'
    )
    need(
      zcode.shell_only_ui_automation_forbidden === true,
      'zcode_contract.shell_only_ui_automation_forbidden must be true'
    )
    const requiredActions = [
      'verify_zcode_current_session',
      'focus_chat_input',
      'set_clipboard_to_prompt',
      'paste_clipboard',
      'verify_prompt_sentinel_in_input',
      'send_prompt'
    ]
    need(
      includesAll(zcode.required_computer_use_actions, requiredActions),
      `zcode_contract.required_computer_use_actions must include: ${requiredActions.join(', ')}`
    )
    const post = zcode.post_send_computer_use_policy ?? {}
    need(
      post.disconnect_after_send_confirmed === true,
      'post_send_computer_use_policy.disconnect_after_send_confirmed must be true'
    )
    need(
      post.first_30m_probe_interval_minutes === 5,
      'post_send_computer_use_policy.first_30m_probe_interval_minutes must be 5'
    )
    need(
      post.ui_probe_after_30m_min_interval_minutes === 10,
      'post_send_computer_use_policy.ui_probe_after_30m_min_interval_minutes must be 10'
    )
    need(
      post.continuous_ui_monitoring_forbidden === true,
      'post_send_computer_use_policy.continuous_ui_monitoring_forbidden must be true'
    )
  }
  need(nonEmptyString(data.handoff_manual.path), 'handoff_manual.path is required')
  need(
    data.handoff_manual.path.includes(data.dispatch_run_id),
    'handoff_manual.path should include dispatch_run_id'
  )
} else {
  need(
    ['simple_patch', 'standard_task', 'deep_contract'].includes(tier),
    'codex_subagent dispatch_tier must be simple_patch|standard_task|deep_contract'
  )
  need(nonEmptyString(data.target_role), 'codex_subagent requires target_role')
  need(isObject(data.spawn_contract), 'codex_subagent requires spawn_contract')
  if (isObject(data.spawn_contract)) {
    need(
      data.spawn_contract.context_mode === 'isolated',
      'spawn_contract.context_mode must be isolated'
    )
    need(
      data.spawn_contract.generic_fallback_forbidden === true,
      'spawn_contract.generic_fallback_forbidden must be true'
    )
    need(
      data.spawn_contract.identity_receipt_required === true,
      'spawn_contract.identity_receipt_required must be true'
    )
  }
  need(
    nonEmptyString(data?.spawn_contract?.implementer_agent_type),
    'spawn_contract.implementer_agent_type is required'
  )
  need(
    data.target_role === data.spawn_contract.implementer_agent_type,
    'target_role must equal spawn_contract.implementer_agent_type'
  )
  need(
    ['implementer_fast', 'implementer_deep'].includes(data.target_role),
    'target_role must be implementer_fast|implementer_deep'
  )
  if (tier === 'simple_patch') {
    need(data.target_role === 'implementer_fast', 'simple_patch must target implementer_fast')
  }
  if (tier === 'deep_contract') {
    need(data.target_role === 'implementer_deep', 'deep_contract must target implementer_deep')
  }
}

if (qaRequired) {
  need(
    nonEmptyString(data?.spawn_contract?.qa_agent_type),
    'qa_required=true requires spawn_contract.qa_agent_type'
  )
  need(data.spawn_contract.qa_agent_type === 'qa_reviewer', 'qa_agent_type must be qa_reviewer')
}

const figma = data.figma ?? {}
if (nonEmptyString(figma.link)) {
  need(qaRequired === true, 'Figma tasks require task.qa_required=true')
  need(nonEmptyString(figma.node_id), 'figma.node_id is required when figma.link exists')
  need(figma.main_access === 'lite_only', 'figma.main_access must be lite_only')
  need(figma.implementer_fetch_required === true, 'figma.implementer_fetch_required must be true')
  need(figma.qa_baseline_fetch_required === true, 'figma.qa_baseline_fetch_required must be true')
  need(Array.isArray(figma.main_tools_used), 'figma.main_tools_used must be an array')
  const forbiddenMainTools = [
    'get_design_context',
    'get_screenshot',
    'get_variable_defs',
    'get_code',
    'get_assets'
  ]
  const usedForbidden = figma.main_tools_used.filter(tool => forbiddenMainTools.includes(tool))
  need(usedForbidden.length === 0, `main used forbidden Figma tools: ${usedForbidden.join(', ')}`)

  if (mode === 'codex_subagent') {
    need(
      data?.required_skills?.implementer?.includes('$implementer-ui-execution-policy'),
      'Figma codex_subagent requires $implementer-ui-execution-policy'
    )
  }
  need(
    data?.required_skills?.qa?.includes('$qa-ui-visual-baseline-policy'),
    'Figma task requires $qa-ui-visual-baseline-policy for QA'
  )
  if (usesUniUi(pc.component_library)) {
    if (mode === 'codex_subagent') {
      need(
        data?.required_skills?.implementer?.includes('$uni-ui-figma-component-mapper'),
        'Figma + uni-ui codex_subagent requires $uni-ui-figma-component-mapper'
      )
    } else {
      need(
        external?.required_prompt_sections?.includes('uni_ui_mapping_contract'),
        'Figma + uni-ui external_implementer requires uni_ui_mapping_contract prompt section'
      )
    }
  }
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'handoff_contract', errors }, null, 2))
  process.exit(1)
}
console.log(
  JSON.stringify(
    { status: 'passed', gate: 'handoff_contract', dispatch_run_id: data.dispatch_run_id },
    null,
    2
  )
)
