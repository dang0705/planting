import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

// 镜像契约：截图只能由独立 worker 产生；主连接只驱动页面与健康探针。
// 这组测试不连接真实 DevTools，运行态部分只验证不可连接端点上的 worker 收口。

const repoRoot = process.cwd()
const workerPath = path.join(repoRoot, 'test/e2e/automator/diagnosis/_shared/screenshot-worker.mjs')
const scriptPath = path.join(
  repoRoot,
  'test/e2e/automator/diagnosis/pest-mode-and-retake/runtime-core.mjs'
)
const entryScriptPath = path.join(repoRoot, 'test/e2e/automator/diagnosis/pest-mode-and-retake.mjs')
const formalHarnessPath = path.join(repoRoot, 'test/e2e/automator/_shared/formal-leaf-harness.mjs')
const workerSource = fs.readFileSync(workerPath, 'utf8')
const scriptSource = fs.readFileSync(scriptPath, 'utf8')
const entryScriptSource = fs.readFileSync(entryScriptPath, 'utf8')
const formalHarnessSource = fs.readFileSync(formalHarnessPath, 'utf8')
const scriptWithoutLineComments = scriptSource.replace(/\/\/.*$/gm, '')
const requiredCheckpoints = [
  '00-home-diagnose-popup',
  '03-direction-active',
  '05-retake-skip-terminal'
]

function sourceSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0, `source must include ${startMarker}`)
  assert.ok(end > start, `source must include ${endMarker} after ${startMarker}`)
  return source.slice(start, end)
}

function parseLastJsonLine(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean)
  assert.ok(lines.length > 0, 'worker must emit at least one JSON line')
  return JSON.parse(lines.at(-1))
}

function runWorker(args, guardMs) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [workerPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = result => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(guard)
      resolve({ ...result, stdout, stderr })
    }
    const guard = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // The worker may already have exited before the deterministic guard fires.
      }
      finish({ timedOut: true })
    }, guardMs)

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('close', exitCode => finish({ timedOut: false, exitCode }))
    child.on('error', error => finish({ timedOut: false, error: String(error?.message || error) }))
  })
}

