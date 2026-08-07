import { navigateNativeTab } from '../_shared/native-tab-navigation.mjs'
import {
  assertElement,
  findByIdContains,
  findBySemanticId,
  recordAssertion,
  recordShot,
  sleep
} from './runtime-core.mjs'

async function runFiveTabAndReuseScenario(report, miniProgram, wsEndpoint, artifactDir) {
  // installHarness has already patched the live user store to the fixture identity, so the
  // home page will read isAuthenticated=true. The five-tab loop below visits the home tab
  // first through the official Native TabBar adapter.
  // A top-level reLaunch('/pages/index/index') was removed: main QA r3 proved it hangs the
  // live automator for exactly 10s before any product assertion.
  const tabs = [
    { key: 'home', path: '/pages/index/index', expected: 'pages/index/index', root: 'index-page' },
    {
      key: 'calendar',
      path: '/pages/calendar/calendar',
      expected: 'pages/calendar/calendar'
    },
    {
      key: 'diagnose',
      path: '/pages/diagnose/diagnose',
      expected: 'pages/diagnose/diagnose',
      root: 'diagnose-tab-page'
    },
    {
      key: 'reminder',
      path: '/pages/reminder/reminder',
      expected: 'pages/reminder/reminder',
      root: 'reminder-tab-page'
    },
    {
      key: 'profile',
      path: '/pages/profile/profile',
      expected: 'pages/profile/profile',
      root: 'profile-diagnose-history-section'
    }
  ]

  for (const tab of tabs) {
    const page = await navigateNativeTab({ mp: miniProgram, logicalPath: tab.path })
    recordAssertion(
      report,
      `five-tab route visible: ${tab.key}`,
      page?.path === tab.expected,
      page?.path
    )
    if (tab.root) {
      await assertElement(report, page, `#${tab.root}`, `five-tab root visible: ${tab.key}`, 4000)
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
        const popupPanel = await assertElement(
          report,
          page,
          '#diagnose-popup-panel',
          'plant card DiagnosePopup opens',
          4000
        )
        const sharedFlow = await assertElement(
          report,
          page,
          '#diagnose-flow',
          'plant card popup reuses DiagnoseFlow',
          4000
        )
        recordAssertion(
          report,
          'DiagnosePopup keeps shared flow core',
          Boolean(popupPanel && sharedFlow)
        )
        await recordShot(report, miniProgram, wsEndpoint, artifactDir, '00-home-diagnose-popup')
        const popupClose = await findBySemanticId(page, 'diagnose-popup-close-button')
        if (popupClose) {
          await popupClose.tap()
          await sleep(300)
        }
      }
    }

    if (tab.key === 'reminder') {
      const waterEntry = await findByIdContains(page, 'reminder-tab-water-', 4000)
      recordAssertion(report, 'reminder tab exposes watering branch', Boolean(waterEntry))
      if (waterEntry) {
        await waterEntry.tap()
        await sleep(700)
      }
      const wateringSheet = await assertElement(
        report,
        page,
        '#watering-reminder-sheet',
        'reminder tab reuses WateringReminderSheet',
        4000
      )
      recordAssertion(
        report,
        'reminder tab does not expose fertilizing branch',
        !(await findByIdContains(page, 'fertiliz', 500))
      )
      await recordShot(report, miniProgram, wsEndpoint, artifactDir, '00-reminder-watering-sheet')
      const reminderClose = await findBySemanticId(page, 'watering-reminder-close-button')
      if (wateringSheet && reminderClose) {
        await reminderClose.tap()
        await sleep(300)
      }
    }
  }
}

export { runFiveTabAndReuseScenario }
