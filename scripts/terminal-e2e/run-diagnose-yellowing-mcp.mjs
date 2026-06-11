#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import automator from 'miniprogram-automator'

const DEFAULT_PORT = 9430
const DEFAULT_PROJECT = path.join(process.cwd(), 'dist/build/mp-weixin')
const DEFAULT_REPORT_DIR = path.join(process.cwd(), 'scripts/terminal-e2e/qa-artifacts')
const DEFAULT_MAX_STEPS = 12

function parseArgs(rawArgs) {
  const parsed = {}
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = String(rawArgs[i])
    if (!arg.startsWith('--')) continue
    const trimmed = arg.slice(2)
    const sep = trimmed.indexOf('=')
    if (sep >= 0) {
      parsed[trimmed.slice(0, sep)] = trimmed.slice(sep + 1)
      continue
    }

    const next = rawArgs[i + 1]
    if (!next || next.startsWith('--')) {
      parsed[trimmed] = 'true'
    } else {
      parsed[trimmed] = next
      i += 1
    }
  }
  return parsed
}

function toNumber(value, fallback = NaN) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return num
}

function normalize(value) {
  return String(value || '').trim()
}

function normalizeText(value) {
  return normalize(value).toLowerCase()
}

function nowStamp() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function screenshot(miniProgram, reportDir, name) {
  await fs.promises.mkdir(reportDir, { recursive: true })
  const filePath = path.join(reportDir, `${nowStamp().replace(/[:.]/g, '-')}-${name}.png`)
  await miniProgram.screenshot({ path: filePath })
  return filePath
}

function log(...args) {
  console.log(...args)
}

async function safeAttribute(element, name) {
  try {
    return await element.attribute(name)
  } catch {
    return null
  }
}

async function safeText(element) {
  try {
    return await element.text()
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

async function findElementByIdSuffix(page, suffix, timeoutMs = 12000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const items = await collectElementsWithId(page)
    const hit = items.find(item => item.elementId.endsWith(suffix))
    if (hit) {
      return hit.element
    }
    await sleep(intervalMs)
  }
  return null
}

async function findElementByIdContains(page, contains, timeoutMs = 12000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const items = await collectElementsWithId(page)
    const hit = items.find(item => item.elementId.includes(contains))
    if (hit) {
      return hit.element
    }
    await sleep(intervalMs)
  }
  return null
}

function parseQuestionOptionId(elementId) {
  const marker = 'diagnose-question-package-page-option-'
  const start = elementId.indexOf(marker)
  if (start < 0) return null

  const tail = elementId.slice(start + marker.length)
  if (tail.startsWith('stack-')) {
    return null
  }

  const lastDash = tail.lastIndexOf('-')
  if (lastDash < 0) return null

  return {
    questionId: tail.slice(0, lastDash),
    optionId: tail.slice(lastDash + 1)
  }
}

function parseQuestionIdFromStackId(elementId) {
  const marker = 'diagnose-question-package-page-question-shell-'
  const start = elementId.indexOf(marker)
  if (start < 0) return null
  return elementId.slice(start + marker.length)
}

function safeFirstLine(text) {
  return text
    .split('\n')
    .map(line => normalize(line))
    .find(line => Boolean(line)) || ''
}

function decodeQuestionKey(rawId) {
  const key = normalize(rawId)
  if (!key) return ''
  if (!key.startsWith('q_')) return key
  const body = key.slice(2)
  try {
    const decoded = Buffer.from(body.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString('utf8')
    return normalize(decoded)
  } catch {
    return key
  }
}

async function readPageData(page, timeoutMs = 1200) {
  const p = Promise.race([
    page.data(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('page.data timeout')), timeoutMs))
  ])
  return await p
}

