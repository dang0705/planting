#!/usr/bin/env node
'use strict'
import path from 'node:path'
import {
  resolveEnv,
  resolveGitHead,
  resolveGitBranch,
  timestampForFilename
} from '../care/airflow/_shared/lib/env.mjs'
import { connectAutomator } from '../care/airflow/_shared/lib/automator-client.mjs'
import {
  createReport,
  recordPage,
  recordAssertion,
  setClassification,
  saveReport,
  hasFailedAssertions,
  markBusinessAssertionsReached,
  emitLeafReport
} from '../care/airflow/_shared/lib/reporter.mjs'
import { preflightProject } from '../care/airflow/_shared/lib/project-check.mjs'
import {
  AirEnvironmentFixtureError,
  installAirEnvironmentDiagnosisFixture,
  readAirEnvironmentFixtureRequests,
  restoreAirEnvironmentDiagnosisFixture
} from './_shared/air-environment-fixture.mjs'
import {
  requestedCaseKeys,
  returnToKnownHomeForPlantReentry,
  findElementById,
  switchTabHomeBeforeFixture,
  listElementIds,
  waitForActiveQuestionPackagePage,
  waitForKnownDiagnosePopupQuickEntry,
  waitForKnownHomeEntry
} from './_shared/home-entry-readiness.mjs'
import { navigateNativeTab } from './_shared/native-tab-navigation.mjs'
import {
  completeVisibleAirEnvironmentQuestionFlow,
  questionDefinitionsFromLanQuestionStart,
  questionKeysFromLanQuestionStart,
  waitForVisibleActiveQuestion
} from './_shared/question-package-active-step.mjs'
import {
  createBoundedAutomatorSession,
  disconnectBoundedAutomatorSession,
  handoffQuestionPackageScreenshot,
  isAutomatorOperationError,
  isSuccessfulLanResponse,
  recordLanRequestEvidence,
  runBoundedAutomatorOperation
} from './_shared/automator-session-boundary.mjs'
import {
  installFormalLeafPrincipal,
  resolveFormalLeafPrincipal
} from '../_shared/formal-leaf-harness.mjs'
const INDEX_PAGE = '/pages/index/index'
const QUESTION_PACKAGE_PAGE = 'subpackages/diagnosis/question-package'
const QUESTION_PACKAGE_SCREENSHOT_TIMEOUT_MS = 60_000
const QUESTION_PACKAGE_SCREENSHOT_RENDER_SETTLE_MS = 5_000
const CASES = Object.freeze({
  yellowing_mode: { expectedCount: 4, exactQuestionKey: 'q_yellow_leaf__air_environment' },
  wilting_droop_mode: { expectedCount: 6, exactQuestionKey: 'q_wilting_droop__air_environment' }
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export { waitForActiveQuestionPackagePage }
function isDiagnosisEndpointRequest(request, endpoint) {
  return (
    request?.passthrough === true &&
    String(request?.url || '').includes(`diagnose-http/diagnosis/${endpoint}`)
  )
}
function requestResponseDetail(request) {
  if (!request) {
    return 'request was not observed'
  }
  if (request.failure) {
    return `request failure=${JSON.stringify(request.failure)}`
  }
  if (!request.response) {
    return 'request completed without an observable response'
  }
  return `statusCode=${request.response.statusCode}; response=${JSON.stringify(request.response.data)}`
}
async function waitForDiagnosisRequest(mp, predicate, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const requests = await readAirEnvironmentFixtureRequests(mp)
    const request = requests.find(predicate)
    if (request?.response || request?.failure) {
      return request
    }
    await sleep(250)
  }
  return (await readAirEnvironmentFixtureRequests(mp)).find(predicate) || null
}
async function observeQuestionStart(mp, report, symptom) {
  const request = await waitForDiagnosisRequest(
    mp,
    request =>
      isDiagnosisEndpointRequest(request, 'question/start') &&
      request?.data?.symptomClassKey === symptom
  )
  const observed = request?.passthrough === true
  if (observed) {
    markBusinessAssertionsReached(report)
  }
  const passed = isSuccessfulLanResponse(request)
  recordAssertion(
    report,
    `${symptom}: actual LAN question-start request passed through the fixture`,
    passed,
    requestResponseDetail(request)
  )
  if (!passed) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `${symptom}: LAN question-start prerequisite is unavailable: ${requestResponseDetail(request)}`
    )
  }
  return passed ? request : null
}
async function verifyCase(mp, report, env, symptom, page) {
  const expected = CASES[symptom]
  const entry = await waitForKnownHomeEntry({ mp, page, report, symptom, pagePath: INDEX_PAGE })
  if (!entry) {
    return null
  }
  await entry.tap()
  const quick = await waitForKnownDiagnosePopupQuickEntry({
    page,
    report,
    symptom,
    pagePath: INDEX_PAGE
  })
  if (!quick) {
    return null
  }
  await quick.tap()
  const questionStart = await observeQuestionStart(mp, report, symptom)
  if (!questionStart) {
    return null
  }
  const questionKeys = questionKeysFromLanQuestionStart(questionStart)
  const questionDefinitions = questionDefinitionsFromLanQuestionStart(questionStart)
  const lanQuestionKeysMatchPackage =
    questionKeys.length === expected.expectedCount &&
    questionKeys.includes(expected.exactQuestionKey)
  recordAssertion(
    report,
    `${symptom}: LAN question-start response provides the ordered v2 question keys`,
    lanQuestionKeysMatchPackage,
    JSON.stringify(questionKeys)
  )
  if (!lanQuestionKeysMatchPackage) {
    return null
  }
  const packagePage = await waitForActiveQuestionPackagePage(mp)
  recordPage(report, packagePage?.path || 'unavailable')
  const activePackagePage = packagePage?.path === QUESTION_PACKAGE_PAGE
  recordAssertion(
    report,
    `${symptom}: active question package page opens`,
    activePackagePage,
    packagePage?.path || 'unavailable'
  )
  if (!activePackagePage) {
    return null
  }
  const packageRoot = await findElementById(packagePage, 'diagnose-question-package-page')
  recordAssertion(report, `${symptom}: question package opens`, Boolean(packageRoot))
  if (!packageRoot) {
    return null
  }
  const ids = await listElementIds(packagePage)
  const shellCount = ids.filter(id =>
    id.startsWith('diagnose-question-package-page-question-shell-')
  ).length
  recordAssertion(
    report,
    `${symptom}: formal question count`,
    shellCount === expected.expectedCount,
    `actual=${shellCount}`
  )
  const exactAirQuestion = questionKeys.includes(expected.exactQuestionKey)
  recordAssertion(report, `${symptom}: exact air question key is rendered`, exactAirQuestion)
  if (
    !(await waitForVisibleActiveQuestion({
      page: packagePage,
      questionKey: questionKeys[0],
      report,
      findElementById,
      assertion: `${symptom}: first LAN question key matches the visible active marker`
    }))
  ) {
    return null
  }
  if (symptom === 'yellowing_mode') {
    const airQuestionReady = await completeVisibleAirEnvironmentQuestionFlow({
      page: packagePage,
      questionKeys,
      airQuestionKey: expected.exactQuestionKey,
      report,
      findElementById,
      controls: [],
      questionDefinitions
    })
    const airUnknown = await findElementById(
      packagePage,
      `diagnose-air-environment-${expected.exactQuestionKey}-unknown`
    )
    recordAssertion(
      report,
      `${symptom}: air-environment question exposes the user uncertainty control when active`,
      airQuestionReady && Boolean(airUnknown),
      airUnknown ? undefined : 'air environment active control missing'
    )
    if (!airQuestionReady || !airUnknown) {
      return null
    }
  }
  if (symptom === 'wilting_droop_mode') {
    await verifyDirectAirflowOutcome(
      mp,
      packagePage,
      report,
      expected,
      questionKeys,
      questionDefinitions
    )
  }
  const screenshotPath = path.resolve(
    env.artifactDir,
    `air-environment-v2-${symptom}-${timestampForFilename()}.png`
  )
  const handoff = await handoffQuestionPackageScreenshot({
    session: mp,
    page: packagePage,
    wsEndpoint: env.wsEndpoint,
    outputPath: screenshotPath,
    report,
    connect: connectAutomator,
    timeoutMs: QUESTION_PACKAGE_SCREENSHOT_TIMEOUT_MS,
    renderSettleMs: QUESTION_PACKAGE_SCREENSHOT_RENDER_SETTLE_MS
  })
  return handoff
}
async function verifyDirectAirflowOutcome(
  mp,
  page,
  report,
  expected,
  questionKeys,
  questionDefinitions
) {
  const airQuestionKey = expected.exactQuestionKey
  const idPrefix = `diagnose-air-environment-${airQuestionKey}`
  const completed = await completeVisibleAirEnvironmentQuestionFlow({
    page,
    questionKeys,
    airQuestionKey,
    report,
    findElementById,
    controls: [
      [`${idPrefix}-exchange-source-window`, 'select window exchange'],
      [`${idPrefix}-window-frequency-almost-never`, 'select almost-never window frequency'],
      [`${idPrefix}-fresh-air-switch`, 'enable fresh-air exchange'],
      [`${idPrefix}-next-step`, 'open local-airflow step'],
      [`${idPrefix}-canopy-open`, 'select open plant surroundings'],
      [`${idPrefix}-device-mode-has-airflow`, 'select device airflow parent'],
      [`${idPrefix}-device-source-fresh_air-direct`, 'mark fresh-air airflow as direct'],
      ['diagnose-question-package-page-next-button', 'advance air question']
    ],
    questionDefinitions
  })
  if (!completed) {
    return
  }
  const directAnswer = await waitForDiagnosisRequest(mp, request => {
    if (!isDiagnosisEndpointRequest(request, 'answer')) {
      return false
    }
    const input = request?.data?.airEnvironmentByQuestionId?.[airQuestionKey]
    return input?.deviceAirflow?.mode === 'direct'
  })
  const answerPassed = isSuccessfulLanResponse(directAnswer)
  recordAssertion(
    report,
    'wilting answer passes through the actual LAN diagnosis endpoint',
    answerPassed,
    requestResponseDetail(directAnswer)
  )
  if (!answerPassed) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `wilting answer prerequisite is unavailable: ${requestResponseDetail(directAnswer)}`
    )
    return
  }
  const outcome = await findElementById(page, 'diagnose-question-package-result-outcomes')
  const outcomeText = outcome ? await outcome.text() : ''
  recordAssertion(
    report,
    'direct-airflow answer reaches the existing wilting move-from-direct-airflow outcome',
    Boolean(outcome) && String(outcomeText || '').includes('移出直吹区'),
    String(outcomeText || '')
  )
}

