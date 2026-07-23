import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_WS_ENDPOINT = process.env.MINIPROGRAM_AUTOMATOR_WS || 'ws://127.0.0.1:9420'
const DEFAULT_ARTIFACT_DIR =
  process.env.E2E_ARTIFACT_DIR ||
  path.resolve('.tmp/e2e/diagnosis/pest-mode-and-retake', String(Date.now()))
const REQUEST_LOG_STORAGE_KEY = '__plantsight_e2e_diagnosis_requests__'
const MODAL_LOG_STORAGE_KEY = '__plantsight_e2e_diagnosis_modals__'
const RETAKE_MODE_STORAGE_KEY = '__plantsight_e2e_diagnosis_retake_mode__'
const AUTOMATION_IMAGES_STORAGE_KEY = '__plantsight_diagnose_automation_images__'

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

async function recordShot(report, _miniProgram, _artifactDir, name) {
  report.requested_screenshots.push(name)
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

async function captureFinalShot(report, miniProgram, artifactDir, name) {
  const shotPath = path.resolve(artifactDir, `${name}.png`)
  const timeoutMs = Number(process.env.MP_SCREENSHOT_TIMEOUT_MS || 12000)
  const configuredRetries = Number(process.env.MP_SCREENSHOT_RETRIES || 2)
  const maxPathAttempts = Number.isFinite(configuredRetries)
    ? Math.max(1, configuredRetries + 1)
    : 3
  let lastError = null
  let channelTimedOut = false

  const withScreenshotTimeout = promise => {
    let timer = null
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`screenshot_timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }

  for (let attempt = 1; attempt <= maxPathAttempts; attempt += 1) {
    try {
      rmSync(shotPath, { force: true })
      const currentPage = await miniProgram.currentPage()
      report.pagePath = currentPage?.path || report.pagePath
      await sleep(attempt * 500)
      await withScreenshotTimeout(miniProgram.screenshot({ path: shotPath }))
      if (!isNonEmptyPngFile(shotPath)) {
        throw new Error('screenshot_file_missing_empty_or_not_png')
      }
      recordScreenshotAttempt(report, name, 'path', attempt, 'passed', shotPath)
      const bytes = statSync(shotPath).size
      report.screenshots.push({ name, path: shotPath, bytes })
      report.evidence_paths.push(shotPath)
      return true
    } catch (error) {
      lastError = error
      const detail = String(error?.message || error)
      channelTimedOut = detail.includes('screenshot_timeout')
      recordScreenshotAttempt(report, name, 'path', attempt, 'failed', detail)
      if (channelTimedOut) {
        break
      }
    }
  }

  if (!channelTimedOut) {
    try {
      const currentPage = await miniProgram.currentPage()
      report.pagePath = currentPage?.path || report.pagePath
      await sleep(1000)
      const raw = await withScreenshotTimeout(miniProgram.screenshot())
      const data = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || ''), 'base64')
      writeFileSync(shotPath, data)
      if (!isNonEmptyPngFile(shotPath)) {
        throw new Error('raw_screenshot_missing_empty_or_not_png')
      }
      recordScreenshotAttempt(report, name, 'raw-base64', 1, 'passed', shotPath)
      const bytes = statSync(shotPath).size
      report.screenshots.push({ name, path: shotPath, bytes })
      report.evidence_paths.push(shotPath)
      return true
    } catch (error) {
      lastError = error
      const detail = String(error?.message || error)
      channelTimedOut = detail.includes('screenshot_timeout')
      recordScreenshotAttempt(report, name, 'raw-base64', 1, 'failed', detail)
    }
  }

  report.not_verified.push({
    item: `screenshot:${name}`,
    reason: String(lastError?.message || lastError || 'screenshot capture failed')
  })
  if (channelTimedOut) {
    // A timed-out App.captureScreenshot can keep the command channel occupied.
    miniProgram.disconnect()
  }
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

async function installHarness(miniProgram, fixtureEnabled) {
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
}

async function restoreHarness(miniProgram) {
  if (!miniProgram) {
    return
  }
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
    await runAutomatorStep(report, `${scenarioName}.tap:layout-left-action`, async () => {
      if (!backControl) {
        throw new Error('layout-left-action not found')
      }
      await backControl.tap()
    })
    await runAutomatorStep(report, `${scenarioName}.waitForDiagnoseTabAfterBackTap`, async () => {
      const returnedPage = await waitForPagePath(miniProgram, 'pages/diagnose/diagnose')
      const passed = returnedPage?.path === 'pages/diagnose/diagnose'
      recordAssertion(
        report,
        `${scenarioName} leaves question package through the visible back control`,
        passed,
        returnedPage?.path || ''
      )
      if (!passed) {
        throw new Error(`expected pages/diagnose/diagnose, got ${returnedPage?.path || 'unknown'}`)
      }
    })
  }
  return runAutomatorStep(report, `${scenarioName}.reLaunch:pages/diagnose/diagnose`, () =>
    miniProgram.reLaunch('/pages/diagnose/diagnose')
  )
}

async function runFiveTabAndReuseScenario(report, miniProgram, artifactDir) {
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
    await recordShot(report, miniProgram, artifactDir, `00-tab-${tab.key}`)

    if (tab.key === 'home') {
      const diagnoseEntry = await findByIdContains(page, 'diagnose-entry-button-', 4000)
      recordAssertion(report, 'plant card diagnosis entry visible', Boolean(diagnoseEntry))
      if (diagnoseEntry) {
        await diagnoseEntry.tap()
        await sleep(700)
      }
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
      await recordShot(report, miniProgram, artifactDir, '00-home-diagnose-popup')
      const popupClose = await findBySemanticId(page, 'diagnose-popup-close-button')
      if (popupClose) {
        await popupClose.tap()
        await sleep(300)
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
      await recordShot(report, miniProgram, artifactDir, '00-reminder-watering-sheet')
      const reminderClose = await findBySemanticId(page, 'watering-reminder-close-button')
      if (wateringSheet && reminderClose) {
        await reminderClose.tap()
        await sleep(300)
      }
    }
  }
}

async function runShortcutScenario(report, miniProgram, artifactDir) {
  const page = await resetDiagnosisTab(report, miniProgram, 'fullShortcut')
  const requestBaseline = (await readRequests(miniProgram)).length
  report.pagePath = 'pages/diagnose/diagnose'
  await sleep(900)
  await assertElement(report, page, '#diagnose-profile-full-button', 'full profile button visible')
  await assertElement(report, page, '#diagnose-profile-pest-button', 'pest profile button visible')
  await assertElement(report, page, '#diagnose-no-image-entry-panel', 'quick entry panel visible')
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
  await recordShot(report, miniProgram, artifactDir, '01-full-shortcuts')
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

async function runPestScenario(report, miniProgram, artifactDir, retakeMode) {
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
  await recordShot(report, miniProgram, artifactDir, `02-pest-image-${retakeMode}`)
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
  await recordShot(report, miniProgram, artifactDir, `03-direction-${retakeMode}`)
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
  await recordShot(report, miniProgram, artifactDir, `04-risk-${retakeMode}`)
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
    await recordShot(report, miniProgram, artifactDir, '05-retake-skip-terminal')
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
  await recordShot(report, miniProgram, artifactDir, `05-retake-${retakeMode}`)
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
    await runAutomatorStep(report, 'scenario.fiveTabAndReuse', () =>
      runFiveTabAndReuseScenario(report, miniProgram, artifactDir)
    )
    await runAutomatorStep(report, 'scenario.pest.active', () =>
      runPestScenario(report, miniProgram, artifactDir, 'active')
    )
    await runAutomatorStep(report, 'scenario.pest.skip', () =>
      runPestScenario(report, miniProgram, artifactDir, 'skip')
    )
    await runAutomatorStep(report, 'scenario.pest.expired', () =>
      runPestScenario(report, miniProgram, artifactDir, 'expired')
    )
    await runAutomatorStep(report, 'scenario.fullShortcut', () =>
      runShortcutScenario(report, miniProgram, artifactDir)
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
    const screenshotCaptured = await runAutomatorStep(
      report,
      'evidence.captureScreenshot:final-runtime-state',
      () => captureFinalShot(report, miniProgram, artifactDir, 'final-runtime-state')
    )
    recordAssertion(
      report,
      'required runtime screenshot captured',
      screenshotCaptured && report.screenshots.length > 0,
      `${report.screenshots.length} real screenshot file(s)`
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
