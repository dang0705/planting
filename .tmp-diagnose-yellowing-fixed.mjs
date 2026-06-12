#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import automator from 'miniprogram-automator'

const PORT = Number(process.env.MINIPROGRAM_AUTOMATOR_PORT || 9420)
const PROJECT_PATH = process.env.MINIPROGRAM_PROJECT_PATH || path.join(process.cwd(), 'dist/dev/mp-weixin')
const REPORT_DIR = path.join(process.cwd(), 'scripts/terminal-e2e/qa-artifacts', new Date().toISOString().replace(/[:.]/g, '-'))

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
async function takeShot(mp, filePath) {
  try { await mp.screenshot({ path: filePath }) } catch { }
}
function normalize(value) { return String(value || '').trim() }
function toLower(value) { return normalize(value).toLowerCase() }
function nowStamp() { return new Date().toISOString() }

function scoreForWateringOption(text) {
  const t = normalize(text)
  if (!t) return -1
  const hasThree = /3|三/.test(t)
  const hasDay = /天|日/.test(t)
  if (hasThree && hasDay) return 100
  if (/周/.test(t) && hasThree) return 80
  if (/3/.test(t)) return 60
  if (/(一|二|三|两|3)天|过去两周|10天/.test(t)) return 55
  return 20
}

function scoreForUnknown(text) {
  const t = toLower(normalize(text))
  if (!t) return -1
  const kw = ['看不清', '看不出', '不知道', '不确定', '不清楚', 'unclear', 'unknown']
  if (kw.some(item => t.includes(item))) return 90
  return 10
}

function chooseOption(questionTitleText, options, forceUnknown = false) {
  const title = normalize(questionTitleText)
  const isWatering = /浇水|watering|water/.test(title)
  const scored = options.map(option => ({
    ...option,
    score: forceUnknown
      ? scoreForUnknown(option.text)
      : (isWatering ? scoreForWateringOption(option.text) : scoreForUnknown(option.text))
  })).sort((a, b) => b.score - a.score)

  const candidate = scored[0]
  if (!candidate) return null
  if (candidate.score <= 0) return null
  return candidate
}

async function collectElementsWithId(page) {
  const elements = await page.$$('[id]')
  const items = []
  for (const item of elements) {
    const id = await item.attribute('id')
    if (id) items.push({ id, el: item })
  }
  return items
}

async function findByIdSuffix(page, suffix, timeoutMs = 12000, interval = 250) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const items = await collectElementsWithId(page)
    const hit = items.find(item => item.id.endsWith(suffix))
    if (hit) return hit.el
    await sleep(interval)
  }
  return null
}

async function findByIdContains(page, contains, timeoutMs = 12000, interval = 250) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const items = await collectElementsWithId(page)
    const hit = items.find(item => item.id.includes(contains))
    if (hit) return hit.el
    await sleep(interval)
  }
  return null
}

async function safeText(el) {
  try { return normalize(await el.text()) } catch { return '' }
}

