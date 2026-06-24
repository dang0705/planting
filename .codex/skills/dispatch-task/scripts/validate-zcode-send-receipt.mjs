#!/usr/bin/env node
import fs from 'node:fs';

const [handoffFile, receiptFile] = process.argv.slice(2);
if (!handoffFile || !receiptFile) {
  console.error('usage: validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>');
  process.exit(2);
}

const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2));
    process.exit(2);
  }
};

const handoff = readJson(handoffFile);
const receipt = readJson(receiptFile);
const errors = [];
const need = (condition, message) => { if (!condition) errors.push(message); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const includesAll = (array, items) => items.every((item) => array?.includes(item));

need((handoff.implementation_mode ?? 'codex_subagent') === 'zcode_external',
  'validate-zcode-send-receipt requires implementation_mode=zcode_external');
need(handoff?.zcode_contract?.computer_use_required === true,
  'handoff.zcode_contract.computer_use_required must be true');
need(receipt.dispatch_run_id === handoff.dispatch_run_id,
  'send receipt dispatch_run_id must match handoff');
need(['sent', 'blocked'].includes(receipt.status), 'send receipt status must be sent|blocked');
need(['enter', 'send_button', 'blocked'].includes(receipt.send_action),
  'send_action must be enter|send_button|blocked');

const cu = receipt.computer_use ?? {};
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
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'blocked', gate: 'zcode_send_receipt', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'passed', gate: 'zcode_send_receipt', send_action: receipt.send_action }, null, 2));
