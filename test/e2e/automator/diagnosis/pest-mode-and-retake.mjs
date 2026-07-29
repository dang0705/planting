import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DEFAULT_WS_ENDPOINT = process.env.MINIPROGRAM_AUTOMATOR_WS || 'ws://127.0.0.1:9420'
const DEFAULT_ARTIFACT_DIR =
  process.env.E2E_ARTIFACT_DIR ||
  path.resolve('.tmp/e2e/diagnosis/pest-mode-and-retake', String(Date.now()))
const SCREENSHOT_WORKER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '_shared',
  'screenshot-worker.mjs'
)
const REQUEST_LOG_STORAGE_KEY = '__plantsight_e2e_diagnosis_requests__'
const MODAL_LOG_STORAGE_KEY = '__plantsight_e2e_diagnosis_modals__'
const RETAKE_MODE_STORAGE_KEY = '__plantsight_e2e_diagnosis_retake_mode__'
const AUTOMATION_IMAGES_STORAGE_KEY = '__plantsight_diagnose_automation_images__'
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
// Pinia persist (pinia-plugin-persistedstate, auto:false) uses the store $id as the storage key.
// useUserStore = defineStore('user', ...) => storage key = 'user'.
// Seeding this before the home page mounts lets the store rehydrate openid =>
// isAuthenticated=true, so onMounted -> ensureLogin -> loadUserPlants runs and
// consumes the mocked plant-user-http/user-plants response.
const USER_STORE_STORAGE_KEY = 'user'
const FIXTURE_USER_OPENID = 'e2e_fixture_openid_pest_mode_retake'
// Bounded wait for the fixture user store to be rehydrated by pinia persist
// before the home page onMounted reads isAuthenticated. The home page reLaunch
// triggers store initialization synchronously, so this is a short readiness
// probe, not a timeout enlargement to mask missing preconditions.
const FIXTURE_USER_READY_TIMEOUT_MS = 4000
const FIXTURE_USER_READY_PROBE_INTERVAL_MS = 200

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
    upload: readFileSync('src/components/diagnose-flow/DiagnoseUploadStage.vue', 'utf8'),
    flow: readFileSync('src/components/diagnose-flow/DiagnoseFlow.vue', 'utf8'),
    popupActions: readFileSync('src/components/diagnose-flow/popup-actions.js', 'utf8'),
    retake: readFileSync('src/components/diagnose-flow/RetakeCard.vue', 'utf8'),
    retakeCopy: readFileSync('src/components/diagnose-flow/retake-copy.js', 'utf8'),
    retakeExpiry: readFileSync('src/components/diagnose-flow/retake-expiry.js', 'utf8'),
    direction: readFileSync('src/components/diagnose-flow/DirectionChoiceCard.vue', 'utf8'),
    submit: readFileSync('src/components/diagnose-flow/dialog-submit.js', 'utf8'),
    packagePage: readFileSync('src/pages/diagnose/question-package.vue', 'utf8'),
    packageContext: readFileSync('src/pages/diagnose/question-package/page-context.js', 'utf8'),
    packageRetake: readFileSync(
      'src/pages/diagnose/question-package/QuestionPackageRetake.vue',
      'utf8'
    ),
    packageRetakeFlow: readFileSync('src/pages/diagnose/question-package/retake-flow.js', 'utf8'),
    packageSubmit: readFileSync('src/pages/diagnose/question-package/question-submit.js', 'utf8'),
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
  assert.deepEqual([...SCREENSHOT_CHECKPOINT_POLICY], [
    '00-home-diagnose-popup',
    '03-direction-active',
    '05-retake-skip-terminal'
  ])
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

// Bounded readiness probe on the MAIN connection: wait for the current page to settle
// (same path reported twice in a row, or timeout) before launching the screenshot worker.
// This is a main-channel read-only probe, never a screenshot call.
async function waitForPageSettled(miniProgram, timeoutMs = 3000) {
  const intervalMs = 250
  const deadline = Date.now() + timeoutMs
  let lastPath = null
  let stableCount = 0
  while (Date.now() < deadline) {
    try {
      const page = await miniProgram.currentPage()
      const currentPath = page?.path || ''
      if (currentPath && currentPath === lastPath) {
        stableCount += 1
        if (stableCount >= 2) {
          return { settled: true, path: currentPath }
        }
      } else {
        stableCount = 0
        lastPath = currentPath
      }
    } catch {
      // currentPage probe failure; keep waiting within the bounded window
    }
    await sleep(intervalMs)
  }
  return { settled: false, path: lastPath || '' }
}

function parseScreenshotWorkerResult(stdout) {
  try {
    const lines = stdout.trim().split('\n')
    return JSON.parse(lines[lines.length - 1])
  } catch {
    return null
  }
}

// Each worker is independent of the primary Automator session. The 20s deadline applies
// to every worker attempt; the main connection is never used to take a screenshot.
async function captureIsolatedWorkerAttempt(wsEndpoint, shotPath, perWorkerTimeoutMs) {
  const callStartedAt = Date.now()
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let finished = false
    let killTimer = null
    let child = null

    const finish = outcome => {
      if (finished) {
        return
      }
      finished = true
      if (killTimer) {
        clearTimeout(killTimer)
        killTimer = null
      }
      resolve({
        outcome,
        stdout,
        stderr,
        elapsedMs: Date.now() - callStartedAt
      })
    }

    try {
      child = spawn(
        process.execPath,
        [SCREENSHOT_WORKER_PATH, wsEndpoint, shotPath, String(perWorkerTimeoutMs)],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      stderr = String(error?.message || error)
      finish('done')
      return
    }

    // Initialize killTimer before listeners so an immediately-closing child is safe.
    killTimer = setTimeout(() => {
      if (finished) {
        return
      }
      try { child.kill('SIGKILL') } catch { /* already dead */ }
      finish('timeout')
    }, perWorkerTimeoutMs)

    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('close', () => finish('done'))
    child.on('error', error => {
      stderr += String(error?.message || error)
      finish('done')
    })
  })
}

function workerAttemptEvidence(workerAttempt, shotPath, perWorkerTimeoutMs) {
  if (workerAttempt.outcome === 'timeout') {
    return {
      passed: false,
      detail: `screenshot_timeout after ${perWorkerTimeoutMs}ms (isolated worker killed)`
    }
  }
  const workerResult = parseScreenshotWorkerResult(workerAttempt.stdout)
  if (workerResult?.status === 'passed' && isNonEmptyPngFile(shotPath)) {
    return { passed: true, detail: shotPath }
  }
  return {
    passed: false,
    detail: String(workerResult?.error || workerAttempt.stderr.trim() || 'screenshot capture failed')
  }
}

