import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  discoverTargetDevToolsRuntime,
  enableAutomatorForVerifiedTargetDevTools,
  inspectDevToolsRuntime
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs'
import { runQaPreflight } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import {
  returnQuestionPackageWithLayoutBack,
  switchTabHomeBeforeFixture,
  returnToKnownHomeForPlantReentry,
  resolveKnownDiagnosePopupQuickEntry,
  waitForKnownDiagnosePopupQuickEntry,
  waitForActiveQuestionPackagePage
} from '../../../automator/diagnosis/_shared/home-entry-readiness.mjs'
import { answerVisibleOrdinaryQuestion } from '../../../automator/diagnosis/_shared/question-package-active-step.mjs'
import { repoRoot } from './helpers.mjs'
const projectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
function mainProcess(
  pid,
  { controlPort = 3799, userDataDir = `/tmp/devtools-${pid}`, includeRemotePort = true } = {}
) {
  const remotePortArgument = includeRemotePort ? ` --remote-port ${controlPort}` : ''
  return `${pid} 1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools${remotePortArgument} --user-data-dir=${userDataDir} --app-session-id=session-${pid}`
}
const rendererProcess = (pid, parentPid) =>
  `${pid} ${parentPid} /Applications/wechatwebdevtools.app/Contents/Frameworks/wechatwebdevtools Helper (Renderer)`
