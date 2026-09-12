import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineLeaf } from '../../../packages/miniprogram-e2e/src/contracts/index.mjs'

const MAX_LOG_BYTES = 512 * 1024
const DEFAULT_TIMEOUT_MS = 240_000

/**
 * Project-side native leaf adapter.  The leaf itself is registered through
 * defineLeaf and receives only LeafContext.  Existing Planting scenarios are
 * executed as isolated Node modules during the migration window so their
 * audited assertions remain unchanged; no package/core code discovers them.
 */
export function createLeaf(entry) {
  const config = entry.config || {}
  const script = String(config.script || '')
  const id = String(entry.id || '')
  const dataMode = config.dataMode === 'fixture_diagnostic' ? 'fixture_diagnostic' : 'live_real'
  if (!script) {
    const error = new Error(`native leaf ${id} is missing config.script`)
    error.code = 'mp_e2e_contract_invalid'
    throw error
  }
  return defineLeaf(
    { id, dataMode, title: String(config.title || id) },
    context => runNativeScenario({ id, script, sourceDataMode: config.sourceDataMode, context, timeoutMs: config.timeoutMs, environment: config.environment })
  )
}

async function runNativeScenario({ id, script, sourceDataMode, context, timeoutMs, environment = {} }) {
  const projectRoot = path.resolve(String(context.session?.projectRoot || ''))
  const scriptPath = path.resolve(projectRoot, script)
  if (!projectRoot || !scriptPath.startsWith(`${projectRoot}${path.sep}`)) {
    const error = new Error(`native leaf ${id} has an invalid project script path`)
    error.code = 'mp_e2e_contract_invalid'
    throw error
  }
  await mkdir(context.evidenceDir, { recursive: true })
  const result = await spawnScenario(scriptPath, {
    cwd: projectRoot,
    timeoutMs: positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS),
    env: {
      ...process.env,
      ...environment,
      MP_E2E_COMPILED_ASSET: '1',
      MINIPROGRAM_AUTOMATOR_WS: String(context.session?.wsEndpoint || ''),
      MP_PROJECT_PATH: String(context.session?.runtimeProjectPath || ''),
      MP_AUTOMATOR_PORT: String(context.session?.runtimeProof?.automator_port || ''),
      QA_RUNTIME_PROJECT_SNAPSHOT: 'compiled_asset_sidecar',
      QA_RUNTIME_SESSION_ID: String(context.session?.runtimeSessionId || ''),
      QA_CATALOG_DATA_MODE: String(sourceDataMode || (context.dataMode === 'fixture_diagnostic' ? 'fixture_diagnostic' : 'automator_live_real_api')),
      QA_AUTOMATOR_LIVE_LEAF: id,
      QA_AUTOMATOR_RUNTIME_PROOF: JSON.stringify(context.session?.runtimeProof || {}),
      E2E_ARTIFACT_DIR: context.evidenceDir
    }
  })
  const execution = {
    id,
    script,
    sourceDataMode: sourceDataMode || null,
    dataMode: context.dataMode,
    code: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr
  }
  const executionPath = path.join(context.evidenceDir, 'native-leaf-execution.json')
  await writeFile(executionPath, `${JSON.stringify(execution, null, 2)}\n`)
  const legacyReport = await readScenarioReport(result.stdout, projectRoot)
  if (result.error || result.timedOut || result.code !== 0 || legacyReport?.status === 'failed') {
    const error = new Error(result.error?.message || legacyReport?.blockerReason || `native leaf ${id} failed with exit ${result.code ?? 'unknown'}`)
    error.code = result.timedOut
      ? 'mp_e2e_script_leaf_timeout'
      : legacyReport?.classification === 'BLOCKED_FIXTURE' || legacyReport?.failure_kind === 'blocked_fixture'
        ? 'mp_e2e_fixture_leaf_blocked'
      : legacyReport?.classification === 'FAIL_PRODUCT' || legacyReport?.failure_kind === 'failed_product' || legacyReport?.status === 'failed'
        ? 'mp_e2e_product_leaf_failed'
        : 'mp_e2e_script_leaf_failed'
    error.details = { executionPath, code: result.code, signal: result.signal, legacyReport: summarizeReport(legacyReport) }
    throw error
  }
  return {
    status: 'passed',
    assertions: [{ name: 'native_leaf_exit', passed: true, evidence: { executionPath, code: result.code, report: summarizeReport(legacyReport) } }]
  }
}

function spawnScenario(scriptPath, { cwd, env, timeoutMs }) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [scriptPath], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const append = (value, chunk) => value.length >= MAX_LOG_BYTES ? value : `${value}${String(chunk)}`.slice(0, MAX_LOG_BYTES)
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...result, stdout, stderr })
    }
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
    child.on('error', error => finish({ code: null, signal: null, error, timedOut: false }))
    child.on('close', (code, signal) => finish({ code, signal, error: null, timedOut: false }))
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ code: null, signal: 'SIGTERM', error: null, timedOut: true })
    }, timeoutMs)
  })
}

function parseJson(value) {
  const text = String(value || '').trim()
  try {
    return JSON.parse(text)
  } catch {
    // Fall through to the last JSON line for scenarios that log progress.
  }
  const lines = text.split(/\r?\n/u).reverse()
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // A scenario may log progress before its final machine-readable report.
    }
  }
  return null
}

async function readScenarioReport(stdout, projectRoot) {
  const direct = parseJson(stdout)
  if (direct) return direct
  const matches = [...String(stdout || '').matchAll(/(?:report|结果路径|日志文件):\s*(\S+)/giu)]
  for (const match of matches.reverse()) {
    const candidate = path.resolve(projectRoot, match[1])
    try {
      return JSON.parse(await readFile(candidate, 'utf8'))
    } catch {
      try {
        return JSON.parse(await readFile(match[1], 'utf8'))
      } catch {
        // Continue with the next path or the terminal exit status.
      }
    }
  }
  return null
}

function summarizeReport(report) {
  if (!report || typeof report !== 'object') return null
  return {
    status: report.status || null,
    classification: report.classification || null,
    assertions: Array.isArray(report.assertions) ? report.assertions.map(item => ({ name: item.name, passed: item.passed === true })) : [],
    failures: Array.isArray(report.failures) ? report.failures.slice(0, 3) : [],
    evidencePaths: Array.isArray(report.evidence_paths) ? report.evidence_paths : []
  }
}

function positiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}