// A timed-out worker may be retried once only after the primary connection proves it is
// still readable, settled, and able to read the harness request log. These are read-only
// probes; they intentionally do not call miniProgram.screenshot().
async function proveScreenshotRetryReadiness(report, miniProgram) {
  try {
    const currentPage = await miniProgram.currentPage()
    const currentPath = currentPage?.path || ''
    if (!currentPath) {
      return { verified: false, detail: 'currentPage was not readable after screenshot timeout' }
    }
    const settled = await waitForPageSettled(miniProgram)
    if (!settled.settled || !settled.path) {
      return { verified: false, detail: 'current page did not settle after screenshot timeout' }
    }
    const requests = await readRequests(miniProgram)
    if (!Array.isArray(requests)) {
      return { verified: false, detail: 'wx storage request harness was not readable after screenshot timeout' }
    }
    report.pagePath = settled.path
    return {
      verified: true,
      detail: `currentPage=${currentPath}; settledPage=${settled.path}; requestLogEntries=${requests.length}`
    }
  } catch (error) {
    return {
      verified: false,
      detail: `main connection recovery proof failed: ${String(error?.message || error)}`
    }
  }
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

  // Settle the page on the main connection before the first worker captures a frame.
  // This remains a read-only probe, not a screenshot call.
  try {
    const settled = await waitForPageSettled(miniProgram)
    if (settled.path) {
      report.pagePath = settled.path
    }
  } catch {
    // The isolated worker can still provide evidence when this optional preflight fails.
  }

  const firstWorkerAttempt = await captureIsolatedWorkerAttempt(
    wsEndpoint,
    shotPath,
    perWorkerTimeoutMs
  )
  consumeScreenshotBudget(firstWorkerAttempt.elapsedMs)
  const firstEvidence = workerAttemptEvidence(firstWorkerAttempt, shotPath, perWorkerTimeoutMs)
  recordScreenshotAttempt(report, name, 'isolated-worker', 1, firstEvidence.passed ? 'passed' : 'failed', firstEvidence.detail)
  if (firstEvidence.passed) {
    recordValidScreenshot(report, name, shotPath)
    return true
  }

  if (firstWorkerAttempt.outcome !== 'timeout') {
    report.not_verified.push({ item: `screenshot:${name}`, reason: firstEvidence.detail })
    return false
  }

  const readiness = await proveScreenshotRetryReadiness(report, miniProgram)
  if (!readiness.verified) {
    const detail = `retry skipped because ${readiness.detail}`
    recordScreenshotAttempt(report, name, 'isolated-worker-recovery', 2, 'failed', detail)
    report.not_verified.push({ item: `screenshot:${name}`, reason: detail })
    return false
  }

  // Start a fresh worker and remove any partial bytes from the timed-out worker first.
  rmSync(shotPath, { force: true })
  const secondWorkerAttempt = await captureIsolatedWorkerAttempt(
    wsEndpoint,
    shotPath,
    perWorkerTimeoutMs
  )
  consumeScreenshotBudget(secondWorkerAttempt.elapsedMs)
  const secondEvidence = workerAttemptEvidence(secondWorkerAttempt, shotPath, perWorkerTimeoutMs)
  recordScreenshotAttempt(
    report,
    name,
    'isolated-worker-recovery',
    2,
    secondEvidence.passed ? 'passed' : 'failed',
    `${readiness.detail}; ${secondEvidence.detail}`
  )
  if (secondEvidence.passed) {
    recordValidScreenshot(report, name, shotPath)
    return true
  }

  report.not_verified.push({
    item: `screenshot:${name}`,
    reason: `retry after first timeout failed: ${secondEvidence.detail}`
  })
  return false
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

async function setFixtureRetakeMode(miniProgram, mode) {
  await miniProgram.callWxMethod(
    'setStorageSync',
    RETAKE_MODE_STORAGE_KEY,
    mode === 'expired' ? 'expired' : 'active'
  )
}

async function seedAutomationImage(miniProgram) {
  await miniProgram.callWxMethod('setStorageSync', AUTOMATION_IMAGES_STORAGE_KEY, {
    images: [
      {
        imageRef: 'https://example.invalid/e2e-pest-leaf.jpg',
        inputSlotType: 'leaf',
        captureRegion: 'leaf_lower_surface',
        width: 1200,
        height: 900,
        size: 180000
      }
    ]
  })
}

// Establishes a deterministic "authenticated user + one real fixture plant" precondition
// BEFORE the home page lifecycle runs. This writes the pinia-persisted user store
// payload (key 'user') so that, when the home page mounts and useUserStore initializes,
// persist rehydrates openid => isAuthenticated=true. The home page onMounted then calls
// ensureLogin -> loadUserPlants -> plantStore.getUserPlants, which consumes the mocked
// plant-user-http/user-plants response (see fixtureFor in installHarness) and renders
// the real PlantCard with diagnose-entry-button-<plant.id>.
//
// This does NOT inject anonymous plants, test conditionals, or fallbacks into product
// source. It only seeds the same storage layer the real app uses for session restore.
async function seedAuthenticatedUserFixture(miniProgram) {
  const fixtureUser = {
    userId: 'e2e_fixture_user',
    openid: FIXTURE_USER_OPENID,
    union_id: '',
    username: '端上验收用户',
    nickname: '端上验收用户',
    avatar: '',
    email: '',
    phoneNumber: '',
    location: { province: '', city: '', latitude: 0, longitude: 0 },
    membership: { type: 'free', expireTime: null, freeQuota: 5, usedCount: 0 },
    isLoggedIn: true,
    token: '',
    lastRefreshTime: 0
  }
  await miniProgram.callWxMethod('setStorageSync', USER_STORE_STORAGE_KEY, fixtureUser)
}

// Bounded readiness probe: confirms the fixture user store payload is observable in the
// mini-program storage before proceeding to mount/reLaunch the home page. Returns true
// once the persisted openid is readable, false on timeout with a descriptive reason.
async function waitForFixtureUserReady(miniProgram) {
  const deadline = Date.now() + FIXTURE_USER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const stored = await miniProgram.callWxMethod('getStorageSync', USER_STORE_STORAGE_KEY)
      if (stored && String(stored.openid || '') === FIXTURE_USER_OPENID) {
        return { ready: true }
      }
    } catch {
      // storage read transient failure; keep probing within the bounded window
    }
    await sleep(FIXTURE_USER_READY_PROBE_INTERVAL_MS)
  }
  return {
    ready: false,
    reason: `fixture user store not rehydrated within ${FIXTURE_USER_READY_TIMEOUT_MS}ms (expected openid=${FIXTURE_USER_OPENID})`
  }
}

