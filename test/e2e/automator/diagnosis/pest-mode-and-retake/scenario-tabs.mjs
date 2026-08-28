import { navigateNativeTab } from '../_shared/native-tab-navigation.mjs'
import {
  assertElement,
  findByIdContains,
  findBySemanticId,
  recordAssertion,
  recordShot,
  sleep,
  waitForPagePath
} from './runtime-core.mjs'

async function runThreeTabAndReuseScenario(report, miniProgram, wsEndpoint, artifactDir) {
  // installHarness has already patched the live user store to the fixture identity, so the
  // home page will read isAuthenticated=true. The three-tab MVP loop below uses the official
  // MiniProgram.switchTab adapter for every tab before opening a deep page branch.
  // A top-level reLaunch('/pages/index/index') was removed: main QA r3 proved it hangs the
  // live automator for exactly 10s before any product assertion.
  const tabs = [
    {
      key: 'diagnose',
      path: '/pages/diagnose/diagnose',
      expected: 'pages/diagnose/diagnose',
      root: 'diagnose-tab-page'
    },
    {
      key: 'profile',
      path: '/pages/profile/profile',
      expected: 'pages/profile/profile',
      root: 'profile-diagnose-history-section'
    },
    { key: 'home', path: '/pages/index/index', expected: 'pages/index/index', root: 'index-page' }
  ]

  for (const tab of tabs) {
    const page = await navigateNativeTab({
      mp: miniProgram,
      logicalPath: tab.path,
      expectedRoute: tab.expected
    })
    recordAssertion(
      report,
      `three-tab route visible: ${tab.key}`,
      page?.path === tab.expected,
      page?.path
    )
    if (tab.root) {
      await assertElement(report, page, `#${tab.root}`, `three-tab root visible: ${tab.key}`, 4000)
    }
    await recordShot(report, miniProgram, wsEndpoint, artifactDir, `00-tab-${tab.key}`)

    if (tab.key === 'home') {
      // Wait for the real plant list to render via the mocked user-plants response.
      // The fixture user store is seeded in installHarness, so ensureLogin => loadUserPlants
      // should have run. We probe for the plant card entry with a bounded window and, if it
      // is absent, record a specific visible=false assertion with diagnostic context instead
      // of letting downstream popup waits degrade into a generic timeout.
      const diagnoseEntry = await findByIdContains(page, 'diagnose-entry-button-', 4000)
      recordAssertion(report, 'plant card diagnosis entry visible', Boolean(diagnoseEntry))
      if (!diagnoseEntry) {
        // Record why the entry is missing so the root cause is observable, then skip the
        // popup/flow assertions and continue to the next tab safely.
        const indexRoot = await findBySemanticId(page, 'index-page')
        const loginButton = await findBySemanticId(page, 'index-phone-login-button')
        const quickLoginButton = await findBySemanticId(page, 'index-quick-login-button')
        const emptyHint = await findBySemanticId(page, 'index-plant-list')
        recordAssertion(
          report,
          'plant card diagnosis entry missing: home page state diagnostic',
          false,
          JSON.stringify({
            hasIndexRoot: Boolean(indexRoot),
            hasLoginButton: Boolean(loginButton),
            hasQuickLoginButton: Boolean(quickLoginButton),
            hasPlantList: Boolean(emptyHint),
            interpretation:
              loginButton || quickLoginButton
                ? 'home page shows login prompt (fixture user not rehydrated)'
                : emptyHint
                  ? 'home page has plant list but no PlantCard (mock user-plants not consumed)'
                  : 'home page in unexpected state'
          })
        )
      } else {
        await diagnoseEntry.tap()
        await sleep(700)
        const diagnosisPage = await waitForPagePath(miniProgram, 'subpackages/diagnosis/flow')
        recordAssertion(
          report,
          'plant card navigates to the real diagnosis subpackage flow',
          diagnosisPage?.path === 'subpackages/diagnosis/flow',
          diagnosisPage?.path
        )
        const diagnosisFlow = await assertElement(
          report,
          diagnosisPage,
          '#diagnosis-flow-page-content',
          'diagnosis subpackage flow mounts shared flow',
          4000
        )
        const diagnosisRoot = await assertElement(
          report,
          diagnosisPage,
          '#diagnosis-flow-page',
          'diagnosis subpackage flow root visible',
          4000
        )
        recordAssertion(
          report,
          'diagnosis flow keeps shared flow core',
          Boolean(diagnosisFlow && diagnosisRoot)
        )
        await recordShot(report, miniProgram, wsEndpoint, artifactDir, '00-home-diagnose-entry')
        const diagnosisBack = await findBySemanticId(diagnosisPage, 'layout-left-action')
        recordAssertion(
          report,
          'diagnosis flow returns to home before next tab',
          Boolean(diagnosisBack)
        )
        if (!diagnosisBack) {
          throw new Error('layout-left-action not found after home diagnosis flow')
        }
        await diagnosisBack.tap()
        const homeAfterDiagnosis = await waitForPagePath(miniProgram, 'pages/index/index')
        recordAssertion(
          report,
          'home restored after card diagnosis branch',
          homeAfterDiagnosis?.path === 'pages/index/index',
          homeAfterDiagnosis?.path
        )
      }
    }
  }
}

export { runThreeTabAndReuseScenario }
