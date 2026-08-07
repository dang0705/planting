import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  createReport,
  leafReportPayload,
  markBusinessAssertionsReached,
  setClassification
} from '../../automator/care/airflow/_shared/lib/reporter.mjs'
import {
  classifyLeafReport,
  extractLeafReport
} from '../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-leaf-report.mjs'
import { pollFixturePlantStoreReadiness } from '../../automator/diagnosis/_shared/air-environment-fixture.mjs'
import { resolveWithinDeadline } from '../../automator/diagnosis/_shared/fixture-async-deadline.mjs'
import {
  createBoundedAutomatorSession,
  handoffQuestionPackageScreenshot
} from '../../automator/diagnosis/_shared/automator-session-boundary.mjs'
import { returnQuestionPackageWithLayoutBack } from '../../automator/diagnosis/_shared/home-entry-readiness.mjs'

const require = createRequire(import.meta.url)
const {
  buildRuntimeSnapshotPayload,
  buildSnapshotPayload
} = require('../../../../cloudfunctions/diagnose-http/services/session-runtime-snapshot-codec.js')
const {
  buildFrontendAnswerResponse
} = require('../../../../cloudfunctions/diagnose-http/app/frontend-response.js')

const questionKey = 'q_yellow_leaf__air_environment'
const input = {
  airExchange: { source: 'fresh_air', windowDirectionCount: null, windowOpenFrequency: null },
  canopyOpenness: 'partial',
  deviceAirflow: { mode: 'circulating', sources: ['fresh_air'] }
}
const airEnvironmentSnapshotsByQuestionId = {
  [questionKey]: {
    input,
    source: 'saved_profile',
    profileUpdatedAt: '2026-08-04T00:00:00.000Z',
    locationBinding: { careLocationId: 'living-room', locationKey: 'window-side' }
  }
}
const response = {
  roundId: 'round_2',
  airEnvironmentByQuestionId: { [questionKey]: input },
  airEnvironmentSnapshotsByQuestionId,
  airEnvironmentEvidence: {
    [questionKey]: {
      air_exchange_level: 'medium',
      local_airflow_present: true,
      stagnation_risk: false,
      direct_airflow: false
    }
  }
}

const runtimeSnapshot = JSON.parse(
  buildRuntimeSnapshotPayload({
    sessionId: 'diag_air_environment_v2',
    plantContext: { userPlantId: 7 },
    response,
    round: 2
  })
)
assert.deepEqual(
  runtimeSnapshot.airEnvironmentSnapshotsByQuestionId,
  airEnvironmentSnapshotsByQuestionId
)
assert.deepEqual(runtimeSnapshot.airEnvironmentByQuestionId, { [questionKey]: input })
assert.deepEqual(runtimeSnapshot.airEnvironmentSnapshotSourceByQuestionId, {
  [questionKey]: 'saved_profile'
})
assert.deepEqual(Object.keys(runtimeSnapshot.airEnvironmentEvidence[questionKey]).sort(), [
  'air_exchange_level',
  'direct_airflow',
  'local_airflow_present',
  'stagnation_risk'
])

const finalSnapshot = buildSnapshotPayload({
  sessionId: 'diag_air_environment_v2',
  plantContext: { userPlantId: 7 },
  response
})
assert.deepEqual(
  finalSnapshot.airEnvironmentSnapshotsByQuestionId,
  airEnvironmentSnapshotsByQuestionId
)

const completedResponse = buildFrontendAnswerResponse({
  diagnosisSessionId: 'diag_air_environment_v2',
  sessionStatus: 'completed',
  outcomeType: 'uncertain',
  airEnvironmentByQuestionId: runtimeSnapshot.airEnvironmentByQuestionId,
  airEnvironmentSnapshotsByQuestionId: runtimeSnapshot.airEnvironmentSnapshotsByQuestionId,
  airEnvironmentSnapshotSourceByQuestionId:
    runtimeSnapshot.airEnvironmentSnapshotSourceByQuestionId,
  airEnvironmentEvidence: runtimeSnapshot.airEnvironmentEvidence
})
assert.deepEqual(
  completedResponse.airEnvironmentSnapshotsByQuestionId,
  airEnvironmentSnapshotsByQuestionId
)

