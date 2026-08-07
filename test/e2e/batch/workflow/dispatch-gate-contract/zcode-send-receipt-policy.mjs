import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  countUtf8Lines,
  sha256
} from '../../../../../.codex/skills/dispatch-task/scripts/zcode-clipboard-bridge.mjs'
import { validateZcodeSendReceipt } from '../../../../../.codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../../..')
const dispatchDir = path.join(repoRoot, '.tmp', 'dispatch-task')
const handoffExample = path.join(
  repoRoot,
  '.codex/skills/dispatch-task/examples/zcode-external-ui-handoff.json'
)
const baseHandoff = JSON.parse(fs.readFileSync(handoffExample, 'utf8'))
const created = []
const clone = value => JSON.parse(JSON.stringify(value))
function fixture(label, branch = 'direct_text') {
  const id = `zcode-visible-receipt-${label}-${process.pid}`
  const promptPath = path.join(dispatchDir, `${id}-prompt.md`)
  const prompt = Buffer.from(`canonical visible receipt prompt\n${id}\n`, 'utf8')
  fs.writeFileSync(promptPath, prompt)
  created.push(promptPath)
  const handoff = clone(baseHandoff)
  handoff.dispatch_run_id = id
  const identity = {
    path: promptPath,
    sha256: sha256(prompt),
    bytes: prompt.length,
    lines: countUtf8Lines(prompt.toString('utf8')),
    verified_before_after: true
  }
  const attachment = branch === 'pasted_text_attachment'
  return {
    handoff,
    receipt: {
      dispatch_run_id: id,
      status: 'sent',
      blocker: null,
      transport: {
        kind: 'zcode_visible_clipboard',
        target_session: 'current_open_chat',
        status: 'sent',
        fallback: 'none',
        headless_used: false
      },
      prompt_identity: identity,
      clipboard: {
        write_attempts: [
          {
            method: 'nspasteboard',
            status: 'verified',
            readback_verified: true,
            attempted_at: '2026-07-30T08:00:00.000Z'
          }
        ],
        selected_method: 'nspasteboard',
        readback_verified: true,
        verified_at: '2026-07-30T08:00:01.000Z'
      },
      input_focus: {
        latest_app_state_checked: true,
        unique_entry_area: true,
        clicked: true,
        focused_element_verified: true,
        element_index_persisted: false,
        verified_at: '2026-07-30T08:00:02.000Z'
      },
      paste_delivery: {
        attempts: [{ method: 'cmd_v', delivery_verified: true }],
        selected_method: 'cmd_v',
        rendering: branch,
        pre_send_verified: true,
        direct_text_identity: attachment
          ? null
          : {
              sha256: identity.sha256,
              bytes: identity.bytes,
              lines: identity.lines
            },
        attachment: attachment
          ? {
              name: `${id}-prompt.md`,
              sha256: identity.sha256,
              bytes: identity.bytes,
              lines: identity.lines,
              present_before_send: true,
              present_after_send: true
            }
          : null,
        verified_at: '2026-07-30T08:00:03.000Z'
      },
      send_delivery: {
        send_clicked: true,
        input_submitted: true,
        conversation_state_changed: true,
        conversation_delivery_verified: true,
        verified_at: '2026-07-30T08:00:04.000Z'
      },
      redaction: {
        prompt_body_persisted: false,
        old_clipboard_persisted: false,
        credential_persisted: false,
        raw_ui_dump_persisted: false,
        element_index_persisted: false
      },
      created_at: '2026-07-30T08:00:00.000Z',
      sent_at: '2026-07-30T08:00:05.000Z'
    }
  }
}
const errorsFor = item => validateZcodeSendReceipt({ ...item, cwd: repoRoot })
test.after(() => {
  for (const file of created) {
    try {
      fs.unlinkSync(file)
    } catch {
      /* fixture may already be absent */
    }
  }
})

test('accepts native clipboard, Cmd+V, and exact direct text delivery', () => {
  assert.deepEqual(errorsFor(fixture('native-direct')), [])
})

test('accepts ordered pbcopy and Edit > Paste fallbacks with attachment evidence', () => {
  const item = fixture('fallback-attachment', 'pasted_text_attachment')
  item.receipt.clipboard.write_attempts = [
    {
      method: 'nspasteboard',
      status: 'mismatch',
      readback_verified: false,
      attempted_at: '2026-07-30T08:00:00.000Z'
    },
    {
      method: 'pbcopy',
      status: 'verified',
      readback_verified: true,
      attempted_at: '2026-07-30T08:00:00.500Z'
    }
  ]
  item.receipt.clipboard.selected_method = 'pbcopy'
  item.receipt.paste_delivery.attempts = [
    { method: 'cmd_v', delivery_verified: false },
    { method: 'edit_menu_paste', delivery_verified: true }
  ]
  item.receipt.paste_delivery.selected_method = 'edit_menu_paste'
  assert.deepEqual(errorsFor(item), [])
})

test('rejects out-of-order fallbacks and any attempt after successful delivery', () => {
  const clipboard = fixture('clipboard-order')
  clipboard.receipt.clipboard.write_attempts = [
    {
      method: 'pbcopy',
      status: 'verified',
      readback_verified: true,
      attempted_at: '2026-07-30T08:00:00.000Z'
    },
    {
      method: 'nspasteboard',
      status: 'mismatch',
      readback_verified: false,
      attempted_at: '2026-07-30T08:00:00.500Z'
    }
  ]
  assert.match(errorsFor(clipboard).join('\n'), /nspasteboard then pbcopy|stop after verified/)
  const paste = fixture('paste-order')
  paste.receipt.paste_delivery.attempts = [
    { method: 'cmd_v', delivery_verified: true },
    { method: 'edit_menu_paste', delivery_verified: false }
  ]
  assert.match(errorsFor(paste).join('\n'), /stop after verified/)
})