async function resolveQuestionState(page) {
  const base = await readCurrentPath(page)
  const state = {
    path: base.path,
    rawData: null,
    activeQuestionIndex: null,
    questionStack: [],
    currentQuestionId: null,
    questionCount: 0,
    hasActiveQuestions: false,
    isCompleted: false
  }

  let data = null
  try {
    data = await readPageData(page)
  } catch {
    data = null
  }

  if (data && typeof data === 'object') {
    state.rawData = data
    const result = data.result || data.__result || {}
    const stack = Array.isArray(data.questionStack)
      ? data.questionStack
      : Array.isArray(result.questionStack)
        ? result.questionStack
        : []

    const stackHasValue = stack.length > 0 ? stack : Array.isArray(result.questions) ? result.questions : []
    const resultHasActive = Boolean(result?.hasActiveQuestions)
    const activeQuestionIndex = [
      data.activeQuestionIndex,
      data?.activeQuestionIndex?.value,
      result.activeQuestionIndex,
      result?.activeQuestion?.index,
      result?.currentQuestionIndex,
      data?.result?.activeQuestionIndex
    ]
      .map(v => toNumber(v))
      .find(v => Number.isInteger(v))

    state.questionStack = stackHasValue
    state.questionCount = stackHasValue.length
    state.activeQuestionIndex = Number.isInteger(activeQuestionIndex) ? activeQuestionIndex : null
    state.currentQuestionId =
      stackHasValue[state.activeQuestionIndex]?.questionId || stackHasValue[state.activeQuestionIndex]?.questionKey
    state.hasActiveQuestions = resultHasActive
    state.isCompleted = (state.questionCount > 0 && !resultHasActive)
  }

  return state
}

