#!/usr/bin/env node
// 日历入口在 MVP 已隐藏；本用例仅为后续恢复入口时保留，不参与当前 catalog。
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'calendarTaskAndPlan',
  catalogId: 'calendar.task_complete_postpone_and_plan_entry'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
