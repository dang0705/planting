import {
  assertElement,
  recordAssertion,
  runAutomatorStep,
  waitForPagePath
} from './runtime-core.mjs'

async function resetDiagnosisTab(report, miniProgram, scenarioName) {
  const currentPage = await runAutomatorStep(report, `${scenarioName}.currentPageBeforeReset`, () =>
    miniProgram.currentPage()
  )
  if (currentPage?.path === 'pages/diagnose/question-package') {
    const backControl = await assertElement(
      report,
      currentPage,
      '#layout-left-action',
      `${scenarioName} question package back control visible`
    )
    // Capture the page stack BEFORE the back tap so a future navigation failure is
    // actionable: records stack length and each page path, plus whether the control
    // was found (i.e. whether the tap can dispatch the goBack handler at all).
    const stackBefore = await miniProgram.evaluate(() => {
      try {
        const pages = (typeof getCurrentPages === 'function' ? getCurrentPages() : []) || []
        return {
          length: pages.length,
          paths: pages.map(p => p?.route || p?.path || ''),
          getCurrentPagesAvailable: typeof getCurrentPages === 'function'
        }
      } catch (error) {
        return { length: -1, paths: [], error: String(error?.message || error) }
      }
    })
    await runAutomatorStep(report, `${scenarioName}.tap:layout-left-action`, async () => {
      if (!backControl) {
        throw new Error('layout-left-action not found')
      }
      await backControl.tap()
    })
    await runAutomatorStep(report, `${scenarioName}.waitForDiagnoseTabAfterBackTap`, async () => {
      const returnedPage = await waitForPagePath(miniProgram, 'pages/diagnose/diagnose')
      const passed = returnedPage?.path === 'pages/diagnose/diagnose'
      // Capture the page stack AFTER the back tap to expose whether navigateBack
      // dispatched, fell back, or no-op'd.
      const stackAfter = passed
        ? null
        : await miniProgram.evaluate(() => {
            try {
              const pages = (typeof getCurrentPages === 'function' ? getCurrentPages() : []) || []
              return {
                length: pages.length,
                paths: pages.map(p => p?.route || p?.path || '')
              }
            } catch (error) {
              return { length: -1, paths: [], error: String(error?.message || error) }
            }
          })
      recordAssertion(
        report,
        `${scenarioName} leaves question package through the visible back control`,
        passed,
        JSON.stringify({
          beforeTap: stackBefore,
          afterTap: stackAfter,
          finalPage: returnedPage?.path || ''
        })
      )
      if (!passed) {
        throw new Error(
          `expected pages/diagnose/diagnose, got ${returnedPage?.path || 'unknown'}; stackBefore=${JSON.stringify(stackBefore)}`
        )
      }
    })
  }
  // This post-result scenario reset is not a homepage Tab entry; user-visible
  // question-package return remains the Layout action above.
  return runAutomatorStep(report, `${scenarioName}.reLaunch:pages/diagnose/diagnose`, () =>
    miniProgram.reLaunch('/pages/diagnose/diagnose')
  )
}

export { resetDiagnosisTab }
