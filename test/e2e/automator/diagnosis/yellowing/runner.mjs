import path from 'node:path'
import automator from 'miniprogram-automator'
import {
  connectFormalLeaf,
  disconnectFormalLeaf,
  handoffFormalLeafScreenshot
} from '../../_shared/formal-leaf-harness.mjs'
import {
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../../care/watering/transpiration-v3/_shared/lib/request-capture.mjs'
import { navigateNativeTab } from '../_shared/native-tab-navigation.mjs'
import {
  clickQuestionNext,
  collectElementsWithId,
  collectQuestionOptions,
  collectQuestionShellIds,
  findActiveQuestionIdFromDom,
  findElementByIdContains,
  findElementByIdSuffix,
  normalizeText,
  resolveQuestionMetaByShell,
  resolveQuestionState,
  safeText,
  sleep
} from './dom.mjs'
import { pickBestOption } from './option-selection.mjs'

const REPORT_ROOT = process.env.E2E_ARTIFACT_DIR
  ? path.resolve(process.env.E2E_ARTIFACT_DIR)
  : path.join(process.cwd(), '.tmp/e2e/diagnosis/yellowing-qa-artifacts')
const nowStamp = () => new Date().toISOString()
async function screenshot(miniProgram, wsEndpoint, reportDir, name) {
  const filePath = path.join(reportDir, `${nowStamp().replace(/[:.]/g, '-')}-${name}.png`)
  const resumed = await handoffFormalLeafScreenshot({
    mp: miniProgram,
    automator,
    wsEndpoint,
    outputPath: filePath,
    maxAttempts: 1
  })
  return { path: filePath, miniProgram: resumed.mp, attempts: resumed.attempts }
}

async function completeLightEnvironmentQuestion(page, questionId, pushLog) {
  if (!String(questionId || '').includes('light_change_context')) {
    return false
  }
  const directLight = await findElementByIdSuffix(
    page,
    `diagnose-light-type-direct-${questionId}`,
    3000,
    200
  )
  if (!directLight) {
    pushLog({ type: 'state', label: 'light-environment-control-missing', questionId })
    return false
  }
  await directLight.tap()
  await sleep(300)
  const confirm = await findElementByIdSuffix(
    page,
    `diagnose-light-confirm-current-${questionId}`,
    3000,
    200
  )
  if (confirm) {
    await confirm.tap()
    await sleep(300)
  }
  pushLog({
    type: 'state',
    label: 'light-environment-confirmed',
    questionId,
    naturalLightType: 'direct',
    confirmationButtonFound: Boolean(confirm)
  })
  return true
}

async function completeAirEnvironmentQuestion(page, questionId, pushLog) {
  if (!String(questionId || '').includes('air_environment')) {
    return false
  }
  const unknown = await findElementByIdSuffix(
    page,
    `diagnose-air-environment-${questionId}-unknown`,
    3000,
    200
  )
  if (!unknown) {
    pushLog({ type: 'state', label: 'air-environment-control-missing', questionId })
    return false
  }
  await unknown.tap()
  await sleep(500)
  pushLog({
    type: 'state',
    label: 'air-environment-skipped',
    questionId,
    answer: '不确定，跳过这项'
  })
  return true
}

async function collectTimelineWeatherEvidence(page) {
  const elements = await collectElementsWithId(page)
  const cells = []
  for (const { elementId, element } of elements) {
    const match = String(elementId || '').match(/care-behavior-date-(\d{4}-\d{2}-\d{2})$/)
    if (!match) {
      continue
    }
    let text = ''
    try {
      text = normalizeText(await element.text())
    } catch {
      text = ''
    }
    cells.push({
      date: match[1],
      text,
      hasTemperature: /\d+\s*°/.test(text),
      hasHumidity: /\d+\s*%/.test(text),
      hasWeatherMetrics: /\d+\s*°/.test(text) || /\d+\s*%/.test(text)
    })
  }
  return cells.sort((a, b) => a.date.localeCompare(b.date))
}

async function waitForTimelineWeatherEvidence(page, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let latest = []
  while (Date.now() < deadline) {
    latest = await collectTimelineWeatherEvidence(page)
    if (latest.some(item => item.hasWeatherMetrics)) {
      return latest
    }
    await sleep(500)
  }
  return latest
}

async function collectTimelineWeatherNotice(page) {
  try {
    const notice = await page.$('.care-behavior-error-text')
    return notice ? normalizeText(await safeText(notice)) : ''
  } catch {
    return ''
  }
}

async function waitForDiagnosisFlowEntry(miniProgram, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let latestPage = null
  while (Date.now() < deadline) {
    latestPage = await miniProgram.currentPage()
    const route = normalizeText(latestPage?.path)
    if (route.includes('subpackages/diagnosis/flow')) {
      const entry = await findElementByIdSuffix(latestPage, 'diagnosis-flow-page-content', 1000, 200)
      if (entry) {
        return { page: latestPage, entry }
      }
    }
    await sleep(300)
  }
  return { page: latestPage, entry: null }
}

export async function runYellowingQuickFlow({
  wsEndpoint,
  projectPath: _projectPath,
  maxSteps,
  profile
}) {
  const reportDir = path.join(REPORT_ROOT, nowStamp().replace(/[:.]/g, '-'))
  const logs = []

  let miniProgram = null
  let capturedRequests = []

  try {
    miniProgram = (await connectFormalLeaf({ automator, wsEndpoint })).mp
    await installRequestCapture(miniProgram)
  } catch (error) {
    throw new Error(`连接测试专属 automator 失败：${error.message}`)
  }

  const shots = []
  const screenshotAttempts = []
  const pushLog = entry => {
    logs.push({ time: nowStamp(), ...entry })
  }

  miniProgram.on('console', event => {
    pushLog({ type: 'console', data: event })
  })

  try {
    let startPage = await navigateNativeTab({
      mp: miniProgram,
      logicalPath: '/pages/index/index'
    })
    await sleep(1200)
    let current = await resolveQuestionState(startPage)
    pushLog({ type: 'state', label: 'launch', path: current.path })

    if (!normalizeText(current.path).includes('pages/index/index')) {
      throw new Error(`启动后未落到首页，当前路径=${current.path}`)
    }

    const entry = await findElementByIdContains(startPage, 'diagnose-entry-button-')
    if (!entry) {
      throw new Error('未找到诊断入口按钮（id 包含 diagnose-entry-button-）')
    }
    await entry.tap()
    const diagnosisEntryResult = await waitForDiagnosisFlowEntry(miniProgram)
    startPage = diagnosisEntryResult.page
    const diagnosisEntry = diagnosisEntryResult.entry
    if (!diagnosisEntry) {
      throw new Error('未命中诊断分包真实流程（diagnosis-flow-page-content）')
    }
    pushLog({
      type: 'state',
      label: 'diagnosis-entry-opened',
      path: (await resolveQuestionState(startPage)).path
    })
    let shot = await screenshot(miniProgram, wsEndpoint, reportDir, '00-diagnosis-entry-opened')
    miniProgram = shot.miniProgram
    shots.push(shot.path)
    screenshotAttempts.push({ label: '00-diagnosis-entry-opened', attempts: shot.attempts })
    startPage = await miniProgram.currentPage()

    const quickEntry = await findElementByIdSuffix(
      startPage,
      '3ef72261--diagnose-dev-symptom-class-quick-select',
      12000,
      300
    )
    if (!quickEntry) {
      throw new Error('未找到黄叶快捷入口容器（3ef72261--diagnose-dev-symptom-class-quick-select）')
    }
    const yellowBtn = await findElementByIdSuffix(
      startPage,
      'diagnose-dev-symptom-class-option-yellowing_mode',
      12000,
      300
    )
    if (!yellowBtn) {
      throw new Error('未找到黄叶症状项（diagnose-dev-symptom-class-option-yellowing_mode）')
    }
    await yellowBtn.tap()
    await sleep(1500)

    shot = await screenshot(miniProgram, wsEndpoint, reportDir, '01-yellowing-selected')
    miniProgram = shot.miniProgram
    shots.push(shot.path)
    screenshotAttempts.push({ label: '01-yellowing-selected', attempts: shot.attempts })
    current = await resolveQuestionState(await miniProgram.currentPage())
    pushLog({ type: 'state', label: 'after-yellowing', path: current.path })

    let questionIndex = 0
    while (questionIndex < maxSteps) {
      let pageNow = await miniProgram.currentPage()
      current = await resolveQuestionState(pageNow)
      if (!current.path.includes('subpackages/diagnosis/question-package')) {
        pushLog({ type: 'state', label: 'quit-early', path: current.path, reason: '跳出问答页' })
        break
      }

      const optionsByQuestion = await collectQuestionOptions(pageNow)
      const shellQuestionIds = await collectQuestionShellIds(pageNow)
      const orderQuestionId =
        shellQuestionIds.length > 0
          ? shellQuestionIds[Math.min(questionIndex, shellQuestionIds.length - 1)]
          : null
      const currentQuestionId =
        current.currentQuestionId ||
        findActiveQuestionIdFromDom(pageNow) ||
        orderQuestionId ||
        [...optionsByQuestion.keys()][0] ||
        null

      if (!currentQuestionId) {
        pushLog({ type: 'state', label: 'no-question-id' })
        break
      }

      const candidates = optionsByQuestion.get(currentQuestionId) || []
      if (!candidates.length && !String(currentQuestionId).includes('air_environment')) {
        const fallback =
          optionsByQuestion.get(orderQuestionId) || [...optionsByQuestion.values()][0]
        if (!fallback || !fallback.length) {
          pushLog({ type: 'state', label: 'no-options', questionId: currentQuestionId })
          break
        }
        pushLog({
          type: 'state',
          label: 'fallback-question',
          mapped: false,
          questionId: currentQuestionId
        })
      }

      const questionMeta = await resolveQuestionMetaByShell(pageNow, currentQuestionId)
      if (String(currentQuestionId).includes('air_environment')) {
        const skipped = await completeAirEnvironmentQuestion(
          pageNow,
          currentQuestionId,
          pushLog
        )
        if (!skipped) {
          break
        }
        shot = await screenshot(
          miniProgram,
          wsEndpoint,
          reportDir,
          `step-${questionIndex + 1}-before`
        )
        miniProgram = shot.miniProgram
        shots.push(shot.path)
        screenshotAttempts.push({
          label: `step-${questionIndex + 1}-before`,
          attempts: shot.attempts
        })
        pageNow = await miniProgram.currentPage()
        const beforePage = await resolveQuestionState(pageNow)
        const nextButton = await clickQuestionNext(pageNow, currentQuestionId)
        if (!nextButton) {
          pushLog({ type: 'state', label: 'next-not-found', questionId: currentQuestionId })
          break
        }
        let afterPage = await miniProgram.currentPage()
        let afterState = await resolveQuestionState(afterPage)
        const completionDeadline = Date.now() + 20_000
        while (
          Date.now() < completionDeadline &&
          afterState.path.includes('subpackages/diagnosis/question-package') &&
          afterState.hasActiveQuestions
        ) {
          await sleep(1000)
          afterPage = await miniProgram.currentPage()
          afterState = await resolveQuestionState(afterPage)
        }
        pushLog({
          type: 'answer',
          step: questionIndex + 1,
          questionId: currentQuestionId,
          questionText: questionMeta.text || questionMeta.questionText || '',
          chosenOptionText: '不确定，跳过这项',
          pathBefore: beforePage.path,
          pathAfter: afterState.path
        })
        shot = await screenshot(
          miniProgram,
          wsEndpoint,
          reportDir,
          `step-${questionIndex + 1}-after`
        )
        miniProgram = shot.miniProgram
        shots.push(shot.path)
        screenshotAttempts.push({
          label: `step-${questionIndex + 1}-after`,
          attempts: shot.attempts
        })
        break
      }
      const options = candidates.length ? candidates : [...optionsByQuestion.values()][0] || []

      if (!options.length) {
        pushLog({ type: 'state', label: 'no-available-option', questionId: currentQuestionId })
        break
      }

      await completeLightEnvironmentQuestion(pageNow, currentQuestionId, pushLog)

      const picked = pickBestOption(questionMeta, options, profile)
      if (!picked) {
        pushLog({ type: 'state', label: 'no-option-picked', questionId: currentQuestionId })
        break
      }

      shot = await screenshot(
        miniProgram,
        wsEndpoint,
        reportDir,
        `step-${questionIndex + 1}-before`
      )
      miniProgram = shot.miniProgram
      shots.push(shot.path)
      screenshotAttempts.push({
        label: `step-${questionIndex + 1}-before`,
        attempts: shot.attempts
      })
      pageNow = await miniProgram.currentPage()
      if (String(currentQuestionId).includes('watering_frequency_context')) {
        const timelineWeather = await waitForTimelineWeatherEvidence(pageNow)
        pushLog({
          type: 'timeline-weather',
          questionId: currentQuestionId,
          cells: timelineWeather,
          noticeText: await collectTimelineWeatherNotice(pageNow)
        })
      }
      const refreshedOptions = await collectQuestionOptions(pageNow)
      const refreshedCandidates = refreshedOptions.get(currentQuestionId) || []
      const refreshedPicked = pickBestOption(questionMeta, refreshedCandidates, profile)
      if (!refreshedPicked) {
        pushLog({
          type: 'state',
          label: 'option-lost-after-screenshot',
          questionId: currentQuestionId
        })
        break
      }
      await refreshedPicked.element.tap()
      await sleep(800)

      const beforePage = await resolveQuestionState(pageNow)
      const nextButton = await clickQuestionNext(pageNow, currentQuestionId)
      if (!nextButton) {
        pushLog({ type: 'state', label: 'next-not-found', questionId: currentQuestionId })
        break
      }
      await sleep(1200)
      const afterPage = await miniProgram.currentPage()
      const afterState = await resolveQuestionState(afterPage)

      pushLog({
        type: 'answer',
        step: questionIndex + 1,
        questionId: currentQuestionId,
        questionText: questionMeta.text || questionMeta.questionText || '',
        chosenOptionText: refreshedPicked.text,
        pathBefore: beforePage.path,
        pathAfter: afterState.path
      })
      shot = await screenshot(miniProgram, wsEndpoint, reportDir, `step-${questionIndex + 1}-after`)
      miniProgram = shot.miniProgram
      shots.push(shot.path)
      screenshotAttempts.push({
        label: `step-${questionIndex + 1}-after`,
        attempts: shot.attempts
      })

      if (!afterState.path.includes('subpackages/diagnosis/question-package')) {
        pushLog({ type: 'state', label: 'route-changed', path: afterState.path })
        break
      }

      if (
        afterState.isCompleted ||
        (!afterState.hasActiveQuestions && afterState.questionCount > 0)
      ) {
        pushLog({ type: 'state', label: 'completed-in-package', path: afterState.path })
        break
      }

      if (
        afterState.activeQuestionIndex !== null &&
        current.activeQuestionIndex !== null &&
        afterState.activeQuestionIndex > current.activeQuestionIndex
      ) {
        questionIndex += 1
        continue
      }

      questionIndex += 1
    }

    const finalPage = await miniProgram.currentPage()
    const finalState = await resolveQuestionState(finalPage)
    pushLog({
      type: 'result',
      path: finalState.path,
      isCompleted: finalState.isCompleted,
      questionCount: finalState.questionCount,
      hasActiveQuestions: finalState.hasActiveQuestions
    })

    const resultShells = await collectElementsWithId(finalPage)
    const outcomeHits = resultShells
      .filter(item => item.elementId.includes('diagnose-question-package-result'))
      .map(item => item.elementId)
    pushLog({ type: 'result-elements', outcomeHits })

    shot = await screenshot(miniProgram, wsEndpoint, reportDir, 'final-state')
    miniProgram = shot.miniProgram
    pushLog({ type: 'result', screenshot: shot.path })
    screenshotAttempts.push({ label: 'final-state', attempts: shot.attempts })
  } finally {
    if (miniProgram) {
      try {
        capturedRequests = await readCapturedRequests(miniProgram)
      } catch {
        capturedRequests = []
      }
      await restoreRequest(miniProgram)
      try {
        await disconnectFormalLeaf({ mp: miniProgram, timeoutMs: 5000 })
      } catch (error) {
        pushLog({
          type: 'cleanup-error',
          message: error.message || String(error)
        })
      }
    }
  }

  return {
    reportDir,
    logs,
    shots,
    screenshotAttempts,
    capturedRequests,
    startedAt: new Date().toISOString()
  }
}