async function installHarness(miniProgram, fixtureEnabled) {
  // Capture the user's real DevTools session state BEFORE installing the fixture, so
  // restoreHarness can put it back exactly in finally cleanup. We snapshot both the
  // persisted storage payload and the live in-memory user store AND plant store state
  // (including currentPlant), so the fixture never leaks into the developer's session.
  await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const usePlantStore = require('store/plants.js').usePlantStore || require('store/plants.js').default
      const userStore = useUserStore(pinia)
      const plantStore = usePlantStore(pinia)
      globalThis.__e2eOriginalUserStorage = typeof wx !== 'undefined'
        ? wx.getStorageSync('user')
        : null
      globalThis.__e2eOriginalUserState = {
        userId: userStore.userId,
        openid: userStore.openid,
        union_id: userStore.union_id,
        username: userStore.username,
        nickname: userStore.nickname,
        avatar: userStore.avatar,
        email: userStore.email,
        phoneNumber: userStore.phoneNumber,
        location: userStore.location,
        membership: userStore.membership,
        isLoggedIn: userStore.isLoggedIn,
        token: userStore.token,
        lastRefreshTime: userStore.lastRefreshTime
      }
      globalThis.__e2eOriginalPlantState = {
        userPlants: JSON.parse(JSON.stringify(plantStore.userPlants || [])),
        currentPlant: plantStore.currentPlant ? JSON.parse(JSON.stringify(plantStore.currentPlant)) : null
      }
    } catch (error) {
      globalThis.__e2eOriginalUserCaptureError = String(error?.message || error)
    }
  })
  // Seed the authenticated-user + real-plant precondition BEFORE any evaluate/monkey-patch,
  // so the home page lifecycle (onMounted -> ensureLogin -> loadUserPlants) consumes the
  // mocked user-plants response when it mounts. This runs before fiveTabAndReuse/reLaunch.
  await seedAuthenticatedUserFixture(miniProgram)
  const userReady = await waitForFixtureUserReady(miniProgram)
  if (!userReady.ready) {
    throw new Error(`[installHarness] ${userReady.reason}`)
  }
  // The app was already launched when automator connected, so the pinia user store has
  // initialized with the real user's state. $hydrate() does NOT replace the live store
  // (proven by main QA: openid stayed as the real user's). We must $patch the live store
  // unconditionally with the deterministic fixture fields so the exact FIXTURE_USER_OPENID
  // assertion passes. $hydrate is retained only as a non-authoritative best-effort step.
  await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const userStore = useUserStore(pinia)
      // Non-authoritative: ask persist to re-read storage (may help on fresh stores).
      if (typeof userStore.$hydrate === 'function') {
        try { userStore.$hydrate() } catch { /* $hydrate is best-effort */ }
      }
      // Authoritative: directly overwrite the live reactive state with the fixture user.
      userStore.$patch({
        userId: 'e2e_fixture_user',
        openid: 'e2e_fixture_openid_pest_mode_retake',
        union_id: '',
        username: '端上验收用户',
        nickname: '端上验收用户',
        avatar: '',
        email: '',
        phoneNumber: '',
        location: { province: '', city: '', latitude: 0, longitude: 0 },
        membership: { type: 'free', expireTime: null, freeQuota: 5, usedCount: 0 },
        isLoggedIn: true,
        token: '',
        lastRefreshTime: 0
      })
    } catch (error) {
      globalThis.__e2eUserHydrateError = String(error?.message || error)
    }
  })
  // Verify the live store actually carries the fixture openid. If this fails we throw a
  // precise error instead of letting the home page stall into a generic timeout.
  const hydrateCheck = await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const userStore = useUserStore(pinia)
      return {
        authenticated: Boolean(userStore.openid),
        openid: String(userStore.openid || ''),
        hydrateError: globalThis.__e2eUserHydrateError || ''
      }
    } catch (error) {
      return { authenticated: false, openid: '', hydrateError: String(error?.message || error) }
    }
  })
  if (!hydrateCheck.authenticated || hydrateCheck.openid !== FIXTURE_USER_OPENID) {
    throw new Error(
      `[installHarness] fixture user store did not become authenticated with fixture openid: ${JSON.stringify(hydrateCheck)}`
    )
  }
  await miniProgram.evaluate(() => {
    globalThis.__e2eDiagnosisFixtureEnabled = true
  })
  if (!fixtureEnabled) {
    await miniProgram.evaluate(() => {
      globalThis.__e2eDiagnosisFixtureEnabled = false
    })
  }
  await miniProgram.evaluate(() => {
    const uniRef = (() => {
      try {
        return require('common/vendor.js')?.index || null
      } catch {
        return typeof uni !== 'undefined' ? uni : null
      }
    })()
    const wxRef = typeof wx !== 'undefined' ? wx : null
    const originalUniRequest = uniRef?.request
    const originalWxRequest = wxRef?.request
    const originalUniShowModal = uniRef?.showModal
    const originalWxShowModal = wxRef?.showModal
    globalThis.__e2eDiagnosisRequests = []
    globalThis.__e2eDiagnosisModals = []
    globalThis.__e2eDiagnosisOriginalUniRequest = originalUniRequest
    globalThis.__e2eDiagnosisOriginalWxRequest = originalWxRequest
    globalThis.__e2eDiagnosisOriginalUniShowModal = originalUniShowModal
    globalThis.__e2eDiagnosisOriginalWxShowModal = originalWxShowModal
    wxRef?.setStorageSync('__plantsight_e2e_diagnosis_requests__', [])
    wxRef?.setStorageSync('__plantsight_e2e_diagnosis_modals__', [])

    const pack = data => ({ code: 200, data })
    const clone = value => {
      try {
        return JSON.parse(JSON.stringify(value || null))
      } catch {
        return String(value)
      }
    }
    const appendStored = (key, value) => {
      if (!wxRef) {
        return
      }
      const current = wxRef.getStorageSync(key)
      const items = Array.isArray(current) ? current : []
      items.push(clone(value))
      wxRef.setStorageSync(key, items)
    }
    const packageResult = () => ({
      diagnosisSessionId: 'e2e_pest_session',
      roundId: 'round_2',
      stage: 'question_package',
      status: 'active',
      diagnosisProfile: 'pest',
      questionPackage: {
        mode: 'specific_pest_visual',
        packageKey: 'specific_pest_visual',
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        questionCount: 1,
        candidateModes: ['spider_mite', 'whitefly'],
        hiddenPrefilledEvidence: [
          {
            evidenceKey: 'fine_webbing',
            diagnosisMode: 'spider_mite',
            routeEvidenceRole: 'confirmation_candidate'
          },
          {
            evidenceKey: 'white_flies',
            diagnosisMode: 'whitefly',
            routeEvidenceRole: 'confirmation_candidate'
          }
        ]
      },
      uiHints: {
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        maxQuestionsThisRound: 1
      },
      questions: [
        {
          questionId: 'pest_risk_leaf_under',
          questionKey: 'pest_risk_leaf_under',
          questionTextUserCn: '请翻看叶背，确认是否还能看到活动小虫或细网。',
          riskNotice: '需要翻动叶片，不方便操作时可以跳过。',
          safetyInstructions: '动作放轻，避免折断叶片。',
          requiresExplicitConsent: true,
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'positive', optionTextUserCn: '能看到' },
            { optionId: 'negative', optionTextUserCn: '没看到' },
            { optionId: 'unknown', optionTextUserCn: '不确定' }
          ]
        }
      ],
      answerRevision: 1
    })
    const fullQuestionStartPackageResult = () => ({
      diagnosisSessionId: 'e2e_full_question_session',
      roundId: 'round_1',
      roundIndex: 1,
      currentRoundIndex: 1,
      currentRoundId: 'round_1',
      stage: 'question_package',
      status: 'active',
      sessionStatus: 'awaiting_package_answers',
      diagnosisProfile: 'full',
      routePrimaryAction: 'ask_first',
      questionRequired: true,
      questionPackage: {
        mode: 'yellow_leaf',
        route: 'yellow_leaf',
        sourceMode: 'manual_yellowing_care_environment_frontloaded',
        questionCount: 3,
        packageTopics: [
          'watering_frequency_context',
          'light_change_context',
          'fertilization_growth_context'
        ],
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        fixedQuestionPackage: true
      },
      uiHints: {
        canUploadMoreImages: false,
        maxQuestionsThisRound: 3,
        answerSubmitMode: 'package',
        questionDisplayMode: 'package',
        sourceMode: 'manual_yellowing_care_environment_frontloaded'
      },
      questions: [
        {
          questionId: 'watering_frequency_context',
          questionKey: 'watering_frequency_context',
          questionText: '最近浇水的频率大致如何？',
          text: '最近浇水的频率大致如何？',
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'often', optionKey: 'often', text: '浇得比较勤' },
            { optionId: 'moderate', optionKey: 'moderate', text: '按土壤干湿浇水' },
            { optionId: 'unknown', optionKey: 'unknown', text: '不确定' }
          ]
        },
        {
          questionId: 'light_change_context',
          questionKey: 'light_change_context',
          questionText: '最近光照环境是否有明显变化？',
          text: '最近光照环境是否有明显变化？',
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'yes', optionKey: 'yes', text: '有明显变化' },
            { optionId: 'no', optionKey: 'no', text: '没有明显变化' },
            { optionId: 'unknown', optionKey: 'unknown', text: '不确定' }
          ]
        },
        {
          questionId: 'fertilization_growth_context',
          questionKey: 'fertilization_growth_context',
          questionText: '最近是否施肥或出现生长变化？',
          text: '最近是否施肥或出现生长变化？',
          defaultOptionId: 'unknown',
          options: [
            { optionId: 'yes', optionKey: 'yes', text: '有' },
            { optionId: 'no', optionKey: 'no', text: '没有' },
            { optionId: 'unknown', optionKey: 'unknown', text: '不确定' }
          ]
        }
      ],
      metrics: {
        questionStartPath: 'static_question_package'
      }
    })
    const retakeRequestResult = () => ({
      diagnosisSessionId: 'e2e_pest_session',
      roundId: 'round_3',
      stage: 'intermediate',
      status: 'active',
      diagnosisProfile: 'pest',
      retakeRequest: {
        status: 'needs_confirmation',
        requestedCaptureRegion: 'leaf_lower_surface',
        reason: 'specific_pest_confirmation_needed',
        howToCapture: '靠近叶背拍清楚，保持画面稳定。',
        riskLevel: 'medium',
        riskNotice: '需要翻动叶片，虫体可能受惊移动。',
        safetyInstructions: ['动作放轻，避免折断叶片。', '不方便操作时直接跳过。'],
        requiresExplicitConsent: true,
        skipOptionEnabled: true,
        skipAnswerValue: 'unknown'
      },
      uiHints: { canUploadMoreImages: false },
      answerRevision: 2
    })
    const retakeAuthorization = () => {
      const serverNow = Date.now()
      const expired =
        wxRef?.getStorageSync('__plantsight_e2e_diagnosis_retake_mode__') === 'expired'
      return {
        status: 'active',
        retakeAuthorizationId: 'e2e_retake_authorized',
        requestedCaptureRegion: 'leaf_lower_surface',
        originVisualCallBatchId: 'e2e_visual_batch_initial',
        serverNow,
        retakeStartedAt: serverNow,
        retakeExpiresAt: expired ? serverNow - 1000 : serverNow + 180000
      }
    }
    const skippedRetakeResult = () => ({
      ...retakeRequestResult(),
      stage: 'result',
      status: 'closed',
      sessionStatus: 'completed',
      stopReason: 'retake_skipped_unknown',
      outcomeType: 'uncertain',
      retakeRequest: {
        ...retakeRequestResult().retakeRequest,
        status: 'skipped_unknown',
        answerValue: 'unknown'
      },
      retakeAuthorizationState: {
        status: 'skipped_unknown',
        answerValue: 'unknown',
        serverNow: Date.now()
      },
      finalResult: {
        resultId: 'e2e_pest_session_retake_skipped_unknown',
        summary: '已跳过这次补拍，本次诊断暂不能继续判断。',
        outcomeType: 'uncertain',
        visibleOutcomes: []
      }
    })
    const fixtureFor = opts => {
      const url = String(opts.url || '')
      const data = opts.data || {}
      // This must stay before the visual start branch: the no-image question-start
      // endpoint has its own fixed package contract and must never fall through to a
      // live local function during this deterministic replay.
      if (url.includes('diagnose-http/diagnosis/question/start')) {
        return pack(fullQuestionStartPackageResult())
      }
      if (url.includes('diagnose-http/diagnosis/start')) {
        return pack({
          diagnosisSessionId: 'e2e_pest_session',
          roundId: 'round_1',
          stage: 'intermediate',
          status: 'active',
          diagnosisProfile: data.diagnosisProfile || 'pest',
          routePrimaryAction: 'choose_direction',
          directionChoices: [
            {
              directionKey: 'pest',
              modeKey: 'pest',
              problemKey: 'pest',
              userDisplayName: '虫害：红蜘蛛、粉虱',
              recommended: true,
              associatedModeKeys: ['spider_mite', 'whitefly']
            }
          ],
          directMatches: [
            { modeKey: 'spider_mite', userDisplayName: '红蜘蛛' },
            { modeKey: 'whitefly', userDisplayName: '粉虱' }
          ],
          recommendedDirection: 'pest',
          recommendedMode: 'pest',
          answerRevision: 0
        })
      }
      if (url.includes('diagnose-http/diagnosis/answer')) {
        if (data.directionChoice || data.directionChoiceKey || data.selectedModeKey) {
          return pack(packageResult())
        }
        if (data.requestMode === 'answer_submit') {
          return pack(retakeRequestResult())
        }
        return null
      }
      if (url.includes('diagnose-http/diagnosis/retake/authorize')) {
        return pack(retakeAuthorization())
      }
      if (url.includes('diagnose-http/diagnosis/retake/skip')) {
        return pack(skippedRetakeResult())
      }
      if (
        String(opts.method || 'GET').toUpperCase() === 'GET' &&
        url.split('?')[0].endsWith('plant-user-http/user-plants')
      ) {
        return pack({
          list: [
            {
              id: 90001,
              plantId: 101,
              canonicalName: '端上验收植物',
              displayName: '端上验收植物',
              sourceType: 'catalog',
              wateringReminder: null
            }
          ],
          total: 1
        })
      }
      return null
    }
    const patch = original =>
      function request(opts = {}) {
        const captured = {
          url: String(opts.url || ''),
          method: String(opts.method || 'GET'),
          data: clone(opts.data),
          time: Date.now(),
          fixture: Boolean(globalThis.__e2eDiagnosisFixtureEnabled)
        }
        const fixtureResponse = globalThis.__e2eDiagnosisFixtureEnabled ? fixtureFor(opts) : null
        if (fixtureResponse) {
          captured.response = { statusCode: 200, data: fixtureResponse }
          globalThis.__e2eDiagnosisRequests.push(captured)
          appendStored('__plantsight_e2e_diagnosis_requests__', captured)
          setTimeout(() => {
            opts.success?.({ statusCode: 200, data: fixtureResponse })
            opts.complete?.({ statusCode: 200, data: fixtureResponse })
          }, 20)
          return { onChunkReceived() {}, abort() {} }
        }
        const origSuccess = opts.success
        const origFail = opts.fail
        opts.success = res => {
          captured.response = { statusCode: res?.statusCode, data: clone(res?.data) }
          globalThis.__e2eDiagnosisRequests.push(captured)
          appendStored('__plantsight_e2e_diagnosis_requests__', captured)
          return origSuccess?.(res)
        }
        opts.fail = error => {
          captured.error = String(error?.errMsg || error?.message || error)
          globalThis.__e2eDiagnosisRequests.push(captured)
          appendStored('__plantsight_e2e_diagnosis_requests__', captured)
          return origFail?.(error)
        }
        return original.call(this, opts)
      }
    if (uniRef && originalUniRequest) {
      uniRef.request = patch(originalUniRequest)
    }
    if (wxRef && originalWxRequest) {
      wxRef.request = patch(originalWxRequest)
    }
    const patchShowModal = () => opts => {
      globalThis.__e2eDiagnosisModals.push(clone(opts))
      appendStored('__plantsight_e2e_diagnosis_modals__', opts)
      setTimeout(() => {
        const response = { confirm: true, cancel: false }
        opts.success?.(response)
        opts.complete?.(response)
      }, 20)
      return Promise.resolve({ confirm: true, cancel: false })
    }
    if (uniRef && originalUniShowModal) {
      uniRef.showModal = patchShowModal()
    }
    if (wxRef && originalWxShowModal) {
      wxRef.showModal = patchShowModal()
    }
  })
  // Now that request interception is active and the user store is patched to the fixture
  // identity, invoke the REAL product plantStore.getUserPlants() path so the home page's
  // onMounted -> ensureLogin -> loadUserPlants chain is exercised through the actual store
  // action. First invalidate any cached user-plants query so the real request runs and the
  // fixture mock is consumed (a stale cache would prevent the request and leave the home
  // tab showing the developer's real plant list or an empty list).
  await miniProgram.evaluate(async () => {
    try {
      const { queryClient } = require('lib/query-client.js')
      const { invalidateUserPlantsQuery } = require('vue-query/plants/queries/user-plants.js')
      // Clear cached user-plants so the real fetchQuery runs against the fixture mock.
      if (typeof invalidateUserPlantsQuery === 'function') {
        await invalidateUserPlantsQuery()
      } else if (queryClient?.invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: ['http-function', 'plant-user-http', 'user-plants'] })
      }
      const pinia = require('store/index.js').pinia
      const usePlantStore = require('store/plants.js').usePlantStore || require('store/plants.js').default
      const plantStore = usePlantStore(pinia)
      // Call the real product store action; it issues plant-user-http/user-plants which the
      // fixture intercepts and returns plant 90001.
      await plantStore.getUserPlants()
    } catch (error) {
      globalThis.__e2ePlantLoadError = String(error?.message || error)
    }
  })
  // Prove the fixture plant was loaded into the real product store before the five-tab
  // test starts. Fail with a narrow diagnostic if not.
  const plantCheck = await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const usePlantStore = require('store/plants.js').usePlantStore || require('store/plants.js').default
      const plantStore = usePlantStore(pinia)
      const plants = Array.isArray(plantStore.userPlants) ? plantStore.userPlants : []
      return {
        count: plants.length,
        hasFixturePlant: plants.some(p => Number(p.id) === 90001),
        plantIds: plants.map(p => p.id),
        loadError: globalThis.__e2ePlantLoadError || ''
      }
    } catch (error) {
      return { count: 0, hasFixturePlant: false, plantIds: [], loadError: String(error?.message || error) }
    }
  })
  if (!plantCheck.hasFixturePlant) {
    throw new Error(
      `[installHarness] fixture plant 90001 not loaded into plantStore: ${JSON.stringify(plantCheck)}`
    )
  }
}