const foreignProcess = pid => `${pid} 1 /usr/local/bin/unrelated-listener`
function processTable(processes) {
  return new Map(
    processes
      .map(line => line.match(/^(\d+)\s+(\d+)\s+(.+)$/))
      .filter(Boolean)
      .map(match => [Number(match[1]), { parentPid: Number(match[2]), command: match[3] }])
  )
}
function commandRunner({
  processes = [mainProcess(901)],
  targetPids = [901],
  listenersByPort = { 3799: [901], 9420: [] }
} = {}) {
  const byPid = processTable(processes)
  const done = stdout => ({ status: 0, stdout, stderr: '' })
  return (command, args) => {
    if (command === 'ps' && args.includes('-ax')) {
      return done(`${processes.join('\n')}\n`)
    }
    if (command === 'ps' && args.includes('-p')) {
      const process = byPid.get(Number(args[args.indexOf('-p') + 1]))
      return done(process ? `${process.parentPid} ${process.command}\n` : '')
    }
    if (command === 'lsof' && args.includes('-t')) {
      const listeners =
        listenersByPort[
          Number(
            String(args.find(value => String(value).startsWith('-iTCP:'))).replace('-iTCP:', '')
          )
        ] ?? []
      return done(listeners.length ? `${listeners.join('\n')}\n` : '')
    }
    if (command === 'lsof' && args.includes('-p')) {
      return done(
        targetPids.includes(Number(args[args.indexOf('-p') + 1]))
          ? `n${projectPath}/project.config.json\n`
          : ''
      )
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  }
}
const bootstrapSessionEvidence = ({ mainProcess: process }) => ({
  status: 'bootstrap_verified',
  source: 'weapp_log_current_session',
  session_id: String(process.pid),
  evidence_records: [{ type: 'FileUtils', project_path: projectPath }]
})
const verifiedRuntime = (overrides = {}) => ({
  status: 'verified',
  project_identity_verified: true,
  observed_project_path: projectPath,
  main_devtools_pid: 901,
  automation_listener_pid: 903,
  port_owner_pid: 903,
  automator_port: 9420,
  control_port: 3799,
  control_port_verified: true,
  project_evidence: [projectPath],
  ...overrides
})
const discovered = discoverTargetDevToolsRuntime({
  expectedProjectPath: projectPath,
  commandRunner: commandRunner(),
  sessionLogReader: bootstrapSessionEvidence
})
assert.equal(discovered.status, 'target_ready')
assert.equal(discovered.control_port, 3799)
assert.equal(discovered.control_port_verified, true)
assert.deepEqual(discovered.control_port_listener_evidence.verified_listener_pids, [901])
const currentSessionListener = inspectDevToolsRuntime({
  expectedProjectPath: projectPath,
  commandRunner: commandRunner({
    processes: [mainProcess(901), rendererProcess(903, 901)],
    targetPids: [],
    listenersByPort: { 3799: [901], 9420: [903] }
  }),
  sessionLogReader: bootstrapSessionEvidence
})
assert.equal(currentSessionListener.status, 'verified')
assert.equal(currentSessionListener.project_identity_verified, true)
assert.equal(currentSessionListener.automation_listener_pid, 903)
assert.equal(currentSessionListener.project_identity_source, 'weapp_log_current_session')
const ideControlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-ide-control-'))
try {
  fs.mkdirSync(path.join(ideControlRoot, 'Default'), { recursive: true })
  fs.writeFileSync(path.join(ideControlRoot, 'Default', '.ide'), '27021\n')
  const withIdeControlPort = (processes, pids) =>
    discoverTargetDevToolsRuntime({
      expectedProjectPath: projectPath,
      commandRunner: commandRunner({ processes, listenersByPort: { 27021: pids, 9420: [] } }),
      sessionLogReader: bootstrapSessionEvidence
    })
  const ideMain = mainProcess(901, { userDataDir: ideControlRoot, includeRemotePort: false })
  const rendererControlPort = withIdeControlPort([ideMain, rendererProcess(902, 901)], [902])
  assert.deepEqual(
    [
      rendererControlPort.status,
      rendererControlPort.control_port,
      rendererControlPort.control_port_source,
      rendererControlPort.control_port_listener_evidence.verified_listener_pids,
      rendererControlPort.control_port_listener_evidence.listener_parent_chains[0].parent_chain_pids
    ],
    ['target_ready', 27021, 'user_data_ide_port_file', [902], [902, 901]]
  )
  const foreignControlPort = withIdeControlPort([ideMain, foreignProcess(903)], [903])
  assert.deepEqual(
    [foreignControlPort.status, foreignControlPort.code],
    ['unavailable', 'ide_control_port_unverified']
  )
} finally {
  fs.rmSync(ideControlRoot, { recursive: true, force: true })
}
const controlRequests = []
const enabled = await enableAutomatorForVerifiedTargetDevTools({
  projectPath,
  commandRunner: commandRunner(),
  sessionLogReader: bootstrapSessionEvidence,
  controlRequest: async request => {
    controlRequests.push(request)
    return {
      status_code: 200,
      url: `http://127.0.0.1:${request.controlPort}/auto?projectpath=${encodeURIComponent(encodeURIComponent(request.projectPath))}&port=${request.wsPort}`
    }
  },
  runtimeInspector: () => verifiedRuntime(),
  observationAttempts: 1,
  observationDelayMs: 0
})
assert.equal(enabled.status, 'enabled')
assert.deepEqual(controlRequests, [
  { action: 'auto', projectPath, controlPort: 3799, wsPort: 9420 }
])
assert.equal(enabled.invocations[0].control_port, 3799)
assert.equal(enabled.invocations[0].automator_port, 9420)
let unexpectedControlRequest = false
const unknownTarget = await enableAutomatorForVerifiedTargetDevTools({
  projectPath,
  commandRunner: commandRunner({ targetPids: [] }),
  sessionLogReader: () => ({ status: 'unavailable', evidence_records: [] }),
  controlRequest: async () => {
    unexpectedControlRequest = true
    return { status_code: 200 }
  }
})
assert.equal(unknownTarget.code, 'project_identity_unverified')
assert.equal(unexpectedControlRequest, false)
const ambiguousTarget = await enableAutomatorForVerifiedTargetDevTools({
  projectPath,
  commandRunner: commandRunner({
    processes: [mainProcess(901), mainProcess(902)],
    targetPids: [901, 902]
  }),
  sessionLogReader: bootstrapSessionEvidence,
  controlRequest: async () => {
    unexpectedControlRequest = true
    return { status_code: 200 }
  }
})
assert.equal(ambiguousTarget.code, 'project_identity_ambiguous')
assert.equal(unexpectedControlRequest, false)
const invalidControlPort = discoverTargetDevToolsRuntime({
  expectedProjectPath: projectPath,
  commandRunner: commandRunner({ processes: [mainProcess(901, { controlPort: 9420 })] }),
  sessionLogReader: bootstrapSessionEvidence
})
assert.equal(invalidControlPort.code, 'ide_control_port_unverified')
let bootstrapCalls = 0
const preflightBootstrap = await runQaPreflight({
  projectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-bootstrap.png'),
  runtimeInspector: () =>
    bootstrapCalls === 0
      ? {
          status: 'unavailable',
          project_identity_verified: false,
          automator_listener_pids: [],
          observed_project_path: 'unavailable'
        }
      : verifiedRuntime({ control_port_source: 'main_devtools_remote_port' }),
  bootstrapExecutor: async ({ projectPath: requestedPath, wsPort }) => {
    bootstrapCalls += 1
    assert.equal(requestedPath, projectPath)
    assert.equal(wsPort, 9420)
    return { status: 'enabled', invocations: [{ action: 'auto', control_port: 3799 }] }
  },
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async ({ report }) => {
    report.checks.page_data = { passed: true }
    report.checks.screenshot = { passed: true, path: 'synthetic-bootstrap.png' }
    report.checks.wx_request = { passed: true, result: { ok: true } }
  }
})
assert.equal(preflightBootstrap.status, 'passed')
assert.equal(bootstrapCalls, 1)
const fixtureStartupEvents = []
const fixtureStartupReport = { pageDataSummaries: [], assertions: [] }
const initialFixtureHome = { path: 'pages/index/index' }
const refreshedFixtureHome = { path: 'pages/index/index' }
await switchTabHomeBeforeFixture({
  mp: { currentPage: async () => (fixtureStartupEvents.push('currentPage'), refreshedFixtureHome) },
  report: fixtureStartupReport,
  switchTab: async () => (fixtureStartupEvents.push('switchTab'), initialFixtureHome),
  markFixtureAttempted: () => fixtureStartupEvents.push('fixture-attempt'),
  installFixture: async () => (fixtureStartupEvents.push('fixture'), { plantIds: [94021] })
})
const staleRouteReport = { pageDataSummaries: [], assertions: [] }
await switchTabHomeBeforeFixture({
  mp: { currentPage: async () => (fixtureStartupEvents.push('unexpected-currentPage'), null) },
  report: staleRouteReport,
  switchTab: async () => ({ path: 'pages/diagnose/question-package' }),
  markFixtureAttempted: () => fixtureStartupEvents.push('unexpected-fixture-attempt'),
  installFixture: async () => (fixtureStartupEvents.push('unexpected-fixture'), null)
})
assert.equal(staleRouteReport.classification, 'BLOCKED_ENV')
assert.match(
  staleRouteReport.blockerReason,
  /automator_route_registry_stale.*pages\/diagnose\/question-package/
)
assert.deepEqual(fixtureStartupEvents, ['switchTab', 'fixture-attempt', 'fixture', 'currentPage'])
const leafPath = 'test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs'
const airEnvironmentLeaf = fs.readFileSync(leafPath, 'utf8')
assert.doesNotMatch(airEnvironmentLeaf, /reLaunchTo\(mp, INDEX_PAGE\)/)
assert.match(airEnvironmentLeaf, /navigateNativeTab\(\{ mp, logicalPath: INDEX_PAGE \}\)/)
const componentScope = (children = {}) => ({ $: async selector => children[selector] ?? null })
const popupScope = uploadStage =>
  componentScope({
    'diagnose-popup': componentScope({
      'bottom-sheet': componentScope({
        'diagnose-flow': componentScope(uploadStage ? { 'diagnose-upload-stage': uploadStage } : {})
      })
    })
  })
const yellowQuickEntry = { taps: 0, tap: async () => (yellowQuickEntry.taps += 1) }
const diagnosisPage = popupScope(
  componentScope({ '#diagnose-dev-symptom-class-option-yellowing_mode': yellowQuickEntry })
)
const quick = await resolveKnownDiagnosePopupQuickEntry(diagnosisPage, 'yellowing_mode')
assert.equal(quick.entry, yellowQuickEntry)
assert.deepEqual(quick.componentPath, [
  { selector: 'diagnose-popup', present: true },
  { selector: 'bottom-sheet', present: true },
  { selector: 'diagnose-flow', present: true },
  { selector: 'diagnose-upload-stage', present: true }
])
await quick.entry.tap()
const circular = { taps: 0, tap: async () => (circular.taps += 1) }
circular.self = circular
const serializableReport = { pageDataSummaries: [], assertions: [] }
const circularEntry = await waitForKnownDiagnosePopupQuickEntry({
  page: popupScope(
    componentScope({
      '#diagnose-dev-symptom-class-option-yellowing_mode': circular
    })
  ),
  report: serializableReport,
  symptom: 'yellowing_mode',
  pagePath: '/pages/index/index'
})
assert.equal(circularEntry, circular)
assert.doesNotThrow(() => JSON.stringify(serializableReport))
const entrySummary = serializableReport.pageDataSummaries[0].summary.diagnosePopupQuickEntry
assert.equal(entrySummary.targetQuickEntryId, 'diagnose-dev-symptom-class-option-yellowing_mode')
assert.deepEqual(entrySummary.componentPath, quick.componentPath)
assert.equal(JSON.stringify(serializableReport).includes('"entry"'), false)
await circularEntry.tap()
const activeQuestionPackagePage = { path: 'pages/diagnose/question-package' }
const currentPages = [{ path: 'pages/index/index' }, activeQuestionPackagePage]
const resolvedQuestionPackagePage = await waitForActiveQuestionPackagePage({
  currentPage: async () => currentPages.shift() ?? activeQuestionPackagePage
})
assert.equal(resolvedQuestionPackagePage, activeQuestionPackagePage)
const wiltingQuestionIds = [
  'q_wilting_ordinary_1',
  'q_wilting_ordinary_2',
  'q_wilting_ordinary_3',
  'q_wilting_droop__air_environment'
]
const wiltingInteractions = []
let wiltingStep = 0
const wiltingAirId = 'q_wilting_droop__air_environment'
const wiltingAirControlId = `#diagnose-air-environment-${wiltingAirId}-exchange-source-fresh_air`
const nextWiltingStep = { tap: async () => (wiltingStep += 1) }
const wiltingPage = {
  async $(selector) {
    wiltingInteractions.push(selector)
    const currentQuestionId = wiltingQuestionIds[wiltingStep]
    if (selector === `#diagnose-question-package-page-active-question-${currentQuestionId}`) {
      return {}
    }
    if (selector === `#diagnose-question-package-page-option-${currentQuestionId}-unknown`) {
      return { tap: async () => {} }
    }
    if (selector === '#diagnose-question-package-page-next-button') {
      return nextWiltingStep
    }
    if (selector === wiltingAirControlId) {
      return wiltingStep === 3 ? { tap: async () => {} } : null
    }
    return null
  }
}
const wiltingReport = { pageDataSummaries: [], assertions: [] }
for (let index = 0; index < 3; index += 1) {
  assert.equal(
    await answerVisibleOrdinaryQuestion({
      page: wiltingPage,
      report: wiltingReport,
      questionKey: wiltingQuestionIds[index],
      findElementById: async (page, id) => page.$(`#${id}`),
      ordinal: index + 1
    }),
    true
  )
}
const interactiveAirControl = await wiltingPage.$(wiltingAirControlId)
await interactiveAirControl.tap()
assert.equal(
  wiltingInteractions
    .filter(selector => selector.includes('-option-') || selector.endsWith('-next-button'))
    .join('|'),
  '#diagnose-question-package-page-option-q_wilting_ordinary_1-unknown|#diagnose-question-package-page-next-button|#diagnose-question-package-page-option-q_wilting_ordinary_2-unknown|#diagnose-question-package-page-next-button|#diagnose-question-package-page-option-q_wilting_ordinary_3-unknown|#diagnose-question-package-page-next-button'
)
const returnQueries = []
let popupVisible = true
let packageReturnTapped = false
const action = ({ onTap, onTrigger } = {}) => {
  const value = { taps: 0, triggers: 0, triggerTypes: [] }
  value.tap = async () => ((value.taps += 1), onTap?.())
  value.trigger = async type => (
    (value.triggers += 1), value.triggerTypes.push(type), onTrigger?.(type)
  )
  return value
}
const layoutBackAction = action({ onTap: () => (packageReturnTapped = true) })
const popupCloseAction = action({ onTap: () => (popupVisible = false) })
const scopedQuery = (scope, resolve) => ({
  $: async selector => (returnQueries.push(`${scope}:${selector}`), resolve(selector))
})
const returnedBottomSheet = scopedQuery('bottom-sheet', selector =>
  selector === '#diagnose-popup-close-button' ? popupCloseAction : null
)
const returnedPopup = scopedQuery('popup', selector =>
  selector === 'bottom-sheet' ? returnedBottomSheet : null
)
const returnedHomePage = {
  path: 'pages/index/index',
  ...scopedQuery('home', selector =>
    selector === 'diagnose-popup'
      ? returnedPopup
      : selector === '#diagnose-popup-panel' && popupVisible
        ? {}
        : null
  )
}
const packageLayout = scopedQuery('layout', selector =>
  selector === '#layout-left-action' ? layoutBackAction : null
)
const freshPackagePage = {
  path: 'pages/diagnose/question-package',
  ...scopedQuery('fresh-package', selector => (selector === 'layout' ? packageLayout : null))
}
const stalePackagePage = {
  path: 'pages/diagnose/question-package',
  $: async () => {
    throw new Error('stale package page must not be queried')
  }
}
const packageReturnReport = { pageDataSummaries: [], assertions: [] }
const reenteredHomePage = await returnToKnownHomeForPlantReentry({
  mp: { currentPage: async () => (packageReturnTapped ? returnedHomePage : freshPackagePage) },
  page: stalePackagePage,
  report: packageReturnReport,
  symptom: 'yellowing_mode'
})
assert.equal(reenteredHomePage, returnedHomePage)
assert.deepEqual(
  [layoutBackAction.taps, layoutBackAction.triggers, popupCloseAction.taps],
  [1, 0, 1]
)
assert.equal(packageReturnReport.assertions[1].name.includes('Layout return restores'), true)
assert.equal(packageReturnReport.assertions[1].passed, true)
assert.equal(
  returnQueries.join('|'),
  'fresh-package:layout|layout:#layout-left-action|home:diagnose-popup|popup:bottom-sheet|home:#diagnose-popup-panel|bottom-sheet:#diagnose-popup-close-button|home:#diagnose-popup-panel'
)
const popupReset = packageReturnReport.pageDataSummaries.at(-1).summary.diagnosePopupReset
assert.deepEqual([popupReset.visiblePanelPresentBeforeClose, popupReset.popupCleared], [true, true])
assert.doesNotThrow(() => JSON.stringify(packageReturnReport))
const eventOutcome = ({ returned, backAction, report }) =>
  `${returned?.route ?? 'null'}:${backAction.taps}:${backAction.triggers}:${report?.classification ?? 'null'}`
const immediateRouteObservation = async (mp, _matches) => {
  const page = await mp.currentPage()
  return page
}
async function unchangedLayoutTapScenario(onTrigger) {
  let route = 'pages/diagnose/question-package'
  const backAction = action({ onTrigger: () => onTrigger(() => (route = 'pages/index/index')) })
  const packagePage = {
    path: route,
    $: async selector =>
      selector === 'layout'
        ? { $: async id => (id === '#layout-left-action' ? backAction : null) }
        : null
  }
  const report = { pageDataSummaries: [], assertions: [] }
  return {
    backAction,
    report,
    returned: await returnQuestionPackageWithLayoutBack({
      mp: {
        currentPage: async () =>
          route === 'pages/diagnose/question-package' ? packagePage : { path: route }
      },
      page: packagePage,
      report,
      symptom: 'yellowing_mode',
      waitForRouteFn: immediateRouteObservation,
      routeTimeoutMs: 0,
      routeOptions: { now: () => 0, sleepFn: async () => {} }
    })
  }
}
const triggerRecovered = await unchangedLayoutTapScenario(setHome => setHome())
assert.equal(eventOutcome(triggerRecovered), 'pages/index/index:1:1:null')
assert.deepEqual(triggerRecovered.backAction.triggerTypes, ['tap'])
const doubleEventFailure = await unchangedLayoutTapScenario(() => {
  throw new Error('trigger failed')
})
assert.equal(eventOutcome(doubleEventFailure), 'null:1:1:BLOCKED_ENV')
const missingEntry = await resolveKnownDiagnosePopupQuickEntry(popupScope(), 'wilting_droop_mode')
assert.deepEqual(missingEntry.componentPath, [
  { selector: 'diagnose-popup', present: true },
  { selector: 'bottom-sheet', present: true },
  { selector: 'diagnose-flow', present: true },
  { selector: 'diagnose-upload-stage', present: false }
])
const screenshotWorkerSource = fs.readFileSync(
  'test/e2e/automator/diagnosis/_shared/screenshot-worker.mjs',
  'utf8'
)
assert.match(screenshotWorkerSource, /killTimer = setTimeout\([\s\S]*?child\.kill\('SIGKILL'\)/)
assert.doesNotMatch(
  `${airEnvironmentLeaf}\n${fs.readFileSync('test/e2e/automator/diagnosis/_shared/home-entry-readiness.mjs', 'utf8')}`,
  /\b(?:mp|miniProgram)\.screenshot\s*\(/
)