test('rejects send before each clipboard, focus, paste, and prompt-integrity gate', () => {
  const mutations = [
    item => {
      item.receipt.clipboard.readback_verified = false
    },
    item => {
      item.receipt.input_focus.latest_app_state_checked = false
    },
    item => {
      item.receipt.input_focus.unique_entry_area = false
    },
    item => {
      item.receipt.input_focus.clicked = false
    },
    item => {
      item.receipt.input_focus.focused_element_verified = false
    },
    item => {
      item.receipt.paste_delivery.pre_send_verified = false
    },
    item => {
      item.receipt.prompt_identity.verified_before_after = false
    }
  ]
  mutations.forEach((mutate, index) => {
    const item = fixture(`pre-send-${index}`)
    mutate(item)
    assert.match(errorsFor(item).join('\n'), /send cannot be clicked|all pre-send verification/)
  })
})

test('requires exact direct text identity and complete attachment lifecycle', () => {
  const direct = fixture('direct-mismatch')
  direct.receipt.paste_delivery.direct_text_identity.bytes += 1
  assert.match(errorsFor(direct).join('\n'), /direct_text identity/)
  for (const mutate of [
    attachment => {
      attachment.sha256 = '0'.repeat(64)
    },
    attachment => {
      attachment.lines += 1
    },
    attachment => {
      attachment.bytes += 1
    },
    attachment => {
      attachment.present_before_send = false
    },
    attachment => {
      attachment.present_after_send = false
    }
  ]) {
    const item = fixture(`attachment-${created.length}`, 'pasted_text_attachment')
    mutate(item.receipt.paste_delivery.attachment)
    assert.match(errorsFor(item).join('\n'), /attachment/)
  }
})

test('rejects persisted element indices, raw UI, credentials, and headless evidence', () => {
  const item = fixture('redaction')
  item.receipt.input_focus.element_index = 7
  item.receipt.redaction.raw_ui_dump_persisted = true
  item.receipt.credential = { api_key: 'key-secret-material-123456' }
  item.receipt.transport.kind = 'zcode_headless_cli'
  item.receipt.transport.headless_used = true
  const errors = errorsFor(item).join('\n')
  assert.match(errors, /element_index/)
  assert.match(errors, /raw_ui_dump_persisted/)
  assert.match(errors, /credential/)
  assert.match(errors, /zcode_visible_clipboard/)
  assert.match(errors, /headless/)
  assert.match(errors, /secret-like/)
})

test('accepts closed blocked evidence but never a delivered blocked receipt', () => {
  const item = fixture('blocked')
  item.receipt.status = 'blocked'
  item.receipt.blocker = 'paste_delivery_failed'
  item.receipt.transport.status = 'input_focused'
  item.receipt.paste_delivery = {
    attempts: [{ method: 'cmd_v', delivery_verified: false }],
    selected_method: null,
    rendering: null,
    pre_send_verified: false,
    direct_text_identity: null,
    attachment: null,
    verified_at: null
  }
  item.receipt.send_delivery = {
    send_clicked: false,
    input_submitted: false,
    conversation_state_changed: false,
    conversation_delivery_verified: false,
    verified_at: null
  }
  item.receipt.sent_at = null
  assert.deepEqual(errorsFor(item), [])
  item.receipt.send_delivery.conversation_delivery_verified = true
  item.receipt.send_delivery.verified_at = '2026-07-30T08:00:04.000Z'
  assert.match(errorsFor(item).join('\n'), /blocked receipt cannot claim conversation delivery/)
})

test('rejects stale or noncanonical prompt identity and non-monotonic evidence', () => {
  const stale = fixture('stale')
  stale.receipt.prompt_identity.sha256 = '0'.repeat(64)
  assert.match(errorsFor(stale).join('\n'), /prompt identity must match/)
  const outside = fixture('outside')
  outside.receipt.prompt_identity.path = `/tmp/${outside.receipt.dispatch_run_id}-prompt.md`
  assert.match(errorsFor(outside).join('\n'), /canonical regular prompt/)
  const times = fixture('times')
  times.receipt.input_focus.verified_at = '2026-07-30T07:59:59.000Z'
  assert.match(errorsFor(times).join('\n'), /timestamps must be monotonic/)
})

test('schema, examples, and routing declare visible delivery without headless fallback', () => {
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        '.codex/skills/dispatch-task/assets/schemas/zcode-send-receipt.schema.json'
      ),
      'utf8'
    )
  )
  assert.equal(schema.properties.transport.properties.kind.const, 'zcode_visible_clipboard')
  assert.equal(schema.properties.transport.properties.headless_used.const, false)
  const files = [
    '.codex/skills/dispatch-task/SKILL.md',
    '.codex/skills/dispatch-task/references/external-implementer-routing.md',
    '.codex/skills/dispatch-task/references/zcode-routing.md',
    '.codex/skills/dispatch-task/references/zcode-computer-use-policy.md',
    '.codex/skills/dispatch-task/examples/zcode-external-ui-handoff.json',
    '.codex/skills/dispatch-task/examples/zcode-send-receipt.json',
    '.codex/skills/dispatch-task/examples/zcode-external-result.json'
  ]
  for (const file of files) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    assert.match(source, /current_open_chat|zcode_visible_clipboard/)
    assert.match(source, /clipboard|剪贴板/i)
  }
  const routing = fs.readFileSync(
    path.join(repoRoot, '.codex/skills/dispatch-task/references/zcode-routing.md'),
    'utf8'
  )
  assert.match(routing, /不.*回退.*headless/i)
})
