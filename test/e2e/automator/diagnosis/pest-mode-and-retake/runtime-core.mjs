import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  handoffFormalLeafScreenshot,
  resolveFormalLeafPrincipal
} from '../../_shared/formal-leaf-harness.mjs'

const DEFAULT_ARTIFACT_DIR =
  process.env.E2E_ARTIFACT_DIR ||
  path.resolve('.tmp/e2e/diagnosis/pest-mode-and-retake', String(Date.now()))
// Screenshot evidence policy: only a small, explicit set of meaningful UI checkpoints
// invoke the isolated worker. This avoids the legacy ~19 serial recordShot calls whose
// worst case (19 * 20s = 380s) exceeds the 300s QA watchdog. Non-policy recordShot calls
// are no-ops that still record the requested name for traceability.
const SCREENSHOT_CHECKPOINT_POLICY = new Set([
  '00-home-diagnose-popup', // Home PlantCard -> DiagnosePopup -> shared DiagnoseFlow
  '03-direction-active', // multi-pest direction / question-package state
  '05-retake-skip-terminal' // terminal retake/result state (skip unknown)
])
// Parent-wide screenshot time budget, substantially below the 300s QA watchdog. Once
// exhausted, remaining required screenshot evidence is recorded as unverified and the
// user flow continues immediately.
const SCREENSHOT_BUDGET_MS = Number(process.env.MP_SCREENSHOT_BUDGET_MS || 60000)
const FORMAL_PRINCIPAL = resolveFormalLeafPrincipal()
let activeHarnessAutomator = null

