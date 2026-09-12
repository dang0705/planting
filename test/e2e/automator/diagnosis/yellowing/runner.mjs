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
const SCROLL_SETTLE_MS = 500
const SCROLL_TOP_TOLERANCE = 1
const TIMELINE_SCROLL_PROBE_DATE_COUNT = 6
const QUESTION_PAGE_SCROLL_ID = 'diagnose-question-package-page-scroll'
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

function productAssertion(message) {
  const error = new Error(message)
  error.failure_kind = 'failed_product'
  return error
}

async function readQuestionScrollMetrics(page, questionId) {
  const content = await findElementByIdSuffix(page, QUESTION_PAGE_SCROLL_ID, 5000, 200)
  if (!content || typeof content.scrollTo !== 'function') {
    throw productAssertion('未找到问诊页唯一纵向滚动容器')
  }
  const size = await content.size()
  const activeQuestion = await findElementByIdSuffix(
    page,
    `diagnose-question-package-page-question-scroll-${questionId}`,
    5000,
    200
  )
  if (!activeQuestion) {
    throw productAssertion(`未找到当前题内容：${questionId}`)
  }
  const activeQuestionSize = await activeQuestion.size()
  return {
    questionId,
    viewportHeight: Number(size?.height || 0),
    scrollHeight: Number(await content.scrollHeight()),
    scrollTop: Number(await content.property('scrollTop').catch(() => 0)) || 0,
    contentHeight: Number(activeQuestionSize?.height || 0)
  }
}

async function scrollQuestionContentToBottom({ page, questionId }) {
  const before = await readQuestionScrollMetrics(page, questionId)
  if (before.scrollHeight <= before.viewportHeight + SCROLL_TOP_TOLERANCE) {
    throw productAssertion(
      `问诊页没有形成可滚动内容：height=${before.viewportHeight}, scrollHeight=${before.scrollHeight}`
    )
  }
  const content = await findElementByIdSuffix(page, QUESTION_PAGE_SCROLL_ID, 5000, 200)
  await content.scrollTo(0, before.scrollHeight)
  await sleep(SCROLL_SETTLE_MS)

  const after = await readQuestionScrollMetrics(page, questionId)
  if (after.scrollTop <= SCROLL_TOP_TOLERANCE) {
    throw productAssertion(`问诊页纵向滚动未生效：scrollTop=${after.scrollTop}`)
  }
  return {
    owner: QUESTION_PAGE_SCROLL_ID,
    before,
    after
  }
}

async function selectTimelineDatesForScroll(page, questionId) {
  const dateIdPrefix = `diagnose-question-package-${questionId}-care-behavior-date-`
  const dateCandidates = []
  for (const item of await collectElementsWithId(page)) {
    if (!item.elementId.includes(dateIdPrefix)) {
      continue
    }
    const className = String((await item.element.attribute('class').catch(() => '')) || '')
    if (!className.includes('care-behavior-cell--selectable')) {
      continue
    }
    dateCandidates.push(
      item.elementId.slice(item.elementId.indexOf(dateIdPrefix) + dateIdPrefix.length)
    )
  }
  const selectedDates = dateCandidates.slice(-TIMELINE_SCROLL_PROBE_DATE_COUNT)
  if (selectedDates.length < TIMELINE_SCROLL_PROBE_DATE_COUNT) {
    throw productAssertion(
      `可记录浇水日期不足：expected=${TIMELINE_SCROLL_PROBE_DATE_COUNT}, actual=${selectedDates.length}`
    )
  }
  for (const date of selectedDates) {
    const cell = await findElementByIdSuffix(page, `${dateIdPrefix}${date}`, 3000, 200)
    if (!cell) {
      throw productAssertion(`未找到可记录浇水日期：${date}`)
    }
    await cell.tap()
    await sleep(300)
  }
  return selectedDates
}

async function countTimelineDoseSliders(page, questionId) {
  const idPrefix = `diagnose-question-package-${questionId}-watering-dose-slider-`
  return (await collectElementsWithId(page)).filter(item => item.elementId.includes(idPrefix))
    .length
}