async function restoreHarness(miniProgram) {
  if (!miniProgram) {
    return
  }
  // Restore the user's real DevTools session: both the persisted storage payload and the
  // live in-memory user store state, so the fixture never leaks into the user's session.
  await miniProgram.evaluate(() => {
    try {
      const pinia = require('store/index.js').pinia
      const useUserStore = require('store/user.js').useUserStore || require('store/user.js').default
      const userStore = useUserStore(pinia)
      const originalState = globalThis.__e2eOriginalUserState
      if (originalState && typeof originalState === 'object') {
        userStore.$patch({
          userId: originalState.userId || '',
          openid: originalState.openid || '',
          union_id: originalState.union_id || '',
          username: originalState.username || '',
          nickname: originalState.nickname || '植物爱好者',
          avatar: originalState.avatar || '',
          email: originalState.email || '',
          phoneNumber: originalState.phoneNumber || '',
          location: originalState.location || { province: '', city: '', latitude: 0, longitude: 0 },
          membership: originalState.membership || { type: 'free', expireTime: null, freeQuota: 5, usedCount: 0 },
          isLoggedIn: Boolean(originalState.isLoggedIn),
          token: originalState.token || '',
          lastRefreshTime: originalState.lastRefreshTime || 0
        })
      }
    } catch (error) {
      globalThis.__e2eUserRestoreError = String(error?.message || error)
    }
    // Restore the original plant store state (userPlants + currentPlant) so the fixture
    // plant 90001 does not leak into the developer's DevTools session.
    try {
      const pinia = require('store/index.js').pinia
      const usePlantStore = require('store/plants.js').usePlantStore || require('store/plants.js').default
      const plantStore = usePlantStore(pinia)
      const originalPlantState = globalThis.__e2eOriginalPlantState
      if (originalPlantState && typeof originalPlantState === 'object') {
        plantStore.$patch({
          userPlants: Array.isArray(originalPlantState.userPlants)
            ? originalPlantState.userPlants
            : [],
          currentPlant: originalPlantState.currentPlant || null
        })
      }
    } catch (error) {
      globalThis.__e2ePlantRestoreError = String(error?.message || error)
    }
    try {
      if (typeof wx !== 'undefined') {
        const originalStorage = globalThis.__e2eOriginalUserStorage
        if (originalStorage === null || originalStorage === undefined) {
          wx.removeStorageSync('user')
        } else {
          wx.setStorageSync('user', originalStorage)
        }
      }
    } catch (error) {
      globalThis.__e2eStorageRestoreError = String(error?.message || error)
    }
  })
  await miniProgram.evaluate(() => {
    const uniRef = (() => {
      try {
        return require('common/vendor.js')?.index || null
      } catch {
        return typeof uni !== 'undefined' ? uni : null
      }
    })()
    if (globalThis.__e2eDiagnosisOriginalUniRequest && uniRef) {
      uniRef.request = globalThis.__e2eDiagnosisOriginalUniRequest
    }
    if (globalThis.__e2eDiagnosisOriginalWxRequest && typeof wx !== 'undefined') {
      wx.request = globalThis.__e2eDiagnosisOriginalWxRequest
    }
    if (globalThis.__e2eDiagnosisOriginalUniShowModal && uniRef) {
      uniRef.showModal = globalThis.__e2eDiagnosisOriginalUniShowModal
    }
    if (globalThis.__e2eDiagnosisOriginalWxShowModal && typeof wx !== 'undefined') {
      wx.showModal = globalThis.__e2eDiagnosisOriginalWxShowModal
    }
  })
}