const rejectedSourceSnapshot = JSON.parse(
  buildRuntimeSnapshotPayload({
    sessionId: 'diag_air_environment_v2',
    plantContext: { userPlantId: 7 },
    response: {
      ...response,
      airEnvironmentSnapshotsByQuestionId: {
        [questionKey]: {
          ...airEnvironmentSnapshotsByQuestionId[questionKey],
          source: ['permanent', 'profile'].join('_')
        }
      }
    },
    round: 2
  })
)
assert.deepEqual(rejectedSourceSnapshot.airEnvironmentSnapshotsByQuestionId, {})

const questionFlow = readFileSync('src/pages/diagnose/question-package/question-flow.js', 'utf8')
const questionRestartCard = readFileSync(
  'src/pages/diagnose/question-package/QuestionPackageRestartRequired.vue',
  'utf8'
)
assert.match(questionFlow, /Number\(value\?\.questionPackage\?\.packageVersion \|\| 1\) < 2/)
assert.match(questionFlow, /packageRestartRequired\.value = requiresAirEnvironmentPackageRestart/)
assert.match(questionRestartCard, /题包已更新，请重新开始/)
assert.match(questionRestartCard, /diagnose-question-package-restart-required-button/)

const fixtureFailureReport = createReport({})
setClassification(fixtureFailureReport, 'BLOCKED_FIXTURE', 'fixture plant was not ready')
const fixtureFailurePayload = leafReportPayload(fixtureFailureReport)
assert.equal(fixtureFailurePayload.status, 'failed')
assert.equal(fixtureFailurePayload.failure_kind, 'failed_environment')
assert.equal(fixtureFailurePayload.business_assertions_reached, false)
const parsedFixtureFailure = extractLeafReport({ stdout: JSON.stringify(fixtureFailurePayload) })
assert.equal(parsedFixtureFailure.parse_status, 'parsed')
assert.equal(classifyLeafReport(parsedFixtureFailure), 'failed_environment')

let completedDeadlineTimerCleared = null
const completedDeadline = await resolveWithinDeadline({
  action: () => ({ fixture: 'ready' }),
  timeoutMs: 5,
  setTimer: () => 'completed-deadline-timer',
  clearTimer: timer => {
    completedDeadlineTimerCleared = timer
  }
})
assert.deepEqual(completedDeadline, { timedOut: false, value: { fixture: 'ready' } })
assert.equal(completedDeadlineTimerCleared, 'completed-deadline-timer')

const failedDeadline = await resolveWithinDeadline({
  action: () => {
    throw new Error('fixture inspection failed')
  },
  timeoutMs: 5,
  setTimer: () => 'failed-deadline-timer',
  clearTimer: () => {}
})
assert.deepEqual(failedDeadline, {
  timedOut: false,
  error: 'fixture inspection failed'
})

const sessionHandoffEvents = []
const screenshotHandoffReport = { assertions: [], pageDataSummaries: [], screenshots: [] }
const screenshotHandoff = await handoffQuestionPackageScreenshot({
  session: createBoundedAutomatorSession(
    {
      disconnect: async () => {
        sessionHandoffEvents.push('primary-disconnect')
      }
    },
    { scope: 'primary' }
  ),
  page: { path: 'pages/diagnose/question-package' },
  wsEndpoint: 'ws://fixture.test',
  outputPath: 'fixture-proof.png',
  report: screenshotHandoffReport,
  connect: async () => {
    sessionHandoffEvents.push('post-screenshot-connect')
    return {
      currentPage: async () => {
        sessionHandoffEvents.push('post-screenshot-currentPage')
        return { path: 'pages/diagnose/question-package' }
      }
    }
  },
  captureScreenshot: async () => {
    sessionHandoffEvents.push('screenshot-worker')
    return { status: 'passed', validPng: true }
  }
})
assert.deepEqual(
  [screenshotHandoff.ok, screenshotHandoff.stage, screenshotHandoffReport.screenshots.length],
  [true, 'reacquired', 1]
)
assert.deepEqual(sessionHandoffEvents, [
  'primary-disconnect',
  'screenshot-worker',
  'post-screenshot-connect',
  'post-screenshot-currentPage'
])

const nativeTabEvents = []
const boundedNativeSession = createBoundedAutomatorSession(
  {
    native: () => ({
      switchTab: async ({ url }) => {
        nativeTabEvents.push(`switchTab:${url}`)
      }
    })
  },
  { scope: 'main' }
)
await boundedNativeSession.native().switchTab({ url: 'pages/index/index' })
assert.deepEqual(nativeTabEvents, ['switchTab:pages/index/index'])

