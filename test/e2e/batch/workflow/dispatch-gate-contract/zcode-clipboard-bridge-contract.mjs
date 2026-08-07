import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  ClipboardBridgeError,
  createClipboardMethods,
  promptIdentity,
  runClipboardBridge
} from '../../../../../.codex/skills/dispatch-task/scripts/zcode-clipboard-bridge.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../../..')
const dispatchDir = path.join(repoRoot, '.tmp', 'dispatch-task')
const examplePath = path.join(
  repoRoot,
  '.codex/skills/dispatch-task/examples/zcode-external-ui-handoff.json'
)
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'))
const created = []
const clone = value => JSON.parse(JSON.stringify(value))
const write = (file, value) => {
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
  created.push(file)
}
const promptFor = (id, manual) => `<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:START>>>
# External Implementer Handoff
## Implementation Contract
Implement the requested change and run unit tests.
## Allowed / Forbidden Paths
Honor the exact path boundaries.
## Project Constraints
Use Tailwind and do not add SCSS.
## Handoff Manual Contract
Write ${manual} with status=working, status=completed, or status=blocked.
Use provider_status=running, provider_status=delivered, or provider_status=blocked; delivered is not dispatch completion.
## Validation Commands
Record validation_evidence.
## UI Scope Contract
Follow the target UI.
## Style Stack Contract
Tailwind only; SCSS forbidden.
## Figma Direct Fetch
Use get_design_context for https://figma.com/design/example/file?node-id=10-20 node 10:20.
## Figma Blocker Policy
Return BLOCKED_EXTERNAL_FIGMA_UNAVAILABLE when design context is unavailable; follow AGENTS screenshot policy.
## uni-ui Mapping Contract
Record uni_ui_mapping_evidence.
## Selection to Consumer Contract
Record selection_to_consumer.not_applicable=true with a reason.
## Result JSON Contract
Return JSON between these markers.
<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:START>>>
{"status":"completed","validation_evidence":{},"selection_to_consumer":{"not_applicable":true,"reason":"fixture"}}
<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:END>>>
<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:END>>>
`
function fixture(label, promptOverride) {
  const id = `zcode-visible-${label}-${process.pid}`
  const handoffPath = path.join(dispatchDir, `${id}-handoff.json`)
  const promptPath = path.join(dispatchDir, `${id}-prompt.md`)
  const evidencePath = path.join(dispatchDir, `${id}-clipboard-evidence.json`)
  const handoff = clone(example)
  handoff.dispatch_run_id = id
  handoff.handoff_manual.path = `.tmp/dispatch-task/${id}-handoff-manual.json`
  handoff.validation.worktree_baseline_path = `.tmp/dispatch-task/${id}-worktree-baseline.json`
  write(handoffPath, handoff)
  write(promptPath, promptOverride?.(id) ?? promptFor(id, handoff.handoff_manual.path))
  return { id, handoff, handoffPath, promptPath, evidencePath }
}
const successfulMethod = (name, prompt, calls) => ({
  name,
  write: async () => {
    calls.push(`${name}:write`)
    return true
  },
  read: async () => {
    calls.push(`${name}:read`)
    return { ok: true, stdout: prompt }
  }
})
const run = (files, methods, options = {}) => runClipboardBridge({ ...files, methods, ...options })

test.after(() => {
  for (const file of [...new Set(created)].reverse()) {
    try {
      const stat = fs.lstatSync(file)
      if (stat.isDirectory()) {
        fs.rmdirSync(file)
      } else {
        fs.unlinkSync(file)
      }
    } catch {
      // Fixture may already be absent.
    }
  }
})

test('writes through NSPasteboard once and persists only verified prompt identity', async () => {
  const files = fixture('native')
  const prompt = fs.readFileSync(files.promptPath)
  const calls = []
  const methods = [
    successfulMethod('nspasteboard', prompt, calls),
    successfulMethod('pbcopy', prompt, calls)
  ]
  const evidence = await run(files, methods)
  assert.deepEqual(calls, ['nspasteboard:write', 'nspasteboard:read'])
  assert.equal(evidence.status, 'prepared')
  assert.equal(evidence.selected_method, 'nspasteboard')
  assert.deepEqual(evidence.prompt_identity, promptIdentity(prompt, files.promptPath))
  const persisted = fs.readFileSync(files.evidencePath, 'utf8')
  assert.doesNotMatch(persisted, new RegExp(prompt.toString('utf8').slice(0, 40)))
  created.push(files.evidencePath)
})

test('falls back from mismatched NSPasteboard readback to verified pbcopy', async () => {
  const files = fixture('fallback')
  const prompt = fs.readFileSync(files.promptPath)
  const calls = []
  const methods = [
    {
      name: 'nspasteboard',
      write: async () => {
        calls.push('nspasteboard:write')
        return true
      },
      read: async () => {
        calls.push('nspasteboard:read')
        return { ok: true, stdout: Buffer.from('wrong') }
      }
    },
    successfulMethod('pbcopy', prompt, calls)
  ]
  const evidence = await run(files, methods)
  assert.deepEqual(calls, [
    'nspasteboard:write',
    'nspasteboard:read',
    'pbcopy:write',
    'pbcopy:read'
  ])
  assert.deepEqual(
    evidence.write_attempts.map(item => item.status),
    ['mismatch', 'verified']
  )
  assert.equal(evidence.selected_method, 'pbcopy')
  created.push(files.evidencePath)
})

