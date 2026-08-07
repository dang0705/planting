import path from 'node:path'
import automator from 'miniprogram-automator'
import {
  connectFormalLeaf,
  disconnectFormalLeaf,
  handoffFormalLeafScreenshot
} from '../../_shared/formal-leaf-harness.mjs'
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
  sleep
} from './dom.mjs'
import { pickBestOption } from './option-selection.mjs'

const DEFAULT_REPORT_DIR = path.join(process.cwd(), '.tmp/e2e/diagnosis/yellowing-qa-artifacts')
const nowStamp = () => new Date().toISOString()
async function screenshot(miniProgram, wsEndpoint, reportDir, name) {
  const filePath = path.join(reportDir, `${nowStamp().replace(/[:.]/g, '-')}-${name}.png`)
  const resumed = await handoffFormalLeafScreenshot({
    mp: miniProgram,
    automator,
    wsEndpoint,
    outputPath: filePath
  })
  return { path: filePath, miniProgram: resumed.mp }
}

export async function runYellowingQuickFlow({
  wsEndpoint,
  projectPath: _projectPath,
  maxSteps,
  profile
}) {
  const reportDir = path.join(DEFAULT_REPORT_DIR, nowStamp().replace(/[:.]/g, '-'))
  const logs = []

  let miniProgram = null

  try {
    miniProgram = (await connectFormalLeaf({ automator, wsEndpoint })).mp
  } catch (error) {
    throw new Error(`连接测试专属 automator 失败：${error.message}`)
  }

  const shots = []
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
    await sleep(1000)

    const popup = await findElementByIdSuffix(startPage, 'diagnose-popup-panel', 12000, 300)
    if (!popup) {
      throw new Error('未命中诊断弹窗（diagnose-popup-panel）')
    }
    pushLog({
      type: 'state',
      label: 'popup-opened',
      path: (await resolveQuestionState(startPage)).path
    })
    let shot = await screenshot(miniProgram, wsEndpoint, reportDir, '00-popup-opened')
    miniProgram = shot.miniProgram
    shots.push(shot.path)
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
    current = await resolveQuestionState(await miniProgram.currentPage())
    pushLog({ type: 'state', label: 'after-yellowing', path: current.path })

    let questionIndex = 0
    while (questionIndex < maxSteps) {
      let pageNow = await miniProgram.currentPage()
      current = await resolveQuestionState(pageNow)
      if (!current.path.includes('pages/diagnose/question-package')) {
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
      if (!candidates.length) {
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
      const options = candidates.length ? candidates : [...optionsByQuestion.values()][0] || []

      if (!options.length) {
        pushLog({ type: 'state', label: 'no-available-option', questionId: currentQuestionId })
        break
      }

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
      pageNow = await miniProgram.currentPage()
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

      if (!afterState.path.includes('pages/diagnose/question-package')) {
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
  } finally {
    try {
      if (miniProgram) {
        const finalShot = await screenshot(
          miniProgram,
          wsEndpoint,
          DEFAULT_REPORT_DIR,
          `final-${Date.now()}`
        )
        miniProgram = finalShot.miniProgram
      }
    } finally {
      if (miniProgram) {
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
  }

  return {
    reportDir,
    logs,
    shots,
    startedAt: new Date().toISOString()
  }
}