async function layoutReturnWindowScenario(firstObservedRoute) {
  let route = 'pages/diagnose/question-package'
  let triggerCalls = 0
  const routeObservationTimeouts = []
  const backAction = {
    tap: async () => {},
    trigger: async () => {
      triggerCalls += 1
      if (firstObservedRoute === 'pages/index/index') {
        throw new Error('trigger must not run while tap propagation is pending')
      }
      route = 'pages/index/index'
    }
  }
  const packageLayout = { $: async id => (id === '#layout-left-action' ? backAction : null) }
  const packagePage = {
    path: route,
    $: async selector => (selector === 'layout' ? packageLayout : null)
  }
  const report = { assertions: [], pageDataSummaries: [] }
  const returned = await returnQuestionPackageWithLayoutBack({
    mp: { currentPage: async () => (route === packagePage.path ? packagePage : { path: route }) },
    page: packagePage,
    report,
    symptom: 'yellowing_mode',
    waitForRouteFn: async (_mp, matches, timeoutMs) => {
      routeObservationTimeouts.push(timeoutMs)
      if (routeObservationTimeouts.length === 1) {
        route = firstObservedRoute
      }
      const observed = route === packagePage.path ? packagePage : { path: route }
      assert.equal(matches(observed.path), route !== packagePage.path)
      return observed
    }
  })
  return { returned, triggerCalls, routeObservationTimeouts }
}

const layoutReturnSummary = ({ returned, triggerCalls, routeObservationTimeouts }) => [
  returned?.route,
  triggerCalls,
  routeObservationTimeouts
]
assert.deepEqual(layoutReturnSummary(await layoutReturnWindowScenario('pages/index/index')), [
  'pages/index/index',
  0,
  [15000, 15000]
])
assert.deepEqual(
  layoutReturnSummary(await layoutReturnWindowScenario('pages/diagnose/question-package')),
  ['pages/index/index', 1, [15000, 15000]]
)

let timedOutDisconnectWorkerStarts = 0
const timedOutDisconnectReport = { assertions: [], pageDataSummaries: [], screenshots: [] }
const timedOutDisconnect = await handoffQuestionPackageScreenshot({
  session: createBoundedAutomatorSession(
    { disconnect: () => new Promise(() => {}) },
    { scope: 'primary' }
  ),
  page: { path: 'pages/diagnose/question-package' },
  wsEndpoint: 'ws://fixture.test',
  outputPath: 'fixture-proof.png',
  report: timedOutDisconnectReport,
  connect: async () => {
    throw new Error('connect must not run after a timed out disconnect')
  },
  runScreenshotWorker: async () => {
    timedOutDisconnectWorkerStarts += 1
    return { status: 'passed', validPng: true }
  },
  timeoutMs: 5,
  setTimer: callback => {
    queueMicrotask(callback)
    return 'deadline'
  },
  clearTimer: () => {}
})
assert.deepEqual(
  [
    timedOutDisconnect.ok,
    timedOutDisconnect.stage,
    timedOutDisconnect.workerStarted,
    timedOutDisconnectWorkerStarts,
    timedOutDisconnectReport.classification
  ],
  [false, 'primary_session_disconnect_before_screenshot', false, 0, 'BLOCKED_ENV']
)

let pollingClock = 0
let pollingCalls = 0
const observedFixtureReadiness = await pollFixturePlantStoreReadiness({
  inspect: async () => {
    pollingCalls += 1
    return pollingCalls === 1
      ? { fixturePlantPresent: true, userPlantsRequestObserved: false, requestCount: 0 }
      : { fixturePlantPresent: true, userPlantsRequestObserved: true, requestCount: 1 }
  },
  timeoutMs: 30,
  pollMs: 10,
  now: () => pollingClock,
  sleepFn: async delay => {
    pollingClock += delay
  }
})
assert.deepEqual(
  [observedFixtureReadiness.ok, pollingCalls, observedFixtureReadiness.requestCount],
  [true, 2, 1]
)