async function readRequests(miniProgram) {
  return (await miniProgram.callWxMethod('getStorageSync', REQUEST_LOG_STORAGE_KEY)) || []
}

async function readModals(miniProgram) {
  return (await miniProgram.callWxMethod('getStorageSync', MODAL_LOG_STORAGE_KEY)) || []
}

async function resetDiagnosisTab(report, miniProgram, scenarioName) {
  const currentPage = await runAutomatorStep(report, `${scenarioName}.currentPageBeforeReset`, () =>
    miniProgram.currentPage()
  )
  if (currentPage?.path === 'pages/diagnose/question-package') {
    const backControl = await assertElement(
      report,
      currentPage,
      '#layout-left-action',
      `${scenarioName} question package back control visible`
    )
    // Capture the page stack BEFORE the back tap so a future navigation failure is
    // actionable: records stack length and each page path, plus whether the control
    // was found (i.e. whether the tap can dispatch the goBack handler at all).
    const stackBefore = await miniProgram.evaluate(() => {
      try {
        const pages = (typeof getCurrentPages === 'function' ? getCurrentPages() : []) || []
        return {
          length: pages.length,
          paths: pages.map(p => p?.route || p?.path || ''),
          getCurrentPagesAvailable: typeof getCurrentPages === 'function'
        }
      } catch (error) {
        return { length: -1, paths: [], error: String(error?.message || error) }
      }
    })
    await runAutomatorStep(report, `${scenarioName}.tap:layout-left-action`, async () => {
      if (!backControl) {
        throw new Error('layout-left-action not found')
      }
      await backControl.tap()
    })
    await runAutomatorStep(report, `${scenarioName}.waitForDiagnoseTabAfterBackTap`, async () => {
      const returnedPage = await waitForPagePath(miniProgram, 'pages/diagnose/diagnose')
      const passed = returnedPage?.path === 'pages/diagnose/diagnose'
      // Capture the page stack AFTER the back tap to expose whether navigateBack
      // dispatched, fell back, or no-op'd.
      const stackAfter = passed
        ? null
        : await miniProgram.evaluate(() => {
            try {
              const pages = (typeof getCurrentPages === 'function' ? getCurrentPages() : []) || []
              return {
                length: pages.length,
                paths: pages.map(p => p?.route || p?.path || '')
              }
            } catch (error) {
              return { length: -1, paths: [], error: String(error?.message || error) }
            }
          })
      recordAssertion(
        report,
        `${scenarioName} leaves question package through the visible back control`,
        passed,
        JSON.stringify({
          beforeTap: stackBefore,
          afterTap: stackAfter,
          finalPage: returnedPage?.path || ''
        })
      )
      if (!passed) {
        throw new Error(
          `expected pages/diagnose/diagnose, got ${returnedPage?.path || 'unknown'}; stackBefore=${JSON.stringify(stackBefore)}`
        )
      }
    })
  }
  return runAutomatorStep(report, `${scenarioName}.reLaunch:pages/diagnose/diagnose`, () =>
    miniProgram.reLaunch('/pages/diagnose/diagnose')
  )
}

