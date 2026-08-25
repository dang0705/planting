import {
  assertElement,
  findByIdContains,
  findBySemanticId,
  recordAssertion,
  recordShot,
  runAutomatorStep,
  safeText,
  sleep,
  waitForPagePath
} from './runtime-core.mjs'
import { readRequests } from './fixture-restore.mjs'
import { seedAutomationImage, setFixtureRetakeMode } from './fixture-state.mjs'
import { resetDiagnosisTab } from './scenario-reset.mjs'

async function injectPestImage(report, page) {
  const inject = await assertElement(
    report,
    page,
    '#diagnose-automation-inject-button',
    'automation image injection hook present'
  )
  if (inject) {
    await inject.tap()
    await sleep(500)
  }
  const uploadCount = await assertElement(
    report,
    page,
    '#diagnose-upload-count',
    'upload count visible'
  )
  const uploadText = uploadCount ? await safeText(uploadCount) : ''
  recordAssertion(
    report,
    'automation image injected into pest flow',
    /1/.test(uploadText),
    uploadText
  )
}

async function runPestScenario(report, miniProgram, wsEndpoint, artifactDir, retakeMode) {
  const page = await resetDiagnosisTab(report, miniProgram, `pest.${retakeMode}`)
  recordAssertion(
    report,
    `diagnosis page re-entry resets before ${retakeMode} scenario`,
    page?.path === 'pages/diagnose/diagnose',
    page?.path || ''
  )
  await runAutomatorStep(report, `pest.${retakeMode}.setFixtureRetakeMode`, () =>
    setFixtureRetakeMode(miniProgram, retakeMode)
  )
  await runAutomatorStep(report, `pest.${retakeMode}.seedAutomationImage`, () =>
    seedAutomationImage(miniProgram)
  )
  await sleep(900)
  const pest = await assertElement(
    report,
    page,
    '#diagnose-profile-pest-button',
    'pest profile button visible'
  )
  if (pest) {
    await pest.tap()
    await sleep(300)
  }
  await injectPestImage(report, page)
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `02-pest-image-${retakeMode}`)
  const submit = await assertElement(report, page, '#diagnose-submit-button', 'pest submit visible')
  if (submit) {
    await submit.tap()
    await sleep(1200)
  }
  const confirm = await assertElement(
    report,
    page,
    '#ai-stream-confirm-button',
    'stream dialog confirm visible'
  )
  if (confirm) {
    await confirm.tap()
    await sleep(800)
  }
  const directionCard = await assertElement(
    report,
    page,
    '#diagnose-direction-choice-card',
    'direction card visible'
  )
  const directionText = directionCard ? await safeText(directionCard) : ''
  recordAssertion(
    report,
    'multi pest direction is user observable',
    directionText.includes('红蜘蛛') && directionText.includes('粉虱'),
    directionText
  )
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `03-direction-${retakeMode}`)
  const choice =
    (await findBySemanticId(page, 'diagnose-direction-choice-pest')) ||
    (await findByIdContains(page, 'diagnose-direction-choice-', 2000))
  recordAssertion(report, 'direction choice is tappable', Boolean(choice))
  if (choice) {
    await choice.tap()
    await sleep(1000)
  }
  const questionPage = await waitForPagePath(miniProgram, 'subpackages/diagnosis/question-package')
  recordAssertion(
    report,
    'pest direction enters common question package page',
    questionPage?.path === 'subpackages/diagnosis/question-package',
    questionPage?.path
  )
  const packageRoot = await assertElement(
    report,
    questionPage,
    '#diagnose-question-package-page',
    'common question package page visible'
  )
  const packagePageText = packageRoot ? await safeText(packageRoot) : ''
  recordAssertion(
    report,
    'common question package page shows pest context',
    packagePageText.includes('虫害细节确认'),
    packagePageText
  )
  const packageRequestBaseline = (await readRequests(miniProgram)).length
  const skip = await assertElement(
    report,
    questionPage,
    '#diagnose-question-risk-skip-pest_risk_leaf_under',
    'one-question package risk skip visible'
  )
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `04-risk-${retakeMode}`)
  if (skip) {
    await skip.tap()
    await sleep(1000)
  }
  const packageRequests = (await readRequests(miniProgram))
    .slice(packageRequestBaseline)
    .filter(req => String(req.url).includes('diagnose-http/diagnosis/answer'))
  const packageSubmitRequest = packageRequests.find(
    req => req.data?.requestMode === 'answer_submit'
  )
  const submittedQuestionPackage = packageSubmitRequest?.data?.questionPackage || {}
  recordAssertion(
    report,
    'first one-question package request is answer_submit, never answer_revision',
    packageRequests.length > 0 &&
      packageRequests[0]?.data?.requestMode === 'answer_submit' &&
      !packageRequests.some(req => req.data?.requestMode === 'answer_revision'),
    packageRequests.map(req => req.data?.requestMode || '').join(',')
  )
  recordAssertion(
    report,
    'answer_submit includes the complete declared package',
    Array.isArray(packageSubmitRequest?.data?.answers) &&
      packageSubmitRequest.data.answers.length === submittedQuestionPackage.questionCount,
    JSON.stringify({
      answerCount: packageSubmitRequest?.data?.answers?.length,
      questionCount: submittedQuestionPackage.questionCount
    })
  )
  recordAssertion(
    report,
    'answer_submit preserves candidate modes and hidden visual evidence',
    JSON.stringify(submittedQuestionPackage.candidateModes) ===
      JSON.stringify(['spider_mite', 'whitefly']) &&
      JSON.stringify(submittedQuestionPackage.hiddenPrefilledEvidence) ===
        JSON.stringify([
          {
            evidenceKey: 'fine_webbing',
            diagnosisMode: 'spider_mite',
            routeEvidenceRole: 'confirmation_candidate'
          },
          {
            evidenceKey: 'white_flies',
            diagnosisMode: 'whitefly',
            routeEvidenceRole: 'confirmation_candidate'
          }
        ]),
    JSON.stringify(submittedQuestionPackage)
  )
  recordAssertion(
    report,
    'package submit fixture advances to the expected retake state',
    packageSubmitRequest?.response?.data?.data?.retakeRequest?.status === 'needs_confirmation',
    packageSubmitRequest?.response?.data?.data?.retakeRequest?.status || ''
  )
  const currentPage = await miniProgram.currentPage()
  const retakeCard = await assertElement(
    report,
    currentPage,
    '#diagnose-retake-card',
    'retake card visible'
  )
  const retakeStart = await findBySemanticId(currentPage, 'diagnose-retake-start-button')
  recordAssertion(report, 'retake waits for explicit start confirmation', Boolean(retakeStart))
  if (retakeMode === 'skip') {
    const retakeSkip = await assertElement(
      report,
      currentPage,
      '#diagnose-retake-skip-button',
      'retake risk skip button visible'
    )
    if (retakeSkip) {
      await retakeSkip.tap()
      await sleep(900)
    }
    const skippedText = await assertElement(
      report,
      currentPage,
      '#diagnose-retake-skipped-text',
      'server-persisted retake skip terminal visible'
    )
    const skippedCardText = await safeText(
      await findBySemanticId(currentPage, 'diagnose-retake-card')
    )
    recordAssertion(
      report,
      'retake skip stays unknown and cannot restart',
      Boolean(skippedText) &&
        skippedCardText.includes('暂不能继续判断') &&
        !(await findBySemanticId(currentPage, 'diagnose-retake-start-button')),
      skippedCardText
    )
    await recordShot(report, miniProgram, wsEndpoint, artifactDir, '05-retake-skip-terminal')
    return
  }
  if (retakeStart) {
    await retakeStart.tap()
    await sleep(900)
  }
  const countdown = await findBySemanticId(currentPage, 'diagnose-retake-countdown')
  const expiredText = await findBySemanticId(currentPage, 'diagnose-retake-expired-text')
  if (retakeMode === 'active') {
    const text = countdown ? await safeText(countdown) : ''
    recordAssertion(
      report,
      'server-authorized retake countdown visible',
      /剩余\s+\d+:\d{2}/.test(text),
      text
    )
  } else {
    const text = retakeCard ? await safeText(retakeCard) : ''
    recordAssertion(
      report,
      'terminal retake timeout visible',
      Boolean(expiredText) && text.includes('本次诊断已结束'),
      text
    )
  }
  await recordShot(report, miniProgram, wsEndpoint, artifactDir, `05-retake-${retakeMode}`)
}

export { runPestScenario }