let timeoutClock = 0
let timeoutCalls = 0
const lastFixtureObservation = {
  fixturePlantPresent: false,
  userPlantsRequestObserved: true,
  plantIds: [],
  storeLoad: { status: 'failed', error: 'fixture load failed' }
}
const timedOutFixtureReadiness = await pollFixturePlantStoreReadiness({
  inspect: async () => {
    timeoutCalls += 1
    return lastFixtureObservation
  },
  timeoutMs: 20,
  pollMs: 10,
  now: () => timeoutClock,
  sleepFn: async delay => {
    timeoutClock += delay
  }
})
assert.deepEqual(
  [timedOutFixtureReadiness.ok, timeoutCalls, timedOutFixtureReadiness.reason],
  [false, 3, 'fixture plant/store request readiness timed out']
)
assert.deepEqual(timedOutFixtureReadiness.lastObservation, lastFixtureObservation)

let hungInspectionTimerCalls = 0
let hungInspectionTimerDelay = null
let hungInspectionSleeps = 0
const hungInspectionReadiness = await pollFixturePlantStoreReadiness({
  inspect: () => new Promise(() => {}),
  timeoutMs: 100,
  pollMs: 10,
  inspectTimeoutMs: 5,
  now: () => 0,
  sleepFn: async () => {
    hungInspectionSleeps += 1
  },
  setTimer: (callback, delay) => {
    hungInspectionTimerCalls += 1
    hungInspectionTimerDelay = delay
    queueMicrotask(callback)
    return hungInspectionTimerCalls
  },
  clearTimer: () => {}
})
assert.deepEqual(
  [
    hungInspectionReadiness.ok,
    hungInspectionReadiness.reason,
    hungInspectionReadiness.inspectTimeoutMs,
    hungInspectionReadiness.lastObservation,
    hungInspectionTimerCalls,
    hungInspectionTimerDelay,
    hungInspectionSleeps
  ],
  [false, 'fixture runtime inspection timed out', 5, null, 1, 5, 0]
)

const productFailureReport = createReport({})
markBusinessAssertionsReached(productFailureReport)
setClassification(productFailureReport, 'FAIL_PRODUCT', 'ordinary UI assertion failed')
const productFailurePayload = leafReportPayload(productFailureReport)
assert.equal(productFailurePayload.failure_kind, 'failed_product')
assert.equal(productFailurePayload.business_assertions_reached, true)
assert.equal(
  classifyLeafReport(extractLeafReport({ stdout: JSON.stringify(productFailurePayload) })),
  'failed_product'
)

