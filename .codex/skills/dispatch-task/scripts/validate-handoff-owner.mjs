export function validateImplementationOwnerHandoff({
  data,
  _tier,
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
    validateZcodeContract({ data, zcode, external, need, isObject, includesAll, unknownKeys })
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
  need(false, `unsupported implementation_mode: ${mode}`)
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
  // Guard: need() records but continues, so only call .startsWith() when branch is a non-empty string
  if (
    nonEmptyString(remoteSync.branch) &&
    ['trae', 'chrome_cloud_agent'].includes(provider) &&
    remoteSync.branch.startsWith('trae/')
  ) {
    need(
      false,
      'Web external provider branch must not use the filtered trae/ prefix; use a visible non-slash branch such as trae-test-{dispatch_run_id}'
    )
  }
  need(
    nonEmptyString(remoteSync.base_commit),
    'external_contract.remote_sync.base_commit is required'
  )
  need(nonEmptyString(remoteSync.push_ref), 'external_contract.remote_sync.push_ref is required')
  // push_ref 必须与 ${remote}/${branch} 一致：manage-web-pr-worktree.mjs checkout ${remote}/${branch}，
  // validate-result.mjs 用 handoff push_ref 作为 expected recovery branch，不一致会让 recovery evidence
  // 被校验到与 reviewed worktree 不同的 ref 上。
  if (nonEmptyString(remoteSync.push_ref) && nonEmptyString(remoteSync.remote) && nonEmptyString(remoteSync.branch)) {
    const canonicalPushRef = `${remoteSync.remote}/${remoteSync.branch}`
    need(
      remoteSync.push_ref === canonicalPushRef,
      `external_contract.remote_sync.push_ref must equal "${canonicalPushRef}" (got "${remoteSync.push_ref}")`
    )
    // 同样禁止 trae/ 前缀的 push_ref，避免通过 push_ref 绕过 branch 前缀校验。
    if (
      ['trae', 'chrome_cloud_agent'].includes(provider) &&
      remoteSync.branch.startsWith('trae/')
    ) {
      need(
        false,
        'Web external provider push_ref must not resolve to the filtered trae/ prefix'
      )
    }
  }
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

function validateZcodeContract({ zcode, external, need, isObject, includesAll, unknownKeys }) {
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
  for (const field of [
    'input_box_check_required',
    'send_action_required',
    'computer_use_required',
    'actual_tool_invocation_required',
    'computer_use_tool_invocation_required',
    'computer_use_action_trace_required',
    'clipboard_bridge_required',
    'clipboard_bridge_evidence_required',
    'direct_input_injection_forbidden',
    'manual_typing_forbidden',
    'shell_only_ui_automation_forbidden'
  ]) {
    need(zcode[field] === true, `zcode_contract.${field} must be true`)
  }
  need(
    Array.isArray(zcode.allowed_send_actions) &&
      includesAll(zcode.allowed_send_actions, ['send_button', 'blocked']) &&
      !zcode.allowed_send_actions.includes('enter'),
    'zcode_contract.allowed_send_actions must allow send_button|blocked and forbid enter'
  )
  need(
    Array.isArray(zcode.allowed_tool_targets) &&
      includesAll(zcode.allowed_tool_targets, ['@ZCode', '@Computer']),
    'zcode_contract.allowed_tool_targets must include @ZCode and @Computer'
  )
  need(
    Number.isInteger(zcode.minimum_tool_event_count) && zcode.minimum_tool_event_count >= 5,
    'zcode_contract.minimum_tool_event_count must be >= 5'
  )
  const requiredActions = [
    'verify_zcode_current_session',
    'locate_unique_entry_area',
    'focus_chat_input',
    'run_verified_clipboard_bridge',
    'paste_clipboard_via_cmd_v',
    'verify_paste_delivery',
    'send_prompt_after_integrity_check',
    'verify_post_send_delivery'
  ]
  need(
    Array.isArray(zcode.required_computer_use_actions) &&
      includesAll(zcode.required_computer_use_actions, requiredActions),
    'zcode_contract.required_computer_use_actions lacks verified visible delivery actions'
  )
  const postSend = zcode.post_send_computer_use_policy
  need(isObject(postSend), 'zcode_contract.post_send_computer_use_policy is required')
  if (isObject(postSend)) {
    need(postSend.verify_current_chat_delivery === true, 'post-send policy must verify current chat delivery')
    need(postSend.disconnect_after_send_confirmed === true, 'post-send policy must disconnect after confirmed send')
    need(postSend.continuous_ui_monitoring_forbidden === true, 'post-send policy must forbid continuous UI monitoring')
  }
  const authorization = zcode.zcode_clipboard_bridge_authorization
  need(
    isObject(authorization) && authorization.enabled === true &&
      ['current_turn_explicit', 'persistent_user_authorization'].includes(authorization.mode),
    'zcode_contract.zcode_clipboard_bridge_authorization must be explicit and enabled'
  )
  for (const field of [
    'headless_cli_required',
    'canonical_prompt_file_reference_required',
    'headless_permission_mode',
    'credential_source',
    'credential_persistence_forbidden',
    'clipboard_ui_fallback_forbidden',
    'provider_execution_receipt_required'
  ]) {
    need(zcode[field] === undefined, `zcode_contract.${field} is retired and forbidden for visible clipboard transport`)
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
    'clipboard_bridge_required',
    'clipboard_bridge_evidence_required',
    'direct_input_injection_forbidden',
    'manual_typing_forbidden',
    'shell_only_ui_automation_forbidden',
    'required_computer_use_actions',
    'post_send_computer_use_policy',
    'remote_sync',
    'zcode_clipboard_bridge_authorization',
    'headless_cli_required',
    'canonical_prompt_file_reference_required',
    'headless_permission_mode',
    'credential_source',
    'credential_persistence_forbidden',
    'clipboard_ui_fallback_forbidden',
    'provider_execution_receipt_required'
  ]
}
