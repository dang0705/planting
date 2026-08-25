'use strict'
import {
  AIR_ENVIRONMENT_FIXTURE_PLANT,
  inspectAirEnvironmentHomeFixtureState
} from './air-environment-fixture.mjs'
import {
  recordAssertion,
  recordPageData,
  setClassification
} from '../../care/airflow/_shared/lib/reporter.mjs'
import { waitForRoute } from './home-entry-elements.mjs'
export {
  findElementById,
  listElementIds,
  tapElementById,
  waitForActiveQuestionPackagePage
} from './home-entry-elements.mjs'
const FIXTURE_PLANT_ID = Number(AIR_ENVIRONMENT_FIXTURE_PLANT.id)
const DIAGNOSE_POPUP_COMPONENT_CHAIN = Object.freeze([
  'diagnose-popup',
  'bottom-sheet',
  'diagnose-flow',
  'diagnose-upload-stage'
])
const READINESS_TIMEOUT_MS = 15000
const READINESS_RETRY_DELAY_MS = 250
const INDEX_HOME_ROUTE = 'pages/index/index'
const QUESTION_PACKAGE_ROUTE = 'subpackages/diagnosis/question-package'
const RETURN_ENTRY_ROUTES = new Set(['pages/index/index', 'pages/diagnose/diagnose'])
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const normalizePageRoute = page => String(page?.path || '').replace(/^\//, '')
const blockQuestionPackageReturn = (report, symptom, detail) => {
  setClassification(report, 'BLOCKED_ENV', `${symptom}: ${detail}`)
  return null
}
export function requestedCaseKeys(argv, caseKeys) {
  const value = argv.find(item => item.startsWith('--symptom='))?.slice('--symptom='.length)
  if (!value) {
    return caseKeys
  }
  if (!caseKeys.includes(value)) {
    throw new Error(`invalid --symptom=${value}`)
  }
  return [value]
}
export async function switchTabHomeBeforeFixture({
  mp,
  report,
  switchTab,
  installFixture,
  markFixtureAttempted
}) {
  const launchedHome = await switchTab().catch(error => ({
    navigationError: String(error?.message || error)
  }))
  const observedRoute = normalizePageRoute(launchedHome)
  const routeReady = observedRoute === INDEX_HOME_ROUTE && !launchedHome?.navigationError
  const summary = {
    expectedRoute: INDEX_HOME_ROUTE,
    observedRoute,
    routeReady,
    navigation_channel: 'native_tabbar',
    native_tab_path: INDEX_HOME_ROUTE,
    navigation_error: launchedHome?.navigationError ?? null
  }
  recordPageData(report, launchedHome?.path || 'unavailable', { automatorBootstrapRoute: summary })
  recordAssertion(report, 'switchTab home route', routeReady, JSON.stringify(summary))
  if (!routeReady) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `automator_route_registry_stale: expected ${INDEX_HOME_ROUTE}, observed ${observedRoute || 'unavailable'}`
    )
    return { launchedHome, fixturePlant: null, homePage: null }
  }
  markFixtureAttempted()
  const fixturePlant = await installFixture()
  return { launchedHome, fixturePlant, homePage: await mp.currentPage() }
}
function homeReadinessSummary(runtime, targetEntryId, indexPlantList, targetPlantCard, entry) {
  return {
    isAuthenticated: runtime.isAuthenticated === true,
    isLoggedIn: runtime.isLoggedIn === true,
    fixturePlantId: runtime.fixturePlantId,
    plantIds: runtime.plantIds,
    fixturePlantPresent: runtime.fixturePlantPresent === true,
    indexPlantListPresent: Boolean(indexPlantList),
    targetPlantCardPresent: Boolean(targetPlantCard),
    targetEntryId,
    targetEntryPresent: Boolean(entry)
  }
}
export async function resolveKnownDiagnosePopupQuickEntry(page, symptom) {
  const targetQuickEntryId = `diagnose-dev-symptom-class-option-${symptom}`
  let scope = page
  const componentPath = []
  for (const selector of DIAGNOSE_POPUP_COMPONENT_CHAIN) {
    scope = scope ? await scope.$(selector) : null
    componentPath.push({ selector, present: Boolean(scope) })
    if (!scope) {
      return { componentPath, targetQuickEntryId, targetQuickEntryPresent: false, entry: null }
    }
  }
  const entry = await scope.$(`#${targetQuickEntryId}`)
  return { componentPath, targetQuickEntryId, targetQuickEntryPresent: Boolean(entry), entry }
}
function diagnosePopupQuickEntrySummary(resolution, symptom) {
  return {
    targetQuickEntryId:
      resolution?.targetQuickEntryId || `diagnose-dev-symptom-class-option-${symptom}`,
    componentPath: Array.isArray(resolution?.componentPath)
      ? resolution.componentPath.map(({ selector, present }) => ({
          selector,
          present: Boolean(present)
        }))
      : [],
    targetQuickEntryPresent: resolution?.targetQuickEntryPresent === true,
    ...(resolution ? {} : { unavailable: true })
  }
}
export async function waitForKnownDiagnosePopupQuickEntry({
  page,
  report,
  symptom,
  pagePath,
  timeoutMs = READINESS_TIMEOUT_MS,
  now = Date.now,
  sleepFn = sleep,
  retryDelayMs = READINESS_RETRY_DELAY_MS
}) {
  const end = now() + timeoutMs
  let resolution = null
  while (now() < end) {
    resolution = await resolveKnownDiagnosePopupQuickEntry(page, symptom)
    if (resolution.targetQuickEntryPresent) {
      break
    }
    await sleepFn(retryDelayMs)
  }
  const summary = diagnosePopupQuickEntrySummary(resolution, symptom)
  recordPageData(report, pagePath, { diagnosePopupQuickEntry: summary })
  recordAssertion(
    report,
    `${symptom}: DiagnosePopup component path exposes the known no-image entry id`,
    summary.targetQuickEntryPresent,
    JSON.stringify(summary)
  )
  if (!summary.targetQuickEntryPresent) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `${symptom}: DiagnosePopup component path did not expose ${summary.targetQuickEntryId}: ${JSON.stringify(summary)}`
    )
    return null
  }
  return resolution?.entry ?? null
}
export async function waitForKnownHomeEntry({
  mp,
  page,
  report,
  symptom,
  pagePath,
  timeoutMs = READINESS_TIMEOUT_MS,
  now = Date.now,
  sleepFn = sleep,
  retryDelayMs = READINESS_RETRY_DELAY_MS
}) {
  const targetEntryId = `diagnose-entry-button-${FIXTURE_PLANT_ID}`
  const end = now() + timeoutMs
  let summary = null
  let entry = null
  while (now() < end) {
    const runtime = await inspectAirEnvironmentHomeFixtureState(mp)
    const indexPlantList = await page.$('#index-plant-list')
    const targetPlantCard = await page.$('plant-card')
    entry = targetPlantCard ? await targetPlantCard.$(`#${targetEntryId}`) : null
    summary = homeReadinessSummary(runtime, targetEntryId, indexPlantList, targetPlantCard, entry)
    if (
      summary.isAuthenticated &&
      summary.fixturePlantPresent &&
      summary.indexPlantListPresent &&
      summary.targetPlantCardPresent &&
      summary.targetEntryPresent
    ) {
      break
    }
    await sleepFn(retryDelayMs)
  }
  recordPageData(report, pagePath, summary || { targetEntryId, unavailable: true })
  const ready = Boolean(
    summary?.isAuthenticated &&
    summary?.fixturePlantPresent &&
    summary?.indexPlantListPresent &&
    summary?.targetPlantCardPresent &&
    summary?.targetEntryPresent
  )
  recordAssertion(
    report,
    `${symptom}: home readiness exposes the known diagnosis entry id`,
    ready,
    JSON.stringify(summary)
  )
  if (!ready) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `${symptom}: home readiness did not expose ${targetEntryId}: ${JSON.stringify(summary)}`
    )
    return null
  }
  return entry
}
export async function returnQuestionPackageWithLayoutBack({
  mp,
  page,
  report,
  symptom,
  waitForRouteFn = waitForRoute,
  routeTimeoutMs = READINESS_TIMEOUT_MS,
  routeOptions
}) {
  const stalePageRoute = normalizePageRoute(page)
  const activePackagePage = await mp.currentPage()
  const sourceRoute = normalizePageRoute(activePackagePage)
  const layout = await activePackagePage?.$('layout')
  const backAction = layout ? await layout.$('#layout-left-action') : null
  const summary = {
    sourceRoute,
    stalePageRoute,
    layoutPresent: Boolean(layout),
    targetBackActionId: 'layout-left-action',
    targetBackActionPresent: Boolean(backAction),
    triggerAttempted: false,
    returnedRoute: null
  }
  recordPageData(report, activePackagePage?.path || QUESTION_PACKAGE_ROUTE, {
    questionPackageReturn: { ...summary }
  })
  const ready = sourceRoute === QUESTION_PACKAGE_ROUTE && Boolean(backAction)
  recordAssertion(
    report,
    `${symptom}: active question package exposes Layout return action`,
    ready,
    JSON.stringify(summary)
  )
  if (!ready) {
    return blockQuestionPackageReturn(
      report,
      symptom,
      `question-package Layout return action is unavailable: ${JSON.stringify(summary)}`
    )
  }
  try {
    await backAction.tap()
  } catch (error) {
    return blockQuestionPackageReturn(
      report,
      symptom,
      `question-package Layout return action could not be tapped: ${String(error?.message || error)}`
    )
  }
  const tapObservedPage = await waitForRouteFn(
    mp,
    route => route !== QUESTION_PACKAGE_ROUTE,
    routeTimeoutMs,
    routeOptions
  )
  if (normalizePageRoute(tapObservedPage) === QUESTION_PACKAGE_ROUTE) {
    summary.triggerAttempted = true
    // A delayed route transition can detach the element returned before the
    // first wait window. Reacquire the current page and action before the
    // fallback dispatch; triggering the stale handle is what turns an
    // otherwise recoverable navigation delay into a 12-second timeout.
    const retryPage = await mp.currentPage()
    const retryLayout = await retryPage?.$('layout')
    const retryBackAction = retryLayout ? await retryLayout.$('#layout-left-action') : null
    if (!retryBackAction) {
      return blockQuestionPackageReturn(
        report,
        symptom,
        'question-package Layout return action disappeared before the fallback dispatch'
      )
    }
    try {
      await retryBackAction.trigger('tap')
    } catch (error) {
      return blockQuestionPackageReturn(
        report,
        symptom,
        `question-package Layout return action could not dispatch tap: ${String(error?.message || error)}`
      )
    }
  }
  const returnedPage = await waitForRouteFn(
    mp,
    route => RETURN_ENTRY_ROUTES.has(route),
    routeTimeoutMs,
    routeOptions
  )
  const returnedRoute = normalizePageRoute(returnedPage)
  if (RETURN_ENTRY_ROUTES.has(returnedRoute)) {
    summary.returnedRoute = returnedRoute
    recordPageData(report, returnedPage.path, { questionPackageReturn: { ...summary } })
    recordAssertion(
      report,
      `${symptom}: Layout return restores a diagnosis entry page`,
      true,
      JSON.stringify(summary)
    )
    return { page: returnedPage, route: returnedRoute }
  }
  summary.returnedRoute = normalizePageRoute(returnedPage)
  recordPageData(report, returnedPage?.path || 'unavailable', {
    questionPackageReturn: { ...summary }
  })
  recordAssertion(
    report,
    `${symptom}: Layout return restores a diagnosis entry page`,
    false,
    JSON.stringify(summary)
  )
  return blockQuestionPackageReturn(
    report,
    symptom,
    `Layout return did not restore a diagnosis entry page: ${JSON.stringify(summary)}`
  )
}
export async function returnToKnownHomeForPlantReentry({
  mp,
  page,
  report,
  symptom,
  waitForRouteFn,
  routeTimeoutMs,
  routeOptions,
  popupTimeoutMs,
  popupNow,
  popupSleepFn,
  popupRetryDelayMs
}) {
  const returned = await returnQuestionPackageWithLayoutBack({
    mp,
    page,
    report,
    symptom,
    waitForRouteFn,
    routeTimeoutMs,
    routeOptions
  })
  if (!returned) {
    return null
  }
  const returnedHome = returned.route === 'pages/index/index'
  recordAssertion(
    report,
    `${symptom}: Layout return restores homepage for fixed plant re-entry`,
    returnedHome,
    returned.route
  )
  if (!returnedHome) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `${symptom}: fixed plant re-entry requires homepage, got ${returned.route}`
    )
    return null
  }
  if (
    !(await resetKnownDiagnosePopupForHomeReentry({
      page: returned.page,
      report,
      symptom,
      pagePath: returned.page.path,
      timeoutMs: popupTimeoutMs,
      now: popupNow,
      sleepFn: popupSleepFn,
      retryDelayMs: popupRetryDelayMs
    }))
  ) {
    return null
  }
  return returned.page
}
export async function resetKnownDiagnosePopupForHomeReentry({
  page,
  report,
  symptom,
  pagePath,
  timeoutMs = READINESS_TIMEOUT_MS,
  now = Date.now,
  sleepFn = sleep,
  retryDelayMs = READINESS_RETRY_DELAY_MS
}) {
  const popup = await page?.$('diagnose-popup')
  const bottomSheet = popup ? await popup.$('bottom-sheet') : null
  const visiblePanel = await page?.$('#diagnose-popup-panel')
  const summary = {
    popupPresent: Boolean(popup),
    bottomSheetPresent: Boolean(bottomSheet),
    visiblePanelId: 'diagnose-popup-panel',
    visiblePanelPresentBeforeClose: Boolean(visiblePanel),
    targetCloseActionId: 'diagnose-popup-close-button',
    targetCloseActionPresent: false,
    popupCleared: !visiblePanel
  }
  if (!visiblePanel) {
    recordPageData(report, pagePath, { diagnosePopupReset: summary })
    recordAssertion(report, `${symptom}: returned home has no visible DiagnosePopup panel`, true)
    return true
  }
  const closeAction = bottomSheet ? await bottomSheet.$('#diagnose-popup-close-button') : null
  summary.targetCloseActionPresent = Boolean(closeAction)
  if (!closeAction) {
    recordPageData(report, pagePath, { diagnosePopupReset: summary })
    recordAssertion(
      report,
      `${symptom}: lingering DiagnosePopup exposes stable close action`,
      false,
      JSON.stringify(summary)
    )
    setClassification(
      report,
      'BLOCKED_ENV',
      `${symptom}: lingering DiagnosePopup cannot be reset through its stable close action: ${JSON.stringify(summary)}`
    )
    return false
  }
  try {
    await closeAction.tap()
  } catch (error) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `${symptom}: lingering DiagnosePopup close action could not be tapped: ${String(error?.message || error)}`
    )
    return false
  }
  const end = now() + timeoutMs
  while (now() < end) {
    const currentPanel = await page.$('#diagnose-popup-panel')
    if (!currentPanel) {
      summary.popupCleared = true
      break
    }
    await sleepFn(retryDelayMs)
  }
  recordPageData(report, pagePath, { diagnosePopupReset: summary })
  recordAssertion(
    report,
    `${symptom}: lingering DiagnosePopup resets before plant re-entry`,
    summary.popupCleared,
    JSON.stringify(summary)
  )
  if (!summary.popupCleared) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `${symptom}: visible DiagnosePopup panel remained after stable close action: ${JSON.stringify(summary)}`
    )
  }
  return summary.popupCleared
}