const fixtureSource = readFileSync(
  'test/e2e/automator/diagnosis/_shared/air-environment-fixture.mjs',
  'utf8'
)
const fixtureDeadlineSource = readFileSync(
  'test/e2e/automator/diagnosis/_shared/fixture-async-deadline.mjs',
  'utf8'
)
const fixtureLeafSource = readFileSync(
  'test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs',
  'utf8'
)
const sessionBoundarySource = readFileSync(
  'test/e2e/automator/diagnosis/_shared/automator-session-boundary.mjs',
  'utf8'
)
const homeReadinessSource = readFileSync(
  'test/e2e/automator/diagnosis/_shared/home-entry-readiness.mjs',
  'utf8'
)
const fixtureRouteSource = fixtureSource.slice(
  fixtureSource.indexOf('var fixtureFor'),
  fixtureSource.indexOf('var isObservedDiagnosisRequest')
)
const fixtureStoreLoadSource = fixtureSource.slice(
  fixtureSource.indexOf('const storeLoadStarted'),
  fixtureSource.indexOf('export async function pollFixturePlantStoreReadiness')
)
assert.match(fixtureSource, /plantStore\.getUserPlants\(\)/)
assert.match(fixtureStoreLoadSource, /Promise\.resolve\(plantStore\.getUserPlants\(\)\)/)
assert.match(fixtureStoreLoadSource, /return \{ ok: true, storeLoadStarted: true/)
assert.doesNotMatch(fixtureStoreLoadSource, /return Promise\.resolve\(/)
assert.match(fixtureSource, /lastObservation/)
assert.match(fixtureSource, /resolveWithinDeadline/)
assert.match(fixtureSource, /inspectTimeoutMs = FIXTURE_STORE_INSPECTION_TIMEOUT_MS/)
assert.match(fixtureSource, /from '\.\/fixture-async-deadline\.mjs'/)
assert.doesNotMatch(fixtureSource, /from ['"][^'"]*\.(?:codex|agents|skills)\//)
assert.match(fixtureDeadlineSource, /export function resolveWithinDeadline/)
assert.match(fixtureDeadlineSource, /timedOut: true, timeoutMs/)
assert.match(fixtureDeadlineSource, /timedOut: false, error:/)
assert.match(fixtureSource, /fixturePlantPresent === true[\s\S]*userPlantsRequestObserved === true/)
assert.match(fixtureSource, /request\.fixture === true/)
assert.doesNotMatch(fixtureStoreLoadSource, /plantStore\.\$patch/)
assert.match(fixtureSource, /userState: cloneRuntime\(userStore\.\$state\)/)
assert.match(fixtureSource, /plantState: cloneRuntime\(plantStore\.\$state\)/)
assert.match(fixtureSource, /originalUniRequest/)
assert.match(fixtureSource, /queryPresent/)
assert.match(fixtureSource, /isObservedDiagnosisRequest/)
assert.match(fixtureSource, /captured\.passthrough = true/)
assert.match(fixtureSource, /return original\.call\(this, forwarded\)/)
assert.doesNotMatch(fixtureSource, /createAirEnvironmentQuestionPackage/)
assert.doesNotMatch(fixtureSource, /createDirectAirflowOutcome/)
assert.doesNotMatch(fixtureSource, /fixture\.(?:packages|directAirflowOutcome|profile)/)
assert.ok(fixtureRouteSource.includes('plant-user-http\\/user-plants'))
assert.equal(fixtureRouteSource.includes('diagnose-http\\/diagnosis'), false)
assert.match(fixtureLeafSource, /finally \{[\s\S]*restoreAirEnvironmentDiagnosisFixture/)
assert.doesNotMatch(fixtureLeafSource, /safeDisconnect/)
assert.match(fixtureLeafSource, /handoffQuestionPackageScreenshot/)
assert.match(fixtureLeafSource, /createBoundedAutomatorSession/)
assert.match(sessionBoundarySource, /primary_session_disconnect_before_screenshot/)
assert.match(sessionBoundarySource, /post_screenshot_connect/)
assert.match(sessionBoundarySource, /runBoundedAutomatorOperation/)
assert.ok(
  /const tapObservedPage = await waitForRouteFn\([\s\S]*?READINESS_TIMEOUT_MS/.test(
    homeReadinessSource
  ) && !/READINESS_RETRY_DELAY_MS \* 4/.test(homeReadinessSource)
)
assert.match(fixtureLeafSource, /emitLeafReport\(report\)/)
assert.match(fixtureLeafSource, /actual LAN question-start request passed through the fixture/)
assert.match(fixtureLeafSource, /actual LAN diagnosis endpoint/)
assert.match(fixtureLeafSource, /device-mode-direct/)
assert.doesNotMatch(fixtureLeafSource, /question-start request used the fixture/)
assert.match(fixtureLeafSource, /waitForKnownHomeEntry/)
assert.doesNotMatch(fixtureLeafSource, /findByIdPrefix/)
assert.match(
  fixtureLeafSource,
  /const entry = await waitForKnownHomeEntry\([\s\S]*?await entry\.tap\(\)/
)
assert.match(
  fixtureLeafSource,
  /business boundary was not reached: no successful LAN question\/start request was observed/
)
assert.match(fixtureLeafSource, /!report\.business_assertions_reached[\s\S]*'BLOCKED_ENV'/)
assert.match(
  fixtureLeafSource,
  /const observed = request\?\.passthrough === true[\s\S]*markBusinessAssertionsReached\(report\)/
)
assert.match(homeReadinessSource, /diagnose-entry-button-\$\{FIXTURE_PLANT_ID\}/)
assert.match(homeReadinessSource, /page\.\$\('#index-plant-list'\)/)
assert.match(homeReadinessSource, /page\.\$\('plant-card'\)/)
assert.match(homeReadinessSource, /targetPlantCard\.\$\(`#\$\{targetEntryId\}`\)/)
assert.doesNotMatch(homeReadinessSource, /page\.\$\(`#\$\{targetEntryId\}`\)/)
assert.match(homeReadinessSource, /targetPlantCardPresent/)
assert.match(homeReadinessSource, /recordPageData/)
assert.match(homeReadinessSource, /'BLOCKED_ENV'/)

console.log('air environment v2 session contract tests passed')