async function readCurrentPath(pageOrMiniProgram) {
  if (typeof pageOrMiniProgram.currentPage === 'function') {
    const current = await pageOrMiniProgram.currentPage()
    return { path: normalize(current?.path || '').replace(/^\//, '') }
  }

  return { path: normalize(pageOrMiniProgram?.path || '').replace(/^\//, '') }
}

async function findActiveQuestionIdFromDom(page) {
  const elements = await collectElementsWithId(page)
  const questionShells = elements.filter(item =>
    item.elementId.includes('diagnose-question-package-page-question-shell-')
  )
  if (!questionShells.length) {
    return null
  }
  const first = questionShells[0]
  return parseQuestionIdFromStackId(first.elementId)
}

async function collectQuestionOptions(page) {
  const elements = await collectElementsWithId(page)
  const grouped = new Map()
  for (const item of elements) {
    const parsed = parseQuestionOptionId(item.elementId)
    if (!parsed) continue
    const entry = grouped.get(parsed.questionId) || []
    const optionText = await safeText(item.element)
    entry.push({
      questionId: parsed.questionId,
      optionId: parsed.optionId,
      element: item.element,
      text: optionText
    })
    grouped.set(parsed.questionId, entry)
  }
  return grouped
}

async function collectQuestionShellIds(page) {
  const elements = await collectElementsWithId(page)
  const marker = 'diagnose-question-package-page-question-shell-'
  return elements
    .filter(item => item.elementId.includes(marker))
    .map(item => parseQuestionIdFromStackId(item.elementId))
    .filter(Boolean)
}

async function resolveQuestionMetaByShell(page, questionId) {
  if (!questionId) return {}
  const marker = 'diagnose-question-package-page-question-shell-' + questionId
  const shell = await findElementByIdSuffix(page, marker, 3000, 200)
  if (!shell) return { questionId, decodedQuestionId: decodeQuestionKey(questionId) }
  const rawText = await safeText(shell)
  const firstLine = safeFirstLine(rawText)
  return {
    questionId,
    decodedQuestionId: decodeQuestionKey(questionId),
    text: firstLine
  }
}

function pickBestOption(questionMeta, options, profile) {
  const list = [...options]
  const qText = normalizeText(
    questionMeta?.text ||
      questionMeta?.questionText ||
      questionMeta?.questionKey ||
      questionMeta?.questionId ||
      questionMeta?.decodedQuestionId ||
      ''
  )
  const qTarget = normalizeText(questionMeta?.targetDimension || '')
  const decodedQuestionId = normalizeText(questionMeta?.decodedQuestionId || '')
  const combined = `${qText} ${qTarget} ${decodedQuestionId}`

  const contains = (target, arr) => arr.some(v => target.includes(v))
  const pickByText = pattern => list.find(item => normalizeText(item.text).includes(pattern))

  const unknownOptions = list.filter(item => /说不清|没留意|不确定|unknown/i.test(item.text))
  if (profile === 'overwatering') {
    if (contains(qTarget, ['watering_frequency_context']) || contains(combined, ['watering', '浇水'])) {
      return (
        pickByText('偏多') ||
        pickByText('2 次以上') ||
        pickByText('2次以上') ||
        pickByText('2 次 以上') ||
        list.find(item => /常见/.test(item.text)) ||
        unknownOptions[0] ||
        list[0]
      )
    }

    if (contains(combined, ['光照', '光线']) || contains(qTarget, ['light'])) {
      return (
        list.find(item => normalizeText(item.text).includes('全日光')) ||
        list.find(item => /强/.test(item.text)) ||
        unknownOptions[0] ||
        list[0]
      )
    }

    if (contains(combined, ['施肥', '换盆', '换土']) || contains(qTarget, ['fertil'])) {
      return (
        list.find(item => normalizeText(item.text).includes('偏稳')) ||
        unknownOptions[0] ||
        list[0]
      )
    }

    if (contains(combined, ['通风', '湿度', '空气']) || contains(qTarget, ['airflow', 'humidity'])) {
      return (
        list.find(item => /偏闷|偏潮|通风弱|偏湿|偏干|空调/.test(item.text)) ||
        unknownOptions[0] ||
        list[0]
      )
    }
  }

  if (unknownOptions.length) {
    return unknownOptions[0]
  }

  return list[0]
}

async function clickQuestionNext(page, questionId) {
  const nextByQuestion = await findElementByIdSuffix(
    page,
    'diagnose-question-package-page-question-shell-' + questionId,
    2000,
    200
  )
  if (!nextByQuestion) {
    const fallback = await findElementByIdSuffix(page, 'diagnose-question-package-page-next-button', 2000, 200)
    if (!fallback) {
      return false
    }
    await fallback.tap()
    return true
  }

  const host = nextByQuestion
  const next = await host.$('[id$="diagnose-question-package-page-next-button"]')
  if (!next) {
    const fallback = await findElementByIdSuffix(page, 'diagnose-question-package-page-next-button', 2000, 200)
    if (!fallback) {
      return false
    }
    await fallback.tap()
    return true
  }

  await next.tap()
  return true
}

async function runYellowingQuickFlow({
  port,
  projectPath,
  maxSteps,
  profile
}) {
  const reportDir = path.join(DEFAULT_REPORT_DIR, nowStamp().replace(/[:.]/g, '-'))
  const logs = []

  const launcher = automator
  let miniProgram = null

  try {
    miniProgram = await launcher.connect({ wsEndpoint: `ws://127.0.0.1:${port}` })
  } catch (error) {
    throw new Error(`连接 automator 失败（端口 ${port}）：${error.message}`)
  }

  const shots = []
  const pushLog = entry => {
    logs.push({ time: nowStamp(), ...entry })
  }

  miniProgram.on('console', event => {
    pushLog({ type: 'console', data: event })
  })

  try {
    const startPage = await miniProgram.reLaunch('/pages/index/index')
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
    pushLog({ type: 'state', label: 'popup-opened', path: (await resolveQuestionState(startPage)).path })
    shots.push(await screenshot(miniProgram, reportDir, '00-popup-opened'))

    const quickEntry = await findElementByIdSuffix(startPage, '3ef72261--diagnose-dev-symptom-class-quick-select', 12000, 300)
    if (!quickEntry) {
      throw new Error('未找到黄叶快捷入口容器（3ef72261--diagnose-dev-symptom-class-quick-select）')
    }
    const yellowBtn = await findElementByIdSuffix(startPage, 'diagnose-dev-symptom-class-option-yellowing_mode', 12000, 300)
    if (!yellowBtn) {
      throw new Error('未找到黄叶症状项（diagnose-dev-symptom-class-option-yellowing_mode）')
    }
    await yellowBtn.tap()
    await sleep(1500)

    shots.push(await screenshot(miniProgram, reportDir, '01-yellowing-selected'))
    current = await resolveQuestionState(await miniProgram.currentPage())
    pushLog({ type: 'state', label: 'after-yellowing', path: current.path })

    let questionIndex = 0
    while (questionIndex < maxSteps) {
      const pageNow = await miniProgram.currentPage()
      current = await resolveQuestionState(pageNow)
      if (!current.path.includes('pages/diagnose/question-package')) {
        pushLog({ type: 'state', label: 'quit-early', path: current.path, reason: '跳出问答页' })
        break
      }

      const optionsByQuestion = await collectQuestionOptions(pageNow)
      const shellQuestionIds = await collectQuestionShellIds(pageNow)
      const orderQuestionId =
        shellQuestionIds.length > 0 ? shellQuestionIds[Math.min(questionIndex, shellQuestionIds.length - 1)] : null
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
        const fallback = optionsByQuestion.get(orderQuestionId) || [...optionsByQuestion.values()][0]
        if (!fallback || !fallback.length) {
          pushLog({ type: 'state', label: 'no-options', questionId: currentQuestionId })
          break
        }
        pushLog({ type: 'state', label: 'fallback-question', mapped: false, questionId: currentQuestionId })
      }

      const questionMeta = await resolveQuestionMetaByShell(pageNow, currentQuestionId)
      const options = candidates.length ? candidates : ([...optionsByQuestion.values()][0] || [])

      if (!options.length) {
        pushLog({ type: 'state', label: 'no-available-option', questionId: currentQuestionId })
        break
      }

      const picked = pickBestOption(questionMeta, options, profile)
      if (!picked) {
        pushLog({ type: 'state', label: 'no-option-picked', questionId: currentQuestionId })
        break
      }

      shots.push(await screenshot(miniProgram, reportDir, `step-${questionIndex + 1}-before`))
      await picked.element.tap()
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
        chosenOptionText: picked.text,
        pathBefore: beforePage.path,
        pathAfter: afterState.path
      })
      shots.push(await screenshot(miniProgram, reportDir, `step-${questionIndex + 1}-after`))

      if (!afterState.path.includes('pages/diagnose/question-package')) {
        pushLog({ type: 'state', label: 'route-changed', path: afterState.path })
        break
      }

      if (afterState.isCompleted || (!afterState.hasActiveQuestions && afterState.questionCount > 0)) {
        pushLog({ type: 'state', label: 'completed-in-package', path: afterState.path })
        break
      }

      if (afterState.activeQuestionIndex !== null &&
          current.activeQuestionIndex !== null &&
          afterState.activeQuestionIndex > current.activeQuestionIndex) {
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
    const outcomeHits = resultShells.filter(item =>
      item.elementId.includes('diagnose-question-package-result')
    ).map(item => item.elementId)
    pushLog({ type: 'result-elements', outcomeHits })

    const finalShot = await screenshot(miniProgram, reportDir, 'final-state')
    pushLog({ type: 'result', screenshot: finalShot })
  } finally {
    await miniProgram.screenshot({ path: path.join(DEFAULT_REPORT_DIR, `${Date.now()}-final.png`) }).catch(() => {})
  }

  return {
    reportDir,
    logs,
    shots,
    startedAt: new Date().toISOString()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const port = toNumber(args.port, DEFAULT_PORT) || DEFAULT_PORT
  const projectPath = normalize(args.project || process.env.MP_PROJECT_PATH || DEFAULT_PROJECT)
  const maxSteps = toNumber(args.maxSteps, DEFAULT_MAX_STEPS) || DEFAULT_MAX_STEPS
  const profile = normalize(args.profile || 'overwatering') || 'overwatering'

  const hasProject = fs.existsSync(projectPath)
  if (!hasProject) {
    throw new Error(`项目路径不存在: ${projectPath}`)
  }

  log(`[开始] 端上 mcp 自动化：yellowing 测试`)
  log(`[参数] ws=${port}, project=${projectPath}, profile=${profile}, maxSteps=${maxSteps}`)

  const result = await runYellowingQuickFlow({ port, projectPath, maxSteps, profile })

  const reportFile = path.join(result.reportDir, 'yellowing-mcp-report.json')
  await fs.promises.mkdir(result.reportDir, { recursive: true })
  await fs.promises.writeFile(reportFile, JSON.stringify({
    tool: 'miniprogram-automator',
    startedAt: result.startedAt,
    port,
    projectPath,
    profile,
    maxSteps,
    logs: result.logs,
    screenshots: result.shots
  }, null, 2), 'utf8')

  log(`[结束] 结果路径: ${result.reportDir}`)
  log(`[结束] 日志文件: ${reportFile}`)
  if (result.logs.length) {
    const final = result.logs[result.logs.length - 1]
    log(`[摘要] 最终状态: ${JSON.stringify(final)}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message || error)
    process.exit(1)
  })
}