async function loadAutomator() {
  try {
    const loaded = await import('miniprogram-automator')
    return loaded.default || loaded['module.exports'] || loaded
  } catch {
    return null
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function assertSourceContract() {
  const reads = {
    upload: readFileSync('src/subpackages/diagnosis/diagnose-flow/DiagnoseUploadStage.vue', 'utf8'),
    flow: readFileSync('src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue', 'utf8'),
    popupActions: readFileSync('src/subpackages/diagnosis/diagnose-flow/popup-actions.js', 'utf8'),
    retake: readFileSync('src/subpackages/diagnosis/diagnose-flow/RetakeCard.vue', 'utf8'),
    retakeCopy: readFileSync('src/subpackages/diagnosis/diagnose-flow/retake-copy.js', 'utf8'),
    retakeExpiry: readFileSync('src/subpackages/diagnosis/diagnose-flow/retake-expiry.js', 'utf8'),
    direction: readFileSync(
      'src/subpackages/diagnosis/diagnose-flow/DirectionChoiceCard.vue',
      'utf8'
    ),
    submit: readFileSync('src/subpackages/diagnosis/diagnose-flow/dialog-submit.js', 'utf8'),
    packagePage: readFileSync('src/subpackages/diagnosis/question-package.vue', 'utf8'),
    packageContext: readFileSync(
      'src/subpackages/diagnosis/question-package/page-context.js',
      'utf8'
    ),
    packageRetake: readFileSync(
      'src/subpackages/diagnosis/question-package/QuestionPackageRetake.vue',
      'utf8'
    ),
    packageRetakeFlow: readFileSync(
      'src/subpackages/diagnosis/question-package/retake-flow.js',
      'utf8'
    ),
    packageSubmit: readFileSync(
      'src/subpackages/diagnosis/question-package/question-submit.js',
      'utf8'
    ),
    answer: readFileSync('cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js', 'utf8'),
    retakeRuntime: readFileSync(
      'cloudfunctions/diagnose-http/app/diagnosis-answer-retake-runtime.js',
      'utf8'
    )
  }
  assert.match(reads.upload, /id="diagnose-profile-full-button"/)
  assert.match(reads.upload, /id="diagnose-profile-pest-button"/)
  assert.match(reads.upload, /只看虫害需要照片/)
  assert.match(reads.flow, /id="diagnose-submit-button"/)
  assert.match(reads.popupActions, /questionStartMutation\.mutateAsync\(/)
  assert.match(reads.popupActions, /navigateToDiagnosisQuestionPackagePage\(diagnosisResult\)/)
  assert.match(reads.direction, /id="diagnose-direction-choice-card"/)
  assert.match(reads.packagePage, /id="diagnose-question-package-page"/)
  assert.match(reads.packageContext, /虫害细节确认/)
  assert.match(reads.submit, /shouldNavigateDiagnosisResult\(nextResult\)/)
  assert.match(reads.submit, /navigateToDiagnosisQuestionPackagePage\(rerunResult\)/)
  assert.match(reads.packagePage, /v-else-if="result\?\.retakeRequest"/)
  assert.match(reads.packageRetake, /<RetakeCard/)
  assert.match(reads.packageRetakeFlow, /requestDiagnosisRetakeAuthorize/)
  assert.match(reads.packageRetakeFlow, /requestDiagnosisRetakeSkip/)
  assert.match(reads.packageRetakeFlow, /buildRetakeImageAnswerPayload/)
  assert.match(reads.packageSubmit, /requestMode: 'answer_submit'/)
  assert.match(reads.retake, /id="diagnose-retake-countdown"/)
  assert.match(reads.retake, /id="diagnose-retake-expired-text"/)
  assert.match(reads.retake, /id="diagnose-retake-safety-instructions"/)
  assert.match(reads.retake, /id="diagnose-retake-skipped-text"/)
  assert.match(
    reads.retakeCopy,
    /确认开始后，请在 3 分钟内完成拍摄并提交。超过时间，本次诊断将结束。/
  )
  assert.match(reads.submit, /requestDiagnosisRetakeSkip/)
  assert.match(reads.retakeExpiry, /requestDiagnosisResult/)
  assert.match(reads.retakeRuntime, /assertRetakeUploadAuthorized/)
  assert.doesNotMatch(reads.answer, /stripVisualEvidenceItems/)
  assert.deepEqual(
    [...SCREENSHOT_CHECKPOINT_POLICY],
    ['00-home-diagnose-popup', '03-direction-active', '05-retake-skip-terminal']
  )
  assert.ok(
    !SCREENSHOT_CHECKPOINT_POLICY.has('final-runtime-state'),
    'policy-external final runtime state must never invoke a screenshot worker'
  )
}

function createReport({ wsEndpoint, fixtureEnabled }) {
  return {
    status: 'running',
    channel: 'miniprogram-automator',
    projectPath: process.env.MP_PROJECT_PATH || 'dist/dev/mp-weixin',
    pagePath: '',
    wsEndpoint,
    formal_principal: {
      source: FORMAL_PRINCIPAL.source,
      fingerprint: FORMAL_PRINCIPAL.fingerprint
    },
    fixture: fixtureEnabled
      ? {
          enabled: true,
          injectionPath:
            'miniProgram.evaluate monkey-patches uni.request/wx.request for diagnose-http endpoints'
        }
      : { enabled: false },
    assertions: [],
    steps: [],
    failures: [],
    not_verified: [],
    requests: [],
    modals: [],
    screenshots: [],
    screenshot_attempts: [],
    requested_screenshots: [],
    evidence_paths: [],
    startedAt: new Date().toISOString(),
    endedAt: ''
  }
}

async function runAutomatorStep(report, name, action) {
  const step = {
    name,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: '',
    detail: ''
  }
  report.steps.push(step)
  try {
    const value = await action()
    step.status = 'passed'
    step.endedAt = new Date().toISOString()
    return value
  } catch (error) {
    const detail = String(error?.message || error)
    step.status = 'failed'
    step.detail = detail
    step.endedAt = new Date().toISOString()
    throw new Error(`[automator-step:${name}] ${detail}`)
  }
}

function recordAssertion(report, name, passed, detail = '') {
  report.assertions.push({ name, passed: Boolean(passed), detail, time: new Date().toISOString() })
  if (!passed) {
    report.failures.push({ name, detail })
  }
}

// Parent-wide screenshot time budget tracker. Shared across all captureIsolatedShot calls
// so that once the total budget is exhausted, remaining screenshots are skipped and the
// user flow continues immediately.
let screenshotBudgetRemaining = SCREENSHOT_BUDGET_MS
let screenshotBudgetExhausted = false

function resetScreenshotBudget() {
  screenshotBudgetRemaining = SCREENSHOT_BUDGET_MS
  screenshotBudgetExhausted = false
}

function consumeScreenshotBudget(elapsedMs) {
  screenshotBudgetRemaining -= elapsedMs
  if (screenshotBudgetRemaining <= 0) {
    screenshotBudgetRemaining = 0
    screenshotBudgetExhausted = true
  }
}

// recordShot is the checkpoint entry point. Only names in SCREENSHOT_CHECKPOINT_POLICY
// invoke the isolated worker; all other names are recorded as requested for traceability
// but do not consume budget or spawn a worker. This prevents the legacy ~19 serial calls
// from exceeding the QA watchdog.
async function recordShot(report, miniProgram, wsEndpoint, artifactDir, name) {
  report.requested_screenshots.push(name)
  if (!SCREENSHOT_CHECKPOINT_POLICY.has(name)) {
    // Non-policy checkpoint: record the request but do not spawn a worker.
    return
  }
  if (screenshotBudgetExhausted) {
    report.not_verified.push({
      item: `screenshot:${name}`,
      reason: `screenshot budget exhausted (${SCREENSHOT_BUDGET_MS}ms total consumed)`
    })
    return
  }
  await captureIsolatedShot(report, miniProgram, wsEndpoint, artifactDir, name)
}

function isNonEmptyPngFile(filePath) {
  if (!existsSync(filePath) || statSync(filePath).size <= 8) {
    return false
  }
  return readFileSync(filePath).subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
}

function recordScreenshotAttempt(report, name, mode, attempt, status, detail = '') {
  report.screenshot_attempts.push({
    name,
    mode,
    attempt,
    status,
    detail,
    time: new Date().toISOString()
  })
}

function recordValidScreenshot(report, name, shotPath) {
  const bytes = statSync(shotPath).size
  report.screenshots.push({ name, path: shotPath, bytes })
  report.evidence_paths.push(shotPath)
}

function requiredScreenshotCheckpointEvidence(report) {
  const checkpoints = [...SCREENSHOT_CHECKPOINT_POLICY]
  const checkpointEvidence = checkpoints.map(name => {
    const matchingShots = report.screenshots.filter(shot => shot.name === name)
    const shotPath = matchingShots[0]?.path
    let validPng = false
    try {
      validPng = typeof shotPath === 'string' && isNonEmptyPngFile(shotPath)
    } catch {
      validPng = false
    }
    return {
      name,
      count: matchingShots.length,
      validPng
    }
  })
  const workerNames = report.screenshot_attempts.map(attempt => attempt.name)
  const policyExternalWorkerNames = workerNames.filter(
    name => !SCREENSHOT_CHECKPOINT_POLICY.has(name)
  )
  return {
    passed:
      report.screenshots.length === checkpoints.length &&
      checkpointEvidence.every(checkpoint => checkpoint.count === 1 && checkpoint.validPng),
    noPolicyExternalWorker:
      !report.requested_screenshots.includes('final-runtime-state') &&
      policyExternalWorkerNames.length === 0,
    detail: JSON.stringify({
      requiredCheckpoints: checkpoints,
      checkpointEvidence,
      capturedScreenshotNames: report.screenshots.map(shot => shot.name),
      workerNames,
      policyExternalWorkerNames
    })
  }
}

// Isolated screenshot capture keeps the initial worker at 20 seconds. Only an initial
// timeout can take the bounded recovery path: health-proof the primary connection, then
// launch one new worker against the same evidence path. Any second failure remains
// unverified and never falls back to a primary-connection screenshot.
async function captureIsolatedShot(report, miniProgram, wsEndpoint, artifactDir, name) {
  const shotPath = path.resolve(artifactDir, `${name}.png`)
  const perWorkerTimeoutMs = Number(process.env.MP_SCREENSHOT_TIMEOUT_MS || 20000)
  rmSync(shotPath, { force: true })
  try {
    const result = await handoffFormalLeafScreenshot({
      mp: miniProgram,
      automator: activeHarnessAutomator,
      wsEndpoint,
      outputPath: shotPath,
      timeoutMs: perWorkerTimeoutMs
    })
    consumeScreenshotBudget(perWorkerTimeoutMs)
    recordScreenshotAttempt(report, name, 'formal-worker', 1, 'passed', result.output_path)
    recordValidScreenshot(report, name, shotPath)
    return true
  } catch (error) {
    const detail = String(error?.message || error)
    recordScreenshotAttempt(report, name, 'formal-worker', 1, 'failed', detail)
    report.not_verified.push({ item: `screenshot:${name}`, reason: detail })
    return false
  }
}

async function safeText(element) {
  try {
    return await element.text()
  } catch {
    return ''
  }
}

async function safeAttribute(element, name) {
  try {
    return await element.attribute(name)
  } catch {
    return ''
  }
}

async function collectElementsWithId(page) {
  const elements = await page.$$('[id]')
  const items = []
  for (const element of elements) {
    const elementId = await safeAttribute(element, 'id')
    if (elementId) {
      items.push({ elementId, element })
    }
  }
  return items
}

async function findBySemanticId(page, semanticId) {
  return (await page.$(`#${semanticId}`)) || (await page.$(`[id$=${semanticId}]`))
}

async function waitForPagePath(miniProgram, expectedPath, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = await miniProgram.currentPage()
    if (page?.path === expectedPath) {
      return page
    }
    await sleep(250)
  }
  return miniProgram.currentPage()
}

async function findByIdContains(page, contains, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const directHit = await page.$(`[id*=${contains}]`)
    if (directHit) {
      return directHit
    }
    const hit = (await collectElementsWithId(page)).find(item => item.elementId.includes(contains))
    if (hit) {
      return hit.element
    }
    await sleep(250)
  }
  return null
}

async function assertElement(report, page, selector, name, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let element = null
  const semanticId = selector.startsWith('#') ? selector.slice(1) : ''
  while (Date.now() < deadline) {
    element = semanticId ? await findBySemanticId(page, semanticId) : await page.$(selector)
    if (element) {
      break
    }
    await sleep(250)
  }
  recordAssertion(report, name, Boolean(element), selector)
  return element
}

export {
  DEFAULT_ARTIFACT_DIR,
  FORMAL_PRINCIPAL,
  loadAutomator,
  assertSourceContract,
  createReport,
  runAutomatorStep,
  recordAssertion,
  resetScreenshotBudget,
  recordShot,
  requiredScreenshotCheckpointEvidence,
  safeText,
  safeAttribute,
  findBySemanticId,
  waitForPagePath,
  findByIdContains,
  assertElement,
  sleep
}
export const setActiveHarnessAutomator = value => {
  activeHarnessAutomator = value
}