async function runFiveTabAndReuseScenario(report, miniProgram, wsEndpoint, artifactDir) {
  // installHarness has already patched the live user store to the fixture identity, so the
  // home page will read isAuthenticated=true. The five-tab loop below visits the home tab
  // first via miniProgram.switchTab(tab.path), which is the supported navigation path.
  // A top-level reLaunch('/pages/index/index') was removed: main QA r3 proved it hangs the
  // live automator for exactly 10s before any product assertion.
  const tabs = [
    { key: 'home', path: '/pages/index/index', expected: 'pages/index/index', root: 'index-page' },
    {
      key: 'calendar',
      path: '/pages/calendar/calendar',
      expected: 'pages/calendar/calendar'
    },
    {
      key: 'diagnose',
      path: '/pages/diagnose/diagnose',
      expected: 'pages/diagnose/diagnose',
      root: 'diagnose-tab-page'
    },
    {
      key: 'reminder',
      path: '/pages/reminder/reminder',
      expected: 'pages/reminder/reminder',
      root: 'reminder-tab-page'
    },
    {
      key: 'profile',
      path: '/pages/profile/profile',
      expected: 'pages/profile/profile',
      root: 'profile-diagnose-history-section'
    }
  ]

  for (const tab of tabs) {
    const page = await miniProgram.switchTab(tab.path)
    recordAssertion(
      report,
      `five-tab route visible: ${tab.key}`,
      page?.path === tab.expected,
      page?.path
    )
    if (tab.root) {
      await assertElement(report, page, `#${tab.root}`, `five-tab root visible: ${tab.key}`, 4000)
    }
    await recordShot(report, miniProgram, wsEndpoint, artifactDir, `00-tab-${tab.key}`)

    if (tab.key === 'home') {
      // Wait for the real plant list to render via the mocked user-plants response.
      // The fixture user store is seeded in installHarness, so ensureLogin => loadUserPlants
      // should have run. We probe for the plant card entry with a bounded window and, if it
      // is absent, record a specific visible=false assertion with diagnostic context instead
      // of letting downstream popup waits degrade into a generic timeout.
      const diagnoseEntry = await findByIdContains(page, 'diagnose-entry-button-', 4000)
      recordAssertion(report, 'plant card diagnosis entry visible', Boolean(diagnoseEntry))
      if (!diagnoseEntry) {
        // Record why the entry is missing so the root cause is observable, then skip the
        // popup/flow assertions and continue to the next tab safely.
        const indexRoot = await findBySemanticId(page, 'index-page')
        const loginButton = await findBySemanticId(page, 'index-phone-login-button')
        const quickLoginButton = await findBySemanticId(page, 'index-quick-login-button')
        const emptyHint = await findBySemanticId(page, 'index-plant-list')
        recordAssertion(
          report,
          'plant card diagnosis entry missing: home page state diagnostic',
          false,
          JSON.stringify({
            hasIndexRoot: Boolean(indexRoot),
            hasLoginButton: Boolean(loginButton),
            hasQuickLoginButton: Boolean(quickLoginButton),
            hasPlantList: Boolean(emptyHint),
            interpretation: loginButton || quickLoginButton
              ? 'home page shows login prompt (fixture user not rehydrated)'
              : emptyHint
                ? 'home page has plant list but no PlantCard (mock user-plants not consumed)'
                : 'home page in unexpected state'
          })
        )
      } else {
        await diagnoseEntry.tap()
        await sleep(700)
        const popupPanel = await assertElement(
          report,
          page,
          '#diagnose-popup-panel',
          'plant card DiagnosePopup opens',
          4000
        )
        const sharedFlow = await assertElement(
          report,
          page,
          '#diagnose-flow',
          'plant card popup reuses DiagnoseFlow',
          4000
        )
        recordAssertion(
          report,
          'DiagnosePopup keeps shared flow core',
          Boolean(popupPanel && sharedFlow)
        )
        await recordShot(report, miniProgram, wsEndpoint, artifactDir, '00-home-diagnose-popup')
        const popupClose = await findBySemanticId(page, 'diagnose-popup-close-button')
        if (popupClose) {
          await popupClose.tap()
          await sleep(300)
        }
      }
    }

    if (tab.key === 'reminder') {
      const waterEntry = await findByIdContains(page, 'reminder-tab-water-', 4000)
      recordAssertion(report, 'reminder tab exposes watering branch', Boolean(waterEntry))
      if (waterEntry) {
        await waterEntry.tap()
        await sleep(700)
      }
      const wateringSheet = await assertElement(
        report,
        page,
        '#watering-reminder-sheet',
        'reminder tab reuses WateringReminderSheet',
        4000
      )
      recordAssertion(
        report,
        'reminder tab does not expose fertilizing branch',
        !(await findByIdContains(page, 'fertiliz', 500))
      )
      await recordShot(report, miniProgram, wsEndpoint, artifactDir, '00-reminder-watering-sheet')
      const reminderClose = await findBySemanticId(page, 'watering-reminder-close-button')
      if (wateringSheet && reminderClose) {
        await reminderClose.tap()
        await sleep(300)
      }
    }
  }
}

async function runShortcutScenario(report, miniProgram, wsEndpoint, artifactDir) {
  const page = await resetDiagnosisTab(report, miniProgram, 'fullShortcut')
  const requestBaseline = (await readRequests(miniProgram)).length
  report.pagePath = 'pages/diagnose/diagnose'
  await sleep(900)
  const fullButton = await assertElement(report, page, '#diagnose-profile-full-button', 'full profile button visible')
  await assertElement(report, page, '#diagnose-profile-pest-button', 'pest profile button visible')
  await assertElement(report, page, '#diagnose-no-image-entry-panel', 'quick entry panel visible')
  // Explicitly select the full profile before tapping the yellow shortcut. This scenario
  // runs after pest scenarios which leave the profile as 'pest'; without this tap,
  // handleSymptomClassQuickSelect correctly declines no-image question start for pest.
  // Tapping full restores the profile the yellow shortcut requires.
  if (fullButton) {
    await fullButton.tap()
    await sleep(300)
  }
  const yellow = await assertElement(
    report,
    page,
    '#diagnose-dev-symptom-class-option-yellowing_mode',
    'yellow shortcut visible'
  )
  const wilt = await assertElement(
    report,
    page,
    '#diagnose-dev-symptom-class-option-wilting_droop_mode',
    'wilting shortcut visible'
  )
  if (yellow) {
    await yellow.tap()
    await sleep(300)
  }
  recordAssertion(report, 'yellow and wilting quick entries are separate', Boolean(yellow && wilt))
  const questionPage = await waitForPagePath(miniProgram, 'pages/diagnose/question-package')
  recordAssertion(
    report,
    'yellow shortcut enters existing question package page',
    questionPage?.path === 'pages/diagnose/question-package',
    questionPage?.path
  )
  const shortcutRequests = (await readRequests(miniProgram)).slice(requestBaseline)
  const questionStartRequest = shortcutRequests.find(req =>
    String(req.url).includes('diagnose-http/diagnosis/question/start')
  )
  recordAssertion(
    report,
    'yellow shortcut uses real no-image question start request',
    Boolean(questionStartRequest) &&
      questionStartRequest.data?.diagnosisProfile === 'full' &&
      questionStartRequest.data?.symptomClassKey === 'yellowing_mode' &&
      !questionStartRequest.data?.image &&
      !questionStartRequest.data?.images,
    questionStartRequest?.url || ''
  )
  const questionStartFixtureResult = questionStartRequest?.response?.data?.data || {}
  recordAssertion(
    report,
    'yellow shortcut question start fixture returns the fixed question package',
    questionStartRequest?.response?.statusCode === 200 &&
      questionStartFixtureResult.diagnosisSessionId === 'e2e_full_question_session' &&
      questionStartFixtureResult.roundId === 'round_1' &&
      Array.isArray(questionStartFixtureResult.questions) &&
      questionStartFixtureResult.questions.length === 3 &&
      questionStartFixtureResult.questionPackage?.mode === 'yellow_leaf' &&
      questionStartFixtureResult.questionPackage?.questionCount ===
        questionStartFixtureResult.questions.length &&
      questionStartFixtureResult.questionPackage?.answerSubmitMode === 'package' &&
      questionStartFixtureResult.uiHints?.questionDisplayMode === 'package',
    JSON.stringify({
      statusCode: questionStartRequest?.response?.statusCode,
      diagnosisSessionId: questionStartFixtureResult.diagnosisSessionId,
      roundId: questionStartFixtureResult.roundId,
      questionCount: questionStartFixtureResult.questions?.length,
      questionPackage: questionStartFixtureResult.questionPackage,
      uiHints: questionStartFixtureResult.uiHints
    })
  )
  recordAssertion(
    report,
    'yellow shortcut does not invoke visual diagnosis start',
    !shortcutRequests.some(req => String(req.url).includes('diagnose-http/diagnosis/start'))
  )
  recordAssertion(
    report,
    'standalone yellow shortcut never patches anonymous plant placeholder',
    !shortcutRequests.some(
      req =>
        String(req.url).includes('plant-user-http/user-plants') &&
        String(req.data?.id || '').includes('diagnose_tab_anonymous')
    )
  )
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, '01-full-shortcuts')
}