async function readTimelineState(page, questionId) {
  const timeline = await findElementByIdSuffix(
    page,
    `diagnose-question-package-${questionId}-care-behavior-timeline-${questionId}`,
    3000,
    200
  )
  if (!timeline) {
    return {
      present: false
    }
  }
  return {
    present: true
  }
}

async function readSelectedTimelineDates(page, questionId) {
  const dateIdPrefix = `diagnose-question-package-${questionId}-care-behavior-date-`
  const selectedDates = []
  for (const item of await collectElementsWithId(page)) {
    if (!item.elementId.includes(dateIdPrefix)) {
      continue
    }
    const className = String((await item.element.attribute('class').catch(() => '')) || '')
    if (!className.includes('care-behavior-cell--selected')) {
      continue
    }
    selectedDates.push(
      item.elementId.slice(item.elementId.indexOf(dateIdPrefix) + dateIdPrefix.length)
    )
  }
  return selectedDates.sort()
}

async function waitForActiveQuestion(miniProgram, expectedQuestionId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  let latestPage = null
  let latestState = null
  while (Date.now() < deadline) {
    latestPage = await miniProgram.currentPage()
    latestState = await resolveQuestionState(latestPage)
    if (latestState.currentQuestionId === expectedQuestionId) {
      return { page: latestPage, state: latestState }
    }
    await sleep(200)
  }
  return { page: latestPage, state: latestState }
}

async function clickQuestionPrevious(page) {
  const previous = await findElementByIdSuffix(
    page,
    'diagnose-question-package-page-prev-button',
    3000,
    200
  )
  if (!previous) {
    return false
  }
  await previous.tap()
  return true
}

