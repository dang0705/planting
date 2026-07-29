#!/usr/bin/env node
import fs from 'node:fs';

const [handoffFile, receiptFile] = process.argv.slice(2);
if (!handoffFile || !receiptFile) {
  console.error('usage: validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>');
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
const receipt = readJson(receiptFile);
const errors = [];
const need = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const includesAll = (array, items) => items.every((item) => array?.includes(item));

const mode = handoff.implementation_mode ?? 'codex_subagent';
const external = handoff.external_contract ?? handoff.zcode_contract ?? {};
const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '');

// dispatch-20260726-devtools-screenshot-recovery-zcode: 持久用户授权解析。
// 正式 external_contract.zcode_clipboard_bridge_authorization 优先；
// schema 落地前回退到 validation.zcode_clipboard_bridge_authorization 迁移来源。
const clipboardBridgeAuth =
  external.zcode_clipboard_bridge_authorization ??
  handoff?.validation?.zcode_clipboard_bridge_authorization;
const persistentAuthEnabled =
  isObject(clipboardBridgeAuth) &&
  clipboardBridgeAuth.mode === 'persistent_user_authorization' &&
  clipboardBridgeAuth.enabled === true;

need(['external_implementer', 'zcode_external'].includes(mode),
  'validate-zcode-send-receipt requires implementation_mode=external_implementer|zcode_external');
need(provider === 'zcode', 'validate-zcode-send-receipt requires external_contract.provider=zcode');
need(external.computer_use_required === true,
  'handoff external zcode contract must set computer_use_required=true');
need(receipt.dispatch_run_id === handoff.dispatch_run_id,
  'send receipt dispatch_run_id must match handoff');
need(['sent', 'blocked'].includes(receipt.status), 'send receipt status must be sent|blocked');
need(['enter', 'send_button', 'blocked'].includes(receipt.send_action),
  'send_action must be enter|send_button|blocked');

const cu = receipt.computer_use ?? {};
const alternative = receipt.alternative_ui_automation ?? {};
const alternativeUsed = alternative.used === true;
const requiredActions = [
  'verify_zcode_current_session',
  'focus_chat_input',
  'set_clipboard_to_prompt',
  'paste_clipboard',
  'verify_prompt_sentinel_in_input',
  'send_prompt'
];
const validateToolInvocationEvidence = (cu, sent) => {
  const tie = cu.tool_invocation_evidence ?? {};
  need(isObject(tie), 'computer_use.tool_invocation_evidence is required');
  need(tie.actual_tool_invocation_required === true, 'tool_invocation_evidence.actual_tool_invocation_required must be true');
  if (sent) {
    need(['@ZCode', '@Computer'].includes(tie.tool_target), 'tool_invocation_evidence.tool_target must be @ZCode|@Computer');
    need(tie.tool_events_seen === true, 'tool_invocation_evidence.tool_events_seen must be true for sent receipts');
    need(Number.isInteger(tie.tool_event_count) && tie.tool_event_count >= 5, 'tool_invocation_evidence.tool_event_count must be >= 5');
    need(Array.isArray(tie.transcript_event_refs) && tie.transcript_event_refs.length >= 5 && tie.transcript_event_refs.every(nonEmptyString), 'tool_invocation_evidence.transcript_event_refs must contain >=5 non-empty tool event refs');
    need(Array.isArray(tie.commands_issued) && tie.commands_issued.length >= 5 && tie.commands_issued.every(nonEmptyString), 'tool_invocation_evidence.commands_issued must contain >=5 commands');
    if (Array.isArray(tie.commands_issued)) {
      const joined = tie.commands_issued.join(' ').toLowerCase();
      for (const token of ['zcode', 'focus', 'clipboard', 'sentinel', 'send']) {
        need(joined.includes(token), `tool_invocation_evidence.commands_issued must include ${token}`);
      }
    }
  } else {
    need(tie.tool_events_seen === false, 'blocked computer_use_unavailable requires tool_events_seen=false');
    need(tie.tool_event_count === 0, 'blocked computer_use_unavailable requires tool_event_count=0');
  }
};

need(isObject(cu), 'send receipt requires computer_use object');
need(cu.shell_only_ui_automation_used === false,
  'computer_use.shell_only_ui_automation_used must be false');
need(cu.manual_typing_used === false,
  'computer_use.manual_typing_used must be false');