async function injectPestImage(report, page) {
  const inject = await assertElement(
    report,
    page,
    '#diagnose-automation-inject-button',
    'automation image injection hook present'
  )
  if (inject) {
    await inject.tap()
    await sleep(500)
  }
  const uploadCount = await assertElement(
    report,
    page,
    '#diagnose-upload-count',
    'upload count visible'
  )
  const uploadText = uploadCount ? await safeText(uploadCount) : ''
  recordAssertion(
    report,
    'automation image injected into pest flow',
    /1/.test(uploadText),
    uploadText
  )
}

async function runPestScenario(report, miniProgram, wsEndpoint, artifactDir, retakeMode) {
  const page = await resetDiagnosisTab(report, miniProgram, `pest.${retakeMode}`)
  recordAssertion(
    report,
    `diagnosis page re-entry resets before ${retakeMode} scenario`,
    page?.path === 'pages/diagnose/diagnose',
    page?.path || ''
  )
  await runAutomatorStep(report, `pest.${retakeMode}.setFixtureRetakeMode`, () =>
    setFixtureRetakeMode(miniProgram, retakeMode)
  )
  await runAutomatorStep(report, `pest.${retakeMode}.seedAutomationImage`, () =>
    seedAutomationImage(miniProgram)
  )
  await sleep(900)
  const pest = await assertElement(
    report,
    page,
    '#diagnose-profile-pest-button',
    'pest profile button visible'
  )
  if (pest) {
    await pest.tap()
    await sleep(300)
  }
  await injectPestImage(report, page)
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `02-pest-image-${retakeMode}`)
  const submit = await assertElement(report, page, '#diagnose-submit-button', 'pest submit visible')
  if (submit) {
    await submit.tap()
    await sleep(1200)
  }
  const confirm = await assertElement(
    report,
    page,
    '#ai-stream-confirm-button',
    'stream dialog confirm visible'
  )
  if (confirm) {
    await confirm.tap()
    await sleep(800)
  }
  const directionCard = await assertElement(
    report,
    page,
    '#diagnose-direction-choice-card',
    'direction card visible'
  )
  const directionText = directionCard ? await safeText(directionCard) : ''
  recordAssertion(
    report,
    'multi pest direction is user observable',
    directionText.includes('红蜘蛛') && directionText.includes('粉虱'),
    directionText
  )
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `03-direction-${retakeMode}`)
  const choice =
    (await findBySemanticId(page, 'diagnose-direction-choice-pest')) ||
    (await findByIdContains(page, 'diagnose-direction-choice-', 2000))
  recordAssertion(report, 'direction choice is tappable', Boolean(choice))
  if (choice) {
    await choice.tap()
    await sleep(1000)
  }
  const questionPage = await waitForPagePath(miniProgram, 'pages/diagnose/question-package')
  recordAssertion(
    report,
    'pest direction enters common question package page',
    questionPage?.path === 'pages/diagnose/question-package',
    questionPage?.path
  )
  const packageRoot = await assertElement(
    report,
    questionPage,
    '#diagnose-question-package-page',
    'common question package page visible'
  )
  const packagePageText = packageRoot ? await safeText(packageRoot) : ''
  recordAssertion(
    report,
    'common question package page shows pest context',
    packagePageText.includes('虫害细节确认'),
    packagePageText
  )
  const packageRequestBaseline = (await readRequests(miniProgram)).length
  const skip = await assertElement(
    report,
    questionPage,
    '#diagnose-question-risk-skip-pest_risk_leaf_under',
    'one-question package risk skip visible'
  )
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `04-risk-${retakeMode}`)
  if (skip) {
    await skip.tap()
    await sleep(1000)
  }
  const packageRequests = (await readRequests(miniProgram))
    .slice(packageRequestBaseline)
    .filter(req => String(req.url).includes('diagnose-http/diagnosis/answer'))
  const packageSubmitRequest = packageRequests.find(
    req => req.data?.requestMode === 'answer_submit'
  )
  const submittedQuestionPackage = packageSubmitRequest?.data?.questionPackage || {}
  recordAssertion(
    report,
    'first one-question package request is answer_submit, never answer_revision',
    packageRequests.length > 0 &&
      packageRequests[0]?.data?.requestMode === 'answer_submit' &&
      !packageRequests.some(req => req.data?.requestMode === 'answer_revision'),
    packageRequests.map(req => req.data?.requestMode || '').join(',')
  )
  recordAssertion(
    report,
    'answer_submit includes the complete declared package',
    Array.isArray(packageSubmitRequest?.data?.answers) &&
      packageSubmitRequest.data.answers.length === submittedQuestionPackage.questionCount,
    JSON.stringify({
      answerCount: packageSubmitRequest?.data?.answers?.length,
      questionCount: submittedQuestionPackage.questionCount
    })
  )
  recordAssertion(
    report,
    'answer_submit preserves candidate modes and hidden visual evidence',
    JSON.stringify(submittedQuestionPackage.candidateModes) ===
      JSON.stringify(['spider_mite', 'whitefly']) &&
      JSON.stringify(submittedQuestionPackage.hiddenPrefilledEvidence) ===
        JSON.stringify([
          {
            evidenceKey: 'fine_webbing',
            diagnosisMode: 'spider_mite',
            routeEvidenceRole: 'confirmation_candidate'
          },
          {
            evidenceKey: 'white_flies',
            diagnosisMode: 'whitefly',
            routeEvidenceRole: 'confirmation_candidate'
          }
        ]),
    JSON.stringify(submittedQuestionPackage)
  )
  recordAssertion(
    report,
    'package submit fixture advances to the expected retake state',
    packageSubmitRequest?.response?.data?.data?.retakeRequest?.status === 'needs_confirmation',
    packageSubmitRequest?.response?.data?.data?.retakeRequest?.status || ''
  )
  const currentPage = await miniProgram.currentPage()
  const retakeCard = await assertElement(
    report,
    currentPage,
    '#diagnose-retake-card',
    'retake card visible'
  )
  const retakeStart = await findBySemanticId(currentPage, 'diagnose-retake-start-button')
  recordAssertion(report, 'retake waits for explicit start confirmation', Boolean(retakeStart))
  if (retakeMode === 'skip') {
    const retakeSkip = await assertElement(
      report,
      currentPage,
      '#diagnose-retake-skip-button',
      'retake risk skip button visible'
    )
    if (retakeSkip) {
      await retakeSkip.tap()
      await sleep(900)
    }
    const skippedText = await assertElement(
      report,
      currentPage,
      '#diagnose-retake-skipped-text',
      'server-persisted retake skip terminal visible'
    )
    const skippedCardText = await safeText(
      await findBySemanticId(currentPage, 'diagnose-retake-card')
    )
    recordAssertion(
      report,
      'retake skip stays unknown and cannot restart',
      Boolean(skippedText) &&
        skippedCardText.includes('暂不能继续判断') &&
        !(await findBySemanticId(currentPage, 'diagnose-retake-start-button')),
      skippedCardText
    )
    await recordShot(report, miniProgram, wsEndpoint, artifactDir, '05-retake-skip-terminal')
    return
  }
  if (retakeStart) {
    await retakeStart.tap()
    await sleep(900)
  }
  const countdown = await findBySemanticId(currentPage, 'diagnose-retake-countdown')
  const expiredText = await findBySemanticId(currentPage, 'diagnose-retake-expired-text')
  if (retakeMode === 'active') {
    const text = countdown ? await safeText(countdown) : ''
    recordAssertion(
      report,
      'server-authorized retake countdown visible',
      /剩余\s+\d+:\d{2}/.test(text),
      text
    )
  } else {
    const text = retakeCard ? await safeText(retakeCard) : ''
    recordAssertion(
      report,
      'terminal retake timeout visible',
      Boolean(expiredText) && text.includes('本次诊断已结束'),
      text
    )
  }
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `05-retake-${retakeMode}`)
}

