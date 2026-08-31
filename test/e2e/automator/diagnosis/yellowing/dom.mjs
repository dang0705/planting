function normalize(value) {
  return String(value || '').trim()
}

function normalizeText(value) {
  return normalize(value).toLowerCase()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  if (start < 0) {
    return null
  }

  const tail = elementId.slice(start + marker.length)
  if (tail.startsWith('stack-')) {
    return null
  }

  const lastDash = tail.lastIndexOf('-')
  if (lastDash < 0) {
    return null
  }

  return {
    questionId: tail.slice(0, lastDash),
    optionId: tail.slice(lastDash + 1)
  }
}

function parseQuestionIdFromStackId(elementId) {
  const marker = 'diagnose-question-package-page-question-shell-'
  const start = elementId.indexOf(marker)
  if (start < 0) {
    return null
  }
  return elementId.slice(start + marker.length)
}

function safeFirstLine(text) {
  return (
    text
      .split('\n')
      .map(line => normalize(line))
      .find(line => Boolean(line)) || ''
  )
}

function decodeQuestionKey(rawId) {
  const key = normalize(rawId)
  if (!key) {
    return ''
  }
  if (!key.startsWith('q_')) {
    return key
  }
  const body = key.slice(2)
  try {
    const decoded = Buffer.from(body.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString(
      'utf8'
    )
    return normalize(decoded)
  } catch {
    return key
  }
}

async function resolveQuestionState(page) {
  const base = await readCurrentPath(page)
  const state = {
    path: base.path,
    activeQuestionIndex: null,
    questionStack: [],
    currentQuestionId: null,
    questionCount: 0,
    hasActiveQuestions: false,
    isCompleted: false
  }

  const visibleQuestionIds = await collectQuestionShellIds(page)
  const activeQuestionId = await findActiveQuestionIdFromDom(page)
  state.questionStack = visibleQuestionIds.map(questionId => ({ questionId }))
  state.questionCount = visibleQuestionIds.length
  state.currentQuestionId = activeQuestionId || visibleQuestionIds[0] || null
  state.hasActiveQuestions = Boolean(state.currentQuestionId)

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
  const activeMarker = 'diagnose-question-package-page-active-question-'
  const active = elements.find(item => item.elementId.includes(activeMarker))
  if (active) {
    return active.elementId.slice(active.elementId.indexOf(activeMarker) + activeMarker.length)
  }
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
    if (!parsed) {
      continue
    }
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
  if (!questionId) {
    return {}
  }
  const marker = 'diagnose-question-package-page-question-shell-' + questionId
  const shell = await findElementByIdSuffix(page, marker, 3000, 200)
  if (!shell) {
    return { questionId, decodedQuestionId: decodeQuestionKey(questionId) }
  }
  const rawText = await safeText(shell)
  const firstLine = safeFirstLine(rawText)
  return {
    questionId,
    decodedQuestionId: decodeQuestionKey(questionId),
    text: firstLine
  }
}

async function clickQuestionNext(page, questionId) {
  // The package footer owns the generic next action. Prefer the page-scoped
  // control so a shell lookup cannot accidentally resolve a hidden neighbor
  // during the swiper transition.
  const pageNextCandidates = (await collectElementsWithId(page)).filter(item =>
    item.elementId.endsWith('diagnose-question-package-page-next-button')
  )
  const pageNext = pageNextCandidates.at(-1)?.element
  if (pageNext) {
    await pageNext.tap()
    return true
  }
  const nextByQuestion = await findElementByIdSuffix(
    page,
    'diagnose-question-package-page-question-shell-' + questionId,
    2000,
    200
  )
  if (!nextByQuestion) {
    const fallback = await findElementByIdSuffix(
      page,
      'diagnose-question-package-page-next-button',
      2000,
      200
    )
    if (!fallback) {
      return false
    }
    await fallback.tap()
    return true
  }

  const host = nextByQuestion
  const next = await host.$('[id$="diagnose-question-package-page-next-button"]')
  if (!next) {
    const fallback = await findElementByIdSuffix(
      page,
      'diagnose-question-package-page-next-button',
      2000,
      200
    )
    if (!fallback) {
      return false
    }
    await fallback.tap()
    return true
  }

  await next.tap()
  return true
}

export {
  normalize,
  normalizeText,
  sleep,
  safeText,
  collectElementsWithId,
  findElementByIdSuffix,
  findElementByIdContains,
  findActiveQuestionIdFromDom,
  collectQuestionOptions,
  collectQuestionShellIds,
  resolveQuestionMetaByShell,
  resolveQuestionState,
  clickQuestionNext
}
