#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const DISPATCH_DIRECTORY = path.resolve(process.cwd(), '.tmp/dispatch-task')
const VALIDATE_HANDOFF = new URL('./validate-handoff.mjs', import.meta.url)
const VALIDATE_PROMPT = new URL('./validate-zcode-prompt.mjs', import.meta.url)
const COMMAND_TIMEOUT_MS = 5000
const MAX_CLIPBOARD_BYTES = 32 * 1024 * 1024
const METHODS = ['nspasteboard', 'pbcopy']
const NSPASTEBOARD_WRITE = `ObjC.import('AppKit');ObjC.import('Foundation');function run(a){const d=$.NSData.dataWithContentsOfFile($(a[0]));if(!d)throw Error('read');const s=$.NSString.alloc.initWithDataEncoding(d,$.NSUTF8StringEncoding);const p=$.NSPasteboard.generalPasteboard;p.clearContents;if(!p.setStringForType(s,$.NSPasteboardTypeString))throw Error('write')}`
const NSPASTEBOARD_READ = `ObjC.import('AppKit');ObjC.import('Foundation');function run(){const s=$.NSPasteboard.generalPasteboard.stringForType($.NSPasteboardTypeString);if(!s)return;$.NSFileHandle.fileHandleWithStandardOutput.writeData(s.dataUsingEncoding($.NSUTF8StringEncoding))}`

