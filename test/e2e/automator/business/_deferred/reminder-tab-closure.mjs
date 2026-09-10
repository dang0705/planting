#!/usr/bin/env node
// 提醒入口在 MVP 已隐藏；本用例仅为后续恢复入口时保留，不参与当前 catalog。
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'reminderClosure',
  catalogId: 'reminder.tab_water_and_fertilization_closure'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