// === 独立 worker 源契约 ===
assert.ok(fs.existsSync(workerPath), 'screenshot-worker.mjs must exist')
assert.match(
  workerSource,
  /connectAutomatorTransport\(automator, wsEndpoint\)/,
  'worker must create its own Automator connection through the formal transport adapter'
)
assert.match(
  workerSource,
  /miniProgram\.screenshot\(\{ path: outputPath \}\)/,
  'worker must capture the requested evidence path'
)
assert.match(
  workerSource,
  /Promise\.resolve\(\)[\s\S]*?miniProgram\.disconnect\(\)[\s\S]*?status: 'passed'/,
  'worker must await its owned disconnect attempt before handing off the endpoint'
)
assert.match(
  workerSource,
  /DISCONNECT_TIMEOUT_MS = 2000[\s\S]*?status: 'timed_out'/,
  'worker disconnect cleanup must have its own bounded deadline'
)
assert.match(
  workerSource,
  /result\.cleanup\?\.status === 'timed_out'[\s\S]*?process\.exit\(0\)/,
  'a wedged disposable worker must terminate after emitting its terminal result'
)
assert.match(
  workerSource,
  /function emit\(result\)[\s\S]*?process\.stdout\.write\(JSON\.stringify\(result\)/,
  'worker must emit structured JSON rather than relying on exit status'
)
assert.match(
  workerSource,
  /const workerDeadline = setTimeout\([\s\S]*?status: 'timeout'/,
  'worker must retain its internal timeout safety net'
)
assert.match(
  formalHarnessSource,
  /FORMAL_LEAF_SCREENSHOT_TIMEOUT_MS = 20_000/,
  'formal leaf screenshots must use the shared 20-second bounded default'
)
assert.match(
  formalHarnessSource,
  /const boundedScreenshotTimeoutMs\s*=\s*[\s\S]*?FORMAL_LEAF_SCREENSHOT_TIMEOUT_MS/,
  'formal leaf screenshot handoff must resolve an explicit timeout before starting the worker'
)
assert.match(
  formalHarnessSource,
  /captureFormalScreenshot\(\{[\s\S]*?timeoutMs: boundedScreenshotTimeoutMs/,
  'the worker must receive the same bounded timeout selected by the formal handoff'
)
assert.match(workerSource, /PNG_MAGIC/, 'worker must validate PNG magic bytes')
assert.match(workerSource, /statSync\(filePath\)\.size <= 8/, 'worker must reject empty PNG files')
assert.match(
  workerSource,
  /buffer\.equals\(PNG_MAGIC\)/,
  'worker must compare bytes with PNG magic'
)

// === 题包截图通过统一正式 worker 交接，并保留 20 秒单次预算 ===
const workerAttemptSource = sourceSlice(
  scriptSource,
  'async function captureIsolatedShot',
  'async function safeText'
)
assert.match(
  scriptSource,
  /const perWorkerTimeoutMs = Number\(process\.env\.MP_SCREENSHOT_TIMEOUT_MS \|\| 20000\)/,
  'each worker attempt must default to a 20-second deadline'
)
assert.match(
  workerAttemptSource,
  /handoffFormalLeafScreenshot\(\{[\s\S]*?wsEndpoint,[\s\S]*?outputPath: shotPath,[\s\S]*?timeoutMs: perWorkerTimeoutMs/,
  'diagnosis leaf must hand the current endpoint and bounded timeout to the formal screenshot worker'
)
assert.match(
  workerAttemptSource,
  /consumeScreenshotBudget\(perWorkerTimeoutMs\)/,
  'diagnosis leaf must account for the bounded screenshot budget'
)

// === 主连接绝不截图，且仅允许三个用户可见 checkpoint ===
const mainScreenshotCalls = (
  scriptWithoutLineComments.match(/\bminiProgram\.screenshot\s*\(/g) || []
).length
assert.equal(mainScreenshotCalls, 0, 'main Automator connection must never call screenshot')

const policyMatch = scriptSource.match(/SCREENSHOT_CHECKPOINT_POLICY = new Set\(\[([\s\S]*?)\]\)/)
assert.ok(policyMatch, 'checkpoint policy set must be parseable')
const actualCheckpoints = [...policyMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1])
assert.deepEqual(
  actualCheckpoints,
  requiredCheckpoints,
  'screenshot policy must contain exactly the three required user-visible checkpoints'
)

const recordShotSource = sourceSlice(
  scriptSource,
  'async function recordShot',
  'function isNonEmptyPngFile'
)
const policyGuardOffset = recordShotSource.indexOf('if (!SCREENSHOT_CHECKPOINT_POLICY.has(name))')
const isolatedCaptureOffset = recordShotSource.indexOf('captureIsolatedShot(')
assert.ok(policyGuardOffset >= 0, 'recordShot must gate non-policy names')
assert.ok(isolatedCaptureOffset > policyGuardOffset, 'policy gate must run before worker capture')
assert.match(
  recordShotSource,
  /if \(!SCREENSHOT_CHECKPOINT_POLICY\.has\(name\)\) \{[\s\S]*?return/,
  'policy-external checkpoints must return without spawning a worker'
)

// === 禁止 policy 外第四张 final-runtime-state 截图 ===
assert.doesNotMatch(
  scriptSource,
  /\bcaptureFinalShot\b/,
  'legacy final screenshot helper must not exist'
)
assert.doesNotMatch(
  scriptSource,
  /evidence\.captureScreenshot:final-runtime-state/,
  'final runtime state must not schedule an extra screenshot worker'
)
assert.doesNotMatch(
  scriptSource,
  /(?:recordShot|captureIsolatedShot)\([\s\S]{0,160}final-runtime-state/,
  'final runtime state must not reach a policy-external screenshot entry point'
)

const evidenceSource = sourceSlice(
  scriptSource,
  'function requiredScreenshotCheckpointEvidence',
  'async function captureIsolatedShot'
)
assert.match(
  evidenceSource,
  /report\.screenshots\.length === checkpoints\.length/,
  'required screenshot evidence must reject a missing or fourth capture'
)
assert.match(
  evidenceSource,
  /checkpoint\.count === 1 && checkpoint\.validPng/,
  'each required checkpoint must have exactly one valid PNG'
)
assert.match(
  evidenceSource,
  /policyExternalWorkerNames\.length === 0/,
  'required evidence must reject a worker outside the policy'
)
assert.match(
  entryScriptSource,
  /'required runtime screenshot captured',[\s\S]*?screenshotEvidence\.passed/,
  'required screenshot success must use all-checkpoint evidence, not a fourth screenshot'
)
assert.doesNotMatch(
  entryScriptSource,
  /'required runtime screenshot captured',[\s\S]{0,260}report\.screenshots\.length > 0/,
  'a single arbitrary screenshot must not satisfy required runtime evidence'
)

// === 确定性运行时契约：不连接真实 DevTools ===
{
  const outputPath = path.join(repoRoot, '.tmp', 'screenshot-worker-contract-unreachable.png')
  fs.rmSync(outputPath, { force: true })
  const result = await runWorker(['ws://127.0.0.1:1', outputPath, '3000'], 5000)
  assert.equal(result.timedOut, false, 'unreachable worker must settle before the test guard')
  const workerResult = parseLastJsonLine(result.stdout)
  assert.ok(
    workerResult.status === 'failed' || workerResult.status === 'timeout',
    `unreachable worker must report failed or timeout, got: ${workerResult.status}`
  )
  assert.equal(
    fs.existsSync(outputPath),
    false,
    'unreachable worker must not fabricate PNG evidence'
  )
}

{
  const result = await runWorker(['', ''], 5000)
  assert.equal(
    result.timedOut,
    false,
    'invalid worker invocation must settle before the test guard'
  )
  const workerResult = parseLastJsonLine(result.stdout)
  assert.equal(
    workerResult.status,
    'failed',
    'invalid worker invocation must emit a failure envelope'
  )
  assert.match(
    workerResult.error || '',
    /usage/,
    'invalid worker invocation must describe its usage error'
  )
}