test('blocks after both ordered clipboard methods fail', async () => {
  const files = fixture('blocked')
  const methods = [
    {
      name: 'nspasteboard',
      write: async () => false,
      read: async () => assert.fail('read after failed write')
    },
    {
      name: 'pbcopy',
      write: async () => true,
      read: async () => ({ ok: false, stdout: Buffer.alloc(0) })
    }
  ]
  const evidence = await run(files, methods)
  assert.equal(evidence.status, 'blocked')
  assert.equal(evidence.selected_method, null)
  assert.deepEqual(
    evidence.write_attempts.map(item => item.status),
    ['write_failed', 'read_failed']
  )
  created.push(files.evidencePath)
})

test('runs full prompt validation before any clipboard writer', async () => {
  const files = fixture(
    'preflight',
    id =>
      `<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:START>>>\n<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:START>>>\n{}\n<<<EXTERNAL_IMPLEMENTER_RESULT:${id}:END>>>\n<<<EXTERNAL_IMPLEMENTER_HANDOFF:${id}:END>>>\n`
  )
  let writers = 0
  await assert.rejects(
    run(files, [
      {
        name: 'nspasteboard',
        write: async () => {
          writers += 1
          return true
        },
        read: async () => ({ ok: true, stdout: Buffer.alloc(0) })
      }
    ]),
    error => error instanceof ClipboardBridgeError && error.code === 'PROMPT_CONTRACT_INVALID'
  )
  assert.equal(writers, 0)
  assert.equal(fs.existsSync(files.evidencePath), false)
})

test('rejects outside, symlink, and non-regular paths before writers', async () => {
  const outside = fixture('outside')
  const cases = [{ ...outside, evidencePath: path.join('/tmp', `${outside.id}-evidence.json`) }]
  for (const field of ['handoffPath', 'promptPath', 'evidencePath']) {
    const files = fixture(`symlink-${field}`)
    const target = `${files[field]}.real`
    if (field === 'evidencePath') {
      write(target, '{}')
    } else {
      fs.renameSync(files[field], target)
      created.push(target)
    }
    fs.symlinkSync(target, files[field])
    created.push(files[field])
    cases.push(files)
  }
  const directory = fixture('directory')
  fs.unlinkSync(directory.promptPath)
  fs.mkdirSync(directory.promptPath)
  cases.push(directory)
  let writers = 0
  for (const files of cases) {
    await assert.rejects(
      run(files, [
        {
          name: 'nspasteboard',
          write: async () => {
            writers += 1
            return true
          },
          read: async () => ({ ok: true, stdout: Buffer.alloc(0) })
        }
      ]),
      error => error.code === 'NONCANONICAL_DISPATCH_PATH'
    )
  }
  assert.equal(writers, 0)
})

test('default adapters use hard timeouts and keep prompt body out of argv', async () => {
  const calls = []
  const fakeSpawn = (executable, args, options) => {
    calls.push({ executable, args, options })
    return { status: 0, stdout: Buffer.from('readback') }
  }
  const [native, pbcopy] = createClipboardMethods({ spawnSyncImpl: fakeSpawn })
  const prompt = Buffer.from('fixture prompt body')
  const promptPath = path.join(dispatchDir, 'adapter-fixture-prompt.md')
  assert.equal(native.write({ prompt, promptPath }), true)
  native.read()
  assert.equal(pbcopy.write({ prompt, promptPath }), true)
  pbcopy.read()
  assert.deepEqual(
    calls.map(item => item.executable),
    ['/usr/bin/osascript', '/usr/bin/osascript', '/usr/bin/pbcopy', '/usr/bin/pbpaste']
  )
  assert.ok(calls.every(item => item.options.timeout === 5000))
  assert.equal(calls[0].args.includes(prompt.toString()), false)
  assert.equal(calls[2].args.length, 0)
  assert.equal(calls[2].options.input, prompt)
})

test('formal handoff validation accepts visible delivery and rejects headless transport', () => {
  const visible = fixture('handoff-valid')
  const valid = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, '.codex/skills/dispatch-task/scripts/validate-handoff.mjs'),
      visible.handoffPath
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.equal(valid.status, 0, valid.stderr || valid.stdout)
  const headless = fixture('handoff-headless')
  headless.handoff.external_contract.target_session = 'headless_new_session'
  headless.handoff.external_contract.prompt_transport = 'zcode_headless_cli'
  write(headless.handoffPath, headless.handoff)
  const invalid = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, '.codex/skills/dispatch-task/scripts/validate-handoff.mjs'),
      headless.handoffPath
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.notEqual(invalid.status, 0)
})