if (alternativeUsed) {
  need(isObject(alternative), 'alternative_ui_automation must be an object when used');
  // dispatch-20260726-devtools-screenshot-recovery-zcode rework: 持久授权覆盖
  // alternative.used=true 的剪贴板桥接子路径。仅在 persistentAuthEnabled 且
  // receipt.authorization_source==='persistent_user_authorization' 时，接受没有/false 的
  // user_authorized_in_current_turn；否则保持现有当前 turn 要求。
  // 不接受 omitted authorization_source 作为持久授权（避免未标记 receipt 被静默提升）。
  const persistentAuthAppliesToAlternative =
    persistentAuthEnabled &&
    receipt.authorization_source === 'persistent_user_authorization';
  if (!persistentAuthAppliesToAlternative) {
    need(
      alternative.user_authorized_in_current_turn === true,
      'alternative_ui_automation requires explicit user authorization in the current turn (or persistent_user_authorization with authorization_source=persistent_user_authorization)'
    );
  }
  need(
    alternative.preauthorized_by_dispatch_standard !== true,
    'alternative_ui_automation cannot rely on dispatch-standard preauthorization'
  );
  need(Array.isArray(alternative.tools) && alternative.tools.length >= 1 && alternative.tools.every(nonEmptyString),
    'alternative_ui_automation.tools must contain at least one tool');
  need(Array.isArray(alternative.safety_controls) && alternative.safety_controls.length >= 3 && alternative.safety_controls.every(nonEmptyString),
    'alternative_ui_automation.safety_controls must contain >=3 non-empty controls');
}

if (receipt.status === 'sent') {
  need(['enter', 'send_button'].includes(receipt.send_action),
    'sent receipt requires send_action=enter|send_button');
  need(receipt.application_verified === 'ZCode', 'application_verified must be ZCode');
  need(receipt.current_session_verified === true, 'current_session_verified must be true');
  need(receipt.input_box_verified === true, 'input_box_verified must be true');
  need(receipt.clipboard_paste_used === true, 'clipboard_paste_used must be true');
  need(receipt.prompt_integrity_verified === true, 'prompt_integrity_verified must be true');
  need(receipt.sentinel_start_seen_before_send === true,
    'sentinel_start_seen_before_send must be true');
  need(receipt.sentinel_end_seen_before_send === true,
    'sentinel_end_seen_before_send must be true');
  need(receipt.codex_typed_prompt_manually === false,
    'codex_typed_prompt_manually must be false');
  // dispatch-20260726-devtools-screenshot-recovery-zcode rework 2: 允许来源是二选一且必须显式。
  // 1. authorization_source=persistent_user_authorization：仅在持久授权 enabled 时可用；
  //    alternative 分支可缺少/false user_authorized_in_current_turn。
  // 2. authorization_source=current_turn_user_authorization：无论持久授权是否启用均可用；
  //    alternative 分支必须 user_authorized_in_current_turn=true。
  // omitted 或未知 source 必须失败（避免未标记 receipt 被静默提升）。
  // persistent source 在授权 disabled 时必须失败。
  const authSource = receipt.authorization_source
  need(
    authSource === 'persistent_user_authorization' ||
      authSource === 'current_turn_user_authorization',
    'authorization_source must be explicitly persistent_user_authorization or current_turn_user_authorization (omitted/unknown not accepted)'
  )
  if (authSource === 'persistent_user_authorization') {
    need(
      persistentAuthEnabled,
      'authorization_source=persistent_user_authorization requires persistent auth enabled'
    )
  }
  need(cu.tool_invoked === true, 'computer_use.tool_invoked must be true for sent receipts');
  validateToolInvocationEvidence(cu, true);
  need(nonEmptyString(cu.tool_family), 'computer_use.tool_family is required');
  need(Array.isArray(cu.actions), 'computer_use.actions must be an array');
  need(includesAll(cu.actions, requiredActions),
    `computer_use.actions must include: ${requiredActions.join(', ')}`);
  need(cu.clipboard_write_confirmed === true,
    'computer_use.clipboard_write_confirmed must be true');
}

if (receipt.status === 'blocked') {
  need(receipt.send_action === 'blocked', 'blocked receipt requires send_action=blocked');
  need(nonEmptyString(receipt.blocked_reason), 'blocked receipt requires blocked_reason');
  need(receipt.no_code_changes_by_codex === true,
    'blocked receipt must confirm no_code_changes_by_codex=true');
  if (receipt.blocked_reason === 'computer_use_unavailable') {
    need(cu.tool_invoked === false,
      'computer_use_unavailable requires computer_use.tool_invoked=false');
    validateToolInvocationEvidence(cu, false);
  }
  if (receipt.blocked_reason === 'alternative_ui_automation_unavailable') {
    need(alternative.attempted === true,
      'alternative_ui_automation_unavailable requires alternative_ui_automation.attempted=true');
    need(Array.isArray(alternative.tools) && alternative.tools.length >= 1,
      'alternative_ui_automation_unavailable requires attempted tool list');
  }
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'zcode_send_receipt', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', gate: 'zcode_send_receipt', send_action: receipt.send_action }, null, 2));
