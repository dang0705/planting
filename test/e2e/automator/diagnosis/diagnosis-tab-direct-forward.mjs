#!/usr/bin/env node
'use strict'
/* oxlint-disable no-console, no-magic-numbers */

import fs from 'node:fs'
import path from 'node:path'
import automatorPackage from 'miniprogram-automator'
import {
  connectFormalLeaf,
  disconnectFormalLeaf,
  handoffFormalLeafScreenshot,
  formalAutomatorEndpoint
} from '../_shared/formal-leaf-harness.mjs'
import {
  tapStableElement,
  waitForElement
} from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import {
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../care/watering/transpiration-v3/_shared/lib/request-capture.mjs'
import { navigateNativeTab } from './_shared/native-tab-navigation.mjs'

const HOME_ROUTE = 'pages/index/index'
const DIAGNOSIS_TAB_ROUTE = 'pages/diagnose/diagnose'
const QUESTION_PACKAGE_ROUTE = 'subpackages/diagnosis/question-package'
const DEFAULT_ARTIFACT_DIR = path.resolve(
  process.env.E2E_ARTIFACT_DIR || `.tmp/e2e/diagnosis/diagnosis-tab-common-ui/${Date.now()}`
)

const report = {
  status: 'running',
  channel: 'miniprogram-automator',
  projectPath: process.env.MP_PROJECT_PATH || 'dist/dev/mp-weixin',
  pagePath: '',
  wsEndpoint: '',
  data_mode: 'automator_live_real_api',
  auth_mode: 'persisted_real_wechat',
  mutation_policy: 'test_owned_persistent',
  assertions: [],
  failures: [],
  not_verified: [],
  screenshots: [],
  screenshot_attempts: [],
  evidence_paths: [],
  capturedRequests: [],
  runtime_logs: [],
  startedAt: new Date().toISOString(),
  endedAt: ''
}

function recordAssertion(name, passed, detail = '') {
  const assertion = { name, passed: Boolean(passed), detail, time: new Date().toISOString() }
  report.assertions.push(assertion)
  if (!assertion.passed) {
    report.failures.push({ name, detail })
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function attachRuntimeLogListener(miniProgram) {
  miniProgram?.on?.('console', event => {
    report.runtime_logs.push({
      time: new Date().toISOString(),
      data: event
    })
  })
}

async function findBySemanticId(page, semanticId, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const element = (await page.$(`#${semanticId}`)) || (await page.$(`[id$=${semanticId}]`))
    if (element) {
      return element
    }
    await sleep(200)
  }
  return null
}

async function waitForPagePath(miniProgram, expectedPath, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let page = await miniProgram.currentPage()
  while (Date.now() < deadline) {
    if (page?.path === expectedPath) {
      return page
    }
    await sleep(200)
    page = await miniProgram.currentPage()
  }
  return page
}

async function main() {
  const wsEndpoint = formalAutomatorEndpoint()
  report.wsEndpoint = wsEndpoint
  fs.mkdirSync(DEFAULT_ARTIFACT_DIR, { recursive: true })

  const automator =
    automatorPackage.default || automatorPackage['module.exports'] || automatorPackage
  let miniProgram = null
  let requestCaptureInstalled = false
  try {
    miniProgram = (await connectFormalLeaf({ automator, wsEndpoint })).mp
    attachRuntimeLogListener(miniProgram)
    await installRequestCapture(miniProgram)
    requestCaptureInstalled = true
    const homePage = await navigateNativeTab({ mp: miniProgram, logicalPath: '/pages/index/index' })
    recordAssertion(
      'diagnosis tab starts from real home page',
      homePage?.path === HOME_ROUTE,
      homePage?.path
    )

    const diagnosisTab = await navigateNativeTab({
      mp: miniProgram,
      logicalPath: '/pages/diagnose/diagnose',
      expectedRoute: DIAGNOSIS_TAB_ROUTE
    })
    recordAssertion(
      'diagnosis tab stays on its real main-package page',
      diagnosisTab?.path === DIAGNOSIS_TAB_ROUTE,
      diagnosisTab?.path
    )

    await sleep(1000)
    const stableDiagnosisTab = await waitForPagePath(miniProgram, DIAGNOSIS_TAB_ROUTE)
    report.pagePath = stableDiagnosisTab?.path || ''
    recordAssertion(
      'diagnosis tab has no automatic redirect or consecutive jump',
      stableDiagnosisTab?.path === DIAGNOSIS_TAB_ROUTE,
      stableDiagnosisTab?.path
    )

    const pageRoot = await findBySemanticId(stableDiagnosisTab, 'diagnose-tab-page')
    recordAssertion(
      'diagnosis tab main-package root is rendered',
      Boolean(pageRoot),
      '#diagnose-tab-page'
    )
    const intakeRoot = await findBySemanticId(stableDiagnosisTab, 'diagnose-tab-intake')
    recordAssertion(
      'diagnosis tab renders the real photo and no-image intake',
      Boolean(intakeRoot),
      '#diagnose-tab-intake'
    )
    const uploadStage = await findBySemanticId(stableDiagnosisTab, 'diagnose-upload-stage')
    recordAssertion(
      'diagnosis intake has no intermediary or split page',
      Boolean(uploadStage),
      '#diagnose-upload-stage'
    )

    const pageData = await stableDiagnosisTab.data()
    recordAssertion(
      'diagnosis tab page data is readable',
      Boolean(pageData && typeof pageData === 'object'),
      pageData ? Object.keys(pageData).slice(0, 12).join(',') : 'unavailable'
    )

    const screenshotPath = path.join(DEFAULT_ARTIFACT_DIR, 'diagnosis-tab-common-ui.png')
    const screenshot = await handoffFormalLeafScreenshot({
      mp: miniProgram,
      automator,
      wsEndpoint,
      outputPath: screenshotPath,
      projectPath: report.projectPath,
      expectedRoute: DIAGNOSIS_TAB_ROUTE,
      maxAttempts: 2
    })
    miniProgram = screenshot.mp
    attachRuntimeLogListener(miniProgram)
    const screenshotBytes = fs.statSync(screenshotPath).size
    const pngSignature = fs.readFileSync(screenshotPath).subarray(0, 8).toString('hex')
    const validPng = pngSignature === '89504e470d0a1a0a' && screenshotBytes > 24
    recordAssertion(
      'diagnosis tab common-ui screenshot is valid PNG',
      validPng,
      `${screenshotBytes} bytes`
    )
    report.screenshots.push({
      name: 'diagnosis-tab-common-ui',
      path: screenshotPath,
      bytes: screenshotBytes
    })
    report.screenshot_attempts.push({
      label: 'diagnosis-tab-common-ui',
      attempts: screenshot.attempts
    })
    report.evidence_paths.push(screenshotPath)

    const diagnosisTabAfterScreenshot = await waitForPagePath(miniProgram, DIAGNOSIS_TAB_ROUTE)
    const yellowingEntry = await waitForElement(
      diagnosisTabAfterScreenshot,
      'diagnose-dev-symptom-class-option-yellowing_mode'
    )
    recordAssertion(
      'diagnosis tab exposes a real user action to start no-image diagnosis',
      Boolean(yellowingEntry),
      '#diagnose-dev-symptom-class-option-yellowing_mode'
    )
    if (yellowingEntry) {
      await tapStableElement(yellowingEntry)
    }
    let questionPackage = await waitForPagePath(miniProgram, QUESTION_PACKAGE_ROUTE, 35_000)
    recordAssertion(
      'diagnosis tab user action navigates directly to the question package',
      questionPackage?.path === QUESTION_PACKAGE_ROUTE,
      questionPackage?.path || ''
    )
    if (questionPackage?.path === QUESTION_PACKAGE_ROUTE) {
      const questionScreenshotPath = path.join(
        DEFAULT_ARTIFACT_DIR,
        'diagnosis-tab-direct-question-package.png'
      )
      const questionScreenshot = await handoffFormalLeafScreenshot({
        mp: miniProgram,
        automator,
        wsEndpoint,
        outputPath: questionScreenshotPath,
        projectPath: report.projectPath,
        expectedRoute: QUESTION_PACKAGE_ROUTE,
        maxAttempts: 2
      })
      miniProgram = questionScreenshot.mp
      questionPackage = await waitForPagePath(miniProgram, QUESTION_PACKAGE_ROUTE)
      const questionScreenshotBytes = fs.statSync(questionScreenshotPath).size
      const questionPngSignature = fs
        .readFileSync(questionScreenshotPath)
        .subarray(0, 8)
        .toString('hex')
      recordAssertion(
        'direct question package screenshot is valid PNG',
        questionPngSignature === '89504e470d0a1a0a' && questionScreenshotBytes > 24,
        `${questionScreenshotBytes} bytes`
      )
      report.screenshots.push({
        name: 'diagnosis-tab-direct-question-package',
        path: questionScreenshotPath,
        bytes: questionScreenshotBytes
      })
      report.screenshot_attempts.push({
        label: 'diagnosis-tab-direct-question-package',
        attempts: questionScreenshot.attempts
      })
      report.evidence_paths.push(questionScreenshotPath)
    }
    const routeStack = await miniProgram.evaluate(function () {
      return ((typeof getCurrentPages === 'function' ? getCurrentPages() : []) || []).map(
        page => page?.route || page?.path || ''
      )
    })
    recordAssertion(
      'diagnosis tab user action leaves no flow or dispatcher page in the stack',
      Array.isArray(routeStack) &&
        routeStack.includes(DIAGNOSIS_TAB_ROUTE) &&
        routeStack.includes(QUESTION_PACKAGE_ROUTE) &&
        !routeStack.includes('subpackages/diagnosis/flow') &&
        !routeStack.includes('subpackages/diagnosis/entry'),
      JSON.stringify(routeStack)
    )
    const questionBack = await waitForElement(questionPackage, 'layout-left-action')
    recordAssertion(
      'question package provides a visible return action',
      Boolean(questionBack),
      '#layout-left-action'
    )
    if (questionBack) {
      await tapStableElement(questionBack)
    }
    const returnedDiagnosisTab = await waitForPagePath(miniProgram, DIAGNOSIS_TAB_ROUTE)
    recordAssertion(
      'question package returns directly to the diagnosis tab',
      returnedDiagnosisTab?.path === DIAGNOSIS_TAB_ROUTE,
      returnedDiagnosisTab?.path || ''
    )

    const homeAfterTab = await navigateNativeTab({
      mp: miniProgram,
      logicalPath: '/pages/index/index'
    })
    recordAssertion(
      'switching away from the diagnosis tab has no redirect loop',
      homeAfterTab?.path === HOME_ROUTE,
      homeAfterTab?.path
    )
  } catch (error) {
    recordAssertion(
      'diagnosis tab common-ui runtime completed without transport error',
      false,
      String(error?.message || error)
    )
    report.not_verified.push({
      item: 'remaining common-ui assertions',
      reason: 'runtime stopped after the first failure'
    })
  } finally {
    if (requestCaptureInstalled && miniProgram) {
      try {
        report.capturedRequests = await readCapturedRequests(miniProgram)
        const questionStartRequest = report.capturedRequests.find(request =>
          String(request?.url || '').includes(
            '/diagnosis-question-start-http/diagnosis/question/start'
          )
        )
        const questionStartStatus = questionStartRequest?.response?.statusCode
        const questionStartCode = questionStartRequest?.response?.data?.code
        recordAssertion(
          'diagnosis question/start real wx.request returns HTTP and business 200',
          questionStartStatus === 200 && questionStartCode === 200,
          `HTTP ${questionStartStatus ?? 'missing'}, business ${questionStartCode ?? 'missing'}`
        )
      } catch (error) {
        report.not_verified.push({
          item: 'real wx.request capture',
          reason: String(error?.message || error)
        })
      }
      await restoreRequest(miniProgram)
    }
    try {
      await disconnectFormalLeaf({ mp: miniProgram })
    } catch (error) {
      report.not_verified.push({
        item: 'formal automator disconnect',
        reason: String(error?.message || error)
      })
    }
    report.status = report.failures.length ? 'failed' : 'passed'
    report.business_assertions_reached = report.assertions.length > 0
    report.endedAt = new Date().toISOString()
    const reportPath = path.join(DEFAULT_ARTIFACT_DIR, 'diagnosis-tab-common-ui-report.json')
    report.evidence_paths.push(reportPath)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify({ ...report, report_path: reportPath }, null, 2))
    if (report.status !== 'passed') {
      process.exitCode = 1
    }
  }
}

main().catch(error => {
  console.error(error?.message || error)
  process.exit(1)
})
