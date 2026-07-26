export function validateImplementationOwnerHandoff({
  data,
  tier,
  externalMode,
  externalTier,
  codeChanges,
  external,
  mode,
  zcode,
  need,
  isObject,
  nonEmptyString,
  includesAll,
  unknownKeys
}) {
  if (externalMode) {
    need(externalTier, 'external_implementer mode requires dispatch_tier=external_implementer')
    need(codeChanges, 'external_implementer requires code_changes_required=true')
    need(
      ['external_implementer', 'zcode_external'].includes(data.target_role),
      'external_implementer requires target_role=external_implementer'
    )
    need(
      isObject(data.external_contract) || isObject(data.zcode_contract),
      'external_implementer requires external_contract'
    )
    need(isObject(data.handoff_manual), 'external_implementer requires handoff_manual')
    validateExternalContract({ data, external, need, isObject, nonEmptyString, unknownKeys })
    validateZcodeContract({ zcode, external, need, includesAll, unknownKeys })
    need(nonEmptyString(data.handoff_manual.path), 'handoff_manual.path is required')
    need(
      data.handoff_manual.path.includes(data.dispatch_run_id),
      'handoff_manual.path should include dispatch_run_id'
    )
    return
  }
  if (mode === 'main_direct') {
    return
  }
  validateCodexSubagentContract({ data, tier, need, isObject, nonEmptyString })
}

function validateExternalContract({ data, external, need, isObject, nonEmptyString, unknownKeys }) {
  const externalUnknown = unknownKeys(external, externalContractAllowedKeys())
  need(
    externalUnknown.length === 0,
    `external_contract contains unknown fields: ${externalUnknown.join(', ')}`
  )
  const provider =
    external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
  need(
    ['zcode', 'trae', 'chrome_cloud_agent', 'other'].includes(provider),
    'external_contract.provider must be zcode|trae|chrome_cloud_agent|other'
  )
  need(nonEmptyString(external.target_session), 'external_contract.target_session is required')
  need(nonEmptyString(external.prompt_transport), 'external_contract.prompt_transport is required')
  need(
    external.send_receipt_required === true,
    'external_contract.send_receipt_required must be true'
  )
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
  validateWebExternalContract({ data, external, provider, need, isObject, nonEmptyString })
}

function validateWebExternalContract({ data, external, provider, need, isObject, nonEmptyString }) {
  const webExternalProvider =
    ['trae', 'chrome_cloud_agent'].includes(provider) ||
    external.prompt_transport === 'browser_plugin'
  if (!webExternalProvider) {
    return
  }
  const remoteSync = external.remote_sync ?? {}
  need(
    ['codex_desktop', 'other'].includes(external.codex_runtime_surface),
    'web external provider requires external_contract.codex_runtime_surface=codex_desktop|other'
  )
  if (external.codex_runtime_surface === 'codex_desktop') {
    need(
      external.web_provider_open_surface === 'builtin_in_app_browser',
      'Codex Desktop web external provider requires web_provider_open_surface=builtin_in_app_browser'
    )
  }
  need(isObject(remoteSync), 'web external provider requires external_contract.remote_sync')
  need(
    external.pr_policy === 'required',
    'web external provider requires external_contract.pr_policy=required'
  )
  need(remoteSync.required === true, 'external_contract.remote_sync.required must be true')
  need(remoteSync.status === 'pushed', 'external_contract.remote_sync.status must be pushed')
  need(nonEmptyString(remoteSync.remote), 'external_contract.remote_sync.remote is required')
  need(nonEmptyString(remoteSync.branch), 'external_contract.remote_sync.branch is required')
  need(
    !(['trae', 'chrome_cloud_agent'].includes(provider) && remoteSync.branch.startsWith('trae/')),
    'Web external provider branch must not use the filtered trae/ prefix; use a visible non-slash branch such as trae-test-{dispatch_run_id}'
  )
  need(
    nonEmptyString(remoteSync.base_commit),
    'external_contract.remote_sync.base_commit is required'
  )
  need(nonEmptyString(remoteSync.push_ref), 'external_contract.remote_sync.push_ref is required')
  need(
    nonEmptyString(remoteSync.planned_worktree_path),
    'external_contract.remote_sync.planned_worktree_path is required'
  )
  need(
    nonEmptyString(remoteSync.pr_url),
    'external_contract.remote_sync.pr_url is required; use not_available only before PR creation'
  )
  need(
    remoteSync.dirty_policy === 'blocked_if_unowned_dirty',
    'external_contract.remote_sync.dirty_policy must be blocked_if_unowned_dirty'
  )
  need(
    data?.validation?.allow_head_change === true,
    'web external remote sync requires validation.allow_head_change=true'
  )
  need(
    data?.validation?.head_change_reason === 'web_external_remote_sync',
    'web external remote sync requires validation.head_change_reason=web_external_remote_sync'
  )
}

function validateZcodeContract({ zcode, external, need, includesAll, unknownKeys }) {
  const provider =
    external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
  const zcodeUnknown = unknownKeys(zcode, externalContractAllowedKeys())
  if (provider !== 'zcode') {
    return
  }
  need(
    zcodeUnknown.length === 0,
    `zcode_contract contains unknown fields: ${zcodeUnknown.join(', ')}`
  )
  need(
    zcode.external_implementer === 'zcode_glm' || zcode.provider === 'zcode',
    'zcode_contract.external_implementer must be zcode_glm or provider must be zcode'
  )
  need(
    !zcode.application || zcode.application === 'ZCode',
    'zcode_contract.application must be ZCode'
  )
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

function validateCodexSubagentContract({ data, tier, need, isObject, nonEmptyString }) {
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

function externalContractAllowedKeys() {
  return [
    'provider',
    'external_implementer',
    'application',
    'adapter',
    'target_session',
    'prompt_transport',
    'codex_runtime_surface',
    'web_provider_open_surface',
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
    'pr_policy',
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
    'post_send_computer_use_policy',
    'remote_sync'
  ]
}