export async function runAirEnvironmentV2QuestionPackages() {
  const env = resolveEnv()
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    projectPath: env.projectPath,
    wsEndpoint: env.wsEndpoint
  })
  report.task = 'air-environment-v2-question-packages'
  const preflight = preflightProject(env.projectPath)
  if (!preflight.ok) {
    setClassification(report, 'BLOCKED_ENV', preflight.reason)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `air-environment-v2-question-packages-${timestampForFilename()}`
    )
    console.log(`[e2e] classification: ${report.classification}`)
    console.log(`[e2e] report: ${reportPath}`)
    emitLeafReport(report)
    process.exitCode = 2
    return
  }
  let mp = null
  let fixtureAttempted = false
  const principal = resolveFormalLeafPrincipal()
  try {
    mp = createBoundedAutomatorSession(
      await runBoundedAutomatorOperation({
        operation: 'initial_connect',
        action: () => connectAutomator(env.wsEndpoint)
      }),
      { scope: 'main' }
    )
    const principalEvidence = await installFormalLeafPrincipal({
      mp,
      principal,
      env: { ...process.env, QA_CATALOG_DATA_MODE: 'fixture_diagnostic' }
    })
    report.formal_principal = principalEvidence
    const fixtureStartup = await switchTabHomeBeforeFixture({
      mp,
      report,
      switchTab: () => navigateNativeTab({ mp, logicalPath: INDEX_PAGE }),
      installFixture: () => installAirEnvironmentDiagnosisFixture(mp, { principal }),
      markFixtureAttempted: () => (fixtureAttempted = true)
    })
    const { launchedHome, fixturePlant, homePage: initialHomePage } = fixtureStartup
    recordPage(report, launchedHome?.path || INDEX_PAGE)
    if (initialHomePage) {
      recordAssertion(
        report,
        'fixture plant entered the real plant store before homepage interaction',
        fixturePlant.userPlantsRequestObserved && fixturePlant.plantIds.includes(94021),
        JSON.stringify(fixturePlant)
      )
    }
    recordPage(report, initialHomePage?.path || 'unavailable')
    const symptoms = initialHomePage
      ? requestedCaseKeys(process.argv.slice(2), Object.keys(CASES))
      : []
    const attemptedSymptoms = []
    let previousPackagePage = null
    for (const [index, symptom] of symptoms.entries()) {
      const homePage =
        index > 0
          ? await returnToKnownHomeForPlantReentry({
              mp,
              page: previousPackagePage,
              report,
              symptom: symptoms[index - 1]
            })
          : initialHomePage
      if (!homePage) {
        break
      }
      if (index > 0) {
        recordPage(report, homePage.path)
      }
      attemptedSymptoms.push(symptom)
      const verifiedCase = await verifyCase(mp, report, env, symptom, homePage)
      if (verifiedCase?.session) {
        mp = verifiedCase.session
      }
      previousPackagePage = verifiedCase?.page || null
      if (report.classification === 'BLOCKED_ENV' || report.classification === 'BLOCKED_FIXTURE') {
        break
      }
      if (!previousPackagePage) {
        break
      }
    }
    recordLanRequestEvidence({
      report,
      requests: await readAirEnvironmentFixtureRequests(mp),
      symptoms: attemptedSymptoms,
      matches: isDiagnosisEndpointRequest,
      isSuccessful: isSuccessfulLanResponse,
      detail: requestResponseDetail
    })
    if (report.classification !== 'BLOCKED_ENV' && report.classification !== 'BLOCKED_FIXTURE') {
      if (!report.business_assertions_reached) {
        setClassification(
          report,
          'BLOCKED_ENV',
          'business boundary was not reached: no successful LAN question/start request was observed'
        )
      } else {
        setClassification(
          report,
          hasFailedAssertions(report) ? 'FAIL_PRODUCT' : 'PASS',
          hasFailedAssertions(report) ? 'one or more assertions failed' : undefined
        )
      }
    }
  } catch (error) {
    setClassification(
      report,
      error instanceof AirEnvironmentFixtureError
        ? 'BLOCKED_FIXTURE'
        : isAutomatorOperationError(error)
          ? 'BLOCKED_ENV'
          : !report.business_assertions_reached
            ? 'BLOCKED_ENV'
            : 'FAIL_PRODUCT',
      String(error?.message || error)
    )
  } finally {
    if (fixtureAttempted) {
      try {
        await restoreAirEnvironmentDiagnosisFixture(mp)
        recordAssertion(report, 'fixture state, cache and request patches were restored', true)
      } catch (error) {
        recordAssertion(
          report,
          'fixture state, cache and request patches were restored',
          false,
          String(error?.message || error)
        )
        setClassification(
          report,
          'BLOCKED_FIXTURE',
          `fixture restore failed: ${String(error?.message || error)}`
        )
      }
    }
    try {
      await disconnectBoundedAutomatorSession({
        session: mp,
        operation: 'final_session_disconnect'
      })
    } catch (error) {
      recordAssertion(report, 'final Automator session disconnect completes', false, String(error))
      setClassification(report, 'BLOCKED_ENV', String(error?.message || error))
    }
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `air-environment-v2-question-packages-${timestampForFilename()}`
    )
    console.log(`[e2e] classification: ${report.classification}`)
    console.log(`[e2e] report: ${reportPath}`)
    emitLeafReport(report)
  }
  process.exitCode =
    report.classification === 'PASS'
      ? 0
      : report.classification === 'BLOCKED_ENV' || report.classification === 'BLOCKED_FIXTURE'
        ? 2
        : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAirEnvironmentV2QuestionPackages().catch(error => {
    console.error('[e2e] fatal error:', error?.message || error)
    process.exit(1)
  })
}
