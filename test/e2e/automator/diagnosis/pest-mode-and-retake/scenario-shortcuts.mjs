import {
  assertElement,
  recordAssertion,
  recordShot,
  sleep,
  waitForPagePath
} from './runtime-core.mjs'
import { readRequests } from './fixture-restore.mjs'
import { resetDiagnosisTab } from './scenario-reset.mjs'

async function runShortcutScenario(report, miniProgram, wsEndpoint, artifactDir) {
  const page = await resetDiagnosisTab(report, miniProgram, 'fullShortcut')
  const requestBaseline = (await readRequests(miniProgram)).length
  report.pagePath = 'subpackages/diagnosis/flow'
  await sleep(900)
  const fullButton = await assertElement(
    report,
    page,
    '#diagnose-profile-full-button',
    'full profile button visible'
  )
  await assertElement(report, page, '#diagnose-profile-pest-button', 'pest profile button visible')
  await assertElement(report, page, '#diagnose-no-image-entry-panel', 'quick entry panel visible')
  // Explicitly select the full profile before tapping the yellow shortcut. This scenario
  // runs after pest scenarios which leave the profile as 'pest'; without this tap,
  // handleSymptomClassQuickSelect correctly declines no-image question start for pest.
  // Tapping full restores the profile the yellow shortcut requires.
  if (fullButton) {
    await fullButton.tap()
    await sleep(300)
  }
  const yellow = await assertElement(
    report,
    page,
    '#diagnose-dev-symptom-class-option-yellowing_mode',
    'yellow shortcut visible'
  )
  const wilt = await assertElement(
    report,
    page,
    '#diagnose-dev-symptom-class-option-wilting_droop_mode',
    'wilting shortcut visible'
  )
  if (yellow) {
    await yellow.tap()
    await sleep(300)
  }
  recordAssertion(report, 'yellow and wilting quick entries are separate', Boolean(yellow && wilt))
  const questionPage = await waitForPagePath(miniProgram, 'subpackages/diagnosis/question-package')
  recordAssertion(
    report,
    'yellow shortcut enters existing question package page',
    questionPage?.path === 'subpackages/diagnosis/question-package',
    questionPage?.path
  )
  const shortcutRequests = (await readRequests(miniProgram)).slice(requestBaseline)
  const questionStartRequest = shortcutRequests.find(req =>
    String(req.url).includes('diagnose-http/diagnosis/question/start')
  )
  recordAssertion(
    report,
    'yellow shortcut uses real no-image question start request',
    Boolean(questionStartRequest) &&
      questionStartRequest.data?.diagnosisProfile === 'full' &&
      questionStartRequest.data?.symptomClassKey === 'yellowing_mode' &&
      !questionStartRequest.data?.image &&
      !questionStartRequest.data?.images,
    questionStartRequest?.url || ''
  )
  const questionStartFixtureResult = questionStartRequest?.response?.data?.data || {}
  recordAssertion(
    report,
    'yellow shortcut question start fixture returns the fixed question package',
    questionStartRequest?.response?.statusCode === 200 &&
      questionStartFixtureResult.diagnosisSessionId === 'e2e_full_question_session' &&
      questionStartFixtureResult.roundId === 'round_1' &&
      Array.isArray(questionStartFixtureResult.questions) &&
      questionStartFixtureResult.questions.length === 3 &&
      questionStartFixtureResult.questionPackage?.mode === 'yellow_leaf' &&
      questionStartFixtureResult.questionPackage?.questionCount ===
        questionStartFixtureResult.questions.length &&
      questionStartFixtureResult.questionPackage?.answerSubmitMode === 'package' &&
      questionStartFixtureResult.uiHints?.questionDisplayMode === 'package',
    JSON.stringify({
      statusCode: questionStartRequest?.response?.statusCode,
      diagnosisSessionId: questionStartFixtureResult.diagnosisSessionId,
      roundId: questionStartFixtureResult.roundId,
      questionCount: questionStartFixtureResult.questions?.length,
      questionPackage: questionStartFixtureResult.questionPackage,
      uiHints: questionStartFixtureResult.uiHints
    })
  )
  recordAssertion(
    report,
    'yellow shortcut does not invoke visual diagnosis start',
    !shortcutRequests.some(req => String(req.url).includes('diagnose-http/diagnosis/start'))
  )
  recordAssertion(
    report,
    'standalone yellow shortcut never patches anonymous plant placeholder',
    !shortcutRequests.some(
      req =>
        String(req.url).includes('plant-user-http/user-plants') &&
        String(req.data?.id || '').includes('diagnose_tab_anonymous')
    )
  )
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, '01-full-shortcuts')
}

export { runShortcutScenario }