export async function runPestModeAndRetakeScenario({
  wsEndpoint = DEFAULT_WS_ENDPOINT,
  dryRun = process.env.DRY_RUN === '1',
  artifactDir = DEFAULT_ARTIFACT_DIR,
  fixtureEnabled = process.env.E2E_DIAGNOSE_FIXTURE !== '0'
} = {}) {
  assertSourceContract()
  if (dryRun) {
    return {
      status: 'dry_source_contract_passed',
      scenarios: [
        'runtime.full_shortcuts',
        'runtime.pest_shared_question_package_answer_submit',
        'runtime.pest_direction_risk_skip_retake_countdown',
        'runtime.pest_server_skip_unknown_terminal',
        'runtime.pest_retake_terminal_timeout'
      ],
      fixture_injection_path:
        'E2E_DIAGNOSE_FIXTURE=1 patches uni.request/wx.request in miniprogram runtime',
      not_verified: ['real model call', 'natural three-minute wall-clock wait']
    }
  }

  mkdirSync(artifactDir, { recursive: true })
  const report = createReport({ wsEndpoint, fixtureEnabled })
  const automator = await loadAutomator()
  assert.ok(automator, 'miniprogram-automator is required for runtime replay')
  let miniProgram = null
  try {
    miniProgram = await runAutomatorStep(report, 'runtime.connect', () =>
      automator.connect({ wsEndpoint })
    )
    await runAutomatorStep(report, 'runtime.installHarness', () =>
      installHarness(miniProgram, fixtureEnabled)
    )
    resetScreenshotBudget()
    await runAutomatorStep(report, 'scenario.fiveTabAndReuse', () =>
      runFiveTabAndReuseScenario(report, miniProgram, wsEndpoint, artifactDir)
    )
    await runAutomatorStep(report, 'scenario.pest.active', () =>
      runPestScenario(report, miniProgram, wsEndpoint, artifactDir, 'active')
    )
    await runAutomatorStep(report, 'scenario.pest.skip', () =>
      runPestScenario(report, miniProgram, wsEndpoint, artifactDir, 'skip')
    )
    await runAutomatorStep(report, 'scenario.pest.expired', () =>
      runPestScenario(report, miniProgram, wsEndpoint, artifactDir, 'expired')
    )
    await runAutomatorStep(report, 'scenario.fullShortcut', () =>
      runShortcutScenario(report, miniProgram, wsEndpoint, artifactDir)
    )
    report.requests = await runAutomatorStep(report, 'evidence.readRequests', () =>
      readRequests(miniProgram)
    )
    report.modals = await runAutomatorStep(report, 'evidence.readModals', () =>
      readModals(miniProgram)
    )
    recordAssertion(
      report,
      'diagnose start request captured',
      report.requests.some(req => String(req.url).includes('diagnose-http/diagnosis/start'))
    )
    recordAssertion(
      report,
      'diagnose answer request captured',
      report.requests.some(req => String(req.url).includes('diagnose-http/diagnosis/answer'))
    )
    recordAssertion(
      report,
      'pest request carries injected image and pest profile',
      report.requests.some(
        req =>
          String(req.url).includes('diagnose-http/diagnosis/start') &&
          req.data?.diagnosisProfile === 'pest' &&
          Array.isArray(req.data?.images) &&
          req.data.images.length === 1
      )
    )
    recordAssertion(
      report,
      'retake authorize request captured after explicit confirmation',
      report.requests.some(req =>
        String(req.url).includes('diagnose-http/diagnosis/retake/authorize')
      )
    )
    recordAssertion(
      report,
      'retake skip request captured as server action',
      report.requests.some(req => String(req.url).includes('diagnose-http/diagnosis/retake/skip'))
    )
    recordAssertion(
      report,
      'risk and three-minute cutoff share the confirmation action',
      report.modals.some(modal => {
        const content = String(modal?.content || '')
        return (
          content.includes('虫体可能受惊移动') &&
          content.includes('避免折断叶片') &&
          content.includes('3 分钟内')
        )
      })
    )
    const screenshotEvidence = requiredScreenshotCheckpointEvidence(report)
    recordAssertion(
      report,
      'policy-external final runtime state does not invoke screenshot worker',
      screenshotEvidence.noPolicyExternalWorker,
      screenshotEvidence.detail
    )
    recordAssertion(
      report,
      'required runtime screenshot captured',
      screenshotEvidence.passed,
      screenshotEvidence.detail
    )
    report.not_verified.push({
      item: 'real vision model/provider output',
      reason: fixtureEnabled
        ? 'deterministic fixture responses were used'
        : 'judge from captured backend response'
    })
    report.not_verified.push({
      item: 'natural three-minute retake wait',
      reason: 'terminal timeout state is fixture-injected; script does not wait three minutes'
    })
    report.status = report.failures.length ? 'failed' : 'passed'
  } catch (error) {
    recordAssertion(
      report,
      'runtime scenario completed without transport error',
      false,
      String(error?.message || error)
    )
    report.status = 'failed'
  } finally {
    try {
      await runAutomatorStep(report, 'runtime.restoreHarness', () => restoreHarness(miniProgram))
    } catch (error) {
      report.not_verified.push({
        item: 'runtime harness restoration',
        reason: String(error?.message || error)
      })
    }
    try {
      miniProgram?.disconnect?.()
    } catch {
      // The runtime report still needs to be persisted when the socket is already closed.
    }
    report.endedAt = new Date().toISOString()
    const reportPath = path.resolve(artifactDir, 'pest-mode-and-retake-runtime-report.json')
    report.evidence_paths.push(reportPath)
    report.report_path = reportPath
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  }
  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPestModeAndRetakeScenario()
    .then(result => {
      console.log(JSON.stringify(result, null, 2))
      if (result.failures?.length) {
        process.exitCode = 1
      }
    })
    .catch(error => {
      console.error(error.message || error)
      process.exit(1)
    })
}
