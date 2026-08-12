#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
export const ZCODE_CLI_PATH = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs'
export const ZCODE_CLI_VERSION = '0.15.2'
export const ZCODE_PROMPT_INSTRUCTION = 'Use the file-reading tool to read the canonical dispatch prompt at {PROMPT_PATH}, execute it exactly, and return the contracted result.'
export const MAX_ATTEMPTS = 1
const PREFLIGHT_TIMEOUT_MS = 10000
const TERMINATION_GRACE_MS = 1000
const MAX_RESPONSE_BYTES = 65536
const MAX_PROCESS_OUTPUT_BYTES = 1048576
const MATCH_STRATEGY = 'cli_adapter_base_url_model_exact'
const PROVIDER_ENV = Object.freeze({ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' })
const DISPATCH_DIRECTORY = path.resolve(process.cwd(), '.tmp/dispatch-task')
const VALIDATE_HANDOFF = new URL('./validate-handoff.mjs', import.meta.url)
const VALIDATE_PROMPT = new URL('./validate-zcode-prompt.mjs', import.meta.url)
const BANNED_ARGUMENTS = new Set(['--attach', '--settings', '--max-turns'])
export const CREDENTIAL_ERROR_CODES = Object.freeze([
  'CREDENTIAL_CLI_CONFIG_INVALID', 'CREDENTIAL_MODEL_INVALID', 'CREDENTIAL_CLI_PROVIDER_NOT_FOUND',
  'CREDENTIAL_PROVIDER_KIND_UNSUPPORTED', 'CREDENTIAL_BASE_URL_INVALID', 'CREDENTIAL_DESKTOP_CONFIG_INVALID',
  'CREDENTIAL_PROVIDER_NOT_FOUND', 'CREDENTIAL_MODEL_MISMATCH', 'CREDENTIAL_PROVIDER_AMBIGUOUS',
  'CREDENTIAL_KEY_MISSING'
])
export class HeadlessBridgeError extends Error { constructor(code) { super(code); this.code = code } }
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isTraceValue = value => nonEmpty(value) && /^[A-Za-z0-9_-]{8,160}$/.test(value)
const sanitizedErrorType = value => (typeof value === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(value) ? value : null)
const cliConfigPath = () => path.join(os.homedir(), '.zcode', 'cli', 'config.json')
const desktopConfigPath = () => path.join(os.homedir(), '.zcode', 'v2', 'config.json')
const sessionDbPath = () => path.join(os.homedir(), '.zcode', 'cli', 'db', 'db.sqlite')
export function parseHeadlessBridgeArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!['--handoff', '--prompt', '--receipt'].includes(name) || !value || values[name]) {
      throw new HeadlessBridgeError('INVALID_ARGUMENTS')
    }
    values[name] = value
  }
  if (args.length !== 6) { throw new HeadlessBridgeError('INVALID_ARGUMENTS') }
  return { handoffPath: values['--handoff'], promptPath: values['--prompt'], receiptPath: values['--receipt'] }
}
export function isCanonicalDispatchPath(candidate, dispatchRunId) {
  const absolute = path.resolve(candidate)
  return path.dirname(absolute) === DISPATCH_DIRECTORY && path.basename(absolute).includes(dispatchRunId)
}
const noncanonical = () => { throw new HeadlessBridgeError('NONCANONICAL_DISPATCH_PATH') }
function checkedStat(absolute, predicate, allowMissing = false) {
  try {
    const stat = fs.lstatSync(absolute)
    if (!predicate(stat) || stat.isSymbolicLink() || fs.realpathSync(absolute) !== absolute) { noncanonical() }
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') { return absolute }
    if (error instanceof HeadlessBridgeError) { throw error }
    noncanonical()
  }
  return absolute
}
function directDispatchPath(candidate) {
  const absolute = path.resolve(candidate)
  if (path.dirname(absolute) !== DISPATCH_DIRECTORY) { noncanonical() }
  return absolute
}
const assertDispatchDirectory = () => checkedStat(DISPATCH_DIRECTORY, stat => stat.isDirectory())
const assertRegularDispatchFile = candidate => checkedStat(directDispatchPath(candidate), stat => stat.isFile())
const assertReceiptDestination = candidate => checkedStat(directDispatchPath(candidate), stat => stat.isFile(), true)
function readHandoff(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new HeadlessBridgeError('HANDOFF_INVALID')
  }
}
export function validateHeadlessHandoff(handoff) {
  const external = handoff?.external_contract ?? handoff?.zcode_contract ?? {}
  const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
  const valid = ['external_implementer', 'zcode_external'].includes(handoff?.implementation_mode) &&
    nonEmpty(handoff?.dispatch_run_id) && provider === 'zcode' &&
    external.prompt_transport === 'zcode_headless_cli' && external.headless_cli_required === true &&
    external.canonical_prompt_file_reference_required === true && external.credential_source === 'desktop_custom_provider' &&
    external.credential_persistence_forbidden === true && external.clipboard_ui_fallback_forbidden === true &&
    external.provider_execution_receipt_required === true
  const permissionMode = external.headless_permission_mode ?? 'edit'
  if (!valid || !['edit', 'yolo'].includes(permissionMode)) {
    throw new HeadlessBridgeError('HANDOFF_INVALID')
  }
  return { dispatchRunId: handoff.dispatch_run_id, permissionMode }
}
export function validatePromptContract({ handoffPath, promptPath, spawnSyncImpl = spawnSync }) {
  for (const [script, code] of [[VALIDATE_HANDOFF, 'HANDOFF_CONTRACT_INVALID'], [VALIDATE_PROMPT, 'PROMPT_CONTRACT_INVALID']]) {
    const result = spawnSyncImpl(process.execPath, [script.pathname, handoffPath, ...(script === VALIDATE_PROMPT ? [promptPath] : [])], { stdio: 'ignore', timeout: PREFLIGHT_TIMEOUT_MS })
    if (result.error || result.status !== 0) {
      throw new HeadlessBridgeError(code)
    }
  }
}
async function readConfig(file, code, readFile) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'))
    if (!isObject(value)) { throw new Error('invalid') }
    return value
  } catch {
    throw new HeadlessBridgeError(code)
  }
}
function normalizeBaseURL(value) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) { throw new Error('invalid') }
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${pathname === '/' ? '' : pathname}`
  } catch {
    throw new HeadlessBridgeError('CREDENTIAL_BASE_URL_INVALID')
  }
}
const providerModels = provider => {
  if (Array.isArray(provider?.models)) {
    return provider.models.map(model => typeof model === 'string' ? model : model?.id).filter(nonEmpty)
  }
  return isObject(provider?.models) ? Object.keys(provider.models) : []
}
export function normalizeProviderAliasEnv(providerAlias) {
  if (typeof providerAlias !== 'string') {
    throw new HeadlessBridgeError('CREDENTIAL_MODEL_INVALID')
  }
  const normalized = providerAlias
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  if (!normalized) {
    throw new HeadlessBridgeError('CREDENTIAL_MODEL_INVALID')
  }
  return `${normalized}_API_KEY`
}
const compatibleDesktopKind = (cliKind, desktopKind) =>
  cliKind === desktopKind || (cliKind === 'openai-compatible' && desktopKind === 'openai')
export async function resolveDesktopCustomProvider({ readFile = fs.promises.readFile } = {}) {
  const cli = await readConfig(cliConfigPath(), 'CREDENTIAL_CLI_CONFIG_INVALID', readFile)
  const modelMain = cli.model?.main
  const separator = typeof modelMain === 'string' ? modelMain.indexOf('/') : -1
  if (separator < 1 || separator === modelMain.length - 1 || modelMain !== modelMain.trim()) {
    throw new HeadlessBridgeError('CREDENTIAL_MODEL_INVALID')
  }
  const providerRef = modelMain.slice(0, separator), model = modelMain.slice(separator + 1)
  if (!nonEmpty(providerRef) || !nonEmpty(model)) { throw new HeadlessBridgeError('CREDENTIAL_MODEL_INVALID') }
  const selected = cli.provider?.[providerRef]
  if (!isObject(selected)) { throw new HeadlessBridgeError('CREDENTIAL_CLI_PROVIDER_NOT_FOUND') }
  const cliProviderKind = selected.kind
  if (![...Object.keys(PROVIDER_ENV), 'openai-compatible'].includes(cliProviderKind)) {
    throw new HeadlessBridgeError('CREDENTIAL_PROVIDER_KIND_UNSUPPORTED')
  }
  const injectedEnv = cliProviderKind === 'openai-compatible' ? normalizeProviderAliasEnv(providerRef) : PROVIDER_ENV[cliProviderKind]
  const baseURL = normalizeBaseURL(selected.options?.baseURL)
  const desktop = await readConfig(desktopConfigPath(), 'CREDENTIAL_DESKTOP_CONFIG_INVALID', readFile)
  if (!isObject(desktop.provider)) { throw new HeadlessBridgeError('CREDENTIAL_DESKTOP_CONFIG_INVALID') }
  const endpointMatches = Object.values(desktop.provider).filter(candidate =>
    isObject(candidate) && compatibleDesktopKind(cliProviderKind, candidate.kind) &&
      normalizeBaseURL(candidate.options?.baseURL) === baseURL
  )
  if (!endpointMatches.length) { throw new HeadlessBridgeError('CREDENTIAL_PROVIDER_NOT_FOUND') }
  const matches = endpointMatches.filter(candidate => providerModels(candidate).includes(model))
  if (!matches.length) { throw new HeadlessBridgeError('CREDENTIAL_MODEL_MISMATCH') }
  if (matches.length !== 1) { throw new HeadlessBridgeError('CREDENTIAL_PROVIDER_AMBIGUOUS') }
  const secret = matches[0].options?.apiKey
  if (!nonEmpty(secret)) { throw new HeadlessBridgeError('CREDENTIAL_KEY_MISSING') }
  return {
    secret, providerAlias: providerRef, cliProviderKind, desktopProviderKind: matches[0].kind,
    model, injectedEnv, matchStrategy: MATCH_STRATEGY
  }
}
export const buildPromptInstruction = promptPath =>
  ZCODE_PROMPT_INSTRUCTION.replace('{PROMPT_PATH}', path.resolve(promptPath))
export function buildCliArguments(promptPath, cwd, permissionMode = 'edit') {
  if (!['edit', 'yolo'].includes(permissionMode)) { throw new HeadlessBridgeError('HANDOFF_INVALID') }
  const args = ['--prompt', buildPromptInstruction(promptPath), '--cwd', cwd, '--mode', permissionMode, '--json', '--no-color']
  if (args.some(value => BANNED_ARGUMENTS.has(value))) {
    throw new HeadlessBridgeError('UNSUPPORTED_CLI_ARGUMENT')
  }
  return args
}
export function installOperatorCancellation(signalSource = process) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const event of ['SIGINT', 'SIGTERM']) { signalSource.on(event, abort) }
  return { signal: controller.signal, dispose: () => {
    for (const event of ['SIGINT', 'SIGTERM']) { signalSource.removeListener(event, abort) }
  } }
}
export function runCliProcess({ args, cwd, env, signal, spawnImpl = spawn, killImpl = process.kill, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout }) {
  return new Promise(resolve => {
    let child
    const stdout = [], stderr = []
    let bytes = 0, settled = false, cleanupActive = false, deferredClose, killTimer
    const state = { processGroup: true, started: false, cancelled: false, termSent: false, killSent: false, cleanupStatus: 'not_needed' }
    const finish = (exitCode, processSignal, spawnError = false) => {
      if (settled || cleanupActive) { deferredClose = cleanupActive ? { exitCode, spawnError } : deferredClose; return }
      settled = true
      clearTimeoutImpl(killTimer)
      signal?.removeEventListener('abort', cancel)
      resolve({ exitCode, signal: processSignal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), spawnError, ...state })
    }
    const signalGroup = signal => {
      try { killImpl(-child.pid, signal); return true } catch { return false }
    }
    const cancel = () => {
      if (settled || cleanupActive) { return }
      state.cancelled = cleanupActive = true
      state.termSent = signalGroup('SIGTERM')
      state.cleanupStatus = state.termSent ? 'term_sent' : 'failed'
      killTimer = setTimeoutImpl(() => {
        state.killSent = signalGroup('SIGKILL')
        state.cleanupStatus = state.termSent && state.killSent ? 'term_kill_sent' : 'failed'
        cleanupActive = false
        finish(deferredClose?.exitCode ?? null, 'SIGKILL', state.cleanupStatus === 'failed' || deferredClose?.spawnError === true)
      }, TERMINATION_GRACE_MS)
    }
    if (signal?.aborted) { state.cancelled = true; finish(null, null); return }
    try {
      child = spawnImpl(process.execPath, [ZCODE_CLI_PATH, ...args], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
      state.started = true
    } catch {
      finish(null, null, true)
      return
    }
    const append = target => chunk => {
      bytes += chunk.length
      if (bytes > MAX_PROCESS_OUTPUT_BYTES) {
        state.killSent = signalGroup('SIGKILL')
        state.cleanupStatus = state.killSent ? 'kill_sent' : 'failed'
        finish(null, 'SIGKILL', true)
        return
      }
      target.push(Buffer.from(chunk))
    }
    child.stdout.on('data', append(stdout))
    child.stderr.on('data', append(stderr))
    child.once('error', () => finish(null, null, true))
    child.once('close', finish)
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) { cancel() }
  })
}
function sqliteJson(query, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('/usr/bin/sqlite3', ['-readonly', '-json', sessionDbPath(), query], { encoding: 'utf8', timeout: 3000, maxBuffer: MAX_RESPONSE_BYTES })
  if (result.error || result.status !== 0) { return [] }
  try {
    const parsed = JSON.parse(result.stdout || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
export async function readReadonlySessionEvidence({ traceId, spawnSyncImpl = spawnSync } = {}) {
  if (!isTraceValue(traceId) || !fs.existsSync(sessionDbPath())) { return null }
  const session = sqliteJson(`SELECT id, trace_id FROM "session" WHERE trace_id='${traceId}' ORDER BY rowid DESC LIMIT 1;`, spawnSyncImpl)[0]
  if (!session || session.trace_id !== traceId || !isTraceValue(session.id)) { return null }
  const columns = new Set(sqliteJson('PRAGMA table_info(model_usage);', spawnSyncImpl).map(item => item.name))
  const safe = ['session_id', 'trace_id', 'status', 'error_type', 'retryable', 'error_code', 'provider_code', 'error_message', 'message', 'error'].filter(name => columns.has(name))
  const usage = safe.length ? sqliteJson(`SELECT ${safe.join(', ')} FROM model_usage WHERE session_id='${session.id}' AND trace_id='${traceId}' ORDER BY rowid DESC LIMIT 1;`, spawnSyncImpl)[0] : null
  return {
    sessionId: session.id,
    traceId,
    modelUsageFound: Boolean(usage),
    modelUsageStatus: ['error', 'success'].includes(usage?.status) ? usage.status : null,
    errorType: sanitizedErrorType(usage?.error_type),
    retryable: usage?.retryable === 1 ? true : usage?.retryable === 0 ? false : null,
    classificationText: [usage?.error_code, usage?.provider_code, usage?.error_message, usage?.message, usage?.error].filter(Boolean).join(' ')
  }
}
function parseFinalJson(stdout) {
  try {
    const value = JSON.parse(stdout.trim())
    return isObject(value) ? value : null
  } catch {
    return null
  }
}
function hasOfficialFinalJsonShape(value) {
  if (!isObject(value)) { return false }
  const allowed = new Set(['sessionId', 'traceId', 'turnId', 'response', 'usage', 'eventCount', 'projection'])
  const projection = value.projection
  return (
    Object.keys(value).every(key => allowed.has(key)) &&
    (value.turnId === undefined || isTraceValue(value.turnId)) &&
    typeof value.response === 'string' &&
    (value.usage === undefined || isObject(value.usage)) &&
    Number.isSafeInteger(value.eventCount) &&
    value.eventCount >= 0 &&
    isObject(projection) &&
    nonEmpty(projection.status) &&
    Number.isFinite(projection.turnCount) &&
    Number.isFinite(projection.totalTokenCount) &&
    (projection.contextUsed === null || Number.isFinite(projection.contextUsed)) &&
    (projection.contextWindow === null || Number.isFinite(projection.contextWindow))
  )
}
function traceFromStderr(stderr) {
  const match = String(stderr).match(/\(traceId:\s*([A-Za-z0-9_-]{8,160})\)/)
  return match?.[1] ?? null
}
export function classifyFailure(result, dbEvidence) {
  const text = `${result.stderr ?? ''} ${dbEvidence?.errorType ?? ''} ${dbEvidence?.classificationText ?? ''}`.toLowerCase()
  const traceSeen = Boolean(traceFromStderr(result.stderr))
  if (result.cancelled && result.cleanupStatus === 'failed') { return { classification: 'process_group_cleanup_failed', providerStatus: 'blocked', retryable: false } }
  if (result.cancelled) { return { classification: 'operator_cancelled', providerStatus: 'blocked', retryable: false } }
  if (result.spawnError) {
    return { classification: 'cli_process_failed', providerStatus: 'not_started', retryable: false }
  }
  if (/auth_failed|\b401\b|unauthorized/.test(text)) {
    return { classification: 'credential_auth_failed', providerStatus: 'blocked', retryable: false }
  }
  if (/\b1113\b|no[- ]?plan|no[- ]?balance|insufficient balance|entitlement/.test(text)) { return { classification: 'provider_no_entitlement', providerStatus: 'blocked', retryable: false } }
  if (/unknown option|unsupported option|invalid option/.test(text)) { return { classification: 'unsupported_cli_contract', providerStatus: 'blocked', retryable: false } }
  if (dbEvidence?.retryable === false) {
    return { classification: 'provider_runtime_failed', providerStatus: 'failed', retryable: false }
  }
  if (/\b429\b|rate limit/.test(text) || dbEvidence?.retryable === true) {
    return { classification: 'provider_rate_limited', providerStatus: 'failed', retryable: true }
  }
  if (/econn|network|fetch failed|socket|timed out/.test(text)) { return { classification: 'transport_network_failed', providerStatus: dbEvidence || traceSeen ? 'failed' : 'not_started', retryable: true } }
  return { classification: 'provider_runtime_failed', providerStatus: dbEvidence || traceSeen ? 'failed' : 'not_started', retryable: false }
}
function atomicWrite(file, value) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`)
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.renameSync(temporary, file)
  } finally {
    if (fs.existsSync(temporary)) {
      fs.rmSync(temporary, { force: true })
    }
  }
}
function baseReceipt({ dispatchRunId, promptPath, identity, cliVersion, args, now }) {
  return {
    dispatch_run_id: dispatchRunId,
    status: 'blocked',
    transport: { kind: 'zcode_headless_cli', status: 'not_started', cli_path: ZCODE_CLI_PATH, cli_version: cliVersion, arguments: args, permission_mode: args[args.indexOf('--mode') + 1], fallback: 'none' },
    prompt_identity: { path: promptPath, sha256: identity.sha256, bytes: identity.bytes, verified_before_after: false },
    credential: { source: 'desktop_custom_provider', cli_provider_kind: null, desktop_provider_kind: null, model: null, injected_env: null, match_strategy: MATCH_STRATEGY, network_exchange: false, resolved_in_memory: false, persisted: false },
    process: { attempts: 0, max_attempts: MAX_ATTEMPTS, timeout_ms: null, total_timeout_ms: null, exit_code: null, signal: null, final_json_parsed: false, timed_out: false, termination_scope: 'process_group', term_sent: false, kill_sent: false, cleanup_status: 'not_needed' },
    session: { sessionId: null, traceId: null, source: 'none' },
    provider_execution: {
      status: 'not_started',
      classification: null,
      retryable: false,
      correlation: { session_found: false, model_usage_found: false, model_usage_status: null, error_type: null }
    },
    redaction: {
      status: 'passed',
      secret_persisted: false,
      prompt_body_persisted: false,
      raw_stdout_persisted: false,
      raw_stderr_persisted: false,
      provider_request_id_persisted: false
    },
    created_at: now(),
    sent_at: null
  }
}
export async function runHeadlessBridge({
  handoffPath,
  promptPath,
  receiptPath,
  credentialResolver = resolveDesktopCustomProvider,
  versionResolver = () => spawnSync(process.execPath, [ZCODE_CLI_PATH, '--version'], { encoding: 'utf8', timeout: 5000 }),
  cliRunner = runCliProcess,
  sessionEvidenceReader = readReadonlySessionEvidence,
  signal,
  now = () => new Date().toISOString(),
  writeReceipt = atomicWrite
}) {
  assertDispatchDirectory()
  const absoluteHandoff = assertRegularDispatchFile(handoffPath)
  const absolutePrompt = assertRegularDispatchFile(promptPath)
  const absoluteReceipt = assertReceiptDestination(receiptPath)
  const handoff = readHandoff(absoluteHandoff)
  const { dispatchRunId, permissionMode } = validateHeadlessHandoff(handoff)
  const cwd = path.resolve(process.cwd())
  if (![absoluteHandoff, absolutePrompt, absoluteReceipt].every(file => isCanonicalDispatchPath(file, dispatchRunId))) {
    throw new HeadlessBridgeError('NONCANONICAL_DISPATCH_PATH')
  }
  validatePromptContract({ handoffPath: absoluteHandoff, promptPath: absolutePrompt })
  assertRegularDispatchFile(absoluteHandoff)
  assertRegularDispatchFile(absolutePrompt)
  assertReceiptDestination(absoluteReceipt)
  const prompt = fs.readFileSync(absolutePrompt)
  const identity = { sha256: sha256(prompt), bytes: prompt.length }
  const versionResult = await versionResolver()
  const cliVersion = String(versionResult?.stdout ?? '').trim()
  const args = buildCliArguments(absolutePrompt, cwd, permissionMode)
  const receipt = baseReceipt({ dispatchRunId, promptPath: absolutePrompt, identity, cliVersion, args, now })
  const block = (classification, providerStatus = 'not_started', retryable = false) => {
    receipt.provider_execution = { ...receipt.provider_execution, status: providerStatus, classification, retryable }
    writeReceipt(absoluteReceipt, receipt)
    return receipt
  }
  if (versionResult?.error || versionResult?.status !== 0 || cliVersion !== ZCODE_CLI_VERSION) {
    return block('unsupported_cli_version', 'blocked')
  }
  let resolvedCredential
  try {
    resolvedCredential = await credentialResolver()
    const expectedEnv = resolvedCredential?.cliProviderKind === 'openai-compatible'
      ? normalizeProviderAliasEnv(resolvedCredential.providerAlias)
      : PROVIDER_ENV[resolvedCredential?.cliProviderKind]
    if (!isObject(resolvedCredential) || !nonEmpty(resolvedCredential.secret) ||
      !compatibleDesktopKind(resolvedCredential.cliProviderKind, resolvedCredential.desktopProviderKind) ||
      expectedEnv !== resolvedCredential.injectedEnv ||
      !nonEmpty(resolvedCredential.model) || resolvedCredential.matchStrategy !== MATCH_STRATEGY) {
      throw new Error('invalid credential resolution')
    }
  } catch (error) {
    const known = error instanceof HeadlessBridgeError && CREDENTIAL_ERROR_CODES.includes(error.code)
    return block(known ? error.code.toLowerCase() : 'credential_resolution_failed', 'blocked')
  }
  receipt.credential = {
    ...receipt.credential,
    cli_provider_kind: resolvedCredential.cliProviderKind,
    desktop_provider_kind: resolvedCredential.desktopProviderKind,
    model: resolvedCredential.model,
    injected_env: resolvedCredential.injectedEnv,
    resolved_in_memory: true
  }
  const childEnv = {}
  for (const key of ['HOME', 'PATH', 'SHELL', 'TMPDIR', 'USER', 'LANG', 'LC_ALL', 'TERM']) {
    if (process.env[key] !== undefined) { childEnv[key] = process.env[key] }
  }
  childEnv[resolvedCredential.injectedEnv] = resolvedCredential.secret
  const result = await cliRunner({ args, cwd, env: childEnv, signal })
  receipt.process = {
    ...receipt.process, attempts: result.started === false ? 0 : 1, exit_code: result.exitCode, signal: result.signal,
    timed_out: false, term_sent: result.termSent === true, kill_sent: result.killSent === true,
    cleanup_status: ['not_needed', 'term_sent', 'kill_sent', 'term_kill_sent', 'failed'].includes(result.cleanupStatus) ? result.cleanupStatus : 'not_needed'
  }
  receipt.transport.status = 'attempted'
  if (result.exitCode === 0 && !result.cancelled && !result.spawnError) {
    const finalJson = parseFinalJson(result.stdout)
    receipt.process.final_json_parsed = Boolean(finalJson && hasOfficialFinalJsonShape(finalJson))
    if (!receipt.process.final_json_parsed) { return block('malformed_final_json', 'blocked') }
    if (!isTraceValue(finalJson.sessionId)) { return block('missing_session_id', 'blocked') }
    if (!isTraceValue(finalJson.traceId)) { return block('missing_trace_id', 'blocked') }
    assertRegularDispatchFile(absolutePrompt)
    const after = fs.readFileSync(absolutePrompt)
    if (sha256(after) !== identity.sha256 || after.length !== identity.bytes) { return block('prompt_identity_mismatch', 'blocked') }
    receipt.status = 'sent'
    receipt.sent_at = now()
    receipt.transport.status = 'accepted'
    receipt.prompt_identity.verified_before_after = true
    receipt.session = { sessionId: finalJson.sessionId, traceId: finalJson.traceId, source: 'cli_final_json' }
    receipt.provider_execution = {
      status: 'delivered', classification: 'completed', retryable: false,
      correlation: { session_found: true, model_usage_found: false, model_usage_status: null, error_type: null }
    }
    writeReceipt(absoluteReceipt, receipt)
    return receipt
  }
  if (result.cancelled) {
    const failure = classifyFailure(result)
    return block(failure.classification, failure.providerStatus, failure.retryable)
  }
  const stderrTrace = traceFromStderr(result.stderr)
  const db = stderrTrace ? await sessionEvidenceReader({ traceId: stderrTrace }) : null
  if (db?.traceId === stderrTrace && nonEmpty(db.sessionId)) {
    receipt.transport.status = 'accepted'
    receipt.session = { sessionId: db.sessionId, traceId: db.traceId, source: 'readonly_zcode_db' }
    receipt.provider_execution.correlation = {
      session_found: true, model_usage_found: db.modelUsageFound === true,
      model_usage_status: ['error', 'success'].includes(db.modelUsageStatus) ? db.modelUsageStatus : null,
      error_type: sanitizedErrorType(db.errorType)
    }
  }
  const failure = classifyFailure(result, db)
  if (receipt.transport.status === 'accepted' && failure.providerStatus === 'not_started') { failure.providerStatus = 'failed' }
  return block(failure.classification, failure.providerStatus, failure.retryable)
}
async function main() {
  const cancellation = installOperatorCancellation()
  try {
    const inputs = parseHeadlessBridgeArgs(process.argv.slice(2))
    const receipt = await runHeadlessBridge({ ...inputs, signal: cancellation.signal })
    const output = { status: receipt.status, receipt_path: path.resolve(inputs.receiptPath) }
    console.log(JSON.stringify(output))
    if (receipt.status !== 'sent') { process.exitCode = 1 }
  } catch (error) {
    console.error(JSON.stringify({ status: 'blocked', code: error instanceof HeadlessBridgeError ? error.code : 'HEADLESS_BRIDGE_FAILED' }))
    process.exitCode = 1
  } finally { cancellation.dispose() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { main() }
