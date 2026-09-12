#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { countUtf8Lines, sha256 } from './zcode-clipboard-bridge.mjs'

const DISPATCH_DIRECTORY = path.resolve(process.cwd(), '.tmp/dispatch-task')
const BLOCKERS = new Set([
  'clipboard_write_failed',
  'clipboard_readback_failed',
  'input_not_unique',
  'focus_failed',
  'paste_delivery_failed',
  'prompt_integrity_failed',
  'send_delivery_failed'
])
const BANNED_KEYS = new Set([
  'api_key',
  'authorization',
  'credential',
  'credential_key',
  'element_index',
  'headless_permission_mode',
  'old_clipboard',
  'process',
  'prompt_body',
  'raw_ui_dump',
  'request_body',
  'session',
  'token'
])
const CONTRACT_FIELDS = [
  ['input_box_check_required', true],
  ['send_action_required', true],
  ['computer_use_required', true],
  ['actual_tool_invocation_required', true],
  ['computer_use_tool_invocation_required', true],
  ['computer_use_action_trace_required', true],
  ['clipboard_bridge_required', true],
  ['clipboard_bridge_evidence_required', true],
  ['direct_input_injection_forbidden', true],
  ['manual_typing_forbidden', true],
  ['shell_only_ui_automation_forbidden', true]
]
const REQUIRED_ACTIONS = [
  'verify_zcode_current_session',
  'locate_unique_entry_area',
  'focus_chat_input',
  'run_verified_clipboard_bridge',
  'paste_clipboard_via_cmd_v',
  'verify_paste_delivery',
  'send_prompt_after_integrity_check',
  'verify_post_send_delivery'
]
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0
const isIso = value => nonEmpty(value) && !Number.isNaN(Date.parse(value))
const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
const need = (errors, condition, message) => { if (!condition) { errors.push(message) } }
function onlyKeys(errors, value, allowed, label) {
  if (!isObject(value)) { return }
  const unknown = Object.keys(value).filter(key => !allowed.includes(key))
  need(errors, unknown.length === 0, `${label} contains unknown fields: ${unknown.join(', ')}`)
}
function walk(value, visit) {
  if (Array.isArray(value)) { value.forEach(item => walk(item, visit)); return }
  if (!isObject(value)) { return }
  for (const [key, child] of Object.entries(value)) {
    visit(key, child)
    walk(child, visit)
  }
}
function canonicalRegular(candidate, dispatchRunId) {
  if (!nonEmpty(candidate)) { return false }
  const absolute = path.resolve(candidate)
  if (path.dirname(absolute) !== DISPATCH_DIRECTORY || !path.basename(absolute).includes(dispatchRunId)) { return false }
  try {
    const stat = fs.lstatSync(absolute)
    return stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(absolute) === absolute
  } catch {
    return false
  }
}
function exactIdentity(actual, expected) {
  return isObject(actual) && actual.sha256 === expected.sha256 &&
    actual.bytes === expected.bytes && actual.lines === expected.lines
}
function validateClipboard(errors, clipboard) {
  need(errors, isObject(clipboard), 'receipt.clipboard is required')
  onlyKeys(errors, clipboard, ['write_attempts', 'selected_method', 'readback_verified', 'verified_at'], 'receipt.clipboard')
  const attempts = clipboard?.write_attempts
  need(errors, Array.isArray(attempts) && attempts.length >= 1 && attempts.length <= 2, 'clipboard.write_attempts must contain 1-2 attempts')
  if (Array.isArray(attempts)) {
    const expectedMethods = ['nspasteboard', 'pbcopy']
    attempts.forEach((attempt, index) => {
      need(errors, isObject(attempt), `clipboard.write_attempts[${index}] must be an object`)
      onlyKeys(errors, attempt, ['method', 'status', 'readback_verified', 'attempted_at'], `clipboard.write_attempts[${index}]`)
      need(errors, attempt?.method === expectedMethods[index], 'clipboard methods must run nspasteboard then pbcopy')
      need(errors, ['write_failed', 'read_failed', 'mismatch', 'method_failed', 'verified'].includes(attempt?.status), 'clipboard attempt status is unsupported')
      need(errors, typeof attempt?.readback_verified === 'boolean', 'clipboard attempt readback_verified must be boolean')
      need(errors, (attempt?.status === 'verified') === (attempt?.readback_verified === true), 'clipboard verified status must match readback_verified')
      need(errors, isIso(attempt?.attempted_at), 'clipboard attempt attempted_at must be ISO-8601')
      if (index < attempts.length - 1) { need(errors, attempt?.readback_verified === false, 'clipboard fallback must stop after verified readback') }
    })
  }
  const verified = Array.isArray(attempts) ? attempts.filter(item => item?.readback_verified === true) : []
  need(errors, clipboard?.selected_method === null || ['nspasteboard', 'pbcopy'].includes(clipboard?.selected_method), 'clipboard.selected_method is unsupported')
  need(errors, clipboard?.readback_verified === (verified.length === 1), 'clipboard.readback_verified must match attempts')
  need(errors, verified.length ? clipboard?.selected_method === verified[0].method : clipboard?.selected_method === null, 'clipboard.selected_method must identify the verified attempt')
  need(errors, clipboard?.readback_verified ? isIso(clipboard?.verified_at) : clipboard?.verified_at === null, 'clipboard.verified_at must match verification')
}
function validateFocus(errors, focus) {
  need(errors, isObject(focus), 'receipt.input_focus is required')
  onlyKeys(errors, focus, ['latest_app_state_checked', 'unique_entry_area', 'clicked', 'focused_element_verified', 'element_index_persisted', 'verified_at'], 'receipt.input_focus')
  for (const key of ['latest_app_state_checked', 'unique_entry_area', 'clicked', 'focused_element_verified']) {
    need(errors, typeof focus?.[key] === 'boolean', `input_focus.${key} must be boolean`)
  }
  need(errors, focus?.element_index_persisted === false, 'input_focus.element_index_persisted must be false')
  need(errors, focus?.focused_element_verified ? isIso(focus?.verified_at) : focus?.verified_at === null, 'input_focus.verified_at must match focused verification')
}
function validatePaste(errors, paste, identity, sent) {
  need(errors, isObject(paste), 'receipt.paste_delivery is required')
  onlyKeys(errors, paste, ['attempts', 'selected_method', 'rendering', 'pre_send_verified', 'direct_text_identity', 'attachment', 'verified_at'], 'receipt.paste_delivery')
  const attempts = paste?.attempts
  need(errors, Array.isArray(attempts) && attempts.length === 1, 'paste_delivery.attempts must contain exactly one Cmd+V attempt')
  if (Array.isArray(attempts)) {
    attempts.forEach((attempt, index) => {
      need(errors, isObject(attempt), `paste_delivery.attempts[${index}] must be an object`)
      onlyKeys(errors, attempt, ['method', 'delivery_verified'], `paste_delivery.attempts[${index}]`)
      need(errors, attempt?.method === 'cmd_v', 'paste method must be cmd_v')
      need(errors, typeof attempt?.delivery_verified === 'boolean', 'paste attempt delivery_verified must be boolean')
    })
  }
  const verified = Array.isArray(attempts) ? attempts.filter(item => item?.delivery_verified === true) : []
  need(errors, paste?.selected_method === null || paste?.selected_method === 'cmd_v', 'paste_delivery.selected_method is unsupported')
  need(errors, verified.length <= 1, 'only one paste attempt may be verified')
  need(errors, verified.length ? paste?.selected_method === verified[0].method : paste?.selected_method === null, 'paste_delivery.selected_method must identify the verified attempt')
  need(errors, ['direct_text', 'pasted_text_attachment', null].includes(paste?.rendering), 'paste_delivery.rendering is unsupported')
  need(errors, typeof paste?.pre_send_verified === 'boolean', 'paste_delivery.pre_send_verified must be boolean')
  if (paste?.rendering === 'direct_text') {
    need(errors, exactIdentity(paste.direct_text_identity, identity), 'direct_text identity must equal canonical prompt')
    need(errors, paste.attachment === null, 'direct_text rendering requires attachment=null')
  } else if (paste?.rendering === 'pasted_text_attachment') {
    need(errors, paste.direct_text_identity === null, 'attachment rendering requires direct_text_identity=null')
    need(errors, isObject(paste.attachment), 'attachment rendering requires attachment evidence')
    onlyKeys(errors, paste.attachment, ['name', 'lines', 'present_before_send', 'present_after_send'], 'paste_delivery.attachment')
    need(errors, nonEmpty(paste.attachment?.name), 'attachment.name is required')
    need(errors, Number.isSafeInteger(paste.attachment?.lines) && paste.attachment.lines > 0,
      'attachment.lines must be a positive integer')
    need(errors, paste.attachment?.lines === identity.lines,
      'attachment visible line count must equal canonical prompt line count')
    need(errors, paste.attachment?.present_before_send === true, 'attachment must be visible before send')
    if (sent) { need(errors, paste.attachment?.present_after_send === true, 'sent attachment must remain visible after send') }
  } else {
    need(errors, paste?.direct_text_identity === null && paste?.attachment === null, 'unverified paste requires null branch evidence')
  }
  need(errors, paste?.pre_send_verified === (verified.length === 1 && ['direct_text', 'pasted_text_attachment'].includes(paste?.rendering)), 'pre_send_verified must match paste delivery')
  need(errors, paste?.pre_send_verified ? isIso(paste?.verified_at) : paste?.verified_at === null, 'paste_delivery.verified_at must match verification')
}
function validateSend(errors, delivery) {
  need(errors, isObject(delivery), 'receipt.send_delivery is required')
  onlyKeys(errors, delivery, ['send_clicked', 'input_submitted', 'conversation_state_changed', 'conversation_delivery_verified', 'verified_at'], 'receipt.send_delivery')
  for (const key of ['send_clicked', 'input_submitted', 'conversation_state_changed', 'conversation_delivery_verified']) {
    need(errors, typeof delivery?.[key] === 'boolean', `send_delivery.${key} must be boolean`)
  }
  need(errors, delivery?.conversation_delivery_verified ? isIso(delivery?.verified_at) : delivery?.verified_at === null, 'send_delivery.verified_at must match verification')
}
function validateTimes(errors, receipt) {
  const ordered = [
    receipt.clipboard?.verified_at,
    receipt.input_focus?.verified_at,
    receipt.paste_delivery?.verified_at,
    receipt.send_delivery?.verified_at,
    receipt.sent_at
  ].filter(isIso).map(Date.parse)
  need(errors, ordered.every((value, index) => index === 0 || value >= ordered[index - 1]), 'receipt verification timestamps must be monotonic')
  need(errors, isIso(receipt.created_at), 'receipt.created_at must be ISO-8601')
}
export function validateZcodeSendReceipt({ handoff, receipt }) {
  const errors = []
  const external = handoff?.external_contract ?? handoff?.zcode_contract ?? {}
  const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
  need(errors, ['external_implementer', 'zcode_external'].includes(handoff?.implementation_mode), 'ZCode receipt requires external implementation mode')
  need(errors, provider === 'zcode', 'ZCode receipt requires provider=zcode')
  need(errors, external.target_session === 'current_open_chat', 'ZCode target_session must be current_open_chat')
  need(errors, external.prompt_transport === 'clipboard_paste', 'ZCode prompt_transport must be clipboard_paste')
  for (const [key, expected] of CONTRACT_FIELDS) {
    need(errors, external[key] === expected, `ZCode external_contract.${key} must equal ${expected}`)
  }
  need(errors, Array.isArray(external.required_computer_use_actions) && REQUIRED_ACTIONS.every(action => external.required_computer_use_actions.includes(action)), 'ZCode external contract lacks required visible delivery actions')
  need(errors, isObject(receipt), 'ZCode send receipt must be an object')
  if (!isObject(receipt)) { return errors }
  onlyKeys(errors, receipt, ['dispatch_run_id', 'status', 'blocker', 'transport', 'prompt_identity', 'clipboard', 'input_focus', 'paste_delivery', 'send_delivery', 'redaction', 'created_at', 'sent_at'], 'receipt')
  need(errors, receipt.dispatch_run_id === handoff?.dispatch_run_id, 'receipt dispatch_run_id must match handoff')
  need(errors, ['sent', 'blocked'].includes(receipt.status), 'receipt status must be sent|blocked')
  walk(receipt, (key, value) => {
    need(errors, !BANNED_KEYS.has(key), `visible receipt forbids sensitive/headless field: ${key}`)
    if (typeof value === 'string') {
      need(errors, !/(?:Bearer\s+[A-Za-z0-9._-]+|enc:v1:|(?:sk|key)-[A-Za-z0-9_-]{12,})/i.test(value), `receipt contains secret-like material at ${key}`)
    }
  })
  const transport = receipt.transport ?? {}
  onlyKeys(errors, transport, ['kind', 'target_session', 'status', 'fallback', 'headless_used'], 'receipt.transport')
  need(errors, transport.kind === 'zcode_visible_clipboard', 'transport.kind must be zcode_visible_clipboard')
  need(errors, transport.target_session === 'current_open_chat', 'transport.target_session must be current_open_chat')
  need(errors, ['not_started', 'clipboard_prepared', 'input_focused', 'pasted', 'sent'].includes(transport.status), 'transport.status is unsupported')
  need(errors, transport.fallback === 'none' && transport.headless_used === false, 'transport must prohibit fallback and headless')
  const identity = receipt.prompt_identity ?? {}
  onlyKeys(errors, identity, ['path', 'sha256', 'bytes', 'lines', 'verified_before_after'], 'receipt.prompt_identity')
  need(errors, canonicalRegular(identity.path, handoff?.dispatch_run_id), 'prompt_identity.path must be a canonical regular prompt file')
  need(errors, isDigest(identity.sha256), 'prompt_identity.sha256 must be SHA-256')
  need(errors, Number.isSafeInteger(identity.bytes) && identity.bytes > 0, 'prompt_identity.bytes must be positive')
  need(errors, Number.isSafeInteger(identity.lines) && identity.lines > 0, 'prompt_identity.lines must be positive')
  need(errors, typeof identity.verified_before_after === 'boolean', 'prompt_identity.verified_before_after must be boolean')
  if (canonicalRegular(identity.path, handoff?.dispatch_run_id)) {
    const prompt = fs.readFileSync(path.resolve(identity.path))
    need(errors, sha256(prompt) === identity.sha256 && prompt.length === identity.bytes &&
      countUtf8Lines(prompt.toString('utf8')) === identity.lines, 'prompt identity must match canonical file')
    if (prompt.length >= 16) { need(errors, !JSON.stringify(receipt).includes(prompt.toString('utf8')), 'receipt must not persist prompt body') }
  }
  validateClipboard(errors, receipt.clipboard)
  validateFocus(errors, receipt.input_focus)
  validatePaste(errors, receipt.paste_delivery, identity, receipt.status === 'sent')
  validateSend(errors, receipt.send_delivery)
  const redaction = receipt.redaction ?? {}
  onlyKeys(errors, redaction, ['prompt_body_persisted', 'old_clipboard_persisted', 'credential_persisted', 'raw_ui_dump_persisted', 'element_index_persisted'], 'receipt.redaction')
  for (const key of ['prompt_body_persisted', 'old_clipboard_persisted', 'credential_persisted', 'raw_ui_dump_persisted', 'element_index_persisted']) {
    need(errors, redaction[key] === false, `redaction.${key} must be false`)
  }
  validateTimes(errors, receipt)
  const preSendReady = receipt.clipboard?.readback_verified === true &&
    receipt.input_focus?.latest_app_state_checked === true && receipt.input_focus?.unique_entry_area === true &&
    receipt.input_focus?.clicked === true && receipt.input_focus?.focused_element_verified === true &&
    receipt.paste_delivery?.pre_send_verified === true && identity.verified_before_after === true
  need(errors, receipt.send_delivery?.send_clicked !== true || preSendReady, 'send cannot be clicked before clipboard/focus/paste integrity verification')
  if (receipt.status === 'sent') {
    need(errors, receipt.blocker === null, 'sent receipt requires blocker=null')
    need(errors, transport.status === 'sent', 'sent receipt requires transport.status=sent')
    need(errors, preSendReady, 'sent receipt requires all pre-send verification')
    need(errors, receipt.send_delivery?.send_clicked === true && receipt.send_delivery?.input_submitted === true &&
      receipt.send_delivery?.conversation_state_changed === true &&
      receipt.send_delivery?.conversation_delivery_verified === true, 'sent receipt requires verified post-send delivery')
    need(errors, isIso(receipt.sent_at), 'sent receipt requires sent_at')
  } else {
    need(errors, BLOCKERS.has(receipt.blocker), 'blocked receipt requires a supported blocker')
    need(errors, transport.status !== 'sent', 'blocked receipt cannot claim transport sent')
    need(errors, receipt.sent_at === null, 'blocked receipt requires sent_at=null')
    need(errors, receipt.send_delivery?.conversation_delivery_verified !== true, 'blocked receipt cannot claim conversation delivery')
  }
  return errors
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
function main() {
  const [handoffFile, receiptFile] = process.argv.slice(2)
  if (!handoffFile || !receiptFile) {
    console.error('usage: validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>')
    process.exitCode = 2
    return
  }
  try {
    const errors = validateZcodeSendReceipt({ handoff: readJson(handoffFile), receipt: readJson(receiptFile) })
    console.log(JSON.stringify({ status: errors.length ? 'invalid' : 'valid', errors }, null, 2))
    if (errors.length) { process.exitCode = 1 }
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', error: error.message }, null, 2))
    process.exitCode = 2
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { main() }