async function runOnce(iteration) {
  const launcher = automator
  const miniProgram = await launcher.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` })
  const stamp = nowStamp().replace(/[:.]/g, '-')
  const shotDir = REPORT_DIR

  const runLog = {
    iteration,
    startAt: new Date().toISOString(),
    steps: [],
    errors: []
  }

  const log = {
    iteration,
    startAt: new Date().toISOString(),
    stepLogs: []
  }

  try {
    const startPage = await miniProgram.reLaunch('/pages/index/index')
    await sleep(1200)

    const launchPath = (await miniProgram.currentPage()).path || ''
    runLog.steps.push({ step: 1, action: 'launch', path: launchPath })

    await takeShot(miniProgram, path.join(REPORT_DIR, `${stamp}-session${iteration}-00-index.png`))

    const toasts = await miniProgram.evaluate(() => {
      const stack = []
      const origin = wx.showToast
      wx.showToast = (opts = {}) => {
        if (opts && opts.title) stack.push(opts.title)
        return Promise.resolve({ errMsg: 'showToast:ok' })
      }
      window.__qaDiagnoseToasts = { stack, origin }
      return { patched: true }
    })

    let popupOpen = false
    let openMethod = 'none'

    // 按要求先尝试点击首页诊断入口按钮；入口不存在时才兜底到 popup 引用打开。
    const entryButton = await findByIdContains(startPage, 'diagnose-entry-button', 12000, 300)
    if (entryButton) {
      openMethod = 'entry-button'
      await entryButton.tap()
      await sleep(800)
      popupOpen = true
    }

    if (!popupOpen) {
      popupOpen = await miniProgram.evaluate(() => {
        const vm = getCurrentPages()[0]?.$vm
        const popup = vm?.$refs?.diagnosePopupRef
        if (!popup || typeof popup.open !== 'function') {
          return false
        }
        popup.open()
        return true
      })
      openMethod = 'ref-fallback'
    }

    runLog.steps.push({ step: 2, action: 'open-popup-via-ref', opened: popupOpen })
    runLog.steps.push({ step: 2.5, action: 'open-method', method: openMethod })
    if (!popupOpen) {
      throw new Error('无法通过 diagnosePopupRef 打开弹窗')
    }

    await sleep(1200)
    await takeShot(miniProgram, path.join(shotDir, `${stamp}-session${iteration}-01-popup.png`))

    const popupReady = await findByIdSuffix(startPage, 'diagnose-popup-panel', 12000, 300)
    if (!popupReady) {
      throw new Error('未打开诊断弹窗')
    }

    const yellowing = await findByIdSuffix(startPage, 'diagnose-dev-symptom-class-option-yellowing_mode', 12000, 300)
    if (!yellowing) throw new Error('未找到黄叶模式按钮')
    runLog.steps.push({ step: 3, action: 'select-yellowing' })
    await yellowing.tap()
    await sleep(700)
    await takeShot(miniProgram, path.join(shotDir, `${stamp}-session${iteration}-02-yellowing-selected.png`))

    const pageAfterSelect = await miniProgram.currentPage()
    const pathAfterSelect = pageAfterSelect.path || pageAfterSelect.__route__ || ''
    const enteredQuestionPackageAfterSelect = pathAfterSelect.includes('pages/diagnose/question-package')

    if (enteredQuestionPackageAfterSelect) {
      runLog.steps.push({ step: 4, action: 'auto-entered-question-package', path: pathAfterSelect })
    } else {
      // 仅在无图症状模式下点击“开始诊断”按钮。
      const startDiagnose = await findByIdContains(startPage, 'diagnose-submit-button', 12000, 300)
      if (!startDiagnose) {
        throw new Error('未找到开始诊断按钮')
      }
      runLog.steps.push({ step: 4, action: 'tap-start-button' })
      await startDiagnose.tap()
      await sleep(1800)
      await takeShot(miniProgram, path.join(shotDir, `${stamp}-session${iteration}-03-start.png`))
    }

    const answers = []
    for (let step = 1; step <= 20; step += 1) {
      const pageNow = await miniProgram.currentPage()
      const currentPath = pageNow.path || pageNow.__route__ || ''
      if (!currentPath.includes('pages/diagnose/question-package')) {
        runLog.steps.push({ step, action: 'break-not-question-package', reason: 'not-question-package', path: currentPath })
        break
      }

      const questionIdItems = await collectElementsWithId(pageNow)
      const optionItems = questionIdItems
        .filter(item => item.id.startsWith('diagnose-question-package-page-option-'))
        .map(item => {
          const suffix = item.id.replace('diagnose-question-package-page-option-', '')
          const idx = suffix.lastIndexOf('-')
          const questionId = idx > 0 ? suffix.slice(0, idx) : ''
          const optionId = idx > 0 ? suffix.slice(idx + 1) : ''
          return { ...item, questionId, optionId }
        })
      const questionShellItems = questionIdItems.filter(item => item.id.startsWith('diagnose-question-package-page-question-shell-'))

      const questionIds = questionShellItems
        .map(item => item.id.replace('diagnose-question-package-page-question-shell-', ''))
      const currentQuestionId = questionIds[0] || null
      if (!currentQuestionId) {
        log.stepLogs.push({ step, action: 'break', reason: 'no-question-shell' })
        break
      }

      const questionTitleEl = questionShellItems.find(item => item.id.endsWith(currentQuestionId))
      const questionTitleText = questionTitleEl ? await safeText(questionTitleEl.el) : ''
      const currentQuestionOptions = optionItems
        .filter(item => item.questionId === currentQuestionId)

      if (!currentQuestionOptions.length) {
        runLog.steps.push({ step, action: 'no-options', questionId: currentQuestionId })
      }

      const detailedOptions = []
      for (const o of currentQuestionOptions) {
        detailedOptions.push({
          ...o,
          text: await safeText(o.el)
        })
      }

      const forceUnknown = !/浇水/.test(questionTitleText)
      const chosen = chooseOption(questionTitleText, detailedOptions, forceUnknown)
      if (!chosen) {
        runLog.steps.push({ step, action: 'no-choice', questionId: currentQuestionId, questionTitleText })
        break
      }

      await chosen.el.tap()
      await takeShot(miniProgram, path.join(REPORT_DIR, `${stamp}-session${iteration}-step${step}-choose.png`))

      const nextBtn = await findByIdContains(pageNow, 'diagnose-question-package-page-next-button')
      if (!nextBtn) {
        throw new Error(`未找到下一题按钮 step=${step}`)
      }
      await nextBtn.tap()
      await sleep(700)

      const afterPath = (await miniProgram.currentPage()).path || ''
      answers.push({
        step,
        questionId: currentQuestionId,
        questionTitle: questionTitleText,
        chosen: chosen.text,
        fromPath: currentPath,
        toPath: afterPath
      })

      log.stepLogs.push({ step, action: 'answer', questionId: currentQuestionId, chosen: chosen.text, fromPath: currentPath, toPath: afterPath })
      answers.push({
        step,
        action: 'answer',
        questionId: currentQuestionId,
        questionTitle: questionTitleText,
        chosen: chosen.text,
        fromPath: currentPath,
        toPath: afterPath
      })
      await takeShot(miniProgram, path.join(REPORT_DIR, `${stamp}-session${iteration}-step${step}-next.png`))

      if (afterPath.includes('pages/diagnose/question-package') === false) {
        break
      }
      if (afterPath === currentPath && chosen.text === '') {
        break
      }
      if (afterPath === 'pages/diagnose/question-package' && answers.length >= 12) {
        // fail-safe
        break
      }
    }

    log.answers = answers
    log.endPath = (await miniProgram.currentPage()).path || ''
    log.answers = answers
    log.endPath = (await miniProgram.currentPage()).path || ''
    await takeShot(miniProgram, path.join(REPORT_DIR, `${stamp}-session${iteration}-final.png`))

    runLog.endPath = log.endPath
    runLog.answerCount = answers.length
    runLog.toasts = await miniProgram.evaluate(() => window.__qaDiagnoseToasts?.stack || [])
    runLog.openMethod = openMethod
    runLog.success = true
    runLog.success = true
    runLog.steps.push({ action: 'done', endPath: runLog.endPath, answerCount: answers.length })
    return runLog
  } finally {
    // keep session open for next iteration reLaunching as needed
  }
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  const results = []

  for (let i = 1; i <= 3; i++) {
    const one = await runOnce(i)
    results.push(one)
    await sleep(1200)
  }

  const reportFile = path.join(REPORT_DIR, 'yellowing-fixed-result.json')
  fs.writeFileSync(reportFile, JSON.stringify({
    tool: 'mcp-automator-direct-9420',
    startedAt: new Date().toISOString(),
    iterations: 3,
    port: PORT,
    projectPath: PROJECT_PATH,
    results
  }, null, 2))
  console.log('DONE', reportFile)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