async function verifyQuestionScrollReset({
  miniProgram,
  page,
  questionId,
  expectedSelectedDates,
  pushLog
}) {
  const beforeState = await resolveQuestionState(page)
  const scrollProbe = await scrollQuestionContentToBottom({ page, questionId })
  pushLog({
    type: 'timeline-persistence-probe',
    phase: 'before-forward',
    timelineState: await readTimelineState(page, questionId)
  })

  const movedForward = await clickQuestionNext(page, questionId)
  if (!movedForward) {
    throw productAssertion('滚动后的当前题无法通过真实下一题按钮前进')
  }
  await sleep(SCROLL_SETTLE_MS)
  const targetPage = await miniProgram.currentPage()
  const targetState = await resolveQuestionState(targetPage)
  const targetQuestionId = targetState.currentQuestionId
  if (!targetQuestionId || targetQuestionId === questionId) {
    throw productAssertion(`前进后未切换到下一题：${targetQuestionId || 'missing'}`)
  }
  const firstForward = await readQuestionScrollMetrics(targetPage, targetQuestionId)
  if (firstForward.scrollTop > SCROLL_TOP_TOLERANCE) {
    throw productAssertion(`首次前进后滚动未复位：scrollTop=${firstForward.scrollTop}`)
  }
  pushLog({
    type: 'timeline-persistence-probe',
    phase: 'after-first-forward',
    selectedDates: await readSelectedTimelineDates(targetPage, questionId),
    doseSliderCount: await countTimelineDoseSliders(targetPage, questionId),
    timelineState: await readTimelineState(targetPage, questionId)
  })

  const movedBack = await clickQuestionPrevious(targetPage)
  if (!movedBack) {
    throw productAssertion('下一题后未找到真实上一题按钮')
  }
  await waitForActiveQuestion(miniProgram, questionId)
  await sleep(SCROLL_SETTLE_MS)
  const returnedPage = await miniProgram.currentPage()
  const returnedState = await resolveQuestionState(returnedPage)
  if (returnedState.currentQuestionId !== questionId) {
    throw productAssertion(
      `返回后未回到浇水日历题：${returnedState.currentQuestionId || 'missing'}`
    )
  }
  const returnedSelectedDates = await readSelectedTimelineDates(returnedPage, questionId)
  const expectedDates = [...expectedSelectedDates].sort()
  pushLog({
    type: 'timeline-persistence-probe',
    phase: 'after-return',
    selectedDates: returnedSelectedDates,
    expectedDates,
    doseSliderCount: await countTimelineDoseSliders(returnedPage, questionId),
    timelineState: await readTimelineState(returnedPage, questionId)
  })
  if (JSON.stringify(returnedSelectedDates) !== JSON.stringify(expectedDates)) {
    throw productAssertion(
      `返回后浇水日期未完整回显：expected=${expectedDates.join(',')}, actual=${returnedSelectedDates.join(',')}`
    )
  }
  const returnedDoseSliderCount = await countTimelineDoseSliders(returnedPage, questionId)
  if (returnedDoseSliderCount < expectedDates.length) {
    throw productAssertion(
      `返回后浇水剂量滑块未完整回显：expected=${expectedDates.length}, actual=${returnedDoseSliderCount}`
    )
  }
  const returnedScroll = await readQuestionScrollMetrics(returnedPage, questionId)
  if (returnedScroll.scrollTop > SCROLL_TOP_TOLERANCE) {
    throw productAssertion(`返回浇水日历题后滚动未复位：scrollTop=${returnedScroll.scrollTop}`)
  }

  const movedForwardAgain = await clickQuestionNext(returnedPage, questionId)
  if (!movedForwardAgain) {
    throw productAssertion('返回浇水日历题后无法再次前进')
  }
  await sleep(SCROLL_SETTLE_MS)
  const secondTargetPage = await miniProgram.currentPage()
  const secondTargetState = await resolveQuestionState(secondTargetPage)
  const secondTargetQuestionId = secondTargetState.currentQuestionId
  if (!secondTargetQuestionId || secondTargetQuestionId === questionId) {
    throw productAssertion(`再次前进后未切换到下一题：${secondTargetQuestionId || 'missing'}`)
  }
  const secondForward = await readQuestionScrollMetrics(secondTargetPage, secondTargetQuestionId)
  if (secondForward.scrollTop > SCROLL_TOP_TOLERANCE) {
    throw productAssertion(`返回后再次前进滚动未复位：scrollTop=${secondForward.scrollTop}`)
  }

  const evidence = {
    sourceQuestionId: questionId,
    targetQuestionId,
    scrollOwner: scrollProbe.owner,
    before: {
      contentHeight: scrollProbe.before.contentHeight,
      viewportHeight: scrollProbe.before.viewportHeight,
      scrollHeight: scrollProbe.before.scrollHeight,
      scrollTop: scrollProbe.before.scrollTop
    },
    scrolled: {
      contentHeight: scrollProbe.after.contentHeight,
      viewportHeight: scrollProbe.after.viewportHeight,
      scrollHeight: scrollProbe.after.scrollHeight,
      scrollTop: scrollProbe.after.scrollTop
    },
    firstForward,
    returned: {
      selectedDates: returnedSelectedDates,
      doseSliderCount: returnedDoseSliderCount,
      scroll: returnedScroll
    },
    secondForward: {
      questionId: secondTargetQuestionId,
      scroll: secondForward
    }
  }
  pushLog({ type: 'scroll-reset', passed: true, ...evidence })
  return { beforeState, movedForward: true, evidence }
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

async function collectResultAdviceGroups(page) {
  const groups = []
  const outcomeLabels = []
  try {
    for (const element of await page.$$('[data-advice-group-key]')) {
      const key = normalizeText(await element.attribute('data-advice-group-key'))
      const section = normalizeText(await element.attribute('data-advice-section'))
      if (!key || !section) {
        continue
      }
      groups.push({
        key,
        section,
        text: normalizeText(await safeText(element))
      })
    }
    for (const element of await page.$$('[data-diagnosis-outcome-label]')) {
      const label = normalizeText(await safeText(element))
      if (label) {
        outcomeLabels.push(label)
      }
    }
  } catch {
    return { groups: [], outcomeLabels: [] }
  }
  return { groups, outcomeLabels }
}

async function waitForDiagnosisFlowEntry(miniProgram, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let latestPage = null
  while (Date.now() < deadline) {
    latestPage = await miniProgram.currentPage()
    const route = normalizeText(latestPage?.path)
    if (route.includes('subpackages/diagnosis/flow')) {
      const entry = await findElementByIdSuffix(
        latestPage,
        'diagnosis-flow-page-content',
        1000,
        200
      )
      if (entry) {
        return { page: latestPage, entry }
      }
    }
    await sleep(300)
  }
  return { page: latestPage, entry: null }
}

async function waitForQuestionPackageEntry(miniProgram, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let latestPage = null
  let latestState = null
  while (Date.now() < deadline) {
    latestPage = await miniProgram.currentPage()
    latestState = await resolveQuestionState(latestPage)
    if (
      latestState.path.includes('subpackages/diagnosis/question-package') &&
      latestState.hasActiveQuestions
    ) {
      return { page: latestPage, state: latestState }
    }
    await sleep(500)
  }
  return { page: latestPage, state: latestState }
}

async function readDiagnosisIntakeDebugState(miniProgram, page, { authProbeBaseUrl = '' } = {}) {
  const state = {
    pageData: null,
    dom: null,
    runtimeStore: null,
    storageKeys: [],
    userStorage: null
  }
  try {
    const pageData = await page.data()
    state.pageData = {
      selectedDevSymptomClassKey: String(pageData?.selectedDevSymptomClassKey || ''),
      selectedDiagnosisProfile: String(pageData?.selectedDiagnosisProfile || ''),
      canStartDiagnoseNow: pageData?.canStartDiagnoseNow === true,
      isStartingDiagnosis: pageData?.isStartingDiagnosis === true,
      featureUnavailableVisible: pageData?.featureUnavailableVisible === true,
      openedFeatureKey: String(pageData?.openedFeatureKey || '')
    }
  } catch {
    state.pageData = { error: 'page.data unavailable' }
  }
  try {
    const yellow = await page.$('[id$="diagnose-dev-symptom-class-option-yellowing_mode"]')
    const status = await page.$('[id$="diagnose-dev-symptom-class-status"]')
    const submit = await page.$('[id$="diagnose-submit-button"]')
    state.dom = {
      yellowFound: Boolean(yellow),
      yellowClass: yellow ? String((await yellow.attribute('class')) || '') : '',
      yellowText: yellow ? String((await yellow.text()) || '') : '',
      statusFound: Boolean(status),
      submitFound: Boolean(submit),
      submitDisabled: submit ? Boolean(await submit.property('disabled')) : null
    }
  } catch {
    state.dom = { error: 'dom inspection unavailable' }
  }
  try {
    state.runtimeStore = await miniProgram.evaluate(function () {
      const app = typeof getApp === 'function' ? getApp() : null
      const piniaState = app?.$vm?.$pinia?.state?.value?.user || null
      const user = piniaState && typeof piniaState === 'object' ? piniaState : {}
      const membership =
        user.membership && typeof user.membership === 'object' ? user.membership : {}
      return {
        isLoggedIn: user.isLoggedIn === true,
        hasUserId: Boolean(String(user.userId || '').trim()),
        hasOpenid: Boolean(String(user.openid || '').trim()),
        hasToken: Boolean(String(user.token || '').trim()),
        membershipType: String(membership.type || ''),
        membershipStatus: String(membership.status || ''),
        membershipExpireTime: membership.expireTime || null,
        piniaStateFound: Boolean(piniaState)
      }
    })
    state.runtimeStore.ensureLoginResult = await miniProgram.evaluate(async function () {
      const app = typeof getApp === 'function' ? getApp() : null
      const store = app?.$vm?.$pinia?._s?.get('user') || null
      if (!store || typeof store.ensureLogin !== 'function') {
        return null
      }
      try {
        return await store.ensureLogin()
      } catch (error) {
        return {
          error: String(error?.message || error || '')
        }
      }
    })
    state.runtimeStore.authUserProbe = await miniProgram.evaluate(async function (baseUrl) {
      const session = wx?.getStorageSync?.('planting-platform-session') || {}
      const accessToken = String(session?.accessToken || '').trim()
      const normalizedBaseUrl = String(baseUrl || '')
        .trim()
        .replace(/\/+$/u, '')
      if (!normalizedBaseUrl || !accessToken || typeof wx?.request !== 'function') {
        return { status: 'not_attempted', transport: 'wx.request' }
      }
      return await new Promise(resolve => {
        try {
          wx.request({
            url: `${normalizedBaseUrl}/auth-user-http/auth/user`,
            method: 'POST',
            header: {
              'Content-Type': 'application/json',
              'x-planting-platform-session': accessToken,
              'x-app-env': 'development',
              'x-env': 'development'
            },
            data: { action: 'getUserByOpenid', data: {} },
            success: response => {
              const body = response?.data && typeof response.data === 'object' ? response.data : {}
              const user = body?.data && typeof body.data === 'object' ? body.data : null
              resolve({
                status: 'completed',
                statusCode: Number(response?.statusCode || 0),
                responseCode: body?.code ?? null,
                message: String(body?.message || ''),
                userFields: user ? Object.keys(user).sort() : [],
                userIdPresent: Boolean(String(user?._id || user?.id || '').trim()),
                subscriptionPlan: String(user?.subscription_plan || ''),
                transport: 'wx.request',
                runtimeIdentity: 'platform-session'
              })
            },
            fail: error =>
              resolve({
                status: 'failed',
                errMsg: String(error?.errMsg || error?.message || ''),
                transport: 'wx.request',
                runtimeIdentity: 'platform-session'
              })
          })
        } catch (error) {
          resolve({
            status: 'failed',
            errMsg: String(error?.message || error || ''),
            transport: 'wx.request',
            runtimeIdentity: 'platform-session'
          })
        }
      })
    }, authProbeBaseUrl)
  } catch {
    state.runtimeStore = { error: 'runtime store inspection unavailable' }
  }
  try {
    const storageInfo = await miniProgram.callWxMethod('getStorageInfoSync')
    state.storageKeys = Array.isArray(storageInfo?.keys) ? storageInfo.keys : []
    const rawUserStorage = await miniProgram.callWxMethod('getStorageSync', 'user')
    let userStorage = rawUserStorage
    if (typeof userStorage === 'string') {
      try {
        userStorage = JSON.parse(userStorage)
      } catch {
        userStorage = null
      }
    }
    const user =
      userStorage?.user && typeof userStorage.user === 'object' ? userStorage.user : userStorage
    const membership =
      user?.membership && typeof user.membership === 'object' ? user.membership : {}
    state.userStorage = {
      isLoggedIn: user?.isLoggedIn === true,
      hasUserId: Boolean(String(user?.userId || '').trim()),
      hasOpenid: Boolean(String(user?.openid || '').trim()),
      hasToken: Boolean(String(user?.token || '').trim()),
      membershipType: String(membership.type || ''),
      membershipStatus: String(membership.status || ''),
      membershipExpireTime: membership.expireTime || null,
      valueType: Array.isArray(rawUserStorage) ? 'array' : typeof rawUserStorage,
      valueKeys:
        userStorage && typeof userStorage === 'object' ? Object.keys(userStorage).sort() : []
    }
  } catch {
    state.userStorage = { error: 'storage inspection unavailable' }
  }
  return state
}

export async function runYellowingQuickFlow({
  wsEndpoint,
  projectPath: _projectPath,
  maxSteps,
  profile,
  entrySource = 'plant_card',
  authProbeBaseUrl = ''
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

    let diagnosisEntry = null
    if (entrySource === 'diagnose_tab') {
      startPage = await navigateNativeTab({
        mp: miniProgram,
        logicalPath: '/pages/diagnose/diagnose',
        expectedRoute: 'pages/diagnose/diagnose'
      })
      diagnosisEntry = await findElementByIdSuffix(startPage, 'diagnose-tab-intake', 12000, 300)
      if (!diagnosisEntry) {
        throw new Error('未命中诊断 Tab 无图入口（diagnose-tab-intake）')
      }
    } else {
      const entry = await findElementByIdContains(startPage, 'diagnose-entry-button-')
      if (!entry) {
        throw new Error('未找到诊断入口按钮（id 包含 diagnose-entry-button-）')
      }
      await entry.tap()
      const diagnosisEntryResult = await waitForDiagnosisFlowEntry(miniProgram)
      startPage = diagnosisEntryResult.page
      diagnosisEntry = diagnosisEntryResult.entry
      if (!diagnosisEntry) {
        throw new Error('未命中诊断分包真实流程（diagnosis-flow-page-content）')
      }
    }
    pushLog({
      type: 'state',
      label: 'diagnosis-entry-opened',
      path: (await resolveQuestionState(startPage)).path,
      entrySource
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
    await miniProgram.pageScrollTo(Math.max(0, Number((await startPage.size()).height) || 0))
    await sleep(500)
    startPage = await miniProgram.currentPage()
    const yellowBtn = await findElementByIdSuffix(
      startPage,
      'diagnose-dev-symptom-class-option-yellowing_mode',
      12000,
      300
    )
    if (!yellowBtn) {
      throw new Error('未找到黄叶症状项（diagnose-dev-symptom-class-option-yellowing_mode）')
    }
    const staleSymptomSelection = await findElementByIdSuffix(
      startPage,
      'diagnose-dev-symptom-class-clear-button',
      1000,
      200
    )
    if (staleSymptomSelection) {
      await staleSymptomSelection.tap()
      await sleep(300)
      pushLog({
        type: 'state',
        label: 'cleared-stale-symptom-selection',
        path: (await resolveQuestionState(startPage)).path
      })
    }
    const freshYellowBtn = await findElementByIdSuffix(
      startPage,
      'diagnose-dev-symptom-class-option-yellowing_mode',
      3000,
      200
    )
    if (!freshYellowBtn) {
      throw new Error('清理残留症状选择后未找到黄叶症状项')
    }
    await freshYellowBtn.tap()

    // 测试账户可能保留上一轮真实图片草稿。此时选择黄叶只更新症状选择，
    // 组件按产品逻辑不会自动提交；必须继续点击可用的“开始检查”才能触发 start。
    // 如果无图模式已由选择动作自动提交，按钮会进入 disabled 状态，此处不重复点击。
    await sleep(300)
    startPage = await miniProgram.currentPage()
    const submitButton = await findElementByIdSuffix(startPage, 'diagnose-submit-button', 3000, 200)
    const submitDisabled = submitButton
      ? await submitButton.property('disabled').catch(() => false)
      : true
    if (
      submitButton &&
      !(submitDisabled === true || String(submitDisabled).toLowerCase() === 'true')
    ) {
      await submitButton.tap()
      await sleep(300)
      pushLog({
        type: 'state',
        label: 'diagnosis-start-button-clicked',
        path: (await resolveQuestionState(await miniProgram.currentPage())).path,
        buttonText: '开始检查'
      })
    }

    pushLog({
      type: 'state',
      label: 'after-yellowing-tap',
      path: (await resolveQuestionState(await miniProgram.currentPage())).path,
      debug: await readDiagnosisIntakeDebugState(miniProgram, await miniProgram.currentPage(), {
        authProbeBaseUrl
      })
    })

    const questionPackageEntry = await waitForQuestionPackageEntry(miniProgram)
    if (
      !questionPackageEntry.state?.path.includes('subpackages/diagnosis/question-package') ||
      !questionPackageEntry.state.hasActiveQuestions
    ) {
      throw new Error(
        `点击黄叶后未进入真实题包：${JSON.stringify({
          path: questionPackageEntry.state?.path || '',
          hasActiveQuestions: questionPackageEntry.state?.hasActiveQuestions || false
        })}`
      )
    }

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
      const isWateringTimelineQuestion = String(currentQuestionId).includes(
        'watering_frequency_context'
      )
      if (
        !candidates.length &&
        !isWateringTimelineQuestion &&
        !String(currentQuestionId).includes('light_change_context') &&
        !String(currentQuestionId).includes('air_environment')
      ) {
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
      if (String(currentQuestionId).includes('light_change_context')) {
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
        const selectedLight = await completeLightEnvironmentQuestion(
          pageNow,
          currentQuestionId,
          pushLog
        )
        if (!selectedLight) {
          throw new Error(`光照环境题无法选择“直射光”：${currentQuestionId}`)
        }
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
          chosenOptionText: '直射光',
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
        if (!afterState.path.includes('subpackages/diagnosis/question-package')) {
          pushLog({ type: 'state', label: 'route-changed', path: afterState.path })
          break
        }
        questionIndex += 1
        continue
      }
      if (String(currentQuestionId).includes('air_environment')) {
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
        // 真实测试账号已存在这盆植物的空气环境。摘要态已经是有效答案，
        // 不应为了让脚本继续而覆盖用户已保存的数据或打开编辑器。
        const nextButtonCandidates = (await collectElementsWithId(pageNow)).filter(item =>
          item.elementId.endsWith('diagnose-question-package-page-next-button')
        )
        const buttonStates = []
        for (const candidate of nextButtonCandidates.slice().reverse()) {
          const disabledValue = await candidate.element.property('disabled').catch(() => false)
          const disabled = disabledValue === true || String(disabledValue).toLowerCase() === 'true'
          buttonStates.push({ id: candidate.elementId, disabled })
        }
        // 微信 Automator 在此固定底部 button 上会把属性读成 disabled=true，
        // 即使当前渲染已显示可点击的“完成问诊”。以真实 tap 后是否离开题包页
        // 作为可用性判定，避免把驱动属性误报为产品阻断。
        const nextButton = nextButtonCandidates.at(-1)?.element || null
        pushLog({
          type: 'state',
          label: 'air-environment-last-button-ready',
          found: Boolean(nextButton),
          reportedDisabled: buttonStates.at(0)?.disabled ?? null,
          candidates: buttonStates
        })
        if (!nextButton) {
          throw new Error(
            `空气环境题未找到固定底部的“完成问诊”按钮：${JSON.stringify({
              currentQuestionId,
              beforePage,
              candidates: buttonStates
            })}`
          )
        }
        await nextButton.tap()
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
          chosenOptionText: '已保存空气环境 / 固定底部“完成问诊”',
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

      if (!isWateringTimelineQuestion && !options.length) {
        pushLog({ type: 'state', label: 'no-available-option', questionId: currentQuestionId })
        break
      }

      await completeLightEnvironmentQuestion(pageNow, currentQuestionId, pushLog)

      const picked = isWateringTimelineQuestion
        ? null
        : pickBestOption(questionMeta, options, profile)
      if (!isWateringTimelineQuestion && !picked) {
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
      if (isWateringTimelineQuestion) {
        const timelineWeather = await waitForTimelineWeatherEvidence(pageNow)
        pushLog({
          type: 'timeline-weather',
          questionId: currentQuestionId,
          cells: timelineWeather,
          noticeText: await collectTimelineWeatherNotice(pageNow)
        })
      }
      let chosenOptionText = ''
      let scrollResetProbe = null
      if (isWateringTimelineQuestion) {
        const selectedDates = await selectTimelineDatesForScroll(pageNow, currentQuestionId)
        await sleep(800)
        pageNow = await miniProgram.currentPage()
        const doseSliderCount = await countTimelineDoseSliders(pageNow, currentQuestionId)
        if (doseSliderCount < selectedDates.length) {
          throw productAssertion(
            `日期选择后未生成足够剂量滑块：expected=${selectedDates.length}, actual=${doseSliderCount}`
          )
        }
        shot = await screenshot(
          miniProgram,
          wsEndpoint,
          reportDir,
          `step-${questionIndex + 1}-scroll-source`
        )
        miniProgram = shot.miniProgram
        shots.push(shot.path)
        screenshotAttempts.push({
          label: `step-${questionIndex + 1}-scroll-source`,
          attempts: shot.attempts
        })
        scrollResetProbe = await verifyQuestionScrollReset({
          miniProgram,
          page: await miniProgram.currentPage(),
          questionId: currentQuestionId,
          expectedSelectedDates: selectedDates,
          pushLog
        })
        chosenOptionText = `已记录 ${selectedDates.join('、')} 浇水`
      } else {
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
        chosenOptionText = refreshedPicked.text
      }
      const beforePage = scrollResetProbe?.beforeState || (await resolveQuestionState(pageNow))
      const nextButton =
        scrollResetProbe?.movedForward || (await clickQuestionNext(pageNow, currentQuestionId))
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
        chosenOptionText,
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
    pushLog({ type: 'result-advice-groups', ...(await collectResultAdviceGroups(finalPage)) })

    shot = await screenshot(miniProgram, wsEndpoint, reportDir, 'final-state')
    miniProgram = shot.miniProgram
    pushLog({ type: 'result', screenshot: shot.path })
    screenshotAttempts.push({ label: 'final-state', attempts: shot.attempts })
  } catch (error) {
    error.partialResult = {
      reportDir,
      logs,
      shots,
      screenshotAttempts,
      capturedRequests,
      startedAt: new Date().toISOString()
    }
    throw error
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