export class ClipboardBridgeError extends Error {
  constructor(code) { super(code); this.code = code }
}
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
export const countUtf8Lines = text => text.split(/\r\n|\n|\r/).length
export function promptIdentity(buffer, promptPath) {
  const text = buffer.toString('utf8')
  if (!buffer.length || !Buffer.from(text, 'utf8').equals(buffer)) {
    throw new ClipboardBridgeError('PROMPT_NOT_UTF8')
  }
  return { path: path.resolve(promptPath), sha256: sha256(buffer), bytes: buffer.length, lines: countUtf8Lines(text) }
}
const failCanonical = () => { throw new ClipboardBridgeError('NONCANONICAL_DISPATCH_PATH') }
function assertDispatchDirectory() {
  try {
    const stat = fs.lstatSync(DISPATCH_DIRECTORY)
    if (stat.isSymbolicLink() || !stat.isDirectory() ||
      fs.realpathSync(DISPATCH_DIRECTORY) !== DISPATCH_DIRECTORY) {
      failCanonical()
    }
  } catch (error) {
    if (error instanceof ClipboardBridgeError) { throw error }
    failCanonical()
  }
}
function directDispatchPath(candidate) {
  const absolute = path.resolve(candidate)
  if (path.dirname(absolute) !== DISPATCH_DIRECTORY) { failCanonical() }
  return absolute
}
function checkedPath(candidate, predicate, allowMissing = false) {
  const absolute = directDispatchPath(candidate)
  try {
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink() || !predicate(stat) || fs.realpathSync(absolute) !== absolute) { failCanonical() }
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') { return absolute }
    if (error instanceof ClipboardBridgeError) { throw error }
    failCanonical()
  }
  return absolute
}
const regularFile = candidate => checkedPath(candidate, stat => stat.isFile())
const evidenceDestination = candidate => checkedPath(candidate, stat => stat.isFile(), true)
function parseHandoff(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw new ClipboardBridgeError('HANDOFF_INVALID') }
}
function validateVisibleContract(handoff) {
  const external = handoff?.external_contract ?? handoff?.zcode_contract ?? {}
  const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
  if (!['external_implementer', 'zcode_external'].includes(handoff?.implementation_mode) ||
    provider !== 'zcode' || external.target_session !== 'current_open_chat' ||
    external.prompt_transport !== 'clipboard_paste' || external.clipboard_bridge_required !== true ||
    external.clipboard_bridge_evidence_required !== true || external.computer_use_required !== true) {
    throw new ClipboardBridgeError('HANDOFF_INVALID')
  }
  return handoff.dispatch_run_id
}
function runValidators(handoffPath, promptPath, spawnSyncImpl) {
  for (const [script, code, args] of [
    [VALIDATE_HANDOFF, 'HANDOFF_CONTRACT_INVALID', [handoffPath]],
    [VALIDATE_PROMPT, 'PROMPT_CONTRACT_INVALID', [handoffPath, promptPath]]
  ]) {
    const result = spawnSyncImpl(process.execPath, [script.pathname, ...args], {
      stdio: 'ignore',
      timeout: COMMAND_TIMEOUT_MS
    })
    if (result.error || result.status !== 0) { throw new ClipboardBridgeError(code) }
  }
}
function command(spawnSyncImpl, executable, args, options = {}) {
  const result = spawnSyncImpl(executable, args, {
    encoding: null,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_CLIPBOARD_BYTES,
    ...options
  })
  return { ok: !result.error && result.status === 0, stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '') }
}
export function createClipboardMethods({ spawnSyncImpl = spawnSync } = {}) {
  return [
    {
      name: 'nspasteboard',
      write: ({ promptPath }) => command(spawnSyncImpl, '/usr/bin/osascript', ['-l', 'JavaScript', '-e', NSPASTEBOARD_WRITE, promptPath]).ok,
      read: () => command(spawnSyncImpl, '/usr/bin/osascript', ['-l', 'JavaScript', '-e', NSPASTEBOARD_READ])
    },
    {
      name: 'pbcopy',
      write: ({ prompt }) => command(spawnSyncImpl, '/usr/bin/pbcopy', [], { input: prompt }).ok,
      read: () => command(spawnSyncImpl, '/usr/bin/pbpaste', [])
    }
  ]
}
function atomicWrite(file, value) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`)
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  try { fs.renameSync(temporary, file) } finally { if (fs.existsSync(temporary)) { fs.rmSync(temporary, { force: true }) } }
}
export function parseClipboardBridgeArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1]
    if (!['--handoff', '--prompt', '--evidence'].includes(key) || !value || values[key]) {
      throw new ClipboardBridgeError('INVALID_ARGUMENTS')
    }
    values[key] = value
  }
  if (args.length !== 6) { throw new ClipboardBridgeError('INVALID_ARGUMENTS') }
  return { handoffPath: values['--handoff'], promptPath: values['--prompt'], evidencePath: values['--evidence'] }
}
export async function runClipboardBridge({
  handoffPath,
  promptPath,
  evidencePath,
  methods,
  spawnSyncImpl = spawnSync,
  now = () => new Date().toISOString(),
  writeEvidence = atomicWrite
}) {
  assertDispatchDirectory()
  const handoffFile = regularFile(handoffPath)
  const promptFile = regularFile(promptPath)
  const evidenceFile = evidenceDestination(evidencePath)
  const handoff = parseHandoff(handoffFile)
  const dispatchRunId = validateVisibleContract(handoff)
  if (![handoffFile, promptFile, evidenceFile].every(file => path.basename(file).includes(dispatchRunId))) {
    failCanonical()
  }
  runValidators(handoffFile, promptFile, spawnSyncImpl)
  regularFile(handoffFile)
  regularFile(promptFile)
  evidenceDestination(evidenceFile)
  const prompt = fs.readFileSync(promptFile)
  const identity = promptIdentity(prompt, promptFile)
  const writeAttempts = []
  let selectedMethod = null
  for (const method of methods ?? createClipboardMethods({ spawnSyncImpl })) {
    if (method.name !== METHODS[writeAttempts.length]) {
      throw new ClipboardBridgeError('CLIPBOARD_METHOD_INVALID')
    }
    const attempt = { method: method.name, status: 'write_failed', readback_verified: false, attempted_at: now() }
    try {
      if (await method.write({ prompt, promptPath: promptFile })) {
        const readback = await method.read()
        attempt.status = !readback?.ok ? 'read_failed' : 'mismatch'
        if (readback?.ok) {
          const observed = promptIdentity(readback.stdout, promptFile)
          attempt.readback_verified = observed.sha256 === identity.sha256 &&
            observed.bytes === identity.bytes && observed.lines === identity.lines
          if (attempt.readback_verified) {
            attempt.status = 'verified'
            selectedMethod = method.name
          }
        }
      }
    } catch {
      attempt.status = 'method_failed'
    }
    writeAttempts.push(attempt)
    if (selectedMethod) { break }
  }
  const verifiedAt = selectedMethod ? now() : null
  const evidence = {
    dispatch_run_id: dispatchRunId,
    status: selectedMethod ? 'prepared' : 'blocked',
    prompt_identity: identity,
    write_attempts: writeAttempts,
    selected_method: selectedMethod,
    readback_verified: Boolean(selectedMethod),
    created_at: now(),
    verified_at: verifiedAt
  }
  writeEvidence(evidenceFile, evidence)
  return evidence
}
async function main() {
  try {
    const inputs = parseClipboardBridgeArgs(process.argv.slice(2))
    const evidence = await runClipboardBridge(inputs)
    console.log(JSON.stringify({ status: evidence.status, evidence_path: path.resolve(inputs.evidencePath) }))
    if (evidence.status !== 'prepared') { process.exitCode = 1 }
  } catch (error) {
    console.error(JSON.stringify({ status: 'blocked', code: error instanceof ClipboardBridgeError ? error.code : 'CLIPBOARD_BRIDGE_FAILED' }))
    process.exitCode = 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { main() }
