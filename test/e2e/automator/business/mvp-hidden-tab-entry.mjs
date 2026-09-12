#!/usr/bin/env node
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'mvpHiddenNativeTabs',
  catalogId: 'care.mvp.hidden_calendar_reminder_tabs'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
